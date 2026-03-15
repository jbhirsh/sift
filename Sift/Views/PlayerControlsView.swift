import SwiftUI

struct PlayerControlsView: View {
    @EnvironmentObject var vm: SiftViewModel

    var body: some View {
        VStack(spacing: 8) {
            // Seek bar
            if let track = vm.currentTrack {
                HStack(spacing: 8) {
                    Text(formatTime(vm.playbackPosition))
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.secondary)
                        .frame(width: 36, alignment: .trailing)

                    Slider(
                        value: Binding(
                            get: { vm.playbackPosition },
                            set: { vm.seek(to: $0) }
                        ),
                        in: 0...max(track.duration, 1)
                    )

                    Text(formatTime(track.duration))
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.secondary)
                        .frame(width: 36, alignment: .leading)
                }
            }

            // Controls row
            HStack(spacing: 16) {
                // Skip backward
                Button {
                    vm.skipBackward()
                } label: {
                    Image(systemName: "gobackward.15")
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)

                // Play/pause
                Button {
                    vm.togglePlayPause()
                } label: {
                    Image(systemName: vm.isPlaying ? "pause.fill" : "play.fill")
                        .font(.title3)
                }
                .buttonStyle(.plain)

                // Skip forward
                Button {
                    vm.skipForward()
                } label: {
                    Image(systemName: "goforward.15")
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)

                Spacer()

                // Decision buttons
                DecisionButtonsView()
            }
        }
    }

    private func formatTime(_ seconds: Double) -> String {
        let minutes = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%d:%02d", minutes, secs)
    }
}
