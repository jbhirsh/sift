import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var viewModel: SiftViewModel
    @State private var clientID: String = ""
    @State private var clientSecret: String = ""
    @State private var saved: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Spotify Integration")
                .font(.headline)

            Text("Enables section jump buttons (intro, chorus, outro) for each track.")
                .font(.caption)
                .foregroundStyle(.secondary)

            VStack(alignment: .leading, spacing: 8) {
                TextField("Client ID", text: $clientID)
                    .textFieldStyle(.roundedBorder)
                SecureField("Client Secret", text: $clientSecret)
                    .textFieldStyle(.roundedBorder)
            }

            HStack {
                Button("Save") {
                    viewModel.updateSpotifyCredentials(clientID: clientID, clientSecret: clientSecret)
                    saved = true
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2) { saved = false }
                }
                .buttonStyle(.borderedProminent)
                .disabled(clientID.isEmpty || clientSecret.isEmpty)

                if saved {
                    Label("Saved", systemImage: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                        .transition(.opacity)
                }
            }

            Text("Create a free app at developer.spotify.com to get your credentials.")
                .font(.caption)
                .foregroundStyle(.secondary)

            Spacer()
        }
        .padding(24)
        .frame(width: 380, height: 260)
        .onAppear {
            let (id, secret) = CredentialStore.load()
            clientID = id
            clientSecret = secret
        }
    }
}
