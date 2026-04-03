import XCTest
import SwiftUI
@testable import Sift

// MARK: - TestCardView

@MainActor
final class TestCardView: XCTestCase {
    func testTrackNameVisible() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        let track = Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                          album: "The Definition", duration: 213, playCount: 47,
                          dateAdded: Date(timeIntervalSince1970: 1_470_000_000))
        vm.loadTracks([track])
        let view = renderInWindow(InteractiveCardView(track: track).environmentObject(vm))
        XCTAssertTrue(findAccessibilityElement(label: "All Time Low", in: view),
                      "Track name should be visible on card")
    }

    func testArtistNameVisible() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        let track = Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                          album: "The Definition", duration: 213, playCount: 47,
                          dateAdded: Date(timeIntervalSince1970: 1_470_000_000))
        vm.loadTracks([track])
        let view = renderInWindow(InteractiveCardView(track: track).environmentObject(vm))
        XCTAssertTrue(findAccessibilityElement(label: "Jon Bellion", in: view),
                      "Artist name should be visible on card")
    }

    func testAlbumNameVisible() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        let track = Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                          album: "The Definition", duration: 213, playCount: 47,
                          dateAdded: Date(timeIntervalSince1970: 1_470_000_000))
        vm.loadTracks([track])
        let view = renderInWindow(InteractiveCardView(track: track).environmentObject(vm))
        XCTAssertTrue(findAccessibilityElement(label: "The Definition", in: view),
                      "Album name should be visible on card")
    }

    func testPlayCountVisible() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        let track = Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                          album: "The Definition", duration: 213, playCount: 47,
                          dateAdded: Date(timeIntervalSince1970: 1_470_000_000))
        vm.loadTracks([track])
        let view = renderInWindow(InteractiveCardView(track: track).environmentObject(vm))
        XCTAssertTrue(findAccessibilityElement(label: "47 plays", in: view),
                      "Play count should be visible on card")
    }
}
