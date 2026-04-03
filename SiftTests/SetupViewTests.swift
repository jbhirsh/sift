import XCTest
import SwiftUI
@testable import Sift

// MARK: - TestSetupView

@MainActor
final class TestSetupView: XCTestCase {
    func testBrandTextVisible() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        let view = renderInWindow(SetupView().environmentObject(vm))
        XCTAssertTrue(findAccessibilityElement(label: "sift.", in: view),
                      "Brand text 'sift.' should be visible")
    }

    func testStartSiftingButtonVisibleWithNoSavedSession() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.hasSavedSession = false
        let view = renderInWindow(SetupView().environmentObject(vm))
        XCTAssertTrue(findAccessibilityElement(label: "Start Sifting", in: view),
                      "Start Sifting button should be visible when no saved session")
        XCTAssertTrue(accessibilityElementAbsent(label: "Resume Previous Session", in: view),
                      "Resume Previous Session should NOT be visible when no saved session")
    }

    func testResumeAndStartFreshVisibleWithSavedSession() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.hasSavedSession = true
        let view = renderInWindow(SetupView().environmentObject(vm))
        XCTAssertTrue(findAccessibilityElement(label: "Resume Previous Session", in: view),
                      "Resume Previous Session should be visible with saved session")
        XCTAssertTrue(findAccessibilityElement(label: "Start Fresh", in: view),
                      "Start Fresh should be visible with saved session")
    }

    func testErrorMessageVisibleWhenLoadErrorSet() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadError = "Could not connect to your Music library."
        let view = renderInWindow(SetupView().environmentObject(vm))
        XCTAssertTrue(findAccessibilityElement(label: "Could not connect", in: view),
                      "Error message should be visible when loadError is set")
    }

    func testErrorMessageAbsentWhenNoError() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadError = nil
        let view = renderInWindow(SetupView().environmentObject(vm))
        XCTAssertTrue(accessibilityElementAbsent(label: "Could not connect", in: view),
                      "Error message should NOT be visible when no error")
    }
}
