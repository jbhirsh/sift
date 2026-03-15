import Foundation
import MusicKit

// MARK: - Errors

enum MusicError: Error, LocalizedError {
    case notAuthorized
    case libraryNotFound

    var errorDescription: String? {
        switch self {
        case .notAuthorized:
            return "Music library access was denied. " +
                   "Allow access in Settings → Privacy & Security → Media & Apple Music."
        case .libraryNotFound: return "Could not load your Music library."
        }
    }
}

// MARK: - MusicService

actor MusicService {
    /// Cached Song objects keyed by their MusicItemID raw value.
    /// Populated by loadLibrary() and used for play/artwork lookups.
    private var songCache: [String: Song] = [:]

    // MARK: - Authorization

    func requestAuthorization() async -> Bool {
        let status = await MusicAuthorization.request()
        return status == .authorized
    }

    var isAuthorized: Bool {
        MusicAuthorization.currentStatus == .authorized
    }

    // MARK: - Library

    func loadLibrary() async throws -> [Track] {
        guard isAuthorized else { throw MusicError.notAuthorized }

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

        var cache: [String: Song] = [:]
        let tracks = allSongs.map { song -> Track in
            cache[song.id.rawValue] = song
            return Track(
                id: song.id.rawValue,
                name: song.title,
                artist: song.artistName,
                album: song.albumTitle ?? "",
                duration: song.duration ?? 0,
                playCount: song.playCount ?? 0,
                dateAdded: song.libraryAddedDate ?? Date.distantPast
            )
        }
        songCache = cache
        return tracks
    }

    // MARK: - Playback

    func play(trackID: String, at position: Double = 0) async throws {
        guard let song = songCache[trackID] else { return }
        let player = ApplicationMusicPlayer.shared
        player.queue = [song]
        try await player.play()
        if position > 0 {
            player.playbackTime = position
        }
    }

    func currentPosition() -> Double {
        ApplicationMusicPlayer.shared.playbackTime
    }

    func seek(to position: Double) {
        ApplicationMusicPlayer.shared.playbackTime = position
    }

    func pause() async throws {
        ApplicationMusicPlayer.shared.pause()
    }

    func resume() async throws {
        try await ApplicationMusicPlayer.shared.play()
    }

    func isPlaying() -> Bool {
        ApplicationMusicPlayer.shared.state.playbackStatus == .playing
    }

    // MARK: - Artwork

    func artwork(forTrackID trackID: String) -> Artwork? {
        songCache[trackID]?.artwork
    }

}
