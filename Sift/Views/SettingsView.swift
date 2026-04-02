import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var vm: SiftViewModel

    var body: some View {
        VStack(spacing: 24) {
            // MARK: - Header
            VStack(spacing: 4) {
                Text("Settings")
                    .font(.title3.bold())
                Text("Version 1.0.0")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(.top, 24)

            // MARK: - Connection status
            VStack(spacing: 12) {
                HStack {
                    Image(systemName: vm.provider.iconName)
                        .font(.title2)
                        .foregroundStyle(.secondary)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(vm.provider.displayName)
                            .font(.headline)
                        connectionLabel
                    }
                    Spacer()
                    connectionIndicator
                }

                Button {
                    Task { await vm.checkConnection() }
                } label: {
                    HStack {
                        Image(systemName: "arrow.triangle.2.circlepath")
                        Text("Check Connection")
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.regular)
                .disabled(vm.connectionStatus == .checking)
                .accessibilityIdentifier("check-connection-button")
            }
            .padding()
            .background(.quaternary, in: RoundedRectangle(cornerRadius: 12))

            Spacer()
        }
        .padding(.horizontal, 24)
        .presentationDetents([.medium])
        .task {
            if vm.connectionStatus == .unknown {
                await vm.checkConnection()
            }
        }
    }

    // MARK: - Connection subviews

    private var connectionLabel: some View {
        Group {
            switch vm.connectionStatus {
            case .unknown:
                Text("Not checked")
                    .foregroundStyle(.secondary)
            case .checking:
                Text("Checking…")
                    .foregroundStyle(.secondary)
            case .connected:
                Text("Connected")
                    .foregroundStyle(.green)
            case .disconnected:
                Text("Not connected")
                    .foregroundStyle(.red)
            }
        }
        .font(.caption)
        .accessibilityIdentifier("connection-status-label")
    }

    private var connectionIndicator: some View {
        Group {
            switch vm.connectionStatus {
            case .unknown:
                Image(systemName: "questionmark.circle")
                    .foregroundStyle(.secondary)
            case .checking:
                ProgressView()
                    .controlSize(.small)
            case .connected:
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(.green)
            case .disconnected:
                Image(systemName: "xmark.circle.fill")
                    .foregroundStyle(.red)
            }
        }
        .font(.title2)
        .accessibilityIdentifier("connection-status-indicator")
    }
}
