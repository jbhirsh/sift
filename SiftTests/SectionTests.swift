import XCTest
@testable import Sift

// MARK: - TestSection

final class TestSection: XCTestCase {
    func testInitSetsAllProperties() {
        let section = Section(start: 68.0, label: "chorus", isChorus: true)
        XCTAssertEqual(section.start, 68.0)
        XCTAssertEqual(section.label, "chorus")
        XCTAssertTrue(section.isChorus)
        XCTAssertNotNil(section.id)
    }

    func testIsChorusFalseForNonChorusSection() {
        let section = Section(start: 0.0, label: "intro", isChorus: false)
        XCTAssertFalse(section.isChorus)
    }
}
