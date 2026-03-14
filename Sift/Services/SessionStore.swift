import Foundation

final class SessionStore {
    private let fileURL: URL

    init(directory: URL? = nil) {
        let dir: URL
        if let directory {
            dir = directory
        } else {
            let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            dir = appSupport.appendingPathComponent("Sift", isDirectory: true)
        }
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        fileURL = dir.appendingPathComponent("session.json")
    }

    func save(_ session: SiftSession) {
        do {
            let data = try JSONEncoder().encode(session)
            try data.write(to: fileURL, options: .atomic)
        } catch {
            print("SessionStore: failed to save — \(error)")
        }
    }

    func load() -> SiftSession? {
        guard let data = try? Data(contentsOf: fileURL) else { return nil }
        return try? JSONDecoder().decode(SiftSession.self, from: data)
    }

    func clear() {
        try? FileManager.default.removeItem(at: fileURL)
    }

    var exists: Bool {
        FileManager.default.fileExists(atPath: fileURL.path)
    }
}
