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
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { SymbolView } from 'expo-symbols';
import { Track, Decision } from '../types';
import { RADIUS } from '../theme';
import { useTheme } from '../theme/ThemeContext';

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
  const { colors, isDark } = useTheme();
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

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[styles.cardWrapper, cardStyle]}>
        <View style={styles.card}>
          {/* Artwork fills entire card */}
          <View style={styles.artworkContainer}>
            {track.artworkURL ? (
              <Image
                source={{ uri: track.artworkURL }}
                style={styles.artwork}
                resizeMode="cover"
              />
            ) : (
              <LinearGradient
                colors={isDark ? ['#2C2C2E', '#1C1C1E'] : ['#E5E5EA', '#D1D1D6']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.placeholderArtwork}
              >
                <SymbolView name="music.note" size={48} tintColor={colors.textTertiary} />
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
              <BlurView
                intensity={60}
                tint="dark"
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.trackInfoContent}>
                <View style={styles.trackTextGroup}>
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
                <View style={styles.metaRow}>
                  <Text
                    style={styles.albumName}
                    numberOfLines={1}
                    testID="card-album-name"
                  >
                    {track.album}
                  </Text>
                  <View style={styles.playCountContainer}>
                    <SymbolView name="play.fill" size={8} tintColor="rgba(255,255,255,0.4)" />
                    <Text style={styles.playCount} testID="card-play-count">
                      {track.playCount}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Keep overlay — glass tinted green */}
        <Animated.View style={[styles.swipeOverlay, keepOverlayStyle]}>
          <BlurView intensity={30} tint="default" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(52, 199, 89, 0.2)' }]} />
          <Text style={styles.keepText}>KEEP</Text>
        </Animated.View>

        {/* Remove overlay — glass tinted red */}
        <Animated.View style={[styles.swipeOverlay, styles.removeOverlayAlign, removeOverlayStyle]}>
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
    color: 'rgba(255, 255, 255, 0.7)',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  albumName: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.5)',
    flex: 1,
    marginRight: 12,
  },
  playCountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  playCount: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.4)',
  },
  swipeOverlay: {
    ...StyleSheet.absoluteFillObject,
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
