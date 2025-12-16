# Day by Day Journal - Infrastructure & API Reference

This document provides comprehensive context for Claude Code when working with this project.

---

## Project Overview

**Day by Day** is a personal journaling web application with social features including friend connections, entry sharing, reactions, comments, streaks, and accountability partners.

**Tech Stack:**
- Frontend: Vanilla HTML/CSS/JS (hosted on AWS Amplify)
- Backend: AWS Lambda (Node.js 18.x)
- Database: MySQL 8.0 on AWS RDS
- Authentication: AWS Cognito with Google OAuth
- Storage: AWS S3 for images
- Notifications: AWS SES (email), AWS SNS (SMS)

---

## AWS Account & Region

| Resource | Value |
|----------|-------|
| AWS Account ID | `965819273626` |
| Region | `us-west-1` (N. California) |
| IAM User | `kevin-dev` |

### CLI Access
All AWS services are accessible via `aws-cli`:
```bash
# Verify credentials
aws sts get-caller-identity

# Common operations
aws lambda update-function-code --function-name journalLambdafunc --zip-file fileb://function.zip --region us-west-1
aws s3 cp file.txt s3://daybyday-journal-images/
aws ses send-email --region us-west-1 ...
```

---

## AWS Services

### Lambda Function
| Property | Value |
|----------|-------|
| Function Name | `journalLambdafunc` |
| Runtime | Node.js 18.x |
| Handler | `index.handler` |
| Timeout | 60 seconds |
| Memory | 128 MB |
| VPC | `vpc-70505e17` |
| Subnets | `subnet-be936ad8`, `subnet-9c584dc7` |
| Security Group | `sg-9b7d46e7` |

**Environment Variables:**
```
S3_BUCKET=daybyday-journal-images
RDS_HOSTNAME=journaldb.cwzjhkgs6o1v.us-west-1.rds.amazonaws.com
RDS_USERNAME=admin
RDS_PASSWORD=JournalDb2024Secure!
SES_SENDER_EMAIL=kevinleems@outlook.com
```

**Deployment:**
```bash
cd backend/lambdaFunction/journalLambdafunc
zip -r function.zip index.js node_modules/
aws lambda update-function-code \
  --function-name journalLambdafunc \
  --zip-file fileb://function.zip \
  --region us-west-1
```

### RDS Database
| Property | Value |
|----------|-------|
| Instance ID | `journaldb` |
| Engine | MySQL 8.0 |
| Instance Class | `db.t3.micro` |
| Database Name | `journaldb` |
| Endpoint | `journaldb.cwzjhkgs6o1v.us-west-1.rds.amazonaws.com:3306` |
| Username | `admin` |
| Storage | 20 GB |

### S3 Buckets
| Bucket | Purpose |
|--------|---------|
| `daybyday-journal-images` | User-uploaded images for journal entries |

**Image URL Pattern:**
```
https://daybyday-journal-images.s3.us-west-1.amazonaws.com/entries/{uid}/{timestamp}-{random}.{ext}
```

### Cognito
| Property | Value |
|----------|-------|
| User Pool ID | `us-west-1_81HBZnH92` |
| User Pool Name | `DayByDay-Journal` |
| Client ID | `7t77oqaipn9hldtdpesvde3eka` |
| Auth Domain | `daybyday-journal.auth.us-west-1.amazoncognito.com` |
| OAuth Providers | Google |

### SES (Email)
| Property | Value |
|----------|-------|
| Verified Identity | `kevinleems@outlook.com` |
| Region | `us-west-1` |

**Usage:** Friend request notifications, password resets

### SNS (SMS)
| Property | Value |
|----------|-------|
| Region | `us-west-1` |

**Usage:** Entry sharing notifications to verified phone numbers

---

## API Gateway

**Base URL:** `https://1t1byyi4x6.execute-api.us-west-1.amazonaws.com/default`

**Authentication:** Bearer token from Cognito in `Authorization` header

### API Endpoints

