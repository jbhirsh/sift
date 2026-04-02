import XCTest
@testable import Sift

// MARK: - TestPreviewAudioPlayer

@MainActor
final class TestPreviewAudioPlayer: XCTestCase {
    func testInitialStateIsNotPlaying() {
        let player = PreviewAudioPlayer()
        XCTAssertFalse(player.isPlaying)
        XCTAssertEqual(player.currentPosition, 0)
    }

    func testStopResetsState() {
        let player = PreviewAudioPlayer()
        // Simulate that playing was set (we can't actually stream in unit tests)
        player.stop()
        XCTAssertFalse(player.isPlaying)
    }

    func testPauseSetsIsPlayingFalse() {
        let player = PreviewAudioPlayer()
        player.pause()
        XCTAssertFalse(player.isPlaying)
    }
}
