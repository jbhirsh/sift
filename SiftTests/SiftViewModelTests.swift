// swiftlint:disable file_length
import XCTest
@testable import Sift

// MARK: - TestViewModelAdditional

@MainActor
final class TestViewModelAdditional: XCTestCase {
    func testCurrentTrackIsFirstInQueue() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([
            Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                  album: "The Definition", duration: 213, playCount: 47,
                  dateAdded: Date(timeIntervalSince1970: 1_470_000_000)),
            Track(id: "sweet-but-psycho-ava-max", name: "Sweet But Psycho", artist: "Ava Max",
                  album: "Heaven & Hell", duration: 196, playCount: 23,
                  dateAdded: Date(timeIntervalSince1970: 1_540_000_000)),
            Track(id: "u-cant-touch-this-mc-hammer", name: "U Can't Touch This", artist: "MC Hammer",
                  album: "Please Hammer, Don't Hurt 'Em", duration: 257, playCount: 12,
                  dateAdded: Date(timeIntervalSince1970: 648_000_000))
        ])
        XCTAssertEqual(vm.currentTrack?.name, "All Time Low")
    }

    func testNextTrackIsSecondInQueue() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([
            Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                  album: "The Definition", duration: 213, playCount: 47,
                  dateAdded: Date(timeIntervalSince1970: 1_470_000_000)),
            Track(id: "sweet-but-psycho-ava-max", name: "Sweet But Psycho", artist: "Ava Max",
                  album: "Heaven & Hell", duration: 196, playCount: 23,
                  dateAdded: Date(timeIntervalSince1970: 1_540_000_000)),
            Track(id: "u-cant-touch-this-mc-hammer", name: "U Can't Touch This", artist: "MC Hammer",
                  album: "Please Hammer, Don't Hurt 'Em", duration: 257, playCount: 12,
                  dateAdded: Date(timeIntervalSince1970: 648_000_000))
        ])
        XCTAssertEqual(vm.nextTrack?.name, "Sweet But Psycho")
    }

    func testNextNextTrackIsThirdInQueue() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([
            Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                  album: "The Definition", duration: 213, playCount: 47,
                  dateAdded: Date(timeIntervalSince1970: 1_470_000_000)),
            Track(id: "sweet-but-psycho-ava-max", name: "Sweet But Psycho", artist: "Ava Max",
                  album: "Heaven & Hell", duration: 196, playCount: 23,
                  dateAdded: Date(timeIntervalSince1970: 1_540_000_000)),
            Track(id: "u-cant-touch-this-mc-hammer", name: "U Can't Touch This", artist: "MC Hammer",
                  album: "Please Hammer, Don't Hurt 'Em", duration: 257, playCount: 12,
                  dateAdded: Date(timeIntervalSince1970: 648_000_000))
        ])
        XCTAssertEqual(vm.nextNextTrack?.name, "U Can't Touch This")
    }

    func testCurrentTrackNilWhenLibraryEmpty() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([])
        XCTAssertNil(vm.currentTrack)
    }

    func testNextTrackNilWithOnlyOneTrack() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([
            Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                  album: "The Definition", duration: 213, playCount: 47,
                  dateAdded: Date(timeIntervalSince1970: 1_470_000_000))
        ])
        XCTAssertNil(vm.nextTrack)
    }

    func testNextNextTrackNilWithOnlyTwoTracks() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([
            Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                  album: "The Definition", duration: 213, playCount: 47,
                  dateAdded: Date(timeIntervalSince1970: 1_470_000_000)),
            Track(id: "sweet-but-psycho-ava-max", name: "Sweet But Psycho", artist: "Ava Max",
                  album: "Heaven & Hell", duration: 196, playCount: 23,
                  dateAdded: Date(timeIntervalSince1970: 1_540_000_000))
        ])
        XCTAssertNil(vm.nextNextTrack)
    }

    func testRemainingDecrementsAfterEachDecision() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([
            Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                  album: "The Definition", duration: 213, playCount: 47,
                  dateAdded: Date(timeIntervalSince1970: 1_470_000_000)),
            Track(id: "sweet-but-psycho-ava-max", name: "Sweet But Psycho", artist: "Ava Max",
                  album: "Heaven & Hell", duration: 196, playCount: 23,
                  dateAdded: Date(timeIntervalSince1970: 1_540_000_000)),
            Track(id: "u-cant-touch-this-mc-hammer", name: "U Can't Touch This", artist: "MC Hammer",
                  album: "Please Hammer, Don't Hurt 'Em", duration: 257, playCount: 12,
                  dateAdded: Date(timeIntervalSince1970: 648_000_000))
        ])
        XCTAssertEqual(vm.remaining, 3)
        vm.decideWithoutPlayback(.keep)     // All Time Low — keep
        XCTAssertEqual(vm.remaining, 2)
        vm.decideWithoutPlayback(.remove)   // Sweet But Psycho — remove
        XCTAssertEqual(vm.remaining, 1)
    }

    func testTotalEqualsLibrarySize() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([
            Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                  album: "The Definition", duration: 213, playCount: 47,
                  dateAdded: Date(timeIntervalSince1970: 1_470_000_000)),
            Track(id: "sweet-but-psycho-ava-max", name: "Sweet But Psycho", artist: "Ava Max",
                  album: "Heaven & Hell", duration: 196, playCount: 23,
                  dateAdded: Date(timeIntervalSince1970: 1_540_000_000)),
            Track(id: "u-cant-touch-this-mc-hammer", name: "U Can't Touch This", artist: "MC Hammer",
                  album: "Please Hammer, Don't Hurt 'Em", duration: 257, playCount: 12,
                  dateAdded: Date(timeIntervalSince1970: 648_000_000))
        ])
        XCTAssertEqual(vm.total, 3)
    }

    func testSkipBackwardSeeksBack15Seconds() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([
            Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                  album: "The Definition", duration: 213, playCount: 47,
                  dateAdded: Date(timeIntervalSince1970: 1_470_000_000))
        ])
        vm.playbackPosition = 60.0  // 1 minute into All Time Low
        vm.skipBackward()           // seeks to 45.0
        XCTAssertEqual(vm.currentTrack?.name, "All Time Low")
    }

    func testSkipBackwardClampsToZeroNearStart() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([
            Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                  album: "The Definition", duration: 213, playCount: 47,
                  dateAdded: Date(timeIntervalSince1970: 1_470_000_000))
        ])
        vm.playbackPosition = 5.0   // near the very start
        vm.skipBackward()           // max(0, 5 - 15) = 0
        XCTAssertEqual(vm.currentTrack?.name, "All Time Low")
    }

    func testSkipForwardSeeksAhead15Seconds() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([
            Track(id: "sweet-but-psycho-ava-max", name: "Sweet But Psycho", artist: "Ava Max",
                  album: "Heaven & Hell", duration: 196, playCount: 23,
                  dateAdded: Date(timeIntervalSince1970: 1_540_000_000))
        ])
        vm.playbackPosition = 0.0
        vm.skipForward()            // seeks to 15.0
        XCTAssertEqual(vm.currentTrack?.name, "Sweet But Psycho")
    }

    func testSkipForwardWithNoCurrentTrackDoesNotCrash() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([])
        vm.skipForward()            // guard currentTrack — returns early
    }

    func testTogglePlayPauseWhenPaused() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([
            Track(id: "u-cant-touch-this-mc-hammer", name: "U Can't Touch This", artist: "MC Hammer",
                  album: "Please Hammer, Don't Hurt 'Em", duration: 257, playCount: 12,
                  dateAdded: Date(timeIntervalSince1970: 648_000_000))
        ])
        vm.isPlaying = false
        vm.togglePlayPause()
        XCTAssertEqual(vm.currentTrack?.name, "U Can't Touch This")
    }

    func testTogglePlayPauseWhenPlaying() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([
            Track(id: "u-cant-touch-this-mc-hammer", name: "U Can't Touch This", artist: "MC Hammer",
                  album: "Please Hammer, Don't Hurt 'Em", duration: 257, playCount: 12,
                  dateAdded: Date(timeIntervalSince1970: 648_000_000))
        ])
        vm.isPlaying = true
        vm.togglePlayPause()
        XCTAssertEqual(vm.currentTrack?.name, "U Can't Touch This")
    }

    func testDecideKeepRecordsAndAdvancesCursor() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([
            Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                  album: "The Definition", duration: 213, playCount: 47,
                  dateAdded: Date(timeIntervalSince1970: 1_470_000_000)),
            Track(id: "sweet-but-psycho-ava-max", name: "Sweet But Psycho", artist: "Ava Max",
                  album: "Heaven & Hell", duration: 196, playCount: 23,
                  dateAdded: Date(timeIntervalSince1970: 1_540_000_000))
        ])
        vm.decide(.keep)    // All Time Low — keep
        XCTAssertEqual(vm.kept.map(\.name), ["All Time Low"])
        XCTAssertEqual(vm.cursor, 1)
    }

    func testDecideRemoveRecordsSong() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([
            Track(id: "sweet-but-psycho-ava-max", name: "Sweet But Psycho", artist: "Ava Max",
                  album: "Heaven & Hell", duration: 196, playCount: 23,
                  dateAdded: Date(timeIntervalSince1970: 1_540_000_000)),
            Track(id: "u-cant-touch-this-mc-hammer", name: "U Can't Touch This", artist: "MC Hammer",
                  album: "Please Hammer, Don't Hurt 'Em", duration: 257, playCount: 12,
                  dateAdded: Date(timeIntervalSince1970: 648_000_000))
        ])
        vm.decide(.remove)  // Sweet But Psycho — remove
        XCTAssertEqual(vm.removed.map(\.name), ["Sweet But Psycho"])
    }

    func testDecideSkipRecordsSong() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([
            Track(id: "u-cant-touch-this-mc-hammer", name: "U Can't Touch This", artist: "MC Hammer",
                  album: "Please Hammer, Don't Hurt 'Em", duration: 257, playCount: 12,
                  dateAdded: Date(timeIntervalSince1970: 648_000_000)),
            Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                  album: "The Definition", duration: 213, playCount: 47,
                  dateAdded: Date(timeIntervalSince1970: 1_470_000_000))
        ])
        vm.decide(.skip)    // U Can't Touch This — skip
        XCTAssertEqual(vm.skipped.map(\.name), ["U Can't Touch This"])
    }

    func testDecideWhenLibraryEmptyDoesNothing() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([])
        vm.decide(.keep)
        XCTAssertEqual(vm.kept.count, 0)
    }

    func testDecideLastTrackTransitionsToDone() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([
            Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                  album: "The Definition", duration: 213, playCount: 47,
                  dateAdded: Date(timeIntervalSince1970: 1_470_000_000))
        ])
        vm.decide(.keep)    // only track — exhausts library
        XCTAssertEqual(vm.phase, .done)
    }

    func testDecideWithoutPlaybackWhenLibraryEmptyDoesNothing() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([])
        vm.decideWithoutPlayback(.remove)
        XCTAssertEqual(vm.removed.count, 0)
    }

    func testIsUITestingFalseInUnitTests() {
        XCTAssertFalse(SiftViewModel.isUITesting)
    }
}

