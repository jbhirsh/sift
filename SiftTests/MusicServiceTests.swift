import XCTest
@testable import Sift

// MARK: - TestMusicErrors

final class TestMusicErrors: XCTestCase {
    func testNotAuthorizedHasDescription() {
        let error = MusicError.notAuthorized
        XCTAssertNotNil(error.errorDescription)
        XCTAssertFalse((error.errorDescription ?? "").isEmpty)
    }

    func testLibraryNotFoundHasDescription() {
        let error = MusicError.libraryNotFound
        XCTAssertNotNil(error.errorDescription)
        XCTAssertFalse((error.errorDescription ?? "").isEmpty)
    }
}

// MARK: - TestMusicService

final class TestMusicService: XCTestCase {
    func testIsPlayingReturnsBool() async {
        // ApplicationMusicPlayer.shared is always accessible; returns false when idle
        let service = AppleMusicService()
        let playing = await service.isPlaying()
        XCTAssertFalse(playing)     // no track loaded — player is idle
    }
}
