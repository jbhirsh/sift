import {
  clampStart,
  END_MARGIN_SECONDS,
  estimateChorusStart,
  findChorusStart,
  isUsablePreviewOffset,
  LEAD_IN_SECONDS,
  normalizeLyric,
  normalizeTitle,
  parseSyncedLyrics,
  singsTitle,
  startFromLyrics,
} from '../../src/utils/chorus';
import songs from '../helpers/chorusSongs.json';

/** Build LRC from [seconds, text] rows; '' rows become blank lines. */
function lrc(rows: ([number, string] | '')[]): string {
  return rows
    .map((row) => {
      if (row === '') return '';
      const [t, text] = row;
      const m = Math.floor(t / 60);
      const s = (t - m * 60).toFixed(2).padStart(5, '0');
      return `[${String(m).padStart(2, '0')}:${s}]${text}`;
    })
    .join('\n');
}

describe('parseSyncedLyrics', () => {
  it('parses timestamps into sorted seconds and keeps the text', () => {
    expect(parseSyncedLyrics('[00:12.50]Second\n[00:01.25]First\n[01:02]Third')).toEqual([
      { time: 1.25, text: 'First' },
      { time: 12.5, text: 'Second' },
      { time: 62, text: 'Third' },
    ]);
  });

  it('expands stacked timestamps into one line per time', () => {
    expect(parseSyncedLyrics('[00:10.00][00:40.00]Hook')).toEqual([
      { time: 10, text: 'Hook' },
      { time: 40, text: 'Hook' },
    ]);
  });

  it('applies the offset header: positive moves lines earlier', () => {
    expect(parseSyncedLyrics('[offset:+500]\n[00:10.00]A')).toEqual([{ time: 9.5, text: 'A' }]);
    expect(parseSyncedLyrics('[offset:-1000]\n[00:10.00]A')).toEqual([{ time: 11, text: 'A' }]);
    expect(parseSyncedLyrics('[offset:+5000]\n[00:01.00]A')).toEqual([{ time: 0, text: 'A' }]);
  });

  it('reads [mm:ss:xx] timestamps and strips enhanced-LRC word timings', () => {
    expect(parseSyncedLyrics('[00:10:50]A\n[00:12.30]<00:12.30>Two <00:12.90>words')).toEqual([
      { time: 10.5, text: 'A' },
      { time: 12.3, text: 'Two words' },
    ]);
  });

  it('skips metadata tags, untimed text and a timestamp in mid-line', () => {
    expect(parseSyncedLyrics('[ar:Artist]\n[ti:Title]\nno tag\nwords [00:05.00]late')).toEqual([]);
  });

  it('accepts leading whitespace and three-digit minutes', () => {
    expect(parseSyncedLyrics('   [100:00.00]Long')).toEqual([{ time: 6000, text: 'Long' }]);
  });

  it('marks the line after a blank, empty or ♪ line as a section start', () => {
    const lines = parseSyncedLyrics('[00:01.00]A\n\n[00:02.00]B\n[00:03.00]\n[00:04.00]C\n[00:05.00]♪\n[00:06.00]D\n[00:07.00]E');
    expect(lines.map((l) => [l.text, l.sectionStart === true])).toEqual([
      ['A', false],
      ['B', true],
      ['C', true],
      ['D', true],
      ['E', false],
    ]);
  });

  it('never marks the first line, nor stacked lines, as a section start', () => {
    expect(parseSyncedLyrics('\n[00:01.00]A')[0].sectionStart).toBeUndefined();
    const stacked = parseSyncedLyrics('[00:01.00]A\n\n[00:02.00][00:09.00]B');
    expect(stacked.filter((l) => l.sectionStart)).toEqual([]);
  });
});