// MARK: - TestStopSession

@MainActor
final class TestStopSession: XCTestCase {
    override func tearDown() {
        SessionStore().clear()
        super.tearDown()
    }

    func testStopSessionTransitionsToPaused() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([
            Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                  album: "The Definition", duration: 213, playCount: 47,
                  dateAdded: Date(timeIntervalSince1970: 1_470_000_000)),
            Track(id: "sweet-but-psycho-ava-max", name: "Sweet But Psycho", artist: "Ava Max",
                  album: "Heaven & Hell", duration: 196, playCount: 23,
                  dateAdded: Date(timeIntervalSince1970: 1_540_000_000))
        ])
        vm.decideWithoutPlayback(.keep)     // All Time Low — keep
        XCTAssertEqual(vm.phase, .sifting)

        vm.stopSession()

        XCTAssertEqual(vm.phase, .paused)
    }

    func testResumeFromPauseTransitionsToSifting() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([
            Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                  album: "The Definition", duration: 213, playCount: 47,
                  dateAdded: Date(timeIntervalSince1970: 1_470_000_000)),
            Track(id: "sweet-but-psycho-ava-max", name: "Sweet But Psycho", artist: "Ava Max",
                  album: "Heaven & Hell", duration: 196, playCount: 23,
                  dateAdded: Date(timeIntervalSince1970: 1_540_000_000))
        ])
        vm.decideWithoutPlayback(.keep)     // All Time Low — keep
        vm.stopSession()
        XCTAssertEqual(vm.phase, .paused)

        vm.resumeFromPause()

        XCTAssertEqual(vm.phase, .sifting)
        XCTAssertEqual(vm.cursor, 1)
        XCTAssertEqual(vm.currentTrack?.name, "Sweet But Psycho")
    }

    func testStopSessionPreservesDecisionsSoFar() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([
            Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                  album: "The Definition", duration: 213, playCount: 47,
                  dateAdded: Date(timeIntervalSince1970: 1_470_000_000)),
            Track(id: "sweet-but-psycho-ava-max", name: "Sweet But Psycho", artist: "Ava Max",
                  album: "Heaven & Hell", duration: 196, playCount: 23,
                  dateAdded: Date(timeIntervalSince1970: 1_540_000_000)),
            Track(id: "u-cant-touch-this-mc-hammer", name: "U Can't Touch This", artist: "MC Hammer",
                  album: "Please Hammer, Don't Hurt 'Em", duration: 257, playCount: 12,
                  dateAdded: Date(timeIntervalSince1970: 648_000_000))
        ])
        vm.decideWithoutPlayback(.keep)     // All Time Low — keep
        vm.decideWithoutPlayback(.remove)   // Sweet But Psycho — remove

        vm.stopSession()

        XCTAssertEqual(vm.kept.map(\.name), ["All Time Low"])
        XCTAssertEqual(vm.removed.map(\.name), ["Sweet But Psycho"])
        XCTAssertEqual(vm.remaining, 1)     // U Can't Touch This still to go
    }
}

