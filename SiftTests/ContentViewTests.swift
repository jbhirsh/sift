import XCTest
import SwiftUI
@testable import Sift

// MARK: - TestContentView

@MainActor
final class TestContentView: XCTestCase {
    override func tearDown() {
        SessionStore().clear()
        super.tearDown()
    }

    // MARK: - Settings button visibility per phase

    func testSettingsButtonHiddenDuringSetup() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        let view = renderInWindow(ContentView().environmentObject(vm))
        XCTAssertTrue(accessibilityElementAbsent(label: "gearshape", in: view),
                      "Settings button should NOT be visible during setup phase")
    }

    func testSettingsButtonVisibleDuringLoading() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.phase = .loading
        let view = renderInWindow(ContentView().environmentObject(vm))
        XCTAssertTrue(findAccessibilityElement(label: "gearshape", in: view),
                      "Settings button should be visible during loading phase")
    }

    func testSettingsButtonVisibleDuringSifting() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([
            Track(id: "t1", name: "Song", artist: "Artist",
                  album: "Album", duration: 200, playCount: 5,
                  dateAdded: Date(timeIntervalSince1970: 1_500_000_000))
        ])
        let view = renderInWindow(ContentView().environmentObject(vm))
        XCTAssertTrue(findAccessibilityElement(label: "gearshape", in: view),
                      "Settings button should be visible during sifting phase")
    }

    func testSettingsButtonVisibleWhenDone() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([
            Track(id: "t1", name: "Song", artist: "Artist",
                  album: "Album", duration: 200, playCount: 5,
                  dateAdded: Date(timeIntervalSince1970: 1_500_000_000))
        ])
        vm.decideWithoutPlayback(.keep)
        let view = renderInWindow(ContentView().environmentObject(vm))
        XCTAssertTrue(findAccessibilityElement(label: "gearshape", in: view),
                      "Settings button should be visible on done screen")
    }

    func testSettingsButtonVisibleWhenPaused() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([
            Track(id: "t1", name: "Song", artist: "Artist",
                  album: "Album", duration: 200, playCount: 5,
                  dateAdded: Date(timeIntervalSince1970: 1_500_000_000)),
            Track(id: "t2", name: "Song2", artist: "Artist",
                  album: "Album", duration: 200, playCount: 5,
                  dateAdded: Date(timeIntervalSince1970: 1_500_000_000))
        ])
        vm.decideWithoutPlayback(.keep)
        vm.stopSession()
        let view = renderInWindow(ContentView().environmentObject(vm))
        XCTAssertTrue(findAccessibilityElement(label: "gearshape", in: view),
                      "Settings button should be visible on paused screen")
    }
}
