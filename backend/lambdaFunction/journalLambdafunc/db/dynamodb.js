/**
 * DynamoDB Data Access Layer
 *
 * Provides type-safe, high-level operations for all entities in the Day by Day Journal app
 *
 * Tables:
 * - DayByDay-Main: Users, Connections, Accountability Partners, Invite Links
 * - DayByDay-Content: Entries, Trips, Shares, Prompts
 * - DayByDay-Social: Reactions, Comments, Aggregate Counts
 * - DayByDay-Feed: Activity Feed (populated by Streams processor)
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  BatchGetCommand,
  BatchWriteCommand,
  ScanCommand
} = require('@aws-sdk/lib-dynamodb');

const { ulid } = require('../utils/ulid');
const cache = require('./cache');

// Initialize DynamoDB client
const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-west-1'
});

const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertEmptyValues: false
  }
});

// Table names
const TABLES = {
  MAIN: 'DayByDay-Main',
  CONTENT: 'DayByDay-Content',
  SOCIAL: 'DayByDay-Social',
  FEED: 'DayByDay-Feed'
};

// ============================================
// USER OPERATIONS
// ============================================

/**
 * Create a new user profile
 * @param {object} userData - User profile data
 * @returns {Promise<object>} Created user
 */
async function createUser(userData) {
  const { uid, username, email, firstName, lastName, phoneNumber } = userData;
  const now = new Date().toISOString();

  const user = {
    PK: `USER#${uid}`,
    SK: 'PROFILE',
    GSI1PK: username ? `USERNAME#${username.toLowerCase()}` : undefined,
    GSI2PK: email ? `EMAIL#${email.toLowerCase()}` : undefined,
    entityType: 'USER',
    uid,
    username,
    email,
    firstName,
    lastName,
    phoneNumber,
    phoneVerified: false,
    createdAt: now,
    updatedAt: now
  };

  await docClient.send(new PutCommand({
    TableName: TABLES.MAIN,
    Item: user,
    ConditionExpression: 'attribute_not_exists(PK)'
  }));

  // Initialize streak record
  await initializeStreak(uid);

  return user;
}

/**
 * Get user by UID
 * @param {string} uid - User UID
 * @returns {Promise<object|null>} User profile or null
 */
async function getUserByUid(uid) {
  return cache.getOrCompute(
    `user:${uid}`,
    async () => {
      const result = await docClient.send(new GetCommand({
        TableName: TABLES.MAIN,
        Key: { PK: `USER#${uid}`, SK: 'PROFILE' }
      }));

      return result.Item || null;
    },
    cache.TTL.USER_PROFILE
  );
}

/**
 * Get user by username
 * @param {string} username - Username
 * @returns {Promise<object|null>} User profile or null
 */
async function getUserByUsername(username) {
  const result = await docClient.send(new QueryCommand({
    TableName: TABLES.MAIN,
    IndexName: 'GSI1-ByUsername',
    KeyConditionExpression: 'GSI1PK = :username',
    ExpressionAttributeValues: {
      ':username': `USERNAME#${username.toLowerCase()}`
    },
    Limit: 1
  }));

  return result.Items && result.Items.length > 0 ? result.Items[0] : null;
}

/**
 * Get user by email
 * @param {string} email - Email address
 * @returns {Promise<object|null>} User profile or null
 */
async function getUserByEmail(email) {
  const result = await docClient.send(new QueryCommand({
    TableName: TABLES.MAIN,
    IndexName: 'GSI2-ByEmail',
    KeyConditionExpression: 'GSI2PK = :email',
    ExpressionAttributeValues: {
      ':email': `EMAIL#${email.toLowerCase()}`
    },
    Limit: 1
  }));

  return result.Items && result.Items.length > 0 ? result.Items[0] : null;
}

/**
 * Update user profile
 * @param {string} uid - User UID
 * @param {object} updates - Fields to update
 * @returns {Promise<object>} Updated user
 */
async function updateUserProfile(uid, updates) {
  const { username, email, firstName, lastName, phoneNumber, phoneVerified, phoneVerificationCode, phoneVerificationExpires } = updates;

  const updateExpressions = [];
  const attributeNames = {};
  const attributeValues = {};

  if (username !== undefined) {
    updateExpressions.push('#username = :username');
    updateExpressions.push('GSI1PK = :gsi1pk');
    attributeNames['#username'] = 'username';
    attributeValues[':username'] = username;
    attributeValues[':gsi1pk'] = username ? `USERNAME#${username.toLowerCase()}` : null;
  }

  if (email !== undefined) {
    updateExpressions.push('#email = :email');
    updateExpressions.push('GSI2PK = :gsi2pk');
    attributeNames['#email'] = 'email';
    attributeValues[':email'] = email;
    attributeValues[':gsi2pk'] = email ? `EMAIL#${email.toLowerCase()}` : null;
  }

  if (firstName !== undefined) {
    updateExpressions.push('firstName = :firstName');
    attributeValues[':firstName'] = firstName;
  }

  if (lastName !== undefined) {
    updateExpressions.push('lastName = :lastName');
    attributeValues[':lastName'] = lastName;
  }

  if (phoneNumber !== undefined) {
    updateExpressions.push('phoneNumber = :phoneNumber');
    attributeValues[':phoneNumber'] = phoneNumber;
  }

  if (phoneVerified !== undefined) {
    updateExpressions.push('phoneVerified = :phoneVerified');
    attributeValues[':phoneVerified'] = phoneVerified;
  }

  if (phoneVerificationCode !== undefined) {
    updateExpressions.push('phoneVerificationCode = :phoneVerificationCode');
    attributeValues[':phoneVerificationCode'] = phoneVerificationCode;
  }

  if (phoneVerificationExpires !== undefined) {
    updateExpressions.push('phoneVerificationExpires = :phoneVerificationExpires');
    attributeValues[':phoneVerificationExpires'] = phoneVerificationExpires;
  }

  updateExpressions.push('updatedAt = :updatedAt');
  attributeValues[':updatedAt'] = new Date().toISOString();

  const result = await docClient.send(new UpdateCommand({
    TableName: TABLES.MAIN,
    Key: { PK: `USER#${uid}`, SK: 'PROFILE' },
    UpdateExpression: 'SET ' + updateExpressions.join(', '),
    ExpressionAttributeNames: Object.keys(attributeNames).length > 0 ? attributeNames : undefined,
    ExpressionAttributeValues: attributeValues,
    ReturnValues: 'ALL_NEW'
  }));

  // Invalidate cache
  await cache.invalidateUser(uid);

  return result.Attributes;
}

/**
 * Search users by username or email
 * @param {string} query - Search query
 * @param {number} limit - Max results
 * @returns {Promise<array>} Matching users
 */
