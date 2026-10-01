const initTableQuery = `
  CREATE TABLE IF NOT EXISTS proposal_versions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    proposal_id INT,
    version INT,
    content TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`;

pool.query(initTableQuery, (err) => {
  if (err) {
    console.error('Failed to create proposal_versions table:', err.message);
  } else {
    console.log('proposal_versions table checked/created successfully.');
  }
});