# Portfolio Admin Panel Setup Guide

This admin panel allows you to upload and manage portfolio photos using **Cloudinary** for image storage and **Supabase** for authentication and metadata.

## Quick Start

### 1. Cloudinary Setup (5 min)

1. Create a free account at [cloudinary.com](https://cloudinary.com)
2. From your dashboard, note your **Cloud name** (e.g., `dxxxxxxxx`)
3. Create an unsigned upload preset:
   - Go to **Settings** → **Upload** → **Upload presets**
   - Click **Add upload preset**
   - Set **Signing Mode** to **Unsigned**
   - Set **Folder** to `portfolio`
   - Name it `portfolio_unsigned`
   - Save

### 2. Supabase Setup (5 min)

1. Create a free project at [supabase.com](https://supabase.com)
2. Note your **Project URL** and **anon/public key** (from Settings → API)
3. Run the SQL setup script:
   - Go to **SQL Editor** in Supabase dashboard
   - Open `supabase-setup.sql` from this folder
   - Click **Run** to create the photos table
4. Create an admin user:
   - Go to **Authentication** → **Users**
   - Click **Add user** → **Create new user**
   - Enter your email and password
   - Check **Auto confirm user**

### 3. Configure the App

Edit `/js/config.js` with your credentials:

```javascript
const CLOUDINARY_CLOUD_NAME = 'your-cloud-name';        // From Cloudinary dashboard
const CLOUDINARY_UPLOAD_PRESET = 'portfolio_unsigned';   // The preset you created

const SUPABASE_URL = 'https://xxx.supabase.co';         // Your project URL
const SUPABASE_ANON_KEY = 'eyJhbGc...';                 // Your anon key
```

### 4. Test It

1. Open `/admin/` in your browser
2. Log in with your Supabase credentials
3. Upload a test photo
4. Check the main portfolio page to see it

## File Structure

```
admin/
├── index.html          # Admin panel UI
├── admin.css           # Admin styles
├── admin.js            # Admin logic
├── supabase-setup.sql  # Database schema
└── README.md           # This file

js/
├── config.js           # Cloudinary + Supabase config
└── portfolio.js        # Dynamic image loading for public site
```

## Features

### Admin Panel (`/admin/`)
- **Login** - Secure authentication via Supabase
- **Upload** - Drag-and-drop image uploads to Cloudinary
- **Organize** - Assign photos to sections (gallery, bento, hero, etc.)
- **Categorize** - Tag photos (portrait, film, travel, etc.)
- **Reorder** - Drag-and-drop to reorder photos within sections
- **Edit** - Update title, alt text, category, section
- **Delete** - Remove photos (with confirmation)

### Public Site (`/`)
- Automatically loads optimized images from Cloudinary
- Falls back to static images if not configured
- Responsive images with srcset
- Auto WebP/AVIF format delivery

## Photo Sections

| Section | Description | Used For |
|---------|-------------|----------|
| `hero` | Main hero image | Hero section background |
| `featured` | Featured photograph | Featured section |
| `gallery` | Horizontal scroll gallery | "Selected Work" section |
| `bento` | Bento grid photos | 4-photo grid section |
| `projects` | Project card images | Project thumbnails |

## Photo Categories

- `portrait` - Portrait photography
- `film` - Film/analog photography
- `travel` - Travel photography
- `candid` - Candid/street moments
- `street` - Street photography
- `landscape` - Landscape photography

## Cloudinary URL Transformations

The system automatically applies optimizations:

```
Original: portfolio/photo123.jpg

Thumbnail (400px):
https://res.cloudinary.com/xxx/image/upload/w_400,c_fill,q_auto,f_auto/portfolio/photo123.jpg

Gallery (800px):
https://res.cloudinary.com/xxx/image/upload/w_800,q_80,f_auto/portfolio/photo123.jpg

Full resolution:
https://res.cloudinary.com/xxx/image/upload/q_auto,f_auto/portfolio/photo123.jpg
```

## Security

- **Cloudinary**: Uses unsigned uploads (admin-only access)
- **Supabase**: Row-level security ensures only authenticated users can write
- **No secrets in frontend**: Only public keys are exposed
- **Admin-only**: The `/admin/` page is not linked from the main site

## Troubleshooting

### "Supabase not configured"
- Check that `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set in `config.js`
- Ensure the URL starts with `https://`

### "Upload failed"
- Verify your Cloudinary cloud name is correct
- Check that the upload preset exists and is set to "unsigned"
- Ensure the preset has the correct folder path

### "Photos not loading on public site"
- Open browser console for errors
- Verify the Supabase anon key has read permissions
- Check that RLS policies allow public SELECT

### "Cannot login"
- Ensure you created a user in Supabase Authentication
- Check email/password are correct
- Verify the user is confirmed (auto-confirm or email verified)

## Free Tier Limits

### Cloudinary Free
- 25 GB storage
- 25 GB bandwidth/month
- Unlimited transformations

### Supabase Free
- 500 MB database
- 1 GB file storage
- 50,000 monthly active users
- Unlimited API requests

For a personal portfolio, these limits are more than sufficient.