// MARK: - TestRemovalPlaylistViewModel

final class TestRemovalPlaylistViewModel: XCTestCase {
    @MainActor func testCreateRemovalPlaylistPassesRemovedTracks() async {
        let mock = MockPlaylistService()
        let vm = SiftViewModel(playlistService: mock)
        vm.loadTracks([
            Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                  album: "The Definition", duration: 213, playCount: 47,
                  dateAdded: Date(timeIntervalSince1970: 1_470_000_000)),
            Track(id: "sweet-but-psycho-ava-max", name: "Sweet But Psycho", artist: "Ava Max",
                  album: "Heaven & Hell", duration: 196, playCount: 23,
                  dateAdded: Date(timeIntervalSince1970: 1_540_000_000))
        ])
        vm.decideWithoutPlayback(.remove)   // All Time Low — remove
        vm.decideWithoutPlayback(.remove)   // Sweet But Psycho — remove

        vm.createRemovalPlaylist()
        try? await Task.sleep(for: .milliseconds(100))

        XCTAssertEqual(mock.addedTracks.map(\.name), ["All Time Low", "Sweet But Psycho"])
        XCTAssertTrue(vm.removalPlaylistCreated)
        XCTAssertNil(vm.removalPlaylistError)
    }

    @MainActor func testCreateRemovalPlaylistSetsErrorOnFailure() async {
        let mock = MockPlaylistService()
        mock.shouldThrow = true
        let vm = SiftViewModel(playlistService: mock)
        vm.loadTracks([
            Track(id: "u-cant-touch-this-mc-hammer", name: "U Can't Touch This", artist: "MC Hammer",
                  album: "Please Hammer, Don't Hurt 'Em", duration: 257, playCount: 12,
                  dateAdded: Date(timeIntervalSince1970: 648_000_000))
        ])
        vm.decideWithoutPlayback(.remove)   // U Can't Touch This — remove

        vm.createRemovalPlaylist()
        // Allow the unstructured Task inside createRemovalPlaylist
        // enough time to complete the async error path.
        for _ in 0..<20 {
            try? await Task.sleep(for: .milliseconds(100))
            if vm.removalPlaylistError != nil { break }
        }

        XCTAssertFalse(vm.removalPlaylistCreated)
        XCTAssertNotNil(vm.removalPlaylistError)
    }

    @MainActor func testCreateRemovalPlaylistDoesNothingWhenNothingToRemove() async {
        let mock = MockPlaylistService()
        let vm = SiftViewModel(playlistService: mock)
        vm.loadTracks([
            Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                  album: "The Definition", duration: 213, playCount: 47,
                  dateAdded: Date(timeIntervalSince1970: 1_470_000_000))
        ])
        vm.decideWithoutPlayback(.keep)     // All Time Low — keep (not removed)

        vm.createRemovalPlaylist()
        try? await Task.sleep(for: .milliseconds(100))

        XCTAssertEqual(mock.addedTracks.count, 0)
        XCTAssertFalse(vm.removalPlaylistCreated)
    }
}

