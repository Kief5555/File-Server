module.exports = {
  Name: "Login",
  Route: "/auth/login",
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
    //Authorization function
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

    //Authorization
    const username = req.body.username;
    const password = req.body.password;
    authorize(username, password, (authorized) => {
      if (authorized) {
        res.status(200).json({
          message: "Login successful",
          username: username,
          password: password,
        });
      } else {
        res.status(401).json({ message: "Login failed" });
      }
    });
  },
};
