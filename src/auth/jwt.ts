import {
  createPrivateKey,
  createPublicKey,
  randomBytes,
  sign,
  verify,
  type KeyObject,
} from 'node:crypto';

import type { AccessTokenProvider } from './ports.js';

export function createAccessTokenProvider(input: {
  audience: string;
  issuer: string;
  privateKeyPem: string;
  publicKeyPem: string;
  ttlSeconds: number;
}): AccessTokenProvider {
  let privateKey: KeyObject;
  let publicKey: KeyObject;

  try {
    privateKey = createPrivateKey(input.privateKeyPem);
    publicKey = createPublicKey(input.publicKeyPem);
  } catch (error) {
    throw new Error('Access-token signing keys are invalid.', { cause: error });
  }
  if (privateKey.asymmetricKeyType !== 'ed25519' || publicKey.asymmetricKeyType !== 'ed25519')
    throw new Error('Access-token signing keys must be Ed25519 keys.');

  return {
    issue({ userId, sessionId, now }) {
      const expiresAt = new Date(now.getTime() + input.ttlSeconds * 1_000);
      const header = encodeJson({ alg: 'EdDSA', typ: 'JWT' });
      const payload = encodeJson({
        aud: input.audience,
        exp: Math.floor(expiresAt.getTime() / 1_000),
        iat: Math.floor(now.getTime() / 1_000),
        iss: input.issuer,
        jti: randomBytes(16).toString('base64url'),
        sid: sessionId,
        sub: userId,
      });
      const signingInput = `${header}.${payload}`;
      const signature = sign(null, Buffer.from(signingInput), privateKey).toString('base64url');
      return Promise.resolve({ token: `${signingInput}.${signature}`, expiresAt });
    },

    verify(token) {
      if (token.length > 4_096) return Promise.reject(new Error('Access token is too large.'));
      const parts = token.split('.');
      if (parts.length !== 3) return Promise.reject(new Error('Access token is malformed.'));
      const [encodedHeader, encodedPayload, encodedSignature] = parts;
      if (!encodedHeader || !encodedPayload || !encodedSignature)
        return Promise.reject(new Error('Access token is malformed.'));

      try {
        const validSignature = verify(
          null,
          Buffer.from(`${encodedHeader}.${encodedPayload}`),
          publicKey,
          Buffer.from(encodedSignature, 'base64url'),
        );
        if (!validSignature) throw new Error('Access token signature is invalid.');
        const header = decodeJson(encodedHeader);
        const payload = decodeJson(encodedPayload);
        if (header.alg !== 'EdDSA' || header.typ !== 'JWT')
          throw new Error('Unexpected token header.');
        if (
          payload.iss !== input.issuer ||
          payload.aud !== input.audience ||
          typeof payload.exp !== 'number' ||
          payload.exp <= Math.floor(Date.now() / 1_000) ||
          typeof payload.sub !== 'string' ||
          typeof payload.sid !== 'string' ||
          typeof payload.jti !== 'string'
        ) {
          throw new Error('Access token claims are invalid.');
        }
        return Promise.resolve({ userId: payload.sub, sessionId: payload.sid });
      } catch (error) {
        return Promise.reject(new Error('Access token verification failed.', { cause: error }));
      }
    },
  };
}

function encodeJson(value: Readonly<Record<string, unknown>>): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decodeJson(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    throw new Error('Token segment must be an object.');
  return parsed as Record<string, unknown>;
}
