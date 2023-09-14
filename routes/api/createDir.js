const path = require("path");
const fs = require("fs");
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
    db.get(
      'SELECT * FROM users WHERE username = ? AND password = ?',
      [req.body.username, req.body.password],
      (err, row) => {
        if (err) {
          console.error(err);
          res.status(500).send('Internal server error');
          return;
        }
        if (!row) {
          res.status(401).send('Unauthorized');
          return;
        }

        // Create a directory based on the URL path
        const dirPath = path.join(publicUploadPath, req.params[0]);

        fs.mkdir(dirPath, { recursive: true }, (mkdirErr) => {
          if (mkdirErr) {
            res.status(500).send('Error creating directory');
            return;
          }

          res.json({ message: 'Directory created successfully' });
        });
      }
    );
  },
};
