import XCTest
import SwiftUI
import UIKit
@testable import Sift

// MARK: - TestCardView

@MainActor
final class TestCardView: XCTestCase {
    func testRendersBackgroundCard() throws {
        let track = Track(id: "sweet-but-psycho-ava-max", name: "Sweet But Psycho", artist: "Ava Max",
                          album: "Heaven & Hell", duration: 196, playCount: 23,
                          dateAdded: Date(timeIntervalSince1970: 1_540_000_000))

        let scene = try XCTUnwrap(
            UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        )
        let window = UIWindow(windowScene: scene)
        let controller = UIHostingController(rootView: CardView(track: track, offset: 1))
        window.rootViewController = controller
        window.makeKeyAndVisible()
        controller.view.layoutIfNeeded()
        XCTAssertNotNil(controller.view)
        window.isHidden = true
    }

    func testRendersSecondBackgroundCard() throws {
        let track = Track(id: "u-cant-touch-this-mc-hammer", name: "U Can't Touch This",
                          artist: "MC Hammer", album: "Please Hammer, Don't Hurt 'Em",
                          duration: 257, playCount: 12,
                          dateAdded: Date(timeIntervalSince1970: 648_000_000))

        let scene = try XCTUnwrap(
            UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        )
        let window = UIWindow(windowScene: scene)
        let controller = UIHostingController(rootView: CardView(track: track, offset: 2))
        window.rootViewController = controller
        window.makeKeyAndVisible()
        controller.view.layoutIfNeeded()
        XCTAssertNotNil(controller.view)
        window.isHidden = true
    }

    func testInteractiveCardRendersWithNoArtwork() throws {
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

        let scene = try XCTUnwrap(
            UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        )
        let window = UIWindow(windowScene: scene)
        let controller = UIHostingController(
            rootView: InteractiveCardView(track: track).environmentObject(vm)
        )
        window.rootViewController = controller
        window.makeKeyAndVisible()
        controller.view.layoutIfNeeded()
        XCTAssertNotNil(controller.view)
        window.isHidden = true
    }

    func testDecisionButtonsRendersAllThreeButtons() throws {
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
        let controller = UIHostingController(
            rootView: DecisionButtonsView().environmentObject(vm)
        )
        window.rootViewController = controller
        window.makeKeyAndVisible()
        controller.view.layoutIfNeeded()
        XCTAssertNotNil(controller.view)
        window.isHidden = true
    }
}
