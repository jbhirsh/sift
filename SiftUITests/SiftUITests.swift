import XCTest

final class SiftUITests: XCTestCase {
    let app = XCUIApplication()

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
        app.launchArguments = ["--ui-testing"]
        app.launch()
    }

    override func tearDown() {
        app.terminate()
        super.tearDown()
    }

    // MARK: - Helpers

    @discardableResult
    private func waitForTrack(_ name: String, timeout: TimeInterval = 5) -> Bool {
        app.staticTexts[name].waitForExistence(timeout: timeout)
    }

    /// Wait for a stat label to show a specific value using XCTest's native predicate waiter.
    /// On macOS, SwiftUI Text inside .background(.bar) reports content via `value`, not `label`.
    private func waitForStatLabel(_ identifier: String, label expectedValue: String, timeout: TimeInterval = 5) {
        let stat = app.staticTexts.matching(identifier: identifier).firstMatch
        let predicate = NSPredicate { _, _ in
            stat.exists && (stat.value as? String) == expectedValue
        }
        let expectation = XCTNSPredicateExpectation(predicate: predicate, object: nil)
        let result = XCTWaiter().wait(for: [expectation], timeout: timeout)
        XCTAssertEqual(result, .completed, "Stat '\(identifier)' did not show '\(expectedValue)' within \(timeout)s")
    }

    private func waitForDoneScreen(timeout: TimeInterval = 10) -> Bool {
        app.descendants(matching: .any)
            .matching(NSPredicate(format: "identifier == 'done-title'"))
            .firstMatch
            .waitForExistence(timeout: timeout)
    }

    /// Keep current track (left arrow shortcut).
    private func keep() { app.typeKey(XCUIKeyboardKey.leftArrow, modifierFlags: []) }

    /// Skip current track ('s' keyboard shortcut).
    private func skip() { app.typeKey("s", modifierFlags: []) }

    /// Remove current track (right arrow shortcut).
    private func remove() { app.typeKey(XCUIKeyboardKey.rightArrow, modifierFlags: []) }

    /// Navigate to the done screen by deciding all three mock tracks.
    /// Waits for each card to advance before issuing the next decision.
    private func decideAllTracks() {
        XCTAssertTrue(waitForTrack("Mock Song One"))
        keep()
        XCTAssertTrue(waitForTrack("Mock Song Two"))
        skip()
        XCTAssertTrue(waitForTrack("Mock Song Three"))
        remove()
        app.activate()
    }

    // MARK: - Sifting view (mock data loads immediately in --ui-testing mode)

    func testSiftingViewShowsTrackName() {
        XCTAssertTrue(app.staticTexts["Mock Song One"].waitForExistence(timeout: 5))
    }

    func testSiftingViewShowsArtistName() {
        XCTAssertTrue(app.staticTexts["Artist A"].waitForExistence(timeout: 5))
    }

    func testSiftingViewShowsRemainingCount() {
        XCTAssertTrue(waitForTrack("Mock Song One"))
        XCTAssertTrue(
            app.staticTexts.matching(identifier: "remaining-count").firstMatch
                .waitForExistence(timeout: 3)
        )
    }

    func testKeepButtonExists() {
        XCTAssertTrue(app.buttons["Keep"].waitForExistence(timeout: 5))
    }

    func testSkipButtonExists() {
        XCTAssertTrue(app.buttons["Skip"].waitForExistence(timeout: 5))
    }

    func testRemoveButtonExists() {
        XCTAssertTrue(app.buttons["Remove"].waitForExistence(timeout: 5))
    }

    func testKeepAdvancesToNextTrack() {
        XCTAssertTrue(waitForTrack("Mock Song One"))
        keep()
        waitForStatLabel("stat-kept", label: "1 kept")
    }

    func testSkipAdvancesToNextTrack() {
        XCTAssertTrue(waitForTrack("Mock Song One"))
        skip()
        waitForStatLabel("stat-skipped", label: "1 skipped")
    }

    func testRemoveAdvancesToNextTrack() {
        XCTAssertTrue(waitForTrack("Mock Song One"))
        remove()
        waitForStatLabel("stat-removed", label: "1 removed")
    }

    func testKeptCountUpdatesAfterKeep() {
        XCTAssertTrue(waitForTrack("Mock Song One"))
        keep()
        waitForStatLabel("stat-kept", label: "1 kept")
    }

    func testRemovedCountUpdatesAfterRemove() {
        XCTAssertTrue(waitForTrack("Mock Song One"))
        remove()
        waitForStatLabel("stat-removed", label: "1 removed")
    }

    func testSkippedCountUpdatesAfterSkip() {
        XCTAssertTrue(waitForTrack("Mock Song One"))
        skip()
        waitForStatLabel("stat-skipped", label: "1 skipped")
    }

    // MARK: - Full flow to done screen

    func testDecidingAllTracksShowsDoneScreen() {
        decideAllTracks()
        XCTAssertTrue(waitForDoneScreen(), "Done screen not found. App tree:\n\(app.debugDescription)")
    }

    func testDoneScreenShowsSummaryCounts() {
        decideAllTracks()
        XCTAssertTrue(waitForDoneScreen())
        XCTAssertTrue(
            app.staticTexts.matching(identifier: "summary-label-kept").firstMatch
                .waitForExistence(timeout: 3)
        )
        XCTAssertTrue(
            app.staticTexts.matching(identifier: "summary-label-skipped").firstMatch
                .waitForExistence(timeout: 3)
        )
        XCTAssertTrue(
            app.staticTexts.matching(identifier: "summary-label-to remove").firstMatch
                .waitForExistence(timeout: 3)
        )
    }

    func testDoneScreenShowsMoveToPlaylistButton() {
        decideAllTracks()
        XCTAssertTrue(waitForDoneScreen())
        XCTAssertTrue(
            app.buttons.matching(NSPredicate(format: "label CONTAINS 'Move to Playlist'"))
                .firstMatch.waitForExistence(timeout: 3)
        )
    }

    func testStartOverReturnsToSiftingView() {
        decideAllTracks()
        XCTAssertTrue(waitForDoneScreen())
        app.buttons["Start Over"].click()
        XCTAssertTrue(app.staticTexts["Mock Song One"].waitForExistence(timeout: 5))
    }

    // MARK: - Stop session

    func testStopButtonExists() {
        XCTAssertTrue(waitForTrack("Mock Song One"))
        XCTAssertTrue(app.buttons.matching(identifier: "stop-button").firstMatch.waitForExistence(timeout: 3))
    }

    func testStopButtonReturnsToSetupWithResumeOption() {
        XCTAssertTrue(waitForTrack("Mock Song One"))
        keep()
        XCTAssertTrue(waitForTrack("Mock Song Two"))
        app.buttons.matching(identifier: "stop-button").firstMatch.click()
        XCTAssertTrue(app.buttons["Resume Previous Session"].waitForExistence(timeout: 3),
                      "Resume button not shown after Save & Pause")
    }

    func testResumeAfterStopReturnsToSiftingView() {
        XCTAssertTrue(waitForTrack("Mock Song One"))
        keep()
        XCTAssertTrue(waitForTrack("Mock Song Two"))
        app.buttons.matching(identifier: "stop-button").firstMatch.click()
        XCTAssertTrue(app.buttons["Resume Previous Session"].waitForExistence(timeout: 3))
        app.buttons["Resume Previous Session"].click()
        XCTAssertTrue(waitForTrack("Mock Song Two"), "Did not resume at next track after Save & Pause")
    }
}
