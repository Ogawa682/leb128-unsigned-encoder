/**
 * LEB128 Unsigned Encoder — ESM entry point.
 *
 * Encodes and decodes unsigned little-endian base 128 variable-length
 * integers as used in WebAssembly and DWARF. Zero third-party deps.
 */
import { encode, decode, encodingLength, EncodingError } from './core.js';

export { encode, decode, encodingLength, EncodingError };
export default { encode, decode, encodingLength, EncodingError };
