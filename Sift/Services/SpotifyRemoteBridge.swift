import Foundation
import SpotifyiOS
import UIKit

// MARK: - SpotifyRemoteBridge

@MainActor
final class SpotifyRemoteBridge: NSObject {
    static let shared = SpotifyRemoteBridge()

    private(set) var appRemote: SPTAppRemote
    private var connectionContinuation: CheckedContinuation<Void, Error>?
    private var authContinuation: CheckedContinuation<String, Error>?

    private(set) var lastPlayerState: SPTAppRemotePlayerState?
    private(set) var isConnected: Bool = false
    var accessToken: String?

    override init() {
        let config = SPTConfiguration(
            clientID: SpotifyAuthManager.clientID,
            redirectURL: URL(string: "sift-music://spotify-callback")! // swiftlint:disable:this force_unwrapping
        )
        appRemote = SPTAppRemote(configuration: config, logLevel: .none)
        super.init()
        appRemote.delegate = self
    }

    // MARK: - Auth

    func authorize() async throws -> String {
        let spotifyURL = URL(string: "spotify://")! // swiftlint:disable:this force_unwrapping
        guard UIApplication.shared.canOpenURL(spotifyURL) else {
            throw SpotifyAuthError.spotifyAppNotInstalled
        }

        return try await withCheckedThrowingContinuation { continuation in
            self.authContinuation = continuation
            self.appRemote.authorizeAndPlayURI(
                "",
                asRadio: false,
                additionalScopes: [
                    "user-library-read",
                    "playlist-modify-public",
                    "playlist-modify-private"
                ]
            )
        }
    }

    func handleOpenURL(_ url: URL) {
        let params = appRemote.authorizationParameters(from: url)
        if let token = params?[SPTAppRemoteAccessTokenKey] {
            accessToken = token
            appRemote.connectionParameters.accessToken = token
            authContinuation?.resume(returning: token)
            authContinuation = nil
        } else {
            let reason = params?[SPTAppRemoteErrorDescriptionKey] ?? "Unknown error"
            authContinuation?.resume(throwing: SpotifyAuthError.authFailed(reason))
            authContinuation = nil
        }
    }

    // MARK: - Connection

    func connect() async throws {
        guard let token = accessToken else {
            throw SpotifyAuthError.notAuthenticated
        }
        guard !isConnected else { return }

        appRemote.connectionParameters.accessToken = token

        return try await withCheckedThrowingContinuation { continuation in
            self.connectionContinuation = continuation
            self.appRemote.connect()
        }
    }

    func disconnect() {
        appRemote.disconnect()
    }

    // MARK: - Playback

    func play(spotifyURI: String) async throws {
        try await ensureConnected()
        return try await withCheckedThrowingContinuation { continuation in
            self.appRemote.playerAPI?.play(spotifyURI) { _, error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume()
                }
            }
        }
    }

    func pause() async throws {
        guard isConnected else { return }
        return try await withCheckedThrowingContinuation { continuation in
            self.appRemote.playerAPI?.pause { _, error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume()
                }
            }
        }
    }

    func resume() async throws {
        try await ensureConnected()
        return try await withCheckedThrowingContinuation { continuation in
            self.appRemote.playerAPI?.resume { _, error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume()
                }
            }
        }
    }

    func seek(to positionMs: Int) async throws {
        guard isConnected else { return }
        return try await withCheckedThrowingContinuation { continuation in
            self.appRemote.playerAPI?.seek(toPosition: positionMs) { _, error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume()
                }
            }
        }
    }

    func getPlayerState() async throws -> SPTAppRemotePlayerState {
        try await ensureConnected()
        return try await withCheckedThrowingContinuation { continuation in
            self.appRemote.playerAPI?.getPlayerState { result, error in
                if let state = result as? SPTAppRemotePlayerState {
                    continuation.resume(returning: state)
                } else {
                    continuation.resume(
                        throwing: error ?? SpotifyError.apiError(0, "No player state")
                    )
                }
            }
        }
    }

    private func ensureConnected() async throws {
        if !isConnected {
            try await connect()
        }
    }
}

// MARK: - SPTAppRemoteDelegate

extension SpotifyRemoteBridge: SPTAppRemoteDelegate {
    nonisolated func appRemoteDidEstablishConnection(_ appRemote: SPTAppRemote) {
        Task { @MainActor in
            self.isConnected = true
            appRemote.playerAPI?.delegate = self
            appRemote.playerAPI?.subscribe(toPlayerState: nil)
            self.connectionContinuation?.resume()
            self.connectionContinuation = nil
        }
    }

    nonisolated func appRemote(
        _ appRemote: SPTAppRemote,
        didFailConnectionAttemptWithError error: (any Error)?
    ) {
        Task { @MainActor in
            self.isConnected = false
            let err = error ?? SpotifyAuthError.authFailed("Connection failed")
            self.connectionContinuation?.resume(throwing: err)
            self.connectionContinuation = nil
        }
    }

    nonisolated func appRemote(
        _ appRemote: SPTAppRemote,
        didDisconnectWithError error: (any Error)?
    ) {
        Task { @MainActor in
            self.isConnected = false
            self.lastPlayerState = nil
        }
    }
}

// MARK: - SPTAppRemotePlayerStateDelegate

extension SpotifyRemoteBridge: SPTAppRemotePlayerStateDelegate {
    nonisolated func playerStateDidChange(_ playerState: SPTAppRemotePlayerState) {
        Task { @MainActor in
            self.lastPlayerState = playerState
        }
    }
}
