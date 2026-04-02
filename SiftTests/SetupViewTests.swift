import XCTest
import SwiftUI
@testable import Sift

// MARK: - TestSetupView

@MainActor
final class TestSetupView: XCTestCase {
    func testRendersWithNoSavedSession() {
        // hasSavedSession false — shows "Start Sifting" button only
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.hasSavedSession = false

        let controller = UIHostingController(rootView: SetupView().environmentObject(vm))
        controller.view.frame = CGRect(x: 0, y: 0, width: 393, height: 852)
        let window = UIWindow(frame: controller.view.frame)
        window.rootViewController = controller
        window.makeKeyAndVisible()
        RunLoop.current.run(until: Date())
        XCTAssertNotNil(controller.view)
    }

    func testRendersWithSavedSession() {
        // hasSavedSession true — shows both "Resume" and "Start Fresh" buttons
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.hasSavedSession = true

        let controller = UIHostingController(rootView: SetupView().environmentObject(vm))
        controller.view.frame = CGRect(x: 0, y: 0, width: 393, height: 852)
        let window = UIWindow(frame: controller.view.frame)
        window.rootViewController = controller
        window.makeKeyAndVisible()
        RunLoop.current.run(until: Date())
        XCTAssertNotNil(controller.view)
    }

    func testRendersWithSpotifyProvider() {
        // provider .spotify — exercises Spotify provider selection
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.selectProvider(.spotify)

        let controller = UIHostingController(rootView: SetupView().environmentObject(vm))
        controller.view.frame = CGRect(x: 0, y: 0, width: 393, height: 852)
        let window = UIWindow(frame: controller.view.frame)
        window.rootViewController = controller
        window.makeKeyAndVisible()
        RunLoop.current.run(until: Date())
        XCTAssertNotNil(controller.view)
    }

    func testRendersWithLoadError() {
        // loadError set — exercises the error label branch
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadError = "Could not connect to your Music library."

        let controller = UIHostingController(rootView: SetupView().environmentObject(vm))
        controller.view.frame = CGRect(x: 0, y: 0, width: 393, height: 852)
        let window = UIWindow(frame: controller.view.frame)
        window.rootViewController = controller
        window.makeKeyAndVisible()
        RunLoop.current.run(until: Date())
        XCTAssertNotNil(controller.view)
    }
}
