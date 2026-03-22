import XCTest
import SwiftUI
import UIKit
@testable import Sift

// MARK: - TestLoadingView

@MainActor
final class TestLoadingView: XCTestCase {
    func testRendersAtZeroProgress() throws {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.phase = .loading
        vm.loadProgress = 0.0
        vm.loadMessage = "Connecting to Music…"

        let scene = try XCTUnwrap(
            UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        )
        let window = UIWindow(windowScene: scene)
        let controller = UIHostingController(rootView: LoadingView().environmentObject(vm))
        window.rootViewController = controller
        window.makeKeyAndVisible()
        controller.view.layoutIfNeeded()
        XCTAssertNotNil(controller.view)
        window.isHidden = true
    }

    func testRendersPartwayThroughLoad() throws {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.phase = .loading
        vm.loadProgress = 0.9
        vm.loadMessage = "Sorting 312 tracks…"

        let scene = try XCTUnwrap(
            UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        )
        let window = UIWindow(windowScene: scene)
        let controller = UIHostingController(rootView: LoadingView().environmentObject(vm))
        window.rootViewController = controller
        window.makeKeyAndVisible()
        controller.view.layoutIfNeeded()
        XCTAssertNotNil(controller.view)
        window.isHidden = true
    }
}
