import XCTest
@testable import Sift

// MARK: - TestSiftSession

final class TestSiftSession: XCTestCase {
    func testRemainingIsTracksMinusCursor() {
        // Cursor is 1: Sweet But Psycho already decided, U Can't Touch This remains
        let session = SiftSession(
            tracks: [
                Track(id: "sweet-but-psycho-ava-max", name: "Sweet But Psycho", artist: "Ava Max",
                      album: "Heaven & Hell", duration: 196, playCount: 23,
                      dateAdded: Date(timeIntervalSince1970: 1_540_000_000)),
                Track(id: "u-cant-touch-this-mc-hammer", name: "U Can't Touch This", artist: "MC Hammer",
                      album: "Please Hammer, Don't Hurt 'Em", duration: 257, playCount: 12,
                      dateAdded: Date(timeIntervalSince1970: 648_000_000))
            ],
            cursor: 1, kept: [], removed: [], skipped: [],
            sortOrder: .leastPlayed, savedAt: Date()
        )
        XCTAssertEqual(session.remaining, 1)
    }

    func testTotalEqualsTrackCount() {
        let session = SiftSession(
            tracks: [
                Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                      album: "The Definition", duration: 213, playCount: 47,
                      dateAdded: Date(timeIntervalSince1970: 1_470_000_000)),
                Track(id: "sweet-but-psycho-ava-max", name: "Sweet But Psycho", artist: "Ava Max",
                      album: "Heaven & Hell", duration: 196, playCount: 23,
                      dateAdded: Date(timeIntervalSince1970: 1_540_000_000)),
                Track(id: "u-cant-touch-this-mc-hammer", name: "U Can't Touch This", artist: "MC Hammer",
                      album: "Please Hammer, Don't Hurt 'Em", duration: 257, playCount: 12,
                      dateAdded: Date(timeIntervalSince1970: 648_000_000))
            ],
            cursor: 0, kept: [], removed: [], skipped: [],
            sortOrder: .leastPlayed, savedAt: Date()
        )
        XCTAssertEqual(session.total, 3)
    }
}

// MARK: - TestSortOrder

// Play counts: Jon Bellion 47, Ava Max 23, MC Hammer 12
// Dates added: MC Hammer 1990, Jon Bellion 2016, Ava Max 2018

@MainActor
final class TestSortOrder: XCTestCase {
    func testDisplayNames() {
        XCTAssertEqual(SortOrder.leastPlayed.displayName, "Least Played")
        XCTAssertEqual(SortOrder.mostPlayed.displayName, "Most Played")
        XCTAssertEqual(SortOrder.oldest.displayName, "Oldest Added")
        XCTAssertEqual(SortOrder.newest.displayName, "Newest Added")
        XCTAssertEqual(SortOrder.random.displayName, "Random")
    }

    func testAllCasesCount() {
        XCTAssertEqual(SortOrder.allCases.count, 5)
    }

