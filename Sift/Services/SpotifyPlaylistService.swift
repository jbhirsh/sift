import Foundation

// MARK: - SpotifyPlaylistService

final class SpotifyPlaylistService: PlaylistService {
    private let authManager = SpotifyAuthManager.shared
    private let playlistName = "Sift — To Remove"

    // swiftlint:disable:next force_unwrapping
    private static let meURL = URL(string: "https://api.spotify.com/v1/me")!

    func addToRemovalPlaylist(tracks: [Track]) async throws {
        guard !tracks.isEmpty else { return }

        try await authManager.refreshTokenIfNeeded()
        guard let token = authManager.accessToken else {
            throw SpotifyError.notAuthenticated
        }

        let userID = try await fetchUserID(token: token)
        let playlistID = try await createPlaylist(userID: userID, token: token)
        try await addTracks(playlistID: playlistID, trackIDs: tracks.map(\.id), token: token)
    }

    // MARK: - API calls

    private func fetchUserID(token: String) async throws -> String {
        var request = URLRequest(url: Self.meURL)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        let (data, response) = try await URLSession.shared.data(for: request)
        try validateResponse(response)

        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let id = json["id"] as? String else {
            throw SpotifyError.apiError(0, "Could not parse user profile")
        }
        return id
    }

    private func createPlaylist(userID: String, token: String) async throws -> String {
        guard let url = URL(string: "https://api.spotify.com/v1/users/\(userID)/playlists") else {
            throw SpotifyError.apiError(0, "Invalid user ID")
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: Any] = [
            "name": playlistName,
            "description": "Tracks marked for removal by Sift",
            "public": false
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)
        try validateResponse(response)

        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let id = json["id"] as? String else {
            throw SpotifyError.apiError(0, "Could not create playlist")
        }
        return id
    }

    private func addTracks(playlistID: String, trackIDs: [String], token: String) async throws {
        let uris = trackIDs.map { "spotify:track:\($0)" }

        for chunk in stride(from: 0, to: uris.count, by: 100) {
            let end = min(chunk + 100, uris.count)
            let batch = Array(uris[chunk..<end])

            guard let url = URL(string: "https://api.spotify.com/v1/playlists/\(playlistID)/tracks") else {
                throw SpotifyError.apiError(0, "Invalid playlist ID")
            }
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: ["uris": batch])

            let (_, response) = try await URLSession.shared.data(for: request)
            try validateResponse(response)
        }
    }

    private func validateResponse(_ response: URLResponse) throws {
        guard let httpResponse = response as? HTTPURLResponse else {
            throw SpotifyError.apiError(0, "Invalid response")
        }
        guard (200...299).contains(httpResponse.statusCode) else {
            throw SpotifyError.apiError(httpResponse.statusCode, "Request failed")
        }
    }
}
