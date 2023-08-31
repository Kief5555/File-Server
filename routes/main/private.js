const path = require("path");
const fs = require("fs");
const mime = require("mime-types");
const exceptions = require("../../config/exceptions.json");
const privateUploadPath = path
    .join(__dirname, "..", "..", "files", "private")
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

require("dotenv").config();
module.exports = {
    Name: "Private Files",
    Route: "/files/private/*",
    Method: "GET",
    Log: "File", // Set to 'File', 'Console', or 'Null'
    Sqlite: null,
    /**
     * Handle the request.
     * @param {import('express').Request} req - The request object.
     * @param {import('express').Response} res - The response object.
     * @param {import('sqlite3').Database} db - The database connection object.
     */
    async handle(req, res, db) {
        const filePath = path.resolve(privateUploadPath, req.params[0]);
        // Check if requested path is a directory
        if (!fs.existsSync(filePath)) {
            res.status(404).sendFile(path.join(__dirname, "..", "..", "public", "FNF.html"));
            return;
        }
        const password = req.query.password;
        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) {
            fs.readdir(filePath, (err, files) => {
                if (err) {
                    console.error(err);
                    res.status(500).sendFile(path.join(__dirname, "..", "..", "public", "500.html"));
                    return;
                }

                const fileData = [];

                files.forEach((file) => {
                    const filePath = path.join(privateUploadPath, req.params[0], file);
                    const stat = fs.statSync(filePath);
                    const mimetype = mime.lookup(filePath);
                    let fileSizeInBytes = stat.size;
                    let folderName = path.basename(privateUploadPath);
                    //Check if file or folder and set boolean true if folder
                    let isDirectoryFile = false;

                    if (stat.isDirectory()) {
                        fileSizeInBytes = "";
                        folderName = folderName;
                        isDirectoryFile = true;
                    }

                    //Remove the extra / at the end of the path
                    const folder = path.join("private", req.params[0]).replace(/\/+$/, "");
                    fileData.push({
                        filename: file,
                        mimetype: mimetype || "unknown",
                        size: fileSizeInBytes,
                        folder: folder,
                        isDirectoryFile: isDirectoryFile,
                    });
                });
                if (password === process.env.PASSWORD) {
                res.render("files", {
                    files: fileData,
                    formatFileSize,
                    currentDirectory: path.join("private", req.params[0]),
                });
                 } else {
                res.status(404).sendFile(path.join(__dirname, "..", "..", "public", "FNF.html"));
                }
            });
            return;
        }
        // If requested path is not a directory, serve the file
        if (!fs.existsSync(filePath)) {
            res.status(404).sendFile(path.join(__dirname, "..", "..", "public", "FNF.html"));
            return;
        }
        const ext = path.extname(filePath);
        if (exceptions.Exceptions.includes(ext)) {
            //send the file as download because it is an exception
            try {
                res.download(filePath, (err) => {
                    if (err) {
                        console.error(err);
                    } else {
                    }
                });
            } catch {
                res.status(500).sendFile(path.join(__dirname, "..", "..", "public", "500.html"));
            }
            return;
        }
        if (password === process.env.PASSWORD) {
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

                    res.download(filePath, (err) => {
                        if (err) {
                            console.error(err);
                        } else {
                        }
                    });
                } catch {
                    res.status(500).sendFile(path.join(__dirname, "..", "..", "public", "500.html"));
                }
            }
        }
        else {
            res.status(403).sendFile(path.join(__dirname, "..", "..", "public", "403.html"));
        }
    },
};
