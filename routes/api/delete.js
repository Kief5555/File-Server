const path = require("path");
const fs = require("fs");
const mime = require("mime-types");

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
    db.get(
      "SELECT * FROM users WHERE username = ? AND password = ?",
      [req.headers.username, req.headers.password],
      (err, row) => {
        if (err) {
          console.error(err);
          res.status(500).send("Internal server error");
          return;
        }
        if (!row) {
          res.status(401).send("Unauthorized");
          return;
        }

        const folder = req.query.folder || "public";
        const filename = req.query.file;

        if (!filename) {
          res.status(500).send("Cannot find file");
          return;
        }

        const publicUploadPath = path.join(__dirname, "../../files/", folder);
        const filePath = path.join(publicUploadPath, filename);

        fs.access(filePath, fs.constants.F_OK, (err) => {
          if (err) {
            res.status(500).send("File or folder does not exist");
            return;
          }

          if (filename.endsWith("/")) {
            // If the filename ends with a '/', it's a folder
            fs.rmdir(filePath, { recursive: true }, (error) => {
              if (error) {
                res.status(500).send("Failed to delete folder");
              } else {
                res.json({ message: "Folder deleted successfully" });
              }
            });
          } else {
            // Otherwise, it's a file
            fs.unlink(filePath, (error) => {
              if (error) {
                res.status(500).send("Failed to delete file");
              } else {
                res.json({ message: "File deleted successfully" });
              }
            });
          }
        });
      }
    );
  },
};
