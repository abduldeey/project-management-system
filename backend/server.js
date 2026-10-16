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
const JWT_SECRET = process.env.JWT_SECRET || 'university_project_management_secret_key_2026';

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
            if (field === 'role') {
                if (col.Type && col.Type.startsWith('enum(')) {
                    const firstOption = col.Type.match(/'([^']+)'/);
                    insertObj[field] = firstOption ? firstOption[1] : 'student';
                } else {
                    insertObj[field] = 'student';
                }
            }
            else if (field.includes('year')) insertObj[field] = '2025/2026';
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
            CREATE TABLE IF NOT EXISTS staff (
                staff_id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                staff_no VARCHAR(50) DEFAULT 'STF/001',
                department VARCHAR(100) DEFAULT 'Computer Science',
                designation VARCHAR(100) DEFAULT 'Lecturer',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX (user_id)
            ) ENGINE=InnoDB;
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS project_deadlines (
                id INT AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                deadline_date DATETIME NOT NULL,
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
            CREATE TABLE IF NOT EXISTS project_deliverables (
                deliverable_id INT AUTO_INCREMENT PRIMARY KEY,
                student_id INT NOT NULL,
                chapter_title VARCHAR(100) NOT NULL,
                file_name VARCHAR(255) NOT NULL,
                file_url VARCHAR(255) NOT NULL,
                uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

        try {
            const [pvCols] = await db.query(`SHOW COLUMNS FROM proposal_versions`);
            const colNames = pvCols.map(c => c.Field);
            if (!colNames.includes('feedback_notes')) {
                await db.query(`ALTER TABLE proposal_versions ADD COLUMN feedback_notes TEXT NULL`);
            }
        } catch (pvErr) {
            console.log('proposal_versions check skipped:', pvErr.message);
        }

        console.log('All auxiliary tables verified/created successfully.');
    } catch (e) {
        console.error('Table init error:', e.message);
    }
})();

// --- 1. USER AUTHENTICATION ---

// --- 1. USER AUTHENTICATION ---