async function searchUsers(query, limit = 20) {
  const lowerQuery = query.toLowerCase();

  // Search by username
  const usernameResults = await docClient.send(new QueryCommand({
    TableName: TABLES.MAIN,
    IndexName: 'GSI1-ByUsername',
    KeyConditionExpression: 'begins_with(GSI1PK, :prefix)',
    ExpressionAttributeValues: {
      ':prefix': `USERNAME#${lowerQuery}`
    },
    Limit: limit
  }));

  // Search by email
  const emailResults = await docClient.send(new QueryCommand({
    TableName: TABLES.MAIN,
    IndexName: 'GSI2-ByEmail',
    KeyConditionExpression: 'begins_with(GSI2PK, :prefix)',
    ExpressionAttributeValues: {
      ':prefix': `EMAIL#${lowerQuery}`
    },
    Limit: limit
  }));

  // Combine and deduplicate
  const combinedMap = new Map();

  for (const item of usernameResults.Items || []) {
    combinedMap.set(item.uid, item);
  }

  for (const item of emailResults.Items || []) {
    combinedMap.set(item.uid, item);
  }

  return Array.from(combinedMap.values()).slice(0, limit);
}

/**
 * Discover users (paginated)
 * @param {number} limit - Results per page
 * @param {string} exclusiveStartKey - Pagination token
 * @param {string} excludeUid - UID to exclude from results
 * @returns {Promise<object>} {users, lastEvaluatedKey}
 */
async function discoverUsers(limit = 20, exclusiveStartKey = null, excludeUid = null) {
  const params = {
    TableName: TABLES.MAIN,
    FilterExpression: 'SK = :sk',
    ExpressionAttributeValues: {
      ':sk': 'PROFILE'
    },
    Limit: limit
  };

  if (exclusiveStartKey) {
    params.ExclusiveStartKey = JSON.parse(Buffer.from(exclusiveStartKey, 'base64').toString());
  }

  const result = await docClient.send(new ScanCommand(params));

  let users = result.Items || [];

  // Exclude current user
  if (excludeUid) {
    users = users.filter(u => u.uid !== excludeUid);
  }

  return {
    users,
    lastEvaluatedKey: result.LastEvaluatedKey
      ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
      : null
  };
}

/**
 * Delete user account
 * @param {string} uid - User UID
 */
async function deleteUserAccount(uid) {
  // This is a cascade delete - remove all user data
  // In production, this should use a Step Functions workflow

  // Delete user profile
  await docClient.send(new DeleteCommand({
    TableName: TABLES.MAIN,
    Key: { PK: `USER#${uid}`, SK: 'PROFILE' }
  }));

  // Delete streak
  await docClient.send(new DeleteCommand({
    TableName: TABLES.MAIN,
    Key: { PK: `USER#${uid}`, SK: 'STREAK' }
  }));

  // Note: In production, also delete:
  // - All entries (from Content table)
  // - All connections (from Main table)
  // - All reactions/comments (from Social table)
  // - Feed items (from Feed table)

  await cache.invalidateUser(uid);
}

// ============================================
// ENTRY OPERATIONS
// ============================================

/**
 * Create a new journal entry
 * @param {object} entryData - Entry data
 * @returns {Promise<object>} Created entry
 */
async function createEntry(entryData) {
  const {
    firebaseUid,
    date,
    title,
    text,
    tripId,
    promptId,
    clientId,
    imageUrl,
    latitude,
    longitude,
    locationName
  } = entryData;

  const entryId = ulid();
  const now = new Date().toISOString();

  const entry = {
    PK: `USER#${firebaseUid}`,
    SK: `ENTRY#${date}#${entryId}`,
    GSI3PK: `ENTRY#${entryId}`,
    GSI4PK: tripId ? `TRIP#${tripId}` : undefined,
    GSI4SK: tripId ? `ENTRY#${date}` : undefined,
    GSI5PK: 'ALL_ENTRIES',
    GSI5SK: date,
    entityType: 'ENTRY',
    entryId,
    firebaseUid,
    date,
    title,
    text,
    tripId,
    promptId,
    clientId,
    imageUrl,
    latitude,
    longitude,
    locationName,
    isDeleted: false,
    createdAt: now,
    updatedAt: now
  };

  await docClient.send(new PutCommand({
    TableName: TABLES.CONTENT,
    Item: entry
  }));

  // Update streak
  await updateStreakOnEntry(firebaseUid, date);

  return entry;
}

/**
 * Get entries for a user
 * @param {string} uid - User UID
 * @param {string} startDate - Start date (optional)
 * @param {string} endDate - End date (optional)
 * @param {number} limit - Max results
 * @returns {Promise<array>} Entries
 */
async function getEntries(uid, startDate = null, endDate = null, limit = 50) {
  const params = {
    TableName: TABLES.CONTENT,
    KeyConditionExpression: 'PK = :pk',
    ExpressionAttributeValues: {
      ':pk': `USER#${uid}`,
      ':false': false
    },
    FilterExpression: 'isDeleted = :false',
    ScanIndexForward: false, // Descending order (newest first)
    Limit: limit
  };

  if (startDate && endDate) {
    params.KeyConditionExpression += ' AND SK BETWEEN :start AND :end';
    params.ExpressionAttributeValues[':start'] = `ENTRY#${startDate}`;
    params.ExpressionAttributeValues[':end'] = `ENTRY#${endDate}#ZZZZZZZZZZZZZZZZZZZZZZZZZZ`;
  } else if (startDate) {
    params.KeyConditionExpression += ' AND SK >= :start';
    params.ExpressionAttributeValues[':start'] = `ENTRY#${startDate}`;
  }

  const result = await docClient.send(new QueryCommand(params));

  return result.Items || [];
}

/**
 * Get entry by ID
 * @param {string} entryId - Entry ID
 * @returns {Promise<object|null>} Entry or null
 */
async function getEntryById(entryId) {
  const result = await docClient.send(new QueryCommand({
    TableName: TABLES.CONTENT,
    IndexName: 'GSI3-ByEntryId',
    KeyConditionExpression: 'GSI3PK = :entryId',
    ExpressionAttributeValues: {
      ':entryId': `ENTRY#${entryId}`,
      ':false': false
    },
    FilterExpression: 'isDeleted = :false',
    Limit: 1
  }));

  return result.Items && result.Items.length > 0 ? result.Items[0] : null;
}

/**
 * Update entry
 * @param {string} entryId - Entry ID
 * @param {string} ownerUid - Owner UID (for authorization)
 * @param {object} updates - Fields to update
 * @returns {Promise<object>} Updated entry
 */
