/**
 * ElastiCache (Redis) Wrapper Module
 *
 * Provides caching layer for frequently accessed data to reduce DynamoDB reads
 *
 * Cache Strategy:
 * - User profiles: TTL 1 hour (3600s)
 * - Friend lists: TTL 30 minutes (1800s)
 * - Entry counts: TTL 5 minutes (300s)
 * - Discover users: TTL 30 minutes (1800s)
 *
 * Target: 80% cache hit rate for hot data
 */

const redis = require('redis');

// Redis client instance (lazily initialized)
let redisClient = null;
let isConnected = false;

// Cache configuration
const CACHE_CONFIG = {
  enabled: process.env.ELASTICACHE_ENABLED === 'true',
  host: process.env.ELASTICACHE_ENDPOINT || 'localhost',
  port: parseInt(process.env.ELASTICACHE_PORT || '6379', 10),
  connectTimeout: 5000, // 5 seconds
  commandTimeout: 2000  // 2 seconds
};

// TTL values in seconds
const TTL = {
  USER_PROFILE: 3600,      // 1 hour
  FRIEND_LIST: 1800,       // 30 minutes
  ENTRY_COUNTS: 300,       // 5 minutes
  DISCOVER_USERS: 1800,    // 30 minutes
  REACTION_COUNTS: 300,    // 5 minutes
  COMMENT_COUNTS: 300,     // 5 minutes
  STREAK_DATA: 600         // 10 minutes
};

/**
 * Initialize Redis connection
 * Called lazily on first cache operation
 */
async function init() {
  if (!CACHE_CONFIG.enabled) {
    console.log('[Cache] ElastiCache disabled, using no-op cache');
    return;
  }

  if (redisClient && isConnected) {
    return; // Already connected
  }

  try {
    redisClient = redis.createClient({
      socket: {
        host: CACHE_CONFIG.host,
        port: CACHE_CONFIG.port,
        connectTimeout: CACHE_CONFIG.connectTimeout
      },
      commandsQueueMaxLength: 100
    });

    redisClient.on('error', (err) => {
      console.error('[Cache] Redis error:', err);
      isConnected = false;
    });

    redisClient.on('connect', () => {
      console.log('[Cache] Redis connected');
      isConnected = true;
    });

    await redisClient.connect();
  } catch (error) {
    console.error('[Cache] Failed to connect to Redis:', error);
    redisClient = null;
    isConnected = false;
  }
}

/**
 * Get value from cache
 * @param {string} key - Cache key
 * @returns {Promise<any|null>} Parsed value or null if not found/error
 */
async function get(key) {
  if (!CACHE_CONFIG.enabled || !redisClient || !isConnected) {
    return null;
  }

  try {
    const value = await redisClient.get(key);

    if (!value) {
      console.log(`[Cache] MISS: ${key}`);
      return null;
    }

    console.log(`[Cache] HIT: ${key}`);
    return JSON.parse(value);
  } catch (error) {
    console.error(`[Cache] GET error for key ${key}:`, error);
    return null;
  }
}

/**
 * Set value in cache with TTL
 * @param {string} key - Cache key
 * @param {any} value - Value to cache (will be JSON stringified)
 * @param {number} ttl - Time to live in seconds
 * @returns {Promise<boolean>} True if successful
 */
async function set(key, value, ttl) {
  if (!CACHE_CONFIG.enabled || !redisClient || !isConnected) {
    return false;
  }

  try {
    const serialized = JSON.stringify(value);
    await redisClient.setEx(key, ttl, serialized);
    console.log(`[Cache] SET: ${key} (TTL: ${ttl}s)`);
    return true;
  } catch (error) {
    console.error(`[Cache] SET error for key ${key}:`, error);
    return false;
  }
}

/**
 * Delete value from cache
 * @param {string} key - Cache key or pattern
 * @returns {Promise<boolean>} True if successful
 */
