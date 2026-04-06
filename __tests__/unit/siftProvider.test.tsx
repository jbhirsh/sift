import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { SiftProvider, useSift } from '../../src/context/SiftContext';
import { Track } from '../../src/types';
import * as SessionStore from '../../src/services/SessionStore';

jest.mock('../../src/services/SessionStore');
jest.mock('@sentry/react-native', () => ({
  setTag: jest.fn(),
  setContext: jest.fn(),
  addBreadcrumb: jest.fn(),
}));

const mockTrackA: Track = {
  id: '1', name: 'Track A', artist: 'Artist A', album: 'Album A',
  duration: 200, playCount: 10, dateAdded: '2020-01-01T00:00:00.000Z',
};
const mockTrackB: Track = {
  id: '2', name: 'Track B', artist: 'Artist B', album: 'Album B',
  duration: 180, playCount: 20, dateAdded: '2021-06-15T00:00:00.000Z',
};
const mockTrackC: Track = {
  id: '3', name: 'Track C', artist: 'Artist C', album: 'Album C',
  duration: 240, playCount: 5, dateAdded: '2019-03-10T00:00:00.000Z',
};

function TestConsumer() {
  const ctx = useSift();
  return (
    <>
      <Text testID="phase">{ctx.state.phase}</Text>
      <Text testID="cursor">{ctx.state.cursor}</Text>
      <Text testID="remaining">{ctx.remaining}</Text>
      <Text testID="total">{ctx.total}</Text>
      <Text testID="currentTrack">{ctx.currentTrack?.name ?? 'none'}</Text>
      <Text testID="nextTrack">{ctx.nextTrack?.name ?? 'none'}</Text>
      <Text testID="nextNextTrack">{ctx.nextNextTrack?.name ?? 'none'}</Text>
      <Text testID="isPlaying">{String(ctx.state.isPlaying)}</Text>
      <Text testID="playbackPosition">{ctx.state.playbackPosition}</Text>
      <Text testID="keptCount">{ctx.state.kept.length}</Text>
      <Text testID="removedCount">{ctx.state.removed.length}</Text>
      <Text testID="skippedCount">{ctx.state.skipped.length}</Text>
      <TouchableOpacity testID="decide-keep" onPress={() => ctx.decide('keep')} />
      <TouchableOpacity testID="decide-remove" onPress={() => ctx.decide('remove')} />
      <TouchableOpacity testID="decide-skip" onPress={() => ctx.decide('skip')} />
      <TouchableOpacity testID="stop" onPress={ctx.stopSession} />
      <TouchableOpacity testID="resume-pause" onPress={ctx.resumeFromPause} />
      <TouchableOpacity testID="start-fresh" onPress={ctx.startFresh} />
      <TouchableOpacity testID="resume-session" onPress={ctx.resumeSession} />
      <TouchableOpacity testID="toggle-play" onPress={ctx.togglePlayPause} />
      <TouchableOpacity testID="seek" onPress={() => ctx.seek(42)} />
      <TouchableOpacity testID="skip-backward" onPress={ctx.skipBackward} />
      <TouchableOpacity testID="skip-forward" onPress={ctx.skipForward} />
    </>
  );
}

function renderWithProvider(initialTracks?: Track[]) {
  return render(
    <SiftProvider initialTracks={initialTracks}>
      <TestConsumer />
    </SiftProvider>
  );
}

