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

    func testRendersSetupPhase() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        // default phase is .setup

        let controller = UIHostingController(rootView: ContentView().environmentObject(vm))
        controller.view.frame = CGRect(x: 0, y: 0, width: 393, height: 852)
        let window = UIWindow(frame: controller.view.frame)
        window.rootViewController = controller
        window.makeKeyAndVisible()
        RunLoop.current.run(until: Date())
        XCTAssertNotNil(controller.view)
    }

    func testRendersLoadingPhase() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.phase = .loading
        vm.loadProgress = 0.5
        vm.loadMessage = "Loading library…"

        let controller = UIHostingController(rootView: ContentView().environmentObject(vm))
        controller.view.frame = CGRect(x: 0, y: 0, width: 393, height: 852)
        let window = UIWindow(frame: controller.view.frame)
        window.rootViewController = controller
        window.makeKeyAndVisible()
        RunLoop.current.run(until: Date())
        XCTAssertNotNil(controller.view)
    }

    func testRendersSiftingPhase() {
        // loadTracks sets phase to .sifting
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([
            Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                  album: "The Definition", duration: 213, playCount: 47,
                  dateAdded: Date(timeIntervalSince1970: 1_470_000_000)),
            Track(id: "sweet-but-psycho-ava-max", name: "Sweet But Psycho", artist: "Ava Max",
                  album: "Heaven & Hell", duration: 196, playCount: 23,
                  dateAdded: Date(timeIntervalSince1970: 1_540_000_000))
        ])

        let controller = UIHostingController(rootView: ContentView().environmentObject(vm))
        controller.view.frame = CGRect(x: 0, y: 0, width: 393, height: 852)
        let window = UIWindow(frame: controller.view.frame)
        window.rootViewController = controller
        window.makeKeyAndVisible()
        RunLoop.current.run(until: Date())
        XCTAssertNotNil(controller.view)
    }

    func testRendersDonePhase() {
        // Deciding on the only track exhausts the library — phase becomes .done
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([
            Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                  album: "The Definition", duration: 213, playCount: 47,
                  dateAdded: Date(timeIntervalSince1970: 1_470_000_000))
        ])
        vm.decideWithoutPlayback(.keep)

        let controller = UIHostingController(rootView: ContentView().environmentObject(vm))
        controller.view.frame = CGRect(x: 0, y: 0, width: 393, height: 852)
        let window = UIWindow(frame: controller.view.frame)
        window.rootViewController = controller
        window.makeKeyAndVisible()
        RunLoop.current.run(until: Date())
        XCTAssertNotNil(controller.view)
    }

    func testRendersPausedPhase() {
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
        vm.stopSession()                    // phase becomes .paused

        let controller = UIHostingController(rootView: ContentView().environmentObject(vm))
        controller.view.frame = CGRect(x: 0, y: 0, width: 393, height: 852)
        let window = UIWindow(frame: controller.view.frame)
        window.rootViewController = controller
        window.makeKeyAndVisible()
        RunLoop.current.run(until: Date())
        XCTAssertNotNil(controller.view)
    }

}
