import XCTest
import SwiftUI
@testable import Sift

// MARK: - TestSettingsView

@MainActor
final class TestSettingsView: XCTestCase {
    func testBodyRendersWithoutCrashing() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        let controller = UIHostingController(
            rootView: SettingsView().environmentObject(vm)
        )
        controller.view.frame = CGRect(x: 0, y: 0, width: 393, height: 852)
        let window = UIWindow(frame: controller.view.frame)
        window.rootViewController = controller
        window.makeKeyAndVisible()
        RunLoop.current.run(until: Date())
        XCTAssertNotNil(controller.view)
    }

    func testRendersWithSpotifyProvider() {
        let vm = SiftViewModel(playlistService: MockPlaylistService(), provider: .spotify)
        let controller = UIHostingController(
            rootView: SettingsView().environmentObject(vm)
        )
        controller.view.frame = CGRect(x: 0, y: 0, width: 393, height: 852)
        let window = UIWindow(frame: controller.view.frame)
        window.rootViewController = controller
        window.makeKeyAndVisible()
        RunLoop.current.run(until: Date())
        XCTAssertNotNil(controller.view)
    }

    func testRendersWithConnectedStatus() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.connectionStatus = .connected
        let controller = UIHostingController(
            rootView: SettingsView().environmentObject(vm)
        )
        controller.view.frame = CGRect(x: 0, y: 0, width: 393, height: 852)
        let window = UIWindow(frame: controller.view.frame)
        window.rootViewController = controller
        window.makeKeyAndVisible()
        RunLoop.current.run(until: Date())
        XCTAssertNotNil(controller.view)
    }

    func testRendersWithDisconnectedStatus() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.connectionStatus = .disconnected
        let controller = UIHostingController(
            rootView: SettingsView().environmentObject(vm)
        )
        controller.view.frame = CGRect(x: 0, y: 0, width: 393, height: 852)
        let window = UIWindow(frame: controller.view.frame)
        window.rootViewController = controller
        window.makeKeyAndVisible()
        RunLoop.current.run(until: Date())
        XCTAssertNotNil(controller.view)
    }
}
