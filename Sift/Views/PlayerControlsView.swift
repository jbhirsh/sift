import SwiftUI

struct PlayerControlsView: View {
    @EnvironmentObject var vm: SiftViewModel

    var body: some View {
        VStack(spacing: 4) {
            // Seek bar
            if let track = vm.currentTrack {
                HStack(spacing: 8) {
                    Text(formatTime(vm.playbackPosition))
                        .font(.caption2.monospacedDigit())
                        .foregroundStyle(.tertiary)
                        .frame(width: 32, alignment: .trailing)

                    Slider(
                        value: Binding(
                            get: { vm.playbackPosition },
                            set: { vm.seek(to: $0) }
                        ),
                        in: 0...max(track.duration, 1)
                    )
                    .tint(.secondary)

                    Text(formatTime(track.duration))
                        .font(.caption2.monospacedDigit())
                        .foregroundStyle(.tertiary)
                        .frame(width: 32, alignment: .leading)
                }
            }

            // Playback controls
            HStack(spacing: 24) {
                Button { vm.skipBackward() } label: {
                    Image(systemName: "gobackward.15")
                        .font(.callout)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)

                Button { vm.togglePlayPause() } label: {
                    Image(systemName: vm.isPlaying ? "pause.fill" : "play.fill")
                        .font(.body)
                }
                .buttonStyle(.plain)

                Button { vm.skipForward() } label: {
                    Image(systemName: "goforward.15")
                        .font(.callout)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
            }
        }
    }

    private func formatTime(_ seconds: Double) -> String {
        let minutes = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%d:%02d", minutes, secs)
    }
}
