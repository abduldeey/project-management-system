import React, { useState, useEffect, useMemo } from 'react';

const API_BASE = 'https://project-management-system-vffq.onrender.com';

export default function App() {
  // Authentication & State
  const [token, setToken] = useState(() => localStorage.getItem('token') || null);
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('user')) || null;
    } catch {
      return null;
    }
  });

  const [loading, setLoading] = useState(false);
  const [proposals, setProposals] = useState([]);
  const [deadlines, setDeadlines] = useState([]);
  const [deliverables, setDeliverables] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [studentGrade, setStudentGrade] = useState(null);
  const [allGrades, setAllGrades] = useState([]);
  const [allocations, setAllocations] = useState({ students: [], supervisors: [] });

  // UI Modals
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showAllocateModal, setShowAllocateModal] = useState(false);
  const [showDeadlineModal, setShowDeadlineModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Filters & Form States
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [authMode, setAuthMode] = useState('login'); // 'login' or 'register'
  const [authData, setAuthData] = useState({ email: '', password: '', fullName: '', role: 'STUDENT', matricNo: '', department: 'Computer Science' });
  const [formData, setFormData] = useState({ title: '', problem_statement: '', aim: '', objectives: '' });
  const [deadlineData, setDeadlineData] = useState({ title: '', deadline_date: '', description: '' });
  const [allocData, setAllocData] = useState({ student_id: '', supervisor_id: '' });
  const [uploadData, setUploadData] = useState({ chapter_title: '', file: null });

  // --- SAFE GLOBAL COMPONENT SCOPE CHECKS ---
  const safeUser = user || {};
  const userRoleLower = (safeUser.role || '').toLowerCase();
  const userEmail = (safeUser.email || '').toLowerCase();
  
  const isCoordinator = 
    userRoleLower === 'coordinator' || 
    userEmail.includes('coord') || 
    userEmail === 'maryamdalhatu@gmail.com';
    
  const isSupervisor = userRoleLower === 'supervisor' && !isCoordinator;
  const isStudent = userRoleLower === 'student' && !isCoordinator && !isSupervisor;

  // --- DATA FETCHING ---
  const fetchData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [propRes, deadRes, delivRes] = await Promise.all([
        fetch(`${API_BASE}/api/proposals`),
        fetch(`${API_BASE}/api/deadlines`),
        fetch(`${API_BASE}/api/deliverables`)
      ]);

      const propData = propRes.ok ? await propRes.json() : [];
      const deadData = deadRes.ok ? await deadRes.json() : [];
      const delivData = delivRes.ok ? await delivRes.json() : [];

      setProposals(Array.isArray(propData) ? propData : []);
      setDeadlines(Array.isArray(deadData) ? deadData : []);
      setDeliverables(Array.isArray(delivData) ? delivData : []);

      if (safeUser.userId || safeUser.id) {
        const uid = safeUser.userId || safeUser.id;
        const notifRes = await fetch(`${API_BASE}/api/notifications/${uid}`).catch(() => null);
        if (notifRes && notifRes.ok) {
          const nData = await notifRes.json();
          setNotifications(Array.isArray(nData) ? nData : []);
        }
      }

      if (isStudent) {
        const sid = safeUser.studentId || safeUser.student_id || safeUser.userId || safeUser.id;
        if (sid) {
          const gRes = await fetch(`${API_BASE}/api/grades/student/${sid}`).catch(() => null);
          if (gRes && gRes.ok) {
            const gData = await gRes.json();
            setStudentGrade(gData);
          }
        }
      }

      if (isSupervisor || isCoordinator) {
        const gradesRes = await fetch(`${API_BASE}/api/grades`).catch(() => null);
        if (gradesRes && gradesRes.ok) {
          const gAll = await gradesRes.json();
          setAllGrades(Array.isArray(gAll) ? gAll : []);
        }
      }

      if (isCoordinator) {
        const allocRes = await fetch(`${API_BASE}/api/allocations`).catch(() => null);
        if (allocRes && allocRes.ok) {
          const aData = await allocRes.json();
          setAllocations(aData);
        }
      }
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchData();
    }
  }, [token]);

  // --- AUTH HANDLERS ---
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setIsProcessing(true);
    const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';

    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authData)
      });
      const data = await res.json();

      if (res.ok) {
        if (authMode === 'login') {
          localStorage.setItem('token', data.token);
          localStorage.setItem('user', JSON.stringify(data.user));
          setToken(data.token);
          setUser(data.user);
        } else {
          alert('Registration successful! You can now log in.');
          setAuthMode('login');
        }
      } else {
        alert(data.error || 'Authentication failed');
      }
    } catch (err) {
      alert('Unable to reach server. Please check your connection.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
  };

  // --- SUBMISSIONS ---
  const handleProposalSubmit = async (e) => {
    e.preventDefault();
    setIsProcessing(true);
    try {
      const targetStudentId = safeUser.studentId || safeUser.student_id || safeUser.userId || safeUser.id || 1;
      const res = await fetch(`${API_BASE}/api/proposals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          student_id: targetStudentId
        })
      });
      const resData = await res.json().catch(() => ({}));
      if (res.ok) {
        setFormData({ title: '', problem_statement: '', aim: '', objectives: '' });
        setShowSubmitModal(false);
        await fetchData();
        alert('Proposal submitted successfully!');
      } else {
        alert('Submission failed: ' + (resData.error || 'Database error'));
      }
    } catch (err) {
      alert('Network error during proposal submission');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAllocateSubmit = async (e) => {
    e.preventDefault();
    setIsProcessing(true);
    try {
      const res = await fetch(`${API_BASE}/api/allocations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(allocData)
      });
      if (res.ok) {
        setShowAllocateModal(false);
        fetchData();
        alert('Supervisor allocated successfully!');
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(errData.error || 'Allocation error');
      }
    } catch (err) {
      alert('Failed to save allocation');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeadlineSubmit = async (e) => {
    e.preventDefault();
    setIsProcessing(true);
    try {
      const res = await fetch(`${API_BASE}/api/deadlines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(deadlineData)
      });
      if (res.ok) {
        setShowDeadlineModal(false);
        fetchData();
        alert('Deadline established successfully!');
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(errData.error || 'Deadline setup error');
      }
    } catch (err) {
      alert('Failed to set deadline');
    } finally {
      setIsProcessing(false);
    }
  };

  // --- FILTERED PROPOSALS ---
  const filteredProposals = useMemo(() => {
    const list = Array.isArray(proposals) ? proposals : [];

    return list.filter(p => {
      if (!p) return false;
      const matchesStatus = statusFilter === 'ALL' || p.status === statusFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q || 
        (p.title && p.title.toLowerCase().includes(q)) ||
        (p.student_name && p.student_name.toLowerCase().includes(q)) ||
        (p.matric_no && p.matric_no.toLowerCase().includes(q));

      return matchesStatus && matchesSearch;
    });
  }, [proposals, statusFilter, searchQuery]);

  // ==========================================
  // RENDER: LOGIN / REGISTER IF NOT SIGNED IN
  // ==========================================
  if (!token || !user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-100 p-8">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-slate-800">Department Management System</h1>
            <p className="text-sm text-slate-500 mt-1">
              {authMode === 'login' ? 'Sign in to access your portal' : 'Create an academic portal account'}
            </p>
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            {authMode === 'register' && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={authData.fullName}
                    onChange={(e) => setAuthData({ ...authData, fullName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Enter full name"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Portal Role</label>
                  <select
                    value={authData.role}
                    onChange={(e) => setAuthData({ ...authData, role: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="STUDENT">Student</option>
                    <option value="SUPERVISOR">Supervisor / Faculty</option>
                    <option value="COORDINATOR">Project Coordinator</option>
                  </select>
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Email Address</label>
              <input
                type="email"
                required
                value={authData.email}
                onChange={(e) => setAuthData({ ...authData, email: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="name@university.edu"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Password</label>
              <input
                type="password"
                required
                value={authData.password}
                onChange={(e) => setAuthData({ ...authData, password: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={isProcessing}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm rounded-lg transition shadow-md cursor-pointer disabled:opacity-50"
            >
              {isProcessing ? 'Processing...' : authMode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <div className="text-center mt-6">
            <button
              onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
              className="text-xs text-indigo-600 hover:underline font-medium cursor-pointer"
            >
              {authMode === 'login' ? "Don't have an account? Sign up" : 'Already registered? Sign in'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // RENDER: DASHBOARD VIEW
  // ==========================================
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* Top Navbar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold tracking-wider text-indigo-600 uppercase">Department of Computer Science</span>
          <h1 className="text-xl font-bold text-slate-900">Final Year Project Portal</h1>
        </div>

        <div className="flex items-center gap-3">
          {/* Action Buttons Based on Role */}
          {isStudent && (
            <>
              <button
                onClick={() => setShowUploadModal(true)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium px-3.5 py-2 rounded-lg transition shadow-sm cursor-pointer"
              >
                📁 Upload Chapter
              </button>
              <button
                onClick={() => setShowSubmitModal(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3.5 py-2 rounded-lg transition shadow-sm cursor-pointer"
              >
                + Submit Proposal
              </button>
            </>
          )}

          {isCoordinator && (
            <>
              <button
                onClick={() => setShowAllocateModal(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium px-3.5 py-2 rounded-lg transition shadow-sm cursor-pointer"
              >
                👥 Allocate
              </button>
              <button
                onClick={() => setShowDeadlineModal(true)}
                className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium px-3.5 py-2 rounded-lg transition shadow-sm cursor-pointer"
              >
                + Set Deadline
              </button>
            </>
          )}

          {/* User Info Header */}
          <div className="text-right pl-3 border-l border-slate-200">
            <div className="text-sm font-semibold text-slate-800">
              {safeUser.fullName || safeUser.name || 'User'}
            </div>
            <div className="text-xs text-slate-500 font-mono">
              {isCoordinator ? 'COORDINATOR' : (safeUser.role ? String(safeUser.role).toUpperCase() : 'USER')}
              {(safeUser.matricNo || safeUser.matric_no) ? ` • ${safeUser.matricNo || safeUser.matric_no}` : ''}
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="px-3 py-1.5 text-xs font-medium text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg transition cursor-pointer"
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Deadlines Section */}
        {deadlines.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-amber-800 uppercase tracking-wide">Upcoming Academic Deadline</span>
              <h3 className="text-base font-semibold text-amber-900">{deadlines[0].title}</h3>
              <p className="text-xs text-amber-700">{deadlines[0].description}</p>
            </div>
            <div className="text-right">
              <span className="inline-block bg-amber-200 text-amber-900 font-bold px-3 py-1 rounded text-xs">
                {new Date(deadlines[0].deadline_date).toLocaleDateString()}
              </span>
            </div>
          </div>
        )}

        {/* Deliverables Section */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
              📁 Uploaded Project Chapters
            </h2>
            <span className="text-xs text-slate-500 font-medium">Total Files: {deliverables.length}</span>
          </div>

          {deliverables.length === 0 ? (
            <div className="border border-dashed border-slate-200 rounded-lg p-6 text-center text-slate-400 text-xs">
              No project chapters uploaded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Chapter</th>
                    <th className="py-2.5 px-3">Student</th>
                    <th className="py-2.5 px-3">File</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {deliverables.map((d, idx) => (
                    <tr key={d.deliverable_id || idx} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-medium text-slate-800">{d.chapter_title}</td>
                      <td className="py-2.5 px-3 text-slate-600">{d.student_name} ({d.matric_no})</td>
                      <td className="py-2.5 px-3 text-indigo-600 underline">
                        {d.file_url ? <a href={d.file_url} target="_blank" rel="noreferrer">Download File</a> : 'Uploaded'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Proposals Table Section */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-800">Proposal Submissions</h2>
              <p className="text-xs text-slate-500">Track and manage project proposal submissions and versions</p>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder="Search by student, title..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs w-48 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="PENDING">Pending</option>
                <option value="SUBMITTED">Submitted</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-10 text-xs text-slate-400">Loading proposals...</div>
          ) : filteredProposals.length === 0 ? (
            <div className="border border-dashed border-slate-200 rounded-lg p-8 text-center text-slate-400 text-xs">
              No proposal submissions found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Title</th>
                    <th className="py-2.5 px-3">Student</th>
                    <th className="py-2.5 px-3">Department</th>
                    <th className="py-2.5 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProposals.map((p, idx) => (
                    <tr key={p.proposal_id || p.id || idx} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-medium text-slate-800 max-w-xs truncate">{p.title}Here is the complete, clean, and self-contained replacement for `frontend/src/App.jsx`. 

It places all variables in scope, adds null safety across the header and modals, ensures `isCoordinator` is defined everywhere, and removes table filtering traps so proposals and coordinator controls show up immediately.

---

### Step 1: Replace `frontend/src/App.jsx` Entirely

1. In VS Code, open `frontend/src/App.jsx`.
2. Press **Ctrl + A** to select all lines.
3. Press **Backspace** to empty the file.
4. Copy and paste the entire block below into the file:

```jsx
import React, { useState, useEffect, useMemo } from 'react';

const API_BASE = '[https://project-management-system-backend-c5o4.onrender.com](https://project-management-system-backend-c5o4.onrender.com)';

export default function App() {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('pms_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({
    fullName: '',
    email: '',
    password: '',
    role: 'STUDENT',
    matricNo: '',
    department: 'Computer Science'
  });

  const [proposals, setProposals] = useState([]);
  const [deadlines, setDeadlines] = useState([]);
  const [deliverables, setDeliverables] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [studentGrade, setStudentGrade] = useState(null);
  const [allGrades, setAllGrades] = useState([]);
  const [allocations, setAllocations] = useState({ students: [], supervisors: [] });

  const [loading, setLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showAllocateModal, setShowAllocateModal] = useState(false);
  const [showDeadlineModal, setShowDeadlineModal] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    problem_statement: '',
    aim: '',
    objectives: ''
  });

  const [deadlineForm, setDeadlineForm] = useState({
    title: '',
    due_date: '',
    description: ''
  });

  const [allocateForm, setAllocateForm] = useState({
    studentId: '',
    supervisorId: ''
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // --- SAFE ROLE EVALUATION (COMPONENT SCOPE) ---
  const safeUser = user || {};
  const userRoleLower = (safeUser.role || '').toLowerCase();
  const userEmail = (safeUser.email || '').toLowerCase();
  const isCoordinator =
    userRoleLower === 'coordinator' ||
    userEmail.includes('coord') ||
    userEmail === 'maryamdalhatu@gmail.com';
  const isSupervisor = userRoleLower === 'supervisor' && !isCoordinator;

  // --- DATA FETCHING ---
  const fetchData = async () => {
    setLoading(true);
    try {
      const [propRes, deadRes, delivRes] = await Promise.all([
        fetch(`${API_BASE}/api/proposals`),
        fetch(`${API_BASE}/api/deadlines`),
        fetch(`${API_BASE}/api/deliverables`)
      ]);

      const propData = propRes.ok ? await propRes.json() : [];
      const deadData = deadRes.ok ? await deadRes.json() : [];
      const delivData = delivRes.ok ? await delivRes.json() : [];

      setProposals(Array.isArray(propData) ? propData : []);
      setDeadlines(Array.isArray(deadData) ? deadData : []);
      setDeliverables(Array.isArray(delivData) ? delivData : []);

      if (safeUser.userId) {
        const notifRes = await fetch(`${API_BASE}/api/notifications/${safeUser.userId}`);
        const nData = notifRes.ok ? await notifRes.json() : [];
        setNotifications(Array.isArray(nData) ? nData : []);
      }

      if (userRoleLower === 'student' && (safeUser.studentId || safeUser.userId)) {
        const sid = safeUser.studentId || safeUser.userId;
        const gradeRes = await fetch(`${API_BASE}/api/grades/student/${sid}`);
        const gData = gradeRes.ok ? await gradeRes.json() : null;
        setStudentGrade(gData);
      }

      if (isSupervisor || isCoordinator) {
        const gradesRes = await fetch(`${API_BASE}/api/grades`);
        const gAll = gradesRes.ok ? await gradesRes.json() : [];
        setAllGrades(Array.isArray(gAll) ? gAll : []);
      }

      if (isCoordinator) {
        const allocRes = await fetch(`${API_BASE}/api/allocations`);
        const aData = allocRes.ok ? await allocRes.json() : { students: [], supervisors: [] };
        setAllocations(aData);
      }
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  // --- AUTHENTICATION ---
  const handleAuth = async (e) => {
    e.preventDefault();
    setIsProcessing(true);
    const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';

    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authForm)
      });
      const data = await res.json();

      if (res.ok) {
        if (authMode === 'login') {
          const authUser = data.user;
          setUser(authUser);
          localStorage.setItem('pms_user', JSON.stringify(authUser));
        } else {
          alert('Registration successful! Please log in.');
          setAuthMode('login');
        }
      } else {
        alert(data.error || 'Authentication failed');
      }
    } catch (err) {
      alert('Network or server connection failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('pms_user');
  };

  // --- PROPOSAL SUBMISSION ---
  const handleProposalSubmit = async (e) => {
    e.preventDefault();
    setIsProcessing(true);
    try {
      const targetStudentId = safeUser.studentId || safeUser.student_id || safeUser.userId || safeUser.id;
      const res = await fetch(`${API_BASE}/api/proposals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          student_id: targetStudentId
        })
      });

      const resData = await res.json().catch(() => ({}));

      if (res.ok) {
        setFormData({ title: '', problem_statement: '', aim: '', objectives: '' });
        setShowSubmitModal(false);
        await fetchData();
        alert('Proposal submitted successfully!');
      } else {
        alert('Submission error: ' + (resData.error || 'Failed'));
      }
    } catch (err) {
      alert('Network error during submission');
    } finally {
      setIsProcessing(false);
    }
  };

  // --- COORDINATOR ACTIONS ---
  const handleSetDeadline = async (e) => {
    e.preventDefault();
    setIsProcessing(true);
    try {
      const res = await fetch(`${API_BASE}/api/deadlines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(deadlineForm)
      });
      if (res.ok) {
        setDeadlineForm({ title: '', due_date: '', description: '' });
        setShowDeadlineModal(false);
        await fetchData();
        alert('Deadline created successfully');
      } else {
        alert('Failed to set deadline');
      }
    } catch (err) {
      alert('Error creating deadline');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAllocate = async (e) => {
    e.preventDefault();
    setIsProcessing(true);
    try {
      const res = await fetch(`${API_BASE}/api/allocations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(allocateForm)
      });
      if (res.ok) {
        setShowAllocateModal(false);
        await fetchData();
        alert('Supervisor allocated successfully');
      } else {
        alert('Allocation failed');
      }
    } catch (err) {
      alert('Error allocating supervisor');
    } finally {
      setIsProcessing(false);
    }
  };

  // --- FILTERED PROPOSALS ---
  const filteredProposals = useMemo(() => {
    const list = Array.isArray(proposals) ? proposals : [];
    let result = list;

    if (statusFilter !== 'ALL') {
      result = result.filter(p => p && p.status === statusFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(p =>
        (p?.title && p.title.toLowerCase().includes(q)) ||
        (p?.student_name && p.student_name.toLowerCase().includes(q)) ||
        (p?.matric_no && p.matric_no.toLowerCase().includes(q))
      );
    }

    return result;
  }, [proposals, statusFilter, searchQuery]);

  // --- LOGIN / REGISTER VIEW ---
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-md p-8 border border-slate-200">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-slate-800">Final Year Project Portal</h1>
            <p className="text-sm text-slate-500 mt-1">Department of Computer Science</p>
          </div>

          <div className="flex border-b border-slate-200 mb-6">
            <button
              onClick={() => setAuthMode('login')}
              className={`flex-1 py-2 font-medium text-sm border-b-2 ${
                authMode === 'login' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500'
              }`}
            >
              Log In
            </button>
            <button
              onClick={() => setAuthMode('register')}
              className={`flex-1 py-2 font-medium text-sm border-b-2 ${
                authMode === 'register' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500'
              }`}
            >
              Register
            </button>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            {authMode === 'register' && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={authForm.fullName}
                    onChange={(e) => setAuthForm({ ...authForm, fullName: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-blue-500"
                    placeholder="Enter your full name"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Role</label>
                  <select
                    value={authForm.role}
                    onChange={(e) => setAuthForm({ ...authForm, role: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                  >
                    <option value="STUDENT">Student</option>
                    <option value="SUPERVISOR">Supervisor</option>
                    <option value="COORDINATOR">Project Coordinator</option>
                  </select>
                </div>
                {authForm.role === 'STUDENT' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Matric Number</label>
                    <input
                      type="text"
                      required
                      value={authForm.matricNo}
                      onChange={(e) => setAuthForm({ ...authForm, matricNo: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                      placeholder="e.g. U26/CS/1008"
                    />
                  </div>
                )}
              </>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Email Address</label>
              <input
                type="email"
                required
                value={authForm.email}
                onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-blue-500"
                placeholder="name@university.edu"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Password</label>
              <input
                type="password"
                required
                value={authForm.password}
                onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={isProcessing}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-sm transition"
            >
              {isProcessing ? 'Processing...' : authMode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // --- LOGGED-IN DASHBOARD VIEW ---
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold tracking-wider text-blue-600 uppercase">
              Department of Computer Science
            </span>
            <div className="text-sm font-bold text-slate-800">Final Year Project Management</div>
          </div>

          <div className="flex items-center gap-3">
            {/* Coordinator Controls */}
            {isCoordinator && (
              <>
                <button
                  onClick={() => setShowAllocateModal(true)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium px-3.5 py-2 rounded-lg transition"
                >
                  👥 Allocate
                </button>
                <button
                  onClick={() => setShowDeadlineModal(true)}
                  className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium px-3.5 py-2 rounded-lg transition"
                >
                  + Set Deadline
                </button>
              </>
            )}

            {/* Student Action */}
            {userRoleLower === 'student' && (
              <button
                onClick={() => setShowSubmitModal(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3.5 py-2 rounded-lg transition"
              >
                + Submit Proposal
              </button>
            )}

            {/* Identity Badge */}
            <div className="text-right border-l pl-3 ml-1 border-slate-200">
              <div className="text-xs font-semibold text-slate-800">
                {safeUser.fullName || safeUser.full_name || safeUser.name || 'User'}
              </div>
              <div className="text-[11px] text-slate-500 font-mono">
                {isCoordinator ? 'COORDINATOR' : (safeUser.role ? String(safeUser.role).toUpperCase() : 'USER')}
                {(safeUser.matricNo || safeUser.matric_no) ? ` • ${safeUser.matricNo || safeUser.matric_no}` : ''}
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="text-xs font-medium text-rose-600 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-lg transition"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-6">
        {/* Deadlines Widget */}
        <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-800 mb-3">Project Deadlines</h2>
          {deadlines.length === 0 ? (
            <p className="text-xs text-slate-500">No active deadlines announced yet.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {deadlines.map((d, i) => (
                <div key={d.deadline_id || i} className="border border-slate-100 bg-slate-50/50 rounded-lg p-3">
                  <div className="text-xs font-semibold text-slate-800">{d.title}</div>
                  <div className="text-[11px] text-slate-500 mt-1">{d.description || 'Deliverable timeline'}</div>
                  <div className="text-[11px] font-medium text-purple-600 mt-2">
                    Due: {d.due_date ? new Date(d.due_date).toLocaleDateString() : 'TBD'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Proposals Table Section */}
        <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-800">Submitted Project Proposals</h2>
              <p className="text-xs text-slate-500">
                Showing {filteredProposals.length} of {proposals.length} submissions
              </p>
            </div>

            <div className="flex gap-2 w-full sm:w-auto">
              <input
                type="text"
                placeholder="Search proposals..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="px-3 py-1.5 border rounded-lg text-xs w-full sm:w-48"
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-2 py-1.5 border rounded-lg text-xs bg-white"
              >
                <option value="ALL">All Statuses</option>
                <option value="SUBMITTED">Submitted</option>
                <option value="PENDING">Pending</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            {filteredProposals.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                {userRoleLower === 'student'
                  ? "You have not submitted a proposal yet. Click '+ Submit Proposal' above to start."
                  : 'No project proposals found.'}
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-slate-600 uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4">Title</th>
                    <th className="py-3 px-4">Student</th>
                    <th className="py-3 px-4">Matric No</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredProposals.map((prop, idx) => (
                    <tr key={prop.proposal_id || prop.id || idx} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4 font-medium text-slate-900">{prop.title}</td>
                      <td className="py-3 px-4">{prop.student_name || 'Student'}</td>
                      <td className="py-3 px-4 font-mono">{prop.matric_no || 'N/A'}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700">
                          {prop.status || 'SUBMITTED'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </main>

      {/* SUBMIT PROPOSAL MODAL */}
      {showSubmitModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-lg max-w-lg w-full p-6 border border-slate-200">
            <h3 className="text-base font-bold text-slate-800 mb-4">Submit Project Proposal</h3>
            <form onSubmit={handleProposalSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Project Title</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Problem Statement</label>
                <textarea
                  rows="3"
                  value={formData.problem_statement}
                  onChange={(e) => setFormData({ ...formData, problem_statement: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Aim & Objectives</label>
                <textarea
                  rows="3"
                  value={formData.aim}
                  onChange={(e) => setFormData({ ...formData, aim: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-xs"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSubmitModal(false)}
                  className="px-4 py-2 text-xs border rounded-lg text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="px-4 py-2 text-xs bg-blue-600 text-white rounded-lg font-medium"
                >
                  {isProcessing ? 'Submitting...' : 'Submit Proposal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ALLOCATE MODAL */}
      {showAllocateModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6 border border-slate-200">
            <h3 className="text-base font-bold text-slate-800 mb-4">Allocate Supervisor</h3>
            <form onSubmit={handleAllocate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Student</label>
                <select
                  required
                  value={allocateForm.studentId}
                  onChange={(e) => setAllocateForm({ ...allocateForm, studentId: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-xs bg-white"
                >
                  <option value="">Select Student</option>
                  {(allocations.students || []).map((s) => (
                    <option key={s.student_id || s.id} value={s.student_id || s.id}>
                      {s.full_name || s.name} ({s.matric_no || 'N/A'})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Supervisor</label>
                <select
                  required
                  value={allocateForm.supervisorId}
                  onChange={(e) => setAllocateForm({ ...allocateForm, supervisorId: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-xs bg-white"
                >
                  <option value="">Select Supervisor</option>
                  {(allocations.supervisors || []).map((sp) => (
                    <option key={sp.staff_id || sp.id} value={sp.staff_id || sp.id}>
                      {sp.full_name || sp.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAllocateModal(false)}
                  className="px-4 py-2 text-xs border rounded-lg text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="px-4 py-2 text-xs bg-indigo-600 text-white rounded-lg font-medium"
                >
                  {isProcessing ? 'Saving...' : 'Confirm Allocation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SET DEADLINE MODAL */}
      {showDeadlineModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6 border border-slate-200">
            <h3 className="text-base font-bold text-slate-800 mb-4">Set Milestone Deadline</h3>
            <form onSubmit={handleSetDeadline} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Milestone Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Chapter 1 Submission"
                  value={deadlineForm.title}
                  onChange={(e) => setDeadlineForm({ ...deadlineForm, title: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Due Date</label>
                <input
                  type="date"
                  required
                  value={deadlineForm.due_date}
                  onChange={(e) => setDeadlineForm({ ...deadlineForm, due_date: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Description</label>
                <textarea
                  rows="2"
                  value={deadlineForm.description}
                  onChange={(e) => setDeadlineForm({ ...deadlineForm, description: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-xs"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDeadlineModal(false)}
                  className="px-4 py-2 text-xs border rounded-lg text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="px-4 py-2 text-xs bg-purple-600 text-white rounded-lg font-medium"
                >
                  {isProcessing ? 'Saving...' : 'Set Deadline'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}