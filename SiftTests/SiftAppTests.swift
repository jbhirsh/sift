import XCTest
import SwiftUI
import UIKit
@testable import Sift

// MARK: - TestSiftApp

@MainActor
final class TestSiftApp: XCTestCase {
    func testRootContentViewRendersOnLaunch() throws {
        // Verifies that the app's root view (ContentView) renders in the setup phase
        // at the entry point established by SiftApp.
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        // default phase is .setup — same state the app starts in

        let scene = try XCTUnwrap(
            UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        )
        let window = UIWindow(windowScene: scene)
        let controller = UIHostingController(rootView: ContentView().environmentObject(vm))
        window.rootViewController = controller
        window.makeKeyAndVisible()
        controller.view.layoutIfNeeded()
        XCTAssertNotNil(controller.view)
        window.isHidden = true
    }
}
