import XCTest
import SwiftUI
@testable import Sift

// MARK: - TestDoneView

@MainActor
final class TestDoneView: XCTestCase {
    override func tearDown() {
        SessionStore().clear()
        super.tearDown()
    }

    private func render(vm: SiftViewModel) -> UIView {
        let controller = UIHostingController(rootView: DoneView().environmentObject(vm))
        controller.view.frame = CGRect(x: 0, y: 0, width: 393, height: 852)
        let window = UIWindow(frame: controller.view.frame)
        window.rootViewController = controller
        window.makeKeyAndVisible()
        controller.view.layoutIfNeeded()
        RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.05))
        return controller.view
    }

    // MARK: - Title text

    func testTitleShowsAllDoneWhenDonePhase() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([
            Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                  album: "The Definition", duration: 213, playCount: 47,
                  dateAdded: Date(timeIntervalSince1970: 1_470_000_000))
        ])
        vm.decideWithoutPlayback(.keep)
        let view = render(vm: vm)
        XCTAssertTrue(findAccessibilityElement(label: "All done.", in: view),
                      "Should display 'All done.' title text")
    }

    func testTitleShowsSessionPausedWhenPaused() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([
            Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                  album: "The Definition", duration: 213, playCount: 47,
                  dateAdded: Date(timeIntervalSince1970: 1_470_000_000)),
            Track(id: "sweet-but-psycho-ava-max", name: "Sweet But Psycho", artist: "Ava Max",
                  album: "Heaven & Hell", duration: 196, playCount: 23,
                  dateAdded: Date(timeIntervalSince1970: 1_540_000_000))
        ])
        vm.decideWithoutPlayback(.keep)
        vm.stopSession()
        let view = render(vm: vm)
        XCTAssertTrue(findAccessibilityElement(label: "Session paused.", in: view),
                      "Should display 'Session paused.' title text")
    }

    // MARK: - Summary stats

    func testSummaryLabelsPresent() {
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
        vm.decideWithoutPlayback(.keep)
        vm.decideWithoutPlayback(.remove)
        vm.decideWithoutPlayback(.skip)
        let view = render(vm: vm)
        XCTAssertTrue(findAccessibilityElement(label: "kept", in: view),
                      "Kept summary label should be present")
        XCTAssertTrue(findAccessibilityElement(label: "to remove", in: view),
                      "To remove summary label should be present")
        XCTAssertTrue(findAccessibilityElement(label: "skipped", in: view),
                      "Skipped summary label should be present")
    }

    // MARK: - Action buttons

    func testStartOverButtonVisibleWhenDone() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([
            Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                  album: "The Definition", duration: 213, playCount: 47,
                  dateAdded: Date(timeIntervalSince1970: 1_470_000_000))
        ])
        vm.decideWithoutPlayback(.keep)
        let view = render(vm: vm)
        XCTAssertTrue(findAccessibilityElement(label: "Start Over", in: view),
                      "Start Over button should be visible when done")
        XCTAssertTrue(accessibilityElementAbsent(label: "Resume Session", in: view),
                      "Resume Session should NOT be visible when done")
    }

    func testResumeAndStartFreshVisibleWhenPaused() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([
            Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                  album: "The Definition", duration: 213, playCount: 47,
                  dateAdded: Date(timeIntervalSince1970: 1_470_000_000)),
            Track(id: "sweet-but-psycho-ava-max", name: "Sweet But Psycho", artist: "Ava Max",
                  album: "Heaven & Hell", duration: 196, playCount: 23,
                  dateAdded: Date(timeIntervalSince1970: 1_540_000_000))
        ])
        vm.decideWithoutPlayback(.keep)
        vm.stopSession()
        let view = render(vm: vm)
        XCTAssertTrue(findAccessibilityElement(label: "Resume Session", in: view),
                      "Resume Session should be visible when paused")
        XCTAssertTrue(findAccessibilityElement(label: "Start Fresh", in: view),
                      "Start Fresh should be visible when paused")
    }

    // MARK: - Removed tracks section

    func testMoveToPlaylistVisibleWithRemovedTracks() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([
            Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                  album: "The Definition", duration: 213, playCount: 47,
                  dateAdded: Date(timeIntervalSince1970: 1_470_000_000))
        ])
        vm.decideWithoutPlayback(.remove)
        let view = render(vm: vm)
        XCTAssertTrue(findAccessibilityElement(label: "Move to Playlist", in: view),
                      "Move to Playlist button should be visible when tracks are removed")
    }

    func testMovedToPlaylistShownAfterCreation() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([
            Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                  album: "The Definition", duration: 213, playCount: 47,
                  dateAdded: Date(timeIntervalSince1970: 1_470_000_000))
        ])
        vm.decideWithoutPlayback(.remove)
        vm.removalPlaylistCreated = true
        let view = render(vm: vm)
        XCTAssertTrue(findAccessibilityElement(label: "Moved to Playlist", in: view),
                      "Moved to Playlist label should appear after playlist creation")
    }
}
