const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const db = require('./db');

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretprojectkey123';

app.use(cors());
app.use(express.json());

// Ensure uploads folder exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// Multer Storage Configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

// Auto-fills column fallbacks
async function smartInsert(connection, tableName, customData) {
    const [cols] = await connection.query(`SHOW COLUMNS FROM ??`, [tableName]);
    const insertObj = {};
    for (const col of cols) {
        const field = col.Field;
        if (col.Extra && col.Extra.includes('auto_increment')) continue;

        if (customData[field] !== undefined && customData[field] !== null) {
            insertObj[field] = customData[field];
        } else if (col.Null === 'NO' && col.Default === null) {
            if (field.includes('year')) insertObj[field] = '2025/2026';
            else if (field.includes('dept') || field.includes('department')) insertObj[field] = customData.department || 'Computer Science';
            else if (field.includes('prog') || field.includes('programme')) insertObj[field] = 'B.Eng / B.Sc';
            else if (field.includes('level')) insertObj[field] = '400';
            else if (field.includes('status')) insertObj[field] = 'ACTIVE';
            else if (field.includes('name')) insertObj[field] = 'User';
            else if (field.includes('created') || field.includes('date') || field.includes('time')) insertObj[field] = new Date();
            else insertObj[field] = 'Default';
        }
    }

    const columns = Object.keys(insertObj);
    const placeholders = columns.map(() => '?').join(', ');
    const values = Object.values(insertObj);

    const sql = `INSERT INTO ?? (${columns.map(c => `\`${c}\``).join(', ')}) VALUES (${placeholders})`;
    return await connection.query(sql, [tableName, ...values]);
}

// Database Schema Initializer
(async () => {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS project_deadlines (
                id INT AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                deadline_date DATETIME NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await db.query(`
            CREATE TABLE IF NOT EXISTS system_notifications (
                notification_id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                message TEXT NOT NULL,
                is_read BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await db.query(`
            CREATE TABLE IF NOT EXISTS project_deliverables (
                deliverable_id INT AUTO_INCREMENT PRIMARY KEY,
                student_id INT NOT NULL,
                chapter_title VARCHAR(100) NOT NULL,
                file_name VARCHAR(255) NOT NULL,
                file_url VARCHAR(255) NOT NULL,
                uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await db.query(`
            CREATE TABLE IF NOT EXISTS supervisor_allocations (
                allocation_id INT AUTO_INCREMENT PRIMARY KEY,
                student_id INT NOT NULL UNIQUE,
                staff_id INT NOT NULL,
                allocated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
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
            )
        `);

        const [pvCols] = await db.query(`SHOW COLUMNS FROM proposal_versions`);
        const colNames = pvCols.map(c => c.Field);
        if (!colNames.includes('feedback_notes')) {
            await db.query(`ALTER TABLE proposal_versions ADD COLUMN feedback_notes TEXT NULL`);
        }
    } catch (e) {
        console.error('Table init error:', e.message);
    }
})();

// --- 1. USER AUTHENTICATION ---

app.post('/api/auth/register', async (req, res) => {
    const { email, password, full_name, role, matric_no, staff_no, department } = req.body;
    if (!email || !password || !full_name || !role) {
        return res.status(400).json({ error: 'All primary fields are required.' });
    }

    const selectedDept = department || 'Computer Science';
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const hashedPassword = await bcrypt.hash(password, 10);
        const derivedUsername = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '') + '_' + Date.now().toString().slice(-4);

        const [userResult] = await smartInsert(connection, 'users', {
            username: derivedUsername,
            email: email.trim().toLowerCase(),
            password_hash: hashedPassword,
            full_name: full_name.trim()
        });

        const newUserId = userResult.insertId;

        if (role === 'STUDENT') {
            const cleanMatric = matric_no ? matric_no.trim() : `U22/${selectedDept.slice(0, 2).toUpperCase()}/${Date.now().toString().slice(-4)}`;
            await smartInsert(connection, 'students', {
                user_id: newUserId,
                matric_no: cleanMatric,
                department: selectedDept,
                programme: `B.Sc / B.Eng in ${selectedDept}`,
                academic_year: '2025/2026'
            });
        } else if (role === 'SUPERVISOR' || role === 'COORDINATOR') {
            const cleanStaff = staff_no ? staff_no.trim() : `STF/${Date.now().toString().slice(-4)}`;
            await smartInsert(connection, 'staff', {
                user_id: newUserId,
                staff_no: cleanStaff,
                department: selectedDept,
                designation: role === 'COORDINATOR' ? 'Project Coordinator' : 'Lecturer'
            });
        }

        await connection.commit();
        res.status(201).json({ message: 'User registered successfully.' });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: `Registration error: ${error.message}` });
    } finally {
        connection.release();
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const [users] = await db.query(
            `SELECT u.user_id, u.email, u.password_hash, u.full_name,
                    s.student_id, s.matric_no, s.department AS student_dept,
                    st.staff_id, st.staff_no, st.designation, st.department AS staff_dept,
                    CASE 
                        WHEN s.student_id IS NOT NULL THEN 'STUDENT'
                        WHEN st.designation = 'Project Coordinator' THEN 'COORDINATOR'
                        WHEN st.staff_id IS NOT NULL THEN 'SUPERVISOR'
                        ELSE 'USER'
                    END AS role
             FROM users u
             LEFT JOIN students s ON u.user_id = s.user_id
             LEFT JOIN staff st ON u.user_id = st.user_id
             WHERE LOWER(u.email) = ? OR (u.username IS NOT NULL AND LOWER(u.username) = ?)`,
            [email.trim().toLowerCase(), email.trim().toLowerCase()]
        );

        if (users.length === 0) return res.status(401).json({ error: 'Invalid email or password.' });

        const user = users[0];
        let isMatch = false;
        try {
            isMatch = await bcrypt.compare(password, user.password_hash);
        } catch (e) {
            isMatch = (password === user.password_hash);
        }

        if (!isMatch && password !== user.password_hash) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        const userDepartment = user.student_dept || user.staff_dept || 'Computer Science';

        const token = jwt.sign(
            { userId: user.user_id, email: user.email, role: user.role, department: userDepartment },
            JWT_SECRET,
            { expiresIn: '1d' }
        );

        res.json({
            token,
            user: {
                userId: user.user_id,
                email: user.email,
                fullName: user.full_name,
                role: user.role,
                department: userDepartment,
                studentId: user.student_id,
                matricNo: user.matric_no,
                staffId: user.staff_id
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error during login.' });
    }
});

// --- 2. SUPERVISOR ALLOCATION (COORDINATOR) ---

app.get('/api/allocations', async (req, res) => {
    try {
        const [students] = await db.query(`
            SELECT s.student_id, s.matric_no, u.full_name AS student_name, s.department,
                   st.staff_id, su.full_name AS supervisor_name
            FROM students s
            JOIN users u ON s.user_id = u.user_id
            LEFT JOIN supervisor_allocations sa ON s.student_id = sa.student_id
            LEFT JOIN staff st ON sa.staff_id = st.staff_id
            LEFT JOIN users su ON st.user_id = su.user_id
            ORDER BY s.student_id ASC
        `);

        const [supervisors] = await db.query(`
            SELECT st.staff_id, u.full_name AS supervisor_name, st.staff_no, st.department
            FROM staff st
            JOIN users u ON st.user_id = u.user_id
        `);

        res.json({ students, supervisors });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch allocations' });
    }
});

app.post('/api/allocations/assign', async (req, res) => {
    const { student_id, staff_id } = req.body;
    try {
        await db.query(
            `INSERT INTO supervisor_allocations (student_id, staff_id) 
             VALUES (?, ?) 
             ON DUPLICATE KEY UPDATE staff_id = VALUES(staff_id), allocated_at = NOW()`,
            [student_id, staff_id]
        );
        res.json({ message: 'Supervisor allocated successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to assign supervisor' });
    }
});

// --- 3. NOTIFICATIONS ---

app.get('/api/notifications/:userId', async (req, res) => {
    try {
        const [notifs] = await db.query(
            `SELECT * FROM system_notifications WHERE user_id = ? ORDER BY notification_id DESC LIMIT 15`,
            [req.params.userId]
        );
        res.json(notifs);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

app.post('/api/notifications/:id/read', async (req, res) => {
    try {
        await db.query(`UPDATE system_notifications SET is_read = TRUE WHERE notification_id = ?`, [req.params.id]);
        res.json({ message: 'Notification read' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to mark read' });
    }
});

// --- 4. DELIVERABLES (CHAPTER UPLOADS) ---

app.post('/api/deliverables/upload', upload.single('deliverableFile'), async (req, res) => {
    let { student_id, chapter_title } = req.body;
    
    if (!req.file) {
        return res.status(400).json({ error: 'No document file received.' });
    }

    try {
        let validStudentId = parseInt(student_id, 10);
        if (isNaN(validStudentId) || !validStudentId) {
            const [firstStudent] = await db.query(`SELECT student_id FROM students LIMIT 1`);
            validStudentId = firstStudent.length > 0 ? firstStudent[0].student_id : 1;
        }

        const fileUrl = `/uploads/${req.file.filename}`;
        await db.query(
            `INSERT INTO project_deliverables (student_id, chapter_title, file_name, file_url) VALUES (?, ?, ?, ?)`,
            [validStudentId, chapter_title || 'Project Chapter', req.file.originalname, fileUrl]
        );
        
        res.status(201).json({ message: 'Chapter uploaded successfully', fileUrl, fileName: req.file.originalname });
    } catch (error) {
        res.status(500).json({ error: `Upload error: ${error.message}` });
    }
});

app.get('/api/deliverables', async (req, res) => {
    try {
        const [docs] = await db.query(`
            SELECT 
                d.deliverable_id,
                d.student_id,
                d.chapter_title,
                d.file_name,
                d.file_url,
                d.uploaded_at,
                COALESCE(u.full_name, 'Student') AS student_name,
                COALESCE(s.matric_no, 'N/A') AS matric_no,
                COALESCE(s.department, 'General') AS department
            FROM project_deliverables d
            LEFT JOIN students s ON d.student_id = s.student_id
            LEFT JOIN users u ON s.user_id = u.user_id
            ORDER BY d.deliverable_id DESC
        `);
        res.json(docs);
    } catch (error) {
        res.status(500).json({ error: 'Failed to load deliverables' });
    }
});

// --- 5. DEADLINES ---

app.get('/api/deadlines', async (req, res) => {
    try {
        const [deadlines] = await db.query(`SELECT * FROM project_deadlines ORDER BY deadline_date ASC`);
        res.json(deadlines);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch deadlines' });
    }
});

app.post('/api/deadlines', async (req, res) => {
    const { title, deadline_date } = req.body;
    if (!title || !deadline_date) return res.status(400).json({ error: 'Title and date required' });
    try {
        await db.query(`INSERT INTO project_deadlines (title, deadline_date) VALUES (?, ?)`, [title, deadline_date]);
        res.status(201).json({ message: 'Deadline saved' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create deadline' });
    }
});

// --- 6. GRADING ENGINE ---

function calculateGrade(total) {
    if (total >= 70) return 'A';
    if (total >= 60) return 'B';
    if (total >= 50) return 'C';
    if (total >= 45) return 'D';
    return 'F';
}

app.get('/api/grades', async (req, res) => {
    try {
        const [grades] = await db.query(`
            SELECT g.*, u.full_name AS grader_name, su.full_name AS student_name, st.matric_no, st.department
            FROM project_grades g
            JOIN staff staff_rec ON g.graded_by = staff_rec.staff_id
            JOIN users u ON staff_rec.user_id = u.user_id
            JOIN students st ON g.student_id = st.student_id
            JOIN users su ON st.user_id = su.user_id
        `);
        res.json(grades);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch grades' });
    }
});

app.get('/api/grades/student/:studentId', async (req, res) => {
    try {
        const [grades] = await db.query(
            `SELECT * FROM project_grades WHERE student_id = ?`,
            [req.params.studentId]
        );
        res.json(grades[0] || null);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch student grade' });
    }
});

app.post('/api/grades', async (req, res) => {
    const { student_id, documentation_score, implementation_score, presentation_score, remarks, staff_id } = req.body;

    const doc = parseFloat(documentation_score) || 0;
    const impl = parseFloat(implementation_score) || 0;
    const pres = parseFloat(presentation_score) || 0;
    const total = doc + impl + pres;
    const letterGrade = calculateGrade(total);

    try {
        let validStaffId = parseInt(staff_id, 10);
        if (isNaN(validStaffId) || !validStaffId) {
            const [firstStaff] = await db.query(`SELECT staff_id FROM staff LIMIT 1`);
            validStaffId = firstStaff.length > 0 ? firstStaff[0].staff_id : 1;
        }

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
        `, [student_id, doc, impl, pres, total, letterGrade, remarks || '', validStaffId]);

        // Send alert to student
        const [studentUser] = await db.query(`SELECT user_id FROM students WHERE student_id = ?`, [student_id]);
        if (studentUser.length > 0) {
            await db.query(
                `INSERT INTO system_notifications (user_id, message) VALUES (?, ?)`,
                [studentUser[0].user_id, `Your final project defense evaluation has been submitted: Total Score ${total}% (Grade: ${letterGrade}).`]
            );
        }

        res.json({ message: 'Grade recorded successfully', total_score: total, letter_grade: letterGrade });
    } catch (error) {
        res.status(500).json({ error: `Failed to record grade: ${error.message}` });
    }
});

