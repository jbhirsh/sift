import SwiftUI

struct SetupView: View {
    @EnvironmentObject var vm: SiftViewModel
    @State private var isRequestingAccess = false
    @State private var accessDenied = false

    var body: some View {
        VStack(spacing: 32) {
            Spacer()

            VStack(spacing: 8) {
                Text("sift.")
                    .font(.system(size: 48, weight: .bold, design: .rounded))
                Text("Clean up your music library.")
                    .font(.title3)
                    .foregroundStyle(.secondary)
            }

            if let error = vm.loadError {
                Label(error, systemImage: "exclamationmark.triangle")
                    .font(.callout)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            } else if accessDenied {
                Label(
                    "Music library access denied. Allow it in Settings → Privacy & Security → Media & Apple Music.",
                    systemImage: "exclamationmark.triangle"
                )
                    .font(.callout)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }

            VStack(alignment: .leading, spacing: 12) {
                Text("Sort by")
                    .font(.headline)

                Picker("Sort order", selection: $vm.sortOrder) {
                    ForEach(SortOrder.allCases, id: \.self) { order in
                        Text(order.displayName).tag(order)
                    }
                }
                .pickerStyle(.inline)
            }
            .padding()
            .background(.quaternary, in: RoundedRectangle(cornerRadius: 12))

            VStack(spacing: 12) {
                if vm.hasSavedSession {
                    Button("Resume Previous Session") {
                        Task { await authorize { vm.resumeSession() } }
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                }

                if vm.hasSavedSession {
                    Button("Start Fresh") {
                        Task { await authorize { vm.startFresh() } }
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.large)
                } else {
                    Button("Start Sifting") {
                        Task { await authorize { vm.startFresh() } }
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                }
            }
            .disabled(isRequestingAccess)

            Spacer()
        }
        .padding(40)
    }

    private func authorize(then action: @escaping () -> Void) async {
        guard !SiftViewModel.isUITesting else { action(); return }
        isRequestingAccess = true
        let granted = await vm.requestMusicAuthorization()
        isRequestingAccess = false
        if granted {
            accessDenied = false
            action()
        } else {
            accessDenied = true
        }
    }
}
