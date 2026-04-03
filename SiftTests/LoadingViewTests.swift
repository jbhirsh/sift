import XCTest
import SwiftUI
@testable import Sift

// MARK: - TestLoadingView

@MainActor
final class TestLoadingView: XCTestCase {
    func testBrandTextVisible() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.phase = .loading
        let view = renderInWindow(LoadingView().environmentObject(vm))
        XCTAssertTrue(findAccessibilityElement(label: "sift.", in: view),
                      "Brand text 'sift.' should be visible")
    }

    func testLoadMessageVisible() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.phase = .loading
        vm.loadMessage = "Connecting to Music…"
        let view = renderInWindow(LoadingView().environmentObject(vm))
        XCTAssertTrue(findAccessibilityElement(label: "Connecting", in: view),
                      "Load message should match vm.loadMessage")
    }

    func testLoadMessageUpdatesWithProgress() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.phase = .loading
        vm.loadProgress = 0.9
        vm.loadMessage = "Sorting 312 tracks…"
        let view = renderInWindow(LoadingView().environmentObject(vm))
        XCTAssertTrue(findAccessibilityElement(label: "Sorting", in: view),
                      "Load message should reflect sorting state")
    }
}
