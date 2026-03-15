import SwiftUI

struct PlayerControlsView: View {
    @EnvironmentObject var vm: CullViewModel

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
                    Image(systemName: "gobackward.20")
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
                    Image(systemName: "goforward.20")
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)

                Spacer()

                // Spotify section buttons
                if !vm.currentSections.isEmpty {
                    HStack(spacing: 6) {
                        ForEach(vm.currentSections) { section in
                            SectionButton(section: section)
                        }
                    }
                }

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

struct SectionButton: View {
    @EnvironmentObject var vm: CullViewModel
    let section: Section

    var body: some View {
        Button {
            vm.seek(to: section.start)
        } label: {
            Text(section.label)
                .font(.caption.bold())
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(section.isChorus ? Color.accentColor.opacity(0.15) : Color.secondary.opacity(0.1),
                            in: Capsule())
                .foregroundStyle(section.isChorus ? Color.accentColor : Color.secondary)
        }
        .buttonStyle(.plain)
    }
}
