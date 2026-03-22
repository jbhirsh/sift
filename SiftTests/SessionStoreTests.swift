import XCTest
@testable import Sift

// MARK: - TestSessionStore

final class TestSessionStore: XCTestCase {
    private var store: SessionStore!
    private var tempURL: URL!

    override func setUp() {
        super.setUp()
        tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try? FileManager.default.createDirectory(at: tempURL, withIntermediateDirectories: true)
        store = SessionStore(directory: tempURL)
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: tempURL)
        super.tearDown()
    }

    func testSaveAndLoad() {
        let session = SiftSession(
            tracks: [
                Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                      album: "The Definition", duration: 213, playCount: 47,
                      dateAdded: Date(timeIntervalSince1970: 1_470_000_000)),
                Track(id: "sweet-but-psycho-ava-max", name: "Sweet But Psycho", artist: "Ava Max",
                      album: "Heaven & Hell", duration: 196, playCount: 23,
                      dateAdded: Date(timeIntervalSince1970: 1_540_000_000))
            ],
            cursor: 1,
            kept: [Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                         album: "The Definition", duration: 213, playCount: 47,
                         dateAdded: Date(timeIntervalSince1970: 1_470_000_000))],
            removed: [], skipped: [],
            sortOrder: .newest, savedAt: Date()
        )
        store.save(session)
        let loaded = store.load()

        XCTAssertNotNil(loaded)
        XCTAssertEqual(loaded?.tracks.count, 2)
        XCTAssertEqual(loaded?.tracks.first?.name, "All Time Low")
        XCTAssertEqual(loaded?.cursor, 1)
        XCTAssertEqual(loaded?.sortOrder, .newest)
    }

    func testClearRemovesSession() {
        store.save(SiftSession(
            tracks: [Track(id: "u-cant-touch-this-mc-hammer", name: "U Can't Touch This",
                           artist: "MC Hammer", album: "Please Hammer, Don't Hurt 'Em",
                           duration: 257, playCount: 12,
                           dateAdded: Date(timeIntervalSince1970: 648_000_000))],
            cursor: 0, kept: [], removed: [], skipped: [],
            sortOrder: .leastPlayed, savedAt: Date()
        ))
        store.clear()
        XCTAssertFalse(store.exists)
        XCTAssertNil(store.load())
    }

    func testExistsReturnsFalseWhenNoSession() {
        XCTAssertFalse(store.exists)
    }

    func testExistsReturnsTrueAfterSave() {
        store.save(SiftSession(
            tracks: [Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                           album: "The Definition", duration: 213, playCount: 47,
                           dateAdded: Date(timeIntervalSince1970: 1_470_000_000))],
            cursor: 0, kept: [], removed: [], skipped: [],
            sortOrder: .leastPlayed, savedAt: Date()
        ))
        XCTAssertTrue(store.exists)
    }
}
