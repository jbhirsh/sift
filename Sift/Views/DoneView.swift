import SwiftUI

struct DoneView: View {
    @EnvironmentObject var vm: SiftViewModel
    @State private var copied = false

    var body: some View {
        ScrollView {
            VStack(spacing: 32) {
                VStack(spacing: 8) {
                    Text(vm.remaining == 0 ? "All done." : "Session stopped.")
                        .font(.system(size: 40, weight: .bold, design: .rounded))
                        .accessibilityIdentifier("done-title")
                    Text(vm.remaining == 0
                         ? "Your library has been sifted."
                         : "\(vm.remaining) track\(vm.remaining == 1 ? "" : "s") remaining.")
                        .font(.title3)
                        .foregroundStyle(.secondary)
                }
                .padding(.top, 40)

                HStack(spacing: 40) {
                    summaryItem(count: vm.kept.count, label: "kept", icon: "checkmark.circle.fill", color: .green)
                    summaryItem(count: vm.removed.count, label: "to remove",
                               icon: "xmark.circle.fill", color: .red)
                    summaryItem(count: vm.skipped.count, label: "skipped",
                               icon: "arrow.right.circle.fill", color: .orange)
                }
                .padding()
                .background(.quaternary, in: RoundedRectangle(cornerRadius: 16))

                if !vm.removed.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Tracks to Remove")
                                    .font(.headline)
                                Text("Move these to a playlist in Music, then delete them there.")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            if vm.removalPlaylistCreated {
                                Label("Moved to Playlist", systemImage: "checkmark.circle.fill")
                                    .font(.caption)
                                    .foregroundStyle(.green)
                            } else {
                                Button {
                                    vm.createRemovalPlaylist()
                                } label: {
                                    if vm.isCreatingPlaylist {
                                        ProgressView().controlSize(.small)
                                    } else {
                                        Label("Move to Playlist", systemImage: "music.note.list")
                                            .font(.caption)
                                    }
                                }
                                .buttonStyle(.borderedProminent)
                                .controlSize(.small)
                                .disabled(vm.isCreatingPlaylist)
                            }
                            Button {
                                copyRemovedList()
                            } label: {
                                Label(
                                copied ? "Copied!" : "Copy List",
                                systemImage: copied ? "checkmark" : "doc.on.doc"
                            )
                                    .font(.caption)
                            }
                            .buttonStyle(.bordered)
                            .controlSize(.small)
                        }
                        if let error = vm.removalPlaylistError {
                            Text(error)
                                .font(.caption)
                                .foregroundStyle(.red)
                        }

                        VStack(alignment: .leading, spacing: 0) {
                            ForEach(vm.removed) { track in
                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(track.name)
                                            .font(.callout)
                                            .lineLimit(1)
                                        Text(track.artist)
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                            .lineLimit(1)
                                    }
                                    Spacer()
                                }
                                .padding(.horizontal, 12)
                                .padding(.vertical, 8)
                                .background(vm.removed.firstIndex(of: track).map { $0 % 2 == 0 } == true
                                    ? Color.clear
                                    : Color.secondary.opacity(0.05))
                            }
                        }
                        .background(.background, in: RoundedRectangle(cornerRadius: 8))
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.secondary.opacity(0.2)))
                    }
                    .padding(.horizontal, 24)
                }

                Button("Start Over") {
                    vm.startFresh()
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .padding(.bottom, 40)
            }
            .frame(maxWidth: .infinity)
        }
        .frame(width: 520, height: 560)
    }

    private func summaryItem(count: Int, label: String, icon: String, color: Color) -> some View {
        VStack(spacing: 8) {
            Image(systemName: icon)
                .font(.largeTitle)
                .foregroundStyle(color)
                .accessibilityHidden(true)
            Text("\(count)")
                .font(.title.bold())
                .accessibilityIdentifier("summary-count-\(label)")
            Text(label)
                .font(.callout)
                .foregroundStyle(.secondary)
                .accessibilityIdentifier("summary-label-\(label)")
        }
    }

    private func copyRemovedList() {
        let text = vm.removed.map { "\($0.name) — \($0.artist)" }.joined(separator: "\n")
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
        copied = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { copied = false }
    }
}