// MARK: - TestProviderSelection

@MainActor
final class TestProviderSelection: XCTestCase {
    func testDefaultProviderIsAppleMusic() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        XCTAssertEqual(vm.provider, .appleMusic)
    }

    func testSelectProviderChangesProvider() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.selectProvider(.spotify)
        XCTAssertEqual(vm.provider, .spotify)
    }

    func testSelectSameProviderIsNoOp() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.selectProvider(.appleMusic)
        XCTAssertEqual(vm.provider, .appleMusic)
    }

    func testInitWithSpotifyProvider() {
        let vm = SiftViewModel(
            playlistService: MockPlaylistService(),
            provider: .spotify
        )
        XCTAssertEqual(vm.provider, .spotify)
    }

    func testInitWithMusicServiceProtocol() {
        let mock = MockMusicService()
        let vm = SiftViewModel(
            musicService: mock,
            playlistService: MockPlaylistService()
        )
        vm.loadTracks([
            Track(id: "t1", name: "Test", artist: "Artist",
                  album: "Album", duration: 180, playCount: 0,
                  dateAdded: Date())
        ])
        XCTAssertEqual(vm.currentTrack?.name, "Test")
    }
}

// MARK: - TestSessionResume

@MainActor
final class TestSessionResume: XCTestCase {
    override func tearDown() {
        SessionStore().clear()
        super.tearDown()
    }