async function updateEntry(entryId, ownerUid, updates) {
  // First get the entry to verify ownership and get PK/SK
  const entry = await getEntryById(entryId);

  if (!entry || entry.firebaseUid !== ownerUid) {
    throw new Error('Entry not found or unauthorized');
  }

  const { title, text, imageUrl, latitude, longitude, locationName } = updates;

  const updateExpressions = [];
  const attributeValues = {};

  if (title !== undefined) {
    updateExpressions.push('title = :title');
    attributeValues[':title'] = title;
  }

  if (text !== undefined) {
    updateExpressions.push('#text = :text');
    attributeValues[':text'] = text;
  }

  if (imageUrl !== undefined) {
    updateExpressions.push('imageUrl = :imageUrl');
    attributeValues[':imageUrl'] = imageUrl;
  }

  if (latitude !== undefined) {
    updateExpressions.push('latitude = :latitude');
    attributeValues[':latitude'] = latitude;
  }

  if (longitude !== undefined) {
    updateExpressions.push('longitude = :longitude');
    attributeValues[':longitude'] = longitude;
  }

  if (locationName !== undefined) {
    updateExpressions.push('locationName = :locationName');
    attributeValues[':locationName'] = locationName;
  }

  updateExpressions.push('updatedAt = :updatedAt');
  attributeValues[':updatedAt'] = new Date().toISOString();

  const result = await docClient.send(new UpdateCommand({
    TableName: TABLES.CONTENT,
    Key: { PK: entry.PK, SK: entry.SK },
    UpdateExpression: 'SET ' + updateExpressions.join(', '),
    ExpressionAttributeNames: text !== undefined ? { '#text': 'text' } : undefined,
    ExpressionAttributeValues: attributeValues,
    ReturnValues: 'ALL_NEW'
  }));

  await cache.invalidateEntry(entryId);

  return result.Attributes;
}

/**
 * Delete entry (soft delete)
 * @param {string} entryId - Entry ID
 * @param {string} ownerUid - Owner UID
 */
async function deleteEntry(entryId, ownerUid) {
  const entry = await getEntryById(entryId);

  if (!entry || entry.firebaseUid !== ownerUid) {
    throw new Error('Entry not found or unauthorized');
  }

  await docClient.send(new UpdateCommand({
    TableName: TABLES.CONTENT,
    Key: { PK: entry.PK, SK: entry.SK },
    UpdateExpression: 'SET isDeleted = :true, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':true': true,
      ':updatedAt': new Date().toISOString()
    }
  }));

  await cache.invalidateEntry(entryId);
}

// ============================================
// CONNECTION OPERATIONS
// ============================================

/**
 * Create connection request
 * @param {string} requesterUid - Requester UID
 * @param {string} targetUid - Target UID
 * @returns {Promise<object>} Connection request
 */
async function createConnectionRequest(requesterUid, targetUid) {
  const connectionId = ulid();
  const now = new Date().toISOString();

  // Get user info for denormalization
  const [requester, target] = await Promise.all([
    getUserByUid(requesterUid),
    getUserByUid(targetUid)
  ]);

  const connection = {
    PK: `USER#${requesterUid}`,
    SK: `CONNECTION#${targetUid}`,
    GSI3PK: `USER#${requesterUid}`,
    GSI3SK: `CONNECTION#${connectionId}`,
    entityType: 'CONNECTION',
    connectionId,
    requesterUid,
    targetUid,
    status: 'pending',
    requesterUsername: requester.username,
    requesterFirstName: requester.firstName,
    targetUsername: target.username,
    targetFirstName: target.firstName,
    createdAt: now,
    updatedAt: now
  };

  // Create bidirectional entries
  await docClient.send(new PutCommand({
    TableName: TABLES.MAIN,
    Item: connection
  }));

  // Reverse connection for target user
  await docClient.send(new PutCommand({
    TableName: TABLES.MAIN,
    Item: {
      ...connection,
      PK: `USER#${targetUid}`,
      SK: `CONNECTION#${requesterUid}`,
      GSI3PK: `USER#${targetUid}`,
      isIncoming: true
    }
  }));

  return connection;
}

/**
 * Get connections for a user
 * @param {string} uid - User UID
 * @param {string} status - Filter by status (optional)
 * @returns {Promise<array>} Connections
 */
async function getConnections(uid, status = 'accepted') {
  return cache.getOrCompute(
    `connections:${uid}:${status}`,
    async () => {
      const result = await docClient.send(new QueryCommand({
        TableName: TABLES.MAIN,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        FilterExpression: '#status = :status',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':pk': `USER#${uid}`,
          ':sk': 'CONNECTION#',
          ':status': status
        }
      }));

      return result.Items || [];
    },
    cache.TTL.FRIEND_LIST
  );
}

/**
 * Accept connection request
 * @param {string} requesterUid - Requester UID
 * @param {string} targetUid - Target UID (current user)
 */
async function acceptConnectionRequest(requesterUid, targetUid) {
  const now = new Date().toISOString();

  // Update both directions
  await Promise.all([
    docClient.send(new UpdateCommand({
      TableName: TABLES.MAIN,
      Key: { PK: `USER#${requesterUid}`, SK: `CONNECTION#${targetUid}` },
      UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':status': 'accepted',
        ':updatedAt': now
      }
    })),
    docClient.send(new UpdateCommand({
      TableName: TABLES.MAIN,
      Key: { PK: `USER#${targetUid}`, SK: `CONNECTION#${requesterUid}` },
      UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':status': 'accepted',
        ':updatedAt': now
      }
    }))
  ]);

  // Invalidate caches
  await Promise.all([
    cache.delPattern(`connections:${requesterUid}:*`),
    cache.delPattern(`connections:${targetUid}:*`)
  ]);
}

/**
 * Decline connection request
 * @param {string} requesterUid - Requester UID
 * @param {string} targetUid - Target UID
 */
async function declineConnectionRequest(requesterUid, targetUid) {
  await Promise.all([
    docClient.send(new DeleteCommand({
      TableName: TABLES.MAIN,
      Key: { PK: `USER#${requesterUid}`, SK: `CONNECTION#${targetUid}` }
    })),
    docClient.send(new DeleteCommand({
      TableName: TABLES.MAIN,
      Key: { PK: `USER#${targetUid}`, SK: `CONNECTION#${requesterUid}` }
    }))
  ]);

  await Promise.all([
    cache.delPattern(`connections:${requesterUid}:*`),
    cache.delPattern(`connections:${targetUid}:*`)
  ]);
}

/**
 * Delete connection
 * @param {string} uid1 - User 1 UID
 * @param {string} uid2 - User 2 UID
 */
async function deleteConnection(uid1, uid2) {
  await Promise.all([
    docClient.send(new DeleteCommand({
      TableName: TABLES.MAIN,
      Key: { PK: `USER#${uid1}`, SK: `CONNECTION#${uid2}` }
    })),
    docClient.send(new DeleteCommand({
      TableName: TABLES.MAIN,
      Key: { PK: `USER#${uid2}`, SK: `CONNECTION#${uid1}` }
    }))
  ]);

  await Promise.all([
    cache.delPattern(`connections:${uid1}:*`),
    cache.delPattern(`connections:${uid2}:*`)
  ]);
}

// ============================================
// STREAK OPERATIONS
// ============================================

/**
 * Initialize streak for a user
 * @param {string} uid - User UID
 */
