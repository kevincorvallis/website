/**
 * ULID (Universally Unique Lexicographically Sortable Identifier) Generator
 *
 * Replaces MySQL AUTO_INCREMENT for DynamoDB implementation.
 *
 * Features:
 * - 26 characters (vs 36 for UUID)
 * - Time-ordered (first 10 characters are timestamp)
 * - Lexicographically sortable
 * - No coordination needed between instances
 * - 128-bit compatibility
 *
 * Format: TTTTTTTTTTRRRRRRRRRRRRRRRR
 *   - T: Timestamp (48 bits, milliseconds since epoch)
 *   - R: Randomness (80 bits)
 *
 * Example: 01HQZXYZ9QABCDEFGHJKMNPQRS
 */

const ENCODING = '0123456789ABCDEFGHJKMNPQRSTUVWXYZ'; // Crockford's Base32
const ENCODING_LEN = ENCODING.length;
const TIME_MAX = Math.pow(2, 48) - 1;
const TIME_LEN = 10;
const RANDOM_LEN = 16;

/**
 * Generate a ULID
 * @param {number} seedTime - Optional timestamp in milliseconds (for testing)
 * @returns {string} 26-character ULID
 */
function ulid(seedTime) {
  const now = seedTime || Date.now();

  if (now > TIME_MAX) {
    throw new Error('Time value exceeds maximum');
  }

  return encodeTime(now, TIME_LEN) + encodeRandom(RANDOM_LEN);
}

/**
 * Encode timestamp component
 * @param {number} now - Timestamp in milliseconds
 * @param {number} len - Length of encoded string
 * @returns {string} Encoded timestamp
 */
function encodeTime(now, len) {
  let mod;
  let str = '';

  for (let i = len; i > 0; i--) {
    mod = now % ENCODING_LEN;
    str = ENCODING.charAt(mod) + str;
    now = (now - mod) / ENCODING_LEN;
  }

  return str;
}

/**
 * Encode random component
 * @param {number} len - Length of random string
 * @returns {string} Encoded random string
 */
function encodeRandom(len) {
  let str = '';

  for (let i = 0; i < len; i++) {
    str += ENCODING.charAt(Math.floor(Math.random() * ENCODING_LEN));
  }

  return str;
}

/**
 * Decode ULID to timestamp
 * @param {string} id - ULID string
 * @returns {number} Timestamp in milliseconds
 */
function decodeTime(id) {
  if (id.length !== TIME_LEN + RANDOM_LEN) {
    throw new Error('Invalid ULID length');
  }

  const timeStr = id.substring(0, TIME_LEN);
  let time = 0;

  for (let i = 0; i < timeStr.length; i++) {
    const char = timeStr.charAt(i);
    const index = ENCODING.indexOf(char);

    if (index === -1) {
      throw new Error('Invalid ULID character: ' + char);
    }

    time = time * ENCODING_LEN + index;
  }

  return time;
}

/**
 * Validate ULID format
 * @param {string} id - ULID string to validate
 * @returns {boolean} True if valid
 */
function isValid(id) {
  if (typeof id !== 'string' || id.length !== TIME_LEN + RANDOM_LEN) {
    return false;
  }

  for (let i = 0; i < id.length; i++) {
    if (ENCODING.indexOf(id.charAt(i)) === -1) {
      return false;
    }
  }

  return true;
}

/**
 * Generate monotonically increasing ULIDs within same millisecond
 * Useful for maintaining order when creating multiple items rapidly
 */
class MonotonicFactory {
  constructor() {
    this.lastTime = 0;
    this.lastRandom = '';
  }

  ulid(seedTime) {
    const now = seedTime || Date.now();

    if (now === this.lastTime) {
      // Increment random component
      this.lastRandom = incrementBase32(this.lastRandom);
      return encodeTime(now, TIME_LEN) + this.lastRandom;
    } else {
      this.lastTime = now;
      this.lastRandom = encodeRandom(RANDOM_LEN);
      return encodeTime(now, TIME_LEN) + this.lastRandom;
    }
  }
}

/**
 * Increment a Base32 string by 1
 * @param {string} str - Base32 string
 * @returns {string} Incremented string
 */
function incrementBase32(str) {
  let carry = 1;
  let result = '';

  for (let i = str.length - 1; i >= 0; i--) {
    const char = str.charAt(i);
    const index = ENCODING.indexOf(char);
    const newIndex = index + carry;

    if (newIndex >= ENCODING_LEN) {
      result = ENCODING.charAt(0) + result;
      carry = 1;
    } else {
      result = ENCODING.charAt(newIndex) + result;
      carry = 0;
    }
  }

  return result;
}

module.exports = {
  ulid,
  decodeTime,
  isValid,
  MonotonicFactory
};
