import { generateKeyPairSync } from 'node:crypto';

import { createAccessTokenProvider } from '../src/auth/jwt.js';

describe('access token provider', () => {
  const pair = generateKeyPairSync('ed25519');
  const provider = createAccessTokenProvider({
    audience: 'chat-mobile',
    issuer: 'chat-api',
    privateKeyPem: pair.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
    publicKeyPem: pair.publicKey.export({ format: 'pem', type: 'spki' }).toString(),
    ttlSeconds: 600,
  });

  it('issues and verifies minimal EdDSA claims', async () => {
    const issued = await provider.issue({
      userId: 'user-1',
      sessionId: 'session-1',
      now: new Date(),
    });

    await expect(provider.verify(issued.token)).resolves.toEqual({
      userId: 'user-1',
      sessionId: 'session-1',
    });
    expect(issued.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('rejects a token signed by another key', async () => {
    const other = generateKeyPairSync('ed25519');
    const attacker = createAccessTokenProvider({
      audience: 'chat-mobile',
      issuer: 'chat-api',
      privateKeyPem: other.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
      publicKeyPem: other.publicKey.export({ format: 'pem', type: 'spki' }).toString(),
      ttlSeconds: 600,
    });
    const forged = await attacker.issue({
      userId: 'user-1',
      sessionId: 'session-1',
      now: new Date(),
    });

    await expect(provider.verify(forged.token)).rejects.toThrow();
  });
});