async function initializeStreak(uid) {
  await docClient.send(new PutCommand({
    TableName: TABLES.MAIN,
    Item: {
      PK: `USER#${uid}`,
      SK: 'STREAK',
      GSI5PK: 'STREAKS',
      GSI5SK: '0000000000', // Zero-padded current streak for sorting
      entityType: 'STREAK',
      uid,
      currentStreak: 0,
      longestStreak: 0,
      lastEntryDate: null,
      streakStartDate: null,
      updatedAt: new Date().toISOString()
    },
    ConditionExpression: 'attribute_not_exists(PK)'
  }));
}

/**
 * Update streak when entry is created
 * @param {string} uid - User UID
 * @param {string} entryDate - Entry date (ISO string)
 */
async function updateStreakOnEntry(uid, entryDate) {
  const result = await docClient.send(new GetCommand({
    TableName: TABLES.MAIN,
    Key: { PK: `USER#${uid}`, SK: 'STREAK' }
  }));

  const streak = result.Item || {
    PK: `USER#${uid}`,
    SK: 'STREAK',
    GSI5PK: 'STREAKS',
    uid,
    currentStreak: 0,
    longestStreak: 0,
    lastEntryDate: null,
    streakStartDate: null
  };

  const entryDateOnly = entryDate.split('T')[0];
  const lastEntryDateOnly = streak.lastEntryDate ? streak.lastEntryDate.split('T')[0] : null;

  // Skip if entry is on same day
  if (entryDateOnly === lastEntryDateOnly) {
    return;
  }

  const daysDiff = lastEntryDateOnly
    ? Math.floor((new Date(entryDateOnly) - new Date(lastEntryDateOnly)) / (1000 * 60 * 60 * 24))
    : 0;

  let newCurrentStreak;
  let newStreakStartDate;

  if (daysDiff === 1) {
    // Consecutive day - increment streak
    newCurrentStreak = streak.currentStreak + 1;
    newStreakStartDate = streak.streakStartDate || entryDateOnly;
  } else {
    // New streak
    newCurrentStreak = 1;
    newStreakStartDate = entryDateOnly;
  }

  const newLongestStreak = Math.max(streak.longestStreak, newCurrentStreak);

  await docClient.send(new UpdateCommand({
    TableName: TABLES.MAIN,
    Key: { PK: `USER#${uid}`, SK: 'STREAK' },
    UpdateExpression: 'SET currentStreak = :current, longestStreak = :longest, lastEntryDate = :lastDate, streakStartDate = :startDate, GSI5SK = :gsi5sk, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':current': newCurrentStreak,
      ':longest': newLongestStreak,
      ':lastDate': entryDate,
      ':startDate': newStreakStartDate,
      ':gsi5sk': String(newCurrentStreak).padStart(10, '0'),
      ':updatedAt': new Date().toISOString()
    }
  }));

  await cache.del(`streak:${uid}`);
}

/**
 * Get user's streak
 * @param {string} uid - User UID
 * @returns {Promise<object>} Streak data
 */
async function getUserStreak(uid) {
  return cache.getOrCompute(
    `streak:${uid}`,
    async () => {
      const result = await docClient.send(new GetCommand({
        TableName: TABLES.MAIN,
        Key: { PK: `USER#${uid}`, SK: 'STREAK' }
      }));

      return result.Item || {
        currentStreak: 0,
        longestStreak: 0,
        lastEntryDate: null
      };
    },
    cache.TTL.STREAK_DATA
  );
}

/**
 * Get friends' streaks (leaderboard)
 * @param {string} uid - User UID
 * @param {number} limit - Max results
 * @returns {Promise<array>} Friends with streaks
 */
async function getFriendsStreaks(uid, limit = 20) {
  // Get friend connections
  const connections = await getConnections(uid, 'accepted');
  const friendUids = connections.map(c => c.targetUid);

  if (friendUids.length === 0) {
    return [];
  }

  // Batch get friend profiles and streaks
  const keys = friendUids.flatMap(fuid => [
    { PK: `USER#${fuid}`, SK: 'PROFILE' },
    { PK: `USER#${fuid}`, SK: 'STREAK' }
  ]);

  const result = await docClient.send(new BatchGetCommand({
    RequestItems: {
      [TABLES.MAIN]: {
        Keys: keys
      }
    }
  }));

  const items = result.Responses[TABLES.MAIN] || [];

  // Group by user
  const userMap = new Map();

  for (const item of items) {
    const uid = item.uid;

    if (!userMap.has(uid)) {
      userMap.set(uid, {});
    }

    if (item.SK === 'PROFILE') {
      userMap.get(uid).profile = item;
    } else if (item.SK === 'STREAK') {
      userMap.get(uid).streak = item;
    }
  }

  // Combine and sort by current streak
  const friends = Array.from(userMap.values())
    .map(({ profile, streak }) => ({
      uid: profile.uid,
      username: profile.username,
      firstName: profile.firstName,
      lastName: profile.lastName,
      currentStreak: streak?.currentStreak || 0,
      longestStreak: streak?.longestStreak || 0,
      lastEntryDate: streak?.lastEntryDate || null
    }))
    .sort((a, b) => b.currentStreak - a.currentStreak)
    .slice(0, limit);

  return friends;
}

// ============================================
// TRIP OPERATIONS
// ============================================

/**
 * Create a new trip
 * @param {object} tripData - Trip data
 * @returns {Promise<object>} Created trip
 */
async function createTrip(tripData) {
  const {
    ownerUid,
    title,
    description,
    destination,
    startDate,
    endDate,
    coverImageUrl
  } = tripData;

  const tripId = ulid();
  const now = new Date().toISOString();

  const trip = {
    PK: `USER#${ownerUid}`,
    SK: `TRIP#${tripId}`,
    GSI4PK: `TRIP#${tripId}`,
    entityType: 'TRIP',
    tripId,
    ownerUid,
    title,
    description,
    destination,
    startDate,
    endDate,
    coverImageUrl,
    isActive: true,
    createdAt: now,
    updatedAt: now
  };

  await docClient.send(new PutCommand({
    TableName: TABLES.CONTENT,
    Item: trip
  }));

  return trip;
}

/**
 * Get trips for a user
 * @param {string} uid - User UID
 * @returns {Promise<array>} Trips
 */
async function getTrips(uid) {
  const result = await docClient.send(new QueryCommand({
    TableName: TABLES.CONTENT,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    FilterExpression: 'isActive = :true',
    ExpressionAttributeValues: {
      ':pk': `USER#${uid}`,
      ':sk': 'TRIP#',
      ':true': true
    }
  }));

  return result.Items || [];
}

/**
 * Get trip by ID
 * @param {string} tripId - Trip ID
 * @returns {Promise<object|null>} Trip or null
 */
async function getTripById(tripId) {
  const result = await docClient.send(new QueryCommand({
    TableName: TABLES.CONTENT,
    IndexName: 'GSI4-ByTripId',
    KeyConditionExpression: 'GSI4PK = :tripId',
    FilterExpression: 'entityType = :type AND isActive = :true',
    ExpressionAttributeValues: {
      ':tripId': `TRIP#${tripId}`,
      ':type': 'TRIP',
      ':true': true
    },
    Limit: 1
  }));

  return result.Items && result.Items.length > 0 ? result.Items[0] : null;
}

