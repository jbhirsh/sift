import fc from 'fast-check';
import { parseCoverList, pictureOf } from '../../scripts/fetch-mock-covers';

// Property-based tests: the fetch script reads what Apple sends and a list a
// PR can edit. Whatever either holds, it answers or refuses with an Error,
// and a JPEG's metadata never changes its picture hash. The examples are in
// fetchMockCovers.test.ts.

const segment = (marker: number, payload: number[]) => [
  0xff,
  marker,
  (payload.length + 2) >> 8,
  (payload.length + 2) & 0xff,
  ...payload,
];

const jpegWith = (metadata: number[], comment: number[]) =>
  Uint8Array.from([
    0xff,
    0xd8,
    ...segment(0xe1, metadata),
    ...segment(0xfe, comment),
    ...segment(0xc0, [8, 0, 6, 0, 8, 1, 1, 0x11, 0]),
    ...segment(0xda, [1, 1, 0, 0, 63, 0]),
    0x11,
    0xff,
    0x00,
    0x22,
    0xff,
    0xd9,
  ]);

const bytes = fc.array(fc.integer({ min: 0, max: 255 }), { maxLength: 40 });

describe('fetch-mock-covers properties', () => {
  test('pictureOf answers or throws an Error, whatever the bytes', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 200 }), (input) => {
        try {
          const picture = pictureOf(input);
          return (
            picture.width > 0 && picture.height > 0 && /^[0-9a-f]{64}$/.test(picture.pictureHash)
          );
        } catch (error) {
          return error instanceof Error && /^not a whole JPEG/.test(error.message);
        }
      }),
    );
  });

  test('pictureOf survives JPEG-shaped bytes cut anywhere', () => {
    const whole = jpegWith([1, 2, 3], [4, 5]);
    fc.assert(
      fc.property(fc.integer({ min: 0, max: whole.length }), (cut) => {
        try {
          pictureOf(whole.subarray(0, cut));
          return cut === whole.length;
        } catch (error) {
          return error instanceof Error && /^not a whole JPEG/.test(error.message);
        }
      }),
    );
  });

  test('metadata and comments never change the picture hash', () => {
    const base = pictureOf(jpegWith([], []));
    fc.assert(
      fc.property(bytes, bytes, (metadata, comment) => {
        expect(pictureOf(jpegWith(metadata, comment))).toEqual(base);
      }),
    );
  });

  test('parseCoverList answers or throws an Error, whatever the text', () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.json()), (text) => {
        try {
          const list = parseCoverList(text);
          return list.length > 0 && list.every((entry) => /^[a-z0-9-]+$/.test(entry.slug));
        } catch (error) {
          return error instanceof Error;
        }
      }),
    );
  });
});
