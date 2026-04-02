import Foundation
import UIKit

// MARK: - SpotifyError

enum SpotifyError: Error, LocalizedError {
    case notAuthenticated
    case forbidden
    case apiError(Int, String)

    var errorDescription: String? {
        switch self {
        case .notAuthenticated:
            return "Not logged in to Spotify. Please log in first."
        case .forbidden:
            return "Spotify denied access to your library. Please sign out and sign back in."
        case .apiError(let code, let message):
            return "Spotify error (\(code)): \(message)"
        }
    }
}

// MARK: - PlaybackMode

private enum PlaybackMode {
    case appRemote   // Full playback via SPTAppRemote (Spotify app installed)
    case preview     // 30-second previews via AVPlayer (no Spotify app)
}

// MARK: - SpotifyService

actor SpotifyService: MusicServiceProtocol {
    private let authManager = SpotifyAuthManager.shared

    // Playback mode — determined after authorization
    private var playbackMode: PlaybackMode = .preview

    // Cached playback state (updated via refreshPlaybackState)
    private var cachedPosition: Double = 0
    private var cachedIsPaused: Bool = true

    // Preview playback (used in .preview mode)
    private var previewPlayer: PreviewAudioPlayer?
    private var trackPreviewURLs: [String: URL] = [:]

    // MARK: - Authorization

    func requestAuthorization() async -> Bool {
        do {
            try await authManager.authorize()

            // Detect whether the Spotify app is available for full playback
            let spotifyInstalled = await MainActor.run {
                guard let spotifyURL = URL(string: "spotify://") else { return false }
                return UIApplication.shared.canOpenURL(spotifyURL)
            }

            if spotifyInstalled {
                playbackMode = .appRemote
                // Provide the token to the bridge for SPTAppRemote connection
                await MainActor.run {
                    if let token = authManager.accessToken {
                        SpotifyRemoteBridge.shared.accessToken = token
                    }
                }
            } else {
                playbackMode = .preview
                previewPlayer = await PreviewAudioPlayer()
            }

            return true
        } catch {
            return false
        }
    }

    var isAuthorized: Bool {
        authManager.isAuthenticated
    }

    // MARK: - Library (Web API)

    func loadLibrary() async throws -> [Track] {
        try await authManager.refreshTokenIfNeeded()
        guard let token = authManager.accessToken else {
            throw SpotifyError.notAuthenticated
        }

        var allTracks: [Track] = []
        var nextURL: URL? = URL(string: "https://api.spotify.com/v1/me/tracks?limit=50")

        while let url = nextURL {
            var request = URLRequest(url: url)
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

            let (data, response) = try await URLSession.shared.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse else {
                throw SpotifyError.apiError(0, "Invalid response")
            }
            guard httpResponse.statusCode == 200 else {
                if httpResponse.statusCode == 401 {
                    throw SpotifyError.notAuthenticated
                }
                if httpResponse.statusCode == 403 {
                    throw SpotifyError.forbidden
                }
                throw SpotifyError.apiError(httpResponse.statusCode, "Failed to load library")
            }

            let page = try JSONDecoder().decode(SpotifyPage.self, from: data)

            for item in page.items {
                let spotifyTrack = item.track

                let artworkURL = spotifyTrack.album.images
                    .sorted { $0.width ?? 0 > $1.width ?? 0 }
                    .first
                    .flatMap { URL(string: $0.url) }

                let previewURL = spotifyTrack.previewURL.flatMap { URL(string: $0) }
                if let previewURL {
                    trackPreviewURLs[spotifyTrack.id] = previewURL
                }

                let track = Track(
                    id: spotifyTrack.id,
                    name: spotifyTrack.name,
                    artist: spotifyTrack.artists.map(\.name).joined(separator: ", "),
                    album: spotifyTrack.album.name,
                    duration: Double(spotifyTrack.durationMs) / 1000.0,
                    playCount: 0,
                    dateAdded: item.addedAt ?? Date.distantPast,
                    artworkURL: artworkURL,
                    previewURL: previewURL
                )
                allTracks.append(track)
            }

            nextURL = page.next.flatMap { URL(string: $0) }
        }

        return allTracks
    }

    // MARK: - Playback

    func play(trackID: String, at position: Double) async throws {
        switch playbackMode {
        case .appRemote:
            let bridge = await SpotifyRemoteBridge.shared
            let uri = "spotify:track:\(trackID)"
            try await bridge.play(spotifyURI: uri)
            if position > 0 {
                try await bridge.seek(to: Int(position * 1000))
            }
            cachedIsPaused = false

        case .preview:
            guard let url = trackPreviewURLs[trackID] else {
                // No preview available — silently skip audio
                cachedIsPaused = true
                cachedPosition = 0
                return
            }
            await previewPlayer?.play(url: url, at: position)
            cachedIsPaused = false
        }
        cachedPosition = position
    }

    func pause() async throws {
        switch playbackMode {
        case .appRemote:
            let bridge = await SpotifyRemoteBridge.shared
            try await bridge.pause()
        case .preview:
            await previewPlayer?.pause()
        }
        cachedIsPaused = true
    }

    func resume() async throws {
        switch playbackMode {
        case .appRemote:
            let bridge = await SpotifyRemoteBridge.shared
            try await bridge.resume()
        case .preview:
            await previewPlayer?.resume()
        }
        cachedIsPaused = false
    }

    func currentPosition() -> Double {
        cachedPosition
    }

    func seek(to position: Double) async {
        switch playbackMode {
        case .appRemote:
            let bridge = await SpotifyRemoteBridge.shared
            try? await bridge.seek(to: Int(position * 1000))
        case .preview:
            await previewPlayer?.seek(to: position)
        }
        cachedPosition = position
    }

    func isPlaying() -> Bool {
        !cachedIsPaused
    }

    /// Refresh cached playback state from the active playback source.
    func refreshPlaybackState() async {
        switch playbackMode {
        case .appRemote:
            do {
                let bridge = await SpotifyRemoteBridge.shared
                let state = try await bridge.getPlayerState()
                cachedPosition = Double(state.playbackPosition) / 1000.0
                cachedIsPaused = state.isPaused
            } catch {
                // Connection lost; leave cached values
            }

        case .preview:
            if let player = previewPlayer {
                cachedPosition = await player.currentPosition
                cachedIsPaused = await !player.isPlaying
            }
        }
    }
}

// MARK: - Spotify API Models

struct SpotifyPage: Decodable {
    let items: [SpotifySavedTrack]
    let next: String?
}

struct SpotifySavedTrack: Decodable {
    let addedAt: Date?
    let track: SpotifyTrack

    enum CodingKeys: String, CodingKey {
        case addedAt = "added_at"
        case track
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        track = try container.decode(SpotifyTrack.self, forKey: .track)

        if let dateString = try container.decodeIfPresent(String.self, forKey: .addedAt) {
            let formatter = ISO8601DateFormatter()
            addedAt = formatter.date(from: dateString)
        } else {
            addedAt = nil
        }
    }
}

struct SpotifyTrack: Decodable {
    let id: String
    let name: String
    let artists: [SpotifyArtist]
    let album: SpotifyAlbum
    let durationMs: Int
    let previewURL: String?

    enum CodingKeys: String, CodingKey {
        case id, name, artists, album
        case durationMs = "duration_ms"
        case previewURL = "preview_url"
    }
}

struct SpotifyArtist: Decodable {
    let name: String
}

struct SpotifyAlbum: Decodable {
    let name: String
    let images: [SpotifyImage]
}

struct SpotifyImage: Decodable {
    let url: String
    let width: Int?
    let height: Int?
}