#### Health & System
| Method | Path | Description |
|--------|------|-------------|
| GET | `/journalLambdafunc/health` | Health check |
| POST | `/journalLambdafunc/init-schema` | Initialize database schema |
| POST | `/journalLambdafunc/run-migrations` | Run database migrations |

#### Entries
| Method | Path | Description |
|--------|------|-------------|
| GET | `/journalLambdafunc/entries` | List user's entries |
| POST | `/journalLambdafunc/entry` | Create new entry |
| PUT | `/journalLambdafunc/entry/{id}` | Update entry |
| DELETE | `/journalLambdafunc/entry/{id}` | Delete entry |
| POST | `/journalLambdafunc/sync` | Sync entries (batch upsert) |

#### Prompts
| Method | Path | Description |
|--------|------|-------------|
| GET | `/journalLambdafunc/prompts` | Get random prompt |
| POST | `/journalLambdafunc/prompt` | Add custom prompt |

#### Image Upload
| Method | Path | Description |
|--------|------|-------------|
| POST | `/journalLambdafunc/upload-url` | Get presigned S3 upload URL |

#### User Profile
| Method | Path | Description |
|--------|------|-------------|
| GET | `/journalLambdafunc/users/profile` | Get user profile |
| PUT | `/journalLambdafunc/users/profile` | Update profile |
| GET | `/journalLambdafunc/users/search?q=` | Search users |
| GET | `/journalLambdafunc/users/discover?limit=&offset=` | Discover users |

#### Phone Verification
| Method | Path | Description |
|--------|------|-------------|
| GET | `/journalLambdafunc/users/phone` | Get phone status |
| POST | `/journalLambdafunc/users/phone` | Send verification code |
| POST | `/journalLambdafunc/users/phone/verify` | Verify code |

#### Connections (Friends)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/journalLambdafunc/connections` | List connections |
| GET | `/journalLambdafunc/connections/pending` | Pending requests |
| POST | `/journalLambdafunc/connections/request` | Send friend request |
| POST | `/journalLambdafunc/connections/{id}/accept` | Accept request |
| POST | `/journalLambdafunc/connections/{id}/decline` | Decline request |
| DELETE | `/journalLambdafunc/connections/{id}` | Remove connection |

#### Invite Links
| Method | Path | Description |
|--------|------|-------------|
| POST | `/journalLambdafunc/invite/create` | Create invite link |
| GET | `/journalLambdafunc/invite?token=` | Get invite info |
| POST | `/journalLambdafunc/invite/redeem` | Redeem invite |

#### Entry Sharing
| Method | Path | Description |
|--------|------|-------------|
| POST | `/journalLambdafunc/entry/{id}/share` | Create public share link |
| GET | `/journalLambdafunc/shared/{token}` | View public shared entry |
| DELETE | `/journalLambdafunc/shared/{token}` | Delete share link |
| POST | `/journalLambdafunc/entry/{id}/share-with` | Share with friends |
| GET | `/journalLambdafunc/entries/shared-with-me` | Entries shared with me |
| PUT | `/journalLambdafunc/entry-share/{id}/read` | Mark as read |
| GET | `/journalLambdafunc/entry/{id}/shared-view` | View shared entry (friends) |

#### Reactions & Comments
| Method | Path | Description |
|--------|------|-------------|
| POST | `/journalLambdafunc/entry/{id}/react` | Add reaction |
| DELETE | `/journalLambdafunc/entry/{id}/react/{emoji}` | Remove reaction |
| GET | `/journalLambdafunc/entry/{id}/reactions` | Get reactions |
| POST | `/journalLambdafunc/entry/{id}/comment` | Add comment |
| GET | `/journalLambdafunc/entry/{id}/comments` | Get comments |
| DELETE | `/journalLambdafunc/comment/{id}` | Delete comment |

#### Activity Feed
| Method | Path | Description |
|--------|------|-------------|
| GET | `/journalLambdafunc/feed` | Get activity feed |

