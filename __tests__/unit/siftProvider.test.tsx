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
      <TouchableOpacity testID="start-fresh" onPress={() => ctx.startFresh()} />
      <TouchableOpacity testID="reset-to-setup" onPress={ctx.resetToSetup} />
      <TouchableOpacity testID="flush-pending-save" onPress={ctx.flushPendingSave} />
      <Text testID="pendingKeepsCount">{ctx.state.pendingKeeps.length}</Text>
      <TouchableOpacity testID="add-pending-keep" onPress={() => ctx.dispatch({ type: 'ADD_PENDING_KEEP', track: mockTrackC })} />
      <TouchableOpacity testID="add-removal-error" onPress={() => ctx.dispatch({ type: 'ADD_REMOVAL_ERROR', error: 'Could not remove Track B' })} />
      <TouchableOpacity
        testID="resume-with-pending"
        onPress={() => ctx.dispatch({
          type: 'RESUME_SESSION',
          session: {
            ...ctx.state,
            tracks: [mockTrackA, mockTrackB],
            cursor: 1,
            pendingKeeps: [mockTrackC],
            removalErrors: ['Could not remove Track B'],
          },
        })}
      />
      <TouchableOpacity testID="set-phase-setup" onPress={() => ctx.dispatch({ type: 'SET_PHASE', phase: 'setup' })} />
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

  test('does not auto-resume saved session on mount (resume is handled by SetupScreen)', async () => {
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
    // Should stay in setup — SiftProvider no longer auto-resumes
    await waitFor(() => {
      expect(getByTestId('phase').props.children).toBe('setup');
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

  test('does not load session on mount (handled by SetupScreen)', () => {
    renderWithProvider();
    expect(SessionStore.loadSession).not.toHaveBeenCalled();
  });

  test('resetToSetup clears the saved session and resets state to setup', async () => {
    const { getByTestId } = renderWithProvider([mockTrackA, mockTrackB]);
    expect(getByTestId('phase').props.children).toBe('sifting');
    fireEvent.press(getByTestId('decide-keep'));
    await act(async () => {
      fireEvent.press(getByTestId('reset-to-setup'));
    });
    await waitFor(() => {
      expect(SessionStore.clearSession).toHaveBeenCalled();
      expect(getByTestId('phase').props.children).toBe('setup');
    });
    expect(getByTestId('total').props.children).toBe(0);
    expect(getByTestId('cursor').props.children).toBe(0);
    expect(getByTestId('keptCount').props.children).toBe(0);
    expect(getByTestId('isPlaying').props.children).toBe('false');
  });

  test('autosave persists pendingKeeps and removalErrors in the session', () => {
    jest.useFakeTimers();
    try {
      const { getByTestId } = renderWithProvider([mockTrackA, mockTrackB]);
      fireEvent.press(getByTestId('decide-keep'));
      fireEvent.press(getByTestId('add-pending-keep'));
      fireEvent.press(getByTestId('add-removal-error'));
      act(() => {
        jest.advanceTimersByTime(600);
      });
      // The on-disk session must carry the repair signal, or a kill/relaunch
      // would silently forget that a keep never reached the Sifted playlist.
      expect(SessionStore.saveSession).toHaveBeenLastCalledWith(
        expect.objectContaining({
          pendingKeeps: [expect.objectContaining({ id: mockTrackC.id })],
          removalErrors: ['Could not remove Track B'],
        }),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  test('RESUME_SESSION restores persisted pendingKeeps and removalErrors', () => {
    const { getByTestId } = renderWithProvider([mockTrackA, mockTrackB]);
    fireEvent.press(getByTestId('resume-with-pending'));
    expect(getByTestId('pendingKeepsCount').props.children).toBe(1);
    expect(getByTestId('phase').props.children).toBe('sifting');
  });

  test('flushPendingSave writes the debounced session synchronously', () => {
    jest.useFakeTimers();
    try {
      const { getByTestId } = renderWithProvider([mockTrackA, mockTrackB]);
      fireEvent.press(getByTestId('decide-keep'));
      // The autosave is debounced — nothing has been written yet.
      expect(SessionStore.saveSession).not.toHaveBeenCalled();

      fireEvent.press(getByTestId('flush-pending-save'));
      // The pending session is persisted immediately, with the last decision.
      expect(SessionStore.saveSession).toHaveBeenCalledTimes(1);
      expect(SessionStore.saveSession).toHaveBeenCalledWith(
        expect.objectContaining({ cursor: 1, kept: [mockTrackA] }),
      );

      // The cancelled debounce timer must not fire a duplicate write.
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(SessionStore.saveSession).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  test('flushPendingSave before leaving sifting preserves the last decision', () => {
    jest.useFakeTimers();
    try {
      const { getByTestId } = renderWithProvider([mockTrackA, mockTrackB]);
      fireEvent.press(getByTestId('decide-keep'));
      expect(SessionStore.saveSession).not.toHaveBeenCalled();

      // Mirrors the SiftScreen back button: flush, then flip phase to setup.
      // Without the flush, the autosave effect's cleanup would cancel the
      // debounced write and the keep decision would be lost.
      fireEvent.press(getByTestId('flush-pending-save'));
      fireEvent.press(getByTestId('set-phase-setup'));

      expect(getByTestId('phase').props.children).toBe('setup');
      expect(SessionStore.saveSession).toHaveBeenCalledTimes(1);
      expect(SessionStore.saveSession).toHaveBeenCalledWith(
        expect.objectContaining({ cursor: 1, kept: [mockTrackA] }),
      );

      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(SessionStore.saveSession).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  test('flushPendingSave is a no-op when the debounced write already fired', () => {
    jest.useFakeTimers();
    try {
      const { getByTestId } = renderWithProvider([mockTrackA, mockTrackB]);
      fireEvent.press(getByTestId('decide-keep'));
      act(() => {
        jest.advanceTimersByTime(600);
      });
      expect(SessionStore.saveSession).toHaveBeenCalledTimes(1);

      fireEvent.press(getByTestId('flush-pending-save'));
      expect(SessionStore.saveSession).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});
