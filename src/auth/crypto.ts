import { createHash, randomBytes, randomInt } from 'node:crypto';

import argon2 from 'argon2';

import type { PasswordHasher } from './ports.js';

export const passwordHasher: PasswordHasher = {
  hash(password) {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
      hashLength: 32,
    });
  },
  verify(hash, password) {
    return argon2.verify(hash, password);
  },
};

export function createOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('base64url');
}

export function hashSensitiveValue(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('base64url');
}

export function createNumericOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}
