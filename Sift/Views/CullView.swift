import SwiftUI

struct CullView: View {
    @EnvironmentObject var vm: CullViewModel

    var body: some View {
        VStack(spacing: 0) {
            // Stats bar
            HStack(spacing: 24) {
                stat(label: "kept",    value: vm.kept.count,    color: .green)
                stat(label: "removed", value: vm.removed.count, color: .red)
                stat(label: "skipped", value: vm.skipped.count, color: .orange)
                Spacer()
                Text("\(vm.remaining) left")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 12)
            .background(.bar)

            Divider()

            // Card stack
            ZStack {
                if let track = vm.nextNextTrack {
                    CardView(track: track, offset: 2)
                        .scaleEffect(0.92)
                        .offset(y: -12)
                }
                if let track = vm.nextTrack {
                    CardView(track: track, offset: 1)
                        .scaleEffect(0.96)
                        .offset(y: -6)
                }
                if let track = vm.currentTrack {
                    InteractiveCardView(track: track)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            Divider()

            // Player controls
            PlayerControlsView()
                .padding(.horizontal, 24)
                .padding(.vertical, 12)
                .background(.bar)
        }
        .frame(width: 600, height: 560)
        .onKeyPress(.leftArrow)  { vm.decide(.keep);   return .handled }
        .onKeyPress(.rightArrow) { vm.decide(.remove); return .handled }
        .onKeyPress("a")         { vm.decide(.keep);   return .handled }
        .onKeyPress("d")         { vm.decide(.remove); return .handled }
        .onKeyPress(.space)      { vm.togglePlayPause(); return .handled }
    }

    private func stat(label: String, value: Int, color: Color) -> some View {
        HStack(spacing: 4) {
            Circle()
                .fill(color)
                .frame(width: 8, height: 8)
            Text("\(value) \(label)")
                .font(.callout)
                .foregroundStyle(.secondary)
        }
    }
}
