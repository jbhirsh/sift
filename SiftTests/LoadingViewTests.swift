import XCTest
import SwiftUI
@testable import Sift

// MARK: - TestLoadingView

@MainActor
final class TestLoadingView: XCTestCase {
    func testRendersAtZeroProgress() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.phase = .loading
        vm.loadProgress = 0.0
        vm.loadMessage = "Connecting to Music…"

        let controller = UIHostingController(rootView: LoadingView().environmentObject(vm))
        controller.view.layoutIfNeeded()
        XCTAssertNotNil(controller.view)
    }

    func testRendersPartwayThroughLoad() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.phase = .loading
        vm.loadProgress = 0.9
        vm.loadMessage = "Sorting 312 tracks…"

        let controller = UIHostingController(rootView: LoadingView().environmentObject(vm))
        controller.view.layoutIfNeeded()
        XCTAssertNotNil(controller.view)
    }
}
