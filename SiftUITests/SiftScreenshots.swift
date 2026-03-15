import XCTest

/// Captures App Store screenshots using fastlane snapshot.
/// Run via: fastlane screenshots
/// Not included in the regular CI test run.
final class SiftScreenshots: XCTestCase {
    let app = XCUIApplication()

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
        app.launchArguments = ["--ui-testing"]
        // MainActor.assumeIsolated is safe here — XCTest always calls setUp on the main thread.
        MainActor.assumeIsolated { Snapshot.setupSnapshot(app) }
        app.launch()
    }

    override func tearDown() {
        app.terminate()
        super.tearDown()
    }

    func test01_SiftingView() {
        XCTAssertTrue(app.staticTexts["Mock Song One"].waitForExistence(timeout: 5))
        MainActor.assumeIsolated { Snapshot.snapshot("01_Sifting") }
    }

    func test02_SiftingWithProgress() {
        XCTAssertTrue(app.staticTexts["Mock Song One"].waitForExistence(timeout: 5))
        app.typeKey(XCUIKeyboardKey.leftArrow, modifierFlags: [])  // keep
        XCTAssertTrue(app.staticTexts["Mock Song Two"].waitForExistence(timeout: 5))
        MainActor.assumeIsolated { Snapshot.snapshot("02_SiftingProgress") }
    }

    func test03_PausedSummary() {
        XCTAssertTrue(app.staticTexts["Mock Song One"].waitForExistence(timeout: 5))
        app.typeKey(XCUIKeyboardKey.leftArrow, modifierFlags: [])  // keep
        XCTAssertTrue(app.staticTexts["Mock Song Two"].waitForExistence(timeout: 5))
        app.typeKey(XCUIKeyboardKey.rightArrow, modifierFlags: []) // remove
        XCTAssertTrue(app.staticTexts["Mock Song Three"].waitForExistence(timeout: 5))
        app.buttons.matching(identifier: "stop-button").firstMatch.click()
        XCTAssertTrue(app.buttons["Resume Session"].waitForExistence(timeout: 5))
        MainActor.assumeIsolated { Snapshot.snapshot("03_PausedSummary") }
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
        MainActor.assumeIsolated { Snapshot.snapshot("04_Done") }
    }
}
