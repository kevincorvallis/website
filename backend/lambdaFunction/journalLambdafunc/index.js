const mysql = require('mysql2/promise');
const AWS = require('aws-sdk');
const admin = require('firebase-admin');

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

// Initialize Firebase Admin (only once)
let firebaseInitialized = false;
function initFirebase() {
  if (!firebaseInitialized && process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      firebaseInitialized = true;
    } catch (e) {
      console.log('Firebase init skipped (no service account):', e.message);
    }
  }
}

// ============================================
// DATABASE CONNECTION
// ============================================
async function getConnection() {
  const signer = new AWS.RDS.Signer({
    region: process.env.AWS_REGION || 'us-west-1',
    hostname: process.env.RDS_HOSTNAME || 'journalproxy.proxy-cwzjhkgs6o1v.us-west-1.rds.amazonaws.com',
    port: 3306,
    username: process.env.RDS_USERNAME || 'klee'
  });

  const token = signer.getAuthToken({
    username: process.env.RDS_USERNAME || 'klee'
  });

  return mysql.createConnection({
    host: process.env.RDS_HOSTNAME || 'journalproxy.proxy-cwzjhkgs6o1v.us-west-1.rds.amazonaws.com',
    user: process.env.RDS_USERNAME || 'klee',
    database: mysqlDatabase,
    password: token,
    ssl: { rejectUnauthorized: false },
    authPlugins: {
      mysql_clear_password: () => () => Buffer.from(token + '\0')
    }
  });
}

// ============================================
// AUTHENTICATION
// ============================================
async function verifyFirebaseToken(event) {
  const authHeader = event.headers?.Authorization || event.headers?.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.split('Bearer ')[1];

  try {
    initFirebase();
    if (firebaseInitialized) {
      const decoded = await admin.auth().verifyIdToken(token);
      return decoded.uid;
    }
  } catch (e) {
    console.error('Token verification failed:', e.message);
  }

  return null;
}

// For development/testing - get UID from query param if no valid token
function getFirebaseUid(event) {
  // Try token first
  // In production, always require token verification
  // For now, allow query param for testing
  return event.queryStringParameters?.firebase_uid || null;
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
  const firebase_uid = getFirebaseUid(event);
  if (!firebase_uid) {
    return errorResponse(401, 'Missing firebase_uid');
  }

  const since = event.queryStringParameters?.since;

  try {
    let sql = `
      SELECT entry_id, firebase_uid, date, title, text, prompt_id, client_id,
             created_at, updated_at, is_deleted
      FROM journal_entries
      WHERE firebase_uid = ? AND is_deleted = 0
    `;
    const params = [firebase_uid];

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
  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return errorResponse(400, 'Invalid JSON body');
  }

  const { firebase_uid, title, text, date, prompt_id, client_id } = body;

  if (!firebase_uid || !title || !text) {
    return errorResponse(400, 'Missing required fields: firebase_uid, title, text');
  }

  try {
    const sql = `
      INSERT INTO journal_entries (firebase_uid, date, title, text, prompt_id, client_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    const entryDate = date ? new Date(date) : new Date();
    const [result] = await conn.execute(sql, [
      firebase_uid,
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
  const entryId = event.pathParameters?.id;
  if (!entryId) {
    return errorResponse(400, 'Missing entry ID');
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return errorResponse(400, 'Invalid JSON body');
  }

  const { firebase_uid, title, text } = body;

  if (!firebase_uid) {
    return errorResponse(401, 'Missing firebase_uid');
  }

  try {
    // Verify ownership
    const [existing] = await conn.execute(
      'SELECT * FROM journal_entries WHERE entry_id = ? AND firebase_uid = ?',
      [entryId, firebase_uid]
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

    params.push(entryId, firebase_uid);

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
  const entryId = event.pathParameters?.id;
  const firebase_uid = getFirebaseUid(event);

  if (!entryId) {
    return errorResponse(400, 'Missing entry ID');
  }
  if (!firebase_uid) {
    return errorResponse(401, 'Missing firebase_uid');
  }

  try {
    // Verify ownership and soft delete
    const [result] = await conn.execute(
      'UPDATE journal_entries SET is_deleted = 1 WHERE entry_id = ? AND firebase_uid = ?',
      [entryId, firebase_uid]
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
  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return errorResponse(400, 'Invalid JSON body');
  }

  const { firebase_uid, entries = [], lastSyncTime = 0 } = body;

  if (!firebase_uid) {
    return errorResponse(401, 'Missing firebase_uid');
  }

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
            [firebase_uid, entry.client_id]
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
          [firebase_uid, new Date(entry.date), entry.title, entry.text, entry.prompt_id || null, entry.client_id || null]
        );
        results.created.push({ client_id: entry.client_id, entry_id: result.insertId });

      } else if (entry.action === 'update' && entry.entry_id) {
        await conn.execute(
          'UPDATE journal_entries SET title = ?, text = ? WHERE entry_id = ? AND firebase_uid = ?',
          [entry.title, entry.text, entry.entry_id, firebase_uid]
        );
        results.updated.push({ entry_id: entry.entry_id });

      } else if (entry.action === 'delete' && entry.entry_id) {
        await conn.execute(
          'UPDATE journal_entries SET is_deleted = 1 WHERE entry_id = ? AND firebase_uid = ?',
          [entry.entry_id, firebase_uid]
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
    const params = [firebase_uid];

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
      syncTime: Date.now()
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
  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return errorResponse(400, 'Invalid JSON body');
  }

  const { prompt, firebase_uid } = body;

  if (!prompt) {
    return errorResponse(400, 'Missing prompt text');
  }

  try {
    const [result] = await conn.execute(
      'INSERT INTO prompts (prompt, firebase_uid) VALUES (?, ?)',
      [prompt, firebase_uid || null]
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
