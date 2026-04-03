import SwiftUI

enum AppPhase: Equatable {
    case setup
    case loading
    case sifting
    case paused
    case done
}

enum ConnectionStatus: Equatable {
    case unknown
    case checking
    case connected
    case disconnected
}

@MainActor
final class SiftViewModel: ObservableObject {
    // MARK: - Phase
    @Published var phase: AppPhase = .setup

    // MARK: - Provider
    @Published var provider: MusicProvider = .appleMusic

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
    @Published var loadError: String?

    // MARK: - Playback state
    @Published var playbackPosition: Double = 0
    @Published var isPlaying: Bool = false

    // MARK: - Session resume
    @Published var hasSavedSession: Bool = false

    // MARK: - Removal playlist
    @Published var removalPlaylistCreated: Bool = false
    @Published var removalPlaylistError: String?
    @Published var isCreatingPlaylist: Bool = false

    // MARK: - Connection status
    @Published var connectionStatus: ConnectionStatus = .unknown

    // MARK: - Services
    private var musicService: any MusicServiceProtocol
    private let sessionStore = SessionStore()
    private var playlistService: any PlaylistService

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

    init(
        musicService: (any MusicServiceProtocol)? = nil,
        playlistService: any PlaylistService = MusicKitPlaylistService(),
        provider: MusicProvider = .appleMusic
    ) {
        self.provider = provider
        self.musicService = musicService ?? Self.createMusicService(for: provider)
        self.playlistService = playlistService
        hasSavedSession = sessionStore.exists
        if Self.isUITesting { loadMockTracks() }
    }

    // MARK: - Provider switching

    func selectProvider(_ newProvider: MusicProvider) {
        guard newProvider != provider else { return }
        provider = newProvider
        musicService = Self.createMusicService(for: newProvider)
        playlistService = Self.createPlaylistService(for: newProvider)
    }

    private static func createMusicService(for provider: MusicProvider) -> any MusicServiceProtocol {
        switch provider {
        case .appleMusic:
            #if targetEnvironment(simulator)
            return SimulatorMusicService()
            #else
            return AppleMusicService()
            #endif
        case .spotify:
            return SpotifyService()
        }
    }

    private static func createPlaylistService(for provider: MusicProvider) -> any PlaylistService {
        switch provider {
        case .appleMusic: return MusicKitPlaylistService()
        case .spotify:    return SpotifyPlaylistService()
        }
    }

    // MARK: - Authorization

    func requestMusicAuthorization() async -> Bool {
        await musicService.requestAuthorization()
    }

    // MARK: - Connection check

    func checkConnection() async {
        connectionStatus = .checking
        let authorized = await musicService.isAuthorized
        connectionStatus = authorized ? .connected : .disconnected
    }

    // MARK: - Load library

    @discardableResult
    func startFresh() -> Task<Void, Never> {
        sessionStore.clear()
        if Self.isUITesting {
            loadMockTracks()
            return Task {}
        } else {
            return Task { await loadLibrary() }
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
        if let savedProvider = session.provider {
            provider = savedProvider
            musicService = Self.createMusicService(for: savedProvider)
            playlistService = Self.createPlaylistService(for: savedProvider)
        }
        phase     = .sifting
        Task { await playCurrentTrack() }
    }

    private func loadLibrary() async {
        phase = .loading
        loadMessage = "Loading library…"
        loadProgress = 0
        loadError = nil

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
        } catch let musicErr as MusicError {
            loadError = musicErr.localizedDescription
            phase = .setup
        } catch let spotifyErr as SpotifyError {
            loadError = spotifyErr.localizedDescription
            phase = .setup
        } catch let authErr as SpotifyAuthError {
            loadError = authErr.localizedDescription
            phase = .setup
        } catch {
            loadError = friendlyLoadError(error)
            phase = .setup
        }
    }

    private func friendlyLoadError(_ error: Error) -> String {
        let raw = error.localizedDescription.lowercased()
        if raw.contains("unknown") || raw.contains("not available") {
            return "Could not connect to your Music library. " +
                   "Make sure the Music app is installed on this device, then try again."
        }
        return "Could not load your Music library. \(error.localizedDescription)"
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

    // MARK: - Stop session

    func stopSession() {
        stopPositionPolling()
        Task { try? await musicService.pause() }
        saveSession()
        phase = .paused
    }

    func resumeFromPause() {
        phase = .sifting
        Task { await playCurrentTrack() }
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
            sessionStore.clear()    // completed — nothing to resume on next launch
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
        startPositionPolling()
    }

    func seek(to position: Double) {
        Task {
            await musicService.seek(to: position)
            playbackPosition = position
        }
    }

    func skipBackward() {
        seek(to: max(0, playbackPosition - 15))
    }

    func skipForward() {
        guard let track = currentTrack else { return }
        seek(to: min(track.duration, playbackPosition + 15))
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
                if let spotify = musicService as? SpotifyService {
                    await spotify.refreshPlaybackState()
                }
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
            savedAt: Date(),
            provider: provider
        )
        sessionStore.save(session)
    }

    // MARK: - Removal playlist

    @discardableResult
    func createRemovalPlaylist() -> Task<Void, Never>? {
        guard !removed.isEmpty else { return nil }
        isCreatingPlaylist = true
        removalPlaylistError = nil
        return Task {
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
