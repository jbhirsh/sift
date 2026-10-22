import AVFoundation
import ExpoModulesCore
import MusicKit
import ShazamKit

// A thin bridge: each function asks MusicKit, ShazamKit or the player one
// thing and hands back raw values. Every decision (defaults, which artwork
// to trust, lookup order, catalog id pairing, batching, counting what
// landed, the "Sift — Removed" policy, which preview to fingerprint) lives
// in TypeScript (src/utils/musicKit.ts, src/services/AppleMusicProvider.ts),
// where it ships with an EAS Update instead of a reinstall and is covered by
// Jest and mutation tests. Keep it that way: add a primitive here, put the
// policy there.
//
// What has to stay here: MusicKit objects (Song, Track, Playlist) can't
// cross the bridge, so the module caches them by id and later calls (play,
// add to a playlist) refer to them by that id.

public class ExpoMusicKitModule: Module {
  // Locked: sync Functions run on the JS thread while AsyncFunctions run on
  // Swift concurrency threads, and both read and write these.
  /// Library or catalog Songs, keyed by the id callers use for them.
  private let songCache = LockedCache<Song>()
  /// Playlist entries that aren't library songs, keyed by id. Used when no
  /// Song is cached under the same id.
  private let trackCache = LockedCache<Track>()
  /// Playlists created here, keyed by id: one created moments ago may not be
  /// visible to a library request yet. Only a fallback, so edits never work
  /// from an old copy of a playlist the library can still answer for.
  private let createdPlaylists = LockedCache<MusicKit.Playlist>()
  /// When each of those was created, so a lookup can ignore old ones (the
  /// user may have deleted the playlist in Music since).
  private let createdAt = LockedCache<Date>()
  /// Resolved artwork file paths keyed by track ID.
  private let artworkCache = LockedCache<String>()

