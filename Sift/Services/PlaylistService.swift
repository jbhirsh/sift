import Foundation
import MusicKit

// MARK: - Protocol

protocol PlaylistService {
    func addToRemovalPlaylist(tracks: [Track]) async throws
}

// MARK: - Errors

enum PlaylistError: Error, LocalizedError {
    case fetchFailed
    case noMatchingSongs

    var errorDescription: String? {
        switch self {
        case .fetchFailed:
            return "Failed to fetch tracks from your music library."
        case .noMatchingSongs:
            return "None of the selected tracks could be found in your library."
        }
    }
}

// MARK: - MusicKit implementation

final class MusicKitPlaylistService: PlaylistService {
    private let playlistName = "Sift — To Remove"

    func addToRemovalPlaylist(tracks: [Track]) async throws {
        guard !tracks.isEmpty else { return }

        let ids = tracks.map { MusicItemID($0.id) }
        var request = MusicLibraryRequest<Song>()
        request.filter(matching: \.id, memberOf: ids)
        let response = try await request.response()
        let songs = Array(response.items)

        guard !songs.isEmpty else { throw PlaylistError.noMatchingSongs }

        try await MusicLibrary.shared.createPlaylist(
            name: playlistName,
            description: "Tracks marked for removal by Sift",
            authorDisplayName: nil,
            items: songs
        )
    }
}
