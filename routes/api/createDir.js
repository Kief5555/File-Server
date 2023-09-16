const path = require("path");
const fs = require("fs");
const mime = require("mime-types");
const bcrypt = require('bcrypt'); // Import bcrypt

const publicUploadPath = path.join(__dirname, "..", "..", "files", "public");

module.exports = {
  Name: "API - Create Directory",
  Route: "/api/createDir/*",
  Method: "GET",
  Log: null, // Set to 'File', 'Console', or 'Null'
  Sqlite: null,
  /**
   * Handle the request.
   * @param {import('express').Request} req - The request object.
   * @param {import('express').Response} res - The response object.
   * @param {import('sqlite3').Database} db - The database connection object.
   */
  async handle(req, res, db) {
    // Authorize user (username and password in headers)
    // If not authorized, return 401

    const username = req.headers.username;
    const password = req.headers.password;

    // Retrieve the user's hashed password from the database
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
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
      bcrypt.compare(password, row.password, (compareErr, result) => {
        if (compareErr) {
          console.error(compareErr);
          res.status(500).send('Authentication error');
          return;
        }

        if (!result) {
          res.status(401).send('Authentication failed');
          return;
        }

        // Once authenticated, continue with directory creation logic
        const dirPath = path.join(publicUploadPath, req.params[0]);

        fs.mkdir(dirPath, { recursive: true }, (mkdirErr) => {
          if (mkdirErr) {
            res.status(500).send('Error creating directory');
            return;
          }

          res.json({ message: 'Directory created successfully' });
        });
      });
    });
  },
};