  private let dateFormatter: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime]
    return formatter
  }()

  public func definition() -> ModuleDefinition {
    Name("ExpoMusicKit")

    // MARK: - Authorization

    AsyncFunction("requestAuthorization") { () -> Bool in
      let status = await MusicAuthorization.request()
      return status == .authorized
    }

    Function("getAuthorizationStatus") { () -> String in
      switch MusicAuthorization.currentStatus {
      case .authorized:
        return "authorized"
      case .denied:
        return "denied"
      case .notDetermined:
        return "notDetermined"
      case .restricted:
        return "restricted"
      @unknown default:
        return "notDetermined"
      }
    }

    // MARK: - Loading

    /// One page of the user's library songs (raw tracks), cached by id.
    AsyncFunction("loadLibraryPage") { (offset: Int, limit: Int) -> [[String: Any]] in
      try self.requireAuthorization()
      var request = MusicLibraryRequest<Song>()
      request.limit = limit
      request.offset = offset
      let response = try await request.response()
      return response.items.map { song in
        self.songCache[song.id.rawValue] = song
        return self.rawSong(song)
      }
    }

    /// One page of the user's playlists, each with its track count.
    AsyncFunction("loadPlaylistsPage") { (offset: Int, limit: Int) -> [[String: Any]] in
      try self.requireAuthorization()
      var request = MusicLibraryRequest<MusicKit.Playlist>()
      request.limit = limit
      request.offset = offset
      let response = try await request.response()
      var results: [[String: Any]] = []
      for playlist in response.items {
        let detailed = try await playlist.with([.tracks])
        results.append([
          "id": playlist.id.rawValue,
          "name": playlist.name,
          "trackCount": detailed.tracks?.count ?? 0,
          "artworkURL": nullable(playlist.artwork?.url(width: 300, height: 300)?.absoluteString),
        ])
      }
      return results
    }

    /// A playlist's entries as raw tracks, in playlist order, cached by id.
    AsyncFunction("loadPlaylistItems") { (playlistID: String) -> [[String: Any]] in
      try self.requireAuthorization()
      let playlist = try await self.playlist(withID: playlistID)
      guard let read = try await self.allEntries(of: playlist) else { return [] }
      return read.entries.map { track in
        self.trackCache[track.id.rawValue] = track
        return self.rawTrack(track)
      }
    }

    // MARK: - Lookups

    /// Look each id up as a library Song, concurrently. One result per id,
    /// in order: the song (raw) or null, and whether the lookup itself
    /// failed (as opposed to finding nothing). Found songs are cached under
    /// the requested id and their own.
    AsyncFunction("lookupLibrarySongs") { (ids: [String]) -> [[String: Any]] in
      try self.requireAuthorization()
      let found = await withTaskGroup(of: (Int, Song?, Bool).self) { group -> [(Int, Song?, Bool)] in
        for (index, id) in ids.enumerated() {
          group.addTask {
            do {
              var request = MusicLibraryRequest<Song>()
              request.filter(matching: \.id, equalTo: MusicItemID(id))
              let song = try await request.response().items.first
              return (index, song, false)
            } catch {
              return (index, nil, true)
            }
          }
        }
        var out: [(Int, Song?, Bool)] = []
        for await result in group { out.append(result) }
        return out.sorted { $0.0 < $1.0 }
      }
      return found.map { index, song, failed -> [String: Any] in
        let id = ids[index]
        if let song {
          self.songCache[id] = song
          self.songCache[song.id.rawValue] = song
        }
        return [
          "id": id,
          "song": song.map { self.rawSong($0) as Any } ?? NSNull(),
          "failed": failed,
        ]
      }
    }

    /// One catalog request for these ids. Returns every song the catalog
    /// answered with (raw, under its own id, which can differ from the
    /// requested one), each cached under its own id. Throws when the request
    /// fails (offline, no subscription).
    AsyncFunction("lookupCatalogSongs") { (ids: [String]) -> [[String: Any]] in
      try self.requireAuthorization()
      let request = MusicCatalogResourceRequest<Song>(matching: \.id, memberOf: ids.map { MusicItemID($0) })
      let response = try await request.response()
      return response.items.map { song in
        self.songCache.setIfAbsent(song, for: song.id.rawValue)
        return self.rawSong(song)
      }
    }

    /// Make the item cached under `fromID` answer to `toID` too, unless
    /// something is already cached there. False when nothing is cached
    /// under `fromID`.
    Function("aliasCachedItem") { (fromID: String, toID: String) -> Bool in
      if let song = self.songCache[fromID] {
        self.songCache.setIfAbsent(song, for: toID)
        return true
      }
      if let track = self.trackCache[fromID] {
        self.trackCache.setIfAbsent(track, for: toID)
        return true
      }
      return false
    }

    /// What is cached for each id: "song", "track" (a playlist entry that
    /// isn't a library song) or null. A Song wins over a Track, as it does
    /// for playback and adds.
    Function("cachedKinds") { (ids: [String]) -> [Any] in
      ids.map { id -> Any in
        if self.songCache[id] != nil { return "song" }
        if self.trackCache[id] != nil { return "track" }
        return NSNull()
      }
    }

    // MARK: - Playback

    AsyncFunction("play") { (trackID: String, position: Double) in
      let player = ApplicationMusicPlayer.shared
      if let song = self.songCache[trackID] {
        player.queue = [song]
      } else if let track = self.trackCache[trackID] {
        player.queue = [track]
      } else {
        throw MusicKitError.trackNotFound(trackID)
      }
      if position > 0 {
        // Seek before playing so a start mid-track ("Start at chorus")
        // doesn't blip the first instant of the song. Once prepared, the
        // queue entry accepts a playback time. Best effort: if preparing
        // fails, play() below still starts and the late seek covers it.
        try? await player.prepareToPlay()
        player.playbackTime = position
      }
      try await player.play()
      // If the pre-play seek didn't stick, seek now, late rather than never.
      if position > 0 && abs(player.playbackTime - position) > 1 {
        player.playbackTime = position
      }
    }

    AsyncFunction("pause") { () in
      ApplicationMusicPlayer.shared.pause()
    }

    AsyncFunction("resume") { () in
      try await ApplicationMusicPlayer.shared.play()
    }

    Function("seek") { (position: Double) in
      ApplicationMusicPlayer.shared.playbackTime = position
    }

    Function("getPlaybackState") { () -> [String: Any] in
      let player = ApplicationMusicPlayer.shared
      return [
        "position": player.playbackTime,
        "isPlaying": player.state.playbackStatus == .playing
      ]
    }

    // MARK: - Playlists

    /// Create an empty playlist; returns its id.
    AsyncFunction("createEmptyPlaylist") { (name: String) -> String in
      try self.requireAuthorization()
      let playlist = try await MusicLibrary.shared.createPlaylist(name: name)
      self.createdPlaylists[playlist.id.rawValue] = playlist
      self.createdAt[playlist.id.rawValue] = Date()
      return playlist.id.rawValue
    }

    /// The ids of every library playlist with exactly this name, in library
    /// order (read `pageSize` at a time), then any created here within the
    /// last `recentSeconds` that the library doesn't list yet.
    AsyncFunction("findPlaylistsByName") { (name: String, recentSeconds: Double, pageSize: Int) -> [String] in
      try self.requireAuthorization()
      var ids: [String] = []
      var request = MusicLibraryRequest<MusicKit.Playlist>()
      request.limit = pageSize
      while true {
        let items = try await request.response().items
        ids += items.filter { $0.name == name }.map { $0.id.rawValue }
        if items.count < pageSize { break }
        request.offset += items.count
      }
      for playlist in self.createdPlaylists.values where playlist.name == name && !ids.contains(playlist.id.rawValue) {
        if let created = self.createdAt[playlist.id.rawValue], -created.timeIntervalSinceNow <= recentSeconds {
          ids.append(playlist.id.rawValue)
        }
      }
      return ids
    }

    /// Add each cached item to the playlist individually, in order. One
    /// result per id: "added", "failed" (MusicKit refused it) or
    /// "unresolved" (nothing cached under the id; no attempt made). Throws
    /// only when the playlist itself can't be found.
    AsyncFunction("addEachToPlaylist") { (playlistID: String, ids: [String]) -> [String] in
      try self.requireAuthorization()
      let playlist = try await self.playlist(withID: playlistID)
      var results: [String] = []
      for id in ids {
        do {
          if let song = self.songCache[id] {
            _ = try await MusicLibrary.shared.add(song, to: playlist)
            results.append("added")
          } else if let track = self.trackCache[id] {
            _ = try await MusicLibrary.shared.add(track, to: playlist)
            results.append("added")
          } else {
            results.append("unresolved")
          }
        } catch {
          results.append("failed")
        }
      }
      return results
    }

    /// Remove every entry with one of these ids from a playlist this app
    /// created (MusicKit edits no other); returns how many came out. Reads
    /// every page first: the edit replaces the whole list.
    AsyncFunction("removeFromPlaylist") { (playlistID: String, trackIDs: [String]) -> Int in
      try self.requireAuthorization()
      let playlist = try await self.playlist(withID: playlistID)
      guard let read = try await self.allEntries(of: playlist) else { return 0 }
      let idsToRemove = Set(trackIDs)
      let remaining = read.entries.filter { !idsToRemove.contains($0.id.rawValue) }
      if remaining.count == read.entries.count { return 0 }
      try await MusicLibrary.shared.edit(read.playlist, items: remaining)
      return read.entries.count - remaining.count
    }

    /// Add each cached library Song to the library, in order. One result
    /// per id: "added", "failed" or "unresolved" (no Song cached under it).
    AsyncFunction("addEachToLibrary") { (ids: [String]) -> [String] in
      try self.requireAuthorization()
      var results: [String] = []
      for id in ids {
        guard let song = self.songCache[id] else {
          results.append("unresolved")
          continue
        }
        do {
          try await MusicLibrary.shared.add(song)
          results.append("added")
        } catch {
          results.append("failed")
        }
      }
      return results
    }

    // MARK: - Preview clips ("Start at chorus")

    /// What is known about a cached song's preview: its own preview URL,
    /// ISRC, title, artist and duration. Null for a cached item that isn't
    /// a song (a music video has no preview to match). Throws when nothing
    /// is cached yet (a resumed session still warming), so the caller
    /// retries later instead of remembering "no answer".
    AsyncFunction("previewInfo") { (trackID: String) -> [String: Any]? in
      let song: Song
      if let cached = self.songCache[trackID] {
        song = cached
      } else if let track = self.trackCache[trackID] {
        guard case .song(let trackSong) = track else { return nil }
        song = trackSong
      } else {
        throw MusicKitError.trackNotFound(trackID)
      }
      return [
        "previewURL": nullable(song.previewAssets?.first?.url?.absoluteString),
        "isrc": nullable(song.isrc),
        "title": song.title,
        "artist": song.artistName,
        "duration": nullable(song.duration),
      ]
    }

    /// The preview URL of the first catalog song with this ISRC, or null.
    AsyncFunction("catalogPreviewForISRC") { (isrc: String) -> String? in
      let request = MusicCatalogResourceRequest<Song>(matching: \.isrc, equalTo: isrc)
      return try await request.response().items.first?.previewAssets?.first?.url?.absoluteString
    }

    /// Catalog search hits for a term: id, title, artist, duration and
    /// preview URL of each.
    AsyncFunction("searchCatalogSongs") { (term: String, limit: Int) -> [[String: Any]] in
      var search = MusicCatalogSearchRequest(term: term, types: [Song.self])
      search.limit = limit
      let response = try await search.response()
      return response.songs.map { song in
        [
          "id": song.id.rawValue,
          "title": song.title,
          "artist": song.artistName,
          "duration": nullable(song.duration),
          "previewURL": nullable(song.previewAssets?.first?.url?.absoluteString),
        ]
      }
    }

    /// Where a preview clip sits in its full recording, in seconds, found
    /// with ShazamKit; null for no match. Throws when the download or
    /// ShazamKit failed (for example the ShazamKit App Service isn't enabled
    /// for this app ID), so the caller retries another time.
    AsyncFunction("shazamOffset") { (previewURL: String) -> Double? in
      guard let url = URL(string: previewURL) else { return nil }
      return try await shazamOffset(ofPreviewAt: url)
    }

    // MARK: - Artwork

    AsyncFunction("resolveArtworkURL") { (trackID: String, width: Int, height: Int) -> String? in
      // Return cached result immediately
      if let cached = self.artworkCache[trackID] {
        return cached
      }

      let artwork: Artwork?
      if let song = self.songCache[trackID] {
        artwork = song.artwork
      } else if let track = self.trackCache[trackID] {
        artwork = track.artwork
      } else {
        return nil
      }

      guard let artwork, let url = artwork.url(width: width, height: height) else {
        return nil
      }

      // HTTP URLs can be used directly by React Native
      if url.scheme == "https" || url.scheme == "http" {
        let urlString = url.absoluteString
        self.artworkCache[trackID] = urlString
        return urlString
      }

      // For musicKit:// and other non-HTTP schemes, load natively and save to cache dir
      do {
        let data = try Data(contentsOf: url)
        let cacheDir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first!
        let fileURL = cacheDir.appendingPathComponent("artwork-\(trackID).jpg")
        try data.write(to: fileURL)
        let filePath = fileURL.absoluteString
        self.artworkCache[trackID] = filePath
        return filePath
      } catch {
        return nil
      }
    }
  }

  // MARK: - Helpers

  private func requireAuthorization() throws {
    guard MusicAuthorization.currentStatus == .authorized else {
      throw MusicKitError.notAuthorized
    }
  }

  /// A playlist's entries, every page of them, with the playlist they were
  /// read from; nil when MusicKit returns no entries relationship. Throws
  /// rather than return a partial list.
  private func allEntries(of playlist: MusicKit.Playlist) async throws -> (playlist: MusicKit.Playlist, entries: [Track])? {
    let detailed = try await playlist.with([.tracks])
    guard var page = detailed.tracks else { return nil }
    var entries = Array(page)
    while page.hasNextBatch {
      guard let next = try await page.nextBatch() else { throw MusicKitError.incompleteRead }
      entries += next
      page = next
    }
    return (playlist: detailed, entries: entries)
  }

  /// A playlist by id, fresh from the library; one created here only when
  /// the library doesn't list it yet.
  private func playlist(withID id: String) async throws -> MusicKit.Playlist {
    var request = MusicLibraryRequest<MusicKit.Playlist>()
    request.filter(matching: \.id, equalTo: MusicItemID(id))
    if let playlist = try await request.response().items.first { return playlist }
    if let created = self.createdPlaylists[id] { return created }
    throw MusicKitError.noTracksFound
  }

  /// A library or catalog song as raw values; missing ones are null and
  /// the artwork URL is passed on whatever its scheme (TypeScript decides).
  private func rawSong(_ song: Song) -> [String: Any] {
    [
      "id": song.id.rawValue,
      "name": song.title,
      "artist": song.artistName,
      "album": nullable(song.albumTitle),
      "duration": nullable(song.duration),
      "playCount": nullable(song.playCount),
      "dateAdded": nullable(song.libraryAddedDate.map { dateFormatter.string(from: $0) }),
      "artworkURL": nullable(song.artwork?.url(width: 600, height: 600)?.absoluteString),
      "trackNumber": nullable(song.trackNumber),
      "discNumber": nullable(song.discNumber),
      "kind": "song",
    ]
  }

  /// A playlist entry as raw values (no play count or date added).
  private func rawTrack(_ track: Track) -> [String: Any] {
    [
      "id": track.id.rawValue,
      "name": track.title,
      "artist": track.artistName,
      "album": nullable(track.albumTitle),
      "duration": nullable(track.duration),
      "playCount": NSNull(),
      "dateAdded": NSNull(),
      "artworkURL": nullable(track.artwork?.url(width: 600, height: 600)?.absoluteString),
      "trackNumber": nullable(track.trackNumber),
      "discNumber": nullable(track.discNumber),
      "kind": "track",
    ]
  }
}