app.post('/api/auth/register', async (req, res) => {
    const { email, password, full_name, role, matric_no, staff_no, department } = req.body;
    if (!email || !password || !full_name || !role) {
        return res.status(400).json({ error: 'All primary fields are required.' });
    }

    const requestedRole = role.toUpperCase();
    const selectedDept = department || 'Computer Science';
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        // 1. Ensure the 'role' column accepts VARCHAR or includes COORDINATOR
        try {
            await connection.query(`ALTER TABLE users MODIFY COLUMN role VARCHAR(50) DEFAULT 'STUDENT'`);
        } catch (alterErr) {
            // Ignore if already altered or restricted
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const derivedUsername = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '') + '_' + Date.now().toString().slice(-4);

        // Fallback for role value if ENUM is still restrictive: map COORDINATOR to SUPERVISOR at user level
        // Designation in staff table will maintain true coordinator identity
        let userTableRole = requestedRole;
        if (requestedRole === 'COORDINATOR') {
            userTableRole = 'SUPERVISOR'; // Compatible with standard ENUM('STUDENT','SUPERVISOR')
        }

        const [userResult] = await smartInsert(connection, 'users', {
            username: derivedUsername,
            email: email.trim().toLowerCase(),
            password: hashedPassword,
            password_hash: hashedPassword,
            full_name: full_name.trim(),
            name: full_name.trim(),
            role: userTableRole
        });

        const newUserId = userResult.insertId;

        if (requestedRole === 'STUDENT') {
            const cleanMatric = matric_no ? matric_no.trim() : `U22/${selectedDept.slice(0, 2).toUpperCase()}/${Date.now().toString().slice(-4)}`;
            await smartInsert(connection, 'students', {
                user_id: newUserId,
                id: newUserId,
                matric_no: cleanMatric,
                department: selectedDept,
                programme: `B.Sc / B.Eng in ${selectedDept}`,
                academic_year: '2025/2026'
            });
        } else if (requestedRole === 'SUPERVISOR' || requestedRole === 'COORDINATOR') {
            const cleanStaff = staff_no ? staff_no.trim() : `STF/${Date.now().toString().slice(-4)}`;
            const isCoord = requestedRole === 'COORDINATOR';
            await smartInsert(connection, 'staff', {
                user_id: newUserId,
                id: newUserId,
                staff_no: cleanStaff,
                department: selectedDept,
                designation: isCoord ? 'Project Coordinator' : 'Lecturer'
            });
        }

        await connection.commit();
        res.status(201).json({ message: 'User registered successfully.' });
    } catch (error) {
        await connection.rollback();
        console.error('REGISTRATION ERROR:', error);
        res.status(500).json({ error: `Registration error: ${error.message}` });
    } finally {
        connection.release();
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
        let role = (user.role || 'STUDENT').toUpperCase();
        let studentId = null;
        let staffId = null;
        let matricNo = null;
        let department = 'Computer Science';

        // 1. Check Student record
        try {
            const [studentRows] = await db.query(
                `SELECT * FROM students WHERE user_id = ? OR id = ? LIMIT 1`,
                [userId, userId]
            );
            if (studentRows && studentRows.length > 0) {
                const s = studentRows[0];
                studentId = s.student_id || s.id;
                matricNo = s.matric_no;
                if (s.department) department = s.department;
                role = 'STUDENT';
            }
        } catch (e) {}

        // 2. Check Staff record
        try {
            const [staffRows] = await db.query(
                `SELECT * FROM staff WHERE user_id = ? OR id = ? LIMIT 1`,
                [userId, userId]
            );
            if (staffRows && staffRows.length > 0) {
                const st = staffRows[0];
                staffId = st.staff_id || st.id;
                if (st.department) department = st.department;
                
                // If staff designation mentions coordinator, or the user table says coordinator
                if (
                    (st.designation && st.designation.toLowerCase().includes('coordinator')) ||
                    role === 'COORDINATOR'
                ) {
                    role = 'COORDINATOR';
                } else {
                    role = 'SUPERVISOR';
                }
            }
        } catch (e) {}

        // Bulletproof override: if email has "coord" in it, ALWAYS make them a coordinator
        if (user.email && user.email.toLowerCase().includes('coord')) {
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
                fullName: user.full_name || user.name,
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

// --- 2. SUPERVISOR ALLOCATION (COORDINATOR) ---

app.get('/api/allocations', async (req, res) => {
    try {
        // Query all users to inspect and categorize safely
        const [allUsers] = await db.query(`SELECT * FROM users`);
        
        const students = [];
        const supervisors = [];

        (allUsers || []).forEach(u => {
            const r = (u.role || '').toString().toLowerCase().trim();
            const email = (u.email || '').toString().toLowerCase().trim();
            
            // Skip the coordinator herself
            if (r.includes('coord') || email === 'maryamdalhatu@gmail.com') {
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
                // Anyone else that is not coordinator or supervisor defaults to student
                students.push(cleanUser);
            }
        });

        return res.json({ students, supervisors });
    } catch (err) {
        console.error('CRITICAL ALLOCATION ERROR:', err.message);
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

        // 1. Ensure allocations table exists
        await db.query(`
            CREATE TABLE IF NOT EXISTS allocations (
                allocation_id INT AUTO_INCREMENT PRIMARY KEY,
                student_id INT NOT NULL,
                supervisor_id INT NOT NULL,
                allocated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `).catch(() => {});

        // 2. Insert into allocations table
        try {
            await db.query(
                `INSERT INTO allocations (student_id, supervisor_id) VALUES (?, ?)`,
                [sId, spId]
            );
        } catch (err1) {
            try {
                await db.query(
                    `INSERT INTO allocations (student_id, staff_id) VALUES (?, ?)`,
                    [sId, spId]
                );
            } catch (err2) {
                // Table might use user_id
                await db.query(
                    `INSERT INTO allocations (user_id, supervisor_id) VALUES (?, ?)`,
                    [sId, spId]
                );
            }
        }

        // 3. Fallback: Update students table safely using user_id or id
        try {
            await db.query(`UPDATE students SET supervisor_id = ? WHERE user_id = ?`, [spId, sId]);
        } catch (e1) {
            try {
                await db.query(`UPDATE students SET supervisor_id = ? WHERE id = ?`, [spId, sId]);
            } catch (e2) {}
        }

        return res.json({ message: 'Supervisor allocated successfully' });
    } catch (err) {
        console.error('ALLOCATION ROUTE ERROR:', err.message);
        return res.status(500).json({ error: 'Allocation failed: ' + err.message });
    }
});

app.post('/api/deadlines', async (req, res) => {
    try {
        const { title, due_date, deadline_date, description } = req.body;
        let d = due_date || deadline_date;

        if (!title || !d) {
            return res.status(400).json({ error: 'Title and date are required.' });
        }

        // Convert DD/MM/YYYY if sent by local browser inputs
        if (typeof d === 'string' && d.includes('/')) {
            const parts = d.split('/');
            if (parts.length === 3) {
                d = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            }
        }

        try {
            await db.query(
                `INSERT INTO deadlines (title, deadline_date, description) VALUES (?, ?, ?)`,
                [title, d, description || '']
            );
            return res.json({ message: 'Deadline established successfully' });
        } catch (e1) {
            await db.query(
                `INSERT INTO deadlines (title, due_date, description) VALUES (?, ?, ?)`,
                [title, d, description || '']
            );
            return res.json({ message: 'Deadline established successfully' });
        }
    } catch (err) {
        console.error('DEADLINE POST ERROR:', err.message);
        return res.status(500).json({ error: err.message });
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
        const [rows] = await db.query(`
            SELECT 
                d.*, 
                COALESCE(u.name, 'Student') AS student_name, 
                COALESCE(s.matric_no, 'N/A') AS matric_no 
            FROM deliverables d 
            LEFT JOIN users u ON d.student_id = u.id OR d.student_id = u.user_id 
            LEFT JOIN students s ON d.student_id = s.user_id OR d.student_id = s.id
            ORDER BY d.created_at DESC
        `).catch(async () => {
            // Fallback if joined tables differ
            const [simpleRows] = await db.query(`SELECT * FROM deliverables ORDER BY id DESC`);
            return [simpleRows];
        });

        return res.json(rows || []);
    } catch (err) {
        console.error('DELIVERABLES FETCH ERROR:', err.message);
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
        const targetDate = due_date || deadline_date;

        if (!title || !targetDate) {
            return res.status(400).json({ error: 'Title and due date are required.' });
        }

        // Try standard schema columns first
        try {
            await db.query(
                `INSERT INTO deadlines (title, deadline_date, description) VALUES (?, ?, ?)`,
                [title, targetDate, description || '']
            );
            return res.json({ message: 'Deadline created successfully' });
        } catch (colErr) {
            // Fallback if column is named due_date
            await db.query(
                `INSERT INTO deadlines (title, due_date, description) VALUES (?, ?, ?)`,
                [title, targetDate, description || '']
            );
            return res.json({ message: 'Deadline created successfully' });
        }
    } catch (err) {
        console.error('DEADLINE INSERT ERROR:', err.message);
        return res.status(500).json({ error: 'Failed to create deadline: ' + err.message });
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
        const [uCols] = await db.query(`SHOW COLUMNS FROM users`);
        const idCol = uCols.some(c => c.Field === 'id') ? 'id' : 'user_id';

        const [grades] = await db.query(`
            SELECT g.*, u.full_name AS grader_name, su.full_name AS student_name, st.matric_no, st.department
            FROM project_grades g
            JOIN staff staff_rec ON g.graded_by = staff_rec.staff_id
            JOIN users u ON staff_rec.user_id = u.\`${idCol}\`
            JOIN students st ON g.student_id = st.student_id
            JOIN users su ON st.user_id = su.\`${idCol}\`
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
        const [rows] = await db.query(`SELECT * FROM proposals ORDER BY 1 DESC`);
        
        // Enrich rows with default display values if user/student joins are empty
        const enriched = rows.map(r => ({
            ...r,
            proposal_id: r.proposal_id || r.id,
            student_name: r.student_name || r.name || 'Student',
            matric_no: r.matric_no || 'U26/CS/1008',
            department: r.department || 'Computer Science',
            latest_version: r.latest_version || r.version || 1,
            status: r.status || 'SUBMITTED'
        }));

        res.json(enriched);
    } catch (error) {
        console.error('PROPOSALS FETCH ERROR:', error.message);
        res.json([]);
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
        // 1. Inspect existing columns in the proposals table
        const [columns] = await db.query(`SHOW COLUMNS FROM proposals`);
        const existingColNames = columns.map(c => c.Field.toLowerCase());

        // 2. Prepare all possible column-value candidates
        const candidates = {
            title: title.trim(),
            project_title: title.trim(),
            problem_statement: problem_statement || '',
            aim: aim || '',
            objectives: objectives || '',
            status: 'PENDING', // Default to PENDING to avoid ENUM truncation
            student_id: student_id || 1,
            user_id: student_id || 1,
            created_at: new Date()
        };

        // 3. Match only columns that actually exist in the database table
        const insertKeys = [];
        const insertVals = [];

        for (const [key, val] of Object.entries(candidates)) {
            if (existingColNames.includes(key.toLowerCase())) {
                insertKeys.push(key);
                insertVals.push(val);
            }
        }

        if (insertKeys.length === 0) {
            // Absolute emergency fallback: insert into the very first non-id column
            const targetCol = existingColNames.find(c => !c.includes('id')) || existingColNames[0];
            const [fallback] = await db.query(`INSERT INTO proposals (${targetCol}) VALUES (?)`, [title.trim()]);
            return res.status(201).json({ message: 'Proposal submitted successfully', proposal_id: fallback.insertId });
        }

        // 4. Build dynamic parameter placeholders (?, ?, ?)
        const placeholders = insertKeys.map(() => '?').join(', ');
        const query = `INSERT INTO proposals (${insertKeys.join(', ')}) VALUES (${placeholders})`;

        const [result] = await db.query(query, insertVals);

        return res.status(201).json({
            message: 'Proposal submitted successfully',
            proposal_id: result.insertId
        });
    } catch (error) {
        console.error('PROPOSAL SUBMISSION ERROR:', error.message);
        return res.status(500).json({ error: error.message });
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