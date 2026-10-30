import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
  SharedValue,
  interpolate,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { SymbolView } from 'expo-symbols';
import { Track, Decision } from '../types';
import { RADIUS } from '../theme';
import { formatTrackMeta } from '../utils/trackMeta';
import { DRAG_THRESHOLD, swipeDecision } from '../utils/cardLayout';
import { useTheme } from '../theme/ThemeContext';
import { useResolvedArtwork } from '../hooks/useResolvedArtwork';
import { thresholdHaptic } from '../services/haptics';
import { followTouch, liftTouch, showTouches } from '../services/touchOverlay';
import { trace, tracing } from '../services/trace';
import type { TraceData } from '../utils/trace';

// The E2E trace (services/trace) of what the card's pan saw of a touch, so a
// swipe that decided nothing says whether the pan began, took over, and how
// far and fast it ended: flow 19 lost a swipe on a starved runner with no
// line to say which.
const tracePan = (phase: string, data: TraceData) => trace(`pan-${phase}`, data);

const CARD_ACTIONS = [
  { name: 'keep', label: 'Keep' },
  { name: 'remove', label: 'Remove' },
  { name: 'skip', label: 'Skip' },
];

interface InteractiveCardProps {
  track: Track;
  /**
   * A decision on this card. For a swipe, the card stays where it was let
   * go: the caller flies it off (programmaticOffset) and shows the next
   * card, which, keyed on its track, starts back at the middle.
   */
  /** False when the decision was turned away (one already under way): the card springs back. */
  onDecide: (decision: Decision) => boolean;
  programmaticOffset?: SharedValue<number>;
  /** False for a provider without play counts, so 0 isn't shown as "Never played". */
  playsKnown?: boolean;
  /** No dragging while a decision is under way. */
  disabled?: boolean;
  /** Retries an artwork lookup that found nothing (see useResolvedArtwork). */
  artworkRetryKey?: number;
}