/**
 * Update trip
 * @param {string} tripId - Trip ID
 * @param {string} ownerUid - Owner UID
 * @param {object} updates - Fields to update
 * @returns {Promise<object>} Updated trip
 */
async function updateTrip(tripId, ownerUid, updates) {
  const trip = await getTripById(tripId);

  if (!trip || trip.ownerUid !== ownerUid) {
    throw new Error('Trip not found or unauthorized');
  }

  const { title, description, destination, startDate, endDate, coverImageUrl } = updates;

  const updateExpressions = [];
  const attributeValues = {};

  if (title !== undefined) {
    updateExpressions.push('title = :title');
    attributeValues[':title'] = title;
  }

  if (description !== undefined) {
    updateExpressions.push('description = :description');
    attributeValues[':description'] = description;
  }

  if (destination !== undefined) {
    updateExpressions.push('destination = :destination');
    attributeValues[':destination'] = destination;
  }

  if (startDate !== undefined) {
    updateExpressions.push('startDate = :startDate');
    attributeValues[':startDate'] = startDate;
  }

  if (endDate !== undefined) {
    updateExpressions.push('endDate = :endDate');
    attributeValues[':endDate'] = endDate;
  }

  if (coverImageUrl !== undefined) {
    updateExpressions.push('coverImageUrl = :coverImageUrl');
    attributeValues[':coverImageUrl'] = coverImageUrl;
  }

  updateExpressions.push('updatedAt = :updatedAt');
  attributeValues[':updatedAt'] = new Date().toISOString();

  const result = await docClient.send(new UpdateCommand({
    TableName: TABLES.CONTENT,
    Key: { PK: trip.PK, SK: trip.SK },
    UpdateExpression: 'SET ' + updateExpressions.join(', '),
    ExpressionAttributeValues: attributeValues,
    ReturnValues: 'ALL_NEW'
  }));

  return result.Attributes;
}

/**
 * Delete trip (soft delete)
 * @param {string} tripId - Trip ID
 * @param {string} ownerUid - Owner UID
 */
async function deleteTrip(tripId, ownerUid) {
  const trip = await getTripById(tripId);

  if (!trip || trip.ownerUid !== ownerUid) {
    throw new Error('Trip not found or unauthorized');
  }

  await docClient.send(new UpdateCommand({
    TableName: TABLES.CONTENT,
    Key: { PK: trip.PK, SK: trip.SK },
    UpdateExpression: 'SET isActive = :false, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':false': false,
      ':updatedAt': new Date().toISOString()
    }
  }));
}

/**
 * Get entries for a trip
 * @param {string} tripId - Trip ID
 * @returns {Promise<array>} Entries
 */
async function getTripEntries(tripId) {
  const result = await docClient.send(new QueryCommand({
    TableName: TABLES.CONTENT,
    IndexName: 'GSI4-ByTripId',
    KeyConditionExpression: 'GSI4PK = :tripId',
    FilterExpression: 'entityType = :type AND isDeleted = :false',
    ExpressionAttributeValues: {
      ':tripId': `TRIP#${tripId}`,
      ':type': 'ENTRY',
      ':false': false
    },
    ScanIndexForward: false
  }));

  return result.Items || [];
}

/**
 * Share trip with user
 * @param {string} tripId - Trip ID
 * @param {string} ownerUid - Owner UID
 * @param {string} sharedWithUid - User to share with
 * @param {string} permission - Permission level ('view' or 'comment')
 * @returns {Promise<object>} Trip share
 */
async function shareTripWithUser(tripId, ownerUid, sharedWithUid, permission = 'view') {
  const shareId = ulid();
  const now = new Date().toISOString();

  const share = {
    PK: `TRIP#${tripId}`,
    SK: `SHARE#${sharedWithUid}`,
    GSI1PK: `USER#${sharedWithUid}`,
    GSI1SK: `TRIPSHARE#${tripId}`,
    entityType: 'TRIP_SHARE',
    shareId,
    tripId,
    ownerUid,
    sharedWithUid,
    permission,
    sharedAt: now
  };

  await docClient.send(new PutCommand({
    TableName: TABLES.CONTENT,
    Item: share
  }));

  return share;
}

/**
 * Get trips shared with user
 * @param {string} uid - User UID
 * @returns {Promise<array>} Shared trips
 */
async function getTripsSharedWithMe(uid) {
  const result = await docClient.send(new QueryCommand({
    TableName: TABLES.CONTENT,
    IndexName: 'GSI1-BySharedWithUid',
    KeyConditionExpression: 'GSI1PK = :uid AND begins_with(GSI1SK, :prefix)',
    ExpressionAttributeValues: {
      ':uid': `USER#${uid}`,
      ':prefix': 'TRIPSHARE#'
    }
  }));

  const shares = result.Items || [];

  // Get trip details
  const tripIds = shares.map(s => s.tripId);
  const trips = await Promise.all(tripIds.map(id => getTripById(id)));

  return trips.filter(t => t !== null);
}

/**
 * Remove trip share
 * @param {string} tripId - Trip ID
 * @param {string} sharedWithUid - User to remove share from
 */
async function removeTripShare(tripId, sharedWithUid) {
  await docClient.send(new DeleteCommand({
    TableName: TABLES.CONTENT,
    Key: { PK: `TRIP#${tripId}`, SK: `SHARE#${sharedWithUid}` }
  }));
}

// ============================================
// ENTRY SHARING OPERATIONS
// ============================================

/**
 * Create public share link for entry
 * @param {string} entryId - Entry ID
 * @param {string} ownerUid - Entry owner UID
 * @returns {Promise<object>} Share object with token
 */
async function createPublicShare(entryId, ownerUid) {
  const crypto = require('crypto');

  // Check if share already exists
  const result = await docClient.send(new QueryCommand({
    TableName: TABLES.CONTENT,
    IndexName: 'GSI2-ByPublicToken',
    KeyConditionExpression: 'GSI2PK = :pk',
    ExpressionAttributeValues: {
      ':pk': `PUBLICSHARE#${entryId}`
    },
    Limit: 1
  }));

  if (result.Items && result.Items.length > 0) {
    return {
      token: result.Items[0].publicToken,
      shareId: result.Items[0].shareId,
      isNew: false
    };
  }

  // Create new share
  const token = crypto.randomBytes(32).toString('base64url');
  const shareId = ulid();
  const now = new Date().toISOString();

  const share = {
    PK: `ENTRY#${entryId}`,
    SK: `PUBLICSHARE#${shareId}`,
    GSI2PK: `PUBLICSHARE#${entryId}`,
    GSI2SK: `TOKEN#${token}`,
    publicToken: token,
    shareId,
    entryId,
    ownerUid,
    viewCount: 0,
    createdAt: now
  };

  await docClient.send(new PutCommand({
    TableName: TABLES.CONTENT,
    Item: share
  }));

  return {
    token,
    shareId,
    isNew: true
  };
}

