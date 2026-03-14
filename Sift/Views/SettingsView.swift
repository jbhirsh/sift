import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var vm: CullViewModel
    @State private var clientID: String = ""
    @State private var clientSecret: String = ""
    @State private var saved: Bool = false

    var body: some View {
        Form {
            Section("Spotify (optional)") {
                TextField("Client ID", text: $clientID)
                SecureField("Client Secret", text: $clientSecret)

                HStack {
                    Button("Save") {
                        vm.updateSpotifyCredentials(clientID: clientID, clientSecret: clientSecret)
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

                Text("Create a free Spotify Developer app at developer.spotify.com to enable section jump buttons.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .formStyle(.grouped)
        .frame(width: 400)
        .onAppear {
            let (id, secret) = CredentialStore.load()
            clientID = id
            clientSecret = secret
        }
    }
}
