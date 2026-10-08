import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { SiftProvider, useSift } from '../../src/context/SiftContext';
import * as PreferencesStore from '../../src/services/PreferencesStore';

jest.mock('../../src/services/PreferencesStore');
jest.mock('../../src/services/SessionStore');

const mockLoad = PreferencesStore.loadPreferences as jest.Mock;
const mockSave = PreferencesStore.savePreferences as jest.Mock;

function Consumer() {
  const { state, setStartAtChorus } = useSift();
  return (
    <>
      <Text testID="value">{String(state.startAtChorus)}</Text>
      <TouchableOpacity testID="on" onPress={() => setStartAtChorus(true)} />
      <TouchableOpacity testID="off" onPress={() => setStartAtChorus(false)} />
    </>
  );
}

const renderProvider = () =>
  render(
    <SiftProvider>
      <Consumer />
    </SiftProvider>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockSave.mockResolvedValue(undefined);
});

describe('"Start at chorus" setting in SiftProvider', () => {
  it('starts off and loads the saved value', async () => {
    mockLoad.mockResolvedValue({ startAtChorus: true });
    const { getByTestId } = await renderProvider();
    await waitFor(() => expect(getByTestId('value').props.children).toBe('true'));
    expect(mockLoad).toHaveBeenCalledTimes(1);
  });

  it('stays off when nothing is saved', async () => {
    mockLoad.mockResolvedValue({ startAtChorus: false });
    const { getByTestId } = await renderProvider();
    await waitFor(() => expect(mockLoad).toHaveBeenCalled());
    expect(getByTestId('value').props.children).toBe('false');
  });

  it('changes and saves the setting', async () => {
    mockLoad.mockResolvedValue({ startAtChorus: false });
    const { getByTestId } = await renderProvider();
    await fireEvent.press(getByTestId('on'));
    expect(getByTestId('value').props.children).toBe('true');
    expect(mockSave).toHaveBeenLastCalledWith({ startAtChorus: true });
    await fireEvent.press(getByTestId('off'));
    expect(getByTestId('value').props.children).toBe('false');
    expect(mockSave).toHaveBeenLastCalledWith({ startAtChorus: false });
  });

  it('keeps a change made before the saved value finished loading', async () => {
    let resolveLoad: (p: { startAtChorus: boolean }) => void = () => {};
    mockLoad.mockReturnValue(new Promise((r) => { resolveLoad = r; }));
    const { getByTestId } = await renderProvider();
    await fireEvent.press(getByTestId('on'));
    await act(async () => {
      resolveLoad({ startAtChorus: false });
    });
    expect(getByTestId('value').props.children).toBe('true');
  });

  it('ignores a load that finishes after unmount', async () => {
    let resolveLoad: (p: { startAtChorus: boolean }) => void = () => {};
    mockLoad.mockReturnValue(new Promise((r) => { resolveLoad = r; }));
    const { unmount } = await renderProvider();
    await unmount();
    await act(async () => {
      resolveLoad({ startAtChorus: true });
    });
    expect(mockSave).not.toHaveBeenCalled();
  });
});
