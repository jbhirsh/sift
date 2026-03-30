import XCTest
import SwiftUI
@testable import Sift

// MARK: - TestSiftApp

@MainActor
final class TestSiftApp: XCTestCase {
    func testRootContentViewRendersOnLaunch() {
        // Verifies that the app's root view (ContentView) renders in the setup phase
        // at the entry point established by SiftApp.
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        // default phase is .setup — same state the app starts in

        let controller = UIHostingController(rootView: ContentView().environmentObject(vm))
        controller.view.layoutIfNeeded()
        XCTAssertNotNil(controller.view)
    }
}