#### Streaks
| Method | Path | Description |
|--------|------|-------------|
| GET | `/journalLambdafunc/streaks/me` | Get my streak |
| GET | `/journalLambdafunc/streaks/friends` | Friends leaderboard |

#### Accountability Partners
| Method | Path | Description |
|--------|------|-------------|
| GET | `/journalLambdafunc/accountability` | List partners |
| POST | `/journalLambdafunc/accountability/request` | Request partner |
| POST | `/journalLambdafunc/accountability/{id}/accept` | Accept request |
| DELETE | `/journalLambdafunc/accountability/{id}` | End partnership |

#### Account
| Method | Path | Description |
|--------|------|-------------|
| DELETE | `/journalLambdafunc/account` | Delete account |

---

## Database Schema

### users
```sql
CREATE TABLE users (
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
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### journal_entries
```sql
CREATE TABLE journal_entries (
  entry_id INT AUTO_INCREMENT PRIMARY KEY,
  firebase_uid VARCHAR(128) NOT NULL,
  date DATETIME NOT NULL,
  title VARCHAR(255) NOT NULL,
  text TEXT NOT NULL,
  prompt_id INT NULL,
  client_id VARCHAR(50) NULL,
  image_url VARCHAR(500),
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  location_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  is_deleted TINYINT(1) DEFAULT 0
);
```

### prompts
```sql
CREATE TABLE prompts (
  prompt_id INT AUTO_INCREMENT PRIMARY KEY,
  prompt TEXT NOT NULL,
  user_id INT NULL,
  firebase_uid VARCHAR(128) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### connections
```sql
CREATE TABLE connections (
  connection_id INT AUTO_INCREMENT PRIMARY KEY,
  requester_uid VARCHAR(128) NOT NULL,
  target_uid VARCHAR(128) NOT NULL,
  status ENUM('pending', 'accepted', 'declined', 'blocked') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_connection (requester_uid, target_uid)
);
```

### invite_links
```sql
CREATE TABLE invite_links (
  invite_id INT AUTO_INCREMENT PRIMARY KEY,
  invite_token VARCHAR(64) UNIQUE NOT NULL,
  creator_uid VARCHAR(128) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### shared_entries (public links)
```sql
CREATE TABLE shared_entries (
  share_id INT AUTO_INCREMENT PRIMARY KEY,
  share_token VARCHAR(64) UNIQUE NOT NULL,
  entry_id INT NOT NULL,
  owner_uid VARCHAR(128) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NULL,
  view_count INT DEFAULT 0
);
```

### entry_shares (friend sharing)
```sql
CREATE TABLE entry_shares (
  share_id INT AUTO_INCREMENT PRIMARY KEY,
  entry_id INT NOT NULL,
  owner_uid VARCHAR(128) NOT NULL,
  shared_with_uid VARCHAR(128) NOT NULL,
  shared_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_read TINYINT(1) DEFAULT 0,
  notified TINYINT(1) DEFAULT 0,
  UNIQUE KEY unique_share (entry_id, shared_with_uid)
);
```

### entry_reactions
```sql
CREATE TABLE entry_reactions (
  reaction_id INT AUTO_INCREMENT PRIMARY KEY,
  entry_id INT NOT NULL,
  reactor_uid VARCHAR(128) NOT NULL,
  emoji VARCHAR(10) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_reaction (entry_id, reactor_uid, emoji)
);
```

### entry_comments
```sql
CREATE TABLE entry_comments (
  comment_id INT AUTO_INCREMENT PRIMARY KEY,
  entry_id INT NOT NULL,
  commenter_uid VARCHAR(128) NOT NULL,
  parent_comment_id INT NULL,
  comment_text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  is_deleted TINYINT(1) DEFAULT 0
);
```

### user_streaks
```sql
CREATE TABLE user_streaks (
  streak_id INT AUTO_INCREMENT PRIMARY KEY,
  firebase_uid VARCHAR(128) NOT NULL UNIQUE,
  current_streak INT DEFAULT 0,
  longest_streak INT DEFAULT 0,
  last_entry_date DATE,
  streak_start_date DATE,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### accountability_partners
```sql
CREATE TABLE accountability_partners (
  partnership_id INT AUTO_INCREMENT PRIMARY KEY,
  user_uid VARCHAR(128) NOT NULL,
  partner_uid VARCHAR(128) NOT NULL,
  status ENUM('pending', 'active', 'ended') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_partnership (user_uid, partner_uid)
);
```

---

## Project Structure

```
website/
├── .claude/           # Claude Code settings
├── backend/
│   └── lambdaFunction/
│       └── journalLambdafunc/
│           ├── index.js       # Main Lambda handler (~3300 lines)
│           ├── package.json
│           └── node_modules/
├── journal/           # Frontend application
│   ├── index.html     # Landing page / auth
│   ├── dashboard.html # Main journal view
│   ├── dashboard.js   # Dashboard logic (~87KB)
│   ├── dashboard.css  # Dashboard styles (~36KB)
│   ├── feed.html      # Activity feed
│   ├── feed.js        # Feed logic
│   ├── feed.css       # Feed styles
│   ├── connections.html # Friends page
│   ├── connections.js  # Connections logic
│   ├── connections.css # Connections styles
│   ├── leaderboard.html # Streaks leaderboard
│   ├── leaderboard.js
│   ├── leaderboard.css
│   ├── shared.html    # Public shared entry view
│   ├── entry-view.html # Friend shared entry view
│   ├── styles.css     # Global styles (~33KB)
│   └── assets/        # Static assets
└── index.html         # Main website landing
```

---

## Frontend Architecture

### Authentication Flow
1. User clicks "Sign in with Google" on `index.html`
2. Redirects to Cognito hosted UI
3. On success, redirects to `dashboard.html` with tokens
4. Tokens stored in Amplify Auth session
5. All API calls include `Authorization: Bearer {idToken}`

### Key Frontend Files
- **dashboard.js**: Main journal CRUD, Quill editor, entry sharing, image upload
- **feed.js**: Activity feed, reactions, comments modal
- **connections.js**: Friend search, requests, discover users
- **leaderboard.js**: Streaks display, friends leaderboard

### Styling
- Dark theme with CSS variables
- Mobile-first responsive design
- Bottom navigation for mobile
- Glassmorphic UI elements

---

## Common Development Tasks

### Deploy Lambda
```bash
cd backend/lambdaFunction/journalLambdafunc
zip -r function.zip index.js node_modules/
aws lambda update-function-code \
  --function-name journalLambdafunc \
  --zip-file fileb://function.zip \
  --region us-west-1
rm function.zip
```

### Test API Endpoint
```bash
curl -X GET "https://1t1byyi4x6.execute-api.us-west-1.amazonaws.com/default/journalLambdafunc/health"
```

### View Lambda Logs
```bash
aws logs tail /aws/lambda/journalLambdafunc --follow --region us-west-1
```

### Check RDS Connection
```bash
aws rds describe-db-instances --db-instance-identifier journaldb --region us-west-1
```

---

## Security Notes

- All API endpoints require Cognito authentication (except `/health`, `/shared/{token}`)
- Database credentials are stored as Lambda environment variables
- S3 presigned URLs expire in 5 minutes
- Phone verification codes expire in 10 minutes
- Invite tokens are randomly generated 32-byte hex strings

---

## Emoji Reactions
Available reaction emojis: `['❤️', '🔥', '👏', '✨', '😢']`

---

## Contact & Resources

- **Cognito Console**: https://us-west-1.console.aws.amazon.com/cognito/v2/idp/user-pools/us-west-1_81HBZnH92
- **Lambda Console**: https://us-west-1.console.aws.amazon.com/lambda/home?region=us-west-1#/functions/journalLambdafunc
- **RDS Console**: https://us-west-1.console.aws.amazon.com/rds/home?region=us-west-1#database:id=journaldb
- **S3 Console**: https://s3.console.aws.amazon.com/s3/buckets/daybyday-journal-images
