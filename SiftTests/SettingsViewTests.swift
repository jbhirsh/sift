import XCTest
import SwiftUI
import UIKit
@testable import Sift

// MARK: - TestSettingsView

@MainActor
final class TestSettingsView: XCTestCase {
    func testBodyRendersWithoutCrashing() throws {
        let scene = try XCTUnwrap(
            UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        )
        let window = UIWindow(windowScene: scene)
        let controller = UIHostingController(rootView: SettingsView())
        window.rootViewController = controller
        window.makeKeyAndVisible()
        controller.view.layoutIfNeeded()
        XCTAssertNotNil(controller.view)
        window.isHidden = true
    }
}
