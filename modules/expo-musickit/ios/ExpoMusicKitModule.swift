import ExpoModulesCore
import MusicKit

// Pure decision logic (batch slicing, catalog pairing, createPlaylist
// accounting, cache keying) lives in ../logic/Sources/MusicKitLogic — the
// podspec's source_files glob compiles those files into this same target,
// so the functions are called directly without an import. The SwiftPM
// package at ../logic exists purely so `swift test` can exercise them.

public class ExpoMusicKitModule: Module {
  /// Cached Song objects keyed by MusicItemID raw value.
  /// Populated by loadLibrary/loadFullLibrary and used for playback lookups.
  private var songCache: [String: Song] = [:]
  /// Cached Track objects for playlist tracks not in the user's library.
  /// Used as a playback fallback when Song lookup fails.
  private var trackCache: [String: Track] = [:]
  /// Resolved artwork file paths keyed by track ID.
  private var artworkCache: [String: String] = [:]

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

    // MARK: - Library

    AsyncFunction("loadLibrary") { (sortOrder: String, offset: Int, limit: Int) -> [[String: Any]] in
      guard MusicAuthorization.currentStatus == .authorized else {
        throw MusicKitError.notAuthorized
      }

      var request = MusicLibraryRequest<Song>()
      request.limit = limit
      request.offset = offset

      switch sortOrder {
      case "dateAdded":
        request.sort(by: \.libraryAddedDate, ascending: false)
      case "title":
        request.sort(by: \.title, ascending: true)
      case "artist":
        request.sort(by: \.artistName, ascending: true)
      default:
        break
      }

      let response = try await request.response()
      let songs = Array(response.items)

      var results: [[String: Any]] = []
      for song in songs {
        self.songCache[song.id.rawValue] = song
        results.append(self.songToDictionary(song))
      }
      return results
    }

    AsyncFunction("loadFullLibrary") { () -> [[String: Any]] in
      guard MusicAuthorization.currentStatus == .authorized else {
        throw MusicKitError.notAuthorized
      }

      var allSongs: [Song] = []
      var offset = 0
      let pageSize = 500

      while true {
        var request = MusicLibraryRequest<Song>()
        request.limit = pageSize
        request.offset = offset
        let response = try await request.response()
        let page = Array(response.items)
        allSongs.append(contentsOf: page)
        if page.count < pageSize { break }
        offset += pageSize
      }

      var results: [[String: Any]] = []
      for song in allSongs {
        self.songCache[song.id.rawValue] = song
        results.append(self.songToDictionary(song))
      }
      return results
    }

    // MARK: - Playlist Loading

    AsyncFunction("loadPlaylists") { () -> [[String: Any]] in
      guard MusicAuthorization.currentStatus == .authorized else {
        throw MusicKitError.notAuthorized
      }

      var allPlaylists: [MusicKit.Playlist] = []
      var offset = 0
      let pageSize = 100

      while true {
        var request = MusicLibraryRequest<MusicKit.Playlist>()
        request.limit = pageSize
        request.offset = offset
        let response = try await request.response()
        let page = Array(response.items)
        allPlaylists.append(contentsOf: page)
        if page.count < pageSize { break }
        offset += pageSize
      }

      var results: [[String: Any]] = []
      for playlist in allPlaylists {
        let detailed = try await playlist.with([.tracks])
        let trackCount = detailed.tracks?.count ?? 0

        var dict: [String: Any] = [
          "id": playlist.id.rawValue,
          "name": playlist.name,
          "trackCount": trackCount,
        ]

        if let artwork = playlist.artwork, let url = artwork.url(width: 300, height: 300),
           url.scheme == "https" || url.scheme == "http" {
          dict["artworkURL"] = url.absoluteString
        } else {
          dict["artworkURL"] = NSNull()
        }

        results.append(dict)
      }
      return results
    }

