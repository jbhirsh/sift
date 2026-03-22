import XCTest
@testable import Sift

// MARK: - TestTrack

final class TestTrack: XCTestCase {
    func testEqualityById() {
        // Two entries for the same song should be equal regardless of differing metadata
        let original = Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                             album: "The Definition", duration: 213, playCount: 47,
                             dateAdded: Date(timeIntervalSince1970: 1_470_000_000))
        let duplicate = Track(id: "allTimelow-jon-bellion", name: "All Time Low (Remix)",
                              artist: "Jon Bellion", album: "Deluxe Edition",
                              duration: 220, playCount: 99,
                              dateAdded: Date(timeIntervalSince1970: 1_500_000_000))
        XCTAssertEqual(original, duplicate)
    }

    func testInequalityById() {
        let allTimeLow = Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                               album: "The Definition", duration: 213, playCount: 47,
                               dateAdded: Date(timeIntervalSince1970: 1_470_000_000))
        let sweetButPsycho = Track(id: "sweet-but-psycho-ava-max", name: "Sweet But Psycho",
                                   artist: "Ava Max", album: "Heaven & Hell", duration: 196,
                                   playCount: 23, dateAdded: Date(timeIntervalSince1970: 1_540_000_000))
        XCTAssertNotEqual(allTimeLow, sweetButPsycho)
    }
}