/**
 * Get public share by token
 * @param {string} token - Share token
 * @returns {Promise<object>} Share object with entry data
 */
async function getPublicShare(token) {
  const result = await docClient.send(new QueryCommand({
    TableName: TABLES.CONTENT,
    IndexName: 'GSI2-ByPublicToken',
    KeyConditionExpression: 'GSI2SK = :token',
    ExpressionAttributeValues: {
      ':token': `TOKEN#${token}`
    },
    Limit: 1
  }));

  if (!result.Items || result.Items.length === 0) {
    return null;
  }

  const share = result.Items[0];

  // Get the entry
  const entry = await getEntryById(share.entryId);

  if (!entry || entry.isDeleted) {
    return null;
  }

  return {
    ...share,
    entry
  };
}

/**
 * Increment view count for public share
 * @param {string} entryId - Entry ID
 * @param {string} shareId - Share ID
 */
async function incrementShareViewCount(entryId, shareId) {
  await docClient.send(new UpdateCommand({
    TableName: TABLES.CONTENT,
    Key: { PK: `ENTRY#${entryId}`, SK: `PUBLICSHARE#${shareId}` },
    UpdateExpression: 'SET viewCount = if_not_exists(viewCount, :zero) + :inc',
    ExpressionAttributeValues: {
      ':zero': 0,
      ':inc': 1
    }
  }));
}

/**
 * Delete public share
 * @param {string} token - Share token
 * @param {string} ownerUid - Entry owner UID (for authorization)
 * @returns {Promise<boolean>} Success
 */
async function deletePublicShare(token, ownerUid) {
  // First get the share to verify ownership
  const share = await getPublicShare(token);

  if (!share || share.ownerUid !== ownerUid) {
    return false;
  }

  await docClient.send(new DeleteCommand({
    TableName: TABLES.CONTENT,
    Key: { PK: `ENTRY#${share.entryId}`, SK: `PUBLICSHARE#${share.shareId}` }
  }));

  return true;
}

/**
 * Share entry with specific users (friends)
 * @param {string} entryId - Entry ID
 * @param {string} ownerUid - Entry owner UID
 * @param {array} sharedWithUids - Array of user UIDs to share with
 * @returns {Promise<array>} Array of created shares
 */
async function shareEntryWithUsers(entryId, ownerUid, sharedWithUids) {
  const shares = [];
  const now = new Date().toISOString();

  for (const sharedWithUid of sharedWithUids) {
    const shareId = ulid();

    const share = {
      PK: `ENTRY#${entryId}`,
      SK: `SHARE#${sharedWithUid}`,
      GSI1PK: `USER#${sharedWithUid}`,
      GSI1SK: `ENTRYSHARE#${shareId}`,
      shareId,
      entryId,
      ownerUid,
      sharedWithUid,
      isRead: false,
      sharedAt: now
    };

    await docClient.send(new PutCommand({
      TableName: TABLES.CONTENT,
      Item: share
    }));

    shares.push(share);
  }

  return shares;
}

/**
 * Get entries shared with user
 * @param {string} uid - User UID
 * @returns {Promise<array>} Shared entries
 */
async function getEntriesSharedWithMe(uid) {
  const result = await docClient.send(new QueryCommand({
    TableName: TABLES.CONTENT,
    IndexName: 'GSI1-BySharedWithUid',
    KeyConditionExpression: 'GSI1PK = :pk AND begins_with(GSI1SK, :sk)',
    ExpressionAttributeValues: {
      ':pk': `USER#${uid}`,
      ':sk': 'ENTRYSHARE#'
    }
  }));

  const shares = result.Items || [];

  // Get full entry details for each share
  const entriesWithDetails = [];
  for (const share of shares) {
    const entry = await getEntryById(share.entryId);
    if (entry && !entry.isDeleted) {
      entriesWithDetails.push({
        ...share,
        entry
      });
    }
  }

  return entriesWithDetails;
}

/**
 * Mark entry share as read
 * @param {string} entryId - Entry ID
 * @param {string} sharedWithUid - User UID who received the share
 * @returns {Promise<boolean>} Success
 */
async function markEntryShareAsRead(entryId, sharedWithUid) {
  await docClient.send(new UpdateCommand({
    TableName: TABLES.CONTENT,
    Key: { PK: `ENTRY#${entryId}`, SK: `SHARE#${sharedWithUid}` },
    UpdateExpression: 'SET isRead = :true',
    ExpressionAttributeValues: {
      ':true': true
    }
  }));

  return true;
}

/**
 * Get specific entry share (for viewing)
 * @param {string} entryId - Entry ID
 * @param {string} viewerUid - User UID trying to view
 * @returns {Promise<object>} Entry with share info
 */
async function getSharedEntryForUser(entryId, viewerUid) {
  // Check if entry is shared with this user
  const result = await docClient.send(new GetCommand({
    TableName: TABLES.CONTENT,
    Key: { PK: `ENTRY#${entryId}`, SK: `SHARE#${viewerUid}` }
  }));

  if (!result.Item) {
    return null;
  }

  const entry = await getEntryById(entryId);

  if (!entry || entry.isDeleted) {
    return null;
  }

  return {
    ...result.Item,
    entry
  };
}

// ============================================
// REACTION OPERATIONS
// ============================================

/**
 * Add reaction to entry
 * @param {string} entryId - Entry ID
 * @param {string} reactorUid - User UID
 * @param {string} emoji - Emoji
 * @returns {Promise<object>} Reaction
 */
async function addReaction(entryId, reactorUid, emoji) {
  const reactionId = ulid();
  const now = new Date().toISOString();

  // Get reactor info for denormalization
  const reactor = await getUserByUid(reactorUid);

  const reaction = {
    PK: `ENTRY#${entryId}`,
    SK: `REACTION#${reactorUid}#${emoji}`,
    GSI1PK: `USER#${reactorUid}`,
    GSI1SK: `REACTION#${now}`,
    entityType: 'REACTION',
    reactionId,
    entryId,
    reactorUid,
    reactorUsername: reactor.username,
    reactorFirstName: reactor.firstName,
    emoji,
    createdAt: now
  };

  await docClient.send(new PutCommand({
    TableName: TABLES.SOCIAL,
    Item: reaction
  }));

  await cache.invalidateEntry(entryId);

  return reaction;
}

/**
 * Remove reaction from entry
 * @param {string} entryId - Entry ID
 * @param {string} reactorUid - User UID
 * @param {string} emoji - Emoji
 */
async function removeReaction(entryId, reactorUid, emoji) {
  await docClient.send(new DeleteCommand({
    TableName: TABLES.SOCIAL,
    Key: { PK: `ENTRY#${entryId}`, SK: `REACTION#${reactorUid}#${emoji}` }
  }));

  await cache.invalidateEntry(entryId);
}