describe('SiftProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (SessionStore.hasSession as jest.Mock).mockResolvedValue(false);
    (SessionStore.saveSession as jest.Mock).mockResolvedValue(undefined);
    (SessionStore.clearSession as jest.Mock).mockResolvedValue(undefined);
    (SessionStore.loadSession as jest.Mock).mockResolvedValue(null);
  });

  test('initializes with default state when no initialTracks', () => {
    const { getByTestId } = renderWithProvider();
    expect(getByTestId('phase').props.children).toBe('setup');
    expect(getByTestId('total').props.children).toBe(0);
    expect(getByTestId('currentTrack').props.children).toBe('none');
  });

  test('initializes with sifting phase when initialTracks provided', () => {
    const tracks = [mockTrackA, mockTrackB, mockTrackC];
    const { getByTestId } = renderWithProvider(tracks);
    expect(getByTestId('phase').props.children).toBe('sifting');
    expect(getByTestId('total').props.children).toBe(3);
    expect(getByTestId('remaining').props.children).toBe(3);
    expect(getByTestId('currentTrack').props.children).toBe('Track A');
    expect(getByTestId('nextTrack').props.children).toBe('Track B');
    expect(getByTestId('nextNextTrack').props.children).toBe('Track C');
  });

  test('decide keep advances cursor and adds to kept', () => {
    const { getByTestId } = renderWithProvider([mockTrackA, mockTrackB]);
    fireEvent.press(getByTestId('decide-keep'));
    expect(getByTestId('keptCount').props.children).toBe(1);
    expect(getByTestId('currentTrack').props.children).toBe('Track B');
  });

  test('decide remove advances cursor and adds to removed', () => {
    const { getByTestId } = renderWithProvider([mockTrackA, mockTrackB]);
    fireEvent.press(getByTestId('decide-remove'));
    expect(getByTestId('removedCount').props.children).toBe(1);
  });

  test('decide skip advances cursor and adds to skipped', () => {
    const { getByTestId } = renderWithProvider([mockTrackA, mockTrackB]);
    fireEvent.press(getByTestId('decide-skip'));
    expect(getByTestId('skippedCount').props.children).toBe(1);
  });

  test('stopSession saves session and sets phase to paused', () => {
    const { getByTestId } = renderWithProvider([mockTrackA, mockTrackB]);
    fireEvent.press(getByTestId('stop'));
    expect(getByTestId('phase').props.children).toBe('paused');
    expect(SessionStore.saveSession).toHaveBeenCalled();
  });

  test('resumeFromPause sets phase to sifting', () => {
    const { getByTestId } = renderWithProvider([mockTrackA, mockTrackB]);
    fireEvent.press(getByTestId('stop'));
    expect(getByTestId('phase').props.children).toBe('paused');
    fireEvent.press(getByTestId('resume-pause'));
    expect(getByTestId('phase').props.children).toBe('sifting');
  });

  test('startFresh clears session and resets state', async () => {
    const { getByTestId } = renderWithProvider([mockTrackA]);
    await act(async () => {
      fireEvent.press(getByTestId('start-fresh'));
    });
    await waitFor(() => {
      expect(SessionStore.clearSession).toHaveBeenCalled();
      expect(getByTestId('phase').props.children).toBe('loading');
    });
  });

  test('resumeSession loads and restores session', async () => {
    (SessionStore.loadSession as jest.Mock).mockResolvedValue({
      tracks: [mockTrackA, mockTrackB],
      cursor: 1,
      kept: [mockTrackA],
      removed: [],
      skipped: [],
      sortOrder: 'newest',
      savedAt: '2024-01-01T00:00:00.000Z',
      provider: 'spotify',
    });
    const { getByTestId } = renderWithProvider();
    await act(async () => {
      fireEvent.press(getByTestId('resume-session'));
    });
    await waitFor(() => {
      expect(getByTestId('phase').props.children).toBe('sifting');
      expect(getByTestId('currentTrack').props.children).toBe('Track B');
    });
  });

  test('togglePlayPause toggles isPlaying', () => {
    const { getByTestId } = renderWithProvider([mockTrackA]);
    expect(getByTestId('isPlaying').props.children).toBe('false');
    fireEvent.press(getByTestId('toggle-play'));
    expect(getByTestId('isPlaying').props.children).toBe('true');
    fireEvent.press(getByTestId('toggle-play'));
    expect(getByTestId('isPlaying').props.children).toBe('false');
  });

  test('seek updates playback position', () => {
    const { getByTestId } = renderWithProvider([mockTrackA]);
    fireEvent.press(getByTestId('seek'));
    expect(getByTestId('playbackPosition').props.children).toBe(42);
  });

  test('skipBackward reduces position by 15', () => {
    const { getByTestId } = renderWithProvider([mockTrackA]);
    // Set position to 30 first
    fireEvent.press(getByTestId('seek')); // sets to 42
    fireEvent.press(getByTestId('skip-backward'));
    expect(getByTestId('playbackPosition').props.children).toBe(27);
  });

  test('skipBackward clamps to 0', () => {
    const { getByTestId } = renderWithProvider([mockTrackA]);
    fireEvent.press(getByTestId('skip-backward'));
    expect(getByTestId('playbackPosition').props.children).toBe(0);
  });

  test('skipForward increases position by 15, clamped to duration', () => {
    const { getByTestId } = renderWithProvider([mockTrackA]);
    fireEvent.press(getByTestId('skip-forward'));
    expect(getByTestId('playbackPosition').props.children).toBe(15);
  });

  test('useSift throws when used outside SiftProvider', () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<TestConsumer />)).toThrow('useSift must be used within a SiftProvider');
    consoleError.mockRestore();
  });

  test('checks for saved session on mount', async () => {
    (SessionStore.hasSession as jest.Mock).mockResolvedValue(true);
    renderWithProvider();
    await waitFor(() => {
      expect(SessionStore.hasSession).toHaveBeenCalled();
    });
  });
});
