import { COLORS, GRADIENTS } from '../../src/theme';
import { contrastRatio } from '../helpers/contrast';

// The (foreground, background) pairs the app draws on its opaque surfaces,
// per theme, held to WCAG AA: 4.5:1 for text, 3:1 for non-text (tracks,
// glyphs). A new pair goes here when a screen starts drawing it; this checks
// real uses, not every token against every surface. Text on glass over a
// gradient (the resume sheet, the Done summary) isn't modeled here.
//
// Not covered, deliberately: keep/remove/skip as icons and stat dots (2.2:1
// on white) always sit next to a text label that carries the meaning.
//
// Blue has two tokens because one blue can't do both jobs in dark mode:
// accent for blue text and accentFill for buttons under a white label.

const TEXT = 4.5;
const NON_TEXT = 3;

type Pair = [label: string, foreground: string, background: string, min: number];

function pairs(scheme: 'light' | 'dark'): Pair[] {
  const c = COLORS[scheme];
  const [siftTop, siftBottom] = GRADIENTS.sifting[scheme];
  const pairsOn = (bg: string, bgName: string): Pair[] => [
    [`text on ${bgName}`, c.text, bg, TEXT],
    [`textSecondary on ${bgName}`, c.textSecondary, bg, TEXT],
    [`keepText on ${bgName}`, c.keepText, bg, TEXT],
    [`removeText on ${bgName}`, c.removeText, bg, TEXT],
    [`skipText on ${bgName}`, c.skipText, bg, TEXT],
    [`accent text on ${bgName}`, c.accent, bg, TEXT],
    [`textTertiary glyph on ${bgName}`, c.textTertiary, bg, NON_TEXT],
  ];
  return [
    // Settings sheet, Setup, Done and their cards.
    ...pairsOn(c.background, 'background'),
    ...pairsOn(c.surface, 'surface'),
    // Primary buttons: white label on the fill blue.
    [`white text on accent button`, '#FFFFFF', c.accentFill, TEXT],
    // Sift screen: action captions and time labels, and the progress and
    // seek tracks, over both ends of the sifting gradient. The progress fill
    // must stand apart from its track, not just from the background, or how
    // far along you are reads by hue alone.
    [`action caption on sift top`, c.textSecondary, siftTop, TEXT],
    [`action caption on sift bottom`, c.textSecondary, siftBottom, TEXT],
    [`progress track on sift top`, c.textTertiary, siftTop, NON_TEXT],
    [`progress fill against its track`, c.text, c.textTertiary, NON_TEXT],
  ];
}

describe.each(['light', 'dark'] as const)('%s theme contrast', (scheme) => {
  test.each(pairs(scheme))('%s', (_label, foreground, background, min) => {
    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(min);
  });
});

describe('contrastRatio', () => {
  test('black on white is 21:1', () => {
    expect(contrastRatio('#000', '#FFFFFF')).toBeCloseTo(21, 5);
  });

  test('a color on itself is 1:1', () => {
    expect(contrastRatio('#6C6C70', '#6C6C70')).toBeCloseTo(1, 5);
  });

  test('composites a translucent foreground over the background', () => {
    // 60% of rgb(60,60,67) over black: the old dark-mode action caption.
    expect(contrastRatio('rgba(60, 60, 67, 0.6)', '#000000')).toBeCloseTo(1.36, 2);
  });

  test('rejects a translucent background and unknown formats', () => {
    expect(() => contrastRatio('#000', 'rgba(0,0,0,0.5)')).toThrow('opaque');
    expect(() => contrastRatio('red', '#FFFFFF')).toThrow('Unsupported');
  });
});
