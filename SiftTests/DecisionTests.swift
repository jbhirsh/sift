import XCTest
@testable import Sift

// MARK: - TestDecision

final class TestDecision: XCTestCase {
    func testRawValues() {
        XCTAssertEqual(Decision.keep.rawValue, "keep")
        XCTAssertEqual(Decision.remove.rawValue, "remove")
        XCTAssertEqual(Decision.skip.rawValue, "skip")
    }
}

// MARK: - TestDecisionState

final class TestDecisionState: XCTestCase {
    @MainActor func testKeepAdvancesCursor() {
        let vm = SiftViewModel()
        vm.loadTracks([
            Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                  album: "The Definition", duration: 213, playCount: 47,
                  dateAdded: Date(timeIntervalSince1970: 1_470_000_000)),
            Track(id: "sweet-but-psycho-ava-max", name: "Sweet But Psycho", artist: "Ava Max",
                  album: "Heaven & Hell", duration: 196, playCount: 23,
                  dateAdded: Date(timeIntervalSince1970: 1_540_000_000))
        ])
        XCTAssertEqual(vm.cursor, 0)
        vm.decideWithoutPlayback(.keep)     // All Time Low — keep
        XCTAssertEqual(vm.cursor, 1)
        XCTAssertEqual(vm.kept.map(\.name), ["All Time Low"])
    }

    @MainActor func testRemoveAdvancesCursorAndQueues() {
        let vm = SiftViewModel()
        vm.loadTracks([
            Track(id: "u-cant-touch-this-mc-hammer", name: "U Can't Touch This", artist: "MC Hammer",
                  album: "Please Hammer, Don't Hurt 'Em", duration: 257, playCount: 12,
                  dateAdded: Date(timeIntervalSince1970: 648_000_000))
        ])
        vm.decideWithoutPlayback(.remove)   // only track — remove and finish
        XCTAssertEqual(vm.removed.map(\.name), ["U Can't Touch This"])
        XCTAssertEqual(vm.phase, .done)
    }

    @MainActor func testSkipAdvancesCursor() {
        let vm = SiftViewModel()
        vm.loadTracks([
            Track(id: "sweet-but-psycho-ava-max", name: "Sweet But Psycho", artist: "Ava Max",
                  album: "Heaven & Hell", duration: 196, playCount: 23,
                  dateAdded: Date(timeIntervalSince1970: 1_540_000_000)),
            Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                  album: "The Definition", duration: 213, playCount: 47,
                  dateAdded: Date(timeIntervalSince1970: 1_470_000_000))
        ])
        vm.decideWithoutPlayback(.skip)     // Sweet But Psycho — skip
        XCTAssertEqual(vm.skipped.map(\.name), ["Sweet But Psycho"])
        XCTAssertEqual(vm.cursor, 1)
    }

    @MainActor func testDonePhaseWhenLibraryExhausted() {
        let vm = SiftViewModel()
        vm.loadTracks([
            Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                  album: "The Definition", duration: 213, playCount: 47,
                  dateAdded: Date(timeIntervalSince1970: 1_470_000_000))
        ])
        vm.decideWithoutPlayback(.keep)     // only track — done
        XCTAssertEqual(vm.phase, .done)
    }
}
