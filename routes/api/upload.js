const multer = require('multer');
const path = require('path');

module.exports = {
  Name: 'Api- Upload',
  Route: '/api/upload',
  Method: 'POST',
  Log: 'File', // Set to 'File', 'Console', or 'Null'
  Sqlite: 'users.sqlite',
  /**
   * Handle the request.
   * @param {import('express').Request} req - The request object.
   * @param {import('express').Response} res - The response object.
   * @param {import('sqlite3').Database} db - The database connection object.
   */
  async handle(req, res, db) {
    // Authorize user (username and password in headers)
    // If not authorized, return 401

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

        // Retrieve the file path from the request header
        const filePath = req.headers.path || 'public';

        console.log(filePath)

        // Construct the full upload path
        const fullUploadPath = path.join(__dirname, '../../files/', filePath);

        // Configure multer storage
        const storage = multer.diskStorage({
          destination: fullUploadPath,
          filename: (req, file, cb) => {
            cb(null, file.originalname);
          },
        });

        // Create multer instance
        const upload = multer({ storage });

        // Handle the file upload
        upload.single('filepond')(req, res, (err) => {
          if (err) {
            res.status(500).send('Error uploading file');
            return;
          }
          // File uploaded successfully
          res.status(200).send('File uploaded successfully');
        });
      }
    );
  },
};
