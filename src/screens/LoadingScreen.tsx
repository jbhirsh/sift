import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
} from 'react-native';
import { useSift } from '../context/SiftContext';
import { useTheme } from '../theme/ThemeContext';
import { useMusicProvider } from '../hooks/useMusicProvider';
import GlassBackground from '../components/GlassBackground';
import GlassCard from '../components/GlassCard';

export default function LoadingScreen() {
  const { state } = useSift();
  const { colors } = useTheme();
  const { loadTracks } = useMusicProvider();

  const { skipFiltering } = state;
  useEffect(() => {
    loadTracks({ skipFiltering });
  }, [loadTracks, skipFiltering]);

  return (
    <View style={styles.container}>
      <GlassBackground phase="loading" />

      <View style={{ flex: 1 }} />

      <Text
        testID="loading-brand"
        style={[styles.brandText, { color: colors.text }]}
      >
        sift.
      </Text>

      <View style={styles.progressSection}>
        {/* Glass progress pill */}
        <GlassCard intensity="thin" radius={16}>
          <View style={styles.progressPill}>
            <View
              style={[
                styles.progressFill,
                {
                  backgroundColor: colors.accent,
                  width: `${Math.min(state.loadProgress * 100, 100)}%`,
                },
              ]}
            />
          </View>
        </GlassCard>

        <Text
          testID="loading-message"
          style={[styles.messageText, { color: colors.textSecondary }]}
        >
          {state.loadMessage}
        </Text>
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
  progressPill: {
    width: 300,
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
});
