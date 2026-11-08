export const MAX_IMAGE_AXIS = 2048;
export const MAX_IMAGE_DECODED_BYTES = 16 * 1024 * 1024;
export const MAX_IMAGE_ENCODED_BYTES = 16 * 1024 * 1024;

export interface PngInfo {
  width: number;
  height: number;
  decodedBytes: number;
}

/** CRC-32 over a PNG chunk's type and payload. No platform or decoder dependency. */
export function pngCrc(bytes: Uint8Array, start: number, end: number): number {
  let crc = 0xffffffff;
  for (let i = start; i < end; i++) {
    crc ^= bytes[i] ?? 0;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Framing and budgets precede the platform's actual image decode. Generated art uses 8-bit RGBA PNG. */
export function inspectPng(bytes: Uint8Array, expected?: readonly [number, number]): PngInfo {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (
    bytes.length < 57 ||
    bytes.length > MAX_IMAGE_ENCODED_BYTES ||
    !signature.every((byte, i) => bytes[i] === byte)
  )
    throw new Error('Invalid PNG signature or byte budget');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0;
  let height = 0;
  let offset = 8;
  let chunks = 0;
  let imageBytes = 0;
  let ended = false;
  while (offset < bytes.length) {
    if (++chunks > 1024 || offset + 12 > bytes.length) throw new Error('Invalid PNG chunk framing');
    const length = view.getUint32(offset);
    const end = offset + length + 12;
    if (end > bytes.length) throw new Error('Truncated PNG chunk');
    const type = String.fromCharCode(
      bytes[offset + 4] ?? 0,
      bytes[offset + 5] ?? 0,
      bytes[offset + 6] ?? 0,
      bytes[offset + 7] ?? 0,
    );
    if (!['IHDR', 'IDAT', 'IEND', 'sRGB', 'gAMA', 'cHRM', 'pHYs', 'sBIT'].includes(type))
      throw new Error(`Unsupported PNG chunk ${type}`);
    if (pngCrc(bytes, offset + 4, end - 4) !== view.getUint32(end - 4))
      throw new Error('PNG chunk checksum mismatch');
    if (chunks === 1 && type !== 'IHDR') throw new Error('PNG must start with IHDR');
    if (type === 'IHDR') {
      if (chunks !== 1 || length !== 13) throw new Error('Invalid PNG header');
      width = view.getUint32(offset + 8);
      height = view.getUint32(offset + 12);
      if (
        width < 1 ||
        height < 1 ||
        width > MAX_IMAGE_AXIS ||
        height > MAX_IMAGE_AXIS ||
        width * height * 4 > MAX_IMAGE_DECODED_BYTES
      )
        throw new Error('PNG decoded image exceeds budget');
      if (
        bytes[offset + 16] !== 8 ||
        bytes[offset + 17] !== 6 ||
        bytes[offset + 18] !== 0 ||
        bytes[offset + 19] !== 0 ||
        bytes[offset + 20] !== 0
      )
        throw new Error('PNG must be noninterlaced 8-bit RGBA');
    } else if (type === 'IDAT') imageBytes += length;
    else if (type === 'IEND') {
      if (length !== 0 || end !== bytes.length || imageBytes === 0)
        throw new Error('Invalid PNG ending');
      ended = true;
    }
    offset = end;
  }
  if (!ended) throw new Error('PNG lacks IEND');
  const decodedBytes = width * height * 4;
  if (bytes.length > decodedBytes + height + 65536)
    throw new Error('PNG encoded overhead exceeds budget');
  if (expected && (width !== expected[0] || height !== expected[1]))
    throw new Error('PNG dimensions differ from declared resource');
  return { width, height, decodedBytes };
}
