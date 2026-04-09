import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Platform,
  Clipboard,
  ActivityIndicator,
} from 'react-native';
import type { Track } from '../types';
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
  const { restoreTrack, saveSiftedPlaylist } = useMusicProvider();
  const [copied, setCopied] = useState(false);
  const [restoringIds, setRestoringIds] = useState<Set<string>>(new Set());

  const isPaused = state.phase === 'paused';
  const isAppleMusicLibrary = state.source.type === 'library' && state.provider === 'apple-music';
  const sourceLabel = state.source.type === 'playlist'
    ? `"${state.source.playlist.name}"`
    : 'your library';

  // Auto-create/update sifted playlist for non-app-created playlists
  useEffect(() => {
    if (
      state.source.type === 'playlist' &&
      state.kept.length > 0 &&
      state.removalErrors.length > 0 &&
      !state.removalPlaylistCreated &&
      !state.isCreatingPlaylist
    ) {
      saveSiftedPlaylist(state.source.playlist.name, state.kept);
    }
  }, [state.source, state.kept, state.removalErrors, state.removalPlaylistCreated, state.isCreatingPlaylist, saveSiftedPlaylist]);

  const copyRemovedList = useCallback(() => {
    const text = state.removed
      .map((t) => `${t.name} \u2014 ${t.artist}`)
      .join('\n');
    Clipboard.setString(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [state.removed]);

  const handleRestore = useCallback(
    async (track: Track) => {
      setRestoringIds((prev) => new Set(prev).add(track.id));
      await restoreTrack(track);
      setRestoringIds((prev) => {
        const next = new Set(prev);
        next.delete(track.id);
        return next;
      });
    },
    [restoreTrack],
  );

  const renderTrackRow = useCallback(
    ({ item: track, index }: { item: Track; index: number }) => (
      <View
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
        <TouchableOpacity
          onPress={() => handleRestore(track)}
          disabled={restoringIds.has(track.id)}
          style={[styles.restoreButton, restoringIds.has(track.id) && { opacity: 0.4 }]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <SymbolView name="plus.circle.fill" size={22} tintColor={colors.accent} />
        </TouchableOpacity>
      </View>
    ),
    [colors.quaternary, colors.text, colors.textSecondary, colors.accent, handleRestore, restoringIds],
  );

  const keyExtractor = useCallback((track: Track) => track.id, []);

  const listHeader = (
    <>
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
              label="removed"
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

      {/* Removed tracks header */}
      {state.removed.length > 0 && (
        <View style={styles.removedSection}>
          <View style={styles.removedHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.removedTitle, { color: colors.text }]}>
                Tracks Removed
              </Text>
              <Text style={[styles.removedSubtitle, { color: colors.textSecondary }]}>
                {isAppleMusicLibrary
                  ? 'These tracks have been moved to "Sift — Removed" in Music.'
                  : `These tracks have been removed from ${sourceLabel}.`}
              </Text>
            </View>
            <View style={styles.removedActions}>
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

        </View>
      )}
    </>
  );

  const listFooter = (
    <View style={styles.buttonSection}>
      {state.isCreatingPlaylist && state.source.type === 'playlist' && (
        <View style={styles.siftedConfirmation}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={[styles.siftedConfirmationText, { color: colors.textSecondary }]}>
            Creating sifted playlist…
          </Text>
        </View>
      )}

      {state.removalPlaylistCreated && state.source.type === 'playlist' && (
        <View style={styles.siftedConfirmation}>
          <SymbolView name="checkmark.circle.fill" size={18} tintColor="#34C759" />
          <Text style={[styles.siftedConfirmationText, { color: colors.text }]}>
            Sifted playlist created!
          </Text>
        </View>
      )}

      {state.removalPlaylistError && (
        <Text style={styles.playlistError}>{state.removalPlaylistError}</Text>
      )}

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
  );

  return (
    <View style={styles.root}>
      <GlassBackground phase="done" />
      <FlatList
        data={state.removed}
        renderItem={renderTrackRow}
        keyExtractor={keyExtractor}
        style={styles.container}
        contentContainerStyle={[styles.contentContainer, { paddingTop: insets.top }]}
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
      />
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
    marginBottom: 12,
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
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING['2xl'],
    paddingVertical: 8,
  },
  restoreButton: {
    paddingLeft: 12,
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
    marginTop: 20,
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
  siftedConfirmation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  siftedConfirmationText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
