import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard, BookOpen, Users, LogOut, Sun, Moon,
  TrendingUp, Upload, Search, AlertTriangle, CheckCircle2,
  RefreshCw, FileSpreadsheet, Download, GraduationCap, Award, Info,
  Eye, Building2, ShieldAlert
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, LineChart, Line
} from 'recharts';

// API Config
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:8000/api/v1'
  : '/api/v1';

// Official Administration Names Mapping (Task 1)
const getOfficialName = (username: string, defaultName: string) => {
  if (!username) return defaultName;
  const nameMap: Record<string, string> = {
    'principal': 'Dr. Manjunatha P.',
    'viceprincipal': 'Dr. Leena Ragha / Dr. Pradeep Malji Sir',
    'hod_ci': 'Dr. Sumangala Biradar',
    'hod_cs': 'Dr. Sumangala Biradar',
    'faculty1': 'Gurudevi',
    'faculty2': 'Gurudevi',
    'student': 'ADITYA R HIREMATH (Student)'
  };
  return nameMap[username.toLowerCase()] || defaultName;
};


// Theme helper
const getInitialTheme = () => {
  if (typeof window !== 'undefined' && window.localStorage) {
    const storedPrefs = window.localStorage.getItem('color-theme');
    if (typeof storedPrefs === 'string') {
      return storedPrefs;
    }
    const userMedia = window.matchMedia('(prefers-color-scheme: dark)');
    if (userMedia.matches) {
      return 'dark';
    }
  }
  return 'dark'; // default premium dark
};