describe('normalizeLyric / normalizeTitle', () => {
  it('lowercases and drops bracketed asides, apostrophes and punctuation', () => {
    expect(normalizeLyric("I'm Blinded (oh-oh) by the [chorus] LIGHTS!")).toBe('im blinded by the lights');
    expect(normalizeLyric('Don’t—stop,  believin’')).toBe('dont stop believin');
    expect(normalizeLyric('(only an ad-lib)')).toBe('');
  });

  it('keeps letters and digits from any script', () => {
    expect(normalizeLyric('Café 99 Luftballons ¿qué?')).toBe('café 99 luftballons qué');
  });

  it('drops feat., bracketed and dash-separated title suffixes', () => {
    expect(normalizeTitle('Mr. Brightside')).toBe('mr brightside');
    expect(normalizeTitle('Uptown Funk (feat. Bruno Mars)')).toBe('uptown funk');
    expect(normalizeTitle('Hotel California - 2013 Remaster')).toBe('hotel california');
    expect(normalizeTitle('Song [Live]')).toBe('song');
  });
});

describe('singsTitle', () => {
  it('matches the title as a whole-word phrase', () => {
    expect(singsTitle('welcome to the hotel california', 'hotel california')).toBe(true);
    expect(singsTitle('so lovely here', 'love')).toBe(false);
  });

  it('matches multi-word titles by word stems, in order', () => {
    expect(singsTitle('i said ooh im blinded by the lights', 'blinding lights')).toBe(true);
    expect(singsTitle('the lights are blinding', 'blinding lights')).toBe(false);
    expect(singsTitle('blinded by the night', 'blinding lights')).toBe(false);
  });

  it('matches short title words exactly and skips one- and two-letter words', () => {
    expect(singsTitle('old dusty town', 'old town')).toBe(true);
    expect(singsTitle('old dusty towns', 'old town')).toBe(false);
    expect(singsTitle('bold dusty town', 'old town')).toBe(false);
    expect(singsTitle('the shape of the world', 'shape of you')).toBe(false);
    expect(singsTitle('shapes of a youth', 'shape of you')).toBe(false);
  });

  it('ignores common words when matching titles by stem', () => {
    expect(singsTitle('for all of you', 'for you')).toBe(false);
    expect(singsTitle('the only one', 'the one')).toBe(false);
    expect(singsTitle('you are the one for me', 'the one')).toBe(true);
  });

  it('needs two words over two letters for a stem match', () => {
    expect(singsTitle('humbled', 'humble')).toBe(false);
    expect(singsTitle('humbled by it', 'be humble')).toBe(false);
  });
});

describe('findChorusStart on real songs', () => {
  // Timings and line-repetition structure of real songs from LRCLIB, with the
  // lyrics replaced by placeholders (see the fixture). Each expectation was
  // checked against the song: on the chorus's first line, except Blinding
  // Lights (its pre-chorus, 7 s early) and Uptown Funk/HUMBLE. (the hook).
  // Seven Nation Army and Bohemian Rhapsody have no repeated chorus.
  it.each(songs.map((s) => [s.title, s] as const))('%s', (_, song) => {
    const match = findChorusStart(parseSyncedLyrics(song.lrc), {
      title: song.title,
      duration: song.duration,
    });
    if (song.expected === null) {
      expect(match).toBeNull();
    } else {
      expect(match?.method).toBe(song.expected.method);
      expect(match?.time).toBeCloseTo(song.expected.time, 2);
    }
  });

  it('finds the songs it should', () => {
    const found = songs.filter((s) => s.expected !== null).map((s) => s.title);
    expect(found).toHaveLength(16);
    expect(songs.find((s) => s.title === 'Mr. Brightside')?.expected).toEqual({ time: 58.44, method: 'title' });
  });
});

