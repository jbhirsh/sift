import MusicKit
import SwiftUI

enum AppPhase: Equatable {
    case setup
    case loading
    case sifting
    case done
}

@MainActor
final class SiftViewModel: ObservableObject {
    // MARK: - Phase
    @Published var phase: AppPhase = .setup

    // MARK: - Library state
    @Published var tracks: [Track] = []
    @Published var cursor: Int = 0
    @Published var kept: [Track] = []
    @Published var removed: [Track] = []
    @Published var skipped: [Track] = []
    @Published var sortOrder: SortOrder = .leastPlayed

    // MARK: - Loading state
    @Published var loadProgress: Double = 0
    @Published var loadMessage: String = "Connecting to Music…"

    // MARK: - Playback state
    @Published var playbackPosition: Double = 0
    @Published var isPlaying: Bool = false
    @Published var currentArtwork: Artwork?

    // MARK: - Session resume
    @Published var hasSavedSession: Bool = false

    // MARK: - Removal playlist
    @Published var removalPlaylistCreated: Bool = false
    @Published var removalPlaylistError: String?
    @Published var isCreatingPlaylist: Bool = false

    // MARK: - Services
    private let musicService = MusicService()
    private let sessionStore = SessionStore()
    private let playlistService: any PlaylistService

    // MARK: - Timers
    private var positionTask: Task<Void, Never>?

    // MARK: - Computed
    var currentTrack: Track? { tracks[safe: cursor] }
    var nextTrack: Track? { tracks[safe: cursor + 1] }
    var nextNextTrack: Track? { tracks[safe: cursor + 2] }
    var remaining: Int { max(0, tracks.count - cursor) }
    var total: Int { tracks.count }

    static var isUITesting: Bool {
        ProcessInfo.processInfo.arguments.contains("--ui-testing")
    }

    init(playlistService: any PlaylistService = AppleScriptPlaylistService()) {
        self.playlistService = playlistService
        hasSavedSession = sessionStore.exists
        if Self.isUITesting { loadMockTracks() }
    }

    // MARK: - Authorization

    func requestMusicAuthorization() async -> Bool {
        await musicService.requestAuthorization()
    }

    // MARK: - Load library

    func startFresh() {
        sessionStore.clear()
        if Self.isUITesting {
            loadMockTracks()
        } else {
            Task { await loadLibrary() }
        }
    }

    func resumeSession() {
        guard let session = sessionStore.load() else {
            Task { await loadLibrary() }
            return
        }
        tracks    = session.tracks
        cursor    = session.cursor
        kept      = session.kept
        removed   = session.removed
        skipped   = session.skipped
        sortOrder = session.sortOrder
        phase     = .sifting
        Task { await playCurrentTrack() }
    }

    private func loadLibrary() async {
        phase = .loading
        loadMessage = "Loading library…"
        loadProgress = 0

        do {
            var allTracks = try await musicService.loadLibrary()
            loadMessage = "Sorting \(allTracks.count) tracks…"
            loadProgress = 0.9

            allTracks = sortedTracks(allTracks, by: sortOrder)
            tracks    = allTracks
            cursor    = 0
            kept      = []
            removed   = []
            skipped   = []

            loadProgress = 1.0
            phase = .sifting
            await playCurrentTrack()
        } catch {
            loadMessage = "Error: \(error.localizedDescription)"
        }
    }

    // MARK: - Sort

    func sortedTracks(_ tracks: [Track], by order: SortOrder) -> [Track] {
        switch order {
        case .leastPlayed: return tracks.sorted { $0.playCount < $1.playCount }
        case .mostPlayed:  return tracks.sorted { $0.playCount > $1.playCount }
        case .oldest:      return tracks.sorted { $0.dateAdded < $1.dateAdded }
        case .newest:      return tracks.sorted { $0.dateAdded > $1.dateAdded }
        case .random:      return tracks.shuffled()
        }
    }

    // MARK: - Testing hooks

    private func loadMockTracks() {
        tracks = [
            Track(id: "mock-1", name: "Mock Song One", artist: "Artist A",
                  album: "Album One", duration: 240, playCount: 0, dateAdded: Date()),
            Track(id: "mock-2", name: "Mock Song Two", artist: "Artist B",
                  album: "Album Two", duration: 180, playCount: 5, dateAdded: Date()),
            Track(id: "mock-3", name: "Mock Song Three", artist: "Artist C",
                  album: "Album Three", duration: 300, playCount: 12, dateAdded: Date())
        ]
        cursor = 0
        kept = []; removed = []; skipped = []
        phase = .sifting
    }

    func loadTracks(_ tracks: [Track]) {
        self.tracks  = tracks
        self.cursor  = 0
        self.kept    = []
        self.removed = []
        self.skipped = []
        self.phase   = .sifting
    }

    func decideWithoutPlayback(_ decision: Decision) {
        guard let track = currentTrack else { return }
        switch decision {
        case .keep:   kept.append(track)
        case .remove: removed.append(track)
        case .skip:   skipped.append(track)
        }
        cursor += 1
        if cursor >= tracks.count { phase = .done }
    }

    // MARK: - Decisions

    func decide(_ decision: Decision) {
        guard let track = currentTrack else { return }

        switch decision {
        case .keep:   kept.append(track)
        case .remove: removed.append(track)   // collected for manual deletion at the end
        case .skip:   skipped.append(track)
        }

        cursor += 1

        if cursor >= tracks.count {
            phase = .done
            stopPositionPolling()
            saveSession()
        } else {
            saveSession()
            Task { await playCurrentTrack() }
        }
    }

    // MARK: - Playback

    func playCurrentTrack() async {
        guard !Self.isUITesting else { return }
        guard let track = currentTrack else { return }

        try? await musicService.play(trackID: track.id, at: 0)
        isPlaying = true
        currentArtwork = await musicService.artwork(forTrackID: track.id)
        startPositionPolling()
    }

    func seek(to position: Double) {
        Task {
            await musicService.seek(to: position)
            playbackPosition = position
        }
    }

    func skipBackward() {
        seek(to: max(0, playbackPosition - 20))
    }

    func skipForward() {
        guard let track = currentTrack else { return }
        seek(to: min(track.duration, playbackPosition + 20))
    }

    func togglePlayPause() {
        Task {
            if isPlaying {
                try? await musicService.pause()
            } else {
                try? await musicService.resume()
            }
            isPlaying.toggle()
        }
    }

    // MARK: - Position polling

    private func startPositionPolling() {
        stopPositionPolling()
        positionTask = Task {
            while !Task.isCancelled {
                let pos = await musicService.currentPosition()
                self.playbackPosition = pos
                try? await Task.sleep(for: .milliseconds(500))
            }
        }
    }

    private func stopPositionPolling() {
        positionTask?.cancel()
        positionTask = nil
    }

    // MARK: - Session persistence

    private func saveSession() {
        let session = SiftSession(
            tracks: tracks,
            cursor: cursor,
            kept: kept,
            removed: removed,
            skipped: skipped,
            sortOrder: sortOrder,
            savedAt: Date()
        )
        sessionStore.save(session)
    }

    // MARK: - Removal playlist

    func createRemovalPlaylist() {
        guard !removed.isEmpty else { return }
        isCreatingPlaylist = true
        removalPlaylistError = nil
        Task {
            do {
                try await playlistService.addToRemovalPlaylist(tracks: removed)
                removalPlaylistCreated = true
            } catch {
                removalPlaylistError = error.localizedDescription
            }
            isCreatingPlaylist = false
        }
    }

}

// MARK: - Safe subscript

extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
