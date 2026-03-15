import SwiftUI

enum AppPhase {
    case setup
    case loading
    case culling
    case done
}

@MainActor
final class CullViewModel: ObservableObject {
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
    @Published var currentSections: [Section] = []
    @Published var artwork: NSImage?

    // MARK: - Session resume
    @Published var hasSavedSession: Bool = false

    // MARK: - Services
    private let musicService = MusicService()
    private let sessionStore = SessionStore()
    private lazy var spotifyService: SpotifyService = {
        let (id, secret) = CredentialStore.load()
        return SpotifyService(clientID: id, clientSecret: secret)
    }()

    // MARK: - Timers
    private var positionTask: Task<Void, Never>?

    // MARK: - Computed
    var currentTrack: Track? { tracks[safe: cursor] }
    var nextTrack: Track? { tracks[safe: cursor + 1] }
    var nextNextTrack: Track? { tracks[safe: cursor + 2] }
    var remaining: Int { max(0, tracks.count - cursor) }
    var total: Int { tracks.count }

    init() {
        hasSavedSession = sessionStore.exists
    }

    // MARK: - Load library

    func startFresh() {
        sessionStore.clear()
        Task { await loadLibrary() }
    }

    func resumeSession() {
        guard let session = sessionStore.load() else {
            Task { await loadLibrary() }
            return
        }
        tracks   = session.tracks
        cursor   = session.cursor
        kept     = session.kept
        removed  = session.removed
        skipped  = session.skipped
        sortOrder = session.sortOrder
        phase    = .culling
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

            allTracks = sort(allTracks, by: sortOrder)
            tracks = allTracks
            cursor = 0
            kept   = []
            removed = []
            skipped = []

            loadProgress = 1.0
            phase = .culling
            await playCurrentTrack()
        } catch {
            loadMessage = "Error: \(error.localizedDescription)"
        }
    }

    private func sort(_ tracks: [Track], by order: SortOrder) -> [Track] {
        sortedTracks(tracks, by: order)
    }

    // Exposed for testing
    func sortedTracks(_ tracks: [Track], by order: SortOrder) -> [Track] {
        switch order {
        case .leastPlayed: return tracks.sorted { $0.playCount < $1.playCount }
        case .mostPlayed:  return tracks.sorted { $0.playCount > $1.playCount }
        case .oldest:      return tracks.sorted { $0.dateAdded < $1.dateAdded }
        case .newest:      return tracks.sorted { $0.dateAdded > $1.dateAdded }
        case .random:      return tracks.shuffled()
        }
    }

    // Exposed for testing — loads tracks without triggering Music.app
    func loadTracks(_ tracks: [Track]) {
        self.tracks = tracks
        self.cursor = 0
        self.kept   = []
        self.removed = []
        self.skipped = []
        self.phase  = .culling
    }

    // Exposed for testing — decides without triggering playback or deletion
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
        case .keep:
            kept.append(track)
        case .remove:
            removed.append(track)
            Task {
                try? await musicService.deleteTrack(id: track.id)
            }
        case .skip:
            skipped.append(track)
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
        guard let track = currentTrack else { return }

        try? await musicService.play(trackID: track.id, at: 0)
        isPlaying = true
        artwork = try? await musicService.artwork(forTrackID: track.id)
        startPositionPolling()

        currentSections = await spotifyService.sections(
            name: track.name,
            artist: track.artist,
            duration: track.duration
        )
    }

    func seek(to position: Double) {
        Task {
            try? await musicService.seek(to: position)
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
                if let pos = try? await musicService.currentPosition() {
                    await MainActor.run { self.playbackPosition = pos }
                }
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

    // MARK: - Spotify credentials

    func updateSpotifyCredentials(clientID: String, clientSecret: String) {
        CredentialStore.save(clientID: clientID, clientSecret: clientSecret)
        Task {
            await spotifyService.updateCredentials(clientID: clientID, clientSecret: clientSecret)
        }
    }
}

// MARK: - Safe subscript

extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
