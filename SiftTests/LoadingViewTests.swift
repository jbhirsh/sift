import XCTest
import SwiftUI
@testable import Sift

// MARK: - TestLoadingView

@MainActor
final class TestLoadingView: XCTestCase {
    private func render(vm: SiftViewModel) -> UIView {
        let controller = UIHostingController(rootView: LoadingView().environmentObject(vm))
        controller.view.frame = CGRect(x: 0, y: 0, width: 393, height: 852)
        let window = UIWindow(frame: controller.view.frame)
        window.rootViewController = controller
        window.makeKeyAndVisible()
        controller.view.layoutIfNeeded()
        RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.05))
        return controller.view
    }

    func testBrandTextVisible() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.phase = .loading
        let view = render(vm: vm)
        XCTAssertTrue(findAccessibilityElement(label: "sift.", in: view),
                      "Brand text 'sift.' should be visible")
    }

    func testLoadMessageVisible() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.phase = .loading
        vm.loadMessage = "Connecting to Music…"
        let view = render(vm: vm)
        XCTAssertTrue(findAccessibilityElement(label: "Connecting", in: view),
                      "Load message should match vm.loadMessage")
    }

    func testLoadMessageUpdatesWithProgress() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.phase = .loading
        vm.loadProgress = 0.9
        vm.loadMessage = "Sorting 312 tracks…"
        let view = render(vm: vm)
        XCTAssertTrue(findAccessibilityElement(label: "Sorting", in: view),
                      "Load message should reflect sorting state")
    }
}
