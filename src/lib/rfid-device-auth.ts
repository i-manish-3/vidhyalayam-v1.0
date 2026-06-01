/**
 * Shared helpers for RFID device API-key generation and verification.
 *
 * Device keys are server-generated, high-entropy random tokens. We store
 * their SHA-256 hash, not the plaintext — same pattern used for password
 * reset tokens (src/lib/password-reset.ts). Because the input has 32 bytes
 * of entropy, SHA-256 is sufficient: bcrypt's cost is wasted on
 * non-user-chosen secrets, and SHA-256 gives O(1) hashed-key lookup
 * (`where: { apiKeyHash: sha256(plaintext) }`).
 */

import { createHash, randomBytes } from 'crypto'

/** Plaintext key length is 32 bytes → 43-char base64url string. */
export function generateDeviceKey(): string {
  return randomBytes(32).toString('base64url')
}

export function hashDeviceKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex')
}
