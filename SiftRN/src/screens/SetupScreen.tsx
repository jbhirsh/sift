import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  useColorScheme,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useSift } from '../context/SiftContext';
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
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [sortPickerOpen, setSortPickerOpen] = useState(false);

  const textColor = isDark ? '#FFFFFF' : '#000000';
  const secondaryText = isDark ? '#8E8E93' : '#6C6C70';
  const cardBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)';
  const borderColor = isDark
    ? 'rgba(255,255,255,0.2)'
    : 'rgba(0,0,0,0.1)';

  const handleResume = () => {
    dispatch({ type: 'SET_PHASE', phase: 'sifting' });
  };

  return (
    <View style={styles.container}>
      {/* Background gradient approximation */}
      <View style={styles.gradientBg} />

      <View style={styles.content}>
        <View style={{ flex: 1 }} />

        {/* Brand */}
        <View style={styles.brandSection}>
          <Text
            testID="setup-brand"
            style={[styles.brandText, { color: textColor }]}
          >
            sift.
          </Text>
          <Text style={[styles.subtitle, { color: secondaryText }]}>
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
          <Text style={[styles.sectionLabel, { color: textColor }]}>
            Music service
          </Text>
          <View style={[styles.segmentedControl, { backgroundColor: cardBg }]}>
            {PROVIDERS.map((provider) => {
              const isSelected = state.provider === provider;
              return (
                <TouchableOpacity
                  key={provider}
                  style={[
                    styles.segment,
                    isSelected && styles.segmentSelected,
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
                        color: isSelected ? textColor : secondaryText,
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
        </View>

        {/* Sort order picker */}
        <View style={[styles.sortContainer, { backgroundColor: cardBg, borderColor }]}>
          <Text style={[styles.sectionLabel, { color: textColor }]}>
            Sort by
          </Text>
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            onPress={() => setSortPickerOpen(!sortPickerOpen)}
            style={styles.sortButton}
            activeOpacity={0.7}
          >
            <Text style={[styles.sortButtonText, { color: '#007AFF' }]}>
              {SORT_ORDER_DISPLAY[state.sortOrder]}
            </Text>
          </TouchableOpacity>
        </View>

        {sortPickerOpen && (
          <View style={[styles.sortDropdown, { backgroundColor: isDark ? '#2C2C2E' : '#FFFFFF', borderColor }]}>
            {SORT_ORDERS.map((order) => (
              <TouchableOpacity
                key={order}
                style={[
                  styles.sortOption,
                  state.sortOrder === order && {
                    backgroundColor: isDark
                      ? 'rgba(255,255,255,0.08)'
                      : 'rgba(0,0,0,0.04)',
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
                      color: state.sortOrder === order ? '#007AFF' : textColor,
                      fontWeight: state.sortOrder === order ? '600' : '400',
                    },
                  ]}
                >
                  {SORT_ORDER_DISPLAY[order]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Action buttons */}
        <View style={styles.buttonSection}>
          {state.hasSavedSession && (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleResume}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryButtonText}>
                Resume Previous Session
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={
              state.hasSavedSession
                ? styles.secondaryButton
                : styles.primaryButton
            }
            onPress={startFresh}
            activeOpacity={0.8}
          >
            <Text
              style={
                state.hasSavedSession
                  ? styles.secondaryButtonText
                  : styles.primaryButtonText
              }
            >
              {state.hasSavedSession ? 'Start Fresh' : 'Start Sifting'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={{ flex: 1 }} />
      </View>
    </View>
  );
}

const _roundedFont = Platform.select({
  ios: 'System',
  default: undefined,
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradientBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(100, 80, 180, 0.08)',
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
    borderRadius: 8,
    overflow: 'hidden',
  },
  segment: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 7,
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
    borderRadius: 12,
    borderWidth: 0.5,
    marginBottom: 32,
  },
  sortButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  sortButtonText: {
    fontSize: 17,
  },
  sortDropdown: {
    borderRadius: 12,
    borderWidth: 0.5,
    marginTop: -24,
    marginBottom: 32,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
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
  },
  primaryButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
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
  secondaryButton: {
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  secondaryButtonText: {
    color: '#007AFF',
    fontSize: 17,
    fontWeight: '600',
  },
});