    func testResumeSessionRestoresStateFromSavedSession() {
        // Save a session via stopSession, then restore via resumeSession on a new VM instance
        let vm1 = SiftViewModel(playlistService: MockPlaylistService())
        vm1.loadTracks([
            Track(id: "allTimelow-jon-bellion", name: "All Time Low", artist: "Jon Bellion",
                  album: "The Definition", duration: 213, playCount: 47,
                  dateAdded: Date(timeIntervalSince1970: 1_470_000_000)),
            Track(id: "sweet-but-psycho-ava-max", name: "Sweet But Psycho", artist: "Ava Max",
                  album: "Heaven & Hell", duration: 196, playCount: 23,
                  dateAdded: Date(timeIntervalSince1970: 1_540_000_000))
        ])
        vm1.decideWithoutPlayback(.keep)    // All Time Low — keep; cursor advances to 1
        vm1.stopSession()                   // saves session to disk: cursor=1, kept=[All Time Low]

        let vm2 = SiftViewModel(playlistService: MockPlaylistService())
        vm2.resumeSession()                 // restores from disk

        XCTAssertEqual(vm2.phase, .sifting)
        XCTAssertEqual(vm2.cursor, 1)
        XCTAssertEqual(vm2.currentTrack?.name, "Sweet But Psycho")
    }

    func testStartFreshClearsExistingSession() {
        // stopSession saves to disk; startFresh must clear it before launching load
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        vm.loadTracks([
            Track(id: "u-cant-touch-this-mc-hammer", name: "U Can't Touch This", artist: "MC Hammer",
                  album: "Please Hammer, Don't Hurt 'Em", duration: 257, playCount: 12,
                  dateAdded: Date(timeIntervalSince1970: 648_000_000))
        ])
        vm.stopSession()                    // writes session to disk

        vm.startFresh()                     // synchronously clears session, then fires loadLibrary Task

        XCTAssertFalse(SessionStore().exists)
    }
}

// MARK: - TestLoadLibraryWithMockService

@MainActor
final class TestLoadLibraryWithMockService: XCTestCase {
    override func tearDown() {
        SessionStore().clear()
        super.tearDown()
    }

