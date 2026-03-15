import XCTest
@testable import Sift

// MARK: - Mock playlist service for unit tests

final class MockPlaylistService: PlaylistService {
    var addedTracks: [Track] = []
    var shouldThrow = false

    func addToRemovalPlaylist(tracks: [Track]) async throws {
        if shouldThrow { throw PlaylistError.executionFailed("mock error") }
        addedTracks = tracks
    }
}

@MainActor
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
        let viewModel = SiftViewModel()
        let sorted = viewModel.sortedTracks(makeTracks(), by: .leastPlayed)
        XCTAssertEqual(sorted.map(\.playCount), [0, 5, 10])
    }

    func testMostPlayedSort() {
        let viewModel = SiftViewModel()
        let sorted = viewModel.sortedTracks(makeTracks(), by: .mostPlayed)
        XCTAssertEqual(sorted.map(\.playCount), [10, 5, 0])
    }

    func testOldestSort() {
        let viewModel = SiftViewModel()
        let sorted = viewModel.sortedTracks(makeTracks(), by: .oldest)
        XCTAssertEqual(sorted.map(\.id), ["1", "2", "3"])
    }

    func testNewestSort() {
        let viewModel = SiftViewModel()
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

// MARK: - TestStopSession

@MainActor
final class TestStopSession: XCTestCase {
    func testStopSessionTransitionsToPaused() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        let tracks = [
            Track(id: "1", name: "A", artist: "X", album: "", duration: 180, playCount: 0, dateAdded: Date()),
            Track(id: "2", name: "B", artist: "Y", album: "", duration: 200, playCount: 0, dateAdded: Date())
        ]
        vm.loadTracks(tracks)
        vm.decideWithoutPlayback(.keep)
        XCTAssertEqual(vm.phase, .sifting)

        vm.stopSession()

        XCTAssertEqual(vm.phase, .paused)
    }

    func testResumeFromPauseTransitionsToSifting() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        let tracks = [
            Track(id: "1", name: "A", artist: "X", album: "", duration: 180, playCount: 0, dateAdded: Date()),
            Track(id: "2", name: "B", artist: "Y", album: "", duration: 200, playCount: 0, dateAdded: Date())
        ]
        vm.loadTracks(tracks)
        vm.decideWithoutPlayback(.keep)
        vm.stopSession()
        XCTAssertEqual(vm.phase, .paused)

        vm.resumeFromPause()

        XCTAssertEqual(vm.phase, .sifting)
        XCTAssertEqual(vm.cursor, 1)
    }

    func testStopSessionPreservesDecisionsSoFar() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        let tracks = [
            Track(id: "1", name: "A", artist: "X", album: "", duration: 180, playCount: 0, dateAdded: Date()),
            Track(id: "2", name: "B", artist: "Y", album: "", duration: 200, playCount: 0, dateAdded: Date()),
            Track(id: "3", name: "C", artist: "Z", album: "", duration: 240, playCount: 0, dateAdded: Date())
        ]
        vm.loadTracks(tracks)
        vm.decideWithoutPlayback(.keep)
        vm.decideWithoutPlayback(.remove)

        vm.stopSession()

        XCTAssertEqual(vm.kept.count, 1)
        XCTAssertEqual(vm.removed.count, 1)
        XCTAssertEqual(vm.remaining, 1)
    }
}

// MARK: - TestPlaylistScriptBuilder

final class TestPlaylistScriptBuilder: XCTestCase {
    func testScriptContainsPlaylistName() {
        let script = buildRemovalPlaylistScript(tracks: [], playlistName: "My Playlist")
        XCTAssertTrue(script.contains("My Playlist"))
    }

    func testScriptCreatesPlaylistIfNotExists() {
        let script = buildRemovalPlaylistScript(tracks: [])
        XCTAssertTrue(script.contains("if not (exists playlist"))
        XCTAssertTrue(script.contains("make new playlist"))
    }

    func testScriptContainsTrackNameAndArtist() {
        let track = Track(id: "1", name: "Bohemian Rhapsody", artist: "Queen",
                          album: "A Night at the Opera", duration: 354, playCount: 10, dateAdded: Date())
        let script = buildRemovalPlaylistScript(tracks: [track])
        XCTAssertTrue(script.contains("Bohemian Rhapsody"))
        XCTAssertTrue(script.contains("Queen"))
    }

