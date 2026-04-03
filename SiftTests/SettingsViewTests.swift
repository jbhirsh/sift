import XCTest
import SwiftUI
@testable import Sift

// MARK: - TestSettingsView

@MainActor
final class TestSettingsView: XCTestCase {
    // MARK: - Provider name

    func testDisplaysAppleMusicProviderName() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        let view = renderInWindow(SettingsView().environmentObject(vm))
        XCTAssertTrue(
            findAccessibilityElement(label: "Apple Music", in: view),
            "Should display Apple Music provider name"
        )
    }

    func testDisplaysSpotifyProviderName() {
        let vm = SiftViewModel(
            playlistService: MockPlaylistService(),
            provider: .spotify
        )
        let view = renderInWindow(SettingsView().environmentObject(vm))
        XCTAssertTrue(
            findAccessibilityElement(label: "Spotify", in: view),
            "Should display Spotify provider name"
        )
    }

    // MARK: - Connection status text

    func testConnectionStatusShowsConnectedWhenConnected() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.connectionStatus = .connected
        let view = renderInWindow(SettingsView().environmentObject(vm))
        XCTAssertTrue(
            findAccessibilityElement(label: "Connected", in: view),
            "Should show 'Connected' when status is connected"
        )
    }

    func testConnectionStatusShowsNotConnectedWhenDisconnected() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.connectionStatus = .disconnected
        let view = renderInWindow(SettingsView().environmentObject(vm))
        XCTAssertTrue(
            findAccessibilityElement(label: "Not connected", in: view),
            "Should show 'Not connected' when disconnected"
        )
    }

    // MARK: - Check Connection button

    func testCheckConnectionButtonExists() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        let view = renderInWindow(SettingsView().environmentObject(vm))
        XCTAssertTrue(
            findAccessibilityElement(label: "Check Connection", in: view),
            "Check Connection button should exist"
        )
    }

    // MARK: - Version text

    func testVersionTextVisible() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        let view = renderInWindow(SettingsView().environmentObject(vm))
        XCTAssertTrue(
            findAccessibilityElement(label: "Version 1.0.0", in: view),
            "Version text should be visible"
        )
    }
}