/**
 * Get reactions for entry
 * @param {string} entryId - Entry ID
 * @returns {Promise<array>} Reactions
 */
async function getReactions(entryId) {
  const result = await docClient.send(new QueryCommand({
    TableName: TABLES.SOCIAL,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: {
      ':pk': `ENTRY#${entryId}`,
      ':sk': 'REACTION#'
    }
  }));

  return result.Items || [];
}

/**
 * Get reaction counts for entry
 * @param {string} entryId - Entry ID
 * @returns {Promise<object>} Reaction counts by emoji
 */
async function getReactionCounts(entryId) {
  return cache.getOrCompute(
    `reaction-count:${entryId}`,
    async () => {
      // Check for aggregate count item (written by Streams processor)
      const countResult = await docClient.send(new GetCommand({
        TableName: TABLES.SOCIAL,
        Key: { PK: `ENTRY#${entryId}`, SK: 'REACTION#COUNT' }
      }));

      if (countResult.Item && countResult.Item.counts) {
        return countResult.Item.counts;
      }

      // Fallback: compute from individual reactions
      const reactions = await getReactions(entryId);
      const counts = {};

      for (const reaction of reactions) {
        counts[reaction.emoji] = (counts[reaction.emoji] || 0) + 1;
      }

      return counts;
    },
    cache.TTL.REACTION_COUNTS
  );
}

// ============================================
// COMMENT OPERATIONS
// ============================================

/**
 * Add comment to entry
 * @param {string} entryId - Entry ID
 * @param {string} commenterUid - User UID
 * @param {string} commentText - Comment text
 * @param {string} parentCommentId - Parent comment ID (for replies)
 * @returns {Promise<object>} Comment
 */
async function addComment(entryId, commenterUid, commentText, parentCommentId = null) {
  const commentId = ulid();
  const now = new Date().toISOString();

  // Get commenter info for denormalization
  const commenter = await getUserByUid(commenterUid);

  const comment = {
    PK: `ENTRY#${entryId}`,
    SK: `COMMENT#${now}#${commentId}`,
    GSI2PK: `USER#${commenterUid}`,
    GSI2SK: `COMMENT#${now}`,
    entityType: 'COMMENT',
    commentId,
    entryId,
    commenterUid,
    commenterUsername: commenter.username,
    commenterFirstName: commenter.firstName,
    parentCommentId,
    commentText,
    isDeleted: false,
    createdAt: now,
    updatedAt: now
  };

  await docClient.send(new PutCommand({
    TableName: TABLES.SOCIAL,
    Item: comment
  }));

  await cache.invalidateEntry(entryId);

  return comment;
}

/**
 * Get comments for entry
 * @param {string} entryId - Entry ID
 * @returns {Promise<array>} Comments
 */
async function getComments(entryId) {
  const result = await docClient.send(new QueryCommand({
    TableName: TABLES.SOCIAL,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    FilterExpression: 'isDeleted = :false',
    ExpressionAttributeValues: {
      ':pk': `ENTRY#${entryId}`,
      ':sk': 'COMMENT#',
      ':false': false
    },
    ScanIndexForward: true // Oldest first
  }));

  return result.Items || [];
}

/**
 * Delete comment (soft delete)
 * @param {string} entryId - Entry ID
 * @param {string} commentId - Comment ID
 * @param {string} commenterUid - Commenter UID
 */
async function deleteComment(entryId, commentId, commenterUid) {
  // Find the comment
  const comments = await getComments(entryId);
  const comment = comments.find(c => c.commentId === commentId && c.commenterUid === commenterUid);

  if (!comment) {
    throw new Error('Comment not found or unauthorized');
  }

  await docClient.send(new UpdateCommand({
    TableName: TABLES.SOCIAL,
    Key: { PK: comment.PK, SK: comment.SK },
    UpdateExpression: 'SET isDeleted = :true, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':true': true,
      ':updatedAt': new Date().toISOString()
    }
  }));

  await cache.invalidateEntry(entryId);
}

/**
 * Get comment counts for entry
 * @param {string} entryId - Entry ID
 * @returns {Promise<number>} Comment count
 */
async function getCommentCount(entryId) {
  return cache.getOrCompute(
    `comment-count:${entryId}`,
    async () => {
      // Check for aggregate count item (written by Streams processor)
      const countResult = await docClient.send(new GetCommand({
        TableName: TABLES.SOCIAL,
        Key: { PK: `ENTRY#${entryId}`, SK: 'COMMENT#COUNT' }
      }));

      if (countResult.Item && countResult.Item.count !== undefined) {
        return countResult.Item.count;
      }

      // Fallback: count from query
      const comments = await getComments(entryId);
      return comments.length;
    },
    cache.TTL.COMMENT_COUNTS
  );
}

// ============================================
// PROMPT OPERATIONS
// ============================================

/**
 * Create prompt
 * @param {string} promptText - Prompt text
 * @param {string} creatorUid - Creator UID (null for system prompts)
 * @returns {Promise<object>} Created prompt
 */
async function createPrompt(promptText, creatorUid = null) {
  const promptId = ulid();
  const now = new Date().toISOString();

  const prompt = {
    PK: creatorUid ? `USER#${creatorUid}` : 'SYSTEM',
    SK: `PROMPT#${promptId}`,
    entityType: 'PROMPT',
    promptId,
    promptText,
    creatorUid,
    createdAt: now
  };

  await docClient.send(new PutCommand({
    TableName: TABLES.CONTENT,
    Item: prompt
  }));

  return prompt;
}

/**
 * Get random prompt
 * @param {boolean} includeUserPrompts - Include user-created prompts
 * @returns {Promise<object|null>} Random prompt
 */
async function getRandomPrompt(includeUserPrompts = false) {
  // Get system prompts
  const systemResult = await docClient.send(new QueryCommand({
    TableName: TABLES.CONTENT,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: {
      ':pk': 'SYSTEM',
      ':sk': 'PROMPT#'
    }
  }));

  const prompts = systemResult.Items || [];

  if (prompts.length === 0) {
    return null;
  }

  // Return random prompt
  const randomIndex = Math.floor(Math.random() * prompts.length);
  return prompts[randomIndex];
}

// ============================================
// INVITE LINK OPERATIONS
// ============================================

/**
 * Create invite link
 * @param {string} creatorUid - Creator UID
 * @returns {Promise<object>} Invite link
 */
async function createInviteLink(creatorUid) {
  const inviteId = ulid();
  const inviteToken = require('crypto').randomBytes(32).toString('hex');
  const now = new Date().toISOString();

  const invite = {
    PK: `USER#${creatorUid}`,
    SK: `INVITE#${inviteId}`,
    GSI2PK: `INVITE#${inviteToken}`,
    entityType: 'INVITE',
    inviteId,
    inviteToken,
    creatorUid,
    createdAt: now
  };

  await docClient.send(new PutCommand({
    TableName: TABLES.MAIN,
    Item: invite
  }));

  return invite;
}