describe('findChorusStart rules', () => {
  const duration = 200; // window 20 s – 120 s

  it('returns null for short tracks and empty lyrics', () => {
    expect(findChorusStart(parseSyncedLyrics(lrc([[20, 'a'], [30, 'a']])), { title: 'x', duration: 59 })).toBeNull();
    expect(findChorusStart([], { title: 'x', duration })).toBeNull();
    expect(findChorusStart(parseSyncedLyrics('[00:30.00](ad-lib)'), { title: 'x', duration })).toBeNull();
  });

  it('title rule: earliest repeated title line inside the window', () => {
    const lines = parseSyncedLyrics(
      lrc([
        [10, 'my song intro'], // before the window
        [12, 'my song intro'],
        [40, 'verse'],
        [50, 'sing my song now'],
        [90, 'sing my song now'],
      ]),
    );
    expect(findChorusStart(lines, { title: 'My Song', duration })).toEqual({ time: 50, method: 'title' });
  });

  it('title rule: a title line sung once is not a chorus', () => {
    const lines = parseSyncedLyrics(lrc([[50, 'my song'], [60, 'x'], [70, 'y']]));
    expect(findChorusStart(lines, { title: 'My Song', duration })).toBeNull();
  });

  it('title rule: walks back over lines that precede every chorus', () => {
    const lines = parseSyncedLyrics(
      lrc([
        [30, 'verse a'],
        [40, 'chorus one'],
        [45, 'chorus two my song'],
        [70, 'verse b'],
        [80, 'chorus one'],
        [85, 'chorus two my song'],
      ]),
    );
    expect(findChorusStart(lines, { title: 'my song', duration })).toEqual({ time: 40, method: 'title' });
  });

  it('title rule: stops walking back at a section break', () => {
    const lines = parseSyncedLyrics(
      lrc([[30, 'pre'], '', [40, 'my song'], [70, 'pre'], [80, 'my song']]),
    );
    expect(findChorusStart(lines, { title: 'my song', duration })).toEqual({ time: 40, method: 'title' });
  });

  it('title rule: stops at a line sung under half as often as the title line', () => {
    const lines = parseSyncedLyrics(
      lrc([
        [30, 'pre'],
        [40, 'my song'],
        [42, 'my song'],
        [70, 'pre'],
        [80, 'my song'],
        [82, 'my song'],
        [110, 'my song'],
      ]),
    );
    // "pre" is sung 2× against the title line's 5×.
    expect(findChorusStart(lines, { title: 'my song', duration })?.time).toBe(40);
  });

  it('title rule: walks back at most 30 s and never before the window', () => {
    const far = parseSyncedLyrics(lrc([[25, 'a'], [56, 'my song'], [80, 'a'], [111, 'my song']]));
    expect(findChorusStart(far, { title: 'my song', duration })?.time).toBe(56);
    const early = parseSyncedLyrics(lrc([[15, 'a'], [25, 'my song'], [80, 'a'], [90, 'my song']]));
    expect(findChorusStart(early, { title: 'my song', duration })?.time).toBe(25);
  });

  it('title rule: ignores ad-lib-only lines between chorus lines', () => {
    const lines = parseSyncedLyrics(
      lrc([
        [40, 'we had it all'],
        [42, '(echo)'],
        [43, 'my song'],
        [80, 'we had it all'],
        [82, '(echo)'],
        [83, 'my song'],
      ]),
    );
    expect(findChorusStart(lines, { title: 'my song', duration })?.time).toBe(40);
  });

  it('title rule: an ad-lib line carries its section break to the next line', () => {
    const lines = parseSyncedLyrics(
      lrc([[30, 'pre'], '', [39, '(oh)'], [40, 'my song'], [70, 'pre'], '', [79, '(oh)'], [80, 'my song']]),
    );
    expect(findChorusStart(lines, { title: 'my song', duration })?.time).toBe(40);
  });

  it('block rule: the most-repeated run of lines inside the window', () => {
    const lines = parseSyncedLyrics(
      lrc([
        [30, 'a'],
        [32, 'b'],
        [50, 'c'],
        [52, 'd'],
        [54, 'e'],
        [60, 'x'],
        [70, 'c'],
        [72, 'd'],
        [74, 'e'],
        [80, 'y'],
        [90, 'a'],
        [92, 'b'],
        [100, 'c'],
        [102, 'd'],
        [104, 'e'],
      ]),
    );
    // c-d-e (3 lines × 3) beats a-b-c-d (4 lines × 2), though a-b comes first.
    expect(findChorusStart(lines, { title: 'unsung', duration })).toEqual({ time: 50, method: 'block' });
  });

  it('block rule: ignores runs that first start outside the window', () => {
    const lines = parseSyncedLyrics(
      lrc([[130, 'a'], [132, 'b'], [150, 'a'], [152, 'b'], [170, 'a'], [172, 'b']]),
    );
    expect(findChorusStart(lines, { title: 'unsung', duration })).toBeNull();
  });

  it('line rule: a single line sung three times, when nothing else repeats', () => {
    const lines = parseSyncedLyrics(lrc([[30, 'x'], [40, 'hey'], [60, 'y'], [70, 'hey'], [90, 'z'], [100, 'hey']]));
    expect(findChorusStart(lines, { title: 'unsung', duration })).toEqual({ time: 40, method: 'line' });
  });

  it('line rule: twice is not enough', () => {
    const lines = parseSyncedLyrics(lrc([[40, 'hey'], [60, 'y'], [70, 'hey']]));
    expect(findChorusStart(lines, { title: 'unsung', duration })).toBeNull();
  });

  it('ignores a title under three letters', () => {
    const lines = parseSyncedLyrics(lrc([[40, 'go'], [50, 'x'], [60, 'go']]));
    expect(findChorusStart(lines, { title: 'Go', duration })).toBeNull();
  });
});

