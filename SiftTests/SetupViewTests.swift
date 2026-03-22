import XCTest
import SwiftUI
import UIKit
@testable import Sift

// MARK: - TestSetupView

@MainActor
final class TestSetupView: XCTestCase {
    func testRendersWithNoSavedSession() throws {
        // hasSavedSession false — shows "Start Sifting" button only
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.hasSavedSession = false

        let scene = try XCTUnwrap(
            UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        )
        let window = UIWindow(windowScene: scene)
        let controller = UIHostingController(rootView: SetupView().environmentObject(vm))
        window.rootViewController = controller
        window.makeKeyAndVisible()
        controller.view.layoutIfNeeded()
        XCTAssertNotNil(controller.view)
        window.isHidden = true
    }

    func testRendersWithSavedSession() throws {
        // hasSavedSession true — shows both "Resume" and "Start Fresh" buttons
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.hasSavedSession = true

        let scene = try XCTUnwrap(
            UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        )
        let window = UIWindow(windowScene: scene)
        let controller = UIHostingController(rootView: SetupView().environmentObject(vm))
        window.rootViewController = controller
        window.makeKeyAndVisible()
        controller.view.layoutIfNeeded()
        XCTAssertNotNil(controller.view)
        window.isHidden = true
    }
}
