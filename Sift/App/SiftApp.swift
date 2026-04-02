import SwiftUI

@main
struct SiftApp: App {
    @StateObject private var viewModel = SiftViewModel()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(viewModel)
                .onOpenURL { url in
                    SpotifyRemoteBridge.shared.handleOpenURL(url)
                }
                .onChange(of: scenePhase) { _, newPhase in
                    let spotifyAppAvailable = UIApplication.shared.canOpenURL(
                        URL(string: "spotify://")! // swiftlint:disable:this force_unwrapping
                    )
                    guard spotifyAppAvailable else { return }

                    switch newPhase {
                    case .active:
                        if SpotifyRemoteBridge.shared.accessToken != nil {
                            Task { try? await SpotifyRemoteBridge.shared.connect() }
                        }
                    case .background:
                        SpotifyRemoteBridge.shared.disconnect()
                    default:
                        break
                    }
                }
        }
    }
}
