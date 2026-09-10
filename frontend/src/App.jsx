import React, { useState, useEffect, useMemo } from 'react';

const UNIVERSITY_DEPARTMENTS = [
  'Computer Science',
  'Civil Engineering',
  'Electrical & Electronics Engineering',
  'Mechanical Engineering',
  'Chemical Engineering',
  'Software Engineering',
  'Cyber Security',
  'Information Technology'
];

function App() {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('fyps_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [authMode, setAuthMode] = useState('LOGIN');
  const [authData, setAuthData] = useState({
    email: '',
    password: '',
    full_name: '',
    role: 'STUDENT',
    matric_no: '',
    department: 'Computer Science'
  });
  const [authError, setAuthError] = useState('');

  const [proposals, setProposals] = useState([]);
  const [deadlines, setDeadlines] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [deliverables, setDeliverables] = useState([]);
  const [allocations, setAllocations] = useState({ students: [], supervisors: [] });
  const [studentGrade, setStudentGrade] = useState(null);
  const [allGrades, setAllGrades] = useState([]);
  
  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const [showNotifs, setShowNotifs] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Modals
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showResubmitModal, setShowResubmitModal] = useState(false);
  const [showDeadlineModal, setShowDeadlineModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showAllocateModal, setShowAllocateModal] = useState(false);
  const [showGradingModal, setShowGradingModal] = useState(false);
  const [selectedProposal, setSelectedProposal] = useState(null);
  const [gradingTarget, setGradingTarget] = useState(null);
  const [versionHistory, setVersionHistory] = useState([]);
  
  const [reviewAction, setReviewAction] = useState({ status: 'APPROVED', feedback_notes: '' });
  const [isProcessing, setIsProcessing] = useState(false);

  const [deadlineForm, setDeadlineForm] = useState({ title: '', deadline_date: '' });
  const [uploadChapter, setUploadChapter] = useState('Chapter 1: Introduction');
  const [selectedFile, setSelectedFile] = useState(null);
  const [assignData, setAssignData] = useState({ student_id: '', staff_id: '' });

  // Grading Form State
  const [gradeForm, setGradeForm] = useState({
    documentation_score: '',
    implementation_score: '',
    presentation_score: '',
    remarks: ''
  });

  const [formData, setFormData] = useState({
    title: '',
    problem_statement: '',
    aim: '',
    objectives: ''
  });

  const [resubmitData, setResubmitData] = useState({
    proposal_id: null,
    title: '',
    problem_statement: '',
    aim: '',
    objectives: ''
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [propRes, deadRes, delivRes] = await Promise.all([
        fetch('const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';/proposals'),
        fetch('const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';/api/deadlines'),
        fetch('const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';/api/deliverables')
      ]);
      const propData = await propRes.json();
      const deadData = await deadRes.json();
      const delivData = await delivRes.json();
      
      setProposals(Array.isArray(propData) ? propData : []);
      setDeadlines(Array.isArray(deadData) ? deadData : []);
      setDeliverables(Array.isArray(delivData) ? delivData : []);

      if (user?.userId) {
        const notifRes = await fetch(`const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';/${user.userId}`);
        const nData = await notifRes.json();
        setNotifications(Array.isArray(nData) ? nData : []);
      }

      if (user?.role === 'STUDENT' && user?.studentId) {
        const gradeRes = await fetch(`const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';/api/grades/student/${user.studentId}`);
        const gData = await gradeRes.json();
        setStudentGrade(gData);
      }

      if (user?.role === 'SUPERVISOR' || user?.role === 'COORDINATOR') {
        const gradesRes = await fetch('const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';/api/grades');
        const gAll = await gradesRes.json();
        setAllGrades(Array.isArray(gAll) ? gAll : []);
      }

      if (user?.role === 'COORDINATOR') {
        const allocRes = await fetch('const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';/api/allocations');
        const aData = await allocRes.json();
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

  const handleAuthChange = (e) => {
    setAuthData({ ...authData, [e.target.name]: e.target.value });
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    setIsProcessing(true);

    const endpoint = authMode === 'LOGIN' ? '/api/auth/login' : '/api/auth/register';

    try {
      const res = await fetch(`const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authData)
      });

      const data = await res.json();

      if (!res.ok) {
        setAuthError(data.error || 'Authentication failed');
      } else {
        if (authMode === 'REGISTER') {
          alert('Account created! Please log in.');
          setAuthMode('LOGIN');
        } else {
          localStorage.setItem('fyps_user', JSON.stringify(data.user));
          localStorage.setItem('fyps_token', data.token);
          setUser(data.user);
        }
      }
    } catch (err) {
      setAuthError('Unable to connect to server');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('fyps_user');
    localStorage.removeItem('fyps_token');
    setUser(null);
  };

  const handleDeadlineSubmit = async (e) => {
    e.preventDefault();
    setIsProcessing(true);
    try {
      const res = await fetch('const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';/api/deadlines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(deadlineForm)
      });
      if (res.ok) {
        setShowDeadlineModal(false);
        setDeadlineForm({ title: '', deadline_date: '' });
        fetchData();
      }
    } catch (err) {
      alert('Failed to set deadline');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleProposalSubmit = async (e) => {
    e.preventDefault();
    setIsProcessing(true);
    try {
      const res = await fetch('const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';/api/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          student_id: user.studentId
        })
      });

      if (res.ok) {
        setFormData({ title: '', problem_statement: '', aim: '', objectives: '' });
        setShowSubmitModal(false);
        fetchData();
      }
    } catch (err) {
      alert('Submission error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      alert('Please select a file to upload');
      return;
    }

    const formPayload = new FormData();
    formPayload.append('student_id', user.studentId);
    formPayload.append('chapter_title', uploadChapter);
    formPayload.append('deliverableFile', selectedFile);

    setIsProcessing(true);
    try {
      const res = await fetch('const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';/api/deliverables/upload', {
        method: 'POST',
        body: formPayload
      });
      
      if (res.ok) {
        alert('File uploaded successfully!');
        setSelectedFile(null);
        setShowUploadModal(false);
        fetchData();
      } else {
        alert('File upload failed');
      }
    } catch (err) {
      alert('Error communicating with upload server');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAssignSubmit = async (e) => {
    e.preventDefault();
    setIsProcessing(true);
    try {
      const res = await fetch('const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';/api/allocations/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(assignData)
      });
      if (res.ok) {
        alert('Supervisor assigned successfully!');
        setShowAllocateModal(false);
        fetchData();
      }
    } catch (err) {
      alert('Failed to assign supervisor');
    } finally {
      setIsProcessing(false);
    }
  };

  const openGradingModal = (proposal) => {
    setGradingTarget(proposal);
    const existing = allGrades.find(g => g.student_id === proposal.student_id);
    if (existing) {
      setGradeForm({
        documentation_score: existing.documentation_score,
        implementation_score: existing.implementation_score,
        presentation_score: existing.presentation_score,
        remarks: existing.remarks || ''
      });
    } else {
      setGradeForm({
        documentation_score: '',
        implementation_score: '',
        presentation_score: '',
        remarks: ''
      });
    }
    setShowGradingModal(true);
  };

  const handleGradeSubmit = async (e) => {
    e.preventDefault();
    setIsProcessing(true);
    try {
      const res = await fetch('const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';/api/grades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: gradingTarget.student_id,
          documentation_score: gradeForm.documentation_score,
          implementation_score: gradeForm.implementation_score,
          presentation_score: gradeForm.presentation_score,
          remarks: gradeForm.remarks,
          staff_id: user.staffId || 1
        })
      });
      if (res.ok) {
        alert('Final grades recorded successfully!');
        setShowGradingModal(false);
        fetchData();
      } else {
        alert('Failed to record grade');
      }
    } catch (err) {
      alert('Grading server error');
    } finally {
      setIsProcessing(false);
    }
  };

  const exportReportCSV = () => {
    if (proposals.length === 0) {
      alert('No proposal records available to export.');
      return;
    }

    const headers = ['ID', 'Student Name', 'Matric Number', 'Department', 'Project Title', 'Version', 'Status', 'Total Score', 'Letter Grade'];
    const rows = proposals.map(p => {
      const g = allGrades.find(gr => gr.student_id === p.student_id);
      return [
        p.proposal_id,
        `"${p.student_name.replace(/"/g, '""')}"`,
        `"${p.matric_no}"`,
        `"${p.department || 'General'}"`,
        `"${p.title.replace(/"/g, '""')}"`,
        `v${p.latest_version || 1}`,
        p.status,
        g ? `${g.total_score}%` : 'N/A',
        g ? g.letter_grade : 'N/A'
      ];
    });

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `University_Project_Report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const markNotificationRead = async (id) => {
    try {
      await fetch(`const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';/api/notifications/${id}/read`, { method: 'POST' });
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const openResubmitModal = (item) => {
    setResubmitData({
      proposal_id: item.proposal_id,
      title: item.title,
      problem_statement: item.problem_statement,
      aim: item.aim,
      objectives: item.objectives
    });
    setShowResubmitModal(true);
  };

  const handleResubmitAction = async (e) => {
    e.preventDefault();
    setIsProcessing(true);
    try {
      const res = await fetch(`const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';/api/proposals/${resubmitData.proposal_id}/resubmit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resubmitData)
      });
      if (res.ok) {
        setShowResubmitModal(false);
        fetchData();
      }
    } catch (err) {
      alert('Resubmit error');
    } finally {
      setIsProcessing(false);
    }
  };

  const openProposalDetails = async (item) => {
    setSelectedProposal(item);
    try {
      const res = await fetch(`const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';/api/proposals/${item.proposal_id}/versions`);
      const vData = await res.json();
      setVersionHistory(Array.isArray(vData) ? vData : []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleReviewSubmit = async (e) => {
    e.preventDefault();
    setIsProcessing(true);
    try {
      const res = await fetch(`const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';/api/proposals/${selectedProposal.proposal_id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reviewAction)
      });
      if (res.ok) {
        setSelectedProposal(null);
        setReviewAction({ status: 'APPROVED', feedback_notes: '' });
        fetchData();
      }
    } catch (err) {
      alert('Review submission error');
    } finally {
      setIsProcessing(false);
    }
  };

  const getBadge = (status) => {
    switch (status) {
      case 'APPROVED':
        return { label: 'APPROVED', class: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
      case 'REJECTED':
        return { label: 'REJECTED', class: 'bg-rose-100 text-rose-800 border-rose-300' };
      case 'UNDER_REVIEW':
        return { label: 'CORRECTIONS REQUESTED', class: 'bg-amber-100 text-amber-800 border-amber-300' };
      default:
        return { label: status || 'SUBMITTED', class: 'bg-blue-100 text-blue-800 border-blue-300' };
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const displayedDeliverables = useMemo(() => {
    if (user?.role === 'STUDENT') {
      return deliverables.filter(d => d.student_id === user.studentId);
    }
    return deliverables;
  }, [deliverables, user]);

  const filteredProposals = useMemo(() => {
    let list = user?.role === 'STUDENT'
      ? proposals.filter((p) => p.student_id === user.studentId)
      : proposals;

    if (statusFilter !== 'ALL') {
      list = list.filter(p => p.status === statusFilter);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      list = list.filter(p =>
        p.title.toLowerCase().includes(query) ||
        p.student_name.toLowerCase().includes(query) ||
        p.matric_no.toLowerCase().includes(query) ||
        (p.department && p.department.toLowerCase().includes(query))
      );
    }

    return list;
  }, [proposals, user, statusFilter, searchQuery]);

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans">
        <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-200 max-w-md w-full space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-slate-900">Project Management System</h1>
            <p className="text-xs text-slate-500 mt-1">University Central Portal</p>
          </div>

          <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-semibold">
            <button
              onClick={() => { setAuthMode('LOGIN'); setAuthError(''); }}
              className={`w-1/2 py-2 rounded-md transition ${authMode === 'LOGIN' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setAuthMode('REGISTER'); setAuthError(''); }}
              className={`w-1/2 py-2 rounded-md transition ${authMode === 'REGISTER' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
            >
              Register New Account
            </button>
          </div>

          {authError && (
            <div className="bg-rose-50 text-rose-700 text-xs p-3 rounded-lg border border-rose-200">
              {authError}
            </div>
          )}

          <form onSubmit={handleAuthSubmit} className="space-y-4 text-sm">
            {authMode === 'REGISTER' && (
              <>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Full Name</label>
                  <input
                    type="text"
                    name="full_name"
                    required
                    value={authData.full_name}
                    onChange={handleAuthChange}
                    placeholder="e.g. Amina Bello"
                    className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-medium mb-1">Academic Department</label>
                  <select
                    name="department"
                    value={authData.department}
                    onChange={handleAuthChange}
                    className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-blue-500 bg-white"
                  >
                    {UNIVERSITY_DEPARTMENTS.map((dept) => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-medium mb-1">Role</label>
                  <select
                    name="role"
                    value={authData.role}
                    onChange={handleAuthChange}
                    className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-blue-500 bg-white"
                  >
                    <option value="STUDENT">Student</option>
                    <option value="SUPERVISOR">Supervisor / Lecturer</option>
                    <option value="COORDINATOR">Project Coordinator</option>
                  </select>
                </div>

                {authData.role === 'STUDENT' && (
                  <div>
                    <label className="block text-slate-700 font-medium mb-1">Matric Number</label>
                    <input
                      type="text"
                      name="matric_no"
                      required
                      value={authData.matric_no}
                      onChange={handleAuthChange}
                      placeholder="e.g. U21/CS/1045 or U22/CE/2001"
                      className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-blue-500"
                    />
                  </div>
                )}
              </>
            )}

            <div>
              <label className="block text-slate-700 font-medium mb-1">Email Address</label>
              <input
                type="email"
                name="email"
                required
                value={authData.email}
                onChange={handleAuthChange}
                placeholder="name@university.edu"
                className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-medium mb-1">Password</label>
              <input
                type="password"
                name="password"
                required
                value={authData.password}
                onChange={handleAuthChange}
                placeholder="••••••••"
                className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={isProcessing}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-sm transition disabled:opacity-50"
            >
              {isProcessing ? 'Processing...' : authMode === 'LOGIN' ? 'Sign In to Portal' : 'Create Account'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header */}
        <header className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex flex-wrap justify-between items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Final Year Project Management System
            </h1>
            <p className="text-xs text-blue-600 font-semibold tracking-wide uppercase">
              Department of {user.department || 'Computer Science'}
            </p>
          </div>

          <div className="flex items-center gap-4 relative">
            {/* Notification Bell */}
            <div className="relative">
              <button
                onClick={() => setShowNotifs(!showNotifs)}
                className="relative p-2 rounded-full hover:bg-slate-100 border border-slate-200 text-slate-600 cursor-pointer"
              >
                🔔
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full animate-pulse">
                    {unreadCount}
                  </span>
                )}
              </button>

              {showNotifs && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-2xl border border-slate-200 p-4 z-50 space-y-2">
                  <div className="flex justify-between items-center border-b pb-2">
                    <span className="text-xs font-bold uppercase text-slate-500">Notifications</span>
                    <span className="text-[10px] text-slate-400">{notifications.length} alerts</span>
                  </div>
                  <div className="max-h-60 overflow-y-auto space-y-2">
                    {notifications.length === 0 ? (
                      <p className="text-xs text-slate-400 py-2">No alerts yet.</p>
                    ) : (
                      notifications.map(n => (
                        <div
                          key={n.notification_id}
                          onClick={() => markNotificationRead(n.notification_id)}
                          className={`p-2.5 rounded-lg text-xs cursor-pointer border transition ${n.is_read ? 'bg-slate-50 border-slate-100 text-slate-500' : 'bg-blue-50 border-blue-200 text-blue-900 font-semibold'}`}
                        >
                          <p>{n.message}</p>
                          <span className="text-[9px] text-slate-400 block mt-1">{new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="text-right">
              <div className="text-sm font-bold text-slate-900">{user.fullName}</div>
              <div className="text-xs text-slate-500 font-mono">
                {user.role} {user.matricNo ? `• ${user.matricNo}` : ''}
              </div>
            </div>

            {(user.role === 'COORDINATOR' || user.role === 'SUPERVISOR') && (
              <button
                type="button"
                onClick={exportReportCSV}
                className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold px-3 py-2 rounded-lg transition shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                📊 Export CSV
              </button>
            )}

            {user.role === 'COORDINATOR' && (
              <>
                <button
                  onClick={() => setShowAllocateModal(true)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium px-3.5 py-2 rounded-lg transition cursor-pointer"
                >
                  👥 Allocate
                </button>
                <button
                  onClick={() => setShowDeadlineModal(true)}
                  className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium px-3.5 py-2 rounded-lg transition cursor-pointer"
                >
                  + Set Deadline
                </button>
              </>
            )}

            {user.role === 'STUDENT' && (
              <>
                <button
                  type="button"
                  onClick={() => setShowUploadModal(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition cursor-pointer"
                >
                  📁 Upload Chapter
                </button>
                <button
                  type="button"
                  onClick={() => setShowSubmitModal(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition cursor-pointer"
                >
                  + Submit Proposal
                </button>
              </>
            )}

            <button
              type="button"
              onClick={handleLogout}
              className="text-xs bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold px-3 py-2 rounded-lg border border-rose-200 transition cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </header>

        {/* Student Defense Grade Banner (If Graded) */}
        {user.role === 'STUDENT' && studentGrade && (
          <div className="bg-gradient-to-r from-emerald-900 to-slate-900 text-white p-6 rounded-2xl shadow-md border border-emerald-700/60 flex flex-wrap justify-between items-center gap-4">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 block mb-1">Official Defense Results</span>
              <h3 className="text-xl font-bold">Final Project Evaluation Scorecard</h3>
              <p className="text-xs text-slate-300 mt-1">
                Documentation: <strong className="text-white">{studentGrade.documentation_score}/30</strong> • 
                Implementation: <strong className="text-white">{studentGrade.implementation_score}/40</strong> • 
                Presentation: <strong className="text-white">{studentGrade.presentation_score}/30</strong>
              </p>
              {studentGrade.remarks && (
                <p className="text-xs text-slate-400 mt-2 italic font-mono">Remarks: "{studentGrade.remarks}"</p>
              )}
            </div>
            <div className="flex items-center gap-4 bg-slate-800/80 px-5 py-3 rounded-xl border border-slate-700">
              <div className="text-right">
                <div className="text-2xl font-black text-emerald-400">{studentGrade.total_score}%</div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wide">Aggregate Mark</div>
              </div>
              <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-xl font-bold text-emerald-300">
                {studentGrade.letter_grade}
              </div>
            </div>
          </div>
        )}

        {/* Milestone Deadlines Section */}
        {deadlines.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-3">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Project Schedule & Cutoffs</h3>
              </div>
              <span className="text-[11px] text-slate-400 font-mono">Departmental Timetable</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
              {deadlines.map((d) => {
                const deadlineTime = new Date(d.deadline_date);
                const isPast = deadlineTime < new Date();

                return (
                  <div
                    key={d.id}
                    className={`p-3.5 rounded-lg border transition ${
                      isPast
                        ? 'bg-slate-50 border-slate-200 text-slate-500'
                        : 'bg-white border-slate-200 hover:border-slate-300 text-slate-800 shadow-xs'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <h4 className="text-xs font-bold capitalize leading-snug text-slate-900">{d.title}</h4>
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border ${
                          isPast 
                            ? 'bg-slate-100 text-slate-500 border-slate-200' 
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}
                      >
                        {isPast ? 'Closed' : 'Active'}
                      </span>
                    </div>

                    <div className="text-xs font-mono mt-2.5 flex items-center gap-1.5 text-slate-500">
                      <span>Cutoff:</span>
                      <strong className="text-slate-800">
                        {deadlineTime.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </strong>
                      <span>at</span>
                      <strong className="text-slate-800">
                        {deadlineTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </strong>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Uploaded Chapter Deliverables Section */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-3">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                📁 {user.role === 'STUDENT' ? 'My Uploaded Project Chapters' : 'Submitted Chapter Deliverables'}
              </h3>
              <p className="text-xs text-slate-500">
                {user.role === 'STUDENT' 
                  ? 'Access and review your uploaded chapter files below.' 
                  : 'Download and inspect submitted student chapter reports.'}
              </p>
            </div>
            <span className="text-xs text-slate-400 font-mono">Total Files: {displayedDeliverables.length}</span>
          </div>

          {displayedDeliverables.length === 0 ? (
            <div className="p-6 text-center border border-dashed border-slate-200 rounded-lg text-slate-400 text-sm">
              {user.role === 'STUDENT'
                ? "You haven't uploaded any chapters yet. Click 📁 Upload Chapter above to submit your first chapter."
                : "No project chapters have been uploaded by students yet."}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
              {displayedDeliverables.map((del) => (
                <div key={del.deliverable_id} className="flex justify-between items-center p-4 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100/80 transition">
                  <div className="space-y-0.5">
                    <div className="text-sm font-bold text-slate-900">{del.chapter_title}</div>
                    <div className="text-xs text-slate-600 font-mono">{del.file_name}</div>
                    <div className="text-[11px] text-slate-500">
                      Uploaded by: <strong className="text-slate-800">{del.student_name}</strong> ({del.matric_no})
                    </div>
                  </div>
                  <a
                    href={`http://localhost:5000${del.file_url}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-3 py-2 rounded-lg shadow-sm transition flex items-center gap-1"
                  >
                    View File ↗
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Proposals Table with Search & Filter */}
        <main className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
          <div className="flex flex-wrap justify-between items-center gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                {user.role === 'STUDENT' ? 'My Proposal Submissions' : 'Proposals Awaiting Review'}
              </h2>
              <p className="text-xs text-slate-500">
                {user.role === 'STUDENT'
                  ? 'Track your project proposal approvals, version numbers, and resubmit corrections.'
                  : 'Review submitted topics, inspect objectives, issue approval decisions, and evaluate defense grades.'}
              </p>
            </div>
            <span className="text-xs text-slate-400 font-mono">Showing {filteredProposals.length} of {proposals.length}</span>
          </div>

          {/* Search & Filter Toolbar */}
          <div className="flex flex-wrap gap-3 items-center bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div className="flex-1 min-w-[200px]">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="🔍 Search by student, matric no, department, or topic..."
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-semibold">Filter:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-blue-500 font-medium"
              >
                <option value="ALL">All Statuses</option>
                <option value="SUBMITTED">Submitted</option>
                <option value="APPROVED">Approved</option>
                <option value="UNDER_REVIEW">Corrections Requested</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </div>
          </div>

          {loading ? (
            <p className="text-slate-500 text-sm py-4">Loading from database...</p>
          ) : filteredProposals.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">
              {user.role === 'STUDENT'
                ? "You have not submitted a proposal yet. Click '+ Submit Proposal' above to start."
                : "No matching proposals found for the selected query/filter."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 text-xs uppercase bg-slate-50">
                    <th className="py-3 px-4">ID</th>
                    <th className="py-3 px-4">Student</th>
                    <th className="py-3 px-4">Matric No</th>
                    <th className="py-3 px-4">Department</th>
                    <th className="py-3 px-4">Project Title</th>
                    <th className="py-3 px-4">Version</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProposals.map((item) => {
                    const badge = getBadge(item.status);
                    const gradeRecord = allGrades.find(g => g.student_id === item.student_id);

                    return (
                      <tr key={item.proposal_id} className="hover:bg-slate-50 transition">
                        <td className="py-3.5 px-4 font-mono text-xs text-slate-400">#{item.proposal_id}</td>
                        <td className="py-3.5 px-4 font-semibold text-slate-900">{item.student_name}</td>
                        <td className="py-3.5 px-4 font-mono text-xs text-slate-600">{item.matric_no}</td>
                        <td className="py-3.5 px-4 text-xs text-slate-500">{item.department || 'Computer Science'}</td>
                        <td className="py-3.5 px-4 max-w-xs font-medium text-slate-800">{item.title}</td>
                        <td className="py-3.5 px-4">
                          <span className="bg-slate-100 text-slate-700 text-xs font-mono font-bold px-2 py-0.5 rounded border border-slate-200">
                            v{item.latest_version || 1}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`px-2.5 py-1 text-xs font-semibold rounded-full border ${badge.class}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right space-x-2">
                          {(user.role === 'SUPERVISOR' || user.role === 'COORDINATOR') && (
                            <button
                              type="button"
                              onClick={() => openGradingModal(item)}
                              className={`text-xs font-semibold px-3 py-1.5 rounded-md transition shadow-xs cursor-pointer border ${
                                gradeRecord 
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100' 
                                  : 'bg-indigo-50 text-indigo-700 border-indigo-300 hover:bg-indigo-100'
                              }`}
                            >
                              {gradeRecord ? `Graded: ${gradeRecord.total_score}% (${gradeRecord.letter_grade})` : '📝 Grade Defense'}
                            </button>
                          )}
                          {user.role === 'STUDENT' && item.status === 'UNDER_REVIEW' && (
                            <button
                              type="button"
                              onClick={() => openResubmitModal(item)}
                              className="text-xs bg-amber-500 hover:bg-amber-600 text-white font-semibold px-3 py-1.5 rounded-md transition shadow-xs cursor-pointer"
                            >
                              Submit Corrections
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openProposalDetails(item)}
                            className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold px-3 py-1.5 rounded-md border border-slate-300 transition cursor-pointer"
                          >
                            {user.role === 'SUPERVISOR' || user.role === 'COORDINATOR' ? 'Review & Grade' : 'View History & Feedback'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </main>

        {/* Modal: Grade Project Defense (Supervisor & Coordinator) */}
        {showGradingModal && gradingTarget && (
          <div className="fixed inset-0 bg-black/50 flex justify-center items-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 space-y-4">
              <div className="flex justify-between items-center border-b pb-3">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Project Defense Evaluation</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Grading: <strong className="text-slate-800">{gradingTarget.student_name}</strong> ({gradingTarget.matric_no})
                  </p>
                </div>
                <button type="button" onClick={() => setShowGradingModal(false)} className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer">✕</button>
              </div>

              <form onSubmit={handleGradeSubmit} className="space-y-4 text-sm">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Report / Doc (30%)</label>
                    <input
                      type="number"
                      min="0"
                      max="30"
                      step="0.5"
                      required
                      placeholder="Max 30"
                      value={gradeForm.documentation_score}
                      onChange={(e) => setGradeForm({ ...gradeForm, documentation_score: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg p-2 text-xs outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Implementation (40%)</label>
                    <input
                      type="number"
                      min="0"
                      max="40"
                      step="0.5"
                      required
                      placeholder="Max 40"
                      value={gradeForm.implementation_score}
                      onChange={(e) => setGradeForm({ ...gradeForm, implementation_score: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg p-2 text-xs outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Presentation (30%)</label>
                    <input
                      type="number"
                      min="0"
                      max="30"
                      step="0.5"
                      required
                      placeholder="Max 30"
                      value={gradeForm.presentation_score}
                      onChange={(e) => setGradeForm({ ...gradeForm, presentation_score: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg p-2 text-xs outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg flex justify-between items-center text-xs">
                  <span className="font-semibold text-slate-600">Calculated Aggregate:</span>
                  <strong className="text-indigo-600 text-sm font-mono">
                    {((parseFloat(gradeForm.documentation_score) || 0) +
                      (parseFloat(gradeForm.implementation_score) || 0) +
                      (parseFloat(gradeForm.presentation_score) || 0)).toFixed(1)} / 100
                  </strong>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Examiner Remarks & Defense Feedback</label>
                  <textarea
                    rows="3"
                    value={gradeForm.remarks}
                    onChange={(e) => setGradeForm({ ...gradeForm, remarks: e.target.value })}
                    placeholder="e.g. Well defended methodology. Minor formatting fixes needed in Chapter 4."
                    className="w-full border border-slate-300 rounded-lg p-2.5 text-xs outline-none focus:border-indigo-500"
                  ></textarea>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t">
                  <button
                    type="button"
                    onClick={() => setShowGradingModal(false)}
                    className="px-4 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 cursor-pointer text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isProcessing}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 cursor-pointer font-semibold text-xs"
                  >
                    {isProcessing ? 'Submitting...' : 'Save & Publish Grade'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Allocate Supervisors (Coordinator) */}
        {showAllocateModal && (
          <div className="fixed inset-0 bg-black/50 flex justify-center items-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 space-y-4">
              <div className="flex justify-between items-center border-b pb-3">
                <h3 className="text-lg font-bold text-slate-900">Assign Project Supervisors</h3>
                <button type="button" onClick={() => setShowAllocateModal(false)} className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer">✕</button>
              </div>

              <form onSubmit={handleAssignSubmit} className="space-y-4 text-sm">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Select Student</label>
                  <select
                    required
                    value={assignData.student_id}
                    onChange={(e) => setAssignData({ ...assignData, student_id: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-indigo-500 bg-white"
                  >
                    <option value="">-- Choose Student --</option>
                    {allocations.students.map((st) => (
                      <option key={st.student_id} value={st.student_id}>
                        {st.student_name} ({st.matric_no} - {st.department}) {st.supervisor_name ? `• Current: ${st.supervisor_name}` : '• (Unassigned)'}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-medium mb-1">Assign to Supervisor</label>
                  <select
                    required
                    value={assignData.staff_id}
                    onChange={(e) => setAssignData({ ...assignData, staff_id: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-indigo-500 bg-white"
                  >
                    <option value="">-- Choose Lecturer / Supervisor --</option>
                    {allocations.supervisors.map((sp) => (
                      <option key={sp.staff_id} value={sp.staff_id}>
                        {sp.supervisor_name} ({sp.staff_no} - {sp.department})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t">
                  <button
                    type="button"
                    onClick={() => setShowAllocateModal(false)}
                    className="px-4 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isProcessing}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 cursor-pointer font-semibold"
                  >
                    {isProcessing ? 'Saving...' : 'Confirm Allocation'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: View Details, Version History & Feedback */}
        {selectedProposal && (
          <div className="fixed inset-0 bg-black/50 flex justify-center items-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-start border-b border-slate-200 pb-3">
                <div>
                  <span className="text-xs font-bold uppercase text-blue-600 tracking-wider">Proposal Overview</span>
                  <h3 className="text-xl font-bold text-slate-900">{selectedProposal.title}</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Submitted by <strong className="text-slate-800">{selectedProposal.student_name}</strong> ({selectedProposal.matric_no} • {selectedProposal.department})
                  </p>
                </div>
                <button type="button" onClick={() => setSelectedProposal(null)} className="text-slate-400 hover:text-slate-600 text-lg font-bold cursor-pointer">✕</button>
              </div>

              {/* Version History List */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Revisions & Feedback Audit</h4>
                {versionHistory.map((v) => (
                  <div key={v.version_id || v.version_number} className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-3">
                    <div className="flex justify-between items-center border-b pb-2">
                      <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                        Version {v.version_number}
                      </span>
                      <span className="text-xs text-slate-400 font-mono">
                        {v.submitted_at ? new Date(v.submitted_at).toLocaleDateString() : 'Current Draft'}
                      </span>
                    </div>
                    <div>
                      <h5 className="text-xs font-bold text-slate-600 uppercase">Problem Statement</h5>
                      <p className="text-xs text-slate-700 mt-0.5 whitespace-pre-line">{v.problem_statement}</p>
                    </div>
                    <div>
                      <h5 className="text-xs font-bold text-slate-600 uppercase">Aim & Objectives</h5>
                      <p className="text-xs text-slate-700 font-semibold">{v.aim}</p>
                      <p className="text-xs text-slate-600 mt-0.5 whitespace-pre-line">{v.objectives}</p>
                    </div>
                    {v.feedback_notes && (
                      <div className="bg-amber-50 border border-amber-200 p-3 rounded-md">
                        <h6 className="text-[11px] font-bold text-amber-800 uppercase">Supervisor Feedback</h6>
                        <p className="text-xs text-amber-900 mt-0.5 whitespace-pre-line">{v.feedback_notes}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {user.role === 'SUPERVISOR' || user.role === 'COORDINATOR' ? (
                <form onSubmit={handleReviewSubmit} className="space-y-3 pt-2 border-t">
                  <h4 className="text-sm font-bold text-slate-900">Decision & Action</h4>
                  
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Decision</label>
                    <select
                      value={reviewAction.status}
                      onChange={(e) => setReviewAction({ ...reviewAction, status: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg p-2 text-sm outline-none focus:border-indigo-600 bg-white"
                    >
                      <option value="APPROVED">APPROVE PROPOSAL</option>
                      <option value="UNDER_REVIEW">REQUEST CORRECTIONS</option>
                      <option value="REJECTED">REJECT PROPOSAL</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Feedback / Correction Remarks</label>
                    <textarea
                      rows="2"
                      value={reviewAction.feedback_notes}
                      onChange={(e) => setReviewAction({ ...reviewAction, feedback_notes: e.target.value })}
                      placeholder="e.g. Please refine objective #2 to include clear metrics..."
                      className="w-full border border-slate-300 rounded-lg p-2 text-sm outline-none focus:border-indigo-600"
                    ></textarea>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setSelectedProposal(null)}
                      className="px-4 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 text-sm cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isProcessing}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg text-sm transition disabled:opacity-50 cursor-pointer"
                    >
                      {isProcessing ? 'Submitting...' : 'Save Decision & Send Feedback'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex justify-end pt-2 border-t">
                  <button type="button" onClick={() => setSelectedProposal(null)} className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm cursor-pointer">Close</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Modal: Deliverable Chapter Upload */}
        {showUploadModal && (
          <div className="fixed inset-0 bg-black/50 flex justify-center items-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4">
              <div className="flex justify-between items-center border-b pb-3">
                <h3 className="text-lg font-bold text-slate-900">Upload Project Chapter</h3>
                <button type="button" onClick={() => setShowUploadModal(false)} className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer">✕</button>
              </div>

              <form onSubmit={handleUploadSubmit} className="space-y-4 text-sm">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Select Chapter</label>
                  <select
                    value={uploadChapter}
                    onChange={(e) => setUploadChapter(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-emerald-500 bg-white"
                  >
                    <option value="Chapter 1: Introduction">Chapter 1: Introduction</option>
                    <option value="Chapter 2: Literature Review">Chapter 2: Literature Review</option>
                    <option value="Chapter 3: System Design & Methodology">Chapter 3: System Design & Methodology</option>
                    <option value="Chapter 4: Implementation & Results">Chapter 4: Implementation & Results</option>
                    <option value="Chapter 5: Conclusion & Recommendations">Chapter 5: Conclusion & Recommendations</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-medium mb-1">Deliverable Document (PDF / DOCX)</label>
                  <input
                    type="file"
                    required
                    accept=".pdf,.doc,.docx"
                    onChange={(e) => setSelectedFile(e.target.files[0])}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs outline-none file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
                  />
                  {selectedFile && (
                    <span className="text-[11px] text-emerald-600 mt-1 block">Selected: {selectedFile.name}</span>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t">
                  <button
                    type="button"
                    onClick={() => setShowUploadModal(false)}
                    className="px-4 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isProcessing}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 cursor-pointer font-semibold"
                  >
                    {isProcessing ? 'Uploading...' : 'Upload Chapter'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Set Deadline */}
        {showDeadlineModal && (
          <div className="fixed inset-0 bg-black/50 flex justify-center items-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4">
              <div className="flex justify-between items-center border-b pb-3">
                <h3 className="text-lg font-bold text-slate-900">Set Project Deadline</h3>
                <button type="button" onClick={() => setShowDeadlineModal(false)} className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer">✕</button>
              </div>

              <form onSubmit={handleDeadlineSubmit} className="space-y-4 text-sm">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Phase Title</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Chapter 1 Submission Deadline"
                    value={deadlineForm.title}
                    onChange={(e) => setDeadlineForm({ ...deadlineForm, title: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-medium mb-1">Cutoff Date & Time</label>
                  <input
                    type="datetime-local"
                    required
                    value={deadlineForm.deadline_date}
                    onChange={(e) => setDeadlineForm({ ...deadlineForm, deadline_date: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-purple-500"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t">
                  <button
                    type="button"
                    onClick={() => setShowDeadlineModal(false)}
                    className="px-4 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isProcessing}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 cursor-pointer"
                  >
                    Save Deadline
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Resubmit Proposal */}
        {showResubmitModal && (
          <div className="fixed inset-0 bg-black/50 flex justify-center items-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-xl w-full p-6 space-y-4">
              <div className="flex justify-between items-center border-b pb-3">
                <h3 className="text-lg font-bold text-slate-900">Submit Proposal Corrections</h3>
                <button type="button" onClick={() => setShowResubmitModal(false)} className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer">✕</button>
              </div>

              <form onSubmit={handleResubmitAction} className="space-y-4 text-sm">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Updated Project Title</label>
                  <input
                    type="text"
                    required
                    value={resubmitData.title}
                    onChange={(e) => setResubmitData({ ...resubmitData, title: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-medium mb-1">Updated Problem Statement</label>
                  <textarea
                    required
                    rows="3"
                    value={resubmitData.problem_statement}
                    onChange={(e) => setResubmitData({ ...resubmitData, problem_statement: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-amber-500"
                  ></textarea>
                </div>

                <div>
                  <label className="block text-slate-700 font-medium mb-1">Updated Aim</label>
                  <input
                    type="text"
                    required
                    value={resubmitData.aim}
                    onChange={(e) => setResubmitData({ ...resubmitData, aim: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-medium mb-1">Updated Objectives</label>
                  <textarea
                    required
                    rows="3"
                    value={resubmitData.objectives}
                    onChange={(e) => setResubmitData({ ...resubmitData, objectives: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-amber-500"
                  ></textarea>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t">
                  <button
                    type="button"
                    onClick={() => setShowResubmitModal(false)}
                    className="px-4 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isProcessing}
                    className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 cursor-pointer"
                  >
                    {isProcessing ? 'Submitting...' : 'Upload Revision'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Initial Proposal Submit */}
        {showSubmitModal && (
          <div className="fixed inset-0 bg-black/50 flex justify-center items-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-xl w-full p-6 space-y-4">
              <div className="flex justify-between items-center border-b pb-3">
                <h3 className="text-lg font-bold text-slate-900">Submit Project Proposal</h3>
                <button type="button" onClick={() => setShowSubmitModal(false)} className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer">✕</button>
              </div>

              <form onSubmit={handleProposalSubmit} className="space-y-4 text-sm">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Project Title</label>
                  <input
                    type="text"
                    name="title"
                    required
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="e.g. AI-Powered Smart Campus Navigation"
                    className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-medium mb-1">Problem Statement</label>
                  <textarea
                    name="problem_statement"
                    required
                    rows="3"
                    value={formData.problem_statement}
                    onChange={(e) => setFormData({ ...formData, problem_statement: e.target.value })}
                    placeholder="Describe the problem being solved..."
                    className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-blue-500"
                  ></textarea>
                </div>

                <div>
                  <label className="block text-slate-700 font-medium mb-1">Aim</label>
                  <input
                    type="text"
                    name="aim"
                    required
                    value={formData.aim}
                    onChange={(e) => setFormData({ ...formData, aim: e.target.value })}
                    placeholder="Aim of the project..."
                    className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-medium mb-1">Objectives</label>
                  <textarea
                    name="objectives"
                    required
                    rows="3"
                    value={formData.objectives}
                    onChange={(e) => setFormData({ ...formData, objectives: e.target.value })}
                    placeholder="1. Design database. 2. Implement API."
                    className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-blue-500"
                  ></textarea>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t">
                  <button
                    type="button"
                    onClick={() => setShowSubmitModal(false)}
                    className="px-4 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isProcessing}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                  >
                    {isProcessing ? 'Submitting...' : 'Submit Proposal'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
export default App;                                                                