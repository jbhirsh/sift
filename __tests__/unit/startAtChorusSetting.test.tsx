import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { SiftProvider, useSift } from '../../src/context/SiftContext';
import * as PreferencesStore from '../../src/services/PreferencesStore';
import { DEFAULT_PREFERENCES, type Preferences } from '../../src/types';

jest.mock('../../src/services/PreferencesStore');
jest.mock('../../src/services/SessionStore');

const mockLoad = PreferencesStore.loadPreferences as jest.Mock;
const mockSave = PreferencesStore.updatePreferences as jest.Mock;
const saved = (changes: Partial<Preferences>): Preferences => ({
  ...DEFAULT_PREFERENCES,
  ...changes,
});

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
    mockLoad.mockResolvedValue(saved({ startAtChorus: true }));
    const { getByTestId } = await renderProvider();
    await waitFor(() => expect(getByTestId('value').props.children).toBe('true'));
    expect(mockLoad).toHaveBeenCalledTimes(1);
  });

  it('stays off when nothing is saved', async () => {
    mockLoad.mockResolvedValue(saved({ startAtChorus: false }));
    const { getByTestId } = await renderProvider();
    await waitFor(() => expect(mockLoad).toHaveBeenCalled());
    expect(getByTestId('value').props.children).toBe('false');
  });

  it('changes and saves the setting', async () => {
    mockLoad.mockResolvedValue(saved({ startAtChorus: false }));
    const { getByTestId } = await renderProvider();
    await fireEvent.press(getByTestId('on'));
    expect(getByTestId('value').props.children).toBe('true');
    expect(mockSave).toHaveBeenLastCalledWith({ startAtChorus: true });
    await fireEvent.press(getByTestId('off'));
    expect(getByTestId('value').props.children).toBe('false');
    expect(mockSave).toHaveBeenLastCalledWith({ startAtChorus: false });
  });

  it('keeps a change made before the saved value finished loading', async () => {
    let resolveLoad: (p: Preferences) => void = () => {};
    mockLoad.mockReturnValue(
      new Promise((r) => {
        resolveLoad = r;
      }),
    );
    const { getByTestId } = await renderProvider();
    await fireEvent.press(getByTestId('on'));
    await act(async () => {
      resolveLoad(saved({ startAtChorus: false }));
    });
    expect(getByTestId('value').props.children).toBe('true');
  });

  it('ignores a load that finishes after unmount', async () => {
    let resolveLoad: (p: Preferences) => void = () => {};
    mockLoad.mockReturnValue(
      new Promise((r) => {
        resolveLoad = r;
      }),
    );
    const { unmount } = await renderProvider();
    await unmount();
    await act(async () => {
      resolveLoad(saved({ startAtChorus: true }));
    });
    expect(mockSave).not.toHaveBeenCalled();
  });
});

