const path = require("path");
const fs = require("fs");
const mime = require("mime-types");

const publicUploadPath = path.join(__dirname, "..", "..", "files", "public");
module.exports = {
  Name: "API",
  Route: "/api/files/public/*",
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
    const filePath = path.resolve(publicUploadPath, req.params[0]);
    // Check if requested path is a directory
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ message: "File not found." });
      return;
    }
    fs.readdir(filePath, (err, files) => {
      if (err) {
        console.error(err);
        res.status(500).send("Internal server error");
        return;
      }

      const fileData = [];

      files.forEach((file) => {
        const filePath = path.join(publicUploadPath, req.params[0], file);
        const stat = fs.statSync(filePath);
        const mimetype = mime.lookup(filePath);
        let fileSizeInBytes = stat.size;
        let folderName = path.basename(publicUploadPath);

        if (stat.isDirectory()) {
          fileSizeInBytes = "";
          folderName = folderName;
          isDirectoryFile = true;
        }

        //Remove the extra / at the end of the path
        const folder = path.join("public", req.params[0]).replace(/\/$/, "");
        fileData.push({
          filename: file,
          mimetype: mimetype || "unknown",
          size: fileSizeInBytes,
          folder: folder,
          downloadURL: `https://files.printedwaste.live/files/public/${req.params[0]}${file}`,
        });
      });
      // Sort directories and regular files alphabetically
      fileData.sort((a, b) => a.filename.localeCompare(b.filename));

      res.json({ Files: fileData });
    });
  },
};
