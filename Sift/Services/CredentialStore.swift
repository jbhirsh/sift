import Foundation
import Security

/// Stores Spotify credentials in the macOS Keychain.
enum CredentialStore {
    private static let service = "com.jessicahirsh.sift"

    static func save(clientID: String, clientSecret: String) {
        set(key: "spotify_client_id", value: clientID)
        set(key: "spotify_client_secret", value: clientSecret)
    }

    static func load() -> (clientID: String, clientSecret: String) {
        let id = get(key: "spotify_client_id") ?? ""
        let secret = get(key: "spotify_client_secret") ?? ""
        return (id, secret)
    }

    static func clear() {
        delete(key: "spotify_client_id")
        delete(key: "spotify_client_secret")
    }

    // MARK: - Private

    private static func set(key: String, value: String) {
        let data = Data(value.utf8)
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: key
        ]
        SecItemDelete(query as CFDictionary)
        let attrs: [CFString: Any] = query.merging([kSecValueData: data]) { $1 }
        SecItemAdd(attrs as CFDictionary, nil)
    }

    private static func get(key: String) -> String? {
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: key,
            kSecReturnData: true,
            kSecMatchLimit: kSecMatchLimitOne
        ]
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private static func delete(key: String) {
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: key
        ]
        SecItemDelete(query as CFDictionary)
    }
}