describe("Setup's sort and filter, remembered across launches (#175)", () => {
  function SetupConsumer() {
    const { state, dispatch, setSortOrder, setFilter } = useSift();
    return (
      <>
        <Text testID="sort">{state.sortOrder}</Text>
        <Text testID="filter">{JSON.stringify(state.filter)}</Text>
        <TouchableOpacity testID="sort-oldest" onPress={() => setSortOrder('oldest')} />
        <TouchableOpacity testID="plays-5" onPress={() => setFilter({ maxPlays: 5 })} />
        <TouchableOpacity
          testID="resume"
          onPress={() =>
            dispatch({
              type: 'RESUME_SESSION',
              session: {
                provider: 'apple-music',
                source: { type: 'library' },
                activeSource: null,
                tracks: [
                  {
                    id: 't1',
                    name: 'A',
                    artist: 'B',
                    album: 'C',
                    duration: 1,
                    playCount: 0,
                    dateAdded: null,
                  },
                ],
                cursor: 0,
                kept: [],
                removed: [],
                skipped: [],
                sortOrder: 'newest',
                loadProgress: 1,
                loadMessage: '',
                loadError: null,
                playbackPosition: 0,
                isPlaying: false,
                removalErrors: [],
                failedRemovalIds: [],
                pending: null,
                connectionStatus: null,
                skipFiltering: false,
              } as never,
            })
          }
        />
      </>
    );
  }

  const renderSetup = () =>
    render(
      <SiftProvider>
        <SetupConsumer />
      </SiftProvider>,
    );

  it('the saved sort and Plays and Added choices come back at launch', async () => {
    mockLoad.mockResolvedValue(
      saved({ sortOrder: 'oldest', filter: { maxPlays: 0, addedYearsAgo: 3 } }),
    );
    const { getByTestId } = await renderSetup();
    await waitFor(() => expect(getByTestId('sort').props.children).toBe('oldest'));
    expect(JSON.parse(getByTestId('filter').props.children as string)).toEqual({
      maxPlays: 0,
      addedYearsAgo: 3,
    });
  });

  it('changing them on Setup saves just that choice', async () => {
    mockLoad.mockResolvedValue(saved({}));
    const { getByTestId } = await renderSetup();
    await waitFor(() => expect(mockLoad).toHaveBeenCalled());
    await fireEvent.press(getByTestId('sort-oldest'));
    expect(getByTestId('sort').props.children).toBe('oldest');
    expect(mockSave).toHaveBeenLastCalledWith({ sortOrder: 'oldest' });
    await fireEvent.press(getByTestId('plays-5'));
    expect(mockSave).toHaveBeenLastCalledWith({ filter: { maxPlays: 5 } });
    expect(JSON.parse(getByTestId('filter').props.children as string)).toEqual({
      maxPlays: 5,
      addedYearsAgo: null,
    });
  });

  it('a choice made before the saved ones loaded is kept; the others still load', async () => {
    let resolveLoad: (p: Preferences) => void = () => {};
    mockLoad.mockReturnValue(
      new Promise((r) => {
        resolveLoad = r;
      }),
    );
    const { getByTestId } = await renderSetup();
    await fireEvent.press(getByTestId('sort-oldest'));
    await act(async () => {
      resolveLoad(saved({ sortOrder: 'random', filter: { maxPlays: 20, addedYearsAgo: null } }));
    });
    expect(getByTestId('sort').props.children).toBe('oldest');
    expect(JSON.parse(getByTestId('filter').props.children as string)).toEqual({
      maxPlays: 20,
      addedYearsAgo: null,
    });
  });

  it('Plays changed before the saved choices loaded keeps the saved Added', async () => {
    let resolveLoad: (p: Preferences) => void = () => {};
    mockLoad.mockReturnValue(
      new Promise((r) => {
        resolveLoad = r;
      }),
    );
    const { getByTestId } = await renderSetup();
    await fireEvent.press(getByTestId('plays-5'));
    await act(async () => {
      resolveLoad(saved({ filter: { maxPlays: 20, addedYearsAgo: 3 } }));
    });
    expect(JSON.parse(getByTestId('filter').props.children as string)).toEqual({
      maxPlays: 5,
      addedYearsAgo: 3,
    });
  });

  it('a session resumed before they loaded keeps its own sort; resuming saves nothing', async () => {
    let resolveLoad: (p: Preferences) => void = () => {};
    mockLoad.mockReturnValue(
      new Promise((r) => {
        resolveLoad = r;
      }),
    );
    const { getByTestId } = await renderSetup();
    await fireEvent.press(getByTestId('resume'));
    await act(async () => {
      resolveLoad(saved({ sortOrder: 'random', filter: { maxPlays: 20, addedYearsAgo: null } }));
    });
    expect(getByTestId('sort').props.children).toBe('newest');
    expect(JSON.parse(getByTestId('filter').props.children as string)).toEqual({
      maxPlays: null,
      addedYearsAgo: null,
    });
    expect(mockSave).not.toHaveBeenCalled();
  });
});
