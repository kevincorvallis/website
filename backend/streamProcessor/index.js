/**
 * DynamoDB Streams Processor Lambda
 *
 * Processes changes from DynamoDB tables and:
 * 1. Updates aggregate counts (reactions, comments)
 * 2. Populates activity feed table
 * 3. Maintains denormalized data consistency
 *
 * Triggered by DynamoDB Streams on:
 * - DayByDay-Social (for reactions and comments)
 * - DayByDay-Content (for shares)
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand
} = require('@aws-sdk/lib-dynamodb');

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

/**
 * Lambda handler - processes DynamoDB stream records
 */
exports.handler = async (event) => {
  console.log(`Processing ${event.Records.length} stream records`);

  const results = {
    processed: 0,
    failed: 0,
    errors: []
  };

  for (const record of event.Records) {
    try {
      await processRecord(record);
      results.processed++;
    } catch (error) {
      console.error('Error processing record:', error);
      console.error('Record:', JSON.stringify(record, null, 2));
      results.failed++;
      results.errors.push({
        recordId: record.eventID,
        error: error.message
      });
    }
  }

  console.log('Processing complete:', results);

  // Fail the batch if any errors (Lambda will retry)
  if (results.failed > 0) {
    throw new Error(`Failed to process ${results.failed} records`);
  }

  return results;
};

/**
 * Process a single stream record
 */
async function processRecord(record) {
  const { eventName, dynamodb } = record;

  // Parse new and old images
  const newImage = dynamodb.NewImage ? unmarshall(dynamodb.NewImage) : null;
  const oldImage = dynamodb.OldImage ? unmarshall(dynamodb.OldImage) : null;

  console.log(`Event: ${eventName}, Entity: ${newImage?.entityType || oldImage?.entityType}`);

  // Route to appropriate handler based on entity type
  const entityType = newImage?.entityType || oldImage?.entityType;

  switch (entityType) {
    case 'REACTION':
      await handleReaction(eventName, newImage, oldImage);
      break;

    case 'COMMENT':
      await handleComment(eventName, newImage, oldImage);
      break;

    case 'ENTRY_SHARE':
      await handleEntryShare(eventName, newImage, oldImage);
      break;

    case 'TRIP_SHARE':
      await handleTripShare(eventName, newImage, oldImage);
      break;

    default:
      console.log(`No handler for entity type: ${entityType}`);
  }
}

/**
 * Unmarshall DynamoDB attribute values
 */
function unmarshall(item) {
  const result = {};

  for (const [key, value] of Object.entries(item)) {
    if (value.S !== undefined) {
      result[key] = value.S;
    } else if (value.N !== undefined) {
      result[key] = parseFloat(value.N);
    } else if (value.BOOL !== undefined) {
      result[key] = value.BOOL;
    } else if (value.NULL !== undefined) {
      result[key] = null;
    } else if (value.M !== undefined) {
      result[key] = unmarshall(value.M);
    } else if (value.L !== undefined) {
      result[key] = value.L.map(item => {
        if (item.S) return item.S;
        if (item.N) return parseFloat(item.N);
        if (item.M) return unmarshall(item.M);
        return item;
      });
    }
  }

  return result;
}

// ============================================
// REACTION HANDLERS
// ============================================

/**
 * Handle reaction changes
 * Updates aggregate reaction counts for entries
 */
async function handleReaction(eventName, newImage, oldImage) {
  const entryId = (newImage || oldImage).entryId;
  const emoji = (newImage || oldImage).emoji;

  console.log(`Reaction ${eventName} for entry ${entryId}, emoji: ${emoji}`);

  // Get current count item
  const countResult = await docClient.send(new GetCommand({
    TableName: TABLES.SOCIAL,
    Key: { PK: `ENTRY#${entryId}`, SK: 'REACTION#COUNT' }
  }));

  let counts = countResult.Item?.counts || {};

  if (eventName === 'INSERT') {
    // Increment count
    counts[emoji] = (counts[emoji] || 0) + 1;
  } else if (eventName === 'REMOVE') {
    // Decrement count
    counts[emoji] = Math.max(0, (counts[emoji] || 1) - 1);

    // Remove emoji from counts if zero
    if (counts[emoji] === 0) {
      delete counts[emoji];
    }
  }

  // Update count item
  await docClient.send(new PutCommand({
    TableName: TABLES.SOCIAL,
    Item: {
      PK: `ENTRY#${entryId}`,
      SK: 'REACTION#COUNT',
      entityType: 'AGGREGATE_COUNT',
      entryId,
      counts,
      updatedAt: new Date().toISOString()
    }
  }));

  // Add to feed if INSERT
  if (eventName === 'INSERT' && newImage) {
    await addToFeed({
      actorUid: newImage.reactorUid,
      actorUsername: newImage.reactorUsername,
      actorFirstName: newImage.reactorFirstName,
      type: 'REACTION',
      entryId,
      emoji,
      targetUid: extractUidFromPK(newImage.PK), // Entry owner
      createdAt: newImage.createdAt
    });
  }

  console.log(`Updated reaction counts for entry ${entryId}:`, counts);
}

// ============================================
// COMMENT HANDLERS
// ============================================

/**
 * Handle comment changes
 * Updates aggregate comment counts for entries
 */