/**
 * Get invite by token
 * @param {string} token - Invite token
 * @returns {Promise<object|null>} Invite or null
 */
async function getInviteByToken(token) {
  const result = await docClient.send(new QueryCommand({
    TableName: TABLES.MAIN,
    IndexName: 'GSI2-ByEmail',
    KeyConditionExpression: 'GSI2PK = :token',
    ExpressionAttributeValues: {
      ':token': `INVITE#${token}`
    },
    Limit: 1
  }));

  return result.Items && result.Items.length > 0 ? result.Items[0] : null;
}

/**
 * Redeem invite (create connection)
 * @param {string} token - Invite token
 * @param {string} redeemerUid - Redeemer UID
 */
async function redeemInvite(token, redeemerUid) {
  const invite = await getInviteByToken(token);

  if (!invite) {
    throw new Error('Invalid invite token');
  }

  // Create connection request
  await createConnectionRequest(invite.creatorUid, redeemerUid);
}

// ============================================
// ACCOUNTABILITY PARTNER OPERATIONS
// ============================================

/**
 * Create accountability partnership request
 * @param {string} userUid - User UID
 * @param {string} partnerUid - Partner UID
 * @returns {Promise<object>} Partnership
 */
async function createPartnershipRequest(userUid, partnerUid) {
  const partnershipId = ulid();
  const now = new Date().toISOString();

  const partnership = {
    PK: `USER#${userUid}`,
    SK: `PARTNERSHIP#${partnerUid}`,
    GSI4PK: `USER#${userUid}`,
    GSI4SK: `PARTNERSHIP#${partnershipId}`,
    entityType: 'PARTNERSHIP',
    partnershipId,
    userUid,
    partnerUid,
    status: 'pending',
    createdAt: now,
    updatedAt: now
  };

  await docClient.send(new PutCommand({
    TableName: TABLES.MAIN,
    Item: partnership
  }));

  // Create reverse partnership for partner
  await docClient.send(new PutCommand({
    TableName: TABLES.MAIN,
    Item: {
      ...partnership,
      PK: `USER#${partnerUid}`,
      SK: `PARTNERSHIP#${userUid}`,
      GSI4PK: `USER#${partnerUid}`,
      isIncoming: true
    }
  }));

  return partnership;
}

/**
 * Get accountability partners
 * @param {string} uid - User UID
 * @param {string} status - Filter by status
 * @returns {Promise<array>} Partnerships
 */
async function getPartnerships(uid, status = 'active') {
  const result = await docClient.send(new QueryCommand({
    TableName: TABLES.MAIN,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    FilterExpression: '#status = :status',
    ExpressionAttributeNames: {
      '#status': 'status'
    },
    ExpressionAttributeValues: {
      ':pk': `USER#${uid}`,
      ':sk': 'PARTNERSHIP#',
      ':status': status
    }
  }));

  return result.Items || [];
}

/**
 * Accept partnership request
 * @param {string} userUid - Requester UID
 * @param {string} partnerUid - Accepter UID
 */
async function acceptPartnership(userUid, partnerUid) {
  const now = new Date().toISOString();

  await Promise.all([
    docClient.send(new UpdateCommand({
      TableName: TABLES.MAIN,
      Key: { PK: `USER#${userUid}`, SK: `PARTNERSHIP#${partnerUid}` },
      UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':status': 'active',
        ':updatedAt': now
      }
    })),
    docClient.send(new UpdateCommand({
      TableName: TABLES.MAIN,
      Key: { PK: `USER#${partnerUid}`, SK: `PARTNERSHIP#${userUid}` },
      UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':status': 'active',
        ':updatedAt': now
      }
    }))
  ]);
}

/**
 * End partnership
 * @param {string} userUid - User UID
 * @param {string} partnerUid - Partner UID
 */
async function endPartnership(userUid, partnerUid) {
  await Promise.all([
    docClient.send(new DeleteCommand({
      TableName: TABLES.MAIN,
      Key: { PK: `USER#${userUid}`, SK: `PARTNERSHIP#${partnerUid}` }
    })),
    docClient.send(new DeleteCommand({
      TableName: TABLES.MAIN,
      Key: { PK: `USER#${partnerUid}`, SK: `PARTNERSHIP#${userUid}` }
    }))
  ]);
}

// ============================================
// FEED OPERATIONS
// ============================================

/**
 * Get activity feed for user
 * @param {string} uid - User UID
 * @param {number} limit - Max results
 * @param {string} exclusiveStartKey - Pagination token
 * @returns {Promise<object>} {items, lastEvaluatedKey}
 */
async function getFeed(uid, limit = 20, exclusiveStartKey = null) {
  const params = {
    TableName: TABLES.FEED,
    KeyConditionExpression: 'PK = :pk',
    ExpressionAttributeValues: {
      ':pk': `USER#${uid}`
    },
    ScanIndexForward: false, // Newest first
    Limit: limit
  };

  if (exclusiveStartKey) {
    params.ExclusiveStartKey = JSON.parse(Buffer.from(exclusiveStartKey, 'base64').toString());
  }

  const result = await docClient.send(new QueryCommand(params));

  return {
    items: result.Items || [],
    lastEvaluatedKey: result.LastEvaluatedKey
      ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
      : null
  };
}

module.exports = {
  // User operations
  createUser,
  getUserByUid,
  getUserByUsername,
  getUserByEmail,
  updateUserProfile,
  searchUsers,
  discoverUsers,
  deleteUserAccount,

  // Entry operations
  createEntry,
  getEntries,
  getEntryById,
  updateEntry,
  deleteEntry,

  // Connection operations
  createConnectionRequest,
  getConnections,
  acceptConnectionRequest,
  declineConnectionRequest,
  deleteConnection,

  // Streak operations
  initializeStreak,
  updateStreakOnEntry,
  getUserStreak,
  getFriendsStreaks,

  // Trip operations
  createTrip,
  getTrips,
  getTripById,
  updateTrip,
  deleteTrip,
  getTripEntries,
  shareTripWithUser,
  getTripsSharedWithMe,
  removeTripShare,

  // Entry sharing operations
  createPublicShare,
  getPublicShare,
  incrementShareViewCount,
  deletePublicShare,
  shareEntryWithUsers,
  getEntriesSharedWithMe,
  markEntryShareAsRead,
  getSharedEntryForUser,

  // Reaction operations
  addReaction,
  removeReaction,
  getReactions,
  getReactionCounts,

  // Comment operations
  addComment,
  getComments,
  deleteComment,
  getCommentCount,

  // Prompt operations
  createPrompt,
  getRandomPrompt,

  // Invite link operations
  createInviteLink,
  getInviteByToken,
  redeemInvite,

  // Accountability partner operations
  createPartnershipRequest,
  getPartnerships,
  acceptPartnership,
  endPartnership,

  // Feed operations
  getFeed,

  // Constants
  TABLES
};