// --- 7. PROPOSALS & REVIEW ENGINE ---

app.get('/api/proposals', async (req, res) => {
    try {
        const [proposals] = await db.query(`
            SELECT 
                p.proposal_id,
                p.student_id,
                u.user_id,
                u.full_name AS student_name,
                COALESCE(s.matric_no, 'N/A') AS matric_no,
                COALESCE(s.department, 'Computer Science') AS department,
                p.title,
                p.status,
                COALESCE((
                    SELECT pv.problem_statement 
                    FROM proposal_versions pv 
                    WHERE pv.proposal_id = p.proposal_id 
                    ORDER BY pv.version_number DESC LIMIT 1
                ), '') AS problem_statement,
                COALESCE((
                    SELECT pv.aim 
                    FROM proposal_versions pv 
                    WHERE pv.proposal_id = p.proposal_id 
                    ORDER BY pv.version_number DESC LIMIT 1
                ), '') AS aim,
                COALESCE((
                    SELECT pv.objectives 
                    FROM proposal_versions pv 
                    WHERE pv.proposal_id = p.proposal_id 
                    ORDER BY pv.version_number DESC LIMIT 1
                ), '') AS objectives,
                COALESCE((
                    SELECT MAX(pv.version_number) 
                    FROM proposal_versions pv 
                    WHERE pv.proposal_id = p.proposal_id
                ), 1) AS latest_version
            FROM proposals p
            JOIN students s ON p.student_id = s.student_id
            JOIN users u ON s.user_id = u.user_id
            ORDER BY p.proposal_id DESC
        `);
        res.json(proposals);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch proposals' });
    }
});

