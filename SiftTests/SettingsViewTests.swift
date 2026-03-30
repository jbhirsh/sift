import XCTest
import SwiftUI
@testable import Sift

// MARK: - TestSettingsView

@MainActor
final class TestSettingsView: XCTestCase {
    func testBodyRendersWithoutCrashing() {
        let controller = UIHostingController(rootView: SettingsView())
        controller.view.layoutIfNeeded()
        XCTAssertNotNil(controller.view)
    }
}