/// A value for the bridge: the value itself, or an explicit null.
private func nullable(_ value: Any?) -> Any {
  value ?? NSNull()
}

// MARK: - ShazamKit

/// Download a preview clip and find where it sits in the full recording:
/// nil for no match, throws when the download or ShazamKit failed.
private func shazamOffset(ofPreviewAt url: URL) async throws -> Double? {
  let (download, response) = try await URLSession.shared.download(from: url)
  defer { try? FileManager.default.removeItem(at: download) }
  let status = (response as? HTTPURLResponse)?.statusCode ?? 0
  guard status == 200 else { throw MusicKitError.previewDownloadFailed(status) }

  // AVURLAsset needs the file extension to recognize the audio format.
  let file = FileManager.default.temporaryDirectory
    .appendingPathComponent(UUID().uuidString)
    .appendingPathExtension(url.pathExtension.isEmpty ? "m4a" : url.pathExtension)
  try FileManager.default.moveItem(at: download, to: file)
  defer { try? FileManager.default.removeItem(at: file) }

  let signature = try await SHSignatureGenerator.signature(from: AVURLAsset(url: file))
  switch await SHSession().result(from: signature) {
  case .match(let match):
    return match.mediaItems.first?.matchOffset
  case .noMatch:
    return nil
  case .error(let error, _):
    throw error
  }
}

// MARK: - Errors

enum MusicKitError: Error, LocalizedError {
  case notAuthorized
  case trackNotFound(String)
  case noTracksFound
  case previewDownloadFailed(Int)
  case incompleteRead

  var errorDescription: String? {
    switch self {
    case .notAuthorized:
      return "Music library access not authorized. Allow access in Settings > Privacy & Security > Media & Apple Music."
    case .trackNotFound(let id):
      return "Track \(id) not found in cache. Load the library first."
    case .noTracksFound:
      return "No tracks found for the given IDs."
    case .previewDownloadFailed(let status):
      return "Preview download failed (HTTP \(status))."
    case .incompleteRead:
      return "Couldn't read the whole playlist."
    }
  }
}