async function del(key) {
  if (!CACHE_CONFIG.enabled || !redisClient || !isConnected) {
    return false;
  }

  try {
    await redisClient.del(key);
    console.log(`[Cache] DEL: ${key}`);
    return true;
  } catch (error) {
    console.error(`[Cache] DEL error for key ${key}:`, error);
    return false;
  }
}

/**
 * Delete all keys matching a pattern
 * @param {string} pattern - Key pattern (e.g., "user:*")
 * @returns {Promise<number>} Number of keys deleted
 */
async function delPattern(pattern) {
  if (!CACHE_CONFIG.enabled || !redisClient || !isConnected) {
    return 0;
  }

  try {
    const keys = await redisClient.keys(pattern);

    if (keys.length === 0) {
      return 0;
    }

    await redisClient.del(keys);
    console.log(`[Cache] DEL PATTERN: ${pattern} (${keys.length} keys)`);
    return keys.length;
  } catch (error) {
    console.error(`[Cache] DEL PATTERN error for ${pattern}:`, error);
    return 0;
  }
}

/**
 * Invalidate all caches related to a user
 * Called when user data is updated
 * @param {string} uid - User UID
 */
async function invalidateUser(uid) {
  await Promise.all([
    del(`user:${uid}`),
    delPattern(`friends:${uid}:*`),
    delPattern(`connections:${uid}:*`),
    del(`streak:${uid}`)
  ]);
}

/**
 * Invalidate all caches related to an entry
 * Called when entry data is updated
 * @param {string} entryId - Entry ID
 */
async function invalidateEntry(entryId) {
  await Promise.all([
    del(`entry:${entryId}`),
    del(`reactions:${entryId}`),
    del(`comments:${entryId}`),
    del(`reaction-count:${entryId}`),
    del(`comment-count:${entryId}`)
  ]);
}

/**
 * Cache helper: Get or compute and cache
 * @param {string} key - Cache key
 * @param {Function} compute - Async function to compute value if not cached
 * @param {number} ttl - TTL in seconds
 * @returns {Promise<any>} Cached or computed value
 */
async function getOrCompute(key, compute, ttl) {
  // Try to get from cache
  const cached = await get(key);

  if (cached !== null) {
    return cached;
  }

  // Not in cache, compute value
  const value = await compute();

  // Store in cache (fire and forget)
  set(key, value, ttl).catch(err => {
    console.error('[Cache] Background SET failed:', err);
  });

  return value;
}

/**
 * Close Redis connection
 * Called during Lambda shutdown
 */
async function close() {
  if (redisClient && isConnected) {
    try {
      await redisClient.quit();
      console.log('[Cache] Redis connection closed');
    } catch (error) {
      console.error('[Cache] Error closing Redis:', error);
    }
  }
}

/**
 * Get cache statistics
 * @returns {Promise<object>} Cache stats
 */
async function getStats() {
  if (!CACHE_CONFIG.enabled || !redisClient || !isConnected) {
    return { enabled: false };
  }

  try {
    const info = await redisClient.info('stats');
    const lines = info.split('\r\n');
    const stats = {};

    for (const line of lines) {
      const [key, value] = line.split(':');
      if (key && value) {
        stats[key] = value;
      }
    }

    return {
      enabled: true,
      connected: isConnected,
      hits: parseInt(stats.keyspace_hits || '0', 10),
      misses: parseInt(stats.keyspace_misses || '0', 10),
      hitRate: calculateHitRate(stats.keyspace_hits, stats.keyspace_misses)
    };
  } catch (error) {
    console.error('[Cache] Error getting stats:', error);
    return { enabled: true, connected: false, error: error.message };
  }
}

/**
 * Calculate cache hit rate
 */
function calculateHitRate(hits, misses) {
  const h = parseInt(hits || '0', 10);
  const m = parseInt(misses || '0', 10);
  const total = h + m;

  if (total === 0) {
    return 0;
  }

  return ((h / total) * 100).toFixed(2);
}

module.exports = {
  init,
  get,
  set,
  del,
  delPattern,
  invalidateUser,
  invalidateEntry,
  getOrCompute,
  close,
  getStats,
  TTL
};
