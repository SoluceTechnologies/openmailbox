import { sha256Hex } from '@/utils/sha256';

describe('sha256Hex', () => {
  it('matches the reference digests', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
    expect(sha256Hex('a'.repeat(1000))).toBe('41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3');
  });

  it('hashes the UTF-8 bytes of the text', () => {
    expect(sha256Hex('élodie@exemple.fr')).toBe('f34116fa1fa2ab3840367c97ac2fc11e9e811bc3c424a1361abfc3d719c18e8c');
  });
});
