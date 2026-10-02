/**
 * LEB128 unsigned encoder/decoder core.
 *
 * The LEB128 scheme stores integers in a sequence of bytes where the
 * high bit of each byte marks continuation and the low seven bits carry
 * the value in little-endian order. For the unsigned variant (ULEB128)
 * the value is non-negative.
 *
 * WHY keep the byte type as number: JavaScript typed arrays operate on
 * unsigned 8-bit values returned as numbers, and every WebAssembly tool we
 * interoperate with emits Uint8Array. Keeping the public surface in
 * Uint8Array avoids forcing callers through a per-byte conversion.
 */

const MAX_SAFE_INTEGER_BITS = 53;

/**
 * Thrown when decoding fails due to malformed input or integer overflow.
 */
export class EncodingError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EncodingError';
    // Restore prototype for engines where Error subclassing is not preserved
    // across frames; see the TC39 note on Error subclassing.
    if (Object.setPrototypeOf) {
      Object.setPrototypeOf(this, new.target.prototype);
    }
  }
}

/**
 * Encode a non-negative integer as unsigned LEB128.
 *
 * @param {number} value - A non-negative integer up to Number.MAX_SAFE_INTEGER.
 * @returns {Uint8Array} Encoded bytes (minimum representation).
 * @throws {EncodingError} If the value is not a non-negative integer within
 *   safe integer range.
 */
export function encode(value) {
  // Input validation up-front so we never silently produce garbage bytes.
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new EncodingError(
      'encode: value must be a non-negative safe integer ' +
      '(got ' + String(value) + ')'
    );
  }

  // Special case zero: the algorithm below relies on value being truthy,
  // and produces a correct single-byte 0x00 only when we stop the loop
  // immediately. Specialising here keeps the loop branchless.
  if (value === 0) return new Uint8Array([0x00]);

  const bytes = [];
  let v = value;
  while (v > 0) {
    let byte = v & 0x7f;
    v = Math.floor(v / 128);
    if (v > 0) byte |= 0x80;
    bytes.push(byte);
  }
  return new Uint8Array(bytes);
}

/**
 * Decode an unsigned LEB128 integer from a byte source.
 *
 * WHY require a `byteOffset`-style interface rather than a generator:
 * real-world LEB128 appears mid-stream inside larger buffers (DWARF
 * debug_info, WASM sections). Returning the number of bytes consumed lets
 * the caller advance its own cursor.
 *
 * @param {Uint8Array} bytes - The source buffer.
 * @param {number} [byteOffset=0] - Index of the first byte to decode.
 * @returns {{ value: number, byteLength: number }} Decoded value and the
 *   number of bytes consumed.
 * @throws {EncodingError} If the input is malformed (truncated, non-canonical
 *   padding, too-large to fit in a safe integer).
 */
export function decode(bytes, byteOffset = 0) {
  if (!(bytes instanceof Uint8Array)) {
    throw new EncodingError('decode: expected a Uint8Array');
  }
  if (!Number.isSafeInteger(byteOffset) || byteOffset < 0) {
    throw new EncodingError('decode: byteOffset must be a non-negative safe integer');
  }
  if (byteOffset > bytes.length) {
    throw new EncodingError('decode: byteOffset out of range');
  }

  let value = 0;
  let shift = 0;
  let idx = byteOffset;

  // LEB128 carries 7 bits per byte, so after 8 bytes we have 56 bits — beyond
  // 53-bit safe-int range. Therefore the loop can run at most 8 iterations
  // before we are obligated to reject the input.
  while (idx < bytes.length) {
    if (idx - byteOffset >= 8) {
      throw new EncodingError('decode: value exceeds safe integer range');
    }
    const byte = bytes[idx];

    const group = byte & 0x7f;
    // Math.pow is safe here; shift stays a multiple of 7 between 0 and 49.
    const contribution = group * Math.pow(2, shift);
    if (value + contribution > Number.MAX_SAFE_INTEGER) {
      throw new EncodingError('decode: value exceeds safe integer range');
    }
    value += contribution;

    idx += 1;

    if ((byte & 0x80) === 0) {
      // Non-canonical padding check: the 8th byte must not contain bits
      // that would overflow MAX_SAFE_INTEGER (already guarded above),
      // but additionally we reject the case where the final byte is zero
      // AND a previous byte was already zero — this would mean the encoder
      // emitted unnecessary zero padding.
      if (idx - byteOffset > 1 && group === 0) {
        throw new EncodingError('decode: non-canonical trailing zero byte');
      }
      return { value, byteLength: idx - byteOffset };
    }

    shift += 7;
  }

  // We ran off the end without seeing a terminating byte.
  throw new EncodingError('decode: input ended before LEB128 terminator');
}

/**
 * Compute the number of bytes that encode the given non-negative integer
 * in unsigned LEB128. This is the exact length the encoder emits; used
 * for pre-sizing buffers in streaming contexts.
 *
 * @param {number} value
 * @returns {number}
 * @throws {EncodingError} Same validation as encode.
 */
export function encodingLength(value) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new EncodingError(
      'encodingLength: value must be a non-negative safe integer ' +
      '(got ' + String(value) + ')'
    );
  }
  if (value === 0) return 1;
  const bitLen = Math.floor(Math.log2(value)) + 1;
  return Math.ceil(bitLen / 7);
}
