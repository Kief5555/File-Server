/******************************************************
 * Name: File Server
 * Author: Kiefer
 * Created: 4/37/2023 (MM/DD/YYYY)
 *****************************************************/

console.clear();
const express = require("express");
const multer = require("multer");
const path = require("path");
const app = express();
const cors = require("cors"); //CORS Policy
const fs = require("fs"); // File System
const winston = require("winston"); // Winston Logger
const chalk = require("chalk"); // Chalk for console colors. Non esm module, so no import. The verion for non esm chalk is 2.4.2
const mime = require("mime-types"); // Mime Types
const sqlite3 = require("sqlite3").verbose();
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
require("dotenv").config();

app.set("server.timeout", 300000);
app.set("view engine", "ejs");
app.use(cors()); //CORS Policy
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

const timezoned = () => {
  return new Date().toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
  });
};

const logger = winston.createLogger({
  transports: [
    new winston.transports.File({
      filename: "logs.log",
      level: "info",
      format: winston.format.combine(
        winston.format.timestamp({
          format: "MM/DD | h:mm A",
          // pass timezoned function here
          transform: timezoned,
        }),
        winston.format.printf((info) => {
          return `[${info.timestamp}] - ${info.message}`;
        })
      ),
    }),
  ],
});

const logRequest = () => {
  return (req, res, next) => {
    const method = req.method;
    const url = req.originalUrl;
    const start = new Date();
    res.on("finish", () => {
      const end = new Date();
      const status = res.statusCode;
      const responseTime = end - start;
      const formattedDate = chalk.blueBright(
        `${start.toLocaleDateString()} | ${start.toLocaleTimeString()}`
      );
      const formattedMethod = chalk.yellow(method);
      const formattedUrl = chalk.white(url);
      const formattedStatus =
        status >= 400 ? chalk.red(status) : chalk.green(status);
      const formattedResponseTime = chalk.white(`${responseTime}ms`);
      const logMessage = `${formattedDate} - ${formattedMethod} ${formattedUrl} ${formattedStatus} ${formattedResponseTime}`;
      logger.info(`${method} ${url} ${status} ${responseTime}ms`);
      console.log(logMessage);
    });
    next();
  };
};

function formatFileSize(size) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return size.toFixed(2) + " " + units[unitIndex];
}

const logFileRequest = () => {
  return (req, res, next) => {
    const method = req.method;
    const url = req.originalUrl;
    const start = new Date();
    res.on("finish", () => {
      const end = new Date();
      const status = res.statusCode;
      const responseTime = end - start;
      logger.info(`${method} ${url} ${status} ${responseTime}ms`);
    });
    next();
  };
};

// set up public and private upload directories
const publicUploadPath = path
  .join(__dirname, "uploads", "public")
  .replace(/\/+$/, ""); // replace trailing slash
const uploadPath = path.join(__dirname, "uploads");
const privateUploadPath = path.join(__dirname, "uploads", "private");

// create separate multer instances for public and private uploads
const publicUpload = multer({
  storage: multer.diskStorage({
    destination: publicUploadPath,
    filename: (req, file, cb) => {
      cb(null, `${file.originalname}`);
    },
  }),
});

const privateUpload = multer({
  storage: multer.diskStorage({
    destination: privateUploadPath,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${uuidv4()}${ext}`);
    },
  }),
});

const dbPath = path.join(__dirname, "users.db");
const db = new sqlite3.Database(dbPath);

// Create the users table in the file-based SQLite database
db.run("CREATE TABLE IF NOT EXISTS users (username TEXT, password TEXT)");

// Insert some test data into the users table

// Configure middleware for parsing request bodies and cookies
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

// Define the authorize function
function authorize(username, password, callback) {
  db.get(
    `SELECT * FROM users WHERE username = ? AND password = ?`,
    [username, password],
    (err, row) => {
      if (err) {
        callback(false);
      } else {
        if (row) {
          callback(true);
        } else {
          callback(false);
        }
      }
    }
  );
}

function authorizeMiddleware(req, res, next) {
  const username = req.cookies.username;
  const password = req.cookies.password;

  authorize(username, password, (authorized) => {
    if (authorized) {
      next();
    } else {
      // User is not authorized
      res.status(401).json({ message: "Unauthorized." });
    }
  });
}

// Define the login endpoint
app.post("/login", (req, res) => {
  const username = req.body.username;
  const password = req.body.password;

  authorize(username, password, (authorized) => {
    if (authorized) {
      res.cookie("username", username);
      res.cookie("password", password);
      res.status(200).json({
        message: "Login successful",
        username: username,
        password: password,
      });
    } else {
      res.status(401).json({ message: "Login failed" });
    }
  });
});

// Define the signup endpoint
app.post("/signup", (req, res) => {
  res.status(403).json({ message: "Signup is not available" });
  return;
  const username = req.body.username;
  const password = req.body.password;

  db.run(
    "INSERT INTO users (username, password) VALUES (?, ?)",
    [username, password],
    (err) => {
      if (err) {
        res.status(500).json({ message: "User already exists" });
      } else {
        res.cookie("username", username);
        res.cookie("password", password);
        res.status(200).json({ message: "User created" });
      }
    }
  );
});

app.get("/files/upload/public", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "upload.html"));
});

app.get("/files/public/*", (req, res) => {
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
  if ([".html", ".json", ".txt"].includes(ext)) {
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
      })
    } catch {
      res.status(500).send("Internal server error (File not found?)");
    }
  }
});

app.get("/files/private/*", (req, res) => {
  const filePath = path.join(privateUploadPath, req.params[0]);

  // Check if requested path is a directory
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
        const filePath = path.join(privateUploadPath, req.params[0], file);
        const stat = fs.statSync(filePath);
        const mimetype = mime.lookup(filePath);
        let fileSizeInBytes = stat.size;
        let folderName = path.basename(privateUploadPath);

        if (stat.isDirectory()) {
          fileSizeInBytes = "";
          folderName = folderName + "/";
        }

        fileData.push({
          filename: file,
          mimetype: mimetype || "unknown",
          size: fileSizeInBytes,
          folder: "private/" + req.params[0],
        });
      });

      res.render("files", {
        files: fileData,
        formatFileSize,
      });
    });
    return;
  }
  const { username, password } = req.cookies;
  const passwordAuth = req.query.password;
  authorize(username, password, async (authorized) => {
    if (passwordAuth !== process.env.privatepasswd && authorized == false) {
      res.status(401).json({ message: "Unauthorized." });
    } else {
      // If requested path is not a directory, serve the file

      if (!fs.existsSync(filePath)) {
        res.status(404).send("File not found.");
        return;
      }

      const ext = path.extname(filePath);
      if ([".html", ".json", ".txt"].includes(ext)) {
        // If file has .html, .json, or .txt extension, render it
        res.sendFile(filePath);
      } else {
        // Otherwise, download the file
        const filename = path.basename(filePath);
        // Set the appropriate headers
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename=${filename}`
        );

        // Create a read stream and pipe it to the response object
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
      }
    }
  });
});

