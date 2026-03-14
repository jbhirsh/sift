import Foundation

struct Section: Identifiable, Codable {
    let id: UUID
    let start: Double    // seconds into track
    let label: String    // "intro", "chorus", "outro", or timestamp string
    let isChorus: Bool

    init(start: Double, label: String, isChorus: Bool) {
        self.id = UUID()
        self.start = start
        self.label = label
        self.isChorus = isChorus
    }
}
