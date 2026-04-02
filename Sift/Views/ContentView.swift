import SwiftUI

struct ContentView: View {
    @EnvironmentObject var vm: SiftViewModel
    @State private var showSettings = false

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Group {
                switch vm.phase {
                case .setup:
                    SetupView()
                case .loading:
                    LoadingView()
                case .sifting:
                    SiftView()
                case .paused, .done:
                    DoneView()
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            if vm.phase != .setup {
                Button { showSettings = true } label: {
                    Image(systemName: "gearshape")
                        .font(.body.weight(.medium))
                        .foregroundStyle(.secondary)
                        .frame(width: 40, height: 40)
                        .background(.quaternary, in: Circle())
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 24)
                .padding(.vertical, 12)
                .accessibilityIdentifier("settings-button")
            }
        }
        .animation(SiftViewModel.isUITesting ? nil : .easeInOut(duration: 0.3), value: vm.phase)
        .sheet(isPresented: $showSettings) {
            SettingsView()
                .environmentObject(vm)
        }
    }
}