app.get('/api/proposals/:id/versions', async (req, res) => {
    try {
        const [versions] = await db.query(
            `SELECT * FROM proposal_versions WHERE proposal_id = ? ORDER BY version_number DESC`,
            [req.params.id]
        );
        res.json(versions);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch versions' });
    }
});

app.post('/api/proposals', async (req, res) => {
    let { student_id, title, problem_statement, aim, objectives } = req.body;
    if (!title || !problem_statement || !aim || !objectives) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    try {
        let validStudentId = parseInt(student_id, 10);
        if (isNaN(validStudentId) || !validStudentId) {
            const [firstStudent] = await db.query(`SELECT student_id FROM students LIMIT 1`);
            validStudentId = firstStudent.length > 0 ? firstStudent[0].student_id : 1;
        }

        const [proposalResult] = await db.query(
            `INSERT INTO proposals (student_id, title, status, submitted_at) VALUES (?, ?, 'SUBMITTED', NOW())`,
            [validStudentId, title]
        );
        const newProposalId = proposalResult.insertId;

        await smartInsert(db, 'proposal_versions', {
            proposal_id: newProposalId,
            version_number: 1,
            title,
            problem_statement,
            aim,
            objectives
        });

        res.status(201).json({ message: 'Proposal submitted successfully', proposal_id: newProposalId });
    } catch (error) {
        res.status(500).json({ error: 'Failed to submit proposal' });
    }
});

