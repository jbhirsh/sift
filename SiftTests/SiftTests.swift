import XCTest
@testable import Sift

// MARK: - Mock playlist service

final class MockPlaylistService: PlaylistService {
    var addedTracks: [Track] = []
    var shouldThrow = false

    func addToRemovalPlaylist(tracks: [Track]) async throws {
        if shouldThrow { throw PlaylistError.noMatchingSongs }
        addedTracks = tracks
    }
}
