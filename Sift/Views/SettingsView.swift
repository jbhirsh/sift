import SwiftUI

struct SettingsView: View {
    var body: some View {
        VStack(spacing: 12) {
            Text("Sift")
                .font(.headline)
            Text("Version 1.0.0")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(width: 300, height: 120)
    }
}
