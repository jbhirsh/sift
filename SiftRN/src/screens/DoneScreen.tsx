import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  useColorScheme,
  Clipboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { useSift } from '../context/SiftContext';

export default function DoneScreen() {
  const { state, dispatch, resumeFromPause, startFresh } = useSift();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [copied, setCopied] = useState(false);

  const textColor = isDark ? '#FFFFFF' : '#000000';
  const secondaryText = isDark ? '#8E8E93' : '#6C6C70';
  const cardBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)';
  const listBg = isDark ? '#1C1C1E' : '#FFFFFF';
  const listBorder = isDark
    ? 'rgba(255,255,255,0.12)'
    : 'rgba(0,0,0,0.1)';
  const altRowBg = isDark
    ? 'rgba(255,255,255,0.03)'
    : 'rgba(0,0,0,0.02)';

  const isPaused = state.phase === 'paused';

  const copyRemovedList = useCallback(() => {
    const text = state.removed
      .map((t) => `${t.name} \u2014 ${t.artist}`)
      .join('\n');
    // Clipboard is deprecated in RN core but works; use @react-native-clipboard for production
    Clipboard.setString(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [state.removed]);

  const handleMoveToPlaylist = useCallback(() => {
    dispatch({ type: 'SET_CREATING_PLAYLIST', creating: true });
    // Simulate playlist creation; real implementation would call MusicKit/Spotify API
    setTimeout(() => {
      dispatch({ type: 'SET_CREATING_PLAYLIST', creating: false });
      dispatch({ type: 'SET_PLAYLIST_CREATED', created: true });
    }, 1000);
  }, [dispatch]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.contentContainer, { paddingTop: insets.top }]}
    >
      {/* Title section */}
      <View style={styles.titleSection}>
        <Text
          testID="done-title"
          style={[styles.titleText, { color: textColor }]}
        >
          {isPaused ? 'Session paused.' : 'All done.'}
        </Text>
        <Text style={[styles.subtitleText, { color: secondaryText }]}>
          {isPaused
            ? "Here's where you left off."
            : 'Your library has been sifted.'}
        </Text>
      </View>

      {/* Summary stats */}
      <View style={[styles.summaryContainer, { backgroundColor: cardBg }]}>
        <SummaryItem
          count={state.kept.length}
          label="kept"
          symbolName="checkmark.circle.fill"
          color="#34C759"
          textColor={textColor}
          secondaryText={secondaryText}
        />
        <SummaryItem
          count={state.removed.length}
          label="to remove"
          symbolName="xmark.circle.fill"
          color="#FF3B30"
          textColor={textColor}
          secondaryText={secondaryText}
        />
        <SummaryItem
          count={state.skipped.length}
          label="skipped"
          symbolName="arrow.right.circle"
          color="#FF9500"
          textColor={textColor}
          secondaryText={secondaryText}
        />
      </View>

      {/* Removed tracks section */}
      {state.removed.length > 0 && (
        <View style={styles.removedSection}>
          <View style={styles.removedHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.removedTitle, { color: textColor }]}>
                Tracks to Remove
              </Text>
              <Text style={[styles.removedSubtitle, { color: secondaryText }]}>
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
                style={styles.smallSecondaryButton}
                onPress={copyRemovedList}
                activeOpacity={0.8}
              >
                <Text style={styles.smallSecondaryButtonText}>
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

          <View
            style={[
              styles.trackList,
              { backgroundColor: listBg, borderColor: listBorder },
            ]}
          >
            {state.removed.map((track, index) => (
              <View
                key={track.id}
                style={[
                  styles.trackRow,
                  index % 2 !== 0 && { backgroundColor: altRowBg },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.trackName, { color: textColor }]}
                    numberOfLines={1}
                  >
                    {track.name}
                  </Text>
                  <Text
                    style={[styles.trackArtist, { color: secondaryText }]}
                    numberOfLines={1}
                  >
                    {track.artist}
                  </Text>
                </View>
              </View>
            ))}
          </View>
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
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={startFresh}
              activeOpacity={0.8}
            >
              <Text style={styles.secondaryButtonText}>Start Fresh</Text>
            </TouchableOpacity>
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
      <SymbolView name={symbolName as any} size={32} tintColor={color} />
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
  icon: {
    fontSize: 32,
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
  summaryContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 16,
    borderRadius: 16,
    marginHorizontal: 24,
    width: '100%',
    maxWidth: 400,
    marginBottom: 32,
    gap: 40,
  },
  removedSection: {
    width: '100%',
    paddingHorizontal: 24,
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
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  smallPrimaryButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  smallSecondaryButton: {
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  smallSecondaryButtonText: {
    color: '#007AFF',
    fontSize: 12,
    fontWeight: '600',
  },
  playlistError: {
    fontSize: 12,
    color: '#FF3B30',
    marginBottom: 8,
  },
  trackList: {
    borderRadius: 8,
    borderWidth: 1,
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
