import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import * as Sentry from '@sentry/react-native';
import { SymbolView } from 'expo-symbols';
import { useSift } from '../context/SiftContext';
import { useTheme } from '../theme/ThemeContext';
import GlassBackground from '../components/GlassBackground';
import GlassCard from '../components/GlassCard';
import { RADIUS, SPACING } from '../theme';
import {
  MusicProvider,
  SortOrder,
  SORT_ORDER_DISPLAY,
  PROVIDER_DISPLAY,
} from '../types';

const PROVIDERS: MusicProvider[] = ['apple-music', 'spotify'];
const SORT_ORDERS: SortOrder[] = [
  'least-played',
  'most-played',
  'oldest',
  'newest',
  'random',
];

export default function SetupScreen() {
  const { state, dispatch, startFresh } = useSift();
  const { colors, glass } = useTheme();
  const [sortPickerOpen, setSortPickerOpen] = useState(false);

  const handleResume = () => {
    dispatch({ type: 'SET_PHASE', phase: 'sifting' });
  };

  return (
    <View style={styles.container}>
      <GlassBackground phase="setup" />

      <View style={styles.content}>
        <View style={{ flex: 1 }} />

        {/* Brand */}
        <View style={styles.brandSection}>
          <Text
            testID="setup-brand"
            style={[styles.brandText, { color: colors.text }]}
          >
            sift.
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Clean up your music library.
          </Text>
        </View>

        {/* Error display */}
        {state.loadError ? (
          <View style={styles.errorContainer}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <SymbolView name="exclamationmark.triangle.fill" size={16} tintColor="#FF9500" />
              <Text testID="setup-error" style={styles.errorText}>
                {state.loadError}
              </Text>
            </View>
          </View>
        ) : null}

        {/* Music provider picker */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.text }]}>
            Music service
          </Text>
          <GlassCard intensity="thin" radius={RADIUS.sm}>
            <View style={styles.segmentedControl}>
              {PROVIDERS.map((provider) => {
                const isSelected = state.provider === provider;
                return (
                  <TouchableOpacity
                    key={provider}
                    style={[
                      styles.segment,
                      isSelected && [styles.segmentSelected, { borderColor: glass.borderColor }],
                    ]}
                    onPress={() =>
                      dispatch({ type: 'SET_PROVIDER', provider })
                    }
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        {
                          color: isSelected ? colors.text : colors.textSecondary,
                          fontWeight: isSelected ? '600' : '400',
                        },
                      ]}
                    >
                      {PROVIDER_DISPLAY[provider]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </GlassCard>
        </View>

        {/* Sort order picker */}
        <GlassCard intensity="thin" radius={RADIUS.md}>
          <View style={styles.sortContainer}>
            <Text style={[styles.sectionLabel, { color: colors.text }]}>
              Sort by
            </Text>
            <View style={{ flex: 1 }} />
            <TouchableOpacity
              onPress={() => setSortPickerOpen(!sortPickerOpen)}
              style={styles.sortButton}
              activeOpacity={0.7}
            >
              <Text style={[styles.sortButtonText, { color: colors.accent }]}>
                {SORT_ORDER_DISPLAY[state.sortOrder]}
              </Text>
            </TouchableOpacity>
          </View>
        </GlassCard>

        {sortPickerOpen && (
          <GlassCard intensity="regular" radius={RADIUS.md} style={styles.sortDropdownWrapper}>
            <View style={styles.sortDropdown}>
              {SORT_ORDERS.map((order) => (
                <TouchableOpacity
                  key={order}
                  style={[
                    styles.sortOption,
                    state.sortOrder === order && {
                      backgroundColor: colors.quaternary,
                    },
                  ]}
                  onPress={() => {
                    dispatch({ type: 'SET_SORT_ORDER', sortOrder: order });
                    setSortPickerOpen(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.sortOptionText,
                      {
                        color: state.sortOrder === order ? colors.accent : colors.text,
                        fontWeight: state.sortOrder === order ? '600' : '400',
                      },
                    ]}
                  >
                    {SORT_ORDER_DISPLAY[order]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </GlassCard>
        )}

        {/* Action buttons */}
        <View style={styles.buttonSection}>
          {state.hasSavedSession && (
            <GlassCard intensity="regular" radius={RADIUS.md} style={styles.buttonGlass}>
              <TouchableOpacity
                style={styles.glassButtonInner}
                onPress={handleResume}
                activeOpacity={0.8}
              >
                <Text style={[styles.glassButtonText, { color: colors.accent }]}>
                  Resume Previous Session
                </Text>
              </TouchableOpacity>
            </GlassCard>
          )}

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={startFresh}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryButtonText}>
              {state.hasSavedSession ? 'Start Fresh' : 'Start Sifting'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* TODO: Remove after verifying Sentry */}
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: '#FF3B30', marginTop: 12 }]}
          onPress={() => Sentry.captureException(new Error('Sentry test error'))}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryButtonText}>Test Sentry</Text>
        </TouchableOpacity>

        <View style={{ flex: 1 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 40,
  },
  brandSection: {
    alignItems: 'center',
    gap: 8,
    marginBottom: 32,
  },
  brandText: {
    fontSize: 48,
    fontWeight: '700',
    ...Platform.select({
      ios: { fontFamily: '.AppleSystemUIFontRounded-Bold' },
      default: {},
    }),
  },
  subtitle: {
    fontSize: 20,
  },
  errorContainer: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  errorText: {
    fontSize: 16,
    color: '#FF3B30',
    textAlign: 'center',
  },
  section: {
    gap: 12,
    marginBottom: 32,
  },
  sectionLabel: {
    fontSize: 17,
    fontWeight: '600',
  },
  segmentedControl: {
    flexDirection: 'row',
    padding: SPACING.sm,
  },
  segment: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 7,
    borderWidth: 0.5,
    borderColor: 'transparent',
  },
  segmentSelected: {
    backgroundColor: 'rgba(120,120,128,0.2)',
  },
  segmentText: {
    fontSize: 15,
  },
  sortContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  sortButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  sortButtonText: {
    fontSize: 17,
  },
  sortDropdownWrapper: {
    marginTop: -24,
    marginBottom: 32,
  },
  sortDropdown: {
    overflow: 'hidden',
  },
  sortOption: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  sortOptionText: {
    fontSize: 16,
  },
  buttonSection: {
    gap: 12,
    alignItems: 'center',
    marginTop: SPACING['2xl'],
  },
  buttonGlass: {
    width: '100%',
  },
  glassButtonInner: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  glassButtonText: {
    fontSize: 17,
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: '#007AFF',
    borderRadius: RADIUS.md,
    paddingVertical: 16,
    paddingHorizontal: 24,
    width: '100%',
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
});
