import SwiftUI

@main
struct SiftApp: App {
    @StateObject private var viewModel = SiftViewModel()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(viewModel)
        }
    }
}
