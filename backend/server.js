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
        return res.status(404).json({
            status: 'File Missing',
            message: 'This file does not exist on the server disk.',
            searchedPath: filePath
        });
    }
    res.sendFile(filePath);
});

app.get('/api/test-uploads', (req, res) => {
    try {
        const files = fs.readdirSync(uploadsDir);
        res.json({
            success: true,
            totalFiles: files.length,
            filesInsideFolder: files
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Multer Storage Configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

// Database Schema Initializer
(async () => {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS staff (
                staff_id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                staff_no VARCHAR(50) DEFAULT 'STF/001',
                department VARCHAR(100) DEFAULT 'Computer Science',
                designation VARCHAR(100) DEFAULT 'Lecturer',
                role VARCHAR(50) DEFAULT 'SUPERVISOR',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX (user_id)
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
            CREATE TABLE IF NOT EXISTS system_notifications (
                notification_id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                message TEXT NOT NULL,
                is_read BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB;
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS deliverables (
                id INT AUTO_INCREMENT PRIMARY KEY,
                student_id INT NOT NULL,
                chapter_title VARCHAR(255) NOT NULL,
                file_name VARCHAR(255) NOT NULL,
                file_url VARCHAR(255),
                status VARCHAR(50) DEFAULT 'SUBMITTED',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB;
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS supervisor_allocations (
                allocation_id INT AUTO_INCREMENT PRIMARY KEY,
                student_id INT NOT NULL UNIQUE,
                staff_id INT NOT NULL,
                allocated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB;
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS allocations (
                allocation_id INT AUTO_INCREMENT PRIMARY KEY,
                student_id INT NOT NULL,
                supervisor_id INT NOT NULL,
                allocated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

        console.log('Database tables verified.');
    } catch (e) {
        console.error('Table init error:', e.message);
    }
})();

// --- 1. GENERAL AUTHENTICATION ---

app.post('/api/auth/register', async (req, res) => {
    try {
        const { fullName, name, email, password, role, matricNo, department } = req.body;
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
        if (existing.length > 0) {
            return res.status(400).json({ error: 'An account with this email already exists.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const [userResult] = await db.query(
            'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
            [userName, email.trim(), hashedPassword, finalRole]
        );
        const newUserId = userResult.insertId;

        let newStudentId = null;
        let newStaffId = null;

        if (finalRole === 'STUDENT') {
            try {
                const [stRes] = await db.query(
                    'INSERT INTO students (user_id, matric_no, department) VALUES (?, ?, ?)',
                    [newUserId, matricNo || 'N/A', department || 'Computer Science']
                );
                newStudentId = stRes.insertId;
            } catch (err) {
                console.warn('Student record notice:', err.message);
            }
        } else {
            try {
                const [staffRes] = await db.query(
                    'INSERT INTO staff (user_id, department, role, designation) VALUES (?, ?, ?, ?)',
                    [newUserId, department || 'Computer Science', finalRole, finalRole === 'COORDINATOR' ? 'Project Coordinator' : 'Lecturer']
                );
                newStaffId = staffRes.insertId;
            } catch (err) {
                console.warn('Staff record notice:', err.message);
            }
        }

        return res.status(201).json({
            message: 'Account created successfully',
            user: {
                userId: newUserId,
                id: newUserId,
                fullName: userName,
                name: userName,
                email: email.trim(),
                role: finalRole,
                studentId: newStudentId,
                staffId: newStaffId,
                matricNo: matricNo || ''
            }
        });
    } catch (error) {
        console.error('REGISTRATION ERROR:', error.message);
        return res.status(500).json({ error: 'Registration failed: ' + error.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    try {
        const [users] = await db.query(
            `SELECT * FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1`,
            [email.trim()]
        );

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

        // Read student profile
        try {
            const [studentRows] = await db.query(
                `SELECT * FROM students WHERE user_id = ? OR id = ? LIMIT 1`,
                [userId, userId]
            );
            if (studentRows && studentRows.length > 0) {
                studentId = studentRows[0].student_id || studentRows[0].id;
                matricNo = studentRows[0].matric_no;
                if (studentRows[0].department) department = studentRows[0].department;
                if (!role.includes('COORD') && !role.includes('SUPER')) {
                    role = 'STUDENT';
                }
            }
        } catch (e) {}

        // Read staff profile
        try {
            const [staffRows] = await db.query(
                `SELECT * FROM staff WHERE user_id = ? OR id = ? LIMIT 1`,
                [userId, userId]
            );
            if (staffRows && staffRows.length > 0) {
                staffId = staffRows[0].staff_id || staffRows[0].id;
                if (staffRows[0].department) department = staffRows[0].department;
                const stRole = (staffRows[0].role || staffRows[0].designation || '').toUpperCase();
                if (stRole.includes('COORD') || role.includes('COORD')) {
                    role = 'COORDINATOR';
                } else {
                    role = 'SUPERVISOR';
                }
            }
        } catch (e) {}

        // Fallback for coordinator detection by role/email
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
                fullName: user.full_name || user.name,
                name: user.full_name || user.name,
                email: user.email,
                role,
                department,
                studentId,
                staffId,
                matricNo
            }
        });
    } catch (error) {
        console.error('LOGIN ERROR:', error.message);
        return res.status(500).json({ error: 'Internal login error: ' + error.message });
    }
});

// --- 2. SUPERVISOR ALLOCATION ---

app.get('/api/allocations', async (req, res) => {
    try {
        const [allUsers] = await db.query(`SELECT * FROM users`);
        
        const students = [];
        const supervisors = [];

        (allUsers || []).forEach(u => {
            const r = (u.role || '').toString().toLowerCase().trim();
            const email = (u.email || '').toString().toLowerCase().trim();
            
            if (r.includes('coord') || email.includes('coord')) {
                return;
            }

            const cleanUser = {
                student_id: u.student_id || u.user_id || u.id,
                staff_id: u.staff_id || u.supervisor_id || u.user_id || u.id,
                full_name: u.full_name || u.fullName || u.name || email,
                matric_no: u.matric_no || u.matricNo || 'N/A',
                email: u.email
            };

            if (r.includes('super') || r.includes('lect') || r.includes('facul')) {
                supervisors.push(cleanUser);
            } else {
                students.push(cleanUser);
            }
        });

        return res.json({ students, supervisors });
    } catch (err) {
        return res.status(500).json({ error: err.message, students: [], supervisors: [] });
    }
});

app.post('/api/allocations', async (req, res) => {
    try {
        const { studentId, student_id, supervisorId, supervisor_id } = req.body;
        const sId = studentId || student_id;
        const spId = supervisorId || supervisor_id;

        if (!sId || !spId) {
            return res.status(400).json({ error: 'Please select both a student and a supervisor.' });
        }

        await db.query(`
            INSERT INTO allocations (student_id, supervisor_id) VALUES (?, ?)
            ON DUPLICATE KEY UPDATE supervisor_id = VALUES(supervisor_id)
        `, [sId, spId]).catch(() => {});

        await db.query(`
            INSERT INTO supervisor_allocations (student_id, staff_id) VALUES (?, ?)
            ON DUPLICATE KEY UPDATE staff_id = VALUES(staff_id)
        `, [sId, spId]).catch(() => {});

        try {
            await db.query(`UPDATE students SET supervisor_id = ? WHERE user_id = ? OR student_id = ? OR id = ?`, [spId, sId, sId, sId]);
        } catch (e) {}

        return res.json({ message: 'Supervisor allocated successfully' });
    } catch (err) {
        return res.status(500).json({ error: 'Allocation failed: ' + err.message });
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

// --- 4. DELIVERABLES ---

app.post('/api/deliverables', upload.single('file'), async (req, res) => {
    try {
        const body = req.body || {};
        const studentId = body.student_id || body.studentId;
        const chapterTitle = body.chapter_title || body.chapterTitle || 'Chapter Submission';
        const originalName = req.file ? req.file.originalname : 'document.pdf';
        const fileUrl = req.file ? `/uploads/${req.file.filename}` : 'uploaded_document.pdf';

        if (!studentId) {
            return res.status(400).json({ error: 'Missing student identifier.' });
        }

        await db.query(
            `INSERT INTO deliverables (student_id, chapter_title, file_name, file_url, status) VALUES (?, ?, ?, ?, 'SUBMITTED')`,
            [studentId, chapterTitle, originalName, fileUrl]
        );

        return res.json({ message: 'Chapter uploaded successfully!' });
    } catch (err) {
        return res.status(500).json({ error: 'Upload failed: ' + err.message });
    }
});

app.get('/api/deliverables', async (req, res) => {
    try {
        const { supervisorId, studentId, role } = req.query;

        let query = `
            SELECT 
                d.*,
                COALESCE(u.name, u.full_name, 'Student') AS student_name,
                s.matric_no
            FROM deliverables d
            LEFT JOIN students s ON (d.student_id = s.student_id OR d.student_id = s.id OR d.student_id = s.user_id)
            LEFT JOIN users u ON (s.user_id = u.id OR d.student_id = u.id)
        `;
        const params = [];

        // 1. Student view: strictly their own
        if (role === 'STUDENT' || (studentId && role !== 'COORDINATOR' && role !== 'SUPERVISOR')) {
            const sid = studentId || supervisorId;
            query += `
                WHERE d.student_id = ? 
                   OR d.student_id = (SELECT user_id FROM students WHERE student_id = ? OR id = ? LIMIT 1)
                   OR s.user_id = ?
            `;
            params.push(sid, sid, sid, sid);
        }
        // 2. Supervisor view: only allocated students
        else if (supervisorId && role === 'SUPERVISOR') {
            query += `
                WHERE d.student_id IN (
                    SELECT student_id FROM supervisor_allocations WHERE staff_id = ? OR staff_id = (SELECT staff_id FROM staff WHERE user_id = ? LIMIT 1)
                    UNION
                    SELECT student_id FROM allocations WHERE supervisor_id = ? OR supervisor_id = (SELECT staff_id FROM staff WHERE user_id = ? LIMIT 1)
                )
                OR s.user_id IN (
                    SELECT student_id FROM supervisor_allocations WHERE staff_id = ? OR staff_id = (SELECT staff_id FROM staff WHERE user_id = ? LIMIT 1)
                    UNION
                    SELECT student_id FROM allocations WHERE supervisor_id = ? OR supervisor_id = (SELECT staff_id FROM staff WHERE user_id = ? LIMIT 1)
                )
            `;
            params.push(supervisorId, supervisorId, supervisorId, supervisorId, supervisorId, supervisorId, supervisorId, supervisorId);
        }

        query += ` ORDER BY d.created_at DESC`;

        const [rows] = await db.query(query, params);
        return res.json(rows);
    } catch (err) {
        return res.json([]);
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
    try {
        const { title, due_date, deadline_date, description } = req.body;
        let d = due_date || deadline_date;

        if (!title || !d) {
            return res.status(400).json({ error: 'Title and date are required.' });
        }

        if (typeof d === 'string' && d.includes('/')) {
            const parts = d.split('/');
            if (parts.length === 3) {
                d = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            }
        }

        await db.query(
            `INSERT INTO project_deadlines (title, deadline_date, description) VALUES (?, ?, ?)`,
            [title, d, description || '']
        );
        return res.json({ message: 'Deadline established successfully' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
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
            SELECT g.*, COALESCE(u.name, u.full_name, 'Supervisor') AS grader_name, 
                   COALESCE(su.name, su.full_name, 'Student') AS student_name, 
                   st.matric_no, st.department
            FROM project_grades g
            LEFT JOIN staff staff_rec ON g.graded_by = staff_rec.staff_id
            LEFT JOIN users u ON staff_rec.user_id = u.id
            LEFT JOIN students st ON g.student_id = st.student_id OR g.student_id = st.id OR g.student_id = st.user_id
            LEFT JOIN users su ON st.user_id = su.id
        `);
        res.json(grades);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch grades' });
    }
});

app.get('/api/grades/student/:studentId', async (req, res) => {
    try {
        const { studentId } = req.params;
        const { matric } = req.query;

        if (!studentId || studentId === 'undefined' || studentId === 'null') {
            return res.json(null);
        }

        const [grades] = await db.query(
            `SELECT g.*, COALESCE(u.name, u.full_name, 'Supervisor') AS grader_name 
             FROM project_grades g
             LEFT JOIN staff st ON g.graded_by = st.staff_id
             LEFT JOIN users u ON (st.user_id = u.id OR g.graded_by = u.id)
             WHERE g.student_id = ? 
                OR g.student_id = (SELECT user_id FROM students WHERE (student_id = ? OR id = ? OR matric_no = ?) LIMIT 1)
                OR g.student_id = (SELECT student_id FROM students WHERE (user_id = ? OR matric_no = ?) LIMIT 1)
             ORDER BY g.graded_at DESC LIMIT 1`,
            [studentId, studentId, studentId, matric || '', studentId, matric || '']
        );

        if (grades && grades.length > 0) {
            return res.json(grades[0]);
        }

        return res.json(null);
    } catch (error) {
        return res.json(null);
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

        return res.json({ message: 'Grade recorded successfully', total_score: total, letter_grade: letterGrade });
    } catch (error) {
        return res.status(500).json({ error: `Failed to record grade: ${error.message}` });
    }
});

// --- 7. PROPOSALS ---

app.get('/api/proposals', async (req, res) => {
    try {
        const { supervisorId, studentId, role } = req.query;

        let query = `
            SELECT 
                p.*,
                COALESCE(u.name, u.full_name, 'Student') AS student_name,
                s.matric_no
            FROM proposals p
            LEFT JOIN students s ON (p.student_id = s.student_id OR p.student_id = s.id OR p.student_id = s.user_id)
            LEFT JOIN users u ON (s.user_id = u.id OR p.student_id = u.id)
        `;
        const params = [];

        // 1. Student view: strictly their own
        if (role === 'STUDENT' || (studentId && role !== 'COORDINATOR' && role !== 'SUPERVISOR')) {
            const sid = studentId || supervisorId;
            query += `
                WHERE p.student_id = ? 
                   OR p.student_id = (SELECT user_id FROM students WHERE student_id = ? OR id = ? LIMIT 1)
                   OR s.user_id = ?
            `;
            params.push(sid, sid, sid, sid);
        }
        // 2. Supervisor view: only allocated students
        else if (supervisorId && role === 'SUPERVISOR') {
            query += `
                WHERE p.student_id IN (
                    SELECT student_id FROM supervisor_allocations WHERE staff_id = ? OR staff_id = (SELECT staff_id FROM staff WHERE user_id = ? LIMIT 1)
                    UNION
                    SELECT student_id FROM allocations WHERE supervisor_id = ? OR supervisor_id = (SELECT staff_id FROM staff WHERE user_id = ? LIMIT 1)
                )
                OR s.user_id IN (
                    SELECT student_id FROM supervisor_allocations WHERE staff_id = ? OR staff_id = (SELECT staff_id FROM staff WHERE user_id = ? LIMIT 1)
                    UNION
                    SELECT student_id FROM allocations WHERE supervisor_id = ? OR supervisor_id = (SELECT staff_id FROM staff WHERE user_id = ? LIMIT 1)
                )
            `;
            params.push(supervisorId, supervisorId, supervisorId, supervisorId, supervisorId, supervisorId, supervisorId, supervisorId);
        }

        query += ` ORDER BY p.id DESC`;

        const [rows] = await db.query(query, params);
        return res.json(rows);
    } catch (err) {
        return res.json([]);
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
    const { title, problem_statement, aim, objectives, student_id } = req.body;
    if (!title) {
        return res.status(400).json({ error: 'Project title is required.' });
    }

    try {
        const [result] = await db.query(
            `INSERT INTO proposals (title, problem_statement, aim, objectives, student_id, status) VALUES (?, ?, ?, ?, ?, 'PENDING')`,
            [title.trim(), problem_statement || '', aim || '', objectives || '', student_id]
        );

        return res.status(201).json({
            message: 'Proposal submitted successfully',
            proposal_id: result.insertId
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

app.put('/api/proposals/:id/review', async (req, res) => {
    try {
        const { id } = req.params;
        const { status, remarks } = req.body;

        await db.query(
            `UPDATE proposals SET status = ?, remarks = ? WHERE id = ?`,
            [status || 'APPROVED', remarks || null, id]
        );

        return res.json({ message: 'Proposal review updated successfully' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});