    func testLeastPlayedSort() {
        let vm = SiftViewModel()
        let sorted = vm.sortedTracks([
            Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                  album: "The Definition", duration: 213, playCount: 47,
                  dateAdded: Date(timeIntervalSince1970: 1_470_000_000)),
            Track(id: "sweet-but-psycho-ava-max", name: "Sweet But Psycho", artist: "Ava Max",
                  album: "Heaven & Hell", duration: 196, playCount: 23,
                  dateAdded: Date(timeIntervalSince1970: 1_540_000_000)),
            Track(id: "u-cant-touch-this-mc-hammer", name: "U Can't Touch This", artist: "MC Hammer",
                  album: "Please Hammer, Don't Hurt 'Em", duration: 257, playCount: 12,
                  dateAdded: Date(timeIntervalSince1970: 648_000_000))
        ], by: .leastPlayed)
        XCTAssertEqual(sorted.map(\.artist), ["MC Hammer", "Ava Max", "Jon Bellion"])
    }

    func testMostPlayedSort() {
        let vm = SiftViewModel()
        let sorted = vm.sortedTracks([
            Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                  album: "The Definition", duration: 213, playCount: 47,
                  dateAdded: Date(timeIntervalSince1970: 1_470_000_000)),
            Track(id: "sweet-but-psycho-ava-max", name: "Sweet But Psycho", artist: "Ava Max",
                  album: "Heaven & Hell", duration: 196, playCount: 23,
                  dateAdded: Date(timeIntervalSince1970: 1_540_000_000)),
            Track(id: "u-cant-touch-this-mc-hammer", name: "U Can't Touch This", artist: "MC Hammer",
                  album: "Please Hammer, Don't Hurt 'Em", duration: 257, playCount: 12,
                  dateAdded: Date(timeIntervalSince1970: 648_000_000))
        ], by: .mostPlayed)
        XCTAssertEqual(sorted.map(\.artist), ["Jon Bellion", "Ava Max", "MC Hammer"])
    }

    func testOldestSort() {
        let vm = SiftViewModel()
        let sorted = vm.sortedTracks([
            Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                  album: "The Definition", duration: 213, playCount: 47,
                  dateAdded: Date(timeIntervalSince1970: 1_470_000_000)),
            Track(id: "sweet-but-psycho-ava-max", name: "Sweet But Psycho", artist: "Ava Max",
                  album: "Heaven & Hell", duration: 196, playCount: 23,
                  dateAdded: Date(timeIntervalSince1970: 1_540_000_000)),
            Track(id: "u-cant-touch-this-mc-hammer", name: "U Can't Touch This", artist: "MC Hammer",
                  album: "Please Hammer, Don't Hurt 'Em", duration: 257, playCount: 12,
                  dateAdded: Date(timeIntervalSince1970: 648_000_000))
        ], by: .oldest)
        XCTAssertEqual(sorted.map(\.artist), ["MC Hammer", "Jon Bellion", "Ava Max"])
    }

    func testNewestSort() {
        let vm = SiftViewModel()
        let sorted = vm.sortedTracks([
            Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                  album: "The Definition", duration: 213, playCount: 47,
                  dateAdded: Date(timeIntervalSince1970: 1_470_000_000)),
            Track(id: "sweet-but-psycho-ava-max", name: "Sweet But Psycho", artist: "Ava Max",
                  album: "Heaven & Hell", duration: 196, playCount: 23,
                  dateAdded: Date(timeIntervalSince1970: 1_540_000_000)),
            Track(id: "u-cant-touch-this-mc-hammer", name: "U Can't Touch This", artist: "MC Hammer",
                  album: "Please Hammer, Don't Hurt 'Em", duration: 257, playCount: 12,
                  dateAdded: Date(timeIntervalSince1970: 648_000_000))
        ], by: .newest)
        XCTAssertEqual(sorted.map(\.artist), ["Ava Max", "Jon Bellion", "MC Hammer"])
    }

    func testRandomSortReturnsSameCount() {
        let vm = SiftViewModel()
        let sorted = vm.sortedTracks([
            Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                  album: "The Definition", duration: 213, playCount: 47,
                  dateAdded: Date(timeIntervalSince1970: 1_470_000_000)),
            Track(id: "sweet-but-psycho-ava-max", name: "Sweet But Psycho", artist: "Ava Max",
                  album: "Heaven & Hell", duration: 196, playCount: 23,
                  dateAdded: Date(timeIntervalSince1970: 1_540_000_000)),
            Track(id: "u-cant-touch-this-mc-hammer", name: "U Can't Touch This", artist: "MC Hammer",
                  album: "Please Hammer, Don't Hurt 'Em", duration: 257, playCount: 12,
                  dateAdded: Date(timeIntervalSince1970: 648_000_000))
        ], by: .random)
        XCTAssertEqual(sorted.count, 3)
    }
}