async function handleComment(eventName, newImage, oldImage) {
  const entryId = (newImage || oldImage).entryId;

  console.log(`Comment ${eventName} for entry ${entryId}`);

  // Get current count item
  const countResult = await docClient.send(new GetCommand({
    TableName: TABLES.SOCIAL,
    Key: { PK: `ENTRY#${entryId}`, SK: 'COMMENT#COUNT' }
  }));

  let count = countResult.Item?.count || 0;

  if (eventName === 'INSERT') {
    // Increment count
    count++;
  } else if (eventName === 'REMOVE') {
    // Decrement count (shouldn't happen with soft deletes)
    count = Math.max(0, count - 1);
  } else if (eventName === 'MODIFY') {
    // Handle soft delete
    if (newImage.isDeleted && !oldImage.isDeleted) {
      count = Math.max(0, count - 1);
    } else if (!newImage.isDeleted && oldImage.isDeleted) {
      count++;
    }
  }

  // Update count item
  await docClient.send(new PutCommand({
    TableName: TABLES.SOCIAL,
    Item: {
      PK: `ENTRY#${entryId}`,
      SK: 'COMMENT#COUNT',
      entityType: 'AGGREGATE_COUNT',
      entryId,
      count,
      updatedAt: new Date().toISOString()
    }
  }));

  // Add to feed if INSERT or undelete
  if ((eventName === 'INSERT' || (eventName === 'MODIFY' && !newImage.isDeleted)) && newImage) {
    await addToFeed({
      actorUid: newImage.commenterUid,
      actorUsername: newImage.commenterUsername,
      actorFirstName: newImage.commenterFirstName,
      type: 'COMMENT',
      entryId,
      commentId: newImage.commentId,
      commentText: truncateText(newImage.commentText, 100),
      targetUid: extractUidFromPK(newImage.PK), // Entry owner
      createdAt: newImage.createdAt
    });
  }

  console.log(`Updated comment count for entry ${entryId}: ${count}`);
}

// ============================================
// SHARE HANDLERS
// ============================================

/**
 * Handle entry share changes
 * Adds to activity feed when entries are shared
 */
async function handleEntryShare(eventName, newImage, oldImage) {
  if (eventName !== 'INSERT') {
    return; // Only process new shares
  }

  console.log(`Entry share for entry ${newImage.entryId} to user ${newImage.sharedWithUid}`);

  // Add to recipient's feed
  await addToFeed({
    actorUid: newImage.ownerUid,
    type: 'ENTRY_SHARE',
    entryId: newImage.entryId,
    entryTitle: newImage.entryTitle || 'Untitled',
    targetUid: newImage.sharedWithUid,
    createdAt: newImage.sharedAt
  });
}

/**
 * Handle trip share changes
 * Adds to activity feed when trips are shared
 */
async function handleTripShare(eventName, newImage, oldImage) {
  if (eventName !== 'INSERT') {
    return; // Only process new shares
  }

  console.log(`Trip share for trip ${newImage.tripId} to user ${newImage.sharedWithUid}`);

  // Add to recipient's feed
  await addToFeed({
    actorUid: newImage.ownerUid,
    type: 'TRIP_SHARE',
    tripId: newImage.tripId,
    targetUid: newImage.sharedWithUid,
    createdAt: newImage.sharedAt
  });
}

// ============================================
// FEED OPERATIONS
// ============================================

/**
 * Add activity to user's feed
 * @param {object} activity - Activity data
 */
async function addToFeed(activity) {
  const {
    actorUid,
    actorUsername,
    actorFirstName,
    type,
    entryId,
    tripId,
    emoji,
    commentId,
    commentText,
    entryTitle,
    targetUid,
    createdAt
  } = activity;

  // Don't add self-activities to feed
  if (actorUid === targetUid) {
    console.log('Skipping self-activity');
    return;
  }

  const timestamp = createdAt || new Date().toISOString();
  const feedId = `${timestamp}#${type}#${entryId || tripId || commentId}`;

  const feedItem = {
    PK: `USER#${targetUid}`,
    SK: `FEED#${feedId}`,
    entityType: 'FEED_ITEM',
    type,
    actorUid,
    actorUsername,
    actorFirstName,
    entryId,
    tripId,
    emoji,
    commentId,
    commentText,
    entryTitle,
    createdAt: timestamp
  };

  await docClient.send(new PutCommand({
    TableName: TABLES.FEED,
    Item: feedItem
  }));

  console.log(`Added ${type} activity to feed for user ${targetUid}`);
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Extract UID from partition key
 * @param {string} pk - Partition key (e.g., "USER#abc123", "ENTRY#xyz")
 * @returns {string} UID
 */
function extractUidFromPK(pk) {
  if (!pk) return null;

  if (pk.startsWith('USER#')) {
    return pk.substring(5);
  } else if (pk.startsWith('ENTRY#')) {
    // For entries, we need to look up the owner
    // This is a limitation - streams don't have all context
    // In production, denormalize ownerUid in entry items
    return null;
  }

  return null;
}

/**
 * Truncate text to max length
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Max length
 * @returns {string} Truncated text
 */
function truncateText(text, maxLength) {
  if (!text || text.length <= maxLength) {
    return text;
  }

  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Get entry owner UID
 * Helper to fetch entry details when needed
 * @param {string} entryId - Entry ID
 * @returns {Promise<string|null>} Owner UID
 */
async function getEntryOwner(entryId) {
  try {
    const result = await docClient.send(new QueryCommand({
      TableName: TABLES.CONTENT,
      IndexName: 'GSI3-ByEntryId',
      KeyConditionExpression: 'GSI3PK = :entryId',
      ExpressionAttributeValues: {
        ':entryId': `ENTRY#${entryId}`
      },
      Limit: 1,
      ProjectionExpression: 'firebaseUid'
    }));

    if (result.Items && result.Items.length > 0) {
      return result.Items[0].firebaseUid;
    }

    return null;
  } catch (error) {
    console.error(`Error fetching entry owner for ${entryId}:`, error);
    return null;
  }
}
