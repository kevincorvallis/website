const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const crypto = require('crypto');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const { CognitoIdentityProviderClient, AdminDeleteUserCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');

// DynamoDB imports
const db = require('./db/dynamodb');
const cache = require('./db/cache');

// Initialize SNS client for SMS
const snsClient = new SNSClient({ region: 'us-west-1' });

// Initialize Cognito client for account deletion
const cognitoClient = new CognitoIdentityProviderClient({ region: 'us-west-1' });

// Initialize S3 client for image uploads
const s3Client = new S3Client({ region: 'us-west-1' });
const S3_BUCKET = process.env.S3_BUCKET || 'daybyday-journal-images';

// Initialize SES client for email notifications
const sesClient = new SESClient({ region: 'us-west-1' });
const SES_SENDER_EMAIL = process.env.SES_SENDER_EMAIL || 'kevinleems@outlook.com';

// ============================================
// CONFIGURATION
// ============================================
// Initialize cache on Lambda cold start
cache.init().catch(err => console.error('Cache initialization failed:', err));

// API Paths
const PATHS = {
  health: '/journalLambdafunc/health',
  prompts: '/journalLambdafunc/prompts',
  prompt: '/journalLambdafunc/prompt',
  entries: '/journalLambdafunc/entries',
  entry: '/journalLambdafunc/entry',
  sync: '/journalLambdafunc/sync',
  user: '/journalLambdafunc/user',
  // User & Connections
  usersSearch: '/journalLambdafunc/users/search',
  usersDiscover: '/journalLambdafunc/users/discover',
  usersProfile: '/journalLambdafunc/users/profile',
  connections: '/journalLambdafunc/connections',
  connectionsPending: '/journalLambdafunc/connections/pending',
  connectionsRequest: '/journalLambdafunc/connections/request',
  // Invite links
  inviteCreate: '/journalLambdafunc/invite/create',
  inviteInfo: '/journalLambdafunc/invite',
  inviteRedeem: '/journalLambdafunc/invite/redeem',
  // Shared entries
  sharedEntry: '/journalLambdafunc/shared',
  // Phone verification
  usersPhone: '/journalLambdafunc/users/phone',
  usersPhoneVerify: '/journalLambdafunc/users/phone/verify',
  // Share with connections
  entriesSharedWithMe: '/journalLambdafunc/entries/shared-with-me',
  // Streaks & Leaderboard
  streaksMe: '/journalLambdafunc/streaks/me',
  streaksFriends: '/journalLambdafunc/streaks/friends',
  // Activity Feed
  feed: '/journalLambdafunc/feed',
  // Accountability Partners
  accountability: '/journalLambdafunc/accountability',
  accountabilityRequest: '/journalLambdafunc/accountability/request',
  // Account management
  account: '/journalLambdafunc/account',
  // Image upload
  uploadUrl: '/journalLambdafunc/upload-url',
  // Trips
  trips: '/journalLambdafunc/trips',
  trip: '/journalLambdafunc/trip',
  tripsSharedWithMe: '/journalLambdafunc/trips/shared-with-me'
};

// Cognito Configuration
const COGNITO_REGION = process.env.COGNITO_REGION || 'us-west-1';
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || 'us-west-1_81HBZnH92';
const COGNITO_ISSUER = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_USER_POOL_ID}`;

// Initialize JWKS client for Cognito token verification
const client = jwksClient({
  jwksUri: `${COGNITO_ISSUER}/.well-known/jwks.json`,
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 600000 // 10 minutes
});

// Get signing key from Cognito JWKS
function getKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) {
      callback(err);
      return;
    }
    const signingKey = key.getPublicKey();
    callback(null, signingKey);
  });
}

// Verify Cognito JWT token
function verifyCognitoToken(token) {
  return new Promise((resolve, reject) => {
    jwt.verify(token, getKey, {
      issuer: COGNITO_ISSUER,
      algorithms: ['RS256']
    }, (err, decoded) => {
      if (err) {
        reject(err);
      } else {
        resolve(decoded);
      }
    });
  });
}

// ============================================
// DATABASE CONNECTION (DynamoDB)
// ============================================
// No connection pooling needed for DynamoDB - SDK handles this
// Data access layer is in ./db/dynamodb.js

// ============================================
// VALIDATION
// ============================================
const MAX_TITLE_LENGTH = 255;
const MAX_TEXT_LENGTH = 50000;

function validateEntryInput(title, text) {
  if (!title || typeof title !== 'string') {
    return { valid: false, error: 'Title is required' };
  }
  if (title.length > MAX_TITLE_LENGTH) {
    return { valid: false, error: `Title must be under ${MAX_TITLE_LENGTH} characters` };
  }
  if (!text || typeof text !== 'string') {
    return { valid: false, error: 'Entry text is required' };
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return { valid: false, error: `Entry text must be under ${MAX_TEXT_LENGTH} characters` };
  }
  return { valid: true };
}

function isValidDate(dateString) {
  if (!dateString) return true; // Optional, will use current date
  const date = new Date(dateString);
  return !isNaN(date.getTime());
}

// ============================================
// AUTHENTICATION
// ============================================
async function getAuthenticatedUid(event) {
  // API Gateway Cognito Authorizer provides claims in requestContext
  const claims = event.requestContext?.authorizer?.claims;
  if (claims?.sub) {
    return claims.sub;
  }

  // Fallback: decode token directly (API Gateway already verified it)
  const authHeader = event.headers?.Authorization || event.headers?.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  try {
    const token = authHeader.split('Bearer ')[1];
    // Just decode without verification - API Gateway already verified
    const decoded = jwt.decode(token);
    return decoded?.sub;
  } catch (e) {
    console.error('Token decode failed:', e.message);
    return null;
  }
}

// Get Cognito username from JWT (different from sub for federated users like Google)
function getCognitoUsername(event) {
  const claims = event.requestContext?.authorizer?.claims;
  if (claims?.['cognito:username']) {
    return claims['cognito:username'];
  }

  const authHeader = event.headers?.Authorization || event.headers?.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  try {
    const token = authHeader.split('Bearer ')[1];
    const decoded = jwt.decode(token);
    return decoded?.['cognito:username'] || decoded?.sub;
  } catch (e) {
    return null;
  }
}

// ============================================
// RESPONSE HELPERS
// ============================================
function buildResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
    },
    body: JSON.stringify(body)
  };
}

function errorResponse(statusCode, message) {
  return buildResponse(statusCode, { error: message });
}

// ============================================
// IMAGE UPLOAD HANDLERS
// ============================================

// Generate a presigned URL for uploading an image to S3
async function getUploadUrl(event) {
  const uid = await getAuthenticatedUid(event);
  if (!uid) {
    return errorResponse(401, 'Authentication required');
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return errorResponse(400, 'Invalid JSON body');
  }

  const { filename, contentType } = body;

  // Validate content type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'];
  if (!contentType || !allowedTypes.includes(contentType.toLowerCase())) {
    return errorResponse(400, 'Invalid content type. Allowed: JPEG, PNG, GIF, WebP, HEIC');
  }

  // Generate unique filename
  const timestamp = Date.now();
  const ext = filename ? filename.split('.').pop() : 'jpg';
  const key = `entries/${uid}/${timestamp}-${crypto.randomBytes(8).toString('hex')}.${ext}`;

  try {
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      ContentType: contentType,
      // Metadata for tracking
      Metadata: {
        'user-id': uid,
        'upload-timestamp': timestamp.toString()
      }
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 }); // 5 minutes

    // Construct the final URL (after upload)
    const imageUrl = `https://${S3_BUCKET}.s3.us-west-1.amazonaws.com/${key}`;

    return buildResponse(200, {
      uploadUrl,
      imageUrl,
      key,
      expiresIn: 300
    });
  } catch (error) {
    console.error('Error generating upload URL:', error);
    return errorResponse(500, 'Failed to generate upload URL');
  }
}

// ============================================
// ENTRY HANDLERS
// ============================================

// GET /entries - List all entries for a user
async function getEntries(event, conn) {
  const uid = await getAuthenticatedUid(event);
  if (!uid) {
    return errorResponse(401, 'Authentication required');
  }

  // Ensure user exists (important for OAuth users)
  const authHeader = event.headers?.Authorization || event.headers?.authorization;
  if (authHeader) {
    try {
      const token = authHeader.split('Bearer ')[1];
      const decoded = jwt.decode(token);
      const email = decoded?.email;
      const displayName = decoded?.name || decoded?.given_name || (email ? email.split('@')[0] : null);

      // Check if user exists, create if not
      let user = await db.getUserByUid(uid);
      if (!user) {
        await db.createUser({
          uid,
          username: displayName,
          email: email,
          firstName: decoded?.given_name || null,
          lastName: decoded?.family_name || null
        });
      }
    } catch (e) {
      // Silently continue - user creation is best effort
      console.log('Could not ensure user exists:', e.message);
    }
  }

  const since = event.queryStringParameters?.since;

  try {
    // Get entries from DynamoDB
    const entries = await db.getEntries(uid, null, null, 1000);

    // Filter by updatedAt if since parameter provided
    let filteredEntries = entries;
    if (since) {
      const sinceTime = parseInt(since);
      filteredEntries = entries.filter(entry => {
        const updatedAt = new Date(entry.updatedAt).getTime();
        return updatedAt > sinceTime;
      });
    }

    // Format entries to match old MySQL structure
    const formattedEntries = filteredEntries.map(entry => ({
      entry_id: entry.entryId,
      firebase_uid: entry.ownerUid,
      date: entry.date,
      title: entry.title,
      text: entry.text,
      prompt_id: entry.promptId,
      client_id: entry.clientId,
      image_url: entry.imageUrl,
      latitude: entry.latitude,
      longitude: entry.longitude,
      location_name: entry.locationName,
      created_at: entry.createdAt,
      updated_at: entry.updatedAt,
      is_deleted: entry.isDeleted ? 1 : 0
    }));

    return buildResponse(200, {
      entries: formattedEntries,
      count: formattedEntries.length,
      syncTime: Date.now()
    });
  } catch (error) {
    console.error('Error getting entries:', error);
    return errorResponse(500, 'Failed to get entries');
  }
}

// Helper function to update user streak
async function updateUserStreak(conn, uid, entryDate) {
  try {
    const today = new Date(entryDate);
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    // Get current streak data
    const [streakRows] = await conn.execute(
      'SELECT * FROM user_streaks WHERE firebase_uid = ?',
      [uid]
    );

    if (streakRows.length === 0) {
      // First entry ever - create streak record
      await conn.execute(
        `INSERT INTO user_streaks (firebase_uid, current_streak, longest_streak, last_entry_date, streak_start_date)
         VALUES (?, 1, 1, ?, ?)`,
        [uid, todayStr, todayStr]
      );
      return { current_streak: 1, longest_streak: 1, is_new_streak: true };
    }

    const streak = streakRows[0];
    const lastEntryDate = streak.last_entry_date ? new Date(streak.last_entry_date) : null;

    if (lastEntryDate) {
      lastEntryDate.setHours(0, 0, 0, 0);
      const dayDiff = Math.floor((today - lastEntryDate) / (1000 * 60 * 60 * 24));

      if (dayDiff === 0) {
        // Same day - no streak change
        return { current_streak: streak.current_streak, longest_streak: streak.longest_streak, is_new_streak: false };
      } else if (dayDiff === 1) {
        // Consecutive day - increment streak
        const newStreak = streak.current_streak + 1;
        const newLongest = Math.max(newStreak, streak.longest_streak);
        await conn.execute(
          `UPDATE user_streaks SET current_streak = ?, longest_streak = ?, last_entry_date = ? WHERE firebase_uid = ?`,
          [newStreak, newLongest, todayStr, uid]
        );
        return { current_streak: newStreak, longest_streak: newLongest, is_new_streak: false };
      } else {
        // Streak broken - reset to 1
        await conn.execute(
          `UPDATE user_streaks SET current_streak = 1, last_entry_date = ?, streak_start_date = ? WHERE firebase_uid = ?`,
          [todayStr, todayStr, uid]
        );
        return { current_streak: 1, longest_streak: streak.longest_streak, is_new_streak: true };
      }
    } else {
      // No previous entry date - start new streak
      await conn.execute(
        `UPDATE user_streaks SET current_streak = 1, last_entry_date = ?, streak_start_date = ? WHERE firebase_uid = ?`,
        [todayStr, todayStr, uid]
      );
      return { current_streak: 1, longest_streak: streak.longest_streak || 1, is_new_streak: true };
    }
  } catch (error) {
    console.error('Error updating streak:', error);
    return null; // Don't fail entry creation if streak update fails
  }
}

// POST /entry - Create a new entry
async function createEntry(event, conn) {
  const uid = await getAuthenticatedUid(event);
  if (!uid) {
    return errorResponse(401, 'Authentication required');
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return errorResponse(400, 'Invalid JSON body');
  }

  const { title, text, date, prompt_id, client_id, image_url, latitude, longitude, location_name } = body;

  // Validate input
  const validation = validateEntryInput(title, text);
  if (!validation.valid) {
    return errorResponse(400, validation.error);
  }

  // Validate date format
  if (!isValidDate(date)) {
    return errorResponse(400, 'Invalid date format');
  }

  // Validate location coordinates if provided
  if (latitude !== undefined && (isNaN(parseFloat(latitude)) || latitude < -90 || latitude > 90)) {
    return errorResponse(400, 'Invalid latitude');
  }
  if (longitude !== undefined && (isNaN(parseFloat(longitude)) || longitude < -180 || longitude > 180)) {
    return errorResponse(400, 'Invalid longitude');
  }

  try {
    const entryDate = date ? new Date(date) : new Date();

    // Create entry in DynamoDB
    const entry = await db.createEntry({
      ownerUid: uid,
      date: entryDate.toISOString(),
      title,
      text,
      promptId: prompt_id || null,
      clientId: client_id || null,
      imageUrl: image_url || null,
      latitude: latitude || null,
      longitude: longitude || null,
      locationName: location_name || null
    });

    // Update user streak
    const streakData = await db.updateStreakOnEntry(uid, entryDate);

    // Format entry response to match old MySQL structure
    const formattedEntry = {
      entry_id: entry.entryId,
      firebase_uid: entry.ownerUid,
      date: entry.date,
      title: entry.title,
      text: entry.text,
      prompt_id: entry.promptId,
      client_id: entry.clientId,
      image_url: entry.imageUrl,
      latitude: entry.latitude,
      longitude: entry.longitude,
      location_name: entry.locationName,
      created_at: entry.createdAt,
      updated_at: entry.updatedAt,
      is_deleted: entry.isDeleted ? 1 : 0
    };

    return buildResponse(201, {
      message: 'Entry created',
      entry: formattedEntry,
      streak: {
        current_streak: streakData.currentStreak,
        longest_streak: streakData.longestStreak,
        is_new_streak: streakData.isNewStreak
      }
    });
  } catch (error) {
    console.error('Error creating entry:', error);
    return errorResponse(500, 'Failed to create entry');
  }
}

