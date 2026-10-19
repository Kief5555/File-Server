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
- 🔍 **Search & Filter**: Search the whole current directory, filter by type, and use natural filename sorting
- ⚡ **Large Folders**: Bounded filesystem work and 100-item pages keep browsing responsive
- 📤 **Batch Uploads**: Select multiple files or drop them into the explorer; track transfer speed and cancel the queue
- 📁 **Create Folders**: Create folders directly in the explorer with upload permission
- 💾 **Saved Preferences**: Remember grid/list view, sorting, and preview settings in this browser
- ⌨️ **Quick Search**: Press `/` to focus search; refresh a listing without navigating away

## Getting Started

### Prerequisites

- Node.js 22.13 or newer
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
- `POST /api/upload` - Upload a file or stage/finalize chunked uploads
- `DELETE /api/upload?identifier=...` - Remove the current user's upload staging files
- `POST /api/folders` - Create a folder (`{ "path": "public", "name": "New folder" }`)
- `POST /api/delete` - Delete a file
- `POST /api/rename` - Rename a file
- `POST /api/share` - Create a shareable link
- `GET /api/api-keys` - List your API keys
- `POST /api/api-keys` - Create a new API key
- `DELETE /api/api-keys` - Delete an API key

## Browsing and Upload Performance

The `files` directory and its `public`/`private` roots may be symlinks to other storage volumes. Their startup targets are trusted; nested symlinks must remain inside their respective managed root. Internal staging paths are excluded from file routes.

Folder listings inspect immediate children with at most 32 concurrent metadata reads. Folder `size` is now `null` in the listing API and displayed as **Folder**: recursive totals are no longer calculated while opening a directory. File sizes remain byte counts. Directory responses use `private, no-store` so refresh reflects disk changes.

The explorer displays up to 100 items per page; search and filters apply to the entire current directory. Sorting is memoized, search is deferred while typing, and folder links do not automatically prefetch every visible directory. Empty folders use the server listing without a duplicate client request.

Text hover previews read at most 8 KiB and display 2,000 characters. File responses stream with byte-range support, ETags, Last-Modified, conditional requests and HEAD handling. HTML and SVG retain download-only behavior.

The uploader processes files in a queue with three parallel 5 MiB chunks per file, bounded retries, live progress, and an explicit finalization step. Each chunk is published atomically; finalization verifies lengths before replacing the destination. Existing filenames are replaced after successful completion. Empty files are supported. Cancellation stops remaining transfers; files already committed remain. Ordinary errors/cancellation remove staged chunks; abrupt browser/server termination can leave staging under `files/.temp-uploads/` for manual cleanup when no uploads are active.

For chunked API clients, send `identifier`, `fileName`, `fileSize`, `chunkSize`, `totalChunks`, `chunkIndex`, `file` and `deferMerge=true`. After all chunks succeed, send the same metadata with `finalize=true` and no file. Finalization can be retried with the same identifier. Use DELETE to clear staging after receiving success or cancelling. Clients without `deferMerge` retain automatic assembly. Upload identifiers are scoped to the authenticated user.

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

- **Framework**: Next.js 16.4 / React 19.3 (App Router)
- **Database**: SQLite (better-sqlite3)
- **Authentication**: JWT tokens
- **UI**: React, Tailwind CSS, shadcn/ui
- **Icons**: Lucide React

### Scripts

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run start    # Start production server
npm run lint     # Lint source
npm run typecheck
npm test         # Filesystem, upload assembly, and streaming regression tests
npm run test:integration # After build: API tests with isolated temporary files/database
npm run benchmark # Temporary 2400-file fixture; compares uncached recursive listing
```

The lockfile updates Next.js, React, Radix, Tailwind, SQLite and other dependencies. Unused runtime packages were removed. TypeScript stays on 5.9 and ESLint on 9.39 because the installed Next lint plugins do not yet declare ESLint 10 support. PostCSS is pinned to 8.5.31. `npm audit --omit=dev` reports no production advisories; five development dependency advisories remain through the lint toolchain's unpatched `braces` dependency.

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
