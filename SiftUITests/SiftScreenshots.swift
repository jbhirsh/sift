import XCTest

/// Captures App Store screenshots.
/// Run via: fastlane screenshots
/// Not included in the regular CI test run.
final class SiftScreenshots: XCTestCase {
    let app = XCUIApplication()

    private static let screenshotDir = URL(fileURLWithPath: "/tmp/SiftScreenshots")

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

    // MARK: - Screenshot helper

    private func saveScreenshot(named name: String) {
        let screenshot = XCUIScreen.main.screenshot()

        // Attach to test result for Xcode visibility
        let attachment = XCTAttachment(screenshot: screenshot)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)

        // Save PNG to disk for Fastfile collection
        try? FileManager.default.createDirectory(
            at: Self.screenshotDir, withIntermediateDirectories: true)
        let dest = Self.screenshotDir.appendingPathComponent("\(name).png")
        try? screenshot.pngRepresentation.write(to: dest)
    }

    // MARK: - Screenshot tests

    func test01_SiftingView() {
        XCTAssertTrue(app.staticTexts["Mock Song One"].waitForExistence(timeout: 5))
        saveScreenshot(named: "01_Sifting")
    }

    func test02_SiftingWithProgress() {
        XCTAssertTrue(app.staticTexts["Mock Song One"].waitForExistence(timeout: 5))
        app.typeKey(XCUIKeyboardKey.leftArrow, modifierFlags: [])  // keep
        XCTAssertTrue(app.staticTexts["Mock Song Two"].waitForExistence(timeout: 5))
        saveScreenshot(named: "02_SiftingProgress")
    }

    func test03_PausedSummary() {
        XCTAssertTrue(app.staticTexts["Mock Song One"].waitForExistence(timeout: 5))
        app.typeKey(XCUIKeyboardKey.leftArrow, modifierFlags: [])  // keep
        XCTAssertTrue(app.staticTexts["Mock Song Two"].waitForExistence(timeout: 5))
        app.typeKey(XCUIKeyboardKey.rightArrow, modifierFlags: []) // remove
        XCTAssertTrue(app.staticTexts["Mock Song Three"].waitForExistence(timeout: 5))
        app.buttons.matching(identifier: "stop-button").firstMatch.click()
        XCTAssertTrue(app.buttons["Resume Session"].waitForExistence(timeout: 5))
        saveScreenshot(named: "03_PausedSummary")
    }

    func test04_DoneScreen() {
        XCTAssertTrue(app.staticTexts["Mock Song One"].waitForExistence(timeout: 5))
        app.typeKey(XCUIKeyboardKey.leftArrow, modifierFlags: [])  // keep
        XCTAssertTrue(app.staticTexts["Mock Song Two"].waitForExistence(timeout: 5))
        app.typeKey("s", modifierFlags: [])                        // skip
        XCTAssertTrue(app.staticTexts["Mock Song Three"].waitForExistence(timeout: 5))
        app.typeKey(XCUIKeyboardKey.rightArrow, modifierFlags: []) // remove
        XCTAssertTrue(
            app.descendants(matching: .any)
                .matching(NSPredicate(format: "identifier == 'done-title'"))
                .firstMatch.waitForExistence(timeout: 10)
        )
        saveScreenshot(named: "04_Done")
    }
}