describe('start positions', () => {
  it('estimate: a fifth of the way in, kept between 0:30 and 1:00', () => {
    expect(estimateChorusStart(200)).toBe(40);
    expect(estimateChorusStart(100)).toBe(30);
    expect(estimateChorusStart(400)).toBe(60);
  });

  it('estimate: 0:00 for short or unknown durations, and clear of the end', () => {
    expect(estimateChorusStart(59)).toBe(0);
    expect(estimateChorusStart(Number.NaN)).toBe(0);
    expect(estimateChorusStart(60)).toBe(30);
  });

  it('clampStart keeps a start between 0 and the end margin', () => {
    expect(clampStart(-5, 200)).toBe(0);
    expect(clampStart(50, 200)).toBe(50);
    expect(clampStart(199, 200)).toBe(200 - END_MARGIN_SECONDS);
    expect(clampStart(Number.NaN, 200)).toBe(0);
    expect(clampStart(Number.POSITIVE_INFINITY, 200)).toBe(0);
    expect(clampStart(30, 59)).toBe(0);
  });

  it('startFromLyrics leads in before the chorus line', () => {
    expect(startFromLyrics({ time: 58.44, method: 'title' }, 222)).toBeCloseTo(58.44 - LEAD_IN_SECONDS);
    expect(startFromLyrics({ time: 0.2, method: 'line' }, 222)).toBe(0);
  });

  it('isUsablePreviewOffset accepts offsets clear of both ends of the track', () => {
    expect(isUsablePreviewOffset(45, 200)).toBe(true);
    expect(isUsablePreviewOffset(1, 200)).toBe(true);
    expect(isUsablePreviewOffset(200 - END_MARGIN_SECONDS, 200)).toBe(true);
    expect(isUsablePreviewOffset(0.5, 200)).toBe(false);
    expect(isUsablePreviewOffset(200 - END_MARGIN_SECONDS + 1, 200)).toBe(false);
    expect(isUsablePreviewOffset(null, 200)).toBe(false);
    expect(isUsablePreviewOffset(undefined, 200)).toBe(false);
    expect(isUsablePreviewOffset(Number.NaN, 200)).toBe(false);
    expect(isUsablePreviewOffset(30, 59)).toBe(false);
  });
});
