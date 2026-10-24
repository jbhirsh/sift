import React, { useEffect } from 'react';
import {
  AccessibilityInfo,
  View,
  Text,
  StyleSheet,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { useSift } from '../context/SiftContext';
import { useTheme } from '../theme/ThemeContext';
import { useMusicProvider } from '../hooks/useMusicProvider';
import GlassBackground from '../components/GlassBackground';
import GlassCard from '../components/GlassCard';
import { useTraceScreen } from '../hooks/useTrace';
import { FONTS, SPACING } from '../theme';

export default function LoadingScreen() {
  useTraceScreen('loading');
  const { state } = useSift();
  const { colors } = useTheme();
  const { loadTracks, cancelLoad } = useMusicProvider();

  const { skipFiltering } = state;
  useEffect(() => {
    loadTracks({ skipFiltering });
  }, [loadTracks, skipFiltering]);

  // VoiceOver hears each step as the bar moves (#174): nothing else tells
  // it the screen is still working. Queued, so a quick step doesn't cut
  // off the one before.
  const { loadMessage } = state;
  useEffect(() => {
    if (loadMessage)
      AccessibilityInfo.announceForAccessibilityWithOptions(loadMessage, { queue: true });
  }, [loadMessage]);
  const percent = Math.round(Math.min(state.loadProgress, 1) * 100);

  return (
    <View style={styles.container}>
      <GlassBackground phase="loading" />

      <View style={{ flex: 1 }} />

      <Text testID="loading-brand" style={[styles.brandText, { color: colors.text }]}>
        sift.
      </Text>

      <View style={styles.progressSection}>
        {/* Glass progress pill: as wide as the screen allows, up to 300 pt
            (a fixed 300 ran into the margins on an SE or mini, #174). */}
        <View
          testID="loading-progress"
          style={styles.progressTrack}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Loading"
          accessibilityValue={{ min: 0, max: 100, now: percent }}
        >
          <GlassCard intensity="thin" radius={16}>
            <View style={styles.progressPill}>
              <View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: colors.accent,
                    width: `${percent}%`,
                  },
                ]}
              />
            </View>
          </GlassCard>
        </View>

        <Text
          testID="loading-message"
          style={[styles.messageText, { color: colors.textSecondary }]}
        >
          {state.loadMessage}
        </Text>

        {/* A long load has a way out (#177): back to Setup, and whatever
            the load finds later is dropped. */}
        <TouchableOpacity
          testID="loading-cancel"
          onPress={cancelLoad}
          style={styles.cancelButton}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityHint="Stops loading and goes back"
        >
          <Text style={[styles.cancelText, { color: colors.accent }]}>Cancel</Text>
        </TouchableOpacity>
      </View>

      <View style={{ flex: 1 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: {
    fontSize: 36,
    fontWeight: '700',
    ...Platform.select({
      ios: { fontFamily: '.AppleSystemUIFontRounded-Bold' },
      default: {},
    }),
    marginBottom: 24,
  },
  progressSection: {
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 40,
    width: '100%',
  },
  progressTrack: {
    width: '100%',
    maxWidth: 300,
  },
  progressPill: {
    height: 32,
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: 16,
  },
  progressFill: {
    height: '100%',
    borderRadius: 16,
    opacity: 0.8,
  },
  messageText: {
    fontSize: 16,
  },
  cancelButton: {
    minHeight: 44,
    minWidth: 88,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    marginTop: SPACING.lg,
  },
  cancelText: {
    fontSize: 17,
    ...FONTS.headline,
  },
});
