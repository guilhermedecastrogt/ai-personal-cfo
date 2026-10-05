export const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type ImageMimeType = (typeof SUPPORTED_IMAGE_TYPES)[number];

export interface ImageDescription {
  readonly mimeType: ImageMimeType;
  readonly width: number;
  readonly height: number;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_HEADER_LENGTH = 24;
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
const JPEG_MARKER_PREFIX = 0xff;
const JPEG_FRAME_MARKERS: ReadonlySet<number> = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);
const JPEG_FIRST_STANDALONE_MARKER = 0xd0;
const JPEG_LAST_STANDALONE_MARKER = 0xd9;
const WEBP_HEADER_LENGTH = 30;
const WEBP_DIMENSION_MASK = 0x3fff;

export function describeImage(bytes: Buffer): ImageDescription | undefined {
  return describePng(bytes) ?? describeJpeg(bytes) ?? describeWebp(bytes);
}

function describePng(bytes: Buffer): ImageDescription | undefined {
  const isPng =
    bytes.length >= PNG_HEADER_LENGTH &&
    bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE) &&
    bytes.toString('latin1', 12, 16) === 'IHDR';
  return isPng
    ? { mimeType: 'image/png', width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
    : undefined;
}

function describeJpeg(bytes: Buffer): ImageDescription | undefined {
  if (!bytes.subarray(0, JPEG_SIGNATURE.length).equals(JPEG_SIGNATURE)) {
    return undefined;
  }
  let offset = 2;
  while (offset + 9 <= bytes.length && bytes[offset] === JPEG_MARKER_PREFIX) {
    const marker = bytes[offset + 1] ?? 0;
    if (JPEG_FRAME_MARKERS.has(marker)) {
      return {
        mimeType: 'image/jpeg',
        height: bytes.readUInt16BE(offset + 5),
        width: bytes.readUInt16BE(offset + 7),
      };
    }
    const isStandalone =
      marker >= JPEG_FIRST_STANDALONE_MARKER && marker <= JPEG_LAST_STANDALONE_MARKER;
    offset += isStandalone ? 2 : 2 + bytes.readUInt16BE(offset + 2);
  }
  return undefined;
}

function describeWebp(bytes: Buffer): ImageDescription | undefined {
  const isWebp =
    bytes.length >= WEBP_HEADER_LENGTH &&
    bytes.toString('latin1', 0, 4) === 'RIFF' &&
    bytes.toString('latin1', 8, 12) === 'WEBP';
  if (!isWebp) {
    return undefined;
  }
  switch (bytes.toString('latin1', 12, 16)) {
    case 'VP8 ':
      return {
        mimeType: 'image/webp',
        width: bytes.readUInt16LE(26) & WEBP_DIMENSION_MASK,
        height: bytes.readUInt16LE(28) & WEBP_DIMENSION_MASK,
      };
    case 'VP8L': {
      const packed = bytes.readUInt32LE(21);
      return {
        mimeType: 'image/webp',
        width: (packed & WEBP_DIMENSION_MASK) + 1,
        height: ((packed >>> 14) & WEBP_DIMENSION_MASK) + 1,
      };
    }
    case 'VP8X':
      return {
        mimeType: 'image/webp',
        width: bytes.readUIntLE(24, 3) + 1,
        height: bytes.readUIntLE(27, 3) + 1,
      };
    default:
      return undefined;
  }
}