    func testLoadLibraryPopulatesTracksAndTransitionsToSifting() async {
        let mock = MockMusicService()
        await mock.setTracksToReturn([
            Track(id: "t1", name: "Alpha", artist: "Artist A",
                  album: "Album A", duration: 200, playCount: 10,
                  dateAdded: Date(timeIntervalSince1970: 1_600_000_000)),
            Track(id: "t2", name: "Beta", artist: "Artist B",
                  album: "Album B", duration: 180, playCount: 5,
                  dateAdded: Date(timeIntervalSince1970: 1_610_000_000))
        ])
        let vm = SiftViewModel(musicService: mock, playlistService: MockPlaylistService())
        vm.startFresh()
        try? await Task.sleep(for: .milliseconds(200))

        XCTAssertEqual(vm.phase, .sifting)
        XCTAssertEqual(vm.tracks.count, 2)
        // Default sort is leastPlayed — track with playCount 5 should come first
        XCTAssertEqual(vm.currentTrack?.name, "Beta")
    }

    func testLoadLibraryHandlesMusicError() async {
        let mock = MockMusicService()
        await mock.setShouldThrow(true)
        let vm = SiftViewModel(musicService: mock, playlistService: MockPlaylistService())
        vm.startFresh()
        try? await Task.sleep(for: .milliseconds(200))

        XCTAssertEqual(vm.phase, .setup)
        XCTAssertNotNil(vm.loadError)
    }

    func testResumeSessionRestoresProvider() {
        // Save a session with Spotify provider, verify it restores
        let vm1 = SiftViewModel(playlistService: MockPlaylistService(), provider: .spotify)
        vm1.loadTracks([
            Track(id: "s1", name: "Spotify Song", artist: "Spot Artist",
                  album: "Spot Album", duration: 200, playCount: 0,
                  dateAdded: Date(timeIntervalSince1970: 1_700_000_000))
        ])
        vm1.stopSession()

        let vm2 = SiftViewModel(playlistService: MockPlaylistService())
        vm2.resumeSession()

        XCTAssertEqual(vm2.provider, .spotify)
        XCTAssertEqual(vm2.phase, .sifting)
        XCTAssertEqual(vm2.currentTrack?.name, "Spotify Song")
    }
}

// MARK: - TestSortOrders

@MainActor
final class TestSortOrders: XCTestCase {
    func testSortByLeastPlayed() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        let tracks = [
            Track(id: "a", name: "A", artist: "X", album: "Y", duration: 100,
                  playCount: 50, dateAdded: Date(timeIntervalSince1970: 1_000_000)),
            Track(id: "b", name: "B", artist: "X", album: "Y", duration: 100,
                  playCount: 5, dateAdded: Date(timeIntervalSince1970: 2_000_000)),
            Track(id: "c", name: "C", artist: "X", album: "Y", duration: 100,
                  playCount: 25, dateAdded: Date(timeIntervalSince1970: 3_000_000))
        ]
        let sorted = vm.sortedTracks(tracks, by: .leastPlayed)
        XCTAssertEqual(sorted.map(\.name), ["B", "C", "A"])
    }

    func testSortByMostPlayed() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        let tracks = [
            Track(id: "a", name: "A", artist: "X", album: "Y", duration: 100,
                  playCount: 50, dateAdded: Date(timeIntervalSince1970: 1_000_000)),
            Track(id: "b", name: "B", artist: "X", album: "Y", duration: 100,
                  playCount: 5, dateAdded: Date(timeIntervalSince1970: 2_000_000)),
            Track(id: "c", name: "C", artist: "X", album: "Y", duration: 100,
                  playCount: 25, dateAdded: Date(timeIntervalSince1970: 3_000_000))
        ]
        let sorted = vm.sortedTracks(tracks, by: .mostPlayed)
        XCTAssertEqual(sorted.map(\.name), ["A", "C", "B"])
    }

    func testSortByOldest() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        let tracks = [
            Track(id: "a", name: "A", artist: "X", album: "Y", duration: 100,
                  playCount: 0, dateAdded: Date(timeIntervalSince1970: 3_000_000)),
            Track(id: "b", name: "B", artist: "X", album: "Y", duration: 100,
                  playCount: 0, dateAdded: Date(timeIntervalSince1970: 1_000_000)),
            Track(id: "c", name: "C", artist: "X", album: "Y", duration: 100,
                  playCount: 0, dateAdded: Date(timeIntervalSince1970: 2_000_000))
        ]
        let sorted = vm.sortedTracks(tracks, by: .oldest)
        XCTAssertEqual(sorted.map(\.name), ["B", "C", "A"])
    }

    func testSortByNewest() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        let tracks = [
            Track(id: "a", name: "A", artist: "X", album: "Y", duration: 100,
                  playCount: 0, dateAdded: Date(timeIntervalSince1970: 3_000_000)),
            Track(id: "b", name: "B", artist: "X", album: "Y", duration: 100,
                  playCount: 0, dateAdded: Date(timeIntervalSince1970: 1_000_000)),
            Track(id: "c", name: "C", artist: "X", album: "Y", duration: 100,
                  playCount: 0, dateAdded: Date(timeIntervalSince1970: 2_000_000))
        ]
        let sorted = vm.sortedTracks(tracks, by: .newest)
        XCTAssertEqual(sorted.map(\.name), ["A", "C", "B"])
    }

    func testSortByRandomReturnsAllTracks() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        let tracks = [
            Track(id: "a", name: "A", artist: "X", album: "Y", duration: 100,
                  playCount: 0, dateAdded: Date()),
            Track(id: "b", name: "B", artist: "X", album: "Y", duration: 100,
                  playCount: 0, dateAdded: Date()),
            Track(id: "c", name: "C", artist: "X", album: "Y", duration: 100,
                  playCount: 0, dateAdded: Date())
        ]
        let sorted = vm.sortedTracks(tracks, by: .random)
        XCTAssertEqual(sorted.count, 3)
        XCTAssertEqual(Set(sorted.map(\.id)), Set(["a", "b", "c"]))
    }
}

