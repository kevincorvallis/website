const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const crypto = require('crypto');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const { CognitoIdentityProviderClient, AdminDeleteUserCommand } = require('@aws-sdk/client-cognito-identity-provider');

// Initialize SNS client for SMS
const snsClient = new SNSClient({ region: 'us-west-1' });

// Initialize Cognito client for account deletion
const cognitoClient = new CognitoIdentityProviderClient({ region: 'us-west-1' });

// ============================================
// CONFIGURATION
// ============================================
const mysqlDatabase = 'journaldb';

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
  // Account management
  account: '/journalLambdafunc/account'
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
// DATABASE CONNECTION
// ============================================
async function getConnection() {
  return mysql.createConnection({
    host: process.env.RDS_HOSTNAME,
    user: process.env.RDS_USERNAME,
    password: process.env.RDS_PASSWORD,
    database: mysqlDatabase
  });
}

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
// ENTRY HANDLERS
// ============================================

// GET /entries - List all entries for a user
async function getEntries(event, conn) {
  const uid = await getAuthenticatedUid(event);
  if (!uid) {
    return errorResponse(401, 'Authentication required');
  }

  const since = event.queryStringParameters?.since;

  try {
    let sql = `
      SELECT entry_id, firebase_uid, date, title, text, prompt_id, client_id,
             created_at, updated_at, is_deleted
      FROM journal_entries
      WHERE firebase_uid = ? AND is_deleted = 0
    `;
    const params = [uid];

    if (since) {
      sql += ' AND updated_at > ?';
      params.push(new Date(parseInt(since)));
    }

    sql += ' ORDER BY date ASC';

    const [rows] = await conn.execute(sql, params);

    return buildResponse(200, {
      entries: rows,
      count: rows.length,
      syncTime: Date.now()
    });
  } catch (error) {
    console.error('Error getting entries:', error);
    return errorResponse(500, 'Failed to get entries');
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

  const { title, text, date, prompt_id, client_id } = body;

  // Validate input
  const validation = validateEntryInput(title, text);
  if (!validation.valid) {
    return errorResponse(400, validation.error);
  }

  // Validate date format
  if (!isValidDate(date)) {
    return errorResponse(400, 'Invalid date format');
  }

  try {
    const sql = `
      INSERT INTO journal_entries (firebase_uid, date, title, text, prompt_id, client_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    const entryDate = date ? new Date(date) : new Date();
    const [result] = await conn.execute(sql, [
      uid,
      entryDate,
      title,
      text,
      prompt_id || null,
      client_id || null
    ]);

    // Fetch the created entry
    const [rows] = await conn.execute(
      'SELECT * FROM journal_entries WHERE entry_id = ?',
      [result.insertId]
    );

    return buildResponse(201, {
      message: 'Entry created',
      entry: rows[0]
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

  const { title, text } = body;

  // Validate input if provided
  if (title !== undefined && (typeof title !== 'string' || title.length > MAX_TITLE_LENGTH)) {
    return errorResponse(400, `Title must be a string under ${MAX_TITLE_LENGTH} characters`);
  }
  if (text !== undefined && (typeof text !== 'string' || text.length > MAX_TEXT_LENGTH)) {
    return errorResponse(400, `Text must be a string under ${MAX_TEXT_LENGTH} characters`);
  }

  try {
    // Verify ownership
    const [existing] = await conn.execute(
      'SELECT * FROM journal_entries WHERE entry_id = ? AND firebase_uid = ?',
      [entryId, uid]
    );

    if (existing.length === 0) {
      return errorResponse(404, 'Entry not found or not authorized');
    }

    // Update
    const updates = [];
    const params = [];

    if (title !== undefined) {
      updates.push('title = ?');
      params.push(title);
    }
    if (text !== undefined) {
      updates.push('text = ?');
      params.push(text);
    }

    if (updates.length === 0) {
      return errorResponse(400, 'No fields to update');
    }

    params.push(entryId, uid);

    await conn.execute(
      `UPDATE journal_entries SET ${updates.join(', ')} WHERE entry_id = ? AND firebase_uid = ?`,
      params
    );

    // Fetch updated entry
    const [rows] = await conn.execute(
      'SELECT * FROM journal_entries WHERE entry_id = ?',
      [entryId]
    );

    return buildResponse(200, {
      message: 'Entry updated',
      entry: rows[0]
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
    // Verify ownership and soft delete
    const [result] = await conn.execute(
      'UPDATE journal_entries SET is_deleted = 1 WHERE entry_id = ? AND firebase_uid = ?',
      [entryId, uid]
    );

    if (result.affectedRows === 0) {
      return errorResponse(404, 'Entry not found or not authorized');
    }

    return buildResponse(200, {
      message: 'Entry deleted',
      entry_id: parseInt(entryId)
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

    // Process incoming entries
    for (const entry of entries) {
      if (entry.action === 'create') {
        // Check if client_id already exists (avoid duplicates)
        if (entry.client_id) {
          const [existing] = await conn.execute(
            'SELECT entry_id FROM journal_entries WHERE firebase_uid = ? AND client_id = ?',
            [uid, entry.client_id]
          );
          if (existing.length > 0) {
            results.updated.push({ client_id: entry.client_id, entry_id: existing[0].entry_id });
            continue;
          }
        }

        // Create new entry
        const [result] = await conn.execute(
          `INSERT INTO journal_entries (firebase_uid, date, title, text, prompt_id, client_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [uid, new Date(entry.date), entry.title, entry.text, entry.prompt_id || null, entry.client_id || null]
        );
        results.created.push({ client_id: entry.client_id, entry_id: result.insertId });

      } else if (entry.action === 'update' && entry.entry_id) {
        await conn.execute(
          'UPDATE journal_entries SET title = ?, text = ? WHERE entry_id = ? AND firebase_uid = ?',
          [entry.title, entry.text, entry.entry_id, uid]
        );
        results.updated.push({ entry_id: entry.entry_id });

      } else if (entry.action === 'delete' && entry.entry_id) {
        await conn.execute(
          'UPDATE journal_entries SET is_deleted = 1 WHERE entry_id = ? AND firebase_uid = ?',
          [entry.entry_id, uid]
        );
      }
    }

    // Get all entries updated since lastSyncTime
    let sql = `
      SELECT entry_id, firebase_uid, date, title, text, prompt_id, client_id,
             created_at, updated_at, is_deleted
      FROM journal_entries
      WHERE firebase_uid = ?
    `;
    const params = [uid];

    if (lastSyncTime > 0) {
      sql += ' AND updated_at > ?';
      params.push(new Date(lastSyncTime));
    }

    const [serverEntries] = await conn.execute(sql, params);

    return buildResponse(200, {
      message: 'Sync complete',
      results,
      entries: serverEntries.filter(e => !e.is_deleted),
      deletedIds: serverEntries.filter(e => e.is_deleted).map(e => e.entry_id),
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
async function getPrompt(conn) {
  try {
    const [rows] = await conn.execute(
      'SELECT prompt_id, prompt FROM prompts ORDER BY RAND() LIMIT 1'
    );

    if (rows.length === 0) {
      return buildResponse(200, { prompt: 'What is on your mind today?' });
    }

    return buildResponse(200, rows[0]);
  } catch (error) {
    console.error('Error getting prompt:', error);
    return errorResponse(500, 'Failed to get prompt');
  }
}

// POST /prompt - Add a new prompt
async function addPrompt(event, conn) {
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
    const [result] = await conn.execute(
      'INSERT INTO prompts (prompt, firebase_uid) VALUES (?, ?)',
      [prompt, uid]
    );

    return buildResponse(201, {
      message: 'Prompt added',
      prompt_id: result.insertId
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
    const [rows] = await conn.execute(
      `SELECT user_id, firebase_uid, username, email
       FROM users
       WHERE firebase_uid != ?
         AND (username LIKE ? OR email LIKE ?)
       LIMIT 20`,
      [uid, `%${query}%`, `%${query}%`]
    );

    // Return sanitized results (no sensitive data)
    const users = rows.map(u => ({
      user_id: u.user_id,
      uid: u.firebase_uid,
      displayName: u.username || u.email?.split('@')[0] || 'User'
    }));

    return buildResponse(200, { users });
  } catch (error) {
    console.error('Error searching users:', error);
    return errorResponse(500, 'Failed to search users');
  }
}

// GET /users/profile - Get current user's profile
async function getUserProfile(event, conn) {
  const uid = await getAuthenticatedUid(event);
  if (!uid) {
    return errorResponse(401, 'Authentication required');
  }

  try {
    const [rows] = await conn.execute(
      'SELECT user_id, firebase_uid, username, email, first_name, last_name, created_at FROM users WHERE firebase_uid = ?',
      [uid]
    );

    if (rows.length === 0) {
      return buildResponse(200, { profile: null });
    }

    return buildResponse(200, { profile: rows[0] });
  } catch (error) {
    console.error('Error getting profile:', error);
    return errorResponse(500, 'Failed to get profile');
  }
}

// PUT /users/profile - Update display name
async function updateUserProfile(event, conn) {
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

  const { displayName, email } = body;

  if (displayName && (typeof displayName !== 'string' || displayName.length > 100)) {
    return errorResponse(400, 'Display name must be under 100 characters');
  }

  try {
    await ensureUser(conn, uid, email, displayName);

    const [rows] = await conn.execute(
      'SELECT user_id, firebase_uid, username, email FROM users WHERE firebase_uid = ?',
      [uid]
    );

    return buildResponse(200, {
      message: 'Profile updated',
      profile: rows[0]
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
    const [targetUser] = await conn.execute(
      'SELECT firebase_uid FROM users WHERE firebase_uid = ?',
      [targetUid]
    );

    if (targetUser.length === 0) {
      return errorResponse(404, 'User not found');
    }

    // Check for existing connection (either direction)
    const [existing] = await conn.execute(
      `SELECT connection_id, status, requester_uid FROM connections
       WHERE (requester_uid = ? AND target_uid = ?)
          OR (requester_uid = ? AND target_uid = ?)`,
      [uid, targetUid, targetUid, uid]
    );

    if (existing.length > 0) {
      const existingConn = existing[0];
      if (existingConn.status === 'accepted') {
        return errorResponse(400, 'Already connected');
      }
      if (existingConn.status === 'pending') {
        // If they sent us a request, auto-accept
        if (existingConn.requester_uid === targetUid) {
          await conn.execute(
            'UPDATE connections SET status = "accepted" WHERE connection_id = ?',
            [existingConn.connection_id]
          );
          return buildResponse(200, { message: 'Connection accepted', status: 'accepted' });
        }
        return errorResponse(400, 'Connection request already pending');
      }
      if (existingConn.status === 'blocked') {
        return errorResponse(403, 'Cannot connect with this user');
      }
    }

    // Create new connection request
    const [result] = await conn.execute(
      'INSERT INTO connections (requester_uid, target_uid, status) VALUES (?, ?, "pending")',
      [uid, targetUid]
    );

    return buildResponse(201, {
      message: 'Connection request sent',
      connection_id: result.insertId
    });
  } catch (error) {
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
    const [rows] = await conn.execute(
      `SELECT c.connection_id, c.created_at,
              CASE WHEN c.requester_uid = ? THEN c.target_uid ELSE c.requester_uid END as connected_uid
       FROM connections c
       WHERE (c.requester_uid = ? OR c.target_uid = ?) AND c.status = 'accepted'`,
      [uid, uid, uid]
    );

    // Get user details for each connection
    const connections = [];
    for (const row of rows) {
      const [userRows] = await conn.execute(
        'SELECT user_id, username, email FROM users WHERE firebase_uid = ?',
        [row.connected_uid]
      );
      if (userRows.length > 0) {
        connections.push({
          connection_id: row.connection_id,
          uid: row.connected_uid,
          displayName: userRows[0].username || userRows[0].email?.split('@')[0] || 'User',
          connected_at: row.created_at
        });
      }
    }

    return buildResponse(200, { connections });
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
    const [rows] = await conn.execute(
      `SELECT c.connection_id, c.requester_uid, c.created_at
       FROM connections c
       WHERE c.target_uid = ? AND c.status = 'pending'
       ORDER BY c.created_at DESC`,
      [uid]
    );

    // Get user details for each requester
    const pending = [];
    for (const row of rows) {
      const [userRows] = await conn.execute(
        'SELECT user_id, username, email FROM users WHERE firebase_uid = ?',
        [row.requester_uid]
      );
      if (userRows.length > 0) {
        pending.push({
          connection_id: row.connection_id,
          uid: row.requester_uid,
          displayName: userRows[0].username || userRows[0].email?.split('@')[0] || 'User',
          requested_at: row.created_at
        });
      }
    }

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
    // Verify this is a pending request to the current user
    const [rows] = await conn.execute(
      'SELECT * FROM connections WHERE connection_id = ? AND target_uid = ? AND status = "pending"',
      [connectionId, uid]
    );

    if (rows.length === 0) {
      return errorResponse(404, 'Connection request not found');
    }

    await conn.execute(
      'UPDATE connections SET status = "accepted" WHERE connection_id = ?',
      [connectionId]
    );

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
    const [rows] = await conn.execute(
      'SELECT * FROM connections WHERE connection_id = ? AND target_uid = ? AND status = "pending"',
      [connectionId, uid]
    );

    if (rows.length === 0) {
      return errorResponse(404, 'Connection request not found');
    }

    await conn.execute(
      'UPDATE connections SET status = "declined" WHERE connection_id = ?',
      [connectionId]
    );

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
    // Verify user is part of this connection
    const [result] = await conn.execute(
      'DELETE FROM connections WHERE connection_id = ? AND (requester_uid = ? OR target_uid = ?)',
      [connectionId, uid, uid]
    );

    if (result.affectedRows === 0) {
      return errorResponse(404, 'Connection not found');
    }

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
    // Check if user already has an invite link
    const [existing] = await conn.execute(
      'SELECT invite_token FROM invite_links WHERE creator_uid = ?',
      [uid]
    );

    if (existing.length > 0) {
      return buildResponse(200, {
        inviteToken: existing[0].invite_token,
        inviteUrl: `https://klee.page/journal/?invite=${existing[0].invite_token}`
      });
    }

    // Generate new token (256-bit entropy, URL-safe)
    const token = crypto.randomBytes(32).toString('base64url');

    await conn.execute(
      'INSERT INTO invite_links (invite_token, creator_uid) VALUES (?, ?)',
      [token, uid]
    );

    return buildResponse(201, {
      inviteToken: token,
      inviteUrl: `https://klee.page/journal/?invite=${token}`
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
    const [rows] = await conn.execute(
      `SELECT i.creator_uid, u.username, u.email
       FROM invite_links i
       JOIN users u ON i.creator_uid = u.firebase_uid
       WHERE i.invite_token = ?`,
      [token]
    );

    if (rows.length === 0) {
      return errorResponse(404, 'Invalid invite link');
    }

    const creator = rows[0];
    return buildResponse(200, {
      valid: true,
      creatorName: creator.username || creator.email?.split('@')[0] || 'A friend'
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
    // Get invite link and creator
    const [inviteRows] = await conn.execute(
      'SELECT creator_uid FROM invite_links WHERE invite_token = ?',
      [token]
    );

    if (inviteRows.length === 0) {
      return errorResponse(404, 'Invalid invite link');
    }

    const creatorUid = inviteRows[0].creator_uid;

    // Cannot connect with yourself
    if (creatorUid === uid) {
      return errorResponse(400, 'Cannot use your own invite link');
    }

    // Check for existing connection (either direction)
    const [existing] = await conn.execute(
      `SELECT connection_id, status FROM connections
       WHERE (requester_uid = ? AND target_uid = ?)
          OR (requester_uid = ? AND target_uid = ?)`,
      [uid, creatorUid, creatorUid, uid]
    );

    if (existing.length > 0) {
      if (existing[0].status === 'accepted') {
        return buildResponse(200, { message: 'Already connected', alreadyConnected: true });
      }
      if (existing[0].status === 'pending') {
        // Accept the pending request
        await conn.execute(
          'UPDATE connections SET status = "accepted" WHERE connection_id = ?',
          [existing[0].connection_id]
        );
        return buildResponse(200, { message: 'Connection accepted', connected: true });
      }
    }

    // Create new accepted connection (auto-accept since using invite link)
    await conn.execute(
      'INSERT INTO connections (requester_uid, target_uid, status) VALUES (?, ?, "accepted")',
      [creatorUid, uid]
    );

    return buildResponse(201, { message: 'Connected successfully', connected: true });
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

// POST /users/phone - Save phone number and send verification code
async function sendPhoneVerification(event, conn) {
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
    await conn.execute(
      `UPDATE users
       SET phone_number = ?,
           phone_verification_code = ?,
           phone_verification_expires = ?,
           phone_verified = 0
       WHERE firebase_uid = ?`,
      [normalizedPhone, verificationCode, expiresAt, uid]
    );

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
async function verifyPhone(event, conn) {
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
    // Check verification code
    const [rows] = await conn.execute(
      `SELECT phone_verification_code, phone_verification_expires, phone_number
       FROM users WHERE firebase_uid = ?`,
      [uid]
    );

    if (rows.length === 0) {
      return errorResponse(404, 'User not found');
    }

    const user = rows[0];

    if (!user.phone_verification_code) {
      return errorResponse(400, 'No verification pending');
    }

    if (new Date() > new Date(user.phone_verification_expires)) {
      return errorResponse(400, 'Verification code expired');
    }

    if (user.phone_verification_code !== code) {
      return errorResponse(400, 'Invalid verification code');
    }

    // Mark phone as verified
    await conn.execute(
      `UPDATE users
       SET phone_verified = 1,
           phone_verification_code = NULL,
           phone_verification_expires = NULL
       WHERE firebase_uid = ?`,
      [uid]
    );

    return buildResponse(200, {
      message: 'Phone verified successfully',
      phoneNumber: user.phone_number
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

// GET /users/phone - Get current phone verification status
async function getPhoneStatus(event, conn) {
  const uid = await getAuthenticatedUid(event);
  if (!uid) {
    return errorResponse(401, 'Authentication required');
  }

  try {
    const [rows] = await conn.execute(
      'SELECT phone_number, phone_verified FROM users WHERE firebase_uid = ?',
      [uid]
    );

    if (rows.length === 0) {
      return buildResponse(200, { phoneNumber: null, verified: false });
    }

    const user = rows[0];
    return buildResponse(200, {
      phoneNumber: user.phone_number ? user.phone_number.slice(0, -4) + '****' : null,
      verified: !!user.phone_verified
    });
  } catch (error) {
    console.error('Error getting phone status:', error);
    return errorResponse(500, 'Failed to get phone status');
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
    "ALTER TABLE users ADD COLUMN phone_verification_expires DATETIME"
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

  let conn;
  try {
    conn = await getConnection();

    const method = event.httpMethod;
    const path = event.path;

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
        return await getPrompt(conn);

      case method === 'POST' && path === PATHS.prompt:
        return await addPrompt(event, conn);

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

      // User endpoints
      case method === 'GET' && path === PATHS.usersSearch:
        return await searchUsers(event, conn);

      case method === 'GET' && path === PATHS.usersProfile:
        return await getUserProfile(event, conn);

      case method === 'PUT' && path === PATHS.usersProfile:
        return await updateUserProfile(event, conn);

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
        return await getPhoneStatus(event, conn);

      case method === 'POST' && path === PATHS.usersPhone:
        return await sendPhoneVerification(event, conn);

      case method === 'POST' && path === PATHS.usersPhoneVerify:
        return await verifyPhone(event, conn);

      // Share with connections endpoints
      case method === 'POST' && /\/journalLambdafunc\/entry\/\d+\/share-with$/.test(path):
        event.pathParameters = { id: path.split('/')[3] };
        return await shareEntryWithConnections(event, conn);

      case method === 'GET' && path === PATHS.entriesSharedWithMe:
        return await getEntriesSharedWithMe(event, conn);

      case method === 'PUT' && /\/journalLambdafunc\/entry-share\/\d+\/read$/.test(path):
        event.pathParameters = { id: path.split('/')[3] };
        return await markSharedEntryRead(event, conn);

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