//Cert util support
app.post("/files/private/*", (req, res) => {
  const filePath = path.join(privateUploadPath, req.params[0]);

  // Check if requested path is a directory
  const stats = fs.statSync(filePath);
  if (stats.isDirectory()) {
    fs.readdir(filePath, (err, files) => {
      if (err) {
        console.error(err);
        res.status(500).send("Internal server error");
        return;
      }
      res.status(401).json({ message: "Unauthorized." });
    });
    return;
  }

  // If requested path is not a directory, serve the file

  if (!fs.existsSync(filePath)) {
    res.status(404).send("File not found.");
    return;
  }
  //res.status(401).json({ message: "Unauthorized." });

  const ext = path.extname(filePath);
  if ([".html", ".json", ".txt"].includes(ext)) {
    // If file has .html, .json, or .txt extension, render it
    res.sendFile(filePath);
  } else {
    // Otherwise, download the file
    const filename = path.basename(filePath);
    // Set the appropriate headers
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename=${filename}`);

    // Create a read stream and pipe it to the response object
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  }
});

// serve static files from public directory
app.use(express.static(publicUploadPath));

// handle public uploads
app.post(
  "/api/upload/public",
  authorizeMiddleware, // add the authorization middleware here
  publicUpload.single("filepond"),
  logRequest(),
  (req, res) => {
    res.json({ message: "File uploaded successfully." });
  }
);

// handle private uploads
app.post(
  "/api/upload/public",
  authorizeMiddleware, // add the authorization middleware here
  publicUpload.single("filepond"),
  logRequest(),
  (req, res) => {
    res.json({ message: "File uploaded successfully." });
  }
);

app.get("/", (req, res) => {
  fs.readdir(publicUploadPath, (err, files) => {
    if (err) {
      console.error(err);
      res.status(500).send("Internal server error");
      return;
    }

    const fileData = [];

    files.forEach((file) => {
      const filePath = path.join(publicUploadPath, file);
      const stat = fs.statSync(filePath);
      const mimetype = mime.lookup(filePath);
      let fileSizeInBytes = stat.size;
      let folderName = path.basename(publicUploadPath);
      //Check if file or folder and set boolean true if folder
      let isDirectoryFile = false;
      let filename = file;
      if (stat.isDirectory()) {
        fileSizeInBytes = "";
        folderName = folderName + "/";
        isDirectoryFile = false;
        filename = file + "/";
      }

      const folder = path.join("public");
      fileData.push({
        filename: filename,
        mimetype: mimetype || "unknown",
        size: fileSizeInBytes,
        folder: folder,
        isDirectoryFile: isDirectoryFile,
      });
    });

    res.render("files", {
      files: fileData,
      formatFileSize,
    });
  });
});

app.get("/private", (req, res) => {
  fs.readdir(privateUploadPath, (err, files) => {
    if (err) {
      console.error(err);
      res.status(500).send("Internal server error");
      return;
    }

    const fileData = [];

    files.forEach((file) => {
      const filePath = path.join(privateUploadPath, file);
      const stat = fs.statSync(filePath);
      const mimetype = mime.lookup(filePath);
      let fileSizeInBytes = stat.size;
      let folderName = path.basename(privateUploadPath);

      if (stat.isDirectory()) {
        fileSizeInBytes = "";
        file = file + "/";
      }

      fileData.push({
        filename: file,
        mimetype: mimetype || "unknown",
        size: fileSizeInBytes,
        folder: folderName,
      });
    });

    res.render("files", {
      files: fileData,
      formatFileSize,
    });
  });
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// start server
const server = app.listen(3000, () => console.log("Server Online."));

server.setTimeout(300000);