// PUT /entry/{id} - Update an entry
async function updateEntry(event, conn) {
  const uid = await getAuthenticatedUid(event);
  if (!uid) {
    return errorResponse(401, 'Authentication required');
  }

  const entryId = event.pathParameters?.id;
  if (!entryId || isNaN(parseInt(entryId))) {
    return errorResponse(400, 'Invalid entry ID');
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return errorResponse(400, 'Invalid JSON body');
  }

  const { title, text, image_url, latitude, longitude, location_name } = body;

  // Validate input if provided
  if (title !== undefined && (typeof title !== 'string' || title.length > MAX_TITLE_LENGTH)) {
    return errorResponse(400, `Title must be a string under ${MAX_TITLE_LENGTH} characters`);
  }
  if (text !== undefined && (typeof text !== 'string' || text.length > MAX_TEXT_LENGTH)) {
    return errorResponse(400, `Text must be a string under ${MAX_TEXT_LENGTH} characters`);
  }
  // Validate location coordinates if provided
  if (latitude !== undefined && latitude !== null && (isNaN(parseFloat(latitude)) || latitude < -90 || latitude > 90)) {
    return errorResponse(400, 'Invalid latitude');
  }
  if (longitude !== undefined && longitude !== null && (isNaN(parseFloat(longitude)) || longitude < -180 || longitude > 180)) {
    return errorResponse(400, 'Invalid longitude');
  }

  try {
    // Build updates object
    const updates = {};

    if (title !== undefined) {
      updates.title = title;
    }
    if (text !== undefined) {
      updates.text = text;
    }
    if (image_url !== undefined) {
      updates.imageUrl = image_url;
    }
    if (latitude !== undefined) {
      updates.latitude = latitude;
    }
    if (longitude !== undefined) {
      updates.longitude = longitude;
    }
    if (location_name !== undefined) {
      updates.locationName = location_name;
    }

    if (Object.keys(updates).length === 0) {
      return errorResponse(400, 'No fields to update');
    }

    // Update entry in DynamoDB (will verify ownership)
    const entry = await db.updateEntry(entryId, uid, updates);

    if (!entry) {
      return errorResponse(404, 'Entry not found or not authorized');
    }

    // Format entry response to match old MySQL structure
    const formattedEntry = {
      entry_id: entry.entryId,
      firebase_uid: entry.ownerUid,
      date: entry.date,
      title: entry.title,
      text: entry.text,
      prompt_id: entry.promptId,
      client_id: entry.clientId,
      image_url: entry.imageUrl,
      latitude: entry.latitude,
      longitude: entry.longitude,
      location_name: entry.locationName,
      created_at: entry.createdAt,
      updated_at: entry.updatedAt,
      is_deleted: entry.isDeleted ? 1 : 0
    };

    return buildResponse(200, {
      message: 'Entry updated',
      entry: formattedEntry
    });
  } catch (error) {
    console.error('Error updating entry:', error);
    return errorResponse(500, 'Failed to update entry');
  }
}

// DELETE /entry/{id} - Soft delete an entry
async function deleteEntry(event, conn) {
  const uid = await getAuthenticatedUid(event);
  if (!uid) {
    return errorResponse(401, 'Authentication required');
  }

  const entryId = event.pathParameters?.id;
  if (!entryId || isNaN(parseInt(entryId))) {
    return errorResponse(400, 'Invalid entry ID');
  }

  try {
    // Soft delete entry in DynamoDB (will verify ownership)
    const success = await db.deleteEntry(entryId, uid);

    if (!success) {
      return errorResponse(404, 'Entry not found or not authorized');
    }

    return buildResponse(200, {
      message: 'Entry deleted',
      entry_id: entryId
    });
  } catch (error) {
    console.error('Error deleting entry:', error);
    return errorResponse(500, 'Failed to delete entry');
  }
}

// POST /sync - Bulk sync for offline support
async function syncEntries(event, conn) {
  const uid = await getAuthenticatedUid(event);
  if (!uid) {
    return errorResponse(401, 'Authentication required');
  }

  // Ensure user exists (important for OAuth users)
  const authHeader = event.headers?.Authorization || event.headers?.authorization;
  if (authHeader) {
    try {
      const token = authHeader.split('Bearer ')[1];
      const decoded = jwt.decode(token);
      const email = decoded?.email;
      const displayName = decoded?.name || decoded?.given_name || (email ? email.split('@')[0] : null);

      // Check if user exists, create if not
      let user = await db.getUserByUid(uid);
      if (!user) {
        await db.createUser({
          uid,
          username: displayName,
          email: email,
          firstName: decoded?.given_name || null,
          lastName: decoded?.family_name || null
        });
      }
    } catch (e) {
      console.log('Could not ensure user exists:', e.message);
    }
  }

  // Capture sync start time FIRST to avoid missing concurrent updates
  const syncStartTime = Date.now();

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return errorResponse(400, 'Invalid JSON body');
  }

  const { entries = [], lastSyncTime = 0 } = body;

  try {
    const results = {
      created: [],
      updated: [],
      conflicts: []
    };

    // Get all user's entries to check for client_id duplicates
    const existingEntries = await db.getEntries(uid, null, null, 10000);
    const clientIdMap = new Map();
    existingEntries.forEach(e => {
      if (e.clientId) {
        clientIdMap.set(e.clientId, e.entryId);
      }
    });

    // Process incoming entries
    for (const entry of entries) {
      if (entry.action === 'create') {
        // Check if client_id already exists (avoid duplicates)
        if (entry.client_id && clientIdMap.has(entry.client_id)) {
          results.updated.push({
            client_id: entry.client_id,
            entry_id: clientIdMap.get(entry.client_id)
          });
          continue;
        }

        // Create new entry
        const newEntry = await db.createEntry({
          ownerUid: uid,
          date: new Date(entry.date).toISOString(),
          title: entry.title,
          text: entry.text,
          promptId: entry.prompt_id || null,
          clientId: entry.client_id || null
        });

        results.created.push({
          client_id: entry.client_id,
          entry_id: newEntry.entryId
        });

      } else if (entry.action === 'update' && entry.entry_id) {
        await db.updateEntry(entry.entry_id, uid, {
          title: entry.title,
          text: entry.text
        });
        results.updated.push({ entry_id: entry.entry_id });

      } else if (entry.action === 'delete' && entry.entry_id) {
        await db.deleteEntry(entry.entry_id, uid);
      }
    }

    // Get all entries updated since lastSyncTime
    const allEntries = await db.getEntries(uid, null, null, 10000);

    let serverEntries = allEntries;
    if (lastSyncTime > 0) {
      serverEntries = allEntries.filter(entry => {
        const updatedAt = new Date(entry.updatedAt).getTime();
        return updatedAt > lastSyncTime;
      });
    }

    // Format entries to match old MySQL structure
    const formattedEntries = serverEntries
      .filter(e => !e.isDeleted)
      .map(entry => ({
        entry_id: entry.entryId,
        firebase_uid: entry.ownerUid,
        date: entry.date,
        title: entry.title,
        text: entry.text,
        prompt_id: entry.promptId,
        client_id: entry.clientId,
        created_at: entry.createdAt,
        updated_at: entry.updatedAt,
        is_deleted: 0
      }));

    const deletedIds = serverEntries
      .filter(e => e.isDeleted)
      .map(e => e.entryId);

    return buildResponse(200, {
      message: 'Sync complete',
      results,
      entries: formattedEntries,
      deletedIds,
      syncTime: syncStartTime  // Use start time to avoid missing concurrent updates
    });
  } catch (error) {
    console.error('Error syncing:', error);
    return errorResponse(500, 'Sync failed');
  }
}

// ============================================
// PROMPT HANDLERS
// ============================================

// GET /prompts - Get a random prompt
async function getPrompt() {
  try {
    const prompt = await db.getRandomPrompt();

    if (!prompt) {
      return buildResponse(200, { prompt: 'What is on your mind today?' });
    }

    return buildResponse(200, {
      prompt_id: prompt.promptId,
      prompt: prompt.promptText
    });
  } catch (error) {
    console.error('Error getting prompt:', error);
    return errorResponse(500, 'Failed to get prompt');
  }
}

// POST /prompt - Add a new prompt
async function addPrompt(event) {
  const uid = await getAuthenticatedUid(event);
  if (!uid) {
    return errorResponse(401, 'Authentication required');
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return errorResponse(400, 'Invalid JSON body');
  }

  const { prompt } = body;

  if (!prompt) {
    return errorResponse(400, 'Missing prompt text');
  }

  try {
    const newPrompt = await db.createPrompt(prompt, uid);

    return buildResponse(201, {
      message: 'Prompt added',
      prompt_id: newPrompt.promptId
    });
  } catch (error) {
    console.error('Error adding prompt:', error);
    return errorResponse(500, 'Failed to add prompt');
  }
}

// ============================================
// USER HANDLERS
// ============================================

// Ensure user exists in users table (upsert)
async function ensureUser(conn, uid, email, displayName) {
  try {
    await conn.execute(
      `INSERT INTO users (firebase_uid, email, username)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         email = COALESCE(VALUES(email), email),
         username = COALESCE(VALUES(username), username)`,
      [uid, email || null, displayName || null]
    );
  } catch (error) {
    console.error('Error ensuring user:', error);
  }
}

// GET /users/search - Search users by display name
async function searchUsers(event, conn) {
  const uid = await getAuthenticatedUid(event);
  if (!uid) {
    return errorResponse(401, 'Authentication required');
  }

  const query = event.queryStringParameters?.q;
  if (!query || query.length < 2) {
    return errorResponse(400, 'Search query must be at least 2 characters');
  }

  try {
    // Search users in DynamoDB
    const results = await db.searchUsers(query, 20);

    // Filter out current user and format response
    const users = results
      .filter(u => u.uid !== uid)
      .map(u => ({
        user_id: u.uid, // Using uid as user_id for compatibility
        uid: u.uid,
        displayName: u.firstName || u.username || u.email?.split('@')[0] || 'User'
      }));

    return buildResponse(200, { users });
  } catch (error) {
    console.error('Error searching users:', error);
    return errorResponse(500, 'Failed to search users');
  }
}

// GET /users/discover - Get discoverable users (excluding self, existing connections, pending)
async function discoverUsers(event, conn) {
  const uid = await getAuthenticatedUid(event);
  if (!uid) {
    return errorResponse(401, 'Authentication required');
  }

  // Parse pagination parameters
  const limit = Math.min(parseInt(event.queryStringParameters?.limit || '20'), 50);
  const offset = parseInt(event.queryStringParameters?.offset || '0');

  try {
    // Get users excluding:
    // 1. Current user
    // 2. Users already connected (accepted)
    // 3. Users with pending connection requests (either direction)
    const [rows] = await conn.execute(
      `SELECT u.user_id, u.firebase_uid, u.username, u.email, u.first_name, u.created_at
       FROM users u
       WHERE u.firebase_uid != ?
         AND u.firebase_uid NOT IN (
           SELECT CASE
             WHEN c.requester_uid = ? THEN c.target_uid
             ELSE c.requester_uid
           END
           FROM connections c
           WHERE (c.requester_uid = ? OR c.target_uid = ?)
             AND c.status IN ('accepted', 'pending')
         )
       ORDER BY u.created_at DESC
       LIMIT ? OFFSET ?`,
      [uid, uid, uid, uid, limit, offset]
    );

    // Get total count for pagination
    const [[{ total }]] = await conn.execute(
      `SELECT COUNT(*) as total
       FROM users u
       WHERE u.firebase_uid != ?
         AND u.firebase_uid NOT IN (
           SELECT CASE
             WHEN c.requester_uid = ? THEN c.target_uid
             ELSE c.requester_uid
           END
           FROM connections c
           WHERE (c.requester_uid = ? OR c.target_uid = ?)
             AND c.status IN ('accepted', 'pending')
         )`,
      [uid, uid, uid, uid]
    );

    const users = rows.map(u => ({
      user_id: u.user_id,
      uid: u.firebase_uid,
      displayName: u.first_name || u.username || u.email?.split('@')[0] || 'User',
      joinedAt: u.created_at
    }));

    return buildResponse(200, {
      users,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + users.length < total
      }
    });
  } catch (error) {
    console.error('Error discovering users:', error);
    return errorResponse(500, 'Failed to discover users');
  }
}

// GET /users/profile - Get current user's profile
async function getUserProfile(event) {
  const uid = await getAuthenticatedUid(event);
  if (!uid) {
    return errorResponse(401, 'Authentication required');
  }

  try {
    const user = await db.getUserByUid(uid);

    if (!user) {
      return buildResponse(200, { profile: null });
    }

    // Format response to match old structure
    const profile = {
      firebase_uid: user.uid,
      username: user.username,
      email: user.email,
      first_name: user.firstName,
      last_name: user.lastName,
      created_at: user.createdAt
    };

    return buildResponse(200, { profile });
  } catch (error) {
    console.error('Error getting profile:', error);
    return errorResponse(500, 'Failed to get profile');
  }
}

