import { createOpaqueToken, hashOpaqueToken, passwordHasher } from '../src/auth/crypto.js';

describe('authentication cryptography', () => {
  it('hashes passwords with Argon2id and verifies without storing plaintext', async () => {
    const hash = await passwordHasher.hash('a secure passphrase');

    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).not.toContain('a secure passphrase');
    await expect(passwordHasher.verify(hash, 'a secure passphrase')).resolves.toBe(true);
    await expect(passwordHasher.verify(hash, 'wrong passphrase')).resolves.toBe(false);
  });

  it('generates high-entropy opaque tokens and deterministic non-plaintext hashes', () => {
    const first = createOpaqueToken();
    const second = createOpaqueToken();

    expect(first).toHaveLength(43);
    expect(first).not.toBe(second);
    expect(hashOpaqueToken(first)).not.toBe(first);
    expect(hashOpaqueToken(first)).toBe(hashOpaqueToken(first));
  });
});
