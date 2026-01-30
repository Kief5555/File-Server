# File Server

A modern, feature-rich file server built with Next.js, providing file management, user authentication, permissions, and API access.

## Features

- 📁 **File Management**: Browse, upload, download, rename, and delete files
- 🔐 **User Authentication**: Secure login system with JWT tokens
- 👥 **User Management**: Admin panel for creating users and managing permissions
- 🔑 **Permissions System**: Granular permissions for upload, delete, and private folder access
- 🔒 **Private Folders**: Password-protected private file access
- 🔗 **File Sharing**: Generate shareable links with optional passwords
- 🔑 **API Keys**: Programmatic access via API keys
- 🎨 **Modern UI**: Clean, responsive interface with dark mode support
- 📱 **Mobile Friendly**: Fully responsive design
- 🖼️ **File Previews**: Preview images, videos, audio, and text files
- 🔍 **Search & Filter**: Search files and filter by type

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm, yarn, pnpm, or bun

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd File-Server
```

2. Install dependencies:
```bash
npm install
# or
yarn install
# or
pnpm install
```

3. Create the initial admin user:
```bash
node create-user.js <username> <password>
```

This will:
- Create the database and tables if they don't exist
- Create a new admin user with full permissions

4. Start the development server:
```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser

## Project Structure

```
File-Server/
├── src/
│   ├── app/              # Next.js app router pages
│   │   ├── admin/        # Admin panel
│   │   ├── api/          # API routes
│   │   ├── explorer/     # File explorer UI
│   │   ├── files/        # File serving routes
│   │   └── login/        # Login page
│   ├── components/       # React components
│   │   ├── FileExplorer.tsx
│   │   └── ui/           # shadcn/ui components
│   └── lib/              # Utilities
│       ├── auth.ts       # Authentication logic
│       ├── db.ts         # Database setup
│       └── files.ts      # File operations
├── database/             # SQLite database
├── files/               # User files
│   ├── public/          # Public files
│   └── private/         # Private files
└── create-user.js       # User creation script
```

## User Management

### Creating Users

Use the `create-user.js` script to create new admin users:

```bash
node create-user.js username password
```

All users created via this script are admins with full permissions.

### Managing Users

1. Log in as an admin user
2. Navigate to `/admin`
3. Use the "Users" tab to:
   - Create new users with specific permissions
   - Toggle permissions (upload, delete, private access)
   - Delete users

### Permissions

- **Can Upload**: Allows user to upload files
- **Can Delete**: Allows user to delete files
- **Access Private**: Allows user to access the private folder
- **Admin**: Full access to admin panel and all features

## API Access

### API Keys

1. Log in and go to `/admin` → "API Keys" tab
2. Create a new API key (optionally with a name)
3. **Important**: Copy the key immediately - it won't be shown again!

### Using API Keys

Include the API key in the `Authorization` header:

```bash
curl -H "Authorization: Bearer fs_YOUR_API_KEY_HERE" \
  https://yourserver.com/api/files/public
```

### API Endpoints

- `GET /api/files/[...path]` - List files in a directory
- `GET /api/files/[...path]?download=1` - Download a file
- `POST /api/upload` - Upload a file
- `POST /api/delete` - Delete a file
- `POST /api/rename` - Rename a file
- `POST /api/share` - Create a shareable link
- `GET /api/api-keys` - List your API keys
- `POST /api/api-keys` - Create a new API key
- `DELETE /api/api-keys` - Delete an API key

## File Sharing

1. Right-click on any file → "Share"
2. Optionally set a password
3. Copy the generated link (format: `/u/randomid`)
4. Share the link - recipients can view/download the file

## Private Folder Access

### Password Protection

Admins can set a password for the private folder in `/admin` → "Settings":
- Set a password to allow URL-based access: `?password=yourpassword`
- Example: `example.com/files/private/file.png?password=yourpassword`

### User Permissions

Users with "Access Private" permission can access private files when logged in.

## Configuration

### Environment Variables

Create a `.env.local` file:

```env
JWT_SECRET=your-secret-key-change-it
NODE_ENV=production
```

### Database

The database is automatically created at `database/users.sqlite`. The `create-user.js` script will create all necessary tables if they don't exist.

## Development

### Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **Database**: SQLite (better-sqlite3)
- **Authentication**: JWT tokens
- **UI**: React, Tailwind CSS, shadcn/ui
- **Icons**: Lucide React

### Scripts

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run start    # Start production server
```

## Security Notes

- API keys are hashed with SHA-256 before storage
- Passwords are hashed with bcrypt (10 rounds)
- JWT tokens expire after 7 days
- Private folder access requires permission or password
- All file operations are permission-checked

## License

[Add your license here]

## Contributing

[Add contribution guidelines here]
