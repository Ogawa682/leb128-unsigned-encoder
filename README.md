# LEB128 Unsigned Encoder

Encode and decode unsigned little-endian base-128 integers (ULEB128) as used in WebAssembly and DWARF.

```js
import { encode, decode, encodingLength, EncodingError } from './src/index.js';

const bytes = encode(300);      // Uint8Array [0xac, 0x02]
const { value, byteLength } = decode(bytes);  // { value: 300, byteLength: 2 }
encodingLength(300);            // 2
try { encode(-1); } catch (e) { /* EncodingError */ }
```

## Why this exists

WebAssembly and DWARF both serialise integers as variable-length byte sequences to keep small values small. Hand-rolling this is easy to get subtly wrong on the decode side: off-by-one continuation checks, truncated input that produces a silent zero, or non-canonical padding that later parsers reject. This library exists to centralise one correct implementation with no runtime dependencies — the trade-off being that it deliberately refuses values above `Number.MAX_SAFE_INTEGER` rather than switching to `BigInt`, since both ecosystems it targets (WASM and DWARF tooling) overwhelmingly handle 32-bit and 64-bit values, and the 53-bit ceiling covers the latter.

## Edge cases

- **Trailing zero padding** (e.g. `0x80 0x00` instead of `0x00`) is rejected as non-canonical, matching what strict DWARF and WASM validators expect.
- **Truncated input** (a final byte with the continuation bit set and no following byte) raises `EncodingError` rather than returning a partial value.
- **Values above `Number.MAX_SAFE_INTEGER`** are rejected on both encode and decode; if you need wider values you are in the wrong library and should wrap a `BigInt`-based variant yourself.
- **Byte offset into a larger buffer** is supported via the optional second argument to `decode`, so you can parse LEB128 values in-stream without slicing.

## Exported surface

| name | signature |
| --- | --- |
| `encode(value)` | `(number) => Uint8Array` |
| `decode(bytes, byteOffset = 0)` | `(Uint8Array, number?) => { value: number, byteLength: number }` |
| `encodingLength(value)` | `(number) => number` |
| `EncodingError` | `class extends Error` |

All functions throw `EncodingError` on invalid input; none return `undefined` or `null`.
