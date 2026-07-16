import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import { SiftProvider, useSift } from '../../src/context/SiftContext';
import { useProviderAuthorization } from '../../src/hooks/useProviderAuthorization';

jest.mock('@sentry/react-native', () => ({
  setTag: jest.fn(),
  setContext: jest.fn(),
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
}));

jest.mock('../../src/services/SessionStore', () => ({
  hasSession: jest.fn().mockResolvedValue(false),
  saveSession: jest.fn().mockResolvedValue(undefined),
  loadSession: jest.fn().mockResolvedValue(null),
  clearSession: jest.fn().mockResolvedValue(undefined),
}));

const mockProvider = {
  requestAuthorization: jest.fn().mockResolvedValue(true),
  isAuthorized: jest.fn().mockResolvedValue(true),
  loadLibrary: jest.fn().mockResolvedValue([]),
  play: jest.fn(),
  pause: jest.fn(),
  resume: jest.fn(),
  seek: jest.fn(),
  getPlaybackState: jest.fn().mockReturnValue({ position: 0, isPlaying: false }),
  createPlaylist: jest.fn(),
};

jest.mock('../../src/services', () => ({
  createMusicProvider: jest.fn(() => mockProvider),
  MusicProviderService: {},
}));

function Consumer() {
  const authorize = useProviderAuthorization();
  const { state } = useSift();
  return (
    <>
      <Text testID="status">{state.connectionStatus}</Text>
      <TouchableOpacity testID="go" onPress={() => authorize()} />
    </>
  );
}

function renderConsumer() {
  return render(
    <SiftProvider>
      <Consumer />
    </SiftProvider>,
  );
}

describe('useProviderAuthorization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProvider.requestAuthorization.mockResolvedValue(true);
  });

  test('reports connected when authorization is granted', async () => {
    const { getByTestId } = renderConsumer();
    await act(async () => {
      fireEvent.press(getByTestId('go'));
    });
    expect(mockProvider.requestAuthorization).toHaveBeenCalled();
    expect(getByTestId('status').props.children).toBe('connected');
  });

  test('reports disconnected when authorization is denied', async () => {
    mockProvider.requestAuthorization.mockResolvedValue(false);
    const { getByTestId } = renderConsumer();
    await act(async () => {
      fireEvent.press(getByTestId('go'));
    });
    expect(getByTestId('status').props.children).toBe('disconnected');
  });

  test('reports disconnected when authorization throws', async () => {
    mockProvider.requestAuthorization.mockRejectedValue(new Error('boom'));
    const { getByTestId } = renderConsumer();
    await act(async () => {
      fireEvent.press(getByTestId('go'));
    });
    expect(getByTestId('status').props.children).toBe('disconnected');
  });
});