export default function InteractiveCard({
  track,
  onDecide,
  programmaticOffset,
  playsKnown = true,
  disabled = false,
  artworkRetryKey = 0,
}: InteractiveCardProps) {
  const { colors, isDark } = useTheme();
  const meta = formatTrackMeta(track.playCount, track.dateAdded, { playsKnown });
  const resolvedArtworkURL = useResolvedArtwork(track.id, track.artworkURL, artworkRetryKey);
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  // Whether the drag is past the point where letting go decides, so
  // crossing it, either way, gives one tick.
  const pastThreshold = useSharedValue(false);

  const handleDecide = (decision: Decision) => {
    if (onDecide(decision) === false) {
      dragX.value = withSpring(0, { damping: 12, stiffness: 120 });
      dragY.value = withSpring(0, { damping: 12, stiffness: 120 });
    }
  };

  const panGesture = Gesture.Pan()
    .minDistance(10)
    .enabled(!disabled)
    .onBegin((event) => {
      if (tracing) runOnJS(tracePan)('begin', { x: Math.round(event.absoluteX) });
    })
    .onStart((event) => {
      if (tracing) runOnJS(tracePan)('start', { dx: Math.round(event.translationX) });
    })
    .onUpdate((event) => {
      // A PR GIF's drawn ring follows the swipe (services/touchOverlay).
      if (showTouches) runOnJS(followTouch)(event.absoluteX, event.absoluteY);
      dragX.value = event.translationX;
      dragY.value = event.translationY;
      const past = Math.abs(event.translationX) > DRAG_THRESHOLD;
      if (past !== pastThreshold.value) {
        pastThreshold.value = past;
        runOnJS(thresholdHaptic)();
      }
    })
    .onEnd((event, success) => {
      pastThreshold.value = false;
      const decision = swipeDecision(event.translationX, event.velocityX);
      if (tracing) {
        runOnJS(tracePan)('end', {
          dx: Math.round(event.translationX),
          vx: Math.round(event.velocityX),
          ok: success,
          decision: decision ?? 'none',
        });
      }
      if (decision) {
        // Left where it is: it flies off from here.
        runOnJS(handleDecide)(decision);
        return;
      }
      dragX.value = withSpring(0, { damping: 12, stiffness: 120 });
      dragY.value = withSpring(0, { damping: 12, stiffness: 120 });
    })
    .onFinalize((event, success) => {
      if (tracing) runOnJS(tracePan)('finalize', { ok: success });
      if (showTouches) runOnJS(liftTouch)(event.absoluteX, event.absoluteY);
    });

  const cardStyle = useAnimatedStyle(() => {
    const offsetX = dragX.value + (programmaticOffset?.value ?? 0);
    const offsetY = dragY.value * 0.2;
    const rotation = offsetX / 20;

    return {
      transform: [{ translateX: offsetX }, { translateY: offsetY }, { rotate: `${rotation}deg` }],
    };
  });

  const keepOverlayStyle = useAnimatedStyle(() => {
    const offsetX = dragX.value + (programmaticOffset?.value ?? 0);
    const opacity = offsetX > 0 ? interpolate(offsetX, [0, DRAG_THRESHOLD], [0, 1], 'clamp') : 0;

    return {
      opacity,
    };
  });

  const removeOverlayStyle = useAnimatedStyle(() => {
    const offsetX = dragX.value + (programmaticOffset?.value ?? 0);
    const opacity = offsetX < 0 ? interpolate(-offsetX, [0, DRAG_THRESHOLD], [0, 1], 'clamp') : 0;

    return {
      opacity,
    };
  });

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[styles.cardWrapper, cardStyle]}>
        <View style={styles.card}>
          {/* Artwork fills entire card */}
          <View style={styles.artworkContainer}>
            {resolvedArtworkURL ? (
              <Image
                // An image VoiceOver can reach, not a hidden one: a cover
                // often carries words ("JUSTICE" across Peaches'), and
                // Xcode's accessibility audit fails text on screen that no
                // element covers. The name, artist and album are read below.
                accessible
                accessibilityRole="image"
                accessibilityLabel={track.album ? `Album art, ${track.album}` : 'Album art'}
                source={resolvedArtworkURL}
                style={styles.artwork}
                contentFit="cover"
                transition={200}
              />
            ) : (
              <LinearGradient
                colors={isDark ? ['#2C2C2E', '#1C1C1E'] : ['#E5E5EA', '#D1D1D6']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.placeholderArtwork}
              >
                <SymbolView
                  name="music.note"
                  size={48}
                  tintColor={colors.textTertiary}
                  accessibilityElementsHidden
                />
              </LinearGradient>
            )}

            {/* Gradient fade into glass info panel */}
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.4)']}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={styles.gradientFade}
            />

            {/* Glass info overlay at bottom */}
            <View style={styles.glassInfoContainer}>
              <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
              <View style={styles.trackInfoContent}>
                <View style={styles.trackTextGroup}>
                  {/* Keep, Remove and Skip as VoiceOver actions on the song's
                      name (swipe up or down to pick one): the card's swipe
                      isn't available to VoiceOver (#146). On a View: iOS
                      drops custom actions and hints set on a Text. Around
                      the name only, not the card: an accessible card would
                      hide the artist and album texts from XCUITest. This
                      View reads as the name, so Maestro's id + text match
                      still holds. */}
                  <View
                    accessible
                    testID="card-track-name"
                    accessibilityHint="Swipe up or down for Keep, Remove or Skip"
                    accessibilityActions={CARD_ACTIONS}
                    onAccessibilityAction={(event) => {
                      const decision = event.nativeEvent.actionName;
                      if (decision === 'keep' || decision === 'remove' || decision === 'skip')
                        handleDecide(decision);
                    }}
                  >
                    <Text style={styles.trackName} numberOfLines={2}>
                      {track.name}
                    </Text>
                  </View>
                  <Text style={styles.artistName} numberOfLines={1} testID="card-artist-name">
                    {track.artist}
                  </Text>
                </View>
                <View style={styles.metaRow}>
                  <Text style={styles.albumName} numberOfLines={1} testID="card-album-name">
                    {track.album}
                  </Text>
                  {meta.text !== '' && (
                    <Text
                      style={styles.playCount}
                      accessibilityLabel={meta.label}
                      testID="card-play-count"
                    >
                      {meta.text}
                    </Text>
                  )}
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Keep overlay — glass tinted green */}
        <Animated.View
          style={[styles.swipeOverlay, keepOverlayStyle]}
          // Invisible at rest: VoiceOver mustn't read "KEEP" with the song.
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <BlurView intensity={30} tint="default" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(52, 199, 89, 0.2)' }]} />
          <Text style={styles.keepText}>KEEP</Text>
        </Animated.View>

        {/* Remove overlay — glass tinted red */}
        <Animated.View
          style={[styles.swipeOverlay, styles.removeOverlayAlign, removeOverlayStyle]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <BlurView intensity={30} tint="default" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255, 59, 48, 0.2)' }]} />
          <Text style={styles.removeText}>REMOVE</Text>
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  cardWrapper: {
    flex: 1,
    width: '100%',
  },
  card: {
    flex: 1,
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  artworkContainer: {
    flex: 1,
    width: '100%',
    overflow: 'hidden',
    position: 'relative',
  },
  artwork: {
    width: '100%',
    height: '100%',
  },
  placeholderArtwork: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gradientFade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 120,
  },
  glassInfoContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
  },
  trackInfoContent: {
    padding: 16,
    gap: 8,
  },
  trackTextGroup: {
    gap: 2,
  },
  trackName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  artistName: {
    fontSize: 15,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.85)',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  albumName: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.75)',
    flex: 1,
    marginRight: 12,
  },
  playCount: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.75)',
  },
  swipeOverlay: {
    ...StyleSheet.absoluteFill,
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    padding: 20,
  },
  removeOverlayAlign: {
    alignItems: 'flex-end',
  },
  keepText: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#34C759',
    zIndex: 1,
  },
  removeText: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#FF3B30',
    zIndex: 1,
  },
});