    AsyncFunction("loadPlaylistTracks") { (playlistID: String) -> [[String: Any]] in
      guard MusicAuthorization.currentStatus == .authorized else {
        throw MusicKitError.notAuthorized
      }

      var request = MusicLibraryRequest<MusicKit.Playlist>()
      request.filter(matching: \.id, equalTo: MusicItemID(playlistID))
      let response = try await request.response()

      guard let playlist = response.items.first else {
        throw MusicKitError.noTracksFound
      }

      let detailedPlaylist = try await playlist.with([.tracks])

      guard let tracks = detailedPlaylist.tracks else {
        return []
      }

      // Fetch per-track Song lookups concurrently so large playlists
      // don't stall on serial round-trips, but in batches of 100 so a huge
      // playlist doesn't fan out unbounded concurrent requests.
      // Preserve playlist order via index.
      let tracksArray = Array(tracks)
      let batchSize = 100
      var songResults: [(Int, Track, Song?)] = []
      for range in batchRanges(count: tracksArray.count, batchSize: batchSize) {
        let batchResults = await withTaskGroup(of: (Int, Track, Song?).self) { group -> [(Int, Track, Song?)] in
          for index in range {
            let track = tracksArray[index]
            group.addTask {
              do {
                var songRequest = MusicLibraryRequest<Song>()
                songRequest.filter(matching: \.id, equalTo: track.id)
                let songResponse = try await songRequest.response()
                return (index, track, songResponse.items.first)
              } catch {
                // A transient per-track failure must not reject the whole
                // call (discarding every already-resolved track). Treat it
                // like a library miss: the Track-metadata fallback below
                // still returns the track.
                return (index, track, nil)
              }
            }
          }
          var out: [(Int, Track, Song?)] = []
          for await r in group { out.append(r) }
          return out
        }
        songResults.append(contentsOf: batchResults)
      }
      songResults.sort { $0.0 < $1.0 }

      var results: [[String: Any]] = []
      for (_, track, song) in songResults {
        if let song {
          self.songCache[song.id.rawValue] = song
          results.append(self.songToDictionary(song))
        } else {
          // Track not in library — use Track metadata directly
          self.trackCache[track.id.rawValue] = track
          results.append(self.trackToDictionary(track))
        }
      }
      return results
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
      try await player.play()
      if position > 0 {
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

    // MARK: - Playlist

    AsyncFunction("createPlaylist") { (name: String, trackIDs: [String]) -> Int in
      // Resolve cache misses via the library, then the catalog (same
      // fallback as warmSongCache) so non-library tracks are not dropped.
      await self.resolveTracksIntoCaches(trackIDs)

      // Classify each requested id against the caches; the count accounting
      // is pure logic (see MusicKitLogic). IDs that are still unresolvable
      // (not in the library and not in the catalog) are skipped; the
      // returned count lets the JS side surface the shortfall.
      let resolutions = self.resolutions(for: trackIDs)
      guard resolvableCount(resolutions) > 0 else {
        throw MusicKitError.noTracksFound
      }

      // One path for every mix of library/non-library items: create the
      // playlist empty, then add each item individually in caller order.
      // A single bulk createPlaylist(name:items:) call is all-or-nothing —
      // one unaddable item (revoked availability, transient MusicKit error)
      // would fail the whole batch with no playlist and no count. And a
      // bulk-then-retry fallback is unsafe: if the bulk call throws AFTER
      // creating the playlist, the retry would create a same-named
      // duplicate. Per-item adds keep caller order, survive individual
      // failures (each is caught, counted as shortfall), and feed the
      // returned count the JS buffer/report handling relies on.
      let playlist = try await MusicLibrary.shared.createPlaylist(name: name)
      let outcomes = await self.addEach(trackIDs, to: playlist)
      return mixedAddedCount(resolutions: resolutions, outcomes: outcomes)
    }

    // MARK: - Removal

    AsyncFunction("removeFromLibrary") { (trackIDs: [String]) in
      guard MusicAuthorization.currentStatus == .authorized else {
        throw MusicKitError.notAuthorized
      }

      var songs: [Song] = []
      for id in trackIDs {
        if let song = self.songCache[id] {
          songs.append(song)
        } else {
          var request = MusicLibraryRequest<Song>()
          request.filter(matching: \.id, equalTo: MusicItemID(id))
          let response = try await request.response()
          if let song = response.items.first {
            songs.append(song)
          }
        }
      }

      guard !songs.isEmpty else {
        throw MusicKitError.noTracksFound
      }

      // MusicKit does not support deleting from the library.
      // Move tracks to a "Sift — Removed" playlist so the user can
      // review and delete them manually in the Music app.
      let playlistName = "Sift — Removed"
      var playlistRequest = MusicLibraryRequest<MusicKit.Playlist>()
      let allPlaylists = try await playlistRequest.response()
      let existing = allPlaylists.items.first { $0.name == playlistName }

      if let playlist = existing {
        for song in songs {
          _ = try await MusicLibrary.shared.add(song, to: playlist)
        }
      } else {
        _ = try await MusicLibrary.shared.createPlaylist(name: playlistName, items: songs)
      }
    }

    AsyncFunction("removeFromPlaylist") { (playlistID: String, trackIDs: [String]) in
      guard MusicAuthorization.currentStatus == .authorized else {
        throw MusicKitError.notAuthorized
      }

      var request = MusicLibraryRequest<MusicKit.Playlist>()
      request.filter(matching: \.id, equalTo: MusicItemID(playlistID))
      let response = try await request.response()

      guard let playlist = response.items.first else {
        throw MusicKitError.noTracksFound
      }

      let detailedPlaylist = try await playlist.with([.tracks])
      guard let currentTracks = detailedPlaylist.tracks else { return }

      let idsToRemove = Set(trackIDs)
      let remaining = currentTracks.filter { !idsToRemove.contains($0.id.rawValue) }

      try await MusicLibrary.shared.edit(detailedPlaylist, items: remaining)
    }

    AsyncFunction("addToLibrary") { (trackIDs: [String]) in
      guard MusicAuthorization.currentStatus == .authorized else {
        throw MusicKitError.notAuthorized
      }

      for id in trackIDs {
        let song: Song
        if let cached = self.songCache[id] {
          song = cached
        } else {
          var request = MusicLibraryRequest<Song>()
          request.filter(matching: \.id, equalTo: MusicItemID(id))
          let response = try await request.response()
          guard let found = response.items.first else { continue }
          song = found
          self.songCache[id] = song
        }
        try await MusicLibrary.shared.add(song)
      }
    }

    AsyncFunction("addToPlaylist") { (playlistID: String, trackIDs: [String]) -> Int in
      guard MusicAuthorization.currentStatus == .authorized else {
        throw MusicKitError.notAuthorized
      }

      var request = MusicLibraryRequest<MusicKit.Playlist>()
      request.filter(matching: \.id, equalTo: MusicItemID(playlistID))
      let response = try await request.response()

      guard let playlist = response.items.first else {
        throw MusicKitError.noTracksFound
      }

      // Resolve cache misses via the library, then the catalog (same
      // fallback as warmSongCache) so non-library tracks are not dropped.
      await self.resolveTracksIntoCaches(trackIDs)

      // Genuinely unresolvable IDs are skipped; the returned count lets the
      // JS side detect the shortfall and buffer/report the missing tracks
      // instead of treating the call as a silent success. Adds are per-item
      // with per-item error tolerance (addEach) — same rationale as
      // createPlaylist: a mid-loop throw must cost only its own item, never
      // reject the call after earlier items already landed, or the JS side
      // gets a raw error instead of the count its shortfall handling needs.
      let resolutions = self.resolutions(for: trackIDs)
      let outcomes = await self.addEach(trackIDs, to: playlist)
      return mixedAddedCount(resolutions: resolutions, outcomes: outcomes)
    }

    // MARK: - Cache Warming

    AsyncFunction("warmSongCache") { (trackIDs: [String]) -> Int in
      guard MusicAuthorization.currentStatus == .authorized else {
        throw MusicKitError.notAuthorized
      }

      // Unified onto resolveTracksIntoCaches: identical library-then-catalog
      // fallback, batching, and per-lookup error tolerance. Returns how many
      // of the REQUESTED ids are now resolvable (already-cached ones
      // included) so the JS side can breadcrumb a genuine shortfall.
      await self.resolveTracksIntoCaches(trackIDs)
      return trackIDs.filter { self.songCache[$0] != nil || self.trackCache[$0] != nil }.count
    }

    // MARK: - Artwork Resolution

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

  /// How each requested id resolves against the caches, in caller order.
  private func resolutions(for trackIDs: [String]) -> [PlaylistItemResolution] {
    trackIDs.map { id in
      if self.songCache[id] != nil { return .librarySong }
      if self.trackCache[id] != nil { return .nonLibraryTrack }
      return .unresolved
    }
  }

  /// Add each resolvable id to the playlist individually, in caller order,
  /// catching per-item errors. Returns one outcome per RESOLVABLE item
  /// (unresolved ids get no attempt and no outcome slot) — exactly the
  /// shape mixedAddedCount expects.
  private func addEach(_ trackIDs: [String], to playlist: MusicKit.Playlist) async -> [Bool] {
    var outcomes: [Bool] = []
    for id in trackIDs {
      do {
        if let song = self.songCache[id] {
          _ = try await MusicLibrary.shared.add(song, to: playlist)
          outcomes.append(true)
        } else if let track = self.trackCache[id] {
          _ = try await MusicLibrary.shared.add(track, to: playlist)
          outcomes.append(true)
        }
        // Unresolved ids: no attempt, no outcome slot.
      } catch {
        // Skipped — counted as shortfall by mixedAddedCount.
        outcomes.append(false)
      }
    }
    return outcomes
  }

  /// Resolve any track IDs missing from both caches: first via the user's
  /// library, then via the Apple Music catalog in batches (playlist tracks
  /// that are not library items never resolve through MusicLibraryRequest).
  /// Individual lookup failures and catalog failures (offline, no
  /// subscription) are non-fatal; genuinely unresolvable IDs simply stay
  /// uncached for the caller to skip and count. Returns how many songs were
  /// newly cached.
  @discardableResult
  private func resolveTracksIntoCaches(_ trackIDs: [String]) async -> Int {
    // De-duplicated: a repeated id must not spawn duplicate concurrent
    // lookups or increment `resolved` once per occurrence — callers diff
    // the count against distinct ids.
    let missing = uniquePreservingOrder(
      trackIDs.filter { self.songCache[$0] == nil && self.trackCache[$0] == nil }
    )
    guard !missing.isEmpty else { return 0 }

    // Library lookups run concurrently in batches so a full playlist of
    // cache misses doesn't stall on serial round-trips. Order doesn't matter
    // here — this only populates the caches; callers rebuild their ordered
    // lists afterwards. Per-task errors are caught so one transient failure
    // routes that id into the catalog fallback / shortfall accounting
    // instead of aborting the whole group.
    let batchSize = 100
    var resolved = 0
    var stillMissing: [String] = []
    for range in batchRanges(count: missing.count, batchSize: batchSize) {
      let batch = Array(missing[range])
      let batchResults = await withTaskGroup(of: (String, Song?).self) { group -> [(String, Song?)] in
        for id in batch {
          group.addTask {
            do {
              var request = MusicLibraryRequest<Song>()
              request.filter(matching: \.id, equalTo: MusicItemID(id))
              let response = try await request.response()
              return (id, response.items.first)
            } catch {
              return (id, nil)
            }
          }
        }
        var results: [(String, Song?)] = []
        for await result in group {
          results.append(result)
        }
        return results
      }
      for (id, song) in batchResults {
        if let song {
          self.songCache[id] = song
          resolved += 1
        } else {
          stillMissing.append(id)
        }
      }
    }

    guard !stillMissing.isEmpty else { return resolved }

    for range in batchRanges(count: stillMissing.count, batchSize: batchSize) {
      let batch = Array(stillMissing[range])
      let catalogRequest = MusicCatalogResourceRequest<Song>(
        matching: \.id,
        memberOf: batch.map { MusicItemID($0) }
      )
      guard let catalogResponse = try? await catalogRequest.response() else { continue }

      let requestedIDs = Set(batch)
      var unmatchedResponses: [Song] = []
      for song in catalogResponse.items {
        if requestedIDs.contains(song.id.rawValue) {
          if self.songCache[song.id.rawValue] == nil {
            self.songCache[song.id.rawValue] = song
            resolved += 1
          }
        } else {
          unmatchedResponses.append(song)
        }
      }

      // The catalog occasionally canonicalizes an id, answering with the
      // same song under a different identifier. Callers look tracks up by
      // the id they REQUESTED, so keying only by the response id would
      // leave that id a permanent cache miss. The pairing decision is the
      // pure canonicalPairing (MusicKitLogic): it requires the 1:1 count
      // match AND that the requested song's known metadata (title/artist,
      // duration within 1s when both known) matches the response —
      // counting alone can mis-pair when one requested id genuinely failed
      // and an unrelated extra item appeared.
      //
      // NOTE: an id reaches this fallback precisely because it missed both
      // caches, so knownMetadata(for:) is nil here today (a concurrent call
      // filling the cache mid-flight is the only exception) and the pairing
      // stays unresolved — the safe shortfall path, which the JS side
      // surfaces via error/pendingKeeps handling. Plumbing requested-side
      // track metadata down from JS would light this up again without
      // re-auditing safety.
      let unansweredRequests = batch.filter {
        self.songCache[$0] == nil && self.trackCache[$0] == nil
      }
      let unmatchedCandidates = unmatchedResponses.map {
        CandidateSong(id: $0.id.rawValue, title: $0.title, artist: $0.artistName, duration: $0.duration)
      }
      let requestedMetadata = unansweredRequests.count == 1
        ? self.knownMetadata(for: unansweredRequests[0])
        : nil
      if let pairing = canonicalPairing(
        unansweredRequestIDs: unansweredRequests,
        unmatchedResponses: unmatchedCandidates,
        requestedMetadata: requestedMetadata
      ), let song = unmatchedResponses.first(where: { $0.id.rawValue == pairing.response.id }) {
        // Key under the requested id (what callers use) and the response id
        // (what later catalog answers would use), so both resolve.
        for key in cacheKeys(requestedID: pairing.requestID, responseID: song.id.rawValue)
        where self.songCache[key] == nil {
          self.songCache[key] = song
        }
        resolved += 1
      }
    }
    return resolved
  }

  /// Metadata this module already knows for a track id, if any — used to
  /// validate a canonicalized catalog pairing (see canonicalPairing).
  private func knownMetadata(for id: String) -> CandidateSong? {
    if let song = self.songCache[id] {
      return CandidateSong(id: id, title: song.title, artist: song.artistName, duration: song.duration)
    }
    if let track = self.trackCache[id] {
      return CandidateSong(id: id, title: track.title, artist: track.artistName, duration: track.duration)
    }
    return nil
  }

  private func trackToDictionary(_ track: Track) -> [String: Any] {
    var dict: [String: Any] = [
      "id": track.id.rawValue,
      "name": track.title,
      "artist": track.artistName,
      "album": track.albumTitle ?? "",
      "duration": track.duration ?? 0,
      "playCount": 0,
      "dateAdded": "",
    ]

    if let artwork = track.artwork, let url = artwork.url(width: 600, height: 600),
       url.scheme == "https" || url.scheme == "http" {
      dict["artworkURL"] = url.absoluteString
    } else {
      dict["artworkURL"] = NSNull()
    }

    return dict
  }

  private func songToDictionary(_ song: Song) -> [String: Any] {
    var dict: [String: Any] = [
      "id": song.id.rawValue,
      "name": song.title,
      "artist": song.artistName,
      "album": song.albumTitle ?? "",
      "duration": song.duration ?? 0,
      "playCount": song.playCount ?? 0,
    ]

    if let dateAdded = song.libraryAddedDate {
      dict["dateAdded"] = dateFormatter.string(from: dateAdded)
    } else {
      dict["dateAdded"] = ""
    }

    if let artwork = song.artwork, let url = artwork.url(width: 600, height: 600),
       url.scheme == "https" || url.scheme == "http" {
      dict["artworkURL"] = url.absoluteString
    } else {
      dict["artworkURL"] = NSNull()
    }

    return dict
  }
}

// MARK: - Errors

enum MusicKitError: Error, LocalizedError {
  case notAuthorized
  case trackNotFound(String)
  case noTracksFound

  var errorDescription: String? {
    switch self {
    case .notAuthorized:
      return "Music library access not authorized. Allow access in Settings > Privacy & Security > Media & Apple Music."
    case .trackNotFound(let id):
      return "Track \(id) not found in cache. Load the library first."
    case .noTracksFound:
      return "No tracks found for the given IDs."
    }
  }
}
