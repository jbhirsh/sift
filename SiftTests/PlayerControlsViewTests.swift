import XCTest
import SwiftUI
@testable import Sift

// MARK: - TestPlayerControlsView

@MainActor
final class TestPlayerControlsView: XCTestCase {
    private func render(vm: SiftViewModel) -> UIView {
        let controller = UIHostingController(rootView: PlayerControlsView().environmentObject(vm))
        controller.view.frame = CGRect(x: 0, y: 0, width: 393, height: 852)
        let window = UIWindow(frame: controller.view.frame)
        window.rootViewController = controller
        window.makeKeyAndVisible()
        controller.view.layoutIfNeeded()
        RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.05))
        return controller.view
    }

    func testPlayPauseButtonPresent() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([
            Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                  album: "The Definition", duration: 213, playCount: 47,
                  dateAdded: Date(timeIntervalSince1970: 1_470_000_000))
        ])
        let view = render(vm: vm)
        // SF Symbol "play.fill" exposes "Play" as its accessibility label
        XCTAssertTrue(findAccessibilityElement(label: "Play", in: view),
                      "Play/pause button should be present")
    }

    func testElapsedTimePresentWithTrack() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([
            Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                  album: "The Definition", duration: 213, playCount: 47,
                  dateAdded: Date(timeIntervalSince1970: 1_470_000_000))
        ])
        vm.playbackPosition = 45.0
        let view = render(vm: vm)
        XCTAssertTrue(findAccessibilityElement(label: "0:45", in: view),
                      "Elapsed time label should be present when a track is loaded")
    }

    func testDurationTimePresentWithTrack() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([
            Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                  album: "The Definition", duration: 213, playCount: 47,
                  dateAdded: Date(timeIntervalSince1970: 1_470_000_000))
        ])
        let view = render(vm: vm)
        XCTAssertTrue(findAccessibilityElement(label: "3:33", in: view),
                      "Duration time label should be present when a track is loaded")
    }

    func testSeekBarAbsentWithNoTrack() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([])
        let view = render(vm: vm)
        XCTAssertTrue(accessibilityElementAbsent(label: "0:00", in: view),
                      "Elapsed time should NOT be present when no track is loaded")
    }
}
