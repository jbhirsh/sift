import React from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
  SharedValue,
  interpolate,
} from 'react-native-reanimated';
import { Track, Decision } from '../types';

const DRAG_THRESHOLD = 80;

interface InteractiveCardProps {
  track: Track;
  onDecide: (decision: Decision) => void;
  programmaticOffset?: SharedValue<number>;
}

export default function InteractiveCard({
  track,
  onDecide,
  programmaticOffset,
}: InteractiveCardProps) {
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);

  const handleDecide = (decision: Decision) => {
    onDecide(decision);
  };

  const panGesture = Gesture.Pan()
    .minDistance(10)
    .onUpdate((event) => {
      dragX.value = event.translationX;
      dragY.value = event.translationY;
    })
    .onEnd((event) => {
      const translationX = event.translationX;
      if (translationX > DRAG_THRESHOLD) {
        runOnJS(handleDecide)('keep');
      } else if (translationX < -DRAG_THRESHOLD) {
        runOnJS(handleDecide)('remove');
      }
      dragX.value = withSpring(0, { damping: 12, stiffness: 120 });
      dragY.value = withSpring(0, { damping: 12, stiffness: 120 });
    });

  const cardStyle = useAnimatedStyle(() => {
    const offsetX = dragX.value + (programmaticOffset?.value ?? 0);
    const offsetY = dragY.value * 0.2;
    const rotation = offsetX / 20;

    return {
      transform: [
        { translateX: offsetX },
        { translateY: offsetY },
        { rotate: `${rotation}deg` },
      ],
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

  // Artwork fills available space via flex

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[styles.cardWrapper, cardStyle]}>
        <View style={styles.card}>
          {/* Artwork hero */}
          <View style={styles.artworkContainer}>
            {track.artworkURL ? (
              <Image
                source={{ uri: track.artworkURL }}
                style={styles.artwork}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.placeholderArtwork}>
                <Text style={styles.placeholderIcon}>{'♪'}</Text>
              </View>
            )}

            {/* Gradient overlay */}
            <View style={styles.gradientOverlay} />

            {/* Track info over artwork */}
            <View style={styles.trackInfoOverlay}>
              <Text
                style={styles.trackName}
                numberOfLines={2}
                testID="card-track-name"
              >
                {track.name}
              </Text>
              <Text
                style={styles.artistName}
                numberOfLines={1}
                testID="card-artist-name"
              >
                {track.artist}
              </Text>
            </View>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <View style={styles.albumInfo}>
              <Text style={styles.albumLabel}>ALBUM</Text>
              <Text
                style={styles.albumName}
                numberOfLines={1}
                testID="card-album-name"
              >
                {track.album}
              </Text>
            </View>
            <View style={styles.playCountContainer}>
              <Text style={styles.playIcon}>{'▶'}</Text>
              <Text style={styles.playCount} testID="card-play-count">
                {track.playCount} plays
              </Text>
            </View>
          </View>
        </View>

        {/* Keep overlay */}
        <Animated.View style={[styles.swipeOverlay, styles.keepOverlay, keepOverlayStyle]}>
          <Text style={styles.keepText}>KEEP</Text>
        </Animated.View>

        {/* Remove overlay */}
        <Animated.View style={[styles.swipeOverlay, styles.removeOverlay, removeOverlayStyle]}>
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
    backgroundColor: '#fff',
    borderRadius: 20,
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
    backgroundColor: 'rgba(120, 120, 128, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderIcon: {
    fontSize: 48,
    color: 'rgba(60, 60, 67, 0.3)',
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
    // Approximate gradient from center-clear to bottom-black
    // Using a semi-transparent black at the bottom
    backgroundColor: 'transparent',
    // We use a bottom-only shadow-like effect with a positioned view
    borderBottomWidth: 0,
  },
  trackInfoOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    // Gradient background for text readability
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  trackName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  artistName: {
    fontSize: 16,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.7)',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  albumInfo: {
    flex: 1,
    marginRight: 12,
  },
  albumLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: 'rgba(60, 60, 67, 0.3)',
    letterSpacing: 1,
    marginBottom: 2,
  },
  albumName: {
    fontSize: 13,
    fontWeight: '500',
    color: '#000',
  },
  playCountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  playIcon: {
    fontSize: 8,
    color: 'rgba(60, 60, 67, 0.18)',
  },
  playCount: {
    fontSize: 13,
    color: 'rgba(60, 60, 67, 0.18)',
  },
  swipeOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
    margin: 16,
    justifyContent: 'flex-start',
    padding: 20,
  },
  keepOverlay: {
    backgroundColor: 'rgba(52, 199, 89, 0.15)',
    alignItems: 'flex-start',
  },
  removeOverlay: {
    backgroundColor: 'rgba(255, 59, 48, 0.15)',
    alignItems: 'flex-end',
  },
  keepText: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#34C759',
  },
  removeText: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#FF3B30',
  },
});