export default function App() {
  const [theme, setTheme] = useState(getInitialTheme);
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string | null>(null);
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Authentication Fields
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Dashboard Data State
  const [instData, setInstData] = useState<any>(null);
  const [deptData, setDeptData] = useState<any>(null);
  const [facultyData, setFacultyData] = useState<any>(null);
  const [studentData, setStudentData] = useState<any>(null);

  // Drilldown states
  const [selectedDeptCode, setSelectedDeptCode] = useState<string>('CI');
  const [selectedStudentUsn, setSelectedStudentUsn] = useState<string | null>(null);
  const [studentSearchQuery, setStudentSearchQuery] = useState<string>('');

  // Batch upload states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<any>(null); // { total_usns: 0, current_index: 0, list: [] }
  const [processingStatus, setProcessingStatus] = useState<'idle' | 'uploading' | 'scraping' | 'completed'>('idle');
  const [captchaModal, setCaptchaModal] = useState<any>(null); // { session_id: '', usn: '', captcha_image: '', input: '' }

  // Seed user shortcut helper
  const handleAutofill = (role: string) => {
    const credentials: Record<string, string[]> = {
      'Principal': ['principal', 'principal123'],
      'Vice Principal': ['viceprincipal', 'vp123'],
      'HOD': ['hod_ci', 'hod123'],
      'Faculty': ['faculty1', 'faculty123'],
      'Student': ['student', 'student123']
    };
    const creds = credentials[role];
    if (creds) {
      setUsername(creds[0]);
      setPassword(creds[1]);
    }
  };

  // Toggle Dark Mode
  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('color-theme', theme);
  }, [theme]);

  // Load user from local storage on mount
  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    if (savedToken && savedUser) {
      setToken(savedToken);
      const parsedUser = JSON.parse(savedUser);
      setUser(parsedUser);
      if (parsedUser.role === 'Student') {
        setSelectedStudentUsn(parsedUser.username);
      }
    }
  }, []);

  // Fetch Dashboard data whenever user/tab/selections change
  useEffect(() => {
    if (!token || !user) return;
    fetchDashboardData();
  }, [token, user, selectedDeptCode, selectedStudentUsn]);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = { 'Authorization': `Bearer ${token}` };

      if (user.role === 'Principal' || user.role === 'Vice Principal') {
        const res = await fetch(`${API_BASE_URL}/analytics/institution`, { headers });
        if (!res.ok) throw new Error("Failed to load institution analytics");
        const data = await res.json();
        setInstData(data);

        // Load active department if selected
        const deptRes = await fetch(`${API_BASE_URL}/analytics/department/${selectedDeptCode}`, { headers });
        if (deptRes.ok) {
          const dData = await deptRes.json();
          setDeptData(dData);
        }
      } else if (user.role === 'HOD') {
        const deptRes = await fetch(`${API_BASE_URL}/analytics/department/${user.department_code}`, { headers });
        if (!deptRes.ok) throw new Error("Failed to load department analytics");
        const dData = await deptRes.json();
        setDeptData(dData);
      } else if (user.role === 'Faculty') {
        const facRes = await fetch(`${API_BASE_URL}/analytics/faculty`, { headers });
        if (!facRes.ok) throw new Error("Failed to load faculty analytics");
        const fData = await facRes.json();
        setFacultyData(fData);
      }

      // If a specific student is viewed
      if (selectedStudentUsn) {
        const studRes = await fetch(`${API_BASE_URL}/analytics/student/${selectedStudentUsn}`, { headers });
        if (studRes.ok) {
          const sData = await studRes.json();
          setStudentData(sData);
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Login handler
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim().toLowerCase(), password })
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Authentication failed");
      }
      const data = await res.json();
      setToken(data.access_token);
      setUser(data);
      localStorage.setItem('token', data.access_token);
      localStorage.setItem('user', JSON.stringify(data));

      if (data.role === 'Student') {
        setSelectedStudentUsn(data.username);
        setCurrentTab('studentView');
      } else {
        setSelectedStudentUsn(null);
        setCurrentTab('dashboard');
      }
      setSuccess("Logged in successfully!");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Logout handler
  const handleLogout = () => {
    setToken(null);
    setUser(null);
    setInstData(null);
    setDeptData(null);
    setFacultyData(null);
    setStudentData(null);
    setSelectedStudentUsn(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  // File Upload and Scraper batch handler
  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    setProcessingStatus('uploading');
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const res = await fetch(`${API_BASE_URL}/process/upload-csv`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "File upload failed");
      }

      const data = await res.json();
      const initialList = data.usns.map((usn: string) => ({
        usn,
        status: 'pending',
        name: '',
        source: '',
        error: ''
      }));

      setUploadProgress({
        total_usns: data.total_usns,
        current_index: 0,
        list: initialList
      });
      setProcessingStatus('scraping');

      // Trigger sequential processing of USNs
      processBatchUSNs(initialList, 0);

    } catch (err: any) {
      setError(err.message);
      setProcessingStatus('idle');
    } finally {
      setLoading(false);
    }
  };

  // Process batch of USNs sequentially
  const processBatchUSNs = async (currentList: any[], index: number) => {
    if (index >= currentList.length) {
      setProcessingStatus('completed');
      setSuccess("Scraping batch completed!");
      fetchDashboardData();
      // Automatically download the processed results CSV
      handleCsvExport(user?.department_code || 'CI');
      return;
    }

    // Update index
    setUploadProgress((prev: any) => ({ ...prev, current_index: index }));

    const item = currentList[index];
    // Set status to in progress
    updateListItemStatus(index, 'processing');

    try {
      const res = await fetch(`${API_BASE_URL}/process/process-usn`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ usn: item.usn })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to process USN");
      }

      const result = await res.json();

      if (result.status === 'SUCCESS') {
        updateListItemStatus(index, 'success', result.student_name, result.source);
        // Move to next USN
        setTimeout(() => processBatchUSNs(currentList, index + 1), 500);
      } else if (result.status === 'CAPTCHA') {
        // Halt batch processing, display CAPTCHA solver modal
        setCaptchaModal({
          session_id: result.session_id,
          usn: result.usn,
          captcha_image: result.captcha_image,
          input: '',
          listIndex: index,
          currentList: currentList
        });
      }

    } catch (err: any) {
      updateListItemStatus(index, 'error', '', '', err.message);
      // Continue to next anyway
      setTimeout(() => processBatchUSNs(currentList, index + 1), 500);
    }
  };

  const updateListItemStatus = (idx: number, status: string, name: string = '', source: string = '', errorMsg: string = '') => {
    setUploadProgress((prev: any) => {
      if (!prev) return null;
      const newList = [...prev.list];
      newList[idx] = {
        ...newList[idx],
        status,
        name: name || newList[idx].name,
        source: source || newList[idx].source,
        error: errorMsg
      };
      return { ...prev, list: newList };
    });
  };

  // Submit CAPTCHA solving response
  const handleCaptchaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!captchaModal || !captchaModal.input) return;

    const { session_id, listIndex, input, currentList } = captchaModal;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/process/solve-captcha`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ session_id, captcha_code: input })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "CAPTCHA verification failed");
      }

      const result = await res.json();
      updateListItemStatus(listIndex, 'success', result.student_name, result.source);

      // Close modal
      setCaptchaModal(null);

      // Resume batch processing
      setTimeout(() => processBatchUSNs(currentList, listIndex + 1), 500);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Skip CAPTCHA / Skip current USN
  const handleCaptchaSkip = () => {
    if (!captchaModal) return;
    const { listIndex, currentList } = captchaModal;
    updateListItemStatus(listIndex, 'error', '', '', 'Skipped by user');
    setCaptchaModal(null);
    setTimeout(() => processBatchUSNs(currentList, listIndex + 1), 500);
  };

  // CSV Export utility
  const handleCsvExport = async (code: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/reports/export-csv/${code}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to download CSV");
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${code}_academic_report.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Helper to generate premium printable grade card HTML (Tasks 3, 4, 5)
  const generateGradeCardHtml = (student: any) => {
    let totalCredits = 0;
    let earnedCredits = 0;
    let weightedGp = 0;
    
    // Sort marks by semester first, then subject code
    const sortedMarks = [...(student.marks || [])].sort((a: any, b: any) => {
      if (a.semester !== b.semester) return a.semester - b.semester;
      return a.subject_code.localeCompare(b.subject_code);
    });

    const rowsHtml = sortedMarks.map((m: any) => {
      let total = m.total_marks;
      if (total > 100) {
        total = total / 2;
      }
      
      let grade = "F";
      let gp = 0;
      if (total >= 90) { grade = "O (Outstanding)"; gp = 10; }
      else if (total >= 80) { grade = "S (Excellent)"; gp = 9; }
      else if (total >= 70) { grade = "A (Very Good)"; gp = 8; }
      else if (total >= 60) { grade = "B (Good)"; gp = 7; }
      else if (total >= 50) { grade = "C (Above Average)"; gp = 6; }
      else if (total >= 40) { grade = "D (Pass)"; gp = 5; }
      else { grade = "F (Fail)"; gp = 0; }
      
      const credits = m.credits || 3;
      totalCredits += credits;
      
      const isPass = m.result === 'P' || m.result === 'Pass' || m.result === 'PASS';
      if (isPass) {
        earnedCredits += credits;
      }
      weightedGp += gp * credits;
      
      const resultClass = isPass ? "status-pass" : "status-fail";
      
      return `
        <tr>
          <td class="font-mono font-semibold" style="border: 1px solid #e2e8f0; padding: 8px;">${m.subject_code}</td>
          <td style="border: 1px solid #e2e8f0; padding: 8px;">${m.subject_name || 'Unknown Subject'}</td>
          <td class="text-center font-mono" style="border: 1px solid #e2e8f0; padding: 8px;">${m.internal_marks}</td>
          <td class="text-center font-mono" style="border: 1px solid #e2e8f0; padding: 8px;">${m.external_marks}</td>
          <td class="text-center font-mono font-semibold" style="border: 1px solid #e2e8f0; padding: 8px;">${m.total_marks}</td>
          <td class="text-center ${resultClass}" style="border: 1px solid #e2e8f0; padding: 8px;">${m.result}</td>
          <td class="text-center font-semibold" style="border: 1px solid #e2e8f0; padding: 8px;">${grade}</td>
        </tr>
      `;
    }).join('');
    
    const sgpa = totalCredits > 0 ? (weightedGp / totalCredits).toFixed(2) : "0.00";
    
    // CGPA calculation (overall CGPA based on semesters)
    let cgpa = sgpa;
    if (student.gpa_trends && student.gpa_trends.length > 0) {
      const sum = student.gpa_trends.reduce((acc: number, t: any) => acc + (t.gpa || t.sgpa || 0), 0);
      cgpa = (sum / student.gpa_trends.length).toFixed(2);
    }

    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    return `
      <!DOCTYPE html>
      <html>
      <head>
          <title>Academic Transcript - ${student.usn}</title>
          <style>
              @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
              @page {
                  size: A4;
                  margin: 15mm;
              }
              body {
                  font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                  color: #1e293b;
                  margin: 0;
                  padding: 0;
                  line-height: 1.4;
                  background-color: #ffffff;
                  -webkit-print-color-adjust: exact;
                  print-color-adjust: exact;
              }
              .no-print-bar {
                  background-color: #0f172a;
                  color: #ffffff;
                  padding: 12px 24px;
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
                  margin-bottom: 25px;
                  border-radius: 8px;
                  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
                  font-size: 14px;
              }
              .print-btn {
                  background-color: #2563eb;
                  color: #ffffff;
                  border: none;
                  padding: 8px 16px;
                  border-radius: 6px;
                  font-size: 12px;
                  font-weight: 700;
                  cursor: pointer;
                  transition: background-color 0.2s;
              }
              .print-btn:hover {
                  background-color: #1d4ed8;
              }
              .container {
                  max-width: 100%;
                  margin: 0 auto;
                  padding: 10px;
              }
              .header {
                  display: flex;
                  align-items: center;
                  justify-content: space-between;
                  border-bottom: 3px double #94a3b8;
                  padding-bottom: 12px;
                  margin-bottom: 20px;
              }
              .logo-placeholder {
                  width: 55px;
                  height: 55px;
                  background-color: #f8fafc;
                  border-radius: 8px;
                  margin-right: 15px;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  border: 1px solid #e2e8f0;
              }
              .college-info {
                  flex-grow: 1;
              }
              .university-name {
                  font-size: 11px;
                  font-weight: 600;
                  color: #64748b;
                  text-transform: uppercase;
                  letter-spacing: 0.8px;
                  margin-bottom: 3px;
              }
              .college-name {
                  font-size: 17px;
                  font-weight: 800;
                  color: #0f172a;
                  letter-spacing: -0.5px;
                  text-transform: uppercase;
                  line-height: 1.2;
              }
              .college-address {
                  font-size: 9px;
                  color: #64748b;
                  margin-top: 2px;
              }
              .meta-info {
                  text-align: right;
                  font-size: 10px;
                  color: #64748b;
              }
              .meta-title {
                  font-weight: 800;
                  color: #1e3a8a;
                  font-size: 11px;
                  letter-spacing: 0.5px;
              }
              .grade-card-title {
                  font-size: 15px;
                  font-weight: 800;
                  text-align: center;
                  margin: 15px 0;
                  color: #1e3a8a;
                  letter-spacing: 3px;
                  text-transform: uppercase;
                  border-bottom: 1px dashed #cbd5e1;
                  padding-bottom: 8px;
              }
              .student-details {
                  display: grid;
                  grid-template-columns: 1.2fr 0.8fr;
                  gap: 15px;
                  background-color: #f8fafc;
                  border: 1px solid #e2e8f0;
                  border-radius: 8px;
                  padding: 12px 15px;
                  margin-bottom: 20px;
                  font-size: 11px;
              }
              .detail-item {
                  display: flex;
                  justify-content: space-between;
                  padding: 2px 0;
              }
              .detail-label {
                  color: #64748b;
                  font-weight: 500;
              }
              .detail-value {
                  color: #0f172a;
                  font-weight: 700;
                  text-align: right;
              }
              table {
                  width: 100%;
                  border-collapse: collapse;
                  margin-bottom: 20px;
                  font-size: 10.5px;
              }
              th {
                  background-color: #0f172a;
                  color: #ffffff;
                  font-weight: 600;
                  text-transform: uppercase;
                  font-size: 8.5px;
                  letter-spacing: 0.5px;
                  padding: 8px 6px;
                  border: 1px solid #0f172a;
              }
              td {
                  padding: 8px 6px;
                  border: 1px solid #e2e8f0;
                  color: #334155;
              }
              tr:nth-child(even) td {
                  background-color: #f8fafc;
              }
              .text-center {
                  text-align: center;
              }
              .status-pass {
                  color: #10b981;
                  font-weight: 700;
              }
              .status-fail {
                  color: #ef4444;
                  font-weight: 700;
              }
              .summary-section {
                  display: flex;
                  justify-content: flex-end;
                  margin-bottom: 30px;
              }
              .summary-card {
                  border: 1px solid #e2e8f0;
                  border-radius: 8px;
                  background-color: #f8fafc;
                  padding: 12px;
                  width: 250px;
                  font-size: 11px;
              }
              .summary-row {
                  display: flex;
                  justify-content: space-between;
                  padding: 4px 0;
                  border-bottom: 1px solid #f1f5f9;
              }
              .summary-row:last-child {
                  border-bottom: none;
                  padding-top: 6px;
                  margin-top: 4px;
                  font-size: 13px;
                  font-weight: 800;
                  color: #1e3a8a;
                  border-top: 1px solid #cbd5e1;
              }
              .signatures {
                  display: flex;
                  justify-content: space-between;
                  margin-top: 60px;
                  font-size: 10px;
                  color: #475569;
              }
              .signature-box {
                  text-align: center;
                  width: 200px;
              }
              .signature-line {
                  border-top: 1px dashed #94a3b8;
                  margin-bottom: 6px;
              }
              .signature-name {
                  font-weight: 700;
                  color: #0f172a;
              }
              .signature-title {
                  font-size: 9px;
                  color: #64748b;
                  margin-top: 1px;
              }
              .footer {
                  text-align: center;
                  font-size: 8.5px;
                  color: #94a3b8;
                  margin-top: 50px;
                  border-top: 1px solid #f1f5f9;
                  padding-top: 10px;
              }
              @media print {
                  .no-print-bar {
                      display: none;
                  }
                  body {
                      margin: 0;
                  }
                  @page {
                      margin: 15mm;
                  }
              }
          </style>
      </head>
      <body>
          <div class="no-print-bar">
              <div style="font-weight: 700;">EduInsight Grade Card Print Preview</div>
              <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
          </div>
          
          <div class="container">
              <div class="header">
                  <div style="display: flex; align-items: center;">
                      <div class="logo-placeholder">
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#1e3a8a" stroke-width="2">
                              <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
                              <path d="M6 12v5c0 2 2 3 6 3s6-1 6-3v-5"/>
                          </svg>
                      </div>
                      <div class="college-info">
                          <div class="university-name">Visvesvaraya Technological University</div>
                          <div class="college-name">BLDEA's V. P. Dr. P. G. Halakatti College of Engineering & Technology</div>
                          <div class="college-address">Adarsh Nagar, Ashram Road, Vijayapur, Karnataka 586103</div>
                      </div>
                  </div>
                  <div class="meta-info">
                      <div class="meta-title">EDUINSIGHT PORTAL</div>
                      <div>Date: ${dateStr}</div>
                  </div>
              </div>

              <div class="grade-card-title">Official Grade Card Report</div>

              <div class="student-details">
                  <div>
                      <div class="detail-item">
                          <span class="detail-label">Student Name:</span>
                          <span class="detail-value">${student.name}</span>
                      </div>
                      <div class="detail-item">
                          <span class="detail-label">University Seat Number (USN):</span>
                          <span class="detail-value font-mono">${student.usn}</span>
                      </div>
                      <div class="detail-item">
                          <span class="detail-label">Department:</span>
                          <span class="detail-value">${student.department}</span>
                      </div>
                  </div>
                  <div>
                      <div class="detail-item">
                          <span class="detail-label">Current Semester:</span>
                          <span class="detail-value">${student.semester}</span>
                      </div>
                      <div class="detail-item">
                          <span class="detail-label">Academic Year:</span>
                          <span class="detail-value">${student.academic_year}</span>
                      </div>
                      <div class="detail-item">
                          <span class="detail-label">Status:</span>
                          <span class="detail-value" style="color: ${student.backlogs > 0 ? '#ef4444' : '#10b981'}">
                              ${student.backlogs > 0 ? `${student.backlogs} Active Backlog(s)` : 'Clear'}
                          </span>
                      </div>
                  </div>
              </div>

              <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                  <thead>
                      <tr>
                          <th style="background-color: #0f172a; color: #ffffff; font-weight: 600; text-transform: uppercase; font-size: 8.5px; letter-spacing: 0.5px; padding: 8px 6px; border: 1px solid #0f172a; text-align: left;">Subject Code</th>
                          <th style="background-color: #0f172a; color: #ffffff; font-weight: 600; text-transform: uppercase; font-size: 8.5px; letter-spacing: 0.5px; padding: 8px 6px; border: 1px solid #0f172a; text-align: left;">Subject Title</th>
                          <th style="background-color: #0f172a; color: #ffffff; font-weight: 600; text-transform: uppercase; font-size: 8.5px; letter-spacing: 0.5px; padding: 8px 6px; border: 1px solid #0f172a; text-align: center;">Internals</th>
                          <th style="background-color: #0f172a; color: #ffffff; font-weight: 600; text-transform: uppercase; font-size: 8.5px; letter-spacing: 0.5px; padding: 8px 6px; border: 1px solid #0f172a; text-align: center;">Externals</th>
                          <th style="background-color: #0f172a; color: #ffffff; font-weight: 600; text-transform: uppercase; font-size: 8.5px; letter-spacing: 0.5px; padding: 8px 6px; border: 1px solid #0f172a; text-align: center;">Total Marks</th>
                          <th style="background-color: #0f172a; color: #ffffff; font-weight: 600; text-transform: uppercase; font-size: 8.5px; letter-spacing: 0.5px; padding: 8px 6px; border: 1px solid #0f172a; text-align: center;">Result</th>
                          <th style="background-color: #0f172a; color: #ffffff; font-weight: 600; text-transform: uppercase; font-size: 8.5px; letter-spacing: 0.5px; padding: 8px 6px; border: 1px solid #0f172a; text-align: center;">Grade</th>
                      </tr>
                  </thead>
                  <tbody>
                      ${rowsHtml}
                  </tbody>
              </table>

              <div class="summary-section">
                  <div class="summary-card">
                      <div class="summary-row">
                          <span>Total Credits Attempted:</span>
                          <span class="font-semibold">${totalCredits}</span>
                      </div>
                      <div class="summary-row">
                          <span>Credits Earned:</span>
                          <span class="font-semibold">${earnedCredits}</span>
                      </div>
                      <div class="summary-row">
                          <span>Active Backlogs:</span>
                          <span class="font-semibold" style="color: ${student.backlogs > 0 ? '#ef4444' : 'inherit'}">${student.backlogs}</span>
                      </div>
                      <div class="summary-row">
                          <span>Semester SGPA:</span>
                          <span class="font-semibold">${sgpa}</span>
                      </div>
                      <div class="summary-row">
                          <span>Cumulative CGPA:</span>
                          <span>${cgpa}</span>
                      </div>
                  </div>
              </div>

              <div class="signatures">
                  <div class="signature-box">
                      <div class="signature-line"></div>
                      <div class="signature-name">Dr. Sumangala Biradar</div>
                      <div class="signature-title">HOD, CSE (AI&ML)</div>
                  </div>
                  <div class="signature-box">
                      <div class="signature-line"></div>
                      <div class="signature-name">Dr. Leena Ragha / Dr. Pradeep Malji Sir</div>
                      <div class="signature-title">Vice Principals</div>
                  </div>
                  <div class="signature-box">
                      <div class="signature-line"></div>
                      <div class="signature-name">Dr. Manjunatha P.</div>
                      <div class="signature-title">Principal</div>
                  </div>
              </div>

              <div class="footer">
                  BLDEA's V. P. Dr. P. G. Halakatti College of Engineering & Technology, Vijayapur. Generated via EduInsight Academic Analytics.
              </div>
          </div>
      </body>
      </html>
    `;
  };

  // Fetch and print grade card securely using JWT headers (Tasks 3, 4, 5)
  const handlePrintGradeCard = async (usn: string) => {
    setLoading(true);
    setError(null);
    try {
      let currentStudent = studentData;
      
      // If studentData doesn't exist or is for a different USN, fetch it
      if (!currentStudent || currentStudent.usn.toUpperCase() !== usn.toUpperCase()) {
        const res = await fetch(`${API_BASE_URL}/analytics/student/${usn}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error("Student academic records not found.");
          } else if (res.status === 401) {
            throw new Error("Your session has expired. Please log in again.");
          } else {
            throw new Error("Failed to load student details for printing.");
          }
        }
        currentStudent = await res.json();
      }

      if (!currentStudent || !currentStudent.marks || currentStudent.marks.length === 0) {
        throw new Error("No academic marks records available for this student.");
      }

      // Generate the premium printable grade card HTML (Task 4)
      const html = generateGradeCardHtml(currentStudent);

      // Open new window and print
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
      } else {
        throw new Error("Popup blocker blocked the print window. Please click the popup icon in the address bar to allow.");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Colors for Recharts can be defined inside components if needed

  return (
    <div className={`min-h-screen font-sans ${theme === 'dark' ? 'dark bg-slate-950 text-white' : 'bg-slate-50 text-slate-900'}`}>
      
      {/* 1. Global Toast Notifications */}
      {error && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-3 bg-red-500/90 text-white px-5 py-3 rounded-lg shadow-xl backdrop-blur-md animate-bounce">
          <AlertTriangle size={20} />
          <span>{typeof error === 'object' ? JSON.stringify(error) : String(error)}</span>
          <button onClick={() => setError(null)} className="ml-3 font-bold hover:text-red-200">×</button>
        </div>
      )}
      {success && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-3 bg-emerald-500/90 text-white px-5 py-3 rounded-lg shadow-xl backdrop-blur-md">
          <CheckCircle2 size={20} />
          <span>{success}</span>
          <button onClick={() => setSuccess(null)} className="ml-3 font-bold hover:text-emerald-200">×</button>
        </div>
      )}

      {/* 2. Login Page */}
      {!token ? (
        <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-slate-900 to-slate-950 px-4">
          <div className="w-full max-w-lg rounded-2xl glass p-8 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl"></div>
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl"></div>
            
            <div className="flex flex-col items-center mb-8">
              <div className="bg-primary/10 p-3 rounded-2xl mb-4 text-blue-500">
                <GraduationCap size={44} />
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 via-indigo-200 to-emerald-400 bg-clip-text text-transparent">
                EDUINSIGHT
              </h1>
              <p className="text-sm text-muted-foreground mt-2 text-center">
                Automated Academic Performance & Analytics Platform
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Username</label>
                <input
                  type="text" required
                  value={username} onChange={e => setUsername(e.target.value)}
                  placeholder="Enter username"
                  className="w-full px-4 py-3 rounded-lg bg-slate-900/60 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-white placeholder-slate-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Password</label>
                <input
                  type="password" required
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 rounded-lg bg-slate-900/60 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-white placeholder-slate-500"
                />
              </div>
              
              <button
                type="submit" disabled={loading}
                className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-lg shadow-lg hover:shadow-indigo-500/20 transition-all flex items-center justify-center gap-2"
              >
                {loading ? <RefreshCw className="animate-spin" size={18} /> : "Sign In"}
              </button>
            </form>

            {/* Quick Login Shortcuts */}
            <div className="mt-8 pt-6 border-t border-slate-800">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-3 text-center">Quick Demo Shortcuts</span>
              <div className="flex flex-wrap gap-2 justify-center">
                {['Principal', 'Vice Principal', 'HOD', 'Faculty', 'Student'].map((role) => (
                  <button
                    key={role}
                    onClick={() => handleAutofill(role)}
                    className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-md border border-slate-700 transition"
                  >
                    {role}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        
        // 3. Application Main Layout
        <div className="flex min-h-screen">
          
          {/* Sidebar Navigation */}
          <aside className="w-64 bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 flex flex-col justify-between p-4 shrink-0 transition-colors duration-300">
            <div className="space-y-6">
              <div className="flex items-center gap-3 px-2">
                <GraduationCap className="text-blue-500" size={32} />
                <div>
                  <span className="font-extrabold text-lg tracking-wider text-slate-900 dark:text-white">EDUINSIGHT</span>
                  <span className="block text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold tracking-widest uppercase">{user.role}</span>
                </div>
              </div>
 
              {/* Navigation Links */}
              <nav className="space-y-1.5">
                {user.role !== 'Student' && (
                  <button
                    onClick={() => { setCurrentTab('dashboard'); setSelectedStudentUsn(null); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition ${
                      currentTab === 'dashboard' && !selectedStudentUsn
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <LayoutDashboard size={18} />
                    <span>Dashboard</span>
                  </button>
                )}
 
                {(user.role === 'HOD' || user.role === 'Faculty') && (
                  <button
                    onClick={() => { setCurrentTab('upload'); setSelectedStudentUsn(null); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition ${
                      currentTab === 'upload'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Upload size={18} />
                    <span>Process CSV</span>
                  </button>
                )}
 
                {(user.role === 'Principal' || user.role === 'Vice Principal' || user.role === 'HOD') && (
                  <button
                    onClick={() => { setCurrentTab('reports'); setSelectedStudentUsn(null); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition ${
                      currentTab === 'reports'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <FileSpreadsheet size={18} />
                    <span>Export Reports</span>
                  </button>
                )}
 
                {user.role === 'Student' && (
                  <button
                    onClick={() => { setCurrentTab('studentView'); setSelectedStudentUsn(user.username); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition ${
                      currentTab === 'studentView'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Award size={18} />
                    <span>My Analytics</span>
                  </button>
                )}
              </nav>
            </div>
 
            {/* Sidebar Footer */}
            <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3 px-2">
                <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center font-bold text-white uppercase">
                  {user.username[0]}
                </div>
                <div className="overflow-hidden">
                  <span className="block text-xs font-bold text-slate-900 dark:text-white truncate">{getOfficialName(user.username, user.full_name)}</span>
                  <span className="block text-[10px] text-slate-500 dark:text-slate-500 truncate">{user.email || user.username}</span>
                </div>
              </div>
 
              <div className="flex gap-2">
                <button
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  className="flex-1 py-2 bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg flex justify-center items-center transition"
                >
                  {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                </button>
                <button
                  onClick={handleLogout}
                  className="flex-1 py-2 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 rounded-lg flex justify-center items-center gap-2 text-xs font-bold transition"
                >
                  <LogOut size={16} />
                  <span>Logout</span>
                </button>
              </div>
            </div>
          </aside>
 
          {/* Main Content Pane */}
          <main className="flex-1 overflow-y-auto p-8 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-300">
            
            {loading && (
              <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 flex items-center justify-center">
                <div className="bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 p-6 rounded-xl shadow-2xl flex flex-col items-center gap-4">
                  <RefreshCw className="animate-spin text-blue-500" size={32} />
                  <span className="text-sm font-bold text-slate-900 dark:text-slate-300">Retrieving system stats...</span>
                </div>
              </div>
            )}

            {/* Title / Breadcrumb Row */}
            <header className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                  {currentTab === 'dashboard' && "Academic Performance Control Center"}
                  {currentTab === 'upload' && "VTU Automated Results Loader"}
                  {currentTab === 'reports' && "Academic Reports Center"}
                  {currentTab === 'studentView' && "Student Transcripts & GPA Trends"}
                </h2>
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mt-1.5">
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    BLDEA's V. P. Dr. P. G. Halakatti College of Engineering & Technology
                  </p>
                  <span className="hidden sm:inline text-slate-300 dark:text-slate-700">•</span>
                  <span className="text-xs font-semibold px-2 py-0.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-md border border-blue-200 dark:border-blue-500/20 w-fit transition">
                    Active Session: {getOfficialName(user.username, user.full_name)}
                  </span>
                </div>
              </div>

              {currentTab === 'dashboard' && user.role !== 'Student' && (
                <button
                  onClick={() => {
                    if (user.role === 'Principal' || user.role === 'Vice Principal') {
                      handleCsvExport(selectedDeptCode);
                    } else {
                      handleCsvExport(user.department_code || 'CI');
                    }
                  }}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-sm flex items-center gap-2 shadow-md hover:shadow-lg transition cursor-pointer dark:text-white"
                >
                  <Download size={16} />
                  <span>Download Report</span>
                </button>
              )}
            </header>

            {/* Tab: Dashboard (Principal & VP) */}
            {currentTab === 'dashboard' && (user.role === 'Principal' || user.role === 'Vice Principal') && instData && (
              <div className="space-y-8">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="rounded-2xl bg-white dark:bg-gradient-to-br dark:from-slate-900/80 dark:to-slate-950/80 border border-slate-200 dark:border-slate-800 hover:border-blue-500/30 p-6 flex items-center justify-between shadow-sm dark:shadow-xl hover:shadow-md dark:hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 relative overflow-hidden group">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl group-hover:bg-blue-500/10 transition-all"></div>
                      <div>
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Total Students</span>
                        <span className="text-3xl font-black text-slate-900 dark:text-white mt-1 block tracking-tight">{instData.total_students}</span>
                      </div>
                      <div className="text-blue-600 dark:text-blue-500 bg-blue-500/10 p-3.5 rounded-xl group-hover:bg-blue-500/20 transition-all"><Users size={24} /></div>
                    </div>
                    <div className="rounded-2xl bg-white dark:bg-gradient-to-br dark:from-slate-900/80 dark:to-slate-950/80 border border-slate-200 dark:border-slate-800 hover:border-emerald-500/30 p-6 flex items-center justify-between shadow-sm dark:shadow-xl hover:shadow-md dark:hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 relative overflow-hidden group">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-all"></div>
                      <div>
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Overall Pass Rate</span>
                        <span className="text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-1 block tracking-tight">{instData.pass_rate}%</span>
                      </div>
                      <div className="text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 p-3.5 rounded-xl group-hover:bg-emerald-500/20 transition-all"><Award size={24} /></div>
                    </div>
                    <div className="rounded-2xl bg-white dark:bg-gradient-to-br dark:from-slate-900/80 dark:to-slate-950/80 border border-slate-200 dark:border-slate-800 hover:border-indigo-500/30 p-6 flex items-center justify-between shadow-sm dark:shadow-xl hover:shadow-md dark:hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 relative overflow-hidden group">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl group-hover:bg-indigo-500/10 transition-all"></div>
                      <div>
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Avg Normalized Score</span>
                        <span className="text-3xl font-black text-indigo-600 dark:text-indigo-400 mt-1 block tracking-tight">{instData.avg_marks}/100</span>
                      </div>
                      <div className="text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 p-3.5 rounded-xl group-hover:bg-indigo-500/20 transition-all"><TrendingUp size={24} /></div>
                    </div>
                    <div className="rounded-2xl bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/40 dark:to-blue-950/40 border border-indigo-100 dark:border-indigo-700/30 hover:border-indigo-500/50 p-6 flex items-center justify-between shadow-sm dark:shadow-xl hover:shadow-md dark:hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 relative overflow-hidden group">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl group-hover:bg-indigo-500/20 transition-all"></div>
                      <div>
                        <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider block">Academic Health Score</span>
                        <span className="text-3xl font-black text-indigo-800 dark:text-white mt-1 block tracking-tight">{instData.health_score}</span>
                      </div>
                      <div className="text-indigo-600 dark:text-indigo-200 bg-indigo-500/20 p-3.5 rounded-xl group-hover:bg-indigo-500/30 transition-all"><Building2 size={24} /></div>
                    </div>
                  </div>

                {/* Institution charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Department Comparison Chart */}
                  <div className="rounded-xl bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 p-6 transition-all shadow-sm">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4">Departmental Academic Health Summary</h3>
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={instData.departments} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#1e293b' : '#e2e8f0'} />
                          <XAxis dataKey="department_code" stroke={theme === 'dark' ? '#94a3b8' : '#64748b'} />
                          <YAxis stroke={theme === 'dark' ? '#94a3b8' : '#64748b'} domain={[0, 100]} />
                          <Tooltip contentStyle={theme === 'dark' ? { backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#fff' } : { backgroundColor: '#fff', borderColor: '#e2e8f0', color: '#000' }} />
                          <Legend />
                          <Bar dataKey="health_score" name="Academic Health" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="pass_rate" name="Pass Rate %" fill="#10b981" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Backlog Trends / Risk Assessment */}
                  <div className="rounded-xl bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 p-6 transition-all shadow-sm">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4">Average Scores by Department</h3>
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={instData.departments} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#1e293b' : '#e2e8f0'} />
                          <XAxis dataKey="department_code" stroke={theme === 'dark' ? '#94a3b8' : '#64748b'} />
                          <YAxis stroke={theme === 'dark' ? '#94a3b8' : '#64748b'} />
                          <Tooltip contentStyle={theme === 'dark' ? { backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#fff' } : { backgroundColor: '#fff', borderColor: '#e2e8f0', color: '#000' }} />
                          <Bar dataKey="avg_marks" name="Average Marks" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* VP Dashboard - Risk and Alert Cards */}
                {user.role === 'Vice Principal' && (
                  <div className="rounded-xl bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2 text-amber-600 dark:text-amber-500">
                        <ShieldAlert size={22} />
                        <h3 className="text-lg font-bold text-slate-800 dark:text-white">System Risk Detection and Active Backlogs</h3>
                      </div>
                      <span className="text-xs bg-amber-500/10 text-amber-600 dark:text-amber-500 px-3 py-1 rounded-full font-bold">Real-time alerts</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30">
                        <span className="text-xs text-red-600 dark:text-red-400 uppercase tracking-wider block font-bold">Critical High Risk Students</span>
                        <span className="text-2xl font-black text-red-600 dark:text-red-500 mt-1 block">
                          {instData.departments.reduce((sum: number, d: any) => sum + (d.risk_breakdown?.Critical || 0), 0)}
                        </span>
                      </div>
                      <div className="p-4 rounded-lg bg-orange-50 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-900/30">
                        <span className="text-xs text-orange-600 dark:text-orange-400 uppercase tracking-wider block font-bold">Moderate Risk Students</span>
                        <span className="text-2xl font-black text-orange-600 dark:text-orange-500 mt-1 block">
                          {instData.departments.reduce((sum: number, d: any) => sum + (d.risk_breakdown?.["Medium Risk"] || 0), 0)}
                        </span>
                      </div>
                      <div className="p-4 rounded-lg bg-emerald-50/40 dark:bg-emerald-950/10 border border-emerald-100/60 dark:border-emerald-900/30">
                        <span className="text-xs text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block font-bold">Clear Low Risk Students</span>
                        <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1 block">
                          {instData.departments.reduce((sum: number, d: any) => sum + (d.risk_breakdown?.["Low Risk"] || 0), 0)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Department Details Drilldown Selection */}
                <div className="border-t border-slate-200 dark:border-slate-800 pt-8">
                  <div className="flex items-center gap-3 mb-6">
                    <Building2 className="text-indigo-600 dark:text-indigo-400" size={24} />
                    <h3 className="text-xl font-extrabold text-slate-800 dark:text-white">Department Drilldown</h3>
                  </div>
                  <div className="flex gap-2 mb-6">
                    {instData.departments.map((d: any) => (
                      <button
                        key={d.department_code}
                        onClick={() => setSelectedDeptCode(d.department_code)}
                        className={`px-4 py-2 rounded-lg text-sm font-bold border transition ${
                          selectedDeptCode === d.department_code
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
                        }`}
                      >
                        {d.department_name} ({d.department_code})
                      </button>
                    ))}
                  </div>

                  {deptData && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                      {/* Department Stats */}
                      <div className="lg:col-span-1 rounded-xl bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 p-6 space-y-6 shadow-sm">
                        <h4 className="text-lg font-bold text-slate-800 dark:text-white border-b border-slate-200 dark:border-slate-800 pb-3">{deptData.department_name} Summary</h4>
                        <div className="space-y-4">
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-slate-500 dark:text-slate-400">Total Enrolled:</span>
                            <span className="font-bold text-slate-800 dark:text-white">{deptData.total_students}</span>
                          </div>
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-slate-500 dark:text-slate-400">Pass Rate:</span>
                            <span className="font-bold text-emerald-600 dark:text-emerald-400">{deptData.pass_rate}%</span>
                          </div>
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-slate-500 dark:text-slate-400">Average Normalized Score:</span>
                            <span className="font-bold text-slate-800 dark:text-white">{deptData.avg_marks}/100</span>
                          </div>
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-slate-500 dark:text-slate-400">Backlog Clearing Rate:</span>
                            <span className="font-bold text-indigo-600 dark:text-indigo-400">{deptData.backlog_clear_rate}%</span>
                          </div>
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-slate-500 dark:text-slate-400 font-bold">Academic Health Score:</span>
                            <span className="font-black text-blue-600 dark:text-blue-400 text-lg">{deptData.health_score}</span>
                          </div>
                        </div>

                        {/* Risk breakdown pie chart */}
                        <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                          <h5 className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 tracking-wider mb-3">Student Risk Distribution</h5>
                          <div className="flex items-center gap-4 text-xs">
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>Low</span>
                                <span className="font-bold text-slate-800 dark:text-slate-200">{deptData.risk_breakdown?.["Low Risk"] || 0}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>Medium</span>
                                <span className="font-bold text-slate-800 dark:text-slate-200">{deptData.risk_breakdown?.["Medium Risk"] || 0}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>High</span>
                                <span className="font-bold text-slate-800 dark:text-slate-200">{deptData.risk_breakdown?.["High Risk"] || 0}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Department Students List */}
                      <div className="lg:col-span-2 rounded-xl bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 p-6 flex flex-col h-[400px] shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="text-lg font-bold text-slate-800 dark:text-white">Students Roster</h4>
                          <div className="relative w-64">
                            <Search className="absolute left-3 top-2.5 text-slate-500" size={16} />
                            <input
                              type="text"
                              placeholder="Search by USN or Name"
                              value={studentSearchQuery}
                              onChange={e => setStudentSearchQuery(e.target.value)}
                              className="w-full pl-9 pr-4 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                        </div>

                        <div className="flex-1 overflow-y-auto">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900">
                              <tr>
                                <th className="p-3 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">USN</th>
                                <th className="p-3 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">Name</th>
                                <th className="p-3 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">Sem</th>
                                <th className="p-3 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">Backlogs</th>
                                <th className="p-3 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">Status</th>
                                <th className="p-3 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold text-center">Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {deptData.student_list && deptData.student_list
                                .filter((s: any) =>
                                  s.usn.toLowerCase().includes(studentSearchQuery.toLowerCase()) ||
                                  s.name.toLowerCase().includes(studentSearchQuery.toLowerCase())
                                )
                                .map((s: any) => (
                                  <tr key={s.usn} className="hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors">
                                    <td className="p-3 border-b border-slate-200 dark:border-slate-800 font-mono font-bold text-slate-700 dark:text-slate-300">{s.usn}</td>
                                    <td className="p-3 border-b border-slate-200 dark:border-slate-800 font-semibold text-slate-800 dark:text-white">{s.name}</td>
                                    <td className="p-3 border-b border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">{s.semester}</td>
                                    <td className="p-3 border-b border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">{s.backlogs}</td>
                                    <td className="p-3 border-b border-slate-200 dark:border-slate-800">
                                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                        s.status === 'low risk' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
                                        s.status === 'medium risk' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-500' :
                                        'bg-red-500/10 text-red-600 dark:text-red-500'
                                      }`}>
                                        {s.status}
                                      </span>
                                    </td>
                                    <td className="p-3 border-b border-slate-200 dark:border-slate-800 text-center">
                                      <button
                                        onClick={() => { setSelectedStudentUsn(s.usn); setCurrentTab('studentView'); }}
                                        className="p-1 bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-600 hover:text-white rounded transition"
                                      >
                                        <Eye size={14} />
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tab: Dashboard (HOD) */}
            {currentTab === 'dashboard' && user.role === 'HOD' && deptData && (
              <div className="space-y-8">
                {/* 4 HOD cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="rounded-2xl bg-white dark:bg-gradient-to-br dark:from-slate-900/80 dark:to-slate-950/80 border border-slate-200 dark:border-slate-800 hover:border-blue-500/30 p-6 flex items-center justify-between shadow-sm dark:shadow-xl hover:shadow-md dark:hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl group-hover:bg-blue-500/10 transition-all"></div>
                    <div>
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Department Enrolled</span>
                      <span className="text-3xl font-black text-slate-900 dark:text-white mt-1 block tracking-tight">{deptData.total_students}</span>
                    </div>
                    <div className="text-blue-600 dark:text-blue-500 bg-blue-500/10 p-3.5 rounded-xl group-hover:bg-blue-500/20 transition-all"><Users size={24} /></div>
                  </div>
                  <div className="rounded-2xl bg-white dark:bg-gradient-to-br dark:from-slate-900/80 dark:to-slate-950/80 border border-slate-200 dark:border-slate-800 hover:border-emerald-500/30 p-6 flex items-center justify-between shadow-sm dark:shadow-xl hover:shadow-md dark:hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-all"></div>
                    <div>
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Department Pass %</span>
                      <span className="text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-1 block tracking-tight">{deptData.pass_rate}%</span>
                    </div>
                    <div className="text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 p-3.5 rounded-xl group-hover:bg-emerald-500/20 transition-all"><Award size={24} /></div>
                  </div>
                  <div className="rounded-2xl bg-white dark:bg-gradient-to-br dark:from-slate-900/80 dark:to-slate-950/80 border border-slate-200 dark:border-slate-800 hover:border-indigo-500/30 p-6 flex items-center justify-between shadow-sm dark:shadow-xl hover:shadow-md dark:hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl group-hover:bg-indigo-500/10 transition-all"></div>
                    <div>
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Backlog Clearing Rate</span>
                      <span className="text-3xl font-black text-indigo-600 dark:text-indigo-400 mt-1 block tracking-tight">{deptData.backlog_clear_rate}%</span>
                    </div>
                    <div className="text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 p-3.5 rounded-xl group-hover:bg-indigo-500/20 transition-all"><TrendingUp size={24} /></div>
                  </div>
                  <div className="rounded-2xl bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/40 dark:to-blue-950/40 border border-indigo-100 dark:border-indigo-700/30 hover:border-indigo-500/50 p-6 flex items-center justify-between shadow-sm dark:shadow-xl hover:shadow-md dark:hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl group-hover:bg-indigo-500/20 transition-all"></div>
                    <div>
                      <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider block">Department Health Score</span>
                      <span className="text-3xl font-black text-indigo-800 dark:text-white mt-1 block tracking-tight">{deptData.health_score}</span>
                    </div>
                    <div className="text-indigo-600 dark:text-indigo-200 bg-indigo-500/20 p-3.5 rounded-xl group-hover:bg-indigo-500/30 transition-all"><Building2 size={24} /></div>
                  </div>
                </div>

                {/* HOD Student Roster and Risk breakdown */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* Left Column: Risk breakdown & Export */}
                  <div className="lg:col-span-1 space-y-6">
                    <div className="rounded-xl bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
                      <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4">Risk Breakdown</h3>
                      <div className="space-y-4">
                        <div className="flex justify-between items-center text-sm p-3 bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 rounded-lg">
                          <span className="font-bold text-red-650 dark:text-red-500">Critical / High Risk:</span>
                          <span className="font-black text-red-700 dark:text-white text-base">{deptData.risk_breakdown?.["High Risk"] || 0}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 rounded-lg">
                          <span className="font-bold text-amber-600 dark:text-amber-500">Medium Risk:</span>
                          <span className="font-black text-amber-700 dark:text-white text-base">{deptData.risk_breakdown?.["Medium Risk"] || 0}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm p-3 bg-slate-100/50 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">Low Risk:</span>
                          <span className="font-black text-slate-800 dark:text-white text-base">{deptData.risk_breakdown?.["Low Risk"] || 0}</span>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-sm">
                      <h3 className="text-lg font-bold text-slate-800 dark:text-white">Exports & Excel Tools</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Download spreadsheet of this department containing students, subjects, internal/external grades, and academic tracking profiles.
                      </p>
                      <button
                        onClick={() => handleCsvExport(user.department_code)}
                        className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-sm flex items-center justify-center gap-2 transition cursor-pointer"
                      >
                        <Download size={16} />
                        <span>Export Department Excel</span>
                      </button>
                    </div>
                  </div>

                  {/* Right Column: Searchable student list */}
                  <div className="lg:col-span-2 rounded-xl bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 p-6 flex flex-col h-[450px] shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-lg font-bold text-slate-800 dark:text-white">Students Registry ({user.department_code})</h4>
                      <div className="relative w-64">
                        <Search className="absolute left-3 top-2.5 text-slate-500" size={16} />
                        <input
                          type="text"
                          placeholder="Search USN or Name"
                          value={studentSearchQuery}
                          onChange={e => setStudentSearchQuery(e.target.value)}
                          className="w-full pl-9 pr-4 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900">
                          <tr>
                            <th className="p-3 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">USN</th>
                            <th className="p-3 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">Name</th>
                            <th className="p-3 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">Sem</th>
                            <th className="p-3 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">Backlogs</th>
                            <th className="p-3 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">Risk Profile</th>
                            <th className="p-3 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {deptData.student_list && deptData.student_list
                            .filter((s: any) =>
                              s.usn.toLowerCase().includes(studentSearchQuery.toLowerCase()) ||
                              s.name.toLowerCase().includes(studentSearchQuery.toLowerCase())
                            )
                            .map((s: any) => (
                              <tr key={s.usn} className="hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors">
                                <td className="p-3 border-b border-slate-200 dark:border-slate-800 font-mono font-bold text-slate-700 dark:text-slate-300">{s.usn}</td>
                                <td className="p-3 border-b border-slate-200 dark:border-slate-800 font-semibold text-slate-800 dark:text-white">{s.name}</td>
                                <td className="p-3 border-b border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">{s.semester}</td>
                                <td className="p-3 border-b border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">{s.backlogs}</td>
                                <td className="p-3 border-b border-slate-200 dark:border-slate-800">
                                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                    s.status === 'low risk' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
                                    s.status === 'medium risk' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-500' :
                                    'bg-red-500/10 text-red-650 dark:text-red-500'
                                  }`}>
                                    {s.status}
                                  </span>
                                </td>
                                <td className="p-3 border-b border-slate-200 dark:border-slate-800 text-center">
                                  <button
                                    onClick={() => { setSelectedStudentUsn(s.usn); setCurrentTab('studentView'); }}
                                    className="p-1 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-600 hover:text-white rounded transition"
                                  >
                                    <Eye size={14} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab: Dashboard (Faculty) */}
            {currentTab === 'dashboard' && user.role === 'Faculty' && facultyData && (
              <div className="space-y-8">
                {/* Faculty Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="rounded-xl bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 p-6 flex items-center justify-between shadow-sm">
                    <div>
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Assigned Subjects</span>
                      <span className="text-3xl font-black text-slate-800 dark:text-white mt-1 block">{facultyData.assigned_subjects?.length || 0}</span>
                    </div>
                    <div className="text-blue-600 dark:text-blue-500 bg-blue-500/10 p-3 rounded-lg"><BookOpen size={24} /></div>
                  </div>
                  <div className="rounded-xl bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 p-6 flex items-center justify-between shadow-sm">
                    <div>
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Advisor Students</span>
                      <span className="text-3xl font-black text-indigo-600 dark:text-indigo-400 mt-1 block">{facultyData.assigned_students?.length || 0}</span>
                    </div>
                    <div className="text-indigo-600 dark:text-indigo-450 bg-indigo-500/10 p-3 rounded-lg"><Users size={24} /></div>
                  </div>
                  <div className="rounded-xl bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 p-6 flex items-center justify-between shadow-sm">
                    <div>
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Course Avg Pass Rate</span>
                      <span className="text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-1 block">{facultyData.overall_pass_rate}%</span>
                    </div>
                    <div className="text-emerald-600 dark:text-emerald-450 bg-emerald-500/10 p-3 rounded-lg"><Award size={24} /></div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Assigned Subjects Performance */}
                  <div className="rounded-xl bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4">Course Performance Breakdown</h3>
                    <div className="space-y-4">
                      {facultyData.assigned_subjects && facultyData.assigned_subjects.map((sub: any) => (
                        <div key={sub.subject_code} className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg">
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400">{sub.subject_code}</span>
                              <h4 className="text-sm font-bold text-slate-800 dark:text-white mt-0.5">{sub.subject_name}</h4>
                            </div>
                            <span className="text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2.5 py-0.5 rounded-full font-bold">
                              {sub.pass_rate}% Pass
                            </span>
                          </div>
                          
                          <div className="grid grid-cols-3 gap-4 mt-4 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-900 pt-3">
                            <div>
                              <span>Appeared</span>
                              <span className="block font-bold text-slate-700 dark:text-white text-sm">{sub.appeared}</span>
                            </div>
                            <div>
                              <span>Passed</span>
                              <span className="block font-bold text-slate-700 dark:text-white text-sm">{sub.passed}</span>
                            </div>
                            <div>
                              <span>Class Avg Score</span>
                              <span className="block font-bold text-slate-700 dark:text-white text-sm">{sub.avg_marks}/100</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Advisor Students List */}
                  <div className="rounded-xl bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 p-6 flex flex-col h-[350px] shadow-sm">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4">My Assigned Advisor Students</h3>
                    <div className="flex-1 overflow-y-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900">
                          <tr>
                            <th className="p-3 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">USN</th>
                            <th className="p-3 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">Name</th>
                            <th className="p-3 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">Sem</th>
                            <th className="p-3 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">Backlogs</th>
                            <th className="p-3 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">Risk</th>
                            <th className="p-3 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {facultyData.assigned_students && facultyData.assigned_students.map((s: any) => (
                            <tr key={s.usn} className="hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors">
                              <td className="p-3 border-b border-slate-200 dark:border-slate-800 font-mono font-bold text-slate-700 dark:text-slate-300">{s.usn}</td>
                              <td className="p-3 border-b border-slate-200 dark:border-slate-800 font-semibold text-slate-800 dark:text-white">{s.name}</td>
                              <td className="p-3 border-b border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">{s.semester}</td>
                              <td className="p-3 border-b border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">{s.backlogs}</td>
                              <td className="p-3 border-b border-slate-200 dark:border-slate-800">
                                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                  s.risk_status === 'Low Risk' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
                                  s.risk_status === 'Medium Risk' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-500' :
                                  'bg-red-500/10 text-red-600 dark:text-red-500'
                                }`}>
                                  {s.risk_status}
                                </span>
                              </td>
                              <td className="p-3 border-b border-slate-200 dark:border-slate-800 text-center">
                                <button
                                  onClick={() => { setSelectedStudentUsn(s.usn); setCurrentTab('studentView'); }}
                                  className="p-1 bg-blue-55 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-600 hover:text-white rounded transition"
                                >
                                  <Eye size={14} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab: Process CSV Loader (HOD and Faculty) */}
            {currentTab === 'upload' && (user.role === 'HOD' || user.role === 'Faculty') && (
              <div className="space-y-8">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* File Upload Selector */}
                  <div className="rounded-xl bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 p-6 h-fit shadow-sm">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4">Upload USN Records</h3>
                    <form onSubmit={handleFileUpload} className="space-y-4">
                      <div className="border-2 border-dashed border-slate-350 dark:border-slate-700 hover:border-blue-500 rounded-lg p-6 text-center cursor-pointer transition relative">
                        <input
                          type="file"
                          accept=".csv,.xlsx"
                          onChange={e => setSelectedFile(e.target.files ? e.target.files[0] : null)}
                          className="absolute inset-0 opacity-0 cursor-pointer"
                        />
                        <Upload className="mx-auto text-slate-400 dark:text-slate-500 mb-3" size={36} />
                        <span className="text-xs text-slate-700 dark:text-slate-300 font-bold block">
                          {selectedFile ? selectedFile.name : "Drag & Drop CSV / Excel or Browse"}
                        </span>
                        <span className="text-[10px] text-slate-500 mt-1 block">Supported: .csv, .xlsx</span>
                      </div>
                      
                      <button
                        type="submit"
                        disabled={!selectedFile || processingStatus === 'scraping'}
                        className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-sm transition flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {processingStatus === 'uploading' ? <RefreshCw className="animate-spin" size={16} /> : <Upload size={16} />}
                        <span>Parse USNs</span>
                      </button>
                    </form>
                  </div>

                  {/* Batch Progress List */}
                  <div className="lg:col-span-2 rounded-xl bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 p-6 flex flex-col h-[450px] shadow-sm">
                    <div className="flex items-center justify-between mb-4 border-b border-slate-200 dark:border-slate-800 pb-3">
                      <h4 className="text-lg font-bold text-slate-800 dark:text-white">Batch Loading Queue</h4>
                      {processingStatus === 'completed' ? (
                        <button
                          onClick={() => handleCsvExport(user?.department_code || 'CI')}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 shadow transition cursor-pointer"
                        >
                          <Download size={14} />
                          <span>Download Results CSV</span>
                        </button>
                      ) : uploadProgress && (
                        <span className="text-xs text-indigo-600 dark:text-indigo-400 font-bold">
                          Progress: {uploadProgress.current_index} / {uploadProgress.total_usns} Processed
                        </span>
                      )}
                    </div>

                    <div className="flex-1 overflow-y-auto">
                      {!uploadProgress ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs">
                          <Info size={32} className="mb-2" />
                          <span>No batch is currently active. Upload a CSV of student USNs to begin.</span>
                        </div>
                      ) : (
                        <table className="w-full text-left border-collapse text-xs">
                          <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900">
                            <tr>
                              <th className="p-3 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">USN</th>
                              <th className="p-3 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">Student Name</th>
                              <th className="p-3 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">Source</th>
                              <th className="p-3 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">Status</th>
                              <th className="p-3 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">Log/Error</th>
                            </tr>
                          </thead>
                          <tbody>
                            {uploadProgress.list.map((item: any, idx: number) => (
                              <tr
                                key={item.usn}
                                className={`transition-colors ${
                                  uploadProgress.current_index === idx ? 'bg-blue-500/10 font-semibold' : ''
                                }`}
                              >
                                <td className="p-3 border-b border-slate-200 dark:border-slate-800 font-mono font-bold text-slate-700 dark:text-slate-300">{item.usn}</td>
                                <td className="p-3 border-b border-slate-200 dark:border-slate-800 text-slate-800 dark:text-white">{item.name || "-"}</td>
                                <td className="p-3 border-b border-slate-200 dark:border-slate-800 uppercase text-xs font-semibold text-slate-400">{item.source || "-"}</td>
                                <td className="p-3 border-b border-slate-200 dark:border-slate-800">
                                  {item.status === 'pending' && <span className="text-slate-500 font-bold">Pending</span>}
                                  {item.status === 'processing' && (
                                    <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-bold pulse-active">
                                      <RefreshCw size={12} className="animate-spin" /> Scraping
                                    </span>
                                  )}
                                  {item.status === 'success' && <span className="text-emerald-600 dark:text-emerald-400 font-bold">Success</span>}
                                  {item.status === 'error' && <span className="text-red-500 font-bold">Failed</span>}
                                </td>
                                <td className="p-3 border-b border-slate-200 dark:border-slate-800 text-slate-500 text-[10px] truncate max-w-xs">{item.error || "-"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab: Student Transcript View (Student role or drilldown from HOD/Principal) */}
            {currentTab === 'studentView' && studentData && (
              <div className="space-y-8">
                
                {/* Back button if viewed by an Admin */}
                {user.role !== 'Student' && (
                  <button
                    onClick={() => { setSelectedStudentUsn(null); setCurrentTab('dashboard'); }}
                    className="flex items-center gap-2 text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 mb-2 transition"
                  >
                    ← Back to Dashboard
                  </button>
                )}

                {/* Student Profile Info Card */}
                <div className="rounded-xl bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative overflow-hidden shadow-sm">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <GraduationCap className="text-indigo-600 dark:text-indigo-400" size={20} />
                      <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">{studentData.department}</span>
                    </div>
                    <h3 className="text-2xl font-black text-slate-800 dark:text-white">{studentData.name}</h3>
                    <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-550 dark:text-slate-400">
                      <span>USN: <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{studentData.usn}</span></span>
                      <span>Semester: <span className="font-semibold text-slate-800 dark:text-slate-200">{studentData.semester}</span></span>
                      <span>Academic Year: <span className="font-semibold text-slate-800 dark:text-slate-200">{studentData.academic_year}</span></span>
                    </div>
                  </div>

                  <div className="flex gap-4 items-center">
                    <div className="text-right">
                      <span className="text-xs text-slate-400 block font-semibold">Active Backlogs</span>
                      <span className={`text-2xl font-black mt-0.5 block ${studentData.backlogs > 0 ? 'text-red-500' : 'text-emerald-400'}`}>
                        {studentData.backlogs}
                      </span>
                    </div>
                    
                    {/* Grade Card Export Link */}
                    <button
                      onClick={() => handlePrintGradeCard(studentData.usn)}
                      className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 hover:shadow-blue-500/20 text-white font-bold rounded-lg text-xs flex items-center gap-2 shadow-lg transition cursor-pointer"
                    >
                      <Download size={14} />
                      <span>Print Grade Card</span>
                    </button>
                  </div>
                  {/* Main section: Marks table & GPA Chart */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  
                  {/* Left: Grades Table */}
                  <div className="lg:col-span-2 rounded-xl bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
                    <h4 className="text-lg font-bold text-slate-800 dark:text-white mb-4">Official VTU Grade Sheet</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr>
                            <th className="p-3 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">Subject Code</th>
                            <th className="p-3 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">Subject Name</th>
                            <th className="p-3 border-b border-slate-200 dark:border-slate-800 text-slate-550 dark:text-slate-400 font-semibold text-center">Internals</th>
                            <th className="p-3 border-b border-slate-200 dark:border-slate-800 text-slate-550 dark:text-slate-400 font-semibold text-center">Externals</th>
                            <th className="p-3 border-b border-slate-200 dark:border-slate-800 text-slate-550 dark:text-slate-400 font-semibold text-center">Total</th>
                            <th className="p-3 border-b border-slate-200 dark:border-slate-800 text-slate-550 dark:text-slate-400 font-semibold text-center">Grade</th>
                          </tr>
                        </thead>
                        <tbody>
                          {studentData.marks && studentData.marks.map((m: any) => (
                            <tr key={m.subject_code} className="hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors">
                              <td className="p-3 border-b border-slate-200 dark:border-slate-800 font-mono font-bold text-slate-700 dark:text-slate-300">{m.subject_code}</td>
                              <td className="p-3 border-b border-slate-200 dark:border-slate-800 font-semibold text-slate-800 dark:text-white">{m.subject_name}</td>
                              <td className="p-3 border-b border-slate-200 dark:border-slate-800 text-center text-slate-600 dark:text-slate-300">{m.internal_marks}</td>
                              <td className="p-3 border-b border-slate-200 dark:border-slate-800 text-center text-slate-600 dark:text-slate-300">{m.external_marks}</td>
                              <td className="p-3 border-b border-slate-200 dark:border-slate-800 text-center font-bold text-slate-900 dark:text-white">{m.total_marks}</td>
                              <td className="p-3 border-b border-slate-200 dark:border-slate-800 text-center">
                                <span className={`px-2 py-0.5 rounded font-bold uppercase ${
                                  m.result === 'P' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/10 text-red-655 dark:text-red-500'
                                }`}>
                                  {m.result}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Right: SGPA Trend Chart */}
                  <div className="lg:col-span-1 rounded-xl bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 p-6 flex flex-col justify-between shadow-sm">
                    <div>
                      <h4 className="text-lg font-bold text-slate-800 dark:text-white mb-4">GPA Performance Trend</h4>
                      <div className="h-64">
                        {studentData.gpa_trends && studentData.gpa_trends.length > 0 ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={studentData.gpa_trends} margin={{ top: 10, right: 10, left: -30, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#1e293b' : '#e2e8f0'} />
                              <XAxis dataKey="semester" stroke={theme === 'dark' ? '#94a3b8' : '#64748b'} />
                              <YAxis stroke={theme === 'dark' ? '#94a3b8' : '#64748b'} domain={[0, 10]} />
                              <Tooltip contentStyle={theme === 'dark' ? { backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#fff' } : { backgroundColor: '#fff', borderColor: '#e2e8f0', color: '#000' }} />
                              <Line type="monotone" dataKey="gpa" stroke="#3b82f6" strokeWidth={3} dot={{ fill: '#3b82f6', r: 4 }} />
                            </LineChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-full flex items-center justify-center text-xs text-slate-500">
                            No GPA trends available.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Calculated overall GPA summary */}
                    <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center bg-indigo-50 dark:bg-indigo-950/15 p-4 rounded-lg border border-indigo-100 dark:border-indigo-900/20">
                      <div>
                        <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold block">Overall SGPA</span>
                        <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold">Latest semester calculation</span>
                      </div>
                      <span className="text-3xl font-black text-indigo-600 dark:text-indigo-300">
                        {studentData.gpa_trends && studentData.gpa_trends.length > 0
                          ? studentData.gpa_trends[studentData.gpa_trends.length - 1].gpa
                          : "N/A"}
                      </span>
                    </div>
                  </div>
                </div>                </div>
              </div>
            )}

            {/* Tab: Reports Export */}
            {currentTab === 'reports' && (
              <div className="space-y-6 rounded-xl bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 p-8 max-w-2xl shadow-sm">
                <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Export Department Reports</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
                  Select a department to download a comprehensive CSV spreadsheet containing academic performance logs, student rosters, subject grades, and backlog/risk evaluations.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {Object.entries(DEPT_MAP).map(([code, name]) => (
                    <div key={code} className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg flex items-center justify-between">
                      <div>
                        <span className="font-bold text-slate-800 dark:text-white block text-sm">{code}</span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-450 block truncate max-w-[180px]">{name}</span>
                      </div>
                      <button
                        onClick={() => handleCsvExport(code)}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded text-xs flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <Download size={12} />
                        <span>CSV/Excel</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </main>

          {/* 4. Interactive CAPTCHA Solver Modal */}
          {captchaModal && (
            <div className="fixed inset-0 bg-slate-955/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-md w-full p-6 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl"></div>
                
                <h3 className="text-xl font-extrabold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                  <ShieldAlert size={20} className="text-blue-500" />
                  <span>VTU Portal Security CAPTCHA</span>
                </h3>
                <p className="text-xs text-slate-550 dark:text-slate-400 mb-6">
                  Action required for USN <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{captchaModal.usn}</span>.
                  The VTU portal requires CAPTCHA verification to retrieve academic data.
                </p>

                <form onSubmit={handleCaptchaSubmit} className="space-y-6">
                  {/* Captcha Image display */}
                  <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-lg p-6 flex justify-center items-center">
                    <img
                      src={`data:image/png;base64,${captchaModal.captcha_image}`}
                      alt="VTU CAPTCHA Code"
                      className="max-h-16 select-none"
                    />
                  </div>

                  {/* Input field */}
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Enter CAPTCHA Code</label>
                    <input
                      type="text" required autoFocus
                      value={captchaModal.input}
                      onChange={e => setCaptchaModal((prev: any) => ({ ...prev, input: e.target.value }))}
                      placeholder="Type letters/numbers"
                      className="w-full px-4 py-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-slate-900 dark:text-white font-mono font-bold tracking-widest text-center text-lg placeholder-slate-400 dark:placeholder-slate-600"
                    />
                  </div>

                  {/* Submit / Skip Actions */}
                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={handleCaptchaSkip}
                      className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-950 dark:hover:bg-slate-850 text-slate-600 dark:text-slate-400 dark:hover:text-white border border-slate-200 dark:border-slate-800 font-bold rounded-lg text-xs transition"
                    >
                      Skip Student
                    </button>
                    <button
                      type="submit" disabled={loading}
                      className="flex-1 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-lg text-xs shadow-lg hover:shadow-indigo-500/20 transition flex items-center justify-center gap-1.5"
                    >
                      {loading ? <RefreshCw className="animate-spin" size={14} /> : <CheckCircle2 size={14} />}
                      <span>Verify and Continue</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Helper mapping for department full names to show in lists
const DEPT_MAP: Record<string, string> = {
  "CI": "Artificial Intelligence & Machine Learning",
  "CS": "Computer Science & Engineering",
  "IS": "Information Science & Engineering",
  "EC": "Electronics & Communication Engineering",
  "ME": "Mechanical Engineering",
  "EE": "Electrical & Electronics Engineering",
  "CV": "Civil Engineering"
};
