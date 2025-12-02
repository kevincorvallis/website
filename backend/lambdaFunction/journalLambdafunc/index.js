const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

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
  user: '/journalLambdafunc/user'
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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_firebase_uid (firebase_uid)
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
