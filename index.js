/******************************************************
 * Author:    Kiefer
 * Date:      2023-4-12 (MM-DD-YYYY)
 * Description: API Server
 * Version:   1.0.0
 * License:   MIT
 ******************************************************/

console.clear();
const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const winston = require("winston");
const chalk = require("chalk");
const bodyParser = require("body-parser");
const Table = require("cli-table3");
const sqlite3 = require("sqlite3").verbose();
require("dotenv").config();

const createDatabaseConnection = (dbFile) => {
  const db = new sqlite3.Database(path.join(__dirname, "database", dbFile));
  return db;
};

const app = express();
const port = 3000;

// Configure Winston logger
const logger = winston.createLogger({
  filename: "logs.log",
  level: "info",
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: "YYYY-MM-DD hh:mm:ss A" }),
    winston.format.printf(({ timestamp, level, message, meta }) => {
      const formattedTimestamp = chalk.cyanBright(`[${timestamp}]`).padEnd(25);
      const formattedLevel =
        level === "info" ? chalk.green(level) : chalk.red(level);
      const formattedMeta = meta ? chalk.gray(`[${meta}]`) : "";
      return `${formattedTimestamp} [${formattedLevel}] ${formattedMeta} ${message}`;
    })
  ),
  defaultMeta: { service: "api-server" },
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: "error.log", level: "error" }),
    new winston.transports.File({ filename: "combined.log" }),
  ],
});

// Middleware
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use("/favicon.ico", express.static("public/favicon.ico"));
app.set('views', path.join(__dirname, 'public'));
app.set("view engine", "ejs");


const loadRoutesFromDirectory = (directoryPath, table, routePrefix = "") => {
  const routeFiles = fs.readdirSync(directoryPath, { withFileTypes: true });
  routeFiles.forEach((dirent) => {
    const file = dirent.name; // Extract the file name from the Dirent object
    const routePath = path.join(directoryPath, file);
    const routeStats = fs.statSync(routePath);

    if (routeStats.isDirectory()) {
      const subdirectoryPath = path.join(routePrefix.toString(), file);
      loadRoutesFromDirectory(routePath, table, subdirectoryPath);
    } else if (routeStats.isFile()) {
      const routeModule = require(routePath);

      if (
        routeModule.Name &&
        routeModule.Route &&
        routeModule.Method &&
        routeModule.handle
      ) {
        const { Name, Route, Method, handle } = routeModule;

        // Apply custom middlewares to each route
        if (routeModule.Log) {
          if (routeModule.Log === "File") {
            if (routeModule.Log === "File") {
              app.use(`${Route}`, (req, res, next) => {
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
              });
            }
          } else if (routeModule.Log === "Console") {
            app.use(`${Route}`, (req, res, next) => {
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
            });
          }
        }

        app[Method.toLowerCase()](`${Route}`, async (req, res, next) => {
          const dbFile = routeModule.Sqlite;
          const db = dbFile ? createDatabaseConnection(dbFile) : null;

          try {
            const result = await handle.bind(routeModule)(req, res, db);
            if (result) {
              try {
                res.send(result);
              } catch (error) {}
            }
          } catch (error) {
            next(error);
          } finally {
            if (db) {
              db.close((err) => {
                if (err) {
                  console.error(
                    "Error closing database connection:",
                    err.message
                  );
                }
              });
            }
          }
        });
        table.push([Name, Method, `${Route}`, chalk.green("✓")]);
      } else {
        logger.error(`Invalid route module: ${file}`);
        table.push([file, "", "", chalk.red("✗")]);
      }
    }
  });
};

// Dynamically load routes from the directory
const routesDirectoryPath = path.join(__dirname, "routes");

const table = new Table({
  head: ["Name", "Method", "Route", "Status"],
  colAligns: ["left", "center", "center", "center"],
  style: { head: ["cyan"] },
});

loadRoutesFromDirectory(routesDirectoryPath, table, logger);

logger.info("Routes Loaded");
if (table.length > 0) {
  console.log(table.toString());
} else {
  logger.info("No routes loaded.");
}

// 404 handler
app.use(function (req, res, next) {
  res.status(404).sendFile(__dirname + "/public/404.html");
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error(err.stack, { route: req.path });
  res.status(500).json({ error: "Something broke!" });
});

// Start the server
app.listen(port, () => {
  logger.info(`Server is listening on port ${port}`);
});
