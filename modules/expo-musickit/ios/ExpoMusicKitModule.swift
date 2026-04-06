import ExpoModulesCore
import MusicKit

public class ExpoMusicKitModule: Module {
  /// Cached Song objects keyed by MusicItemID raw value.
  /// Populated by loadLibrary/loadFullLibrary and used for playback lookups.
  private var songCache: [String: Song] = [:]
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

    // MARK: - Playback

    AsyncFunction("play") { (trackID: String, position: Double) in
      guard let song = self.songCache[trackID] else {
        throw MusicKitError.trackNotFound(trackID)
      }

      let player = ApplicationMusicPlayer.shared
      player.queue = [song]
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

    AsyncFunction("createPlaylist") { (name: String, trackIDs: [String]) in
      var songs: [Song] = []

      // Try cache first
      for id in trackIDs {
        if let song = self.songCache[id] {
          songs.append(song)
        }
      }

      // If cache missed some, fetch them
      let cachedIDs = Set(songs.map { $0.id.rawValue })
      let missingIDs = trackIDs.filter { !cachedIDs.contains($0) }

      if !missingIDs.isEmpty {
        for id in missingIDs {
          var request = MusicLibraryRequest<Song>()
          request.filter(matching: \.id, equalTo: MusicItemID(id))
          let response = try await request.response()
          if let song = response.items.first {
            songs.append(song)
            self.songCache[id] = song
          }
        }
      }

      guard !songs.isEmpty else {
        throw MusicKitError.noTracksFound
      }

      _ = try await MusicLibrary.shared.createPlaylist(name: name, items: songs)
    }

    // MARK: - Artwork Resolution

    AsyncFunction("resolveArtworkURL") { (trackID: String, width: Int, height: Int) -> String? in
      // Return cached result immediately
      if let cached = self.artworkCache[trackID] {
        return cached
      }

      guard let song = self.songCache[trackID] else {
        return nil
      }

      guard let artwork = song.artwork,
            let url = artwork.url(width: width, height: height) else {
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
