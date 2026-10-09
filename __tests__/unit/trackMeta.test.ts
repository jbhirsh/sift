import { formatTrackMeta } from '../../src/utils/trackMeta';

// Mid-month, midday dates so the local month is the same in every timezone.
describe('formatTrackMeta', () => {
  test('play count and add month', () => {
    expect(formatTrackMeta(28, '2021-03-15T12:00:00.000Z')).toEqual({
      text: 'Played 28× · Added Mar 2021',
      label: 'Played 28 times, added March 2021',
    });
  });

  test('one play reads "once"', () => {
    expect(formatTrackMeta(1, '2019-12-15T12:00:00.000Z')).toEqual({
      text: 'Played 1× · Added Dec 2019',
      label: 'Played once, added December 2019',
    });
  });

  test('a library song with an add date and no plays was never played', () => {
    expect(formatTrackMeta(0, '2020-01-15T12:00:00.000Z')).toEqual({
      text: 'Never played · Added Jan 2020',
      label: 'Never played, added January 2020',
    });
  });

  test('a count with no add date shows the count alone', () => {
    expect(formatTrackMeta(5, '')).toEqual({ text: 'Played 5×', label: 'Played 5 times' });
  });

  test('an unparseable date is dropped', () => {
    expect(formatTrackMeta(5, 'not a date').text).toBe('Played 5×');
  });

  test('0 plays with no add date is unknown (Apple fallback tracks), not "never played"', () => {
    expect(formatTrackMeta(0, '')).toEqual({ text: '', label: '' });
  });

  test('a provider without play counts (Spotify) shows only the add date', () => {
    expect(formatTrackMeta(0, '2021-03-15T12:00:00.000Z', { playsKnown: false })).toEqual({
      text: 'Added Mar 2021',
      label: 'Added March 2021',
    });
    expect(formatTrackMeta(0, '', { playsKnown: false })).toEqual({ text: '', label: '' });
  });
});
