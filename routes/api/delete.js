const path = require("path");
const fs = require("fs");
const mime = require("mime-types");
const bcrypt = require('bcrypt'); // Import bcrypt

module.exports = {
  Name: "API - Delete File",
  Route: "/api/delete/",
  Method: "POST",
  Log: "File", // Set to 'File', 'Console', or 'Null'
  Sqlite: "users.sqlite",
  /**
   * Handle the request.
   * @param {import('express').Request} req - The request object.
   * @param {import('express').Response} res - The response object.
   * @param {import('sqlite3').Database} db - The database connection object.
   */
  async handle(req, res, db) {
    const username = req.headers.username;
    const password = req.headers.password;

    // Retrieve the user's hashed password from the database
    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, row) => {
      if (err) {
        console.error(err);
        res.status(500).send('Internal server error');
        return;
      }

      if (!row) {
        res.status(401).send('Unauthorized');
        return;
      }

      // Compare the provided password with the hashed password from the database
      try {
        const passwordMatch = await bcrypt.compare(password, row.password);

        if (!passwordMatch) {
          res.status(401).send('Authentication failed');
          return;
        }

        // Authentication successful, proceed with file/folder deletion logic
        const folder = req.query.folder || 'public';
        const filename = req.query.file;

        if (!filename) {
          res.status(500).send('Cannot find file');
          return;
        }

        const publicUploadPath = path.join(__dirname, '../../files/', folder);
        const filePath = path.join(publicUploadPath, filename);

        fs.access(filePath, fs.constants.F_OK, (accessErr) => {
          if (accessErr) {
            res.status(500).send('File or folder does not exist');
            return;
          }

          if (filename.endsWith('/')) {
            // If the filename ends with a '/', it's a folder
            fs.rmdir(filePath, { recursive: true }, (deleteError) => {
              if (deleteError) {
                res.status(500).send('Failed to delete folder');
              } else {
                res.json({ message: 'Folder deleted successfully' });
              }
            });
          } else {
            // Otherwise, it's a file
            fs.unlink(filePath, (deleteError) => {
              if (deleteError) {
                res.status(500).send('Failed to delete file');
              } else {
                res.json({ message: 'File deleted successfully' });
              }
            });
          }
        });
      } catch (compareErr) {
        console.error(compareErr);
        res.status(500).send('Authentication error');
      }
    });
  },
};