    func testScriptEscapesDoubleQuotesInTrackName() {
        let track = Track(id: "1", name: "Say \"Hello\"", artist: "Test",
                          album: "", duration: 180, playCount: 0, dateAdded: Date())
        let script = buildRemovalPlaylistScript(tracks: [track])
        XCTAssertTrue(script.contains("Say \\\"Hello\\\""))
    }

    func testScriptEscapesDoubleQuotesInArtistName() {
        let track = Track(id: "1", name: "Song", artist: "The \"Band\"",
                          album: "", duration: 180, playCount: 0, dateAdded: Date())
        let script = buildRemovalPlaylistScript(tracks: [track])
        XCTAssertTrue(script.contains("The \\\"Band\\\""))
    }

    func testScriptContainsDuplicateCommandForEachTrack() {
        let tracks = [
            Track(id: "1", name: "A", artist: "X", album: "", duration: 180, playCount: 0, dateAdded: Date()),
            Track(id: "2", name: "B", artist: "Y", album: "", duration: 200, playCount: 0, dateAdded: Date())
        ]
        let script = buildRemovalPlaylistScript(tracks: tracks)
        let duplicateCount = script.components(separatedBy: "duplicate").count - 1
        XCTAssertEqual(duplicateCount, 2)
    }

    func testEmptyTracksProducesValidScript() {
        let script = buildRemovalPlaylistScript(tracks: [])
        XCTAssertTrue(script.hasPrefix("tell application \"Music\""))
        XCTAssertTrue(script.hasSuffix("end tell"))
    }
}

// MARK: - TestRemovalPlaylistViewModel

final class TestRemovalPlaylistViewModel: XCTestCase {
    @MainActor func testCreateRemovalPlaylistPassesRemovedTracks() async {
        let mock = MockPlaylistService()
        let vm = SiftViewModel(playlistService: mock)
        let tracks = [
            Track(id: "1", name: "A", artist: "X", album: "", duration: 180, playCount: 0, dateAdded: Date()),
            Track(id: "2", name: "B", artist: "Y", album: "", duration: 200, playCount: 0, dateAdded: Date())
        ]
        vm.loadTracks(tracks)
        vm.decideWithoutPlayback(.remove)
        vm.decideWithoutPlayback(.remove)

        vm.createRemovalPlaylist()
        // Wait for async task
        try? await Task.sleep(for: .milliseconds(100))

        XCTAssertEqual(mock.addedTracks.count, 2)
        XCTAssertTrue(vm.removalPlaylistCreated)
        XCTAssertNil(vm.removalPlaylistError)
    }

    @MainActor func testCreateRemovalPlaylistSetsErrorOnFailure() async {
        let mock = MockPlaylistService()
        mock.shouldThrow = true
        let vm = SiftViewModel(playlistService: mock)
        let track = Track(id: "1", name: "A", artist: "X", album: "", duration: 180, playCount: 0, dateAdded: Date())
        vm.loadTracks([track])
        vm.decideWithoutPlayback(.remove)

        vm.createRemovalPlaylist()
        try? await Task.sleep(for: .milliseconds(100))

        XCTAssertFalse(vm.removalPlaylistCreated)
        XCTAssertNotNil(vm.removalPlaylistError)
    }

    @MainActor func testCreateRemovalPlaylistDoesNothingWhenNoRemovedTracks() async {
        let mock = MockPlaylistService()
        let vm = SiftViewModel(playlistService: mock)

        vm.createRemovalPlaylist()
        try? await Task.sleep(for: .milliseconds(100))

        XCTAssertEqual(mock.addedTracks.count, 0)
        XCTAssertFalse(vm.removalPlaylistCreated)
    }
}

final class TestDecisionState: XCTestCase {
    @MainActor func testKeepAdvancesCursor() {
        let viewModel = SiftViewModel()
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
        let viewModel = SiftViewModel()
        let tracks = [
            Track(id: "1", name: "A", artist: "X", album: "L", duration: 180, playCount: 0, dateAdded: Date())
        ]
        viewModel.loadTracks(tracks)
        viewModel.decideWithoutPlayback(.remove)
        XCTAssertEqual(viewModel.removed.count, 1)
        XCTAssertEqual(viewModel.phase, .done)
    }

    @MainActor func testSkipAdvancesCursor() {
        let viewModel = SiftViewModel()
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
        let viewModel = SiftViewModel()
        let track = Track(
            id: "1", name: "A", artist: "X", album: "L",
            duration: 180, playCount: 0, dateAdded: Date()
        )
        viewModel.loadTracks([track])
        viewModel.decideWithoutPlayback(.keep)
        XCTAssertEqual(viewModel.phase, .done)
    }
}
