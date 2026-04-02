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
        controller.view.frame = CGRect(x: 0, y: 0, width: 393, height: 852)
        let window = UIWindow(frame: controller.view.frame)
        window.rootViewController = controller
        window.makeKeyAndVisible()
        RunLoop.current.run(until: Date())
        XCTAssertNotNil(controller.view)
    }

    func testRendersPartwayThroughLoad() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.phase = .loading
        vm.loadProgress = 0.9
        vm.loadMessage = "Sorting 312 tracks…"

        let controller = UIHostingController(rootView: LoadingView().environmentObject(vm))
        controller.view.frame = CGRect(x: 0, y: 0, width: 393, height: 852)
        let window = UIWindow(frame: controller.view.frame)
        window.rootViewController = controller
        window.makeKeyAndVisible()
        RunLoop.current.run(until: Date())
        XCTAssertNotNil(controller.view)
    }
}
