const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
require('dotenv').config();
const db = require('./db');

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'university_project_management_secret_key_2026';

app.use(cors());
app.use(express.json());

// Uploads setup
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

app.get('/uploads/:filename', (req, res) => {
  const filePath = path.join(uploadsDir, req.params.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File missing from server storage.' });
  }
  res.sendFile(filePath);
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// AUTO-MIGRATE AND VERIFY TABLES ON STARTUP (NO MANUAL MYSQL NEEDED)
(async () => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'STUDENT',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS students (
        student_id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        matric_no VARCHAR(50) DEFAULT 'N/A',
        department VARCHAR(100) DEFAULT 'Computer Science',
        supervisor_id INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX(user_id)
      ) ENGINE=InnoDB;
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS staff (
        staff_id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        staff_no VARCHAR(50) DEFAULT 'STF/001',
        department VARCHAR(100) DEFAULT 'Computer Science',
        designation VARCHAR(100) DEFAULT 'Lecturer',
        role VARCHAR(50) DEFAULT 'SUPERVISOR',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX(user_id)
      ) ENGINE=InnoDB;
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS proposals (
        id INT AUTO_INCREMENT PRIMARY KEY,
        student_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        problem_statement TEXT NULL,
        aim TEXT NULL,
        objectives TEXT NULL,
        status VARCHAR(50) DEFAULT 'PENDING',
        remarks TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;
    `);

    // Ensure all proposal columns exist even if table was created earlier
    const [pCols] = await db.query(`SHOW COLUMNS FROM proposals`);
    const pNames = pCols.map(c => c.Field.toLowerCase());
    if (!pNames.includes('problem_statement')) {
      await db.query(`ALTER TABLE proposals ADD COLUMN problem_statement TEXT NULL`).catch(() => {});
    }
    if (!pNames.includes('aim')) {
      await db.query(`ALTER TABLE proposals ADD COLUMN aim TEXT NULL`).catch(() => {});
    }
    if (!pNames.includes('objectives')) {
      await db.query(`ALTER TABLE proposals ADD COLUMN objectives TEXT NULL`).catch(() => {});
    }
    if (!pNames.includes('remarks')) {
      await db.query(`ALTER TABLE proposals ADD COLUMN remarks TEXT NULL`).catch(() => {});
    }

    await db.query(`
      CREATE TABLE IF NOT EXISTS deliverables (
        id INT AUTO_INCREMENT PRIMARY KEY,
        student_id INT NOT NULL,
        chapter_title VARCHAR(255) NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        file_url VARCHAR(255),
        status VARCHAR(50) DEFAULT 'SUBMITTED',
        feedback TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;
    `);

    const [dCols] = await db.query(`SHOW COLUMNS FROM deliverables`);
    const dNames = dCols.map(c => c.Field.toLowerCase());
    if (!dNames.includes('feedback')) {
      await db.query(`ALTER TABLE deliverables ADD COLUMN feedback TEXT NULL`).catch(() => {});
    }

    await db.query(`
      CREATE TABLE IF NOT EXISTS allocations (
        allocation_id INT AUTO_INCREMENT PRIMARY KEY,
        student_id INT NOT NULL,
        supervisor_id INT NOT NULL,
        allocated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS project_deadlines (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        deadline_date DATETIME NOT NULL,
        description TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS project_grades (
        grade_id INT AUTO_INCREMENT PRIMARY KEY,
        student_id INT NOT NULL UNIQUE,
        documentation_score DECIMAL(5,2) DEFAULT 0,
        implementation_score DECIMAL(5,2) DEFAULT 0,
        presentation_score DECIMAL(5,2) DEFAULT 0,
        total_score DECIMAL(5,2) DEFAULT 0,
        letter_grade VARCHAR(5) NOT NULL,
        remarks TEXT NULL,
        graded_by INT NOT NULL,
        graded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;
    `);

    console.log('✅ All PMS database tables & columns verified.');
  } catch (err) {
    console.error('Migration notice:', err.message);
  }
})();

// Helper to calculate Nigerian university letter grades
function calculateGrade(total) {
  if (total >= 70) return 'A';
  if (total >= 60) return 'B';
  if (total >= 50) return 'C';
  if (total >= 45) return 'D';
  return 'F';
}

// ---------------------------------------------------------------------
// 1. AUTHENTICATION (STUDENT, SUPERVISOR, COORDINATOR)
// ---------------------------------------------------------------------
app.post('/api/auth/register', async (req, res) => {
  try {
    const { fullName, name, email, password, role, matricNo, staffNo, department } = req.body;
    const userName = (fullName || name || '').trim();

    if (!userName || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    let rawRole = (role || 'STUDENT').toString().toUpperCase().trim();
    let finalRole = 'STUDENT';
    if (rawRole.includes('COORD') || rawRole === 'ADMIN') {
      finalRole = 'COORDINATOR';
    } else if (rawRole.includes('SUPER') || rawRole.includes('LECT') || rawRole.includes('FACUL')) {
      finalRole = 'SUPERVISOR';
    }

    const [existing] = await db.query('SELECT id FROM users WHERE LOWER(email) = LOWER(?)', [email.trim()]);
    if (existing && existing.length > 0) {
      return res.status(400).json({ error: 'An account with this email already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const [userRes] = await db.query(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [userName, email.trim(), hashedPassword, finalRole]
    );
    const newUserId = userRes.insertId;

    let studentId = null;
    let staffId = null;

    if (finalRole === 'STUDENT') {
      const [st] = await db.query(
        'INSERT INTO students (user_id, matric_no, department) VALUES (?, ?, ?)',
        [newUserId, matricNo || 'N/A', department || 'Computer Science']
      );
      studentId = st.insertId;
    } else {
      const [sf] = await db.query(
        'INSERT INTO staff (user_id, staff_no, department, designation, role) VALUES (?, ?, ?, ?, ?)',
        [
          newUserId,
          staffNo || 'STF/001',
          department || 'Computer Science',
          finalRole === 'COORDINATOR' ? 'Project Coordinator' : 'Lecturer',
          finalRole
        ]
      );
      staffId = sf.insertId;
    }

    return res.status(201).json({
      message: 'Account created successfully',
      user: {
        userId: newUserId,
        id: newUserId,
        fullName: userName,
        email: email.trim(),
        role: finalRole,
        department: department || 'Computer Science',
        studentId,
        staffId,
        matricNo: matricNo || ''
      }
    });
  } catch (error) {
    console.error('REGISTER ERROR:', error);
    return res.status(500).json({ error: 'Registration failed: ' + error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const [users] = await db.query(`SELECT * FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1`, [email.trim()]);
    if (!users || users.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const user = users[0];
    const rawHash = user.password_hash || user.password;
    const validPassword = await bcrypt.compare(password, rawHash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const userId = user.user_id || user.id;
    let role = (user.role || 'STUDENT').toString().toUpperCase().trim();
    let studentId = null;
    let staffId = null;
    let matricNo = null;
    let department = 'Computer Science';

    try {
      const [sRows] = await db.query(`SELECT * FROM students WHERE user_id = ? OR id = ? LIMIT 1`, [userId, userId]);
      if (sRows && sRows.length > 0) {
        studentId = sRows[0].student_id || sRows[0].id;
        matricNo = sRows[0].matric_no;
        if (sRows[0].department) department = sRows[0].department;
        if (!role.includes('COORD') && !role.includes('SUPER')) role = 'STUDENT';
      }
    } catch (e) {}

    try {
      const [stRows] = await db.query(`SELECT * FROM staff WHERE user_id = ? OR id = ? LIMIT 1`, [userId, userId]);
      if (stRows && stRows.length > 0) {
        staffId = stRows[0].staff_id || stRows[0].id;
        if (stRows[0].department) department = stRows[0].department;
        const desig = (stRows[0].role || stRows[0].designation || '').toUpperCase();
        if (desig.includes('COORD') || role.includes('COORD')) role = 'COORDINATOR';
        else role = 'SUPERVISOR';
      }
    } catch (e) {}

    if (role.includes('COORD') || (user.email && user.email.toLowerCase().includes('coord'))) {
      role = 'COORDINATOR';
    }

    const token = jwt.sign(
      { userId, email: user.email, role, department },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    return res.json({
      message: 'Login successful',
      token,
      user: {
        userId,
        id: userId,
        fullName: user.name || user.full_name,
        name: user.name || user.full_name,
        email: user.email,
        role,
        department,
        studentId,
        staffId,
        matricNo
      }
    });
  } catch (error) {
    console.error('LOGIN ERROR:', error);
    return res.status(500).json({ error: 'Internal login error' });
  }
});

// ---------------------------------------------------------------------
// 2. COORDINATOR: ALLOCATIONS & OVERVIEW
// ---------------------------------------------------------------------
app.get('/api/allocations', async (req, res) => {
  try {
    const [allUsers] = await db.query(`SELECT * FROM users`);
    const students = [];
    const supervisors = [];

    (allUsers || []).forEach(u => {
      const r = (u.role || '').toString().toUpperCase();
      const item = {
        student_id: u.id,
        staff_id: u.id,
        full_name: u.name || u.email,
        email: u.email
      };
      if (r.includes('COORD')) return;
      if (r.includes('SUPER') || r.includes('LECT')) supervisors.push(item);
      else students.push(item);
    });

    // Fetch existing allocation list with names
    const [activePairs] = await db.query(`
      SELECT 
        a.allocation_id,
        u_s.name AS student_name,
        u_s.email AS student_email,
        u_sp.name AS supervisor_name,
        u_sp.email AS supervisor_email,
        a.allocated_at
      FROM allocations a
      JOIN users u_s ON a.student_id = u_s.id
      JOIN users u_sp ON a.supervisor_id = u_sp.id
      ORDER BY a.allocated_at DESC
    `).catch(() => [[]]);

    return res.json({ students, supervisors, activeAllocations: activePairs || [] });
  } catch (err) {
    return res.status(500).json({ error: err.message, students: [], supervisors: [], activeAllocations: [] });
  }
});

app.post('/api/allocations', async (req, res) => {
  try {
    const { studentId, supervisorId } = req.body;
    if (!studentId || !supervisorId) {
      return res.status(400).json({ error: 'Select both a student and a supervisor.' });
    }

    await db.query(`
      INSERT INTO allocations (student_id, supervisor_id) VALUES (?, ?)
      ON DUPLICATE KEY UPDATE supervisor_id = VALUES(supervisor_id)
    `, [studentId, supervisorId]);

    // Also update student profile table
    await db.query(`UPDATE students SET supervisor_id = ? WHERE user_id = ? OR student_id = ?`, [supervisorId, studentId, studentId]).catch(() => {});

    return res.json({ message: 'Supervisor successfully allocated to student.' });
  } catch (err) {
    return res.status(500).json({ error: 'Allocation failed: ' + err.message });
  }
});

// ---------------------------------------------------------------------
// 3. PROPOSALS: SUBMISSION, PRIVACY & SUPERVISOR REVIEW
// ---------------------------------------------------------------------
app.get('/api/proposals', async (req, res) => {
  try {
    const { supervisorId, studentId, role } = req.query;

    let query = `
      SELECT 
        p.*,
        COALESCE(u.name, 'Student') AS student_name
      FROM proposals p
      LEFT JOIN users u ON p.student_id = u.id
    `;
    const params = [];

    if (role === 'STUDENT' || (studentId && role !== 'COORDINATOR' && role !== 'SUPERVISOR')) {
      query += ` WHERE p.student_id = ? OR p.student_id = (SELECT user_id FROM students WHERE student_id = ? LIMIT 1)`;
      params.push(studentId || supervisorId, studentId || supervisorId);
    } else if (supervisorId && role === 'SUPERVISOR') {
      query += `
        WHERE p.student_id IN (
          SELECT student_id FROM allocations WHERE supervisor_id = ?
        )
      `;
      params.push(supervisorId);
    }
    // Coordinators see all

    query += ` ORDER BY p.id DESC`;
    const [rows] = await db.query(query, params);
    return res.json(rows);
  } catch (err) {
    return res.json([]);
  }
});

app.post('/api/proposals', async (req, res) => {
  const { title, problem_statement, aim, objectives, student_id } = req.body;
  if (!title) return res.status(400).json({ error: 'Project title is required.' });

  try {
    const [result] = await db.query(
      `INSERT INTO proposals (student_id, title, problem_statement, aim, objectives, status) 
       VALUES (?, ?, ?, ?, ?, 'PENDING')`,
      [student_id, title.trim(), problem_statement || '', aim || '', objectives || '']
    );

    return res.status(201).json({ message: 'Proposal submitted successfully', proposal_id: result.insertId });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.put('/api/proposals/:id/review', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, remarks } = req.body;

    await db.query(`UPDATE proposals SET status = ?, remarks = ? WHERE id = ?`, [status || 'APPROVED', remarks || '', id]);
    return res.json({ message: 'Proposal review saved successfully' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------
// 4. CHAPTERS & DELIVERABLES: UPLOAD, CORRECTIONS & PRIVACY
// ---------------------------------------------------------------------
app.get('/api/deliverables', async (req, res) => {
  try {
    const { supervisorId, studentId, role } = req.query;

    let query = `
      SELECT 
        d.*,
        COALESCE(u.name, 'Student') AS student_name
      FROM deliverables d
      LEFT JOIN users u ON d.student_id = u.id
    `;
    const params = [];

    if (role === 'STUDENT' || (studentId && role !== 'COORDINATOR' && role !== 'SUPERVISOR')) {
      query += ` WHERE d.student_id = ? OR d.student_id = (SELECT user_id FROM students WHERE student_id = ? LIMIT 1)`;
      params.push(studentId || supervisorId, studentId || supervisorId);
    } else if (supervisorId && role === 'SUPERVISOR') {
      query += `
        WHERE d.student_id IN (
          SELECT student_id FROM allocations WHERE supervisor_id = ?
        )
      `;
      params.push(supervisorId);
    }

    query += ` ORDER BY d.created_at DESC`;
    const [rows] = await db.query(query, params);
    return res.json(rows);
  } catch (err) {
    return res.json([]);
  }
});

app.post('/api/deliverables', upload.single('file'), async (req, res) => {
  try {
    const body = req.body || {};
    const studentId = body.student_id || body.studentId;
    const chapterTitle = body.chapter_title || 'Chapter 1';
    const originalName = req.file ? req.file.originalname : 'document.pdf';
    const fileUrl = req.file ? `/uploads/${req.file.filename}` : 'document.pdf';

    if (!studentId) return res.status(400).json({ error: 'Student ID missing.' });

    await db.query(
      `INSERT INTO deliverables (student_id, chapter_title, file_name, file_url, status) VALUES (?, ?, ?, ?, 'SUBMITTED')`,
      [studentId, chapterTitle, originalName, fileUrl]
    );

    return res.json({ message: 'Chapter uploaded successfully!' });
  } catch (err) {
    return res.status(500).json({ error: 'Upload failed: ' + err.message });
  }
});

// Supervisor sends correction / feedback on uploaded chapter
app.put('/api/deliverables/:id/feedback', async (req, res) => {
  try {
    const { id } = req.params;
    const { feedback, status } = req.body;

    await db.query(
      `UPDATE deliverables SET feedback = ?, status = ? WHERE id = ?`,
      [feedback || '', status || 'NEEDS_REVISION', id]
    );

    return res.json({ message: 'Feedback sent back to student successfully' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------
// 5. DEADLINES
// ---------------------------------------------------------------------
app.get('/api/deadlines', async (req, res) => {
  try {
    const [deadlines] = await db.query(`SELECT * FROM project_deadlines ORDER BY deadline_date ASC`);
    return res.json(deadlines);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/deadlines', async (req, res) => {
  try {
    const { title, due_date, deadline_date, description } = req.body;
    let d = due_date || deadline_date;
    if (!title || !d) return res.status(400).json({ error: 'Title and deadline date are required.' });

    await db.query(
      `INSERT INTO project_deadlines (title, deadline_date, description) VALUES (?, ?, ?)`,
      [title, d, description || '']
    );
    return res.json({ message: 'Deadline announced successfully' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------
// 6. DEFENSE GRADING: ONLY AFTER FINAL REPORT IS SUBMITTED
// ---------------------------------------------------------------------
app.get('/api/grades', async (req, res) => {
  try {
    // Coordinators & Supervisors: see departmental grade sheet
    const [grades] = await db.query(`
      SELECT 
        g.*, 
        u_stu.name AS student_name,
        u_sup.name AS grader_name
      FROM project_grades g
      LEFT JOIN users u_stu ON g.student_id = u_stu.id
      LEFT JOIN users u_sup ON g.graded_by = u_sup.id
      ORDER BY g.graded_at DESC
    `);
    return res.json(grades);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/grades/student/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    if (!studentId) return res.json(null);

    // Strictly returns the grade ONLY if it belongs to this student
    const [grades] = await db.query(
      `SELECT g.*, u.name AS grader_name 
       FROM project_grades g
       LEFT JOIN users u ON g.graded_by = u.id
       WHERE g.student_id = ?
       ORDER BY g.graded_at DESC LIMIT 1`,
      [studentId]
    );

    if (grades && grades.length > 0) return res.json(grades[0]);
    return res.json(null);
  } catch (error) {
    return res.json(null);
  }
});

app.post('/api/grades', async (req, res) => {
  const { student_id, documentation_score, implementation_score, presentation_score, remarks, staff_id } = req.body;

  try {
    // Defense rule: verify that student has actually submitted a Full Project Report
    const [finalUpload] = await db.query(
      `SELECT id FROM deliverables 
       WHERE student_id = ? AND LOWER(chapter_title) LIKE '%final%' LIMIT 1`,
      [student_id]
    );

    if (!finalUpload || finalUpload.length === 0) {
      return res.status(400).json({
        error: 'Cannot grade defense yet. This student has not uploaded their Full Project Report.'
      });
    }

    const doc = parseFloat(documentation_score) || 0;
    const impl = parseFloat(implementation_score) || 0;
    const pres = parseFloat(presentation_score) || 0;
    const total = doc + impl + pres;
    const letterGrade = calculateGrade(total);

    await db.query(`
      INSERT INTO project_grades 
        (student_id, documentation_score, implementation_score, presentation_score, total_score, letter_grade, remarks, graded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE 
        documentation_score = VALUES(documentation_score),
        implementation_score = VALUES(implementation_score),
        presentation_score = VALUES(presentation_score),
        total_score = VALUES(total_score),
        letter_grade = VALUES(letter_grade),
        remarks = VALUES(remarks),
        graded_by = VALUES(graded_by)
    `, [student_id, doc, impl, pres, total, letterGrade, remarks || '', staff_id || 1]);

    return res.json({ message: 'Defense evaluated successfully!', total_score: total, letter_grade: letterGrade });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});