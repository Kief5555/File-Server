module.exports = {
  Name: "Signup",
  Route: "/auth/signup",
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
          res.status(500).json({ message: "Internal server error" });
          return;
        }

        // Insert a new user into the users table
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
      }
    );
  },
};
