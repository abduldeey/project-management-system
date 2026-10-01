const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const initTableQuery = `
  CREATE TABLE IF NOT EXISTS proposal_versions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    proposal_id INT,
    version INT,
    content TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`;

pool.query(initTableQuery)
  .then(() => console.log('proposal_versions table checked/created successfully.'))
  .catch((err) => console.error('Failed to create proposal_versions table:', err.message));

module.exports = pool;