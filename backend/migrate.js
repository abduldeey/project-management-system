const db = require('./db');

async function runMigration() {
  console.log('⏳ Creating tables in cloud database...');
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role ENUM('student', 'supervisor', 'admin') NOT NULL,
        department VARCHAR(255) DEFAULT 'Civil Engineering',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS students (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        matric_no VARCHAR(100) NOT NULL UNIQUE,
        department VARCHAR(255) DEFAULT 'Civil Engineering',
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS proposals (
        id INT AUTO_INCREMENT PRIMARY KEY,
        student_id INT NOT NULL,
        title VARCHAR(500) NOT NULL,
        description TEXT,
        status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
        supervisor_id INT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS deliverables (
        id INT AUTO_INCREMENT PRIMARY KEY,
        student_id INT NOT NULL,
        chapter_title VARCHAR(255) NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        file_url VARCHAR(500) NOT NULL,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS grades (
        id INT AUTO_INCREMENT PRIMARY KEY,
        student_id INT NOT NULL,
        supervisor_id INT NOT NULL,
        doc_score DECIMAL(5,2) DEFAULT 0,
        impl_score DECIMAL(5,2) DEFAULT 0,
        pres_score DECIMAL(5,2) DEFAULT 0,
        total_score DECIMAL(5,2) DEFAULT 0,
        letter_grade VARCHAR(5) DEFAULT 'F',
        feedback TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (supervisor_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    console.log('✅ All tables successfully created in Aiven MySQL!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
}

runMigration();