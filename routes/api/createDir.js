const path = require("path");
const fs = require("fs");
const mime = require("mime-types");

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
        [req.headers.username, req.headers.password],
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
          //create directory
          
        }
      );
  },
};
