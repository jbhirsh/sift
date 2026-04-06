import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  Clipboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import type { SFSymbol } from 'sf-symbols-typescript';
import { useSift } from '../context/SiftContext';
import { useTheme } from '../theme/ThemeContext';
import { useMusicProvider } from '../hooks/useMusicProvider';
import GlassBackground from '../components/GlassBackground';
import GlassCard from '../components/GlassCard';
import { RADIUS, SPACING } from '../theme';

export default function DoneScreen() {
  const { state, resumeFromPause, startFresh } = useSift();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { createPlaylist } = useMusicProvider();
  const [copied, setCopied] = useState(false);

  const isPaused = state.phase === 'paused';

  const copyRemovedList = useCallback(() => {
    const text = state.removed
      .map((t) => `${t.name} \u2014 ${t.artist}`)
      .join('\n');
    Clipboard.setString(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [state.removed]);

  const handleMoveToPlaylist = useCallback(async () => {
    const trackIDs = state.removed.map((t) => t.id);
    const name = `Sift — Removed ${new Date().toLocaleDateString()}`;
    await createPlaylist(name, trackIDs);
  }, [state.removed, createPlaylist]);

  return (
    <View style={styles.root}>
      <GlassBackground phase="done" />
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.contentContainer, { paddingTop: insets.top }]}
      >
        {/* Title section */}
        <View style={styles.titleSection}>
          <Text
            testID="done-title"
            style={[styles.titleText, { color: colors.text }]}
          >
            {isPaused ? 'Session paused.' : 'All done.'}
          </Text>
          <Text style={[styles.subtitleText, { color: colors.textSecondary }]}>
            {isPaused
              ? "Here's where you left off."
              : 'Your library has been sifted.'}
          </Text>
        </View>

        {/* Summary stats in glass card */}
        <View style={styles.summaryWrapper}>
          <GlassCard intensity="regular" radius={RADIUS.lg}>
            <View style={styles.summaryContainer}>
              <SummaryItem
                count={state.kept.length}
                label="kept"
                symbolName="checkmark.circle.fill"
                color="#34C759"
                textColor={colors.text}
                secondaryText={colors.textSecondary}
              />
              <SummaryItem
                count={state.removed.length}
                label="to remove"
                symbolName="xmark.circle.fill"
                color="#FF3B30"
                textColor={colors.text}
                secondaryText={colors.textSecondary}
              />
              <SummaryItem
                count={state.skipped.length}
                label="skipped"
                symbolName="arrow.right.circle"
                color="#FF9500"
                textColor={colors.text}
                secondaryText={colors.textSecondary}
              />
            </View>
          </GlassCard>
        </View>

        {/* Removed tracks section */}
        {state.removed.length > 0 && (
          <View style={styles.removedSection}>
            <View style={styles.removedHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.removedTitle, { color: colors.text }]}>
                  Tracks to Remove
                </Text>
                <Text style={[styles.removedSubtitle, { color: colors.textSecondary }]}>
                  Move these to a playlist in Music, then delete them there.
                </Text>
              </View>
              <View style={styles.removedActions}>
                {state.removalPlaylistCreated ? (
                  <View style={styles.movedLabel}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <SymbolView name="checkmark.circle.fill" size={14} tintColor="#34C759" />
                      <Text style={styles.movedLabelText}>
                        Moved to Playlist
                      </Text>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[
                      styles.smallPrimaryButton,
                      state.isCreatingPlaylist && { opacity: 0.5 },
                    ]}
                    onPress={handleMoveToPlaylist}
                    disabled={state.isCreatingPlaylist}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.smallPrimaryButtonText}>
                      {state.isCreatingPlaylist
                        ? 'Moving...'
                        : 'Move to Playlist'}
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.smallSecondaryButton, { borderColor: colors.accent }]}
                  onPress={copyRemovedList}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.smallSecondaryButtonText, { color: colors.accent }]}>
                    {copied ? 'Copied!' : 'Copy List'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {state.removalPlaylistError && (
              <Text style={styles.playlistError}>
                {state.removalPlaylistError}
              </Text>
            )}

            <GlassCard intensity="thin" radius={RADIUS.sm}>
              <View style={styles.trackList}>
                {state.removed.map((track, index) => (
                  <View
                    key={track.id}
                    style={[
                      styles.trackRow,
                      index % 2 !== 0 && { backgroundColor: colors.quaternary },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[styles.trackName, { color: colors.text }]}
                        numberOfLines={1}
                      >
                        {track.name}
                      </Text>
                      <Text
                        style={[styles.trackArtist, { color: colors.textSecondary }]}
                        numberOfLines={1}
                      >
                        {track.artist}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </GlassCard>
          </View>
        )}

        {/* Action buttons */}
        <View style={styles.buttonSection}>
          {isPaused ? (
            <>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={resumeFromPause}
                activeOpacity={0.8}
              >
                <Text style={styles.primaryButtonText}>Resume Session</Text>
              </TouchableOpacity>
              <GlassCard intensity="regular" radius={RADIUS.md} style={{ width: '100%' }}>
                <TouchableOpacity
                  style={styles.glassButtonInner}
                  onPress={startFresh}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.glassButtonText, { color: colors.accent }]}>
                    Start Fresh
                  </Text>
                </TouchableOpacity>
              </GlassCard>
            </>
          ) : (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={startFresh}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryButtonText}>Start Over</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function SummaryItem({
  count,
  label,
  symbolName,
  color,
  textColor,
  secondaryText,
}: {
  count: number;
  label: string;
  symbolName: string;
  color: string;
  textColor: string;
  secondaryText: string;
}) {
  return (
    <View style={summaryStyles.item}>
      <SymbolView name={symbolName as SFSymbol} size={32} tintColor={color} />
      <Text
        testID={`summary-count-${label}`}
        style={[summaryStyles.count, { color: textColor }]}
      >
        {count}
      </Text>
      <Text
        testID={`summary-label-${label}`}
        style={[summaryStyles.label, { color: secondaryText }]}
      >
        {label}
      </Text>
    </View>
  );
}

const summaryStyles = StyleSheet.create({
  item: {
    alignItems: 'center',
    gap: 8,
  },
  count: {
    fontSize: 28,
    fontWeight: '700',
  },
  label: {
    fontSize: 16,
  },
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    alignItems: 'center',
    paddingBottom: 40,
  },
  titleSection: {
    alignItems: 'center',
    gap: 8,
    paddingTop: 40,
    marginBottom: 32,
  },
  titleText: {
    fontSize: 40,
    fontWeight: '700',
    ...Platform.select({
      ios: { fontFamily: '.AppleSystemUIFontRounded-Bold' },
      default: {},
    }),
  },
  subtitleText: {
    fontSize: 20,
  },
  summaryWrapper: {
    marginHorizontal: SPACING['2xl'],
    width: '100%',
    maxWidth: 400,
    paddingHorizontal: SPACING['2xl'],
    marginBottom: 32,
  },
  summaryContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 16,
    gap: 40,
  },
  removedSection: {
    width: '100%',
    paddingHorizontal: SPACING['2xl'],
    marginBottom: 32,
  },
  removedHeader: {
    marginBottom: 12,
  },
  removedTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 2,
  },
  removedSubtitle: {
    fontSize: 12,
    marginBottom: 8,
  },
  removedActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  movedLabel: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  movedLabelText: {
    fontSize: 12,
    color: '#34C759',
    fontWeight: '500',
  },
  smallPrimaryButton: {
    backgroundColor: '#007AFF',
    borderRadius: RADIUS.sm,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  smallPrimaryButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  smallSecondaryButton: {
    borderRadius: RADIUS.sm,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
  },
  smallSecondaryButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  playlistError: {
    fontSize: 12,
    color: '#FF3B30',
    marginBottom: 8,
  },
  trackList: {
    overflow: 'hidden',
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  trackName: {
    fontSize: 16,
  },
  trackArtist: {
    fontSize: 12,
    marginTop: 2,
  },
  buttonSection: {
    gap: 12,
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 40,
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
  glassButtonInner: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  glassButtonText: {
    fontSize: 17,
    fontWeight: '600',
  },
});