// PUT /users/profile - Update display name
async function updateUserProfile(event) {
  const uid = await getAuthenticatedUid(event);
  if (!uid) {
    return errorResponse(401, 'Authentication required');
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return errorResponse(400, 'Invalid JSON body');
  }

  const { displayName, email, firstName, lastName } = body;

  if (displayName && (typeof displayName !== 'string' || displayName.length > 100)) {
    return errorResponse(400, 'Display name must be under 100 characters');
  }

  try {
    // Check if user exists
    let user = await db.getUserByUid(uid);

    if (!user) {
      // Create new user
      user = await db.createUser({
        uid,
        username: displayName || null,
        email: email || null,
        firstName: firstName || null,
        lastName: lastName || null
      });
    } else {
      // Update existing user
      const updates = {};
      if (displayName !== undefined) updates.username = displayName;
      if (email !== undefined) updates.email = email;
      if (firstName !== undefined) updates.firstName = firstName;
      if (lastName !== undefined) updates.lastName = lastName;

      user = await db.updateUserProfile(uid, updates);
    }

    // Format response to match old structure
    const profile = {
      firebase_uid: user.uid,
      username: user.username,
      email: user.email,
      first_name: user.firstName,
      last_name: user.lastName
    };

    return buildResponse(200, {
      message: 'Profile updated',
      profile
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    return errorResponse(500, 'Failed to update profile');
  }
}

// ============================================
// CONNECTION HANDLERS
// ============================================

// POST /connections/request - Send connection request
async function requestConnection(event, conn) {
  const uid = await getAuthenticatedUid(event);
  if (!uid) {
    return errorResponse(401, 'Authentication required');
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return errorResponse(400, 'Invalid JSON body');
  }

  const { targetUid } = body;
  if (!targetUid) {
    return errorResponse(400, 'Target user ID required');
  }

  if (targetUid === uid) {
    return errorResponse(400, 'Cannot connect with yourself');
  }

  try {
    // Check if target user exists
    const targetUser = await db.getUserByUid(targetUid);
    if (!targetUser) {
      return errorResponse(404, 'User not found');
    }

    // Create connection request in DynamoDB (handles auto-accept logic internally)
    const connection = await db.createConnectionRequest(uid, targetUid);

    // Send email notification to target user (non-blocking)
    try {
      const requester = await db.getUserByUid(uid);
      const requesterName = requester?.firstName || requester?.username || 'Someone';

      if (targetUser.email) {
        const { subject, htmlBody, textBody } = generateFriendRequestEmail(requesterName);
        sendEmail(targetUser.email, subject, htmlBody, textBody); // Fire and forget
      }
    } catch (emailError) {
      console.error('Error sending friend request email:', emailError);
      // Don't fail the request if email fails
    }

    return buildResponse(201, {
      message: connection.status === 'accepted' ? 'Connection accepted' : 'Connection request sent',
      connection_id: connection.connectionId,
      status: connection.status
    });
  } catch (error) {
    // Handle specific error cases from DynamoDB layer
    if (error.message.includes('Already connected')) {
      return errorResponse(400, 'Already connected');
    }
    if (error.message.includes('already pending')) {
      return errorResponse(400, 'Connection request already pending');
    }
    console.error('Error requesting connection:', error);
    return errorResponse(500, 'Failed to send connection request');
  }
}

// GET /connections - List accepted connections
async function getConnections(event, conn) {
  const uid = await getAuthenticatedUid(event);
  if (!uid) {
    return errorResponse(401, 'Authentication required');
  }

  try {
    // Get accepted connections from DynamoDB
    const connections = await db.getConnections(uid, 'accepted');

    // Format response to match old structure
    const formattedConnections = connections.map(conn => ({
      connection_id: conn.connectionId,
      uid: conn.otherUserUid,
      displayName: conn.otherUserFirstName || conn.otherUserUsername || conn.otherUserEmail?.split('@')[0] || 'User',
      first_name: conn.otherUserFirstName,
      username: conn.otherUserUsername,
      phone_verified: conn.otherUserPhoneVerified || false,
      connected_at: conn.createdAt
    }));

    return buildResponse(200, { connections: formattedConnections });
  } catch (error) {
    console.error('Error getting connections:', error);
    return errorResponse(500, 'Failed to get connections');
  }
}

// GET /connections/pending - List pending incoming requests
async function getPendingConnections(event, conn) {
  const uid = await getAuthenticatedUid(event);
  if (!uid) {
    return errorResponse(401, 'Authentication required');
  }

  try {
    // Get pending connections from DynamoDB (where uid is the target)
    const allPending = await db.getConnections(uid, 'pending');

    // Filter to only show incoming requests (where uid is NOT the requester)
    const pending = allPending
      .filter(conn => conn.requesterUid !== uid)
      .map(conn => ({
        connection_id: conn.connectionId,
        uid: conn.requesterUid || conn.otherUserUid,
        displayName: conn.otherUserFirstName || conn.otherUserUsername || conn.otherUserEmail?.split('@')[0] || 'User',
        requested_at: conn.createdAt
      }));

    return buildResponse(200, { pending, count: pending.length });
  } catch (error) {
    console.error('Error getting pending connections:', error);
    return errorResponse(500, 'Failed to get pending connections');
  }
}

// POST /connections/{id}/accept - Accept connection request
async function acceptConnection(event, conn) {
  const uid = await getAuthenticatedUid(event);
  if (!uid) {
    return errorResponse(401, 'Authentication required');
  }

  const connectionId = event.pathParameters?.id;
  if (!connectionId) {
    return errorResponse(400, 'Connection ID required');
  }

  try {
    // Get all pending connections to find the one with this connectionId
    const pendingConnections = await db.getConnections(uid, 'pending');
    const connection = pendingConnections.find(c => c.connectionId === connectionId);

    if (!connection) {
      return errorResponse(404, 'Connection request not found');
    }

    // Determine the requester UID (the other person who sent the request)
    const requesterUid = connection.requesterUid === uid ? connection.targetUid : connection.requesterUid;

    // Accept the connection
    await db.acceptConnectionRequest(requesterUid, uid);

    // Send email notification to requester (non-blocking)
    try {
      const accepter = await db.getUserByUid(uid);
      const accepterName = accepter?.firstName || accepter?.username || 'Someone';

      const requester = await db.getUserByUid(requesterUid);
      const requesterEmail = requester?.email;

      if (requesterEmail) {
        const { subject, htmlBody, textBody } = generateRequestAcceptedEmail(accepterName);
        sendEmail(requesterEmail, subject, htmlBody, textBody); // Fire and forget
      }
    } catch (emailError) {
      console.error('Error sending acceptance email:', emailError);
      // Don't fail the request if email fails
    }

    return buildResponse(200, { message: 'Connection accepted' });
  } catch (error) {
    console.error('Error accepting connection:', error);
    return errorResponse(500, 'Failed to accept connection');
  }
}

// POST /connections/{id}/decline - Decline connection request
async function declineConnection(event, conn) {
  const uid = await getAuthenticatedUid(event);
  if (!uid) {
    return errorResponse(401, 'Authentication required');
  }

  const connectionId = event.pathParameters?.id;
  if (!connectionId) {
    return errorResponse(400, 'Connection ID required');
  }

  try {
    // Get all pending connections to find the one with this connectionId
    const pendingConnections = await db.getConnections(uid, 'pending');
    const connection = pendingConnections.find(c => c.connectionId === connectionId);

    if (!connection) {
      return errorResponse(404, 'Connection request not found');
    }

    // Determine the requester UID
    const requesterUid = connection.requesterUid === uid ? connection.targetUid : connection.requesterUid;

    // Decline the connection
    await db.declineConnectionRequest(requesterUid, uid);

    return buildResponse(200, { message: 'Connection declined' });
  } catch (error) {
    console.error('Error declining connection:', error);
    return errorResponse(500, 'Failed to decline connection');
  }
}

// DELETE /connections/{id} - Remove connection
async function removeConnection(event, conn) {
  const uid = await getAuthenticatedUid(event);
  if (!uid) {
    return errorResponse(401, 'Authentication required');
  }

  const connectionId = event.pathParameters?.id;
  if (!connectionId) {
    return errorResponse(400, 'Connection ID required');
  }

  try {
    // Get all connections to find the one with this connectionId
    const allConnections = await db.getConnections(uid, 'accepted');
    const connection = allConnections.find(c => c.connectionId === connectionId);

    if (!connection) {
      return errorResponse(404, 'Connection not found');
    }

    // Delete the connection
    const otherUid = connection.otherUserUid;
    await db.deleteConnection(uid, otherUid);

    return buildResponse(200, { message: 'Connection removed' });
  } catch (error) {
    console.error('Error removing connection:', error);
    return errorResponse(500, 'Failed to remove connection');
  }
}

// ============================================
// INVITE LINK HANDLERS
// ============================================

// POST /invite/create - Generate invite link for current user
async function createInviteLink(event, conn) {
  const uid = await getAuthenticatedUid(event);
  if (!uid) {
    return errorResponse(401, 'Authentication required');
  }

  try {
    // Create invite link in DynamoDB (returns existing if already exists)
    const invite = await db.createInviteLink(uid);

    return buildResponse(invite.isNew ? 201 : 200, {
      inviteToken: invite.token,
      inviteUrl: `https://klee.page/journal/?invite=${invite.token}`
    });
  } catch (error) {
    console.error('Error creating invite link:', error);
    return errorResponse(500, 'Failed to create invite link');
  }
}

// GET /invite?token=TOKEN - Get invite info (public endpoint)
async function getInviteInfo(event, conn) {
  const token = event.queryStringParameters?.token;
  if (!token) {
    return errorResponse(400, 'Invite token required');
  }

  try {
    // Get invite from DynamoDB
    const invite = await db.getInviteByToken(token);

    if (!invite) {
      return errorResponse(404, 'Invalid invite link');
    }

    // Get creator info
    const creator = await db.getUserByUid(invite.creatorUid);

    return buildResponse(200, {
      valid: true,
      creatorName: creator?.username || creator?.email?.split('@')[0] || 'A friend'
    });
  } catch (error) {
    console.error('Error getting invite info:', error);
    return errorResponse(500, 'Failed to get invite info');
  }
}

// POST /invite/redeem - Redeem invite link and create connection
async function redeemInvite(event, conn) {
  const uid = await getAuthenticatedUid(event);
  if (!uid) {
    return errorResponse(401, 'Authentication required');
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return errorResponse(400, 'Invalid JSON body');
  }

  const { token } = body;
  if (!token) {
    return errorResponse(400, 'Invite token required');
  }

  try {
    // Redeem invite in DynamoDB (handles all logic internally)
    const result = await db.redeemInvite(token, uid);

    if (result.error) {
      if (result.error === 'Invalid invite link') {
        return errorResponse(404, result.error);
      }
      if (result.error === 'Cannot use your own invite link') {
        return errorResponse(400, result.error);
      }
      return errorResponse(400, result.error);
    }

    return buildResponse(result.created ? 201 : 200, {
      message: result.alreadyConnected ? 'Already connected' : 'Connected successfully',
      connected: true,
      alreadyConnected: result.alreadyConnected
    });
  } catch (error) {
    console.error('Error redeeming invite:', error);
    return errorResponse(500, 'Failed to redeem invite');
  }
}

// ============================================
// SHARED ENTRY HANDLERS
// ============================================

// POST /entry/{id}/share - Create a shareable link for an entry
async function shareEntry(event, conn) {
  const uid = await getAuthenticatedUid(event);
  if (!uid) {
    return errorResponse(401, 'Authentication required');
  }

  const entryId = event.pathParameters?.id;
  if (!entryId || isNaN(parseInt(entryId))) {
    return errorResponse(400, 'Invalid entry ID');
  }

  try {
    // Verify ownership
    const [entry] = await conn.execute(
      'SELECT entry_id, title FROM journal_entries WHERE entry_id = ? AND firebase_uid = ? AND is_deleted = 0',
      [entryId, uid]
    );

    if (entry.length === 0) {
      return errorResponse(404, 'Entry not found or not authorized');
    }

    // Check if share already exists for this entry
    const [existing] = await conn.execute(
      'SELECT share_token FROM shared_entries WHERE entry_id = ? AND owner_uid = ?',
      [entryId, uid]
    );

    if (existing.length > 0) {
      // Return existing share link
      const shareUrl = `https://www.klee.page/journal/shared.html?token=${existing[0].share_token}`;
      return buildResponse(200, {
        shareToken: existing[0].share_token,
        shareUrl: shareUrl,
        message: 'Share link already exists'
      });
    }

    // Generate new share token
    const shareToken = crypto.randomBytes(32).toString('base64url');

    // Create share record
    await conn.execute(
      'INSERT INTO shared_entries (share_token, entry_id, owner_uid) VALUES (?, ?, ?)',
      [shareToken, entryId, uid]
    );

    const shareUrl = `https://www.klee.page/journal/shared.html?token=${shareToken}`;

    return buildResponse(201, {
      shareToken: shareToken,
      shareUrl: shareUrl,
      message: 'Share link created'
    });
  } catch (error) {
    console.error('Error sharing entry:', error);
    return errorResponse(500, 'Failed to create share link');
  }
}

// GET /shared/{token} - View a shared entry (preview for non-friends, full for friends)
async function getSharedEntry(event, conn) {
  const token = event.pathParameters?.token || event.queryStringParameters?.token;
  if (!token) {
    return errorResponse(400, 'Share token required');
  }

  try {
    // Get share info and entry
    const [rows] = await conn.execute(
      `SELECT se.share_id, se.entry_id, se.owner_uid, se.view_count,
              je.title, je.text, je.date, je.prompt_id,
              u.first_name, u.username, u.email
       FROM shared_entries se
       JOIN journal_entries je ON se.entry_id = je.entry_id
       LEFT JOIN users u ON se.owner_uid = u.firebase_uid
       WHERE se.share_token = ? AND je.is_deleted = 0`,
      [token]
    );

    if (rows.length === 0) {
      return errorResponse(404, 'Shared entry not found or has been deleted');
    }

    const sharedEntry = rows[0];
    const ownerUid = sharedEntry.owner_uid;
    // Use first_name, or email (before @), or fallback - avoid showing Google_xxx usernames
    let authorName = sharedEntry.first_name;
    if (!authorName && sharedEntry.email) {
      authorName = sharedEntry.email.split('@')[0];
    }
    if (!authorName || authorName.startsWith('Google_')) {
      authorName = 'A Day by Day user';
    }

    // Check if viewer is authenticated and is a friend
    let viewerUid = null;
    let isFriend = false;

    try {
      viewerUid = await getAuthenticatedUid(event);
    } catch (e) {
      // Not authenticated - that's fine, they'll get preview
    }

    if (viewerUid) {
      // Check if viewer is the owner (always full access to own entries)
      if (viewerUid === ownerUid) {
        isFriend = true;
      } else {
        // Check if they're connected
        const [connections] = await conn.execute(
          `SELECT 1 FROM connections
           WHERE ((requester_uid = ? AND target_uid = ?) OR (requester_uid = ? AND target_uid = ?))
           AND status = 'accepted'
           LIMIT 1`,
          [viewerUid, ownerUid, ownerUid, viewerUid]
        );
        isFriend = connections.length > 0;
      }
    }

    // Increment view count
    await conn.execute(
      'UPDATE shared_entries SET view_count = view_count + 1 WHERE share_id = ?',
      [sharedEntry.share_id]
    );

    // Get prompt text if there's a prompt_id
    let promptText = null;
    if (sharedEntry.prompt_id) {
      const [promptRows] = await conn.execute(
        'SELECT prompt FROM prompts WHERE prompt_id = ?',
        [sharedEntry.prompt_id]
      );
      if (promptRows.length > 0) {
        promptText = promptRows[0].prompt;
      }
    }

    // Return full content for friends, preview for others
    if (isFriend) {
      return buildResponse(200, {
        entry: {
          title: sharedEntry.title,
          text: sharedEntry.text,
          date: sharedEntry.date,
          prompt: promptText
        },
        author: {
          name: authorName,
          uid: ownerUid
        },
        viewCount: sharedEntry.view_count + 1,
        is_preview: false
      });
    } else {
      // Preview mode - show first ~150 characters of plain text
      const fullText = sharedEntry.text || '';
      // Strip HTML tags and decode entities for clean preview
      const plainText = fullText
        .replace(/<[^>]*>/g, ' ')  // Replace HTML tags with space
        .replace(/&nbsp;/g, ' ')   // Replace &nbsp; with space
        .replace(/&amp;/g, '&')    // Decode &amp;
        .replace(/&lt;/g, '<')     // Decode &lt;
        .replace(/&gt;/g, '>')     // Decode &gt;
        .replace(/&quot;/g, '"')   // Decode &quot;
        .replace(/&#39;/g, "'")    // Decode &#39;
        .replace(/\s+/g, ' ')      // Collapse multiple spaces
        .trim();
      const previewLength = 150;
      const previewText = plainText.length > previewLength
        ? plainText.substring(0, previewLength) + '...'
        : plainText;

      return buildResponse(200, {
        entry: {
          title: sharedEntry.title,
          preview_text: previewText,
          date: sharedEntry.date
        },
        author: {
          name: authorName,
          uid: ownerUid
        },
        viewCount: sharedEntry.view_count + 1,
        is_preview: true,
        is_authenticated: !!viewerUid
      });
    }
  } catch (error) {
    console.error('Error getting shared entry:', error);
    return errorResponse(500, 'Failed to get shared entry');
  }
}

// DELETE /shared/{token} - Remove a share link (owner only)
async function deleteSharedEntry(event, conn) {
  const uid = await getAuthenticatedUid(event);
  if (!uid) {
    return errorResponse(401, 'Authentication required');
  }

  const token = event.pathParameters?.token;
  if (!token) {
    return errorResponse(400, 'Share token required');
  }

  try {
    const [result] = await conn.execute(
      'DELETE FROM shared_entries WHERE share_token = ? AND owner_uid = ?',
      [token, uid]
    );

    if (result.affectedRows === 0) {
      return errorResponse(404, 'Share link not found or not authorized');
    }

    return buildResponse(200, { message: 'Share link removed' });
  } catch (error) {
    console.error('Error deleting share link:', error);
    return errorResponse(500, 'Failed to delete share link');
  }
}

// ============================================
// PHONE VERIFICATION HANDLERS
// ============================================

// Helper function to send SMS via AWS SNS
async function sendSMS(phoneNumber, message) {
  const params = {
    Message: message,
    PhoneNumber: phoneNumber,
    MessageAttributes: {
      'AWS.SNS.SMS.SMSType': {
        DataType: 'String',
        StringValue: 'Transactional'
      }
    }
  };

  try {
    await snsClient.send(new PublishCommand(params));
    return true;
  } catch (error) {
    console.error('SMS send error:', error);
    return false;
  }
}

// Send email via SES
async function sendEmail(toEmail, subject, htmlBody, textBody) {
  const params = {
    Source: SES_SENDER_EMAIL,
    Destination: { ToAddresses: [toEmail] },
    Message: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: {
        Html: { Data: htmlBody, Charset: 'UTF-8' },
        Text: { Data: textBody, Charset: 'UTF-8' }
      }
    }
  };

  try {
    await sesClient.send(new SendEmailCommand(params));
    console.log(`Email sent to ${toEmail}: ${subject}`);
    return true;
  } catch (error) {
    console.error('Email send error:', error);
    return false;
  }
}

// Generate friend request email
function generateFriendRequestEmail(requesterName) {
  const subject = `${requesterName} wants to connect with you on Day by Day`;

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0a0f; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" max-width="500" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border-radius: 16px; padding: 40px; border: 1px solid rgba(255,255,255,0.1);">
          <tr>
            <td align="center" style="padding-bottom: 24px;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">New Friend Request</h1>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom: 24px;">
              <p style="color: #a0a0a0; margin: 0; font-size: 16px; line-height: 1.5;">
                <strong style="color: #667eea;">${requesterName}</strong> wants to connect with you on Day by Day.
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom: 24px;">
              <a href="https://daybyday.academy/journal/connections.html" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">View Request</a>
            </td>
          </tr>
          <tr>
            <td align="center">
              <p style="color: #666666; margin: 0; font-size: 12px;">Day by Day - Your Daily Journal</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textBody = `${requesterName} wants to connect with you on Day by Day.\n\nView the request at: https://daybyday.academy/journal/connections.html`;

  return { subject, htmlBody, textBody };
}

// Generate request accepted email
function generateRequestAcceptedEmail(accepterName) {
  const subject = `${accepterName} accepted your friend request on Day by Day`;

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0a0f; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" max-width="500" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border-radius: 16px; padding: 40px; border: 1px solid rgba(255,255,255,0.1);">
          <tr>
            <td align="center" style="padding-bottom: 24px;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">Friend Request Accepted!</h1>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom: 24px;">
              <p style="color: #a0a0a0; margin: 0; font-size: 16px; line-height: 1.5;">
                <strong style="color: #667eea;">${accepterName}</strong> accepted your friend request. You're now connected!
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom: 24px;">
              <a href="https://daybyday.academy/journal/connections.html" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">View Friends</a>
            </td>
          </tr>
          <tr>
            <td align="center">
              <p style="color: #666666; margin: 0; font-size: 12px;">Day by Day - Your Daily Journal</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textBody = `${accepterName} accepted your friend request on Day by Day. You're now connected!\n\nView your friends at: https://daybyday.academy/journal/connections.html`;

  return { subject, htmlBody, textBody };
}

// POST /users/phone - Save phone number and send verification code
async function sendPhoneVerification(event) {
  const uid = await getAuthenticatedUid(event);
  if (!uid) {
    return errorResponse(401, 'Authentication required');
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return errorResponse(400, 'Invalid JSON body');
  }

  const { phoneNumber } = body;
  if (!phoneNumber) {
    return errorResponse(400, 'Phone number required');
  }

  // Normalize phone number (ensure it starts with +1 for US)
  let normalizedPhone = phoneNumber.replace(/\D/g, '');
  if (normalizedPhone.length === 10) {
    normalizedPhone = '+1' + normalizedPhone;
  } else if (!normalizedPhone.startsWith('+')) {
    normalizedPhone = '+' + normalizedPhone;
  }

  // Generate 6-digit verification code
  const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  try {
    // Update user with phone and verification code
    await db.updateUserProfile(uid, {
      phoneNumber: normalizedPhone,
      phoneVerificationCode: verificationCode,
      phoneVerificationExpires: expiresAt.toISOString(),
      phoneVerified: false
    });

    // Send SMS
    const message = `Your Day by Day verification code is: ${verificationCode}. It expires in 10 minutes.`;
    const sent = await sendSMS(normalizedPhone, message);

    if (!sent) {
      return errorResponse(500, 'Failed to send verification SMS');
    }

    return buildResponse(200, {
      message: 'Verification code sent',
      phoneNumber: normalizedPhone.slice(0, -4) + '****' // Masked
    });
  } catch (error) {
    console.error('Error sending phone verification:', error);
    return errorResponse(500, 'Failed to send verification');
  }
}

// POST /users/phone/verify - Verify the OTP code
async function verifyPhone(event) {
  const uid = await getAuthenticatedUid(event);
  if (!uid) {
    return errorResponse(401, 'Authentication required');
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return errorResponse(400, 'Invalid JSON body');
  }

  const { code } = body;
  if (!code || code.length !== 6) {
    return errorResponse(400, 'Invalid verification code');
  }

  try {
    // Get user to check verification code
    const user = await db.getUserByUid(uid);

    if (!user) {
      return errorResponse(404, 'User not found');
    }

    if (!user.phoneVerificationCode) {
      return errorResponse(400, 'No verification pending');
    }

    if (new Date() > new Date(user.phoneVerificationExpires)) {
      return errorResponse(400, 'Verification code expired');
    }

    if (user.phoneVerificationCode !== code) {
      return errorResponse(400, 'Invalid verification code');
    }

    // Mark phone as verified and clear verification data
    await db.updateUserProfile(uid, {
      phoneVerified: true,
      phoneVerificationCode: null,
      phoneVerificationExpires: null
    });

    return buildResponse(200, {
      message: 'Phone verified successfully',
      phoneNumber: user.phoneNumber
    });
  } catch (error) {
    console.error('Error verifying phone:', error);
    return errorResponse(500, 'Failed to verify phone');
  }
}

// ============================================
// SHARE WITH CONNECTIONS HANDLERS
// ============================================

// POST /entry/{id}/share-with - Share entry with specific connections
async function shareEntryWithConnections(event, conn) {
  const uid = await getAuthenticatedUid(event);
  if (!uid) {
    return errorResponse(401, 'Authentication required');
  }

  const entryId = event.pathParameters?.id;
  if (!entryId || isNaN(parseInt(entryId))) {
    return errorResponse(400, 'Invalid entry ID');
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return errorResponse(400, 'Invalid JSON body');
  }

  const { connectionUids } = body; // Array of UIDs to share with
  if (!connectionUids || !Array.isArray(connectionUids) || connectionUids.length === 0) {
    return errorResponse(400, 'Connection UIDs required');
  }

  try {
    // Verify entry ownership
    const [entry] = await conn.execute(
      'SELECT entry_id, title FROM journal_entries WHERE entry_id = ? AND firebase_uid = ? AND is_deleted = 0',
      [entryId, uid]
    );

    if (entry.length === 0) {
      return errorResponse(404, 'Entry not found or not authorized');
    }

    // Verify all are valid connections
    const placeholders = connectionUids.map(() => '?').join(',');
    const [connections] = await conn.execute(
      `SELECT target_uid FROM connections
       WHERE requester_uid = ? AND target_uid IN (${placeholders}) AND status = 'accepted'
       UNION
       SELECT requester_uid FROM connections
       WHERE target_uid = ? AND requester_uid IN (${placeholders}) AND status = 'accepted'`,
      [uid, ...connectionUids, uid, ...connectionUids]
    );

    const validUids = new Set(connections.map(c => c.target_uid || c.requester_uid));
    const invalidUids = connectionUids.filter(u => !validUids.has(u));

    if (invalidUids.length > 0) {
      return errorResponse(400, `Not connected with: ${invalidUids.join(', ')}`);
    }

    // Get owner's name for notifications
    const [ownerRows] = await conn.execute(
      'SELECT first_name, username FROM users WHERE firebase_uid = ?',
      [uid]
    );
    const ownerName = ownerRows[0]?.first_name || ownerRows[0]?.username || 'Someone';

    // Share with each connection
    const results = [];
    for (const targetUid of connectionUids) {
      try {
        // Insert share record (ignore if already shared)
        await conn.execute(
          `INSERT IGNORE INTO entry_shares (entry_id, owner_uid, shared_with_uid)
           VALUES (?, ?, ?)`,
          [entryId, uid, targetUid]
        );

        // Get target user's phone for SMS notification
        const [targetUser] = await conn.execute(
          'SELECT phone_number, phone_verified, first_name FROM users WHERE firebase_uid = ?',
          [targetUid]
        );

        if (targetUser.length > 0 && targetUser[0].phone_verified && targetUser[0].phone_number) {
          // Send SMS notification
          const message = `${ownerName} shared a journal entry with you on Day by Day: "${entry[0].title}". Open the app to read it!`;
          await sendSMS(targetUser[0].phone_number, message);

          // Mark as notified
          await conn.execute(
            'UPDATE entry_shares SET notified = 1 WHERE entry_id = ? AND shared_with_uid = ?',
            [entryId, targetUid]
          );
        }

        results.push({ uid: targetUid, shared: true });
      } catch (err) {
        results.push({ uid: targetUid, shared: false, error: err.message });
      }
    }

    return buildResponse(200, {
      message: 'Entry shared successfully',
      results
    });
  } catch (error) {
    console.error('Error sharing entry with connections:', error);
    return errorResponse(500, 'Failed to share entry');
  }
}

// GET /entries/shared-with-me - Get entries shared with current user
async function getEntriesSharedWithMe(event, conn) {
  const uid = await getAuthenticatedUid(event);
  if (!uid) {
    return errorResponse(401, 'Authentication required');
  }

  try {
    const [entries] = await conn.execute(
      `SELECT es.share_id, es.entry_id, es.shared_at, es.is_read,
              je.title, je.text, je.date, je.prompt_id,
              u.first_name, u.username, u.firebase_uid as owner_uid
       FROM entry_shares es
       JOIN journal_entries je ON es.entry_id = je.entry_id
       JOIN users u ON es.owner_uid = u.firebase_uid
       WHERE es.shared_with_uid = ? AND je.is_deleted = 0
       ORDER BY es.shared_at DESC
       LIMIT 50`,
      [uid]
    );

    // Get prompts for entries that have them
    const entriesWithPrompts = await Promise.all(entries.map(async (entry) => {
      let promptText = null;
      if (entry.prompt_id) {
        const [promptRows] = await conn.execute(
          'SELECT prompt FROM prompts WHERE prompt_id = ?',
          [entry.prompt_id]
        );
        if (promptRows.length > 0) {
          promptText = promptRows[0].prompt;
        }
      }
      return {
        ...entry,
        prompt: promptText,
        sharedBy: entry.first_name || entry.username || 'A friend'
      };
    }));

    // Count unread
    const unreadCount = entries.filter(e => !e.is_read).length;

    return buildResponse(200, {
      entries: entriesWithPrompts,
      unreadCount
    });
  } catch (error) {
    console.error('Error getting shared entries:', error);
    return errorResponse(500, 'Failed to get shared entries');
  }
}

// PUT /entry-share/{id}/read - Mark shared entry as read
async function markSharedEntryRead(event, conn) {
  const uid = await getAuthenticatedUid(event);
  if (!uid) {
    return errorResponse(401, 'Authentication required');
  }

  const shareId = event.pathParameters?.id;
  if (!shareId) {
    return errorResponse(400, 'Share ID required');
  }

  try {
    const [result] = await conn.execute(
      'UPDATE entry_shares SET is_read = 1 WHERE share_id = ? AND shared_with_uid = ?',
      [shareId, uid]
    );

    if (result.affectedRows === 0) {
      return errorResponse(404, 'Shared entry not found');
    }

    return buildResponse(200, { message: 'Marked as read' });
  } catch (error) {
    console.error('Error marking shared entry as read:', error);
    return errorResponse(500, 'Failed to mark as read');
  }
}

// GET /entry/{id}/shared-view - Get full entry for friends who have access
async function getSharedEntryView(event, conn) {
  const uid = await getAuthenticatedUid(event);
  if (!uid) {
    return errorResponse(401, 'Authentication required');
  }

  const entryId = event.pathParameters?.id;
  if (!entryId || isNaN(parseInt(entryId))) {
    return errorResponse(400, 'Invalid entry ID');
  }

  try {
    // Check if user has access (entry was shared with them or they're the owner)
    const [accessCheck] = await conn.execute(
      `SELECT es.share_id, es.owner_uid
       FROM entry_shares es
       WHERE es.entry_id = ? AND es.shared_with_uid = ?
       UNION
       SELECT NULL as share_id, je.firebase_uid as owner_uid
       FROM journal_entries je
       WHERE je.entry_id = ? AND je.firebase_uid = ?`,
      [entryId, uid, entryId, uid]
    );

    if (accessCheck.length === 0) {
      return errorResponse(403, 'You don\'t have access to this entry');
    }

    const ownerUid = accessCheck[0].owner_uid;

    // Get the full entry
    const [entries] = await conn.execute(
      `SELECT je.entry_id, je.title, je.text, je.date as entry_date,
              je.prompt_id, je.location, je.image_url
       FROM journal_entries je
       WHERE je.entry_id = ? AND je.is_deleted = 0`,
      [entryId]
    );

    if (entries.length === 0) {
      return errorResponse(404, 'Entry not found');
    }

    const entry = entries[0];

    // Get prompt text if exists
    if (entry.prompt_id) {
      const [promptRows] = await conn.execute(
        'SELECT prompt FROM prompts WHERE prompt_id = ?',
        [entry.prompt_id]
      );
      if (promptRows.length > 0) {
        entry.prompt = promptRows[0].prompt;
      }
    }

    // Get owner info
    const [ownerRows] = await conn.execute(
      'SELECT first_name, username, email FROM users WHERE firebase_uid = ?',
      [ownerUid]
    );

    const owner = ownerRows[0] || {};
    const ownerName = owner.first_name || owner.username || owner.email?.split('@')[0] || 'User';

    return buildResponse(200, {
      entry: {
        entry_id: entry.entry_id,
        title: entry.title,
        text: entry.text,
        entry_date: entry.entry_date,
        prompt: entry.prompt || null,
        location: entry.location || null,
        image_url: entry.image_url || null
      },
      owner: {
        uid: ownerUid,
        name: ownerName
      }
    });
  } catch (error) {
    console.error('Error getting shared entry view:', error);
    return errorResponse(500, 'Failed to get entry');
  }
}

// GET /users/phone - Get current phone verification status
async function getPhoneStatus(event) {
  const uid = await getAuthenticatedUid(event);
  if (!uid) {
    return errorResponse(401, 'Authentication required');
  }

  try {
    const user = await db.getUserByUid(uid);

    if (!user) {
      return buildResponse(200, { phoneNumber: null, verified: false });
    }

    return buildResponse(200, {
      phoneNumber: user.phoneNumber ? user.phoneNumber.slice(0, -4) + '****' : null,
      verified: !!user.phoneVerified
    });
  } catch (error) {
    console.error('Error getting phone status:', error);
    return errorResponse(500, 'Failed to get phone status');
  }
}

// ============================================
// STREAKS HANDLERS
// ============================================

// GET /streaks/me - Get current user's streak
async function getMyStreak(event, conn) {
  const uid = await getAuthenticatedUid(event);
  if (!uid) {
    return errorResponse(401, 'Authentication required');
  }

  try {
    const [rows] = await conn.execute(
      'SELECT * FROM user_streaks WHERE firebase_uid = ?',
      [uid]
    );

    if (rows.length === 0) {
      return buildResponse(200, {
        streak: { current_streak: 0, longest_streak: 0, last_entry_date: null, streak_start_date: null }
      });
    }

    return buildResponse(200, { streak: rows[0] });
  } catch (error) {
    console.error('Error getting streak:', error);
    return errorResponse(500, 'Failed to get streak');
  }
}

// GET /streaks/friends - Get friends' streaks for leaderboard
async function getFriendsStreaks(event, conn) {
  const uid = await getAuthenticatedUid(event);
  if (!uid) {
    return errorResponse(401, 'Authentication required');
  }

  try {
    // Get all accepted connections with their streaks
    const [rows] = await conn.execute(
      `SELECT
        u.firebase_uid,
        u.username,
        u.email,
        u.first_name,
        COALESCE(s.current_streak, 0) as current_streak,
        COALESCE(s.longest_streak, 0) as longest_streak,
        s.last_entry_date,
        s.streak_start_date
       FROM connections c
       JOIN users u ON u.firebase_uid = CASE WHEN c.requester_uid = ? THEN c.target_uid ELSE c.requester_uid END
       LEFT JOIN user_streaks s ON s.firebase_uid = u.firebase_uid
       WHERE (c.requester_uid = ? OR c.target_uid = ?) AND c.status = 'accepted'
       ORDER BY current_streak DESC, longest_streak DESC`,
      [uid, uid, uid]
    );

    // Also get current user's streak
    const [myStreak] = await conn.execute(
      `SELECT
        u.firebase_uid,
        u.username,
        u.email,
        u.first_name,
        COALESCE(s.current_streak, 0) as current_streak,
        COALESCE(s.longest_streak, 0) as longest_streak,
        s.last_entry_date,
        s.streak_start_date
       FROM users u
       LEFT JOIN user_streaks s ON s.firebase_uid = u.firebase_uid
       WHERE u.firebase_uid = ?`,
      [uid]
    );

    const friends = rows.map(row => ({
      uid: row.firebase_uid,
      displayName: row.first_name || row.username || row.email?.split('@')[0] || 'User',
      current_streak: row.current_streak,
      longest_streak: row.longest_streak,
      last_entry_date: row.last_entry_date,
      streak_start_date: row.streak_start_date
    }));

    const me = myStreak[0] ? {
      uid: myStreak[0].firebase_uid,
      displayName: myStreak[0].first_name || myStreak[0].username || myStreak[0].email?.split('@')[0] || 'You',
      current_streak: myStreak[0].current_streak,
      longest_streak: myStreak[0].longest_streak,
      last_entry_date: myStreak[0].last_entry_date,
      streak_start_date: myStreak[0].streak_start_date,
      isMe: true
    } : null;

    // Create combined leaderboard
    const leaderboard = me ? [...friends, me].sort((a, b) => b.current_streak - a.current_streak) : friends;

    return buildResponse(200, { leaderboard, me, friends });
  } catch (error) {
    console.error('Error getting friends streaks:', error);
    return errorResponse(500, 'Failed to get friends streaks');
  }
}

// ============================================
// ACTIVITY FEED HANDLERS
// ============================================

// GET /feed - Get activity feed (entries shared by friends)
async function getFeed(event, conn) {
  const uid = await getAuthenticatedUid(event);
  if (!uid) {
    return errorResponse(401, 'Authentication required');
  }

  try {
    const limit = parseInt(event.queryStringParameters?.limit) || 20;
    const offset = parseInt(event.queryStringParameters?.offset) || 0;

    // Get entries shared with the current user
    const [rows] = await conn.execute(
      `SELECT
        es.share_id,
        es.entry_id,
        es.owner_uid,
        es.shared_at,
        es.is_read,
        je.title,
        je.text,
        je.date as entry_date,
        u.username,
        u.email,
        u.first_name,
        (SELECT COUNT(*) FROM entry_reactions WHERE entry_id = es.entry_id) as reaction_count,
        (SELECT COUNT(*) FROM entry_comments WHERE entry_id = es.entry_id AND is_deleted = 0) as comment_count
       FROM entry_shares es
       JOIN journal_entries je ON je.entry_id = es.entry_id AND je.is_deleted = 0
       JOIN users u ON u.firebase_uid = es.owner_uid
       WHERE es.shared_with_uid = ?
       ORDER BY es.shared_at DESC
       LIMIT ? OFFSET ?`,
      [uid, limit, offset]
    );

    // Get reactions for each entry made by current user
    const entryIds = rows.map(r => r.entry_id);
    let myReactions = {};
    if (entryIds.length > 0) {
      const [reactionRows] = await conn.execute(
        `SELECT entry_id, emoji FROM entry_reactions WHERE reactor_uid = ? AND entry_id IN (${entryIds.map(() => '?').join(',')})`,
        [uid, ...entryIds]
      );
      reactionRows.forEach(r => {
        if (!myReactions[r.entry_id]) myReactions[r.entry_id] = [];
        myReactions[r.entry_id].push(r.emoji);
      });
    }

    const feed = rows.map(row => ({
      share_id: row.share_id,
      entry_id: row.entry_id,
      owner_uid: row.owner_uid,
      owner_name: row.first_name || row.username || row.email?.split('@')[0] || 'User',
      shared_at: row.shared_at,
      is_read: row.is_read === 1,
      title: row.title,
      preview: row.text.substring(0, 200) + (row.text.length > 200 ? '...' : ''),
      entry_date: row.entry_date,
      reaction_count: row.reaction_count,
      comment_count: row.comment_count,
      my_reactions: myReactions[row.entry_id] || []
    }));

    return buildResponse(200, { feed, count: feed.length });
  } catch (error) {
    console.error('Error getting feed:', error);
    return errorResponse(500, 'Failed to get feed');
  }
}

// ============================================
// REACTIONS HANDLERS
// ============================================

// POST /entry/{id}/react - Add reaction to entry
async function addReaction(event, conn) {
  const uid = await getAuthenticatedUid(event);
  if (!uid) {
    return errorResponse(401, 'Authentication required');
  }

  const entryId = event.pathParameters?.id;
  if (!entryId) {
    return errorResponse(400, 'Entry ID required');
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return errorResponse(400, 'Invalid JSON body');
  }

  const { emoji } = body;
  const validEmojis = ['❤️', '🔥', '👏', '✨', '😢'];
  if (!emoji || !validEmojis.includes(emoji)) {
    return errorResponse(400, 'Invalid emoji. Valid options: ❤️, 🔥, 👏, ✨, 😢');
  }

  try {
    // Verify user has access to this entry (it was shared with them)
    const [shareCheck] = await conn.execute(
      'SELECT 1 FROM entry_shares WHERE entry_id = ? AND shared_with_uid = ?',
      [entryId, uid]
    );
    if (shareCheck.length === 0) {
      return errorResponse(403, 'You do not have access to this entry');
    }

    // Add or ignore duplicate reaction
    await conn.execute(
      'INSERT IGNORE INTO entry_reactions (entry_id, reactor_uid, emoji) VALUES (?, ?, ?)',
      [entryId, uid, emoji]
    );

    // Get updated reaction counts
    const [reactions] = await conn.execute(
      'SELECT emoji, COUNT(*) as count FROM entry_reactions WHERE entry_id = ? GROUP BY emoji',
      [entryId]
    );

    return buildResponse(200, { message: 'Reaction added', reactions });
  } catch (error) {
    console.error('Error adding reaction:', error);
    return errorResponse(500, 'Failed to add reaction');
  }
}

// DELETE /entry/{id}/react/{emoji} - Remove reaction
async function removeReaction(event, conn) {
  const uid = await getAuthenticatedUid(event);
  if (!uid) {
    return errorResponse(401, 'Authentication required');
  }

  const entryId = event.pathParameters?.id;
  const emoji = decodeURIComponent(event.pathParameters?.emoji || '');

  if (!entryId || !emoji) {
    return errorResponse(400, 'Entry ID and emoji required');
  }

  try {
    await conn.execute(
      'DELETE FROM entry_reactions WHERE entry_id = ? AND reactor_uid = ? AND emoji = ?',
      [entryId, uid, emoji]
    );

    // Get updated reaction counts
    const [reactions] = await conn.execute(
      'SELECT emoji, COUNT(*) as count FROM entry_reactions WHERE entry_id = ? GROUP BY emoji',
      [entryId]
    );

    return buildResponse(200, { message: 'Reaction removed', reactions });
  } catch (error) {
    console.error('Error removing reaction:', error);
    return errorResponse(500, 'Failed to remove reaction');
  }
}

// GET /entry/{id}/reactions - Get reactions for entry
async function getReactions(event, conn) {
  const uid = await getAuthenticatedUid(event);
  if (!uid) {
    return errorResponse(401, 'Authentication required');
  }

  const entryId = event.pathParameters?.id;
  if (!entryId) {
    return errorResponse(400, 'Entry ID required');
  }

  try {
    const [reactions] = await conn.execute(
      `SELECT r.emoji, r.created_at, u.firebase_uid, u.username, u.email, u.first_name
       FROM entry_reactions r
       JOIN users u ON u.firebase_uid = r.reactor_uid
       WHERE r.entry_id = ?
       ORDER BY r.created_at DESC`,
      [entryId]
    );

    const grouped = {};
    reactions.forEach(r => {
      if (!grouped[r.emoji]) grouped[r.emoji] = [];
      grouped[r.emoji].push({
        uid: r.firebase_uid,
        name: r.first_name || r.username || r.email?.split('@')[0] || 'User'
      });
    });

    return buildResponse(200, { reactions: grouped });
  } catch (error) {
    console.error('Error getting reactions:', error);
    return errorResponse(500, 'Failed to get reactions');
  }
}

// ============================================
// COMMENTS HANDLERS
// ============================================

// POST /entry/{id}/comment - Add comment
async function addComment(event, conn) {
  const uid = await getAuthenticatedUid(event);
  if (!uid) {
    return errorResponse(401, 'Authentication required');
  }

  const entryId = event.pathParameters?.id;
  if (!entryId) {
    return errorResponse(400, 'Entry ID required');
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return errorResponse(400, 'Invalid JSON body');
  }

  const { text, parent_comment_id } = body;
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return errorResponse(400, 'Comment text required');
  }
  if (text.length > 1000) {
    return errorResponse(400, 'Comment too long (max 1000 characters)');
  }

  try {
    // Verify user has access (shared with them OR they own it)
    const [accessCheck] = await conn.execute(
      `SELECT 1 FROM entry_shares WHERE entry_id = ? AND shared_with_uid = ?
       UNION
       SELECT 1 FROM journal_entries WHERE entry_id = ? AND firebase_uid = ?`,
      [entryId, uid, entryId, uid]
    );
    if (accessCheck.length === 0) {
      return errorResponse(403, 'You do not have access to this entry');
    }

    const [result] = await conn.execute(
      'INSERT INTO entry_comments (entry_id, commenter_uid, parent_comment_id, comment_text) VALUES (?, ?, ?, ?)',
      [entryId, uid, parent_comment_id || null, text.trim()]
    );

    // Fetch the created comment with user info
    const [comment] = await conn.execute(
      `SELECT c.*, u.username, u.email, u.first_name
       FROM entry_comments c
       JOIN users u ON u.firebase_uid = c.commenter_uid
       WHERE c.comment_id = ?`,
      [result.insertId]
    );

    return buildResponse(201, {
      message: 'Comment added',
      comment: {
        ...comment[0],
        commenter_name: comment[0].first_name || comment[0].username || comment[0].email?.split('@')[0] || 'User'
      }
    });
  } catch (error) {
    console.error('Error adding comment:', error);
    return errorResponse(500, 'Failed to add comment');
  }
}

// GET /entry/{id}/comments - Get comments for entry
async function getComments(event, conn) {
  const uid = await getAuthenticatedUid(event);
  if (!uid) {
    return errorResponse(401, 'Authentication required');
  }

  const entryId = event.pathParameters?.id;
  if (!entryId) {
    return errorResponse(400, 'Entry ID required');
  }

  try {
    const [comments] = await conn.execute(
      `SELECT c.*, u.username, u.email, u.first_name
       FROM entry_comments c
       JOIN users u ON u.firebase_uid = c.commenter_uid
       WHERE c.entry_id = ? AND c.is_deleted = 0
       ORDER BY c.created_at ASC`,
      [entryId]
    );

    const formattedComments = comments.map(c => ({
      comment_id: c.comment_id,
      entry_id: c.entry_id,
      commenter_uid: c.commenter_uid,
      commenter_name: c.first_name || c.username || c.email?.split('@')[0] || 'User',
      parent_comment_id: c.parent_comment_id,
      text: c.comment_text,
      created_at: c.created_at,
      is_mine: c.commenter_uid === uid
    }));

    return buildResponse(200, { comments: formattedComments });
  } catch (error) {
    console.error('Error getting comments:', error);
    return errorResponse(500, 'Failed to get comments');
  }
}

// DELETE /comment/{id} - Delete own comment
async function deleteComment(event, conn) {
  const uid = await getAuthenticatedUid(event);
  if (!uid) {
    return errorResponse(401, 'Authentication required');
  }

  const commentId = event.pathParameters?.id;
  if (!commentId) {
    return errorResponse(400, 'Comment ID required');
  }

  try {
    // Verify ownership
    const [check] = await conn.execute(
      'SELECT 1 FROM entry_comments WHERE comment_id = ? AND commenter_uid = ?',
      [commentId, uid]
    );
    if (check.length === 0) {
      return errorResponse(403, 'You can only delete your own comments');
    }

    await conn.execute(
      'UPDATE entry_comments SET is_deleted = 1 WHERE comment_id = ?',
      [commentId]
    );

    return buildResponse(200, { message: 'Comment deleted' });
  } catch (error) {
    console.error('Error deleting comment:', error);
    return errorResponse(500, 'Failed to delete comment');
  }
}

// ============================================
// ACCOUNTABILITY PARTNERS HANDLERS
// ============================================

// POST /accountability/request - Request accountability partner
async function requestAccountabilityPartner(event, conn) {
  const uid = await getAuthenticatedUid(event);
  if (!uid) {
    return errorResponse(401, 'Authentication required');
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return errorResponse(400, 'Invalid JSON body');
  }

  const { partner_uid } = body;
  if (!partner_uid) {
    return errorResponse(400, 'Partner UID required');
  }

  if (partner_uid === uid) {
    return errorResponse(400, 'Cannot partner with yourself');
  }

  try {
    // Verify they are connected
    const [connCheck] = await conn.execute(
      `SELECT 1 FROM connections
       WHERE ((requester_uid = ? AND target_uid = ?) OR (requester_uid = ? AND target_uid = ?))
       AND status = 'accepted'`,
      [uid, partner_uid, partner_uid, uid]
    );
    if (connCheck.length === 0) {
      return errorResponse(400, 'You must be connected to request accountability partnership');
    }

    // Check for existing partnership
    const [existing] = await conn.execute(
      `SELECT * FROM accountability_partners
       WHERE (user_uid = ? AND partner_uid = ?) OR (user_uid = ? AND partner_uid = ?)`,
      [uid, partner_uid, partner_uid, uid]
    );

    if (existing.length > 0) {
      const p = existing[0];
      if (p.status === 'active') {
        return errorResponse(400, 'Already partners');
      }
      if (p.status === 'pending') {
        // If they requested us, auto-accept
        if (p.user_uid === partner_uid) {
          await conn.execute(
            'UPDATE accountability_partners SET status = "active" WHERE partnership_id = ?',
            [p.partnership_id]
          );
          return buildResponse(200, { message: 'Partnership activated', status: 'active' });
        }
        return errorResponse(400, 'Partnership request already pending');
      }
    }

    // Create new request
    await conn.execute(
      'INSERT INTO accountability_partners (user_uid, partner_uid, status) VALUES (?, ?, "pending")',
      [uid, partner_uid]
    );

    return buildResponse(201, { message: 'Partnership request sent' });
  } catch (error) {
    console.error('Error requesting partnership:', error);
    return errorResponse(500, 'Failed to request partnership');
  }
}

// POST /accountability/{id}/accept - Accept partnership
async function acceptAccountabilityPartner(event, conn) {
  const uid = await getAuthenticatedUid(event);
  if (!uid) {
    return errorResponse(401, 'Authentication required');
  }

  const partnershipId = event.pathParameters?.id;
  if (!partnershipId) {
    return errorResponse(400, 'Partnership ID required');
  }

  try {
    const [rows] = await conn.execute(
      'SELECT * FROM accountability_partners WHERE partnership_id = ? AND partner_uid = ? AND status = "pending"',
      [partnershipId, uid]
    );

    if (rows.length === 0) {
      return errorResponse(404, 'Partnership request not found');
    }

    await conn.execute(
      'UPDATE accountability_partners SET status = "active" WHERE partnership_id = ?',
      [partnershipId]
    );

    return buildResponse(200, { message: 'Partnership accepted' });
  } catch (error) {
    console.error('Error accepting partnership:', error);
    return errorResponse(500, 'Failed to accept partnership');
  }
}

// GET /accountability - Get current partnerships
async function getAccountabilityPartners(event, conn) {
  const uid = await getAuthenticatedUid(event);
  if (!uid) {
    return errorResponse(401, 'Authentication required');
  }

  try {
    const [rows] = await conn.execute(
      `SELECT
        ap.*,
        u.firebase_uid as partner_firebase_uid,
        u.username,
        u.email,
        u.first_name,
        COALESCE(s.current_streak, 0) as partner_streak
       FROM accountability_partners ap
       JOIN users u ON u.firebase_uid = CASE WHEN ap.user_uid = ? THEN ap.partner_uid ELSE ap.user_uid END
       LEFT JOIN user_streaks s ON s.firebase_uid = u.firebase_uid
       WHERE (ap.user_uid = ? OR ap.partner_uid = ?) AND ap.status IN ('pending', 'active')
       ORDER BY ap.status DESC, ap.created_at DESC`,
      [uid, uid, uid]
    );

    const partners = rows.map(row => ({
      partnership_id: row.partnership_id,
      partner_uid: row.partner_firebase_uid,
      partner_name: row.first_name || row.username || row.email?.split('@')[0] || 'User',
      partner_streak: row.partner_streak,
      status: row.status,
      is_incoming: row.partner_uid === uid && row.status === 'pending',
      created_at: row.created_at
    }));

    return buildResponse(200, { partners });
  } catch (error) {
    console.error('Error getting partnerships:', error);
    return errorResponse(500, 'Failed to get partnerships');
  }
}

// DELETE /accountability/{id} - End partnership
async function endAccountabilityPartnership(event, conn) {
  const uid = await getAuthenticatedUid(event);
  if (!uid) {
    return errorResponse(401, 'Authentication required');
  }

  const partnershipId = event.pathParameters?.id;
  if (!partnershipId) {
    return errorResponse(400, 'Partnership ID required');
  }

  try {
    await conn.execute(
      'UPDATE accountability_partners SET status = "ended" WHERE partnership_id = ? AND (user_uid = ? OR partner_uid = ?)',
      [partnershipId, uid, uid]
    );

    return buildResponse(200, { message: 'Partnership ended' });
  } catch (error) {
    console.error('Error ending partnership:', error);
    return errorResponse(500, 'Failed to end partnership');
  }
}

// ============================================
// TRIPS
// ============================================

// GET /trips - Get all trips for the authenticated user
async function getTrips(event, conn) {
  const uid = await getAuthenticatedUid(event);
  if (!uid) {
    return errorResponse(401, 'Authentication required');
  }

  try {
    const [trips] = await conn.execute(
      `SELECT t.*,
        (SELECT COUNT(*) FROM journal_entries WHERE trip_id = t.trip_id AND is_deleted = 0) as entry_count,
        (SELECT COUNT(*) FROM trip_shares WHERE trip_id = t.trip_id) as share_count
       FROM trips t
       WHERE t.owner_uid = ? AND t.is_active = 1
       ORDER BY t.created_at DESC`,
      [uid]
    );

    return buildResponse(200, trips);
  } catch (error) {
    console.error('Error fetching trips:', error);
    return errorResponse(500, 'Failed to fetch trips');
  }
}

// POST /trip - Create a new trip
async function createTrip(event, conn) {
  const uid = await getAuthenticatedUid(event);
  if (!uid) {
    return errorResponse(401, 'Authentication required');
  }

  const data = JSON.parse(event.body || '{}');
  const { title, description, destination, start_date, end_date, cover_image_url } = data;

  if (!title) {
    return errorResponse(400, 'Title is required');
  }

  try {
    const [result] = await conn.execute(
      `INSERT INTO trips (owner_uid, title, description, destination, start_date, end_date, cover_image_url)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [uid, title, description || null, destination || null, start_date || null, end_date || null, cover_image_url || null]
    );

    const [trip] = await conn.execute(
      'SELECT * FROM trips WHERE trip_id = ?',
      [result.insertId]
    );

    return buildResponse(201, trip[0]);
  } catch (error) {
    console.error('Error creating trip:', error);
    return errorResponse(500, 'Failed to create trip');
  }
}

// PUT /trip/{id} - Update a trip
async function updateTrip(event, conn) {
  const uid = await getAuthenticatedUid(event);
  if (!uid) {
    return errorResponse(401, 'Authentication required');
  }

  const tripId = event.pathParameters?.id;
  if (!tripId) {
    return errorResponse(400, 'Trip ID required');
  }

  const data = JSON.parse(event.body || '{}');
  const { title, description, destination, start_date, end_date, cover_image_url } = data;

  try {
    // Verify ownership
    const [trips] = await conn.execute(
      'SELECT * FROM trips WHERE trip_id = ? AND owner_uid = ?',
      [tripId, uid]
    );

    if (trips.length === 0) {
      return errorResponse(404, 'Trip not found or access denied');
    }

    // Build update query dynamically
    const updates = [];
    const values = [];

    if (title !== undefined) {
      updates.push('title = ?');
      values.push(title);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description);
    }
    if (destination !== undefined) {
      updates.push('destination = ?');
      values.push(destination);
    }
    if (start_date !== undefined) {
      updates.push('start_date = ?');
      values.push(start_date);
    }
    if (end_date !== undefined) {
      updates.push('end_date = ?');
      values.push(end_date);
    }
    if (cover_image_url !== undefined) {
      updates.push('cover_image_url = ?');
      values.push(cover_image_url);
    }

    if (updates.length === 0) {
      return errorResponse(400, 'No fields to update');
    }

    values.push(tripId);
    values.push(uid);

    await conn.execute(
      `UPDATE trips SET ${updates.join(', ')} WHERE trip_id = ? AND owner_uid = ?`,
      values
    );

    const [updatedTrip] = await conn.execute(
      'SELECT * FROM trips WHERE trip_id = ?',
      [tripId]
    );

    return buildResponse(200, updatedTrip[0]);
  } catch (error) {
    console.error('Error updating trip:', error);
    return errorResponse(500, 'Failed to update trip');
  }
}

// DELETE /trip/{id} - Delete (soft delete) a trip
async function deleteTrip(event, conn) {
  const uid = await getAuthenticatedUid(event);
  if (!uid) {
    return errorResponse(401, 'Authentication required');
  }

  const tripId = event.pathParameters?.id;
  if (!tripId) {
    return errorResponse(400, 'Trip ID required');
  }

  try {
    // Verify ownership
    const [trips] = await conn.execute(
      'SELECT * FROM trips WHERE trip_id = ? AND owner_uid = ?',
      [tripId, uid]
    );

    if (trips.length === 0) {
      return errorResponse(404, 'Trip not found or access denied');
    }

    // Soft delete the trip
    await conn.execute(
      'UPDATE trips SET is_active = 0 WHERE trip_id = ? AND owner_uid = ?',
      [tripId, uid]
    );

    return buildResponse(200, { message: 'Trip deleted successfully' });
  } catch (error) {
    console.error('Error deleting trip:', error);
    return errorResponse(500, 'Failed to delete trip');
  }
}

// GET /trip/{id}/entries - Get all entries for a specific trip
async function getTripEntries(event, conn) {
  const uid = await getAuthenticatedUid(event);
  if (!uid) {
    return errorResponse(401, 'Authentication required');
  }

  const tripId = event.pathParameters?.id;
  if (!tripId) {
    return errorResponse(400, 'Trip ID required');
  }

  try {
    // Check if user owns the trip or has it shared with them
    const [access] = await conn.execute(
      `SELECT t.* FROM trips t
       LEFT JOIN trip_shares ts ON t.trip_id = ts.trip_id AND ts.shared_with_uid = ?
       WHERE t.trip_id = ? AND (t.owner_uid = ? OR ts.share_id IS NOT NULL)`,
      [uid, tripId, uid]
    );

    if (access.length === 0) {
      return errorResponse(404, 'Trip not found or access denied');
    }

    // Get entries for the trip
    const [entries] = await conn.execute(
      `SELECT e.*, u.username, u.first_name, u.last_name
       FROM journal_entries e
       LEFT JOIN users u ON e.firebase_uid = u.firebase_uid
       WHERE e.trip_id = ? AND e.is_deleted = 0
       ORDER BY e.date DESC`,
      [tripId]
    );

    return buildResponse(200, entries);
  } catch (error) {
    console.error('Error fetching trip entries:', error);
    return errorResponse(500, 'Failed to fetch trip entries');
  }
}

// POST /trip/{id}/share - Share a trip with another user
async function shareTripWithUser(event, conn) {
  const uid = await getAuthenticatedUid(event);
  if (!uid) {
    return errorResponse(401, 'Authentication required');
  }

  const tripId = event.pathParameters?.id;
  if (!tripId) {
    return errorResponse(400, 'Trip ID required');
  }

  const data = JSON.parse(event.body || '{}');
  const { shared_with_uid, permission } = data;

  if (!shared_with_uid) {
    return errorResponse(400, 'shared_with_uid is required');
  }

  try {
    // Verify trip ownership
    const [trips] = await conn.execute(
      'SELECT * FROM trips WHERE trip_id = ? AND owner_uid = ?',
      [tripId, uid]
    );

    if (trips.length === 0) {
      return errorResponse(404, 'Trip not found or access denied');
    }

    // Check if users are connected
    const [connections] = await conn.execute(
      `SELECT * FROM connections
       WHERE ((requester_uid = ? AND target_uid = ?) OR (requester_uid = ? AND target_uid = ?))
       AND status = 'accepted'`,
      [uid, shared_with_uid, shared_with_uid, uid]
    );

    if (connections.length === 0) {
      return errorResponse(400, 'Can only share with connected users');
    }

    // Create the share
    await conn.execute(
      `INSERT INTO trip_shares (trip_id, owner_uid, shared_with_uid, permission)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE permission = ?`,
      [tripId, uid, shared_with_uid, permission || 'view', permission || 'view']
    );

    // Get shared user info
    const [sharedUser] = await conn.execute(
      'SELECT username, first_name, last_name, email FROM users WHERE firebase_uid = ?',
      [shared_with_uid]
    );

    return buildResponse(201, {
      message: 'Trip shared successfully',
      shared_with: sharedUser[0]
    });
  } catch (error) {
    console.error('Error sharing trip:', error);
    return errorResponse(500, 'Failed to share trip');
  }
}

// DELETE /trip/{tripId}/share/{shareId} - Remove trip share
async function removeTripShare(event, conn) {
  const uid = await getAuthenticatedUid(event);
  if (!uid) {
    return errorResponse(401, 'Authentication required');
  }

  const { tripId, shareId } = event.pathParameters;
  if (!tripId || !shareId) {
    return errorResponse(400, 'Trip ID and Share ID required');
  }

  try {
    // Verify ownership and delete
    await conn.execute(
      'DELETE FROM trip_shares WHERE share_id = ? AND trip_id = ? AND owner_uid = ?',
      [shareId, tripId, uid]
    );

    return buildResponse(200, { message: 'Share removed successfully' });
  } catch (error) {
    console.error('Error removing trip share:', error);
    return errorResponse(500, 'Failed to remove share');
  }
}

// GET /trips/shared-with-me - Get trips shared with the authenticated user
async function getTripsSharedWithMe(event, conn) {
  const uid = await getAuthenticatedUid(event);
  if (!uid) {
    return errorResponse(401, 'Authentication required');
  }

  try {
    const [trips] = await conn.execute(
      `SELECT t.*, ts.permission, ts.shared_at,
        u.username as owner_username, u.first_name as owner_first_name, u.last_name as owner_last_name,
        (SELECT COUNT(*) FROM journal_entries WHERE trip_id = t.trip_id AND is_deleted = 0) as entry_count
       FROM trip_shares ts
       JOIN trips t ON ts.trip_id = t.trip_id
       JOIN users u ON t.owner_uid = u.firebase_uid
       WHERE ts.shared_with_uid = ? AND t.is_active = 1
       ORDER BY ts.shared_at DESC`,
      [uid]
    );

    return buildResponse(200, trips);
  } catch (error) {
    console.error('Error fetching shared trips:', error);
    return errorResponse(500, 'Failed to fetch shared trips');
  }
}

// ============================================
// SCHEMA INITIALIZATION
// ============================================
async function initializeSchema(conn) {
  const schema = `
    CREATE TABLE IF NOT EXISTS users (
      user_id INT AUTO_INCREMENT PRIMARY KEY,
      firebase_uid VARCHAR(128) UNIQUE,
      username VARCHAR(100),
      email VARCHAR(255),
      first_name VARCHAR(100),
      last_name VARCHAR(100),
      phone_number VARCHAR(20),
      phone_verified TINYINT(1) DEFAULT 0,
      phone_verification_code VARCHAR(6),
      phone_verification_expires DATETIME,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_firebase_uid (firebase_uid),
      INDEX idx_phone (phone_number)
    );

    CREATE TABLE IF NOT EXISTS journal_entries (
      entry_id INT AUTO_INCREMENT PRIMARY KEY,
      firebase_uid VARCHAR(128) NOT NULL,
      date DATETIME NOT NULL,
      title VARCHAR(255) NOT NULL,
      text TEXT NOT NULL,
      prompt_id INT NULL,
      client_id VARCHAR(50) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      is_deleted TINYINT(1) DEFAULT 0,
      INDEX idx_user_entries (firebase_uid, date),
      INDEX idx_sync (firebase_uid, updated_at),
      INDEX idx_client_id (firebase_uid, client_id)
    );

    CREATE TABLE IF NOT EXISTS prompts (
      prompt_id INT AUTO_INCREMENT PRIMARY KEY,
      prompt TEXT NOT NULL,
      user_id INT NULL,
      firebase_uid VARCHAR(128) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_prompt_user (firebase_uid)
    );

    CREATE TABLE IF NOT EXISTS connections (
      connection_id INT AUTO_INCREMENT PRIMARY KEY,
      requester_uid VARCHAR(128) NOT NULL,
      target_uid VARCHAR(128) NOT NULL,
      status ENUM('pending', 'accepted', 'declined', 'blocked') DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_connection (requester_uid, target_uid),
      INDEX idx_target (target_uid, status),
      INDEX idx_requester (requester_uid, status)
    );

    CREATE TABLE IF NOT EXISTS invite_links (
      invite_id INT AUTO_INCREMENT PRIMARY KEY,
      invite_token VARCHAR(64) UNIQUE NOT NULL,
      creator_uid VARCHAR(128) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_token (invite_token),
      INDEX idx_creator (creator_uid)
    );

    CREATE TABLE IF NOT EXISTS shared_entries (
      share_id INT AUTO_INCREMENT PRIMARY KEY,
      share_token VARCHAR(64) UNIQUE NOT NULL,
      entry_id INT NOT NULL,
      owner_uid VARCHAR(128) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NULL,
      view_count INT DEFAULT 0,
      INDEX idx_share_token (share_token),
      INDEX idx_entry (entry_id),
      INDEX idx_owner (owner_uid)
    );

    CREATE TABLE IF NOT EXISTS entry_shares (
      share_id INT AUTO_INCREMENT PRIMARY KEY,
      entry_id INT NOT NULL,
      owner_uid VARCHAR(128) NOT NULL,
      shared_with_uid VARCHAR(128) NOT NULL,
      shared_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      is_read TINYINT(1) DEFAULT 0,
      notified TINYINT(1) DEFAULT 0,
      UNIQUE KEY unique_share (entry_id, shared_with_uid),
      INDEX idx_shared_with (shared_with_uid, is_read),
      INDEX idx_owner (owner_uid),
      INDEX idx_entry (entry_id)
    );

    CREATE TABLE IF NOT EXISTS entry_reactions (
      reaction_id INT AUTO_INCREMENT PRIMARY KEY,
      entry_id INT NOT NULL,
      reactor_uid VARCHAR(128) NOT NULL,
      emoji VARCHAR(10) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_reaction (entry_id, reactor_uid, emoji),
      INDEX idx_entry (entry_id),
      INDEX idx_reactor (reactor_uid)
    );

    CREATE TABLE IF NOT EXISTS entry_comments (
      comment_id INT AUTO_INCREMENT PRIMARY KEY,
      entry_id INT NOT NULL,
      commenter_uid VARCHAR(128) NOT NULL,
      parent_comment_id INT NULL,
      comment_text TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      is_deleted TINYINT(1) DEFAULT 0,
      INDEX idx_entry (entry_id),
      INDEX idx_commenter (commenter_uid),
      INDEX idx_parent (parent_comment_id)
    );

    CREATE TABLE IF NOT EXISTS user_streaks (
      streak_id INT AUTO_INCREMENT PRIMARY KEY,
      firebase_uid VARCHAR(128) NOT NULL UNIQUE,
      current_streak INT DEFAULT 0,
      longest_streak INT DEFAULT 0,
      last_entry_date DATE,
      streak_start_date DATE,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_uid (firebase_uid),
      INDEX idx_streak (current_streak DESC)
    );

    CREATE TABLE IF NOT EXISTS accountability_partners (
      partnership_id INT AUTO_INCREMENT PRIMARY KEY,
      user_uid VARCHAR(128) NOT NULL,
      partner_uid VARCHAR(128) NOT NULL,
      status ENUM('pending', 'active', 'ended') DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_partnership (user_uid, partner_uid),
      INDEX idx_user (user_uid),
      INDEX idx_partner (partner_uid)
    );

    CREATE TABLE IF NOT EXISTS trips (
      trip_id INT AUTO_INCREMENT PRIMARY KEY,
      owner_uid VARCHAR(128) NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      destination VARCHAR(255),
      start_date DATE,
      end_date DATE,
      cover_image_url VARCHAR(512),
      is_active TINYINT(1) DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_owner (owner_uid),
      INDEX idx_dates (start_date, end_date)
    );

    CREATE TABLE IF NOT EXISTS trip_shares (
      share_id INT AUTO_INCREMENT PRIMARY KEY,
      trip_id INT NOT NULL,
      owner_uid VARCHAR(128) NOT NULL,
      shared_with_uid VARCHAR(128) NOT NULL,
      permission ENUM('view', 'comment') DEFAULT 'view',
      shared_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_trip_share (trip_id, shared_with_uid),
      INDEX idx_shared_with (shared_with_uid),
      INDEX idx_trip (trip_id)
    );
  `;

  // Execute each statement
  const statements = schema.split(';').filter(s => s.trim());
  for (const stmt of statements) {
    if (stmt.trim()) {
      await conn.execute(stmt);
    }
  }

  // Check if prompts table is empty, if so add sample prompts
  const [rows] = await conn.execute('SELECT COUNT(*) as count FROM prompts');
  if (rows[0].count === 0) {
    const samplePrompts = [
      'What are three things you are grateful for today?',
      'Describe a challenge you faced recently and how you handled it.',
      'What is one thing you learned today?',
      'Write about a person who has positively influenced your life.',
      'What are your goals for this week?',
      'Describe your perfect day.',
      'What advice would you give to your younger self?',
      'Write about a moment that made you smile today.',
      'What habits do you want to develop?',
      'Reflect on a recent accomplishment, no matter how small.'
    ];
    for (const prompt of samplePrompts) {
      await conn.execute('INSERT INTO prompts (prompt) VALUES (?)', [prompt]);
    }
  }

  return buildResponse(200, { message: 'Schema initialized successfully' });
}

// Run migrations to add new columns to existing tables
async function runMigrations(conn) {
  const migrations = [
    // Add phone columns to users table
    "ALTER TABLE users ADD COLUMN phone_number VARCHAR(20)",
    "ALTER TABLE users ADD COLUMN phone_verified TINYINT(1) DEFAULT 0",
    "ALTER TABLE users ADD COLUMN phone_verification_code VARCHAR(6)",
    "ALTER TABLE users ADD COLUMN phone_verification_expires DATETIME",
    // Add image and location columns to journal_entries
    "ALTER TABLE journal_entries ADD COLUMN image_url VARCHAR(512)",
    "ALTER TABLE journal_entries ADD COLUMN latitude DECIMAL(10, 8)",
    "ALTER TABLE journal_entries ADD COLUMN longitude DECIMAL(11, 8)",
    "ALTER TABLE journal_entries ADD COLUMN location_name VARCHAR(255)",
    // Add trip_id to journal_entries for travel journal
    "ALTER TABLE journal_entries ADD COLUMN trip_id INT NULL",
    "ALTER TABLE journal_entries ADD INDEX idx_trip_id (trip_id)"
  ];

  const results = [];
  for (const sql of migrations) {
    try {
      await conn.execute(sql);
      results.push({ sql: sql.substring(0, 50), success: true });
    } catch (error) {
      if (error.code === 'ER_DUP_FIELDNAME') {
        results.push({ sql: sql.substring(0, 50), success: true, note: 'Column already exists' });
      } else {
        results.push({ sql: sql.substring(0, 50), success: false, error: error.message });
      }
    }
  }

  return buildResponse(200, { message: 'Migrations complete', results });
}

// ============================================
// ACCOUNT DELETION
// ============================================

// DELETE /account - Permanently delete user account and all data
async function deleteAccount(event, conn) {
  const uid = await getAuthenticatedUid(event);
  if (!uid) {
    return errorResponse(401, 'Authentication required');
  }

  try {
    // Delete all user data in correct order to avoid foreign key issues
    // 1. Delete entry shares (both owned and received)
    await conn.execute(
      'DELETE FROM entry_shares WHERE owner_uid = ? OR shared_with_uid = ?',
      [uid, uid]
    );

    // 2. Delete shared entry links
    await conn.execute(
      'DELETE FROM shared_entries WHERE owner_uid = ?',
      [uid]
    );

    // 3. Delete invite links
    await conn.execute(
      'DELETE FROM invite_links WHERE creator_uid = ?',
      [uid]
    );

    // 4. Delete connections (both as requester and target)
    await conn.execute(
      'DELETE FROM connections WHERE requester_uid = ? OR target_uid = ?',
      [uid, uid]
    );

    // 5. Delete journal entries (hard delete, not soft)
    await conn.execute(
      'DELETE FROM journal_entries WHERE firebase_uid = ?',
      [uid]
    );

    // 6. Delete custom prompts
    await conn.execute(
      'DELETE FROM prompts WHERE firebase_uid = ?',
      [uid]
    );

    // 7. Delete user record
    await conn.execute(
      'DELETE FROM users WHERE firebase_uid = ?',
      [uid]
    );

    // 8. Delete user from Cognito
    // Use cognito:username (not sub) - this is different for Google federated users
    // Note: Lambda is in VPC and may not have internet access to reach Cognito
    const cognitoUsername = getCognitoUsername(event);
    if (cognitoUsername) {
      try {
        const deleteCommand = new AdminDeleteUserCommand({
          UserPoolId: COGNITO_USER_POOL_ID,
          Username: cognitoUsername
        });
        // Use AbortController with 5 second timeout - fail fast if no internet access
        const abortController = new AbortController();
        const timeoutId = setTimeout(() => abortController.abort(), 5000);
        try {
          await cognitoClient.send(deleteCommand, { abortSignal: abortController.signal });
        } finally {
          clearTimeout(timeoutId);
        }
      } catch (cognitoError) {
        // Log but continue - database data is already deleted
        console.log('Cognito deletion skipped (VPC limitation or error):', cognitoError.name || cognitoError.message);
      }
    }

    return buildResponse(200, {
      message: 'Account deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting account:', error);
    return errorResponse(500, 'Failed to delete account');
  }
}

// ============================================
// MAIN HANDLER
// ============================================
exports.handler = async (event, context) => {
  console.log('Request:', event.httpMethod, event.path);

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return buildResponse(200, {});
  }

  const method = event.httpMethod;
  const path = event.path;

  // List of endpoints that have been migrated to DynamoDB (no MySQL connection needed)
  const dynamoDbEndpoints = [
    // Tier 1 - Basic endpoints
    PATHS.health,
    PATHS.prompts,
    PATHS.prompt,
    PATHS.usersProfile,
    PATHS.usersPhone,
    PATHS.usersPhoneVerify,
    PATHS.uploadUrl,

    // Tier 2 - Medium complexity endpoints
    PATHS.entry,
    PATHS.entries,
    PATHS.sync,
    PATHS.connections,
    PATHS.connectionsPending,
    PATHS.connectionsRequest,
    PATHS.usersSearch,
    PATHS.inviteCreate,
    PATHS.invite
  ];

  const isDynamoDbEndpoint = dynamoDbEndpoints.some(ep => path === ep || path.startsWith(ep));

  let conn;
  try {
    // Only create MySQL connection for non-migrated endpoints
    if (!isDynamoDbEndpoint) {
      // Note: Uncomment when MySQL is available
      // conn = await getConnection();
    }

    // Route handling
    switch (true) {
      // Schema initialization (one-time setup)
      case method === 'POST' && path === '/journalLambdafunc/init-schema':
        return await initializeSchema(conn);

      // Run migrations (add new columns to existing tables)
      case method === 'POST' && path === '/journalLambdafunc/run-migrations':
        return await runMigrations(conn);

      // Health check
      case method === 'GET' && path === PATHS.health:
        return buildResponse(200, { status: 'healthy', timestamp: new Date().toISOString() });

      // Prompts
      case method === 'GET' && path === PATHS.prompts:
        return await getPrompt();

      case method === 'POST' && path === PATHS.prompt:
        return await addPrompt(event);

      // Entries - List
      case method === 'GET' && path === PATHS.entries:
        return await getEntries(event, conn);

      // Entries - Create
      case method === 'POST' && path === PATHS.entry:
        return await createEntry(event, conn);

      // Entries - Update (path: /entry/{id})
      case method === 'PUT' && path.startsWith(PATHS.entry + '/'):
        event.pathParameters = { id: path.split('/').pop() };
        return await updateEntry(event, conn);

      // Entries - Delete (path: /entry/{id})
      case method === 'DELETE' && path.startsWith(PATHS.entry + '/'):
        event.pathParameters = { id: path.split('/').pop() };
        return await deleteEntry(event, conn);

      // Sync
      case method === 'POST' && path === PATHS.sync:
        return await syncEntries(event, conn);

      // Image upload - get presigned URL
      case method === 'POST' && path === PATHS.uploadUrl:
        return await getUploadUrl(event);

      // User endpoints
      case method === 'GET' && path === PATHS.usersSearch:
        return await searchUsers(event, conn);

      case method === 'GET' && path === PATHS.usersDiscover:
        return await discoverUsers(event, conn);

      case method === 'GET' && path === PATHS.usersProfile:
        return await getUserProfile(event);

      case method === 'PUT' && path === PATHS.usersProfile:
        return await updateUserProfile(event);

      // Connection endpoints
      case method === 'GET' && path === PATHS.connections:
        return await getConnections(event, conn);

      case method === 'GET' && path === PATHS.connectionsPending:
        return await getPendingConnections(event, conn);

      case method === 'POST' && path === PATHS.connectionsRequest:
        return await requestConnection(event, conn);

      case method === 'POST' && /\/journalLambdafunc\/connections\/\d+\/accept$/.test(path):
        event.pathParameters = { id: path.split('/')[3] };
        return await acceptConnection(event, conn);

      case method === 'POST' && /\/journalLambdafunc\/connections\/\d+\/decline$/.test(path):
        event.pathParameters = { id: path.split('/')[3] };
        return await declineConnection(event, conn);

      case method === 'DELETE' && /\/journalLambdafunc\/connections\/\d+$/.test(path):
        event.pathParameters = { id: path.split('/').pop() };
        return await removeConnection(event, conn);

      // Invite link endpoints
      case method === 'POST' && path === PATHS.inviteCreate:
        return await createInviteLink(event, conn);

      case method === 'GET' && path === PATHS.inviteInfo:
        return await getInviteInfo(event, conn);

      case method === 'POST' && path === PATHS.inviteRedeem:
        return await redeemInvite(event, conn);

      // Shared entry endpoints
      case method === 'POST' && /\/journalLambdafunc\/entry\/\d+\/share$/.test(path):
        event.pathParameters = { id: path.split('/')[3] };
        return await shareEntry(event, conn);

      case method === 'GET' && path.startsWith(PATHS.sharedEntry + '/'):
        event.pathParameters = { token: path.split('/').pop() };
        return await getSharedEntry(event, conn);

      case method === 'DELETE' && path.startsWith(PATHS.sharedEntry + '/'):
        event.pathParameters = { token: path.split('/').pop() };
        return await deleteSharedEntry(event, conn);

      // Phone verification endpoints
      case method === 'GET' && path === PATHS.usersPhone:
        return await getPhoneStatus(event);

      case method === 'POST' && path === PATHS.usersPhone:
        return await sendPhoneVerification(event);

      case method === 'POST' && path === PATHS.usersPhoneVerify:
        return await verifyPhone(event);

      // Share with connections endpoints
      case method === 'POST' && /\/journalLambdafunc\/entry\/\d+\/share-with$/.test(path):
        event.pathParameters = { id: path.split('/')[3] };
        return await shareEntryWithConnections(event, conn);

      case method === 'GET' && path === PATHS.entriesSharedWithMe:
        return await getEntriesSharedWithMe(event, conn);

      case method === 'PUT' && /\/journalLambdafunc\/entry-share\/\d+\/read$/.test(path):
        event.pathParameters = { id: path.split('/')[3] };
        return await markSharedEntryRead(event, conn);

      // Streaks endpoints
      case method === 'GET' && path === PATHS.streaksMe:
        return await getMyStreak(event, conn);

      case method === 'GET' && path === PATHS.streaksFriends:
        return await getFriendsStreaks(event, conn);

      // Activity Feed endpoints
      case method === 'GET' && path === PATHS.feed:
        return await getFeed(event, conn);

      // Reactions endpoints
      case method === 'POST' && /\/journalLambdafunc\/entry\/\d+\/react$/.test(path):
        event.pathParameters = { id: path.split('/')[3] };
        return await addReaction(event, conn);

      case method === 'DELETE' && /\/journalLambdafunc\/entry\/\d+\/react\//.test(path):
        const reactParts = path.split('/');
        event.pathParameters = { id: reactParts[3], emoji: reactParts[5] };
        return await removeReaction(event, conn);

      case method === 'GET' && /\/journalLambdafunc\/entry\/\d+\/reactions$/.test(path):
        event.pathParameters = { id: path.split('/')[3] };
        return await getReactions(event, conn);

      // Comments endpoints
      case method === 'POST' && /\/journalLambdafunc\/entry\/\d+\/comment$/.test(path):
        event.pathParameters = { id: path.split('/')[3] };
        return await addComment(event, conn);

      case method === 'GET' && /\/journalLambdafunc\/entry\/\d+\/comments$/.test(path):
        event.pathParameters = { id: path.split('/')[3] };
        return await getComments(event, conn);

      case method === 'DELETE' && /\/journalLambdafunc\/comment\/\d+$/.test(path):
        event.pathParameters = { id: path.split('/').pop() };
        return await deleteComment(event, conn);

      // Shared entry view for friends
      case method === 'GET' && /\/journalLambdafunc\/entry\/\d+\/shared-view$/.test(path):
        event.pathParameters = { id: path.split('/')[3] };
        return await getSharedEntryView(event, conn);

      // Accountability Partners endpoints
      case method === 'GET' && path === PATHS.accountability:
        return await getAccountabilityPartners(event, conn);

      case method === 'POST' && path === PATHS.accountabilityRequest:
        return await requestAccountabilityPartner(event, conn);

      case method === 'POST' && /\/journalLambdafunc\/accountability\/\d+\/accept$/.test(path):
        event.pathParameters = { id: path.split('/')[3] };
        return await acceptAccountabilityPartner(event, conn);

      case method === 'DELETE' && /\/journalLambdafunc\/accountability\/\d+$/.test(path):
        event.pathParameters = { id: path.split('/').pop() };
        return await endAccountabilityPartnership(event, conn);

      // Trips
      case method === 'GET' && path === PATHS.trips:
        return await getTrips(event, conn);

      case method === 'POST' && path === PATHS.trip:
        return await createTrip(event, conn);

      case method === 'PUT' && path.startsWith(PATHS.trip + '/'):
        event.pathParameters = { id: path.split('/').pop() };
        return await updateTrip(event, conn);

      case method === 'DELETE' && path.startsWith(PATHS.trip + '/') && !path.includes('/entries') && !path.includes('/share'):
        event.pathParameters = { id: path.split('/').pop() };
        return await deleteTrip(event, conn);

      case method === 'GET' && /\/journalLambdafunc\/trip\/\d+\/entries$/.test(path):
        event.pathParameters = { id: path.split('/')[3] };
        return await getTripEntries(event, conn);

      case method === 'POST' && /\/journalLambdafunc\/trip\/\d+\/share$/.test(path):
        event.pathParameters = { id: path.split('/')[3] };
        return await shareTripWithUser(event, conn);

      case method === 'DELETE' && /\/journalLambdafunc\/trip\/\d+\/share\/\d+$/.test(path):
        event.pathParameters = {
          tripId: path.split('/')[3],
          shareId: path.split('/')[5]
        };
        return await removeTripShare(event, conn);

      case method === 'GET' && path === PATHS.tripsSharedWithMe:
        return await getTripsSharedWithMe(event, conn);

      // Account deletion
      case method === 'DELETE' && path === PATHS.account:
        return await deleteAccount(event, conn);

      // Not found
      default:
        return errorResponse(404, `Route not found: ${method} ${path}`);
    }
  } catch (error) {
    console.error('Handler error:', error);
    return errorResponse(500, 'Internal server error');
  } finally {
    if (conn) {
      await conn.end();
    }
  }
};
