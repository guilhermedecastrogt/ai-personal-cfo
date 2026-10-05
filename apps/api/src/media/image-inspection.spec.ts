import { describeImage } from './image-inspection.js';
import { jpegImage, pngImage, webpImage } from './testing/fake-media-source.fixture.js';

function webpWithChunk(chunk: 'VP8 ' | 'VP8L', write: (bytes: Buffer) => void): Buffer {
  const bytes = Buffer.alloc(40);
  bytes.write('RIFF', 0, 'latin1');
  bytes.write('WEBP', 8, 'latin1');
  bytes.write(chunk, 12, 'latin1');
  write(bytes);
  return bytes;
}

describe('describeImage', () => {
  it('recognises a PNG and reads its dimensions', () => {
    expect(describeImage(pngImage(1080, 1920))).toEqual({
      mimeType: 'image/png',
      width: 1080,
      height: 1920,
    });
  });

  it('recognises a JPEG and reads its dimensions past leading segments', () => {
    expect(describeImage(jpegImage(3024, 4032))).toEqual({
      mimeType: 'image/jpeg',
      width: 3024,
      height: 4032,
    });
  });

  it('recognises an extended WebP and reads its dimensions', () => {
    expect(describeImage(webpImage(750, 1334))).toEqual({
      mimeType: 'image/webp',
      width: 750,
      height: 1334,
    });
  });

  it('reads the dimensions of lossy and lossless WebP', () => {
    const lossy = webpWithChunk('VP8 ', (bytes) => {
      bytes.writeUInt16LE(640, 26);
      bytes.writeUInt16LE(480, 28);
    });
    const lossless = webpWithChunk('VP8L', (bytes) => {
      bytes.writeUInt32LE((640 - 1) | ((480 - 1) << 14), 21);
    });

    expect(describeImage(lossy)).toMatchObject({ width: 640, height: 480 });
    expect(describeImage(lossless)).toMatchObject({ width: 640, height: 480 });
  });

  it.each([
    ['a PDF', Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n')],
    ['a GIF', Buffer.from('GIF89a\u0001\u0000\u0001\u0000', 'latin1')],
    [
      'an SVG',
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
    ],
    ['HTML', Buffer.from('<!doctype html><html><body>receipt</body></html>')],
    ['an executable', Buffer.from('MZ\u0090\u0000\u0003\u0000\u0000\u0000', 'latin1')],
    ['plain text', Buffer.from('TOTAL 23.50 EUR')],
    ['nothing', Buffer.alloc(0)],
  ])('does not recognise %s', (_description, bytes) => {
    expect(describeImage(bytes)).toBeUndefined();
  });

  it('does not recognise a truncated PNG or a JPEG without a frame header', () => {
    expect(describeImage(pngImage().subarray(0, 20))).toBeUndefined();
    expect(
      describeImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00])),
    ).toBeUndefined();
  });

  it('judges by content, so a PDF with image bytes prepended to its name is still a PDF', () => {
    const disguised = Buffer.concat([Buffer.from('%PDF-1.7 '), pngImage()]);

    expect(describeImage(disguised)).toBeUndefined();
  });
});
