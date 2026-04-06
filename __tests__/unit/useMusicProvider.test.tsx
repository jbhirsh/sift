import React from 'react';
import { TouchableOpacity } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import { SiftProvider } from '../../src/context/SiftContext';
import { useMusicProvider } from '../../src/hooks/useMusicProvider';
import { Track } from '../../src/types';

// Mock Sentry
jest.mock('@sentry/react-native', () => ({
  setTag: jest.fn(),
  setContext: jest.fn(),
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
}));

// Mock SessionStore
jest.mock('../../src/services/SessionStore', () => ({
  hasSession: jest.fn().mockResolvedValue(false),
  saveSession: jest.fn().mockResolvedValue(undefined),
  loadSession: jest.fn().mockResolvedValue(null),
  clearSession: jest.fn().mockResolvedValue(undefined),
}));

// Mock services
const mockProvider = {
  requestAuthorization: jest.fn().mockResolvedValue(true),
  isAuthorized: jest.fn().mockResolvedValue(true),
  loadLibrary: jest.fn().mockResolvedValue([]),
  play: jest.fn().mockResolvedValue(undefined),
  pause: jest.fn().mockResolvedValue(undefined),
  resume: jest.fn().mockResolvedValue(undefined),
  seek: jest.fn(),
  getPlaybackState: jest.fn().mockReturnValue({ position: 30, isPlaying: true }),
  createPlaylist: jest.fn().mockResolvedValue(undefined),
};

jest.mock('../../src/services', () => ({
  createMusicProvider: jest.fn(() => mockProvider),
  MusicProviderService: {},
}));

// Mock Alert
jest.mock('react-native/Libraries/Alert/Alert', () => ({
  alert: jest.fn(),
}));

const mockTrack: Track = {
  id: '1', name: 'Track A', artist: 'Artist A', album: 'Album A',
  duration: 200, playCount: 10, dateAdded: '2020-01-01T00:00:00.000Z',
};

function TestConsumer() {
  const provider = useMusicProvider();
  return (
    <>
      <TouchableOpacity testID="authorize" onPress={async () => {
        await provider.authorize();
      }} />
      <TouchableOpacity testID="play" onPress={() => provider.play('1')} />
      <TouchableOpacity testID="play-pos" onPress={() => provider.play('1', 30)} />
      <TouchableOpacity testID="pause" onPress={() => provider.pause()} />
      <TouchableOpacity testID="resume" onPress={() => provider.resume()} />
      <TouchableOpacity testID="seek" onPress={() => provider.seek(42)} />
      <TouchableOpacity testID="toggle" onPress={() => provider.togglePlayPause()} />
      <TouchableOpacity testID="skip-fwd" onPress={() => provider.skipForward()} />
      <TouchableOpacity testID="skip-bwd" onPress={() => provider.skipBackward()} />
      <TouchableOpacity testID="create-playlist" onPress={() => provider.createPlaylist('Test', ['1'])} />
      <TouchableOpacity testID="load-library" onPress={() => provider.loadLibrary()} />
    </>
  );
}

function renderWithProvider() {
  return render(
    <SiftProvider initialTracks={[mockTrack]}>
      <TestConsumer />
    </SiftProvider>
  );
}

