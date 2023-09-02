const config = '../../config/config.json'
module.exports = {
    Name: 'Auth - Key Create',
    Route: '/auth/key/create',
    Method: 'POST',
    Log: 'File', // Set to 'File', 'Console', or 'Null'
    Sqlite: 'keys.sqlite',
    /**
     * Handle the request.
     * @param {import('express').Request} req - The request object.
     * @param {import('express').Response} res - The response object.
     * @param {import('sqlite3').Database} db - The database connection object.
     */
    async handle(req, res, db) {
        if (config.Rotating == false || config.Rotating == 'false') {
            res.status(401).json({ error: 'Key rotation is disabled' });
            return;
        }
        const token = req.headers.key
        if (!token) {
            res.status(401).json({ error: 'Missing key' });
            return;
        }
        if (token != process.env.API_KEY) {
            res.status(401).json({ error: 'Invalid key' });
            return;
        }
        // Generate a new key and put it in the database and return it
        const key = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

        db.run('INSERT INTO keys (key) VALUES (?)', [key], (err) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ key });
        });
    },
};
