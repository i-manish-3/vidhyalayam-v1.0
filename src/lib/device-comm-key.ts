import { createHash, randomBytes, timingSafeEqual } from 'crypto'

const KEY_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const KEY_LENGTH = 16

export function generateCommKey(): string {
  const bytes = randomBytes(KEY_LENGTH)
  let key = ''
  for (let i = 0; i < KEY_LENGTH; i++) {
    key += KEY_ALPHABET[bytes[i] % KEY_ALPHABET.length]
  }
  return key
}

export function hashCommKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

export function verifyCommKey(key: string, storedHash: string | null | undefined): boolean {
  if (!storedHash || !key) return false
  const candidate = Buffer.from(hashCommKey(key))
  const expected = Buffer.from(storedHash)
  if (candidate.length !== expected.length) return false
  return timingSafeEqual(candidate, expected)
}