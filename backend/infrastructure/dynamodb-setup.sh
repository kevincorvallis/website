#!/bin/bash

# DynamoDB Table Creation Script for Day by Day Travel Journal
# This script creates 4 tables with all necessary GSIs and enables streams
# Run with: bash dynamodb-setup.sh

set -e  # Exit on error

REGION="us-west-1"
BILLING_MODE="PAY_PER_REQUEST"

echo "========================================"
echo "DynamoDB Migration Setup"
echo "Region: $REGION"
echo "Billing Mode: $BILLING_MODE"
echo "========================================"
echo ""

# Function to check if table exists
table_exists() {
    aws dynamodb describe-table --table-name "$1" --region "$REGION" &>/dev/null
    return $?
}

# Function to wait for table to be active
wait_for_table() {
    echo "  Waiting for table $1 to become ACTIVE..."
    aws dynamodb wait table-exists --table-name "$1" --region "$REGION"
    echo "  ✓ Table $1 is ACTIVE"
}

# ============================================
# TABLE 1: DayByDay-Main
# ============================================
echo "Creating Table 1: DayByDay-Main (Users, Connections, Partnerships)"

if table_exists "DayByDay-Main"; then
    echo "  ⚠ Table DayByDay-Main already exists, skipping..."
else
    aws dynamodb create-table \
        --table-name DayByDay-Main \
        --attribute-definitions \
            AttributeName=PK,AttributeType=S \
            AttributeName=SK,AttributeType=S \
            AttributeName=GSI1PK,AttributeType=S \
            AttributeName=GSI2PK,AttributeType=S \
            AttributeName=GSI3PK,AttributeType=S \
            AttributeName=GSI3SK,AttributeType=S \
            AttributeName=GSI4PK,AttributeType=S \
            AttributeName=GSI4SK,AttributeType=S \
            AttributeName=GSI5PK,AttributeType=S \
            AttributeName=GSI5SK,AttributeType=S \
        --key-schema \
            AttributeName=PK,KeyType=HASH \
            AttributeName=SK,KeyType=RANGE \
        --billing-mode "$BILLING_MODE" \
        --stream-specification StreamEnabled=true,StreamViewType=NEW_AND_OLD_IMAGES \
        --global-secondary-indexes \
            "[
                {
                    \"IndexName\": \"GSI1-ByUsername\",
                    \"KeySchema\": [
                        {\"AttributeName\": \"GSI1PK\", \"KeyType\": \"HASH\"}
                    ],
                    \"Projection\": {\"ProjectionType\": \"ALL\"}
                },
                {
                    \"IndexName\": \"GSI2-ByEmail\",
                    \"KeySchema\": [
                        {\"AttributeName\": \"GSI2PK\", \"KeyType\": \"HASH\"}
                    ],
                    \"Projection\": {\"ProjectionType\": \"ALL\"}
                },
                {
                    \"IndexName\": \"GSI3-ByConnectionUid\",
                    \"KeySchema\": [
                        {\"AttributeName\": \"GSI3PK\", \"KeyType\": \"HASH\"},
                        {\"AttributeName\": \"GSI3SK\", \"KeyType\": \"RANGE\"}
                    ],
                    \"Projection\": {\"ProjectionType\": \"ALL\"}
                },
                {
                    \"IndexName\": \"GSI4-ByPartnershipUid\",
                    \"KeySchema\": [
                        {\"AttributeName\": \"GSI4PK\", \"KeyType\": \"HASH\"},
                        {\"AttributeName\": \"GSI4SK\", \"KeyType\": \"RANGE\"}
                    ],
                    \"Projection\": {\"ProjectionType\": \"ALL\"}
                },
                {
                    \"IndexName\": \"GSI5-ByStreakScore\",
                    \"KeySchema\": [
                        {\"AttributeName\": \"GSI5PK\", \"KeyType\": \"HASH\"},
                        {\"AttributeName\": \"GSI5SK\", \"KeyType\": \"RANGE\"}
                    ],
                    \"Projection\": {
                        \"ProjectionType\": \"INCLUDE\",
                        \"NonKeyAttributes\": [\"uid\", \"currentStreak\", \"longestStreak\", \"lastEntryDate\"]
                    }
                }
            ]" \
        --region "$REGION" \
        --no-cli-pager \
        > /dev/null

    echo "  ✓ Table DayByDay-Main created"
    wait_for_table "DayByDay-Main"
fi

echo ""

# ============================================
# TABLE 2: DayByDay-Content
# ============================================
echo "Creating Table 2: DayByDay-Content (Entries, Trips, Shares, Prompts)"

if table_exists "DayByDay-Content"; then
    echo "  ⚠ Table DayByDay-Content already exists, skipping..."
else
    aws dynamodb create-table \
        --table-name DayByDay-Content \
        --attribute-definitions \
            AttributeName=PK,AttributeType=S \
            AttributeName=SK,AttributeType=S \
            AttributeName=GSI1PK,AttributeType=S \
            AttributeName=GSI1SK,AttributeType=S \
            AttributeName=GSI2PK,AttributeType=S \
            AttributeName=GSI3PK,AttributeType=S \
            AttributeName=GSI3SK,AttributeType=S \
            AttributeName=GSI4PK,AttributeType=S \
            AttributeName=GSI4SK,AttributeType=S \
            AttributeName=GSI5PK,AttributeType=S \
            AttributeName=GSI5SK,AttributeType=S \
        --key-schema \
            AttributeName=PK,KeyType=HASH \
            AttributeName=SK,KeyType=RANGE \
        --billing-mode "$BILLING_MODE" \
        --stream-specification StreamEnabled=true,StreamViewType=NEW_AND_OLD_IMAGES \
        --global-secondary-indexes \
            "[
                {
                    \"IndexName\": \"GSI1-BySharedWithUid\",
                    \"KeySchema\": [
                        {\"AttributeName\": \"GSI1PK\", \"KeyType\": \"HASH\"},
                        {\"AttributeName\": \"GSI1SK\", \"KeyType\": \"RANGE\"}
                    ],
                    \"Projection\": {\"ProjectionType\": \"ALL\"}
                },
                {
                    \"IndexName\": \"GSI2-ByPublicToken\",
                    \"KeySchema\": [
                        {\"AttributeName\": \"GSI2PK\", \"KeyType\": \"HASH\"}
                    ],
                    \"Projection\": {\"ProjectionType\": \"ALL\"}
                },
                {
                    \"IndexName\": \"GSI3-ByEntryId\",
                    \"KeySchema\": [
                        {\"AttributeName\": \"GSI3PK\", \"KeyType\": \"HASH\"},
                        {\"AttributeName\": \"GSI3SK\", \"KeyType\": \"RANGE\"}
                    ],
                    \"Projection\": {\"ProjectionType\": \"ALL\"}
                },
                {
                    \"IndexName\": \"GSI4-ByTripId\",
                    \"KeySchema\": [
                        {\"AttributeName\": \"GSI4PK\", \"KeyType\": \"HASH\"},
                        {\"AttributeName\": \"GSI4SK\", \"KeyType\": \"RANGE\"}
                    ],
                    \"Projection\": {\"ProjectionType\": \"ALL\"}
                },
                {
                    \"IndexName\": \"GSI5-AllEntries\",
                    \"KeySchema\": [
                        {\"AttributeName\": \"GSI5PK\", \"KeyType\": \"HASH\"},
                        {\"AttributeName\": \"GSI5SK\", \"KeyType\": \"RANGE\"}
                    ],
                    \"Projection\": {\"ProjectionType\": \"KEYS_ONLY\"}
                }
            ]" \
        --region "$REGION" \
        --no-cli-pager \
        > /dev/null

    echo "  ✓ Table DayByDay-Content created"
    wait_for_table "DayByDay-Content"
fi

echo ""

# ============================================
# TABLE 3: DayByDay-Social
# ============================================
echo "Creating Table 3: DayByDay-Social (Reactions, Comments, Counts)"

if table_exists "DayByDay-Social"; then
    echo "  ⚠ Table DayByDay-Social already exists, skipping..."
else
    aws dynamodb create-table \
        --table-name DayByDay-Social \
        --attribute-definitions \
            AttributeName=PK,AttributeType=S \
            AttributeName=SK,AttributeType=S \
            AttributeName=GSI1PK,AttributeType=S \
            AttributeName=GSI1SK,AttributeType=S \
            AttributeName=GSI2PK,AttributeType=S \
            AttributeName=GSI2SK,AttributeType=S \
        --key-schema \
            AttributeName=PK,KeyType=HASH \
            AttributeName=SK,KeyType=RANGE \
        --billing-mode "$BILLING_MODE" \
        --stream-specification StreamEnabled=true,StreamViewType=NEW_AND_OLD_IMAGES \
        --global-secondary-indexes \
            "[
                {
                    \"IndexName\": \"GSI1-ByReactorUid\",
                    \"KeySchema\": [
                        {\"AttributeName\": \"GSI1PK\", \"KeyType\": \"HASH\"},
                        {\"AttributeName\": \"GSI1SK\", \"KeyType\": \"RANGE\"}
                    ],
                    \"Projection\": {
                        \"ProjectionType\": \"INCLUDE\",
                        \"NonKeyAttributes\": [\"entryId\", \"emoji\", \"createdAt\"]
                    }
                },
                {
                    \"IndexName\": \"GSI2-ByCommenterUid\",
                    \"KeySchema\": [
                        {\"AttributeName\": \"GSI2PK\", \"KeyType\": \"HASH\"},
                        {\"AttributeName\": \"GSI2SK\", \"KeyType\": \"RANGE\"}
                    ],
                    \"Projection\": {
                        \"ProjectionType\": \"INCLUDE\",
                        \"NonKeyAttributes\": [\"entryId\", \"commentId\", \"commentText\", \"isDeleted\"]
                    }
                }
            ]" \
        --region "$REGION" \
        --no-cli-pager \
        > /dev/null

    echo "  ✓ Table DayByDay-Social created"
    wait_for_table "DayByDay-Social"
fi

echo ""

# ============================================
# TABLE 4: DayByDay-Feed
# ============================================
echo "Creating Table 4: DayByDay-Feed (Activity Feed)"

if table_exists "DayByDay-Feed"; then
    echo "  ⚠ Table DayByDay-Feed already exists, skipping..."
else
    aws dynamodb create-table \
        --table-name DayByDay-Feed \
        --attribute-definitions \
            AttributeName=PK,AttributeType=S \
            AttributeName=SK,AttributeType=S \
        --key-schema \
            AttributeName=PK,KeyType=HASH \
            AttributeName=SK,KeyType=RANGE \
        --billing-mode "$BILLING_MODE" \
        --stream-specification StreamEnabled=true,StreamViewType=NEW_AND_OLD_IMAGES \
        --region "$REGION" \
        --no-cli-pager \
        > /dev/null

    echo "  ✓ Table DayByDay-Feed created"
    wait_for_table "DayByDay-Feed"
fi

echo ""
echo "========================================"
echo "✓ All Tables Created Successfully!"
echo "========================================"
echo ""
echo "Summary:"
echo "  - DayByDay-Main (5 GSIs)"
echo "  - DayByDay-Content (5 GSIs)"
echo "  - DayByDay-Social (2 GSIs)"
echo "  - DayByDay-Feed (0 GSIs)"
echo ""
echo "Streams: Enabled on all tables"
echo "Billing Mode: Pay-per-request"
echo ""
echo "Next steps:"
echo "  1. Verify tables in AWS Console:"
echo "     https://us-west-1.console.aws.amazon.com/dynamodbv2/home?region=us-west-1#tables"
echo "  2. Create DynamoDB data access layer (db/dynamodb.js)"
echo "  3. Create streams processor Lambda function"
echo ""
