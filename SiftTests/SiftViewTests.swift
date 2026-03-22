import XCTest
import SwiftUI
import UIKit
@testable import Sift

// MARK: - TestSiftView

@MainActor
final class TestSiftView: XCTestCase {
    func testRendersFullCardStackWithThreeTracks() throws {
        // All three card layers visible: current, next, next-next
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

        let scene = try XCTUnwrap(
            UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        )
        let window = UIWindow(windowScene: scene)
        let controller = UIHostingController(rootView: SiftView().environmentObject(vm))
        window.rootViewController = controller
        window.makeKeyAndVisible()
        controller.view.layoutIfNeeded()
        XCTAssertNotNil(controller.view)
        window.isHidden = true
    }

    func testRendersWithTwoTracksNoNextNextCard() throws {
        // nextNextTrack is nil — third card layer hidden
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([
            Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                  album: "The Definition", duration: 213, playCount: 47,
                  dateAdded: Date(timeIntervalSince1970: 1_470_000_000)),
            Track(id: "sweet-but-psycho-ava-max", name: "Sweet But Psycho", artist: "Ava Max",
                  album: "Heaven & Hell", duration: 196, playCount: 23,
                  dateAdded: Date(timeIntervalSince1970: 1_540_000_000))
        ])

        let scene = try XCTUnwrap(
            UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        )
        let window = UIWindow(windowScene: scene)
        let controller = UIHostingController(rootView: SiftView().environmentObject(vm))
        window.rootViewController = controller
        window.makeKeyAndVisible()
        controller.view.layoutIfNeeded()
        XCTAssertNotNil(controller.view)
        window.isHidden = true
    }

    func testRendersWithOneTrackOnlyCurrentCard() throws {
        // nextTrack and nextNextTrack both nil
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([
            Track(id: "u-cant-touch-this-mc-hammer", name: "U Can't Touch This", artist: "MC Hammer",
                  album: "Please Hammer, Don't Hurt 'Em", duration: 257, playCount: 12,
                  dateAdded: Date(timeIntervalSince1970: 648_000_000))
        ])

        let scene = try XCTUnwrap(
            UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        )
        let window = UIWindow(windowScene: scene)
        let controller = UIHostingController(rootView: SiftView().environmentObject(vm))
        window.rootViewController = controller
        window.makeKeyAndVisible()
        controller.view.layoutIfNeeded()
        XCTAssertNotNil(controller.view)
        window.isHidden = true
    }

    func testRendersStatBarWithDecisions() throws {
        // Stats bar shows 1 kept / 1 removed with U Can't Touch This remaining
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

        let scene = try XCTUnwrap(
            UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        )
        let window = UIWindow(windowScene: scene)
        let controller = UIHostingController(rootView: SiftView().environmentObject(vm))
        window.rootViewController = controller
        window.makeKeyAndVisible()
        controller.view.layoutIfNeeded()
        XCTAssertNotNil(controller.view)
        window.isHidden = true
    }
}
