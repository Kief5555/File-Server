const fs = require("fs");
const path = require("path");
const mime = require("mime-types");


const publicUploadPath = path
  .join('./', "files", "public")
  .replace(/\/+$/, ""); // replace trailing slash

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
  Name: "Main",
  Route: "/",
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
    //if public folder does not exist, create it
    if (!fs.existsSync(publicUploadPath)) {
      fs.mkdirSync(publicUploadPath);
    }
    fs.readdir(publicUploadPath, (err, files) => {
      if (err) {
        console.error(err);
        res.status(500).send("Internal server error");
        return;
      }

      const fileData = [];
      const directories = [];
      const regularFiles = [];

      files.forEach((file) => {
        const filePath = path.join(publicUploadPath, file);
        const stat = fs.statSync(filePath);
        const mimetype = mime.lookup(filePath);
        let fileSizeInBytes = stat.size;
        let folderName = path.basename(publicUploadPath);
        let isDirectoryFile = false;
        let filename = file;

        if (stat.isDirectory()) {
          fileSizeInBytes = "";
          folderName = folderName + "/";
          isDirectoryFile = true;
          filename = file + "/";
          directories.push({
            filename: filename,
            mimetype: mimetype || "unknown",
            size: fileSizeInBytes,
            folder: path.join("public"),
            isDirectoryFile: isDirectoryFile,
          });
        } else {
          regularFiles.push({
            filename: filename,
            mimetype: mimetype || "unknown",
            size: fileSizeInBytes,
            folder: path.join("public"),
            isDirectoryFile: isDirectoryFile,
          });
        }
      });

      // Sort directories and regular files alphabetically
      directories.sort((a, b) => a.filename.localeCompare(b.filename));
      regularFiles.sort((a, b) => a.filename.localeCompare(b.filename));

      // Combine directories and regular files
      const sortedFiles = [...directories, ...regularFiles];

      res.render("files", {
        files: sortedFiles,
        formatFileSize,
        currentDirectory: path.join("public"),
      });
    });
  },
};
