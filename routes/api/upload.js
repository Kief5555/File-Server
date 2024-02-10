const multer = require('multer');
const path = require('path');
const bcrypt = require('bcrypt'); // Import bcrypt
const config = require('../../config/config.json');
module.exports = {
  Name: 'API - Upload',
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
    if(config.Authentication == false ){
      res.status(401).json({ message: 'Authentication failed' });
      return;
    }
    const username = req.headers.username;
    const password = req.headers.password;

    // Retrieve the user's hashed password from the database
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
      if (err) {
        console.error(err);
        res.status(500).sendFile(path.join(__dirname, '..', '..', 'public', '500.html'));
        return;
      }

      if (!row) {
        res.status(401).sendFile(path.join(__dirname, '..', '..', 'public', '403.html'));
        return;
      }

      // Compare the provided password with the hashed password from the database
      bcrypt.compare(password, row.password, (compareErr, result) => {
        if (compareErr) {
          console.error(compareErr);
          res.status(500).json({ message: 'Authentication failed', success: false});
          return;
        }

        if (!result) {
          res.status(401).json({ message: 'Authentication failed', success: false});
          return;
        }

        // If authentication is successful, proceed with file upload
        // Retrieve the file path from the request header
        const filePath = req.headers.path || 'public';

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
        upload.single('filepond')(req, res, (uploadErr) => {
          if (uploadErr) {
            res.status(500).json({ message: 'File upload failed', success: false });
            return;
          }
          // File uploaded successfully
          res.status(200).json({ message: 'File uploaded successfully', success: true});
        });
      });
    });
  },
};