// MARK: - TestFriendlyLoadError

@MainActor
final class TestFriendlyLoadError: XCTestCase {
    func testLoadLibraryWithUnknownErrorShowsFriendlyMessage() async {
        let mock = MockMusicService()
        await mock.setCustomError(NSError(domain: "test", code: -1,
                                           userInfo: [NSLocalizedDescriptionKey: "Unknown error occurred"]))
        let vm = SiftViewModel(musicService: mock, playlistService: MockPlaylistService())
        vm.startFresh()
        try? await Task.sleep(for: .milliseconds(200))

        XCTAssertEqual(vm.phase, .setup)
        XCTAssertTrue(vm.loadError?.contains("Could not connect to your Music library") == true)
    }

    func testLoadLibraryWithNotAvailableErrorShowsFriendlyMessage() async {
        let mock = MockMusicService()
        await mock.setCustomError(NSError(domain: "test", code: -1,
                                           userInfo: [NSLocalizedDescriptionKey: "Service not available"]))
        let vm = SiftViewModel(musicService: mock, playlistService: MockPlaylistService())
        vm.startFresh()
        try? await Task.sleep(for: .milliseconds(200))

        XCTAssertEqual(vm.phase, .setup)
        XCTAssertTrue(vm.loadError?.contains("Could not connect to your Music library") == true)
    }

    func testLoadLibraryWithGenericErrorShowsOriginalDescription() async {
        let mock = MockMusicService()
        await mock.setCustomError(NSError(domain: "test", code: -1,
                                           userInfo: [NSLocalizedDescriptionKey: "Network timeout"]))
        let vm = SiftViewModel(musicService: mock, playlistService: MockPlaylistService())
        vm.startFresh()
        try? await Task.sleep(for: .milliseconds(200))

        XCTAssertEqual(vm.phase, .setup)
        XCTAssertTrue(vm.loadError?.contains("Network timeout") == true)
    }
}

// MARK: - TestConnectionCheck

@MainActor
final class TestConnectionCheck: XCTestCase {
    func testCheckConnectionSetsConnectedWhenAuthorized() async {
        let mock = MockMusicService()
        let vm = SiftViewModel(musicService: mock, playlistService: MockPlaylistService())

        await vm.checkConnection()

        XCTAssertEqual(vm.connectionStatus, .connected)
    }

    func testCheckConnectionSetsDisconnectedWhenNotAuthorized() async {
        let mock = MockMusicService()
        await mock.setAuthorized(false)
        let vm = SiftViewModel(musicService: mock, playlistService: MockPlaylistService())

        await vm.checkConnection()

        XCTAssertEqual(vm.connectionStatus, .disconnected)
    }

    func testCheckConnectionDefaultsToUnknown() {
        let vm = SiftViewModel(playlistService: MockPlaylistService())
        XCTAssertEqual(vm.connectionStatus, .unknown)
    }
}
