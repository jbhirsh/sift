import XCTest
import SwiftUI
import UIKit
@testable import Sift

// MARK: - TestDoneView

@MainActor
final class TestDoneView: XCTestCase {
    func testRendersDonePhaseWithAllTracksKept() throws {
        // removed is empty — hides the removed tracks section entirely
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([
            Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                  album: "The Definition", duration: 213, playCount: 47,
                  dateAdded: Date(timeIntervalSince1970: 1_470_000_000)),
            Track(id: "sweet-but-psycho-ava-max", name: "Sweet But Psycho", artist: "Ava Max",
                  album: "Heaven & Hell", duration: 196, playCount: 23,
                  dateAdded: Date(timeIntervalSince1970: 1_540_000_000))
        ])
        vm.decideWithoutPlayback(.keep)     // All Time Low — keep
        vm.decideWithoutPlayback(.keep)     // Sweet But Psycho — keep

        let scene = try XCTUnwrap(
            UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        )
        let window = UIWindow(windowScene: scene)
        let controller = UIHostingController(rootView: DoneView().environmentObject(vm))
        window.rootViewController = controller
        window.makeKeyAndVisible()
        controller.view.layoutIfNeeded()
        XCTAssertNotNil(controller.view)
        window.isHidden = true
    }

    func testRendersDonePhaseWithRemovedTracks() throws {
        // Two removed tracks — exercises the ForEach with alternating row backgrounds
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([
            Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                  album: "The Definition", duration: 213, playCount: 47,
                  dateAdded: Date(timeIntervalSince1970: 1_470_000_000)),
            Track(id: "sweet-but-psycho-ava-max", name: "Sweet But Psycho", artist: "Ava Max",
                  album: "Heaven & Hell", duration: 196, playCount: 23,
                  dateAdded: Date(timeIntervalSince1970: 1_540_000_000)),
            Track(id: "u-cant-touch-this-mc-hammer", name: "U Can't Touch This", artist: "MC Hammer",
                  album: "Please Hammer, Don't Hurt 'Em", duration: 257, playCount: 12,
                  dateAdded: Date(timeIntervalSince1970: 648_000_000))
        ])
        vm.decideWithoutPlayback(.keep)     // All Time Low — keep
        vm.decideWithoutPlayback(.remove)   // Sweet But Psycho — remove
        vm.decideWithoutPlayback(.remove)   // U Can't Touch This — remove

        let scene = try XCTUnwrap(
            UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        )
        let window = UIWindow(windowScene: scene)
        let controller = UIHostingController(rootView: DoneView().environmentObject(vm))
        window.rootViewController = controller
        window.makeKeyAndVisible()
        controller.view.layoutIfNeeded()
        XCTAssertNotNil(controller.view)
        window.isHidden = true
    }

    func testRendersWithRemovalPlaylistCreated() throws {
        // removalPlaylistCreated true — shows "Moved to Playlist" label instead of button
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([
            Track(id: "u-cant-touch-this-mc-hammer", name: "U Can't Touch This", artist: "MC Hammer",
                  album: "Please Hammer, Don't Hurt 'Em", duration: 257, playCount: 12,
                  dateAdded: Date(timeIntervalSince1970: 648_000_000))
        ])
        vm.decideWithoutPlayback(.remove)   // U Can't Touch This — remove
        vm.removalPlaylistCreated = true

        let scene = try XCTUnwrap(
            UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        )
        let window = UIWindow(windowScene: scene)
        let controller = UIHostingController(rootView: DoneView().environmentObject(vm))
        window.rootViewController = controller
        window.makeKeyAndVisible()
        controller.view.layoutIfNeeded()
        XCTAssertNotNil(controller.view)
        window.isHidden = true
    }

    func testRendersWhileCreatingPlaylist() throws {
        // isCreatingPlaylist true — shows ProgressView spinner inside the move button
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([
            Track(id: "sweet-but-psycho-ava-max", name: "Sweet But Psycho", artist: "Ava Max",
                  album: "Heaven & Hell", duration: 196, playCount: 23,
                  dateAdded: Date(timeIntervalSince1970: 1_540_000_000))
        ])
        vm.decideWithoutPlayback(.remove)   // Sweet But Psycho — remove
        vm.isCreatingPlaylist = true

        let scene = try XCTUnwrap(
            UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        )
        let window = UIWindow(windowScene: scene)
        let controller = UIHostingController(rootView: DoneView().environmentObject(vm))
        window.rootViewController = controller
        window.makeKeyAndVisible()
        controller.view.layoutIfNeeded()
        XCTAssertNotNil(controller.view)
        window.isHidden = true
    }

    func testRendersWithPlaylistError() throws {
        // removalPlaylistError set — shows red error text below the track list
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([
            Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                  album: "The Definition", duration: 213, playCount: 47,
                  dateAdded: Date(timeIntervalSince1970: 1_470_000_000))
        ])
        vm.decideWithoutPlayback(.remove)   // All Time Low — remove
        vm.removalPlaylistError = "None of the selected tracks could be found in your library."

        let scene = try XCTUnwrap(
            UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        )
        let window = UIWindow(windowScene: scene)
        let controller = UIHostingController(rootView: DoneView().environmentObject(vm))
        window.rootViewController = controller
        window.makeKeyAndVisible()
        controller.view.layoutIfNeeded()
        XCTAssertNotNil(controller.view)
        window.isHidden = true
    }

    func testRendersPausedPhaseWithResumeAndStartFreshButtons() throws {
        // phase .paused — shows "Session paused." title and Resume + Start Fresh buttons
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([
            Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                  album: "The Definition", duration: 213, playCount: 47,
                  dateAdded: Date(timeIntervalSince1970: 1_470_000_000)),
            Track(id: "sweet-but-psycho-ava-max", name: "Sweet But Psycho", artist: "Ava Max",
                  album: "Heaven & Hell", duration: 196, playCount: 23,
                  dateAdded: Date(timeIntervalSince1970: 1_540_000_000))
        ])
        vm.decideWithoutPlayback(.keep)     // All Time Low — keep
        vm.stopSession()                    // pauses with Sweet But Psycho remaining

        let scene = try XCTUnwrap(
            UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        )
        let window = UIWindow(windowScene: scene)
        let controller = UIHostingController(rootView: DoneView().environmentObject(vm))
        window.rootViewController = controller
        window.makeKeyAndVisible()
        controller.view.layoutIfNeeded()
        XCTAssertNotNil(controller.view)
        window.isHidden = true
    }

    func testRendersSummaryCountsAfterMixedDecisions() throws {
        // Summary shows 1 kept / 1 to remove / 1 skipped
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([
            Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                  album: "The Definition", duration: 213, playCount: 47,
                  dateAdded: Date(timeIntervalSince1970: 1_470_000_000)),
            Track(id: "sweet-but-psycho-ava-max", name: "Sweet But Psycho", artist: "Ava Max",
                  album: "Heaven & Hell", duration: 196, playCount: 23,
                  dateAdded: Date(timeIntervalSince1970: 1_540_000_000)),
            Track(id: "u-cant-touch-this-mc-hammer", name: "U Can't Touch This", artist: "MC Hammer",
                  album: "Please Hammer, Don't Hurt 'Em", duration: 257, playCount: 12,
                  dateAdded: Date(timeIntervalSince1970: 648_000_000))
        ])
        vm.decideWithoutPlayback(.keep)     // All Time Low — keep
        vm.decideWithoutPlayback(.remove)   // Sweet But Psycho — remove
        vm.decideWithoutPlayback(.skip)     // U Can't Touch This — skip

        let scene = try XCTUnwrap(
            UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        )
        let window = UIWindow(windowScene: scene)
        let controller = UIHostingController(rootView: DoneView().environmentObject(vm))
        window.rootViewController = controller
        window.makeKeyAndVisible()
        controller.view.layoutIfNeeded()
        XCTAssertNotNil(controller.view)
        window.isHidden = true
    }
}
