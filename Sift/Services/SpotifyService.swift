import Foundation

struct SpotifySection: Codable {
    let start: Double
    let duration: Double
    let loudness: Double
    let tempo: Double
    let key: Int
    let mode: Int
    let timeSignature: Int

    enum CodingKeys: String, CodingKey {
        case start, duration, loudness, tempo, key, mode
        case timeSignature = "time_signature"
    }
}

struct SpotifyAudioAnalysis: Codable {
    let sections: [SpotifySection]
}

struct SpotifySearchTrack: Codable {
    let id: String
    let durationMs: Int

    enum CodingKeys: String, CodingKey {
        case id
        case durationMs = "duration_ms"
    }
}

struct SpotifySearchTracks: Codable {
    let items: [SpotifySearchTrack]
}

struct SpotifySearchResponse: Codable {
    let tracks: SpotifySearchTracks
}

struct SpotifyTokenResponse: Codable {
    let accessToken: String
    let expiresIn: Int

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case expiresIn = "expires_in"
    }
}

actor SpotifyService {
    private var clientID: String
    private var clientSecret: String
    private var cachedToken: String?
    private var tokenExpiresAt: Date = .distantPast

    init(clientID: String, clientSecret: String) {
        self.clientID = clientID
        self.clientSecret = clientSecret
    }

    func updateCredentials(clientID: String, clientSecret: String) {
        self.clientID = clientID
        self.clientSecret = clientSecret
        self.cachedToken = nil
        self.tokenExpiresAt = .distantPast
    }

    var hasCredentials: Bool {
        !clientID.isEmpty && !clientSecret.isEmpty
    }

    // MARK: - Public API

    func sections(name: String, artist: String, duration: Double) async -> [Section] {
        guard hasCredentials else {
            return fallbackSections(duration: duration)
        }

        do {
            let token = try await getToken()
            guard let trackID = try await searchTrack(name: name, artist: artist, token: token) else {
                return fallbackSections(duration: duration)
            }
            let analysis = try await audioAnalysis(trackID: trackID, token: token)
            return mapSections(analysis.sections, trackDuration: duration)
        } catch {
            return fallbackSections(duration: duration)
        }
    }

    // MARK: - Private

    private func getToken() async throws -> String {
        if let token = cachedToken, Date() < tokenExpiresAt {
            return token
        }

        guard let url = URL(string: "https://accounts.spotify.com/api/token") else {
            throw URLError(.badURL)
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"

        let credentials = "\(clientID):\(clientSecret)"
        let encoded = Data(credentials.utf8).base64EncodedString()
        request.setValue("Basic \(encoded)", forHTTPHeaderField: "Authorization")
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.httpBody = Data("grant_type=client_credentials".utf8)

        let (data, _) = try await URLSession.shared.data(for: request)
        let response = try JSONDecoder().decode(SpotifyTokenResponse.self, from: data)

        cachedToken = response.accessToken
        tokenExpiresAt = Date().addingTimeInterval(Double(response.expiresIn) - 30)
        return response.accessToken
    }

    private func searchTrack(name: String, artist: String, token: String) async throws -> String? {
        guard var components = URLComponents(string: "https://api.spotify.com/v1/search") else {
            throw URLError(.badURL)
        }
        components.queryItems = [
            URLQueryItem(name: "q", value: "\(name) \(artist)"),
            URLQueryItem(name: "type", value: "track"),
            URLQueryItem(name: "limit", value: "1")
        ]

        guard let searchURL = components.url else { throw URLError(.badURL) }
        var request = URLRequest(url: searchURL)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        let (data, _) = try await URLSession.shared.data(for: request)
        let response = try JSONDecoder().decode(SpotifySearchResponse.self, from: data)
        return response.tracks.items.first?.id
    }

    private func audioAnalysis(trackID: String, token: String) async throws -> SpotifyAudioAnalysis {
        guard let url = URL(string: "https://api.spotify.com/v1/audio-analysis/\(trackID)") else {
            throw URLError(.badURL)
        }
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        let (data, _) = try await URLSession.shared.data(for: request)
        return try JSONDecoder().decode(SpotifyAudioAnalysis.self, from: data)
    }

    private func mapSections(_ spotifySections: [SpotifySection], trackDuration: Double) -> [Section] {
        guard !spotifySections.isEmpty else {
            return fallbackSections(duration: trackDuration)
        }

        let count = spotifySections.count
        return spotifySections.enumerated().map { index, section in
            let label: String
            let isChorus: Bool

            if index == 0 {
                label = "intro"
                isChorus = false
            } else if index == count - 1 {
                label = "outro"
                isChorus = false
            } else {
                // Heuristic: louder + faster sections are more likely choruses
                let avgLoudness = spotifySections.map(\.loudness).reduce(0, +) / Double(count)
                isChorus = section.loudness > avgLoudness
                label = isChorus ? "chorus" : timestampString(section.start)
            }

            return Section(start: section.start, label: label, isChorus: isChorus)
        }
    }

    private func fallbackSections(duration: Double) -> [Section] {
        [Section(start: duration * 0.33, label: "chorus", isChorus: true)]
    }

    private func timestampString(_ seconds: Double) -> String {
        let minutes = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%d:%02d", minutes, secs)
    }
}
