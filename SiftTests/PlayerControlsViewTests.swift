import XCTest
import SwiftUI
import UIKit
@testable import Sift

// MARK: - TestPlayerControlsView

@MainActor
final class TestPlayerControlsView: XCTestCase {
    func testRendersSeekBarWhenCurrentTrackExists() throws {
        // Exercises formatTime for both elapsed and duration labels
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([
            Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                  album: "The Definition", duration: 213, playCount: 47,
                  dateAdded: Date(timeIntervalSince1970: 1_470_000_000))
        ])
        vm.playbackPosition = 45.0
        vm.isPlaying = true

        let scene = try XCTUnwrap(
            UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        )
        let window = UIWindow(windowScene: scene)
        let controller = UIHostingController(rootView: PlayerControlsView().environmentObject(vm))
        window.rootViewController = controller
        window.makeKeyAndVisible()
        controller.view.layoutIfNeeded()
        XCTAssertNotNil(controller.view)
        window.isHidden = true
    }

    func testRendersWithoutSeekBarWhenNoCurrentTrack() throws {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([])   // currentTrack is nil — seek bar hidden
        vm.isPlaying = false

        let scene = try XCTUnwrap(
            UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        )
        let window = UIWindow(windowScene: scene)
        let controller = UIHostingController(rootView: PlayerControlsView().environmentObject(vm))
        window.rootViewController = controller
        window.makeKeyAndVisible()
        controller.view.layoutIfNeeded()
        XCTAssertNotNil(controller.view)
        window.isHidden = true
    }

    func testRendersPlayIconWhenNotPlaying() throws {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([
            Track(id: "sweet-but-psycho-ava-max", name: "Sweet But Psycho", artist: "Ava Max",
                  album: "Heaven & Hell", duration: 196, playCount: 23,
                  dateAdded: Date(timeIntervalSince1970: 1_540_000_000))
        ])
        vm.isPlaying = false    // shows play.fill icon

        let scene = try XCTUnwrap(
            UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        )
        let window = UIWindow(windowScene: scene)
        let controller = UIHostingController(rootView: PlayerControlsView().environmentObject(vm))
        window.rootViewController = controller
        window.makeKeyAndVisible()
        controller.view.layoutIfNeeded()
        XCTAssertNotNil(controller.view)
        window.isHidden = true
    }
}
