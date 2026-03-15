import XCTest

/// Captures App Store screenshots.
/// Run via: fastlane screenshots
/// Not included in the regular CI test run.
final class SiftScreenshots: XCTestCase {
    let app = XCUIApplication()

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
        app.launchArguments = ["--ui-testing"]
        setupSnapshot(app)
        app.launch()
    }

    override func tearDown() {
        app.terminate()
        super.tearDown()
    }

    // MARK: - Screenshot tests

    func test01_SiftingView() {
        XCTAssertTrue(app.staticTexts["Mock Song One"].waitForExistence(timeout: 5))
        snapshot("01_Sifting")
    }

    func test02_SiftingWithProgress() {
        XCTAssertTrue(app.staticTexts["Mock Song One"].waitForExistence(timeout: 5))
        app.buttons["Keep"].tap()
        XCTAssertTrue(app.staticTexts["Mock Song Two"].waitForExistence(timeout: 5))
        snapshot("02_SiftingProgress")
    }

    func test03_PausedSummary() {
        XCTAssertTrue(app.staticTexts["Mock Song One"].waitForExistence(timeout: 5))
        app.buttons["Keep"].tap()
        XCTAssertTrue(app.staticTexts["Mock Song Two"].waitForExistence(timeout: 5))
        app.buttons["Remove"].tap()
        XCTAssertTrue(app.staticTexts["Mock Song Three"].waitForExistence(timeout: 5))
        app.buttons.matching(identifier: "stop-button").firstMatch.tap()
        XCTAssertTrue(app.buttons["Resume Session"].waitForExistence(timeout: 5))
        snapshot("03_PausedSummary")
    }

    func test04_DoneScreen() {
        XCTAssertTrue(app.staticTexts["Mock Song One"].waitForExistence(timeout: 5))
        app.buttons["Keep"].tap()
        XCTAssertTrue(app.staticTexts["Mock Song Two"].waitForExistence(timeout: 5))
        app.buttons["Skip"].tap()
        XCTAssertTrue(app.staticTexts["Mock Song Three"].waitForExistence(timeout: 5))
        app.buttons["Remove"].tap()
        XCTAssertTrue(
            app.descendants(matching: .any)
                .matching(NSPredicate(format: "identifier == 'done-title'"))
                .firstMatch.waitForExistence(timeout: 10)
        )
        snapshot("04_Done")
    }
}
