import XCTest
@testable import Sift

// MARK: - TestPlaylistError

final class TestPlaylistError: XCTestCase {
    func testFetchFailedHasDescription() {
        let error = PlaylistError.fetchFailed
        XCTAssertNotNil(error.errorDescription)
        XCTAssertFalse((error.errorDescription ?? "").isEmpty)
    }

    func testNoMatchingSongsHasDescription() {
        let error = PlaylistError.noMatchingSongs
        XCTAssertNotNil(error.errorDescription)
        XCTAssertFalse((error.errorDescription ?? "").isEmpty)
    }
}

// MARK: - TestPlaylistServiceEdgeCases

final class TestPlaylistServiceEdgeCases: XCTestCase {
    func testAddToRemovalPlaylistWithEmptyTracksDoesNotThrow() async {
        let service = MusicKitPlaylistService()
        do {
            try await service.addToRemovalPlaylist(tracks: [])
        } catch {
            XCTFail("Should not throw for an empty track list: \(error)")
        }
    }
}
