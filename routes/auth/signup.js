  const bcrypt = require('bcrypt');

  module.exports = {
    Name: 'Signup',
    Route: '/auth/signup',
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
      return res.status(403).send("Access is denied");
      const username = req.body.username;
      const password = req.body.password;

      // Create the users table if it doesn't exist
      db.run(
        `CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY,
          username TEXT NOT NULL,
          password TEXT NOT NULL
        )`,
        (err) => {
          if (err) {
            console.error(err);
            res.status(500).json({ message: 'Internal server error' });
            return;
          }

          // Hash the password before storing it in the database
          bcrypt.hash(password, 10, (hashErr, hashedPassword) => {
            if (hashErr) {
              console.error(hashErr);
              res.status(500).json({ message: 'Password hashing failed' });
              return;
            }

            // Insert a new user into the users table with the hashed password
            db.run(
              'INSERT INTO users (username, password) VALUES (?, ?)',
              [username, hashedPassword],
              (insertErr) => {
                if (insertErr) {
                  res.status(500).json({ message: 'User already exists' });
                } else {
                  res.cookie('username', username);
                  // Do NOT store the password in a cookie, even if hashed
                  res.status(200).json({ message: 'User created' });
                }
              }
            );
          });
        }
      );
    },
  };
