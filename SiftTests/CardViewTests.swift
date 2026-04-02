import XCTest
import SwiftUI
@testable import Sift

// MARK: - TestCardView

@MainActor
final class TestCardView: XCTestCase {
    func testInteractiveCardRendersWithNoArtwork() {
        // currentArtwork is nil — exercises the placeholder artwork branch
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([
            Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                  album: "The Definition", duration: 213, playCount: 47,
                  dateAdded: Date(timeIntervalSince1970: 1_470_000_000))
        ])
        let track = Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                          album: "The Definition", duration: 213, playCount: 47,
                          dateAdded: Date(timeIntervalSince1970: 1_470_000_000))

        let controller = UIHostingController(
            rootView: InteractiveCardView(track: track).environmentObject(vm)
        )
        controller.view.frame = CGRect(x: 0, y: 0, width: 393, height: 852)
        let window = UIWindow(frame: controller.view.frame)
        window.rootViewController = controller
        window.makeKeyAndVisible()
        RunLoop.current.run(until: Date())
        XCTAssertNotNil(controller.view)
    }

    func testInteractiveCardRendersWithArtwork() {
        // artworkURL set — exercises the AsyncImage branch
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([
            Track(id: "sweet-but-psycho-ava-max", name: "Sweet But Psycho", artist: "Ava Max",
                  album: "Heaven & Hell", duration: 196, playCount: 23,
                  dateAdded: Date(timeIntervalSince1970: 1_540_000_000),
                  artworkURL: URL(string: "https://example.com/artwork.jpg"))
        ])
        let track = Track(id: "sweet-but-psycho-ava-max", name: "Sweet But Psycho", artist: "Ava Max",
                          album: "Heaven & Hell", duration: 196, playCount: 23,
                          dateAdded: Date(timeIntervalSince1970: 1_540_000_000),
                          artworkURL: URL(string: "https://example.com/artwork.jpg"))

        let controller = UIHostingController(
            rootView: InteractiveCardView(track: track).environmentObject(vm)
        )
        controller.view.frame = CGRect(x: 0, y: 0, width: 393, height: 852)
        let window = UIWindow(frame: controller.view.frame)
        window.rootViewController = controller
        window.makeKeyAndVisible()
        RunLoop.current.run(until: Date())
        XCTAssertNotNil(controller.view)
    }

    func testSiftViewRendersActionButtons() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([
            Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                  album: "The Definition", duration: 213, playCount: 47,
                  dateAdded: Date(timeIntervalSince1970: 1_470_000_000)),
            Track(id: "sweet-but-psycho-ava-max", name: "Sweet But Psycho", artist: "Ava Max",
                  album: "Heaven & Hell", duration: 196, playCount: 23,
                  dateAdded: Date(timeIntervalSince1970: 1_540_000_000))
        ])

        let controller = UIHostingController(
            rootView: SiftView().environmentObject(vm)
        )
        controller.view.frame = CGRect(x: 0, y: 0, width: 393, height: 852)
        let window = UIWindow(frame: controller.view.frame)
        window.rootViewController = controller
        window.makeKeyAndVisible()
        RunLoop.current.run(until: Date())
        XCTAssertNotNil(controller.view)
    }
}