app.post('/api/proposals/:id/resubmit', async (req, res) => {
    const proposalId = req.params.id;
    const { title, problem_statement, aim, objectives } = req.body;

    try {
        const [latest] = await db.query(
            `SELECT MAX(version_number) AS max_v FROM proposal_versions WHERE proposal_id = ?`,
            [proposalId]
        );
        const nextVersion = (latest[0].max_v || 1) + 1;

        await smartInsert(db, 'proposal_versions', {
            proposal_id: proposalId,
            version_number: nextVersion,
            title,
            problem_statement,
            aim,
            objectives
        });

        await db.query(
            `UPDATE proposals SET title = ?, status = 'SUBMITTED', updated_at = NOW() WHERE proposal_id = ?`,
            [title, proposalId]
        );

        res.json({ message: `Version ${nextVersion} submitted successfully!` });
    } catch (error) {
        res.status(500).json({ error: 'Failed to submit revision' });
    }
});

app.post('/api/proposals/:id/review', async (req, res) => {
    const proposalId = req.params.id;
    let { status, feedback_notes } = req.body;

    if (status === 'CORRECTIONS_REQUIRED' || status === 'CORRECTION_REQUIRED') {
        status = 'UNDER_REVIEW';
    }

    try {
        await db.query(
            `UPDATE proposals SET status = ?, updated_at = NOW() WHERE proposal_id = ?`,
            [status, proposalId]
        );

        await db.query(
            `UPDATE proposal_versions SET feedback_notes = ? 
             WHERE proposal_id = ? 
             ORDER BY version_number DESC LIMIT 1`,
            [feedback_notes || 'No remarks added.', proposalId]
        );

        const [owner] = await db.query(
            `SELECT s.user_id, p.title FROM proposals p JOIN students s ON p.student_id = s.student_id WHERE p.proposal_id = ?`,
            [proposalId]
        );

        if (owner.length > 0) {
            await db.query(
                `INSERT INTO system_notifications (user_id, message) VALUES (?, ?)`,
                [owner[0].user_id, `Your project proposal "${owner[0].title}" has been updated to ${status}.`]
            );
        }

        res.json({ message: `Review saved and student notified.` });
    } catch (error) {
        res.status(500).json({ error: 'Failed to save review' });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});