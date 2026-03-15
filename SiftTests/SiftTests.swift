import XCTest
@testable import Sift

final class TestSortOrder: XCTestCase {
    private func makeTracks() -> [Track] {
        [
            Track(id: "1", name: "A", artist: "X", album: "L", duration: 180,
                  playCount: 5, dateAdded: Date(timeIntervalSince1970: 1000)),
            Track(id: "2", name: "B", artist: "Y", album: "L", duration: 200,
                  playCount: 0, dateAdded: Date(timeIntervalSince1970: 2000)),
            Track(id: "3", name: "C", artist: "Z", album: "L", duration: 220,
                  playCount: 10, dateAdded: Date(timeIntervalSince1970: 3000))
        ]
    }

    func testLeastPlayedSort() {
        let viewModel = CullViewModel()
        let sorted = viewModel.sortedTracks(makeTracks(), by: .leastPlayed)
        XCTAssertEqual(sorted.map(\.playCount), [0, 5, 10])
    }

    func testMostPlayedSort() {
        let viewModel = CullViewModel()
        let sorted = viewModel.sortedTracks(makeTracks(), by: .mostPlayed)
        XCTAssertEqual(sorted.map(\.playCount), [10, 5, 0])
    }

    func testOldestSort() {
        let viewModel = CullViewModel()
        let sorted = viewModel.sortedTracks(makeTracks(), by: .oldest)
        XCTAssertEqual(sorted.map(\.id), ["1", "2", "3"])
    }

    func testNewestSort() {
        let viewModel = CullViewModel()
        let sorted = viewModel.sortedTracks(makeTracks(), by: .newest)
        XCTAssertEqual(sorted.map(\.id), ["3", "2", "1"])
    }
}

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
        let track = Track(
            id: "abc", name: "Test", artist: "Artist",
            album: "Album", duration: 180, playCount: 3, dateAdded: Date()
        )
        let session = SiftSession(
            tracks: [track], cursor: 0, kept: [], removed: [],
            skipped: [], sortOrder: .leastPlayed, savedAt: Date()
        )

        store.save(session)
        let loaded = store.load()

        XCTAssertNotNil(loaded)
        XCTAssertEqual(loaded?.tracks.count, 1)
        XCTAssertEqual(loaded?.tracks.first?.id, "abc")
    }

    func testClearRemovesSession() {
        let track = Track(
            id: "abc", name: "Test", artist: "Artist",
            album: "Album", duration: 180, playCount: 3, dateAdded: Date()
        )
        let session = SiftSession(
            tracks: [track], cursor: 0, kept: [], removed: [],
            skipped: [], sortOrder: .leastPlayed, savedAt: Date()
        )
        store.save(session)
        store.clear()
        XCTAssertFalse(store.exists)
        XCTAssertNil(store.load())
    }

    func testExistsReturnsFalseWhenNoSession() {
        XCTAssertFalse(store.exists)
    }
}

final class TestSpotifyFallback: XCTestCase {
    func testFallbackSectionsReturnChorus() async {
        let service = SpotifyService(clientID: "", clientSecret: "")
        let sections = await service.sections(name: "Song", artist: "Artist", duration: 200)
        XCTAssertEqual(sections.count, 1)
        XCTAssertTrue(sections[0].isChorus)
        XCTAssertEqual(sections[0].start, 200 * 0.33, accuracy: 0.01)
    }
}

final class TestDecisionState: XCTestCase {
    @MainActor func testKeepAdvancesCursor() {
        let viewModel = CullViewModel()
        let tracks = [
            Track(id: "1", name: "A", artist: "X", album: "L", duration: 180, playCount: 0, dateAdded: Date()),
            Track(id: "2", name: "B", artist: "Y", album: "L", duration: 200, playCount: 0, dateAdded: Date())
        ]
        viewModel.loadTracks(tracks)
        XCTAssertEqual(viewModel.cursor, 0)
        viewModel.decideWithoutPlayback(.keep)
        XCTAssertEqual(viewModel.cursor, 1)
        XCTAssertEqual(viewModel.kept.count, 1)
    }

    @MainActor func testRemoveAdvancesCursorAndQueues() {
        let viewModel = CullViewModel()
        let tracks = [
            Track(id: "1", name: "A", artist: "X", album: "L", duration: 180, playCount: 0, dateAdded: Date())
        ]
        viewModel.loadTracks(tracks)
        viewModel.decideWithoutPlayback(.remove)
        XCTAssertEqual(viewModel.removed.count, 1)
        XCTAssertEqual(viewModel.phase, .done)
    }

    @MainActor func testSkipAdvancesCursor() {
        let viewModel = CullViewModel()
        let tracks = [
            Track(id: "1", name: "A", artist: "X", album: "L", duration: 180, playCount: 0, dateAdded: Date()),
            Track(id: "2", name: "B", artist: "Y", album: "L", duration: 200, playCount: 0, dateAdded: Date())
        ]
        viewModel.loadTracks(tracks)
        viewModel.decideWithoutPlayback(.skip)
        XCTAssertEqual(viewModel.skipped.count, 1)
        XCTAssertEqual(viewModel.cursor, 1)
    }

    @MainActor func testDonePhaseWhenLibraryExhausted() {
        let viewModel = CullViewModel()
        let track = Track(
            id: "1", name: "A", artist: "X", album: "L",
            duration: 180, playCount: 0, dateAdded: Date()
        )
        viewModel.loadTracks([track])
        viewModel.decideWithoutPlayback(.keep)
        XCTAssertEqual(viewModel.phase, .done)
    }
}
