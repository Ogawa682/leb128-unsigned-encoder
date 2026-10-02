import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { encode, decode, encodingLength, EncodingError } from '../src/index.js';

describe('encode', () => {
  it('encodes 0 as a single zero byte', () => {
    assert.deepEqual(Array.from(encode(0)), [0x00]);
  });

  it('encodes a small value under 128 as a single byte', () => {
    assert.deepEqual(Array.from(encode(127)), [0x7f]);
  });

  it('encodes 128 with continuation', () => {
    // 128 = 0b10000000 -> low 7 bits 0, high bit set
    assert.deepEqual(Array.from(encode(128)), [0x80, 0x01]);
  });

  it('encodes 300 to the canonical two-byte form', () => {
    assert.deepEqual(Array.from(encode(300)), [0xac, 0x02]);
  });

  it('encodes MAX_SAFE_INTEGER without loss', () => {
    const bytes = encode(Number.MAX_SAFE_INTEGER);
    // 9007199254740991 = 2^53 - 1 needs 8 bytes (53 bits / 7 -> 8 groups)
    assert.equal(bytes.length, 8);
    assert.equal(decode(bytes).value, Number.MAX_SAFE_INTEGER);
  });

  it('throws on negative values', () => {
    assert.throws(() => encode(-1), (err) => {
      assert.equal(err instanceof EncodingError, true);
      return true;
    });
  });

  it('throws on non-integer numbers', () => {
    assert.throws(() => encode(1.5), (err) => {
      assert.ok(err instanceof EncodingError);
      return true;
    });
  });

  it('throws on unsafe integers', () => {
    assert.throws(() => encode(Number.MAX_SAFE_INTEGER + 1), (err) => {
      assert.ok(err instanceof EncodingError);
      return true;
    });
  });
});

describe('decode', () => {
  it('decodes zero', () => {
    const { value, byteLength } = decode(new Uint8Array([0x00]));
    assert.equal(value, 0);
    assert.equal(byteLength, 1);
  });

  it('decodes 300', () => {
    const { value, byteLength } = decode(new Uint8Array([0xac, 0x02]));
    assert.equal(value, 300);
    assert.equal(byteLength, 2);
  });

  it('decodes from a byteOffset', () => {
    const buf = new Uint8Array([0xff, 0xac, 0x02, 0xff]);
    const { value, byteLength } = decode(buf, 1);
    assert.equal(value, 300);
    assert.equal(byteLength, 2);
  });

  it('rejects truncated input', () => {
    // continuation bit set, no terminator follows
    assert.throws(
      () => decode(new Uint8Array([0x80])),
      (err) => { assert.ok(err instanceof EncodingError); return true; }
    );
  });

  it('rejects non-canonical trailing zero padding', () => {
    // 0x80, 0x00 = 0 in two bytes; canonical form is 0x00
    assert.throws(
      () => decode(new Uint8Array([0x80, 0x00])),
      (err) => { assert.ok(err instanceof EncodingError); return true; }
    );
  });

  it('rejects input whose decoded value exceeds MAX_SAFE_INTEGER', () => {
    // Construct 8 bytes that set bit 53 (beyond safe-int).
    // value = 2^53 = 0b1 followed by 53 zeros.
    // In 7-bit groups that is [0,0,0,0,0,0,0,0x20] with continuations
    // on the first 7 bytes and high bit cleared on the 8th.
    const bytes = new Uint8Array(8);
    for (let i = 0; i < 7; i++) bytes[i] = 0x80;
    bytes[7] = 0x20;
    assert.throws(
      () => decode(bytes),
      (err) => { assert.ok(err instanceof EncodingError); return true; }
    );
  });

  it('rejects byteOffset out of range', () => {
    assert.throws(
      () => decode(new Uint8Array([0x00]), 5),
      (err) => { assert.ok(err instanceof EncodingError); return true; }
    );
  });

  it('rejects non-Uint8Array input', () => {
    assert.throws(
      () => decode([0x00]),
      (err) => { assert.ok(err instanceof EncodingError); return true; }
    );
  });
});

describe('encodingLength', () => {
  it('reports 1 byte for zero', () => {
    assert.equal(encodingLength(0), 1);
  });

  it('reports the encoder output length for assorted values', () => {
    for (const v of [0, 1, 127, 128, 300, 16383, 16384, Number.MAX_SAFE_INTEGER]) {
      assert.equal(encodingLength(v), encode(v).length);
    }
  });

  it('rejects negative values', () => {
    assert.throws(() => encodingLength(-1), (err) => {
      assert.ok(err instanceof EncodingError);
      return true;
    });
  });
});

describe('round-trip', () => {
  it('round-trips a deterministic sample of values', () => {
    const samples = [
      0, 1, 2, 7, 127, 128, 255, 256,
      16383, 16384, 2097151, 2097152,
      134217728, Number.MAX_SAFE_INTEGER,
    ];
    for (const v of samples) {
      const enc = encode(v);
      const { value } = decode(enc);
      assert.equal(value, v, 'round-trip failed for ' + v);
    }
  });
});
