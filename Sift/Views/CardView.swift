import SwiftUI

// Static background card (next/next-next in stack)
struct CardView: View {
    let track: Track
    let offset: Int

    var body: some View {
        RoundedRectangle(cornerRadius: 20)
            .fill(.background)
            .shadow(radius: 8, y: 4)
            .overlay(
                VStack(spacing: 6) {
                    Text(track.name)
                        .font(.headline)
                        .lineLimit(1)
                    Text(track.artist)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                .padding()
            )
            .frame(width: 340, height: 200)
    }
}

// Interactive front card with drag gesture
struct InteractiveCardView: View {
    @EnvironmentObject var vm: CullViewModel
    let track: Track

    @GestureState private var dragOffset: CGSize = .zero
    @State private var swipeDirection: SwipeDirection?

    enum SwipeDirection { case left, right }

    private var dragThreshold: Double { 80 }

    private var overlayOpacity: Double {
        min(abs(dragOffset.width) / dragThreshold, 1.0)
    }

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 20)
                .fill(.background)
                .shadow(radius: 12, y: 6)

            // Card content
            VStack(spacing: 16) {
                // Artwork
                if let artwork = vm.artwork {
                    Image(nsImage: artwork)
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .frame(width: 120, height: 120)
                        .cornerRadius(8)
                } else {
                    RoundedRectangle(cornerRadius: 8)
                        .fill(.quaternary)
                        .frame(width: 120, height: 120)
                        .overlay(Image(systemName: "music.note").font(.largeTitle).foregroundStyle(.secondary))
                }

                VStack(spacing: 4) {
                    Text(track.name)
                        .font(.title3.bold())
                        .lineLimit(2)
                        .multilineTextAlignment(.center)
                    Text(track.artist)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                    Text(track.album)
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                        .lineLimit(1)
                }

                HStack(spacing: 4) {
                    Image(systemName: "play.fill")
                        .font(.caption2)
                    Text("\(track.playCount) plays")
                        .font(.caption)
                }
                .foregroundStyle(.tertiary)
            }
            .padding(24)

            // Swipe overlays
            if dragOffset.width > 0 {
                RoundedRectangle(cornerRadius: 20)
                    .fill(.green.opacity(0.15 * overlayOpacity))
                    .overlay(
                        Text("KEEP")
                            .font(.headline.bold())
                            .foregroundStyle(.green)
                            .opacity(overlayOpacity),
                        alignment: .topLeading
                    )
                    .padding(16)
            } else if dragOffset.width < 0 {
                RoundedRectangle(cornerRadius: 20)
                    .fill(.red.opacity(0.15 * overlayOpacity))
                    .overlay(
                        Text("REMOVE")
                            .font(.headline.bold())
                            .foregroundStyle(.red)
                            .opacity(overlayOpacity),
                        alignment: .topTrailing
                    )
                    .padding(16)
            }
        }
        .frame(width: 340, height: 340)
        .offset(x: dragOffset.width, y: dragOffset.height * 0.2)
        .rotationEffect(.degrees(dragOffset.width / 20))
        .gesture(
            DragGesture(minimumDistance: 10)
                .updating($dragOffset) { value, state, _ in
                    state = value.translation
                }
                .onEnded { value in
                    let dragX = value.translation.width
                    if dragX > dragThreshold {
                        vm.decide(.keep)
                    } else if dragX < -dragThreshold {
                        vm.decide(.remove)
                    }
                }
        )
        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: dragOffset)
    }
}

// MARK: - Action buttons below card

struct DecisionButtonsView: View {
    @EnvironmentObject var vm: CullViewModel

    var body: some View {
        HStack(spacing: 24) {
            Button {
                vm.decide(.keep)
            } label: {
                Label("Keep", systemImage: "checkmark.circle.fill")
                    .foregroundStyle(.green)
            }
            .keyboardShortcut(.leftArrow, modifiers: [])

            Button {
                vm.decide(.skip)
            } label: {
                Label("Skip", systemImage: "arrow.right.circle")
                    .foregroundStyle(.orange)
            }

            Button {
                vm.decide(.remove)
            } label: {
                Label("Remove", systemImage: "xmark.circle.fill")
                    .foregroundStyle(.red)
            }
            .keyboardShortcut(.rightArrow, modifiers: [])
        }
        .buttonStyle(.plain)
        .font(.callout)
    }
}
