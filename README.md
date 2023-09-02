# File-Server

#### ~~this is the project that contributes mostly to my html github stats~~



PrintedWaste File Server is a Node.js-based file server with an API for file management, including uploading, downloading, and deleting files. It provides a simple and secure way to manage files and folders on a server.

## Features

- File upload: Easily upload files to the server using a custom upload page.
- File retrieval: Retrieve files from the server using intuitive navigation through folders and directories.
- File deletion: Delete files from the server using the provided API.
- Login system: Secure access to file management features using a login system.

## Getting Started

### Prerequisites

- Node.js (version 16.16.0) or LTS
- npm (version v7. 10.0) or LTS

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/your-username/File-server.git
    ```
2. Install the dependencies:
   ```
   cd File-server
   npm install
   ```
3. Start the server:
```node ./index.js```
The file server should now be running and accessible at `http://localhost:3000.`


## Config
- `/config/expections.json`, this is where you configure what files are allowed through /files/private/*. Keep in mind these are file extensions
- `/config/config.json`, this is where you configure the server. 
 There is `Roatating`, that tells the server for the `/private/` folder to use 1 time passwords generated through `/auth/key/create`

## API Endpoints
The file server provides the following API endpoints:
- `GET /api/files/public/*` Get a list of files and folders and information about them.
- `POST /api/upload/` Upload a file to the server.
- `POST /api/delete/*` Delete a file from the server.
- `POST /api/createDir/*` Create a directory on the server.
- `POST /auth/key/create` Create a one-time password for the private folder/files.

## License
This project is licensed under the [MIT License](https://choosealicense.com/licenses/mit/)
```
Feel free to customize the content, add additional sections, or modify it to match your specific project requirements.
```
