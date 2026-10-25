import { readFileSync } from 'fs';
import { join } from 'path';
import { COLORS } from '../../src/theme';

// The PR GIF tool (jbhirsh/ci's gif/videos.mjs, set up by .github/ci.json's
// `gif` key) cuts the waits between touches by finding the ring
// components/TouchOverlay draws, by its colour.
const settings: unknown = JSON.parse(
  readFileSync(join(__dirname, '../../.github/ci.json'), 'utf8'),
);

function gif(): { source?: unknown; videos?: { ringColor?: unknown } } {
  if (typeof settings !== 'object' || settings === null || !('gif' in settings)) return {};
  const { gif: section } = settings as { gif: unknown };
  return typeof section === 'object' && section !== null ? section : {};
}

describe('the PR GIF settings', () => {
  it('turn the videos CI records into GIFs', () => {
    expect(gif().source).toBe('ci-videos');
  });

  it('look for the ring in the colour the overlay draws it', () => {
    const ring = gif().videos?.ringColor;
    expect(typeof ring).toBe('string');
    expect(String(ring).toUpperCase()).toBe(COLORS.touch.toUpperCase());
  });
});
