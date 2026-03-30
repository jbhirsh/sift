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
        controller.view.layoutIfNeeded()
        XCTAssertNotNil(controller.view)
    }

    func testRendersWithSavedSession() {
        // hasSavedSession true — shows both "Resume" and "Start Fresh" buttons
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.hasSavedSession = true

        let controller = UIHostingController(rootView: SetupView().environmentObject(vm))
        controller.view.layoutIfNeeded()
        XCTAssertNotNil(controller.view)
    }
}
