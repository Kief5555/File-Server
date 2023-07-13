const path = require("path");
const fs = require("fs");
const mime = require("mime-types");

const publicUploadPath = path
  .join(__dirname, "..", "..", "files", "public")
  .replace(/\\/g, "/");

function formatFileSize(size) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return size.toFixed(2) + " " + units[unitIndex];
}

module.exports = {
  Name: "Public Files",
  Route: "/files/public/*",
  Method: "GET",
  Log: "Console", // Set to 'File', 'Console', or 'Null'
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
      res.status(404).send("File not found.");
      return;
    }
    const stats = fs.statSync(filePath);
    if (stats.isDirectory()) {
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
          //Check if file or folder and set boolean true if folder
          let isDirectoryFile = false;

          if (stat.isDirectory()) {
            fileSizeInBytes = "";
            folderName = folderName;
            isDirectoryFile = true;
          }

          //Remove the extra / at the end of the path
          const folder = path.join("public", req.params[0]).replace(/\/+$/, "");
          fileData.push({
            filename: file,
            mimetype: mimetype || "unknown",
            size: fileSizeInBytes,
            folder: folder,
            isDirectoryFile: isDirectoryFile,
          });
        });

        res.render("files", {
          files: fileData,
          formatFileSize,
          currentDirectory: path.join("public", req.params[0]),
        });
      });
      return;
    }

    // If requested path is not a directory, serve the file
    if (!fs.existsSync(filePath)) {
      res.status(404).send("File not found.");
      return;
    }

    const ext = path.extname(filePath);
    if (
      [
        ".html",
        ".json",
        ".txt",
        ".mov",
        ".jpg",
        ".png",
        ".jpeg",
        ".mp4",
      ].includes(ext)
    ) {
      // If file has .html, .json, or .txt extension, render it
      res.sendFile(filePath);
    } else {
      try {
        const filename = path.basename(filePath);

        res.download(filePath, (err) => {
          if (err) {
            // Handle error, but keep in mind the response may be partially-sent
            // so check res.headersSent
            console.error(err);
          } else {
            // decrement a download credit, etc.
          }
        });
      } catch {
        res.status(500).send("Internal server error (File not found?)");
      }
    }
  },
};
