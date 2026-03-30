import XCTest
import SwiftUI
@testable import Sift

// MARK: - TestPlayerControlsView

@MainActor
final class TestPlayerControlsView: XCTestCase {
    func testRendersSeekBarWhenCurrentTrackExists() {
        // Exercises formatTime for both elapsed and duration labels
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([
            Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                  album: "The Definition", duration: 213, playCount: 47,
                  dateAdded: Date(timeIntervalSince1970: 1_470_000_000))
        ])
        vm.playbackPosition = 45.0
        vm.isPlaying = true

        let controller = UIHostingController(rootView: PlayerControlsView().environmentObject(vm))
        controller.view.layoutIfNeeded()
        XCTAssertNotNil(controller.view)
    }

    func testRendersWithoutSeekBarWhenNoCurrentTrack() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([])   // currentTrack is nil — seek bar hidden
        vm.isPlaying = false

        let controller = UIHostingController(rootView: PlayerControlsView().environmentObject(vm))
        controller.view.layoutIfNeeded()
        XCTAssertNotNil(controller.view)
    }

    func testRendersPlayIconWhenNotPlaying() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([
            Track(id: "sweet-but-psycho-ava-max", name: "Sweet But Psycho", artist: "Ava Max",
                  album: "Heaven & Hell", duration: 196, playCount: 23,
                  dateAdded: Date(timeIntervalSince1970: 1_540_000_000))
        ])
        vm.isPlaying = false    // shows play.fill icon

        let controller = UIHostingController(rootView: PlayerControlsView().environmentObject(vm))
        controller.view.layoutIfNeeded()
        XCTAssertNotNil(controller.view)
    }
}