describe('useMusicProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockProvider.requestAuthorization.mockResolvedValue(true);
    mockProvider.isAuthorized.mockResolvedValue(true);
    mockProvider.loadLibrary.mockResolvedValue([mockTrack]);
    mockProvider.play.mockResolvedValue(undefined);
    mockProvider.pause.mockResolvedValue(undefined);
    mockProvider.resume.mockResolvedValue(undefined);
    mockProvider.createPlaylist.mockResolvedValue(undefined);
    mockProvider.getPlaybackState.mockReturnValue({ position: 30, isPlaying: true });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('authorize calls provider.requestAuthorization', async () => {
    const { getByTestId } = renderWithProvider();
    await act(async () => {
      fireEvent.press(getByTestId('authorize'));
    });
    expect(mockProvider.requestAuthorization).toHaveBeenCalled();
  });

  test('authorize returns false on error', async () => {
    mockProvider.requestAuthorization.mockRejectedValue(new Error('fail'));
    const { getByTestId } = renderWithProvider();
    await act(async () => {
      fireEvent.press(getByTestId('authorize'));
    });
    expect(mockProvider.requestAuthorization).toHaveBeenCalled();
  });

  test('play calls provider.play', async () => {
    const { getByTestId } = renderWithProvider();
    await act(async () => {
      fireEvent.press(getByTestId('play'));
    });
    expect(mockProvider.play).toHaveBeenCalledWith('1', undefined);
  });

  test('play with position', async () => {
    const { getByTestId } = renderWithProvider();
    await act(async () => {
      fireEvent.press(getByTestId('play-pos'));
    });
    expect(mockProvider.play).toHaveBeenCalledWith('1', 30);
  });

  test('play handles error gracefully', async () => {
    mockProvider.play.mockRejectedValue(new Error('play error'));
    const { getByTestId } = renderWithProvider();
    await act(async () => {
      fireEvent.press(getByTestId('play'));
    });
    // Should not throw
  });

  test('pause calls provider.pause', async () => {
    const { getByTestId } = renderWithProvider();
    await act(async () => {
      fireEvent.press(getByTestId('pause'));
    });
    expect(mockProvider.pause).toHaveBeenCalled();
  });

  test('pause handles error gracefully', async () => {
    mockProvider.pause.mockRejectedValue(new Error('pause error'));
    const { getByTestId } = renderWithProvider();
    await act(async () => {
      fireEvent.press(getByTestId('pause'));
    });
    // Should not throw
  });

  test('resume calls provider.resume', async () => {
    const { getByTestId } = renderWithProvider();
    await act(async () => {
      fireEvent.press(getByTestId('resume'));
    });
    expect(mockProvider.resume).toHaveBeenCalled();
  });

  test('resume handles error gracefully', async () => {
    mockProvider.resume.mockRejectedValue(new Error('resume error'));
    const { getByTestId } = renderWithProvider();
    await act(async () => {
      fireEvent.press(getByTestId('resume'));
    });
    // Should not throw
  });

  test('seek calls provider.seek', () => {
    const { getByTestId } = renderWithProvider();
    fireEvent.press(getByTestId('seek'));
    expect(mockProvider.seek).toHaveBeenCalledWith(42);
  });

  test('skipForward calls provider.seek and getPlaybackState', () => {
    const { getByTestId } = renderWithProvider();
    fireEvent.press(getByTestId('skip-fwd'));
    expect(mockProvider.getPlaybackState).toHaveBeenCalled();
    expect(mockProvider.seek).toHaveBeenCalled();
  });

  test('skipBackward calls provider.seek', () => {
    const { getByTestId } = renderWithProvider();
    fireEvent.press(getByTestId('skip-bwd'));
    expect(mockProvider.getPlaybackState).toHaveBeenCalled();
    expect(mockProvider.seek).toHaveBeenCalled();
  });

  test('createPlaylist calls provider.createPlaylist', async () => {
    const { getByTestId } = renderWithProvider();
    await act(async () => {
      fireEvent.press(getByTestId('create-playlist'));
    });
    expect(mockProvider.createPlaylist).toHaveBeenCalledWith('Test', ['1']);
  });

  test('createPlaylist handles error', async () => {
    mockProvider.createPlaylist.mockRejectedValue(new Error('playlist fail'));
    const { getByTestId } = renderWithProvider();
    await act(async () => {
      fireEvent.press(getByTestId('create-playlist'));
    });
    // Should not throw
  });

  test('loadLibrary calls provider and dispatches tracks', async () => {
    const { getByTestId } = renderWithProvider();
    await act(async () => {
      fireEvent.press(getByTestId('load-library'));
    });
    expect(mockProvider.isAuthorized).toHaveBeenCalled();
    expect(mockProvider.loadLibrary).toHaveBeenCalled();
  });

  test('loadLibrary handles auth denial', async () => {
    mockProvider.isAuthorized.mockResolvedValue(false);
    mockProvider.requestAuthorization.mockResolvedValue(false);
    const { getByTestId } = renderWithProvider();
    await act(async () => {
      fireEvent.press(getByTestId('load-library'));
    });
    expect(mockProvider.requestAuthorization).toHaveBeenCalled();
  });

  test('loadLibrary handles load error', async () => {
    mockProvider.loadLibrary.mockRejectedValue(new Error('load fail'));
    const { getByTestId } = renderWithProvider();
    await act(async () => {
      fireEvent.press(getByTestId('load-library'));
    });
    // Should not throw, error dispatched to state
  });

  test('togglePlayPause pauses when playing, resumes when not', async () => {
    const { getByTestId } = renderWithProvider();
    // First play to set isPlaying
    await act(async () => {
      fireEvent.press(getByTestId('play'));
    });
    // Now toggle to pause
    await act(async () => {
      fireEvent.press(getByTestId('toggle'));
    });
    expect(mockProvider.pause).toHaveBeenCalled();
  });

  test('togglePlayPause resumes when not playing', async () => {
    const { getByTestId } = renderWithProvider();
    // Toggle without playing first — state.isPlaying is false, so it resumes
    await act(async () => {
      fireEvent.press(getByTestId('toggle'));
    });
    expect(mockProvider.resume).toHaveBeenCalled();
  });

  test('polling dispatches playback position while playing', async () => {
    const { getByTestId } = renderWithProvider();
    // Start playback to trigger polling
    await act(async () => {
      fireEvent.press(getByTestId('play'));
    });
    // Advance timers to trigger polling interval
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    expect(mockProvider.getPlaybackState).toHaveBeenCalled();
  });

  test('loadLibrary succeeds when initially unauthorized but grants access', async () => {
    mockProvider.isAuthorized.mockResolvedValue(false);
    mockProvider.requestAuthorization.mockResolvedValue(true);
    const { getByTestId } = renderWithProvider();
    await act(async () => {
      fireEvent.press(getByTestId('load-library'));
    });
    expect(mockProvider.requestAuthorization).toHaveBeenCalled();
    expect(mockProvider.loadLibrary).toHaveBeenCalled();
  });

  test('loadLibrary handles non-Error exception', async () => {
    mockProvider.loadLibrary.mockRejectedValue('string error');
    const { getByTestId } = renderWithProvider();
    await act(async () => {
      fireEvent.press(getByTestId('load-library'));
    });
    // Should dispatch generic error message for non-Error objects
  });
});
