import React, { useState, useEffect } from 'react';
import {
  ShieldCheck, AlertTriangle, AlertCircle, Camera, Users,
  CheckCircle2, Clock, ArrowLeft, Download, RefreshCw,
  Search, Eye, Activity, Box, Cpu, FileText, ChevronRight,
  Shield, Check, X, Info, Building2, MapPin, Calendar, ExternalLink
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts';

export default function App() {
  const [role, setRole] = useState('monitor'); // 'monitor' | 'admin'
  const [selectedCentreId, setSelectedCentreId] = useState('TC001');
  const [view, setView] = useState('detail'); // 'overview' | 'detail'
  const [centres, setCentres] = useState([]);
  const [centreData, setCentreData] = useState(null);
  const [activeAlertModal, setActiveAlertModal] = useState(null);
  const [actionNote, setActionNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch overview centres list
  const fetchCentres = async () => {
    try {
      const res = await fetch('/api/v1/centres');
      const data = await res.json();
      setCentres(data.centres || []);
    } catch (err) {
      console.error('Error fetching centres:', err);
    }
  };

  // Fetch detail for selected centre
  const fetchCentreDetail = async (id) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/centres/${id}`);
      const data = await res.json();
      setCentreData(data);
    } catch (err) {
      console.error('Error fetching centre detail:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCentres();
    if (selectedCentreId) {
      fetchCentreDetail(selectedCentreId);
    }
    const interval = setInterval(() => {
      fetchCentres();
      if (selectedCentreId) fetchCentreDetail(selectedCentreId);
    }, 2500);
    return () => clearInterval(interval);
  }, [selectedCentreId]);

  // Open full alert detail modal
  const openAlertModal = async (alertId) => {
    try {
      const res = await fetch(`/api/v1/alerts/${alertId}`);
      const data = await res.json();
      setActiveAlertModal(data);
      setActionNote('');
    } catch (err) {
      console.error('Error fetching alert detail:', err);
    }
  };

  // Acknowledge alert
  const handleAcknowledge = async () => {
    if (!actionNote.trim()) {
      alert('Please enter a verification note before acknowledging.');
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch(`/api/v1/alerts/${activeAlertModal.id}/acknowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: actionNote, user: `${role}_officer` })
      });
      if (res.ok) {
        await fetchCentreDetail(selectedCentreId);
        await fetchCentres();
        openAlertModal(activeAlertModal.id);
        setActionNote('');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  // Resolve alert
  const handleResolve = async () => {
    if (!actionNote.trim()) {
      alert('Please enter a resolution note before closing this alert.');
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch(`/api/v1/alerts/${activeAlertModal.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: actionNote, user: `${role}_admin` })
      });
      if (res.ok) {
        await fetchCentreDetail(selectedCentreId);
        await fetchCentres();
        openAlertModal(activeAlertModal.id);
        setActionNote('');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  // Export ministry CSV
  const handleExportCSV = () => {
    window.open(`/api/v1/export/alerts?centre_id=${selectedCentreId || ''}`, '_blank');
  };

  const currentCentre = centreData?.centre || centres[0];
  const complianceScore = currentCentre?.compliance_score ?? 100;
  
  // Executive Government Color Tokens (Non-neon, grounded, high contrast)
  const isHighCompliance = complianceScore >= 90;
  const isMediumCompliance = complianceScore >= 70;
  const scoreBadgeBg = isHighCompliance 
    ? 'bg-emerald-50 text-emerald-800 border-emerald-300' 
    : (isMediumCompliance ? 'bg-amber-50 text-amber-800 border-amber-300' : 'bg-red-50 text-red-800 border-red-300');
  const scoreText = isHighCompliance ? 'text-emerald-700' : (isMediumCompliance ? 'text-amber-700' : 'text-red-700');

  // Prepare attendance chart data
  const chartData = (centreData?.attendance_sessions || []).map((s) => ({
    name: s.session_id.replace('SESS_', ''),
    submitted: s.submitted_count,
    estimated: s.estimated_count,
    median: s.count_median,
    confidence: Math.round(s.confidence * 100)
  }));

  const filteredCentres = centres.filter((c) => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.district.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.state.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 flex flex-col font-sans">
      {/* Official Government Tricolor Header Strip */}
      <div className="h-1.5 w-full flex">
        <div className="h-full w-1/3 bg-[#f97316]"></div>
        <div className="h-full w-1/3 bg-white"></div>
        <div className="h-full w-1/3 bg-[#15803d]"></div>
      </div>

      {/* National Institutional Top Banner */}
      <div className="bg-[#0f2942] text-white px-6 py-2 border-b border-slate-700">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between text-xs gap-1.5">
          <div className="flex items-center space-x-2">
            <span className="font-semibold tracking-wide text-slate-200">भारत सरकार</span>
            <span className="text-slate-400">|</span>
            <span className="text-slate-200">Government of India</span>
            <span className="text-slate-400">|</span>
            <span className="text-slate-300">कौशल विकास एवं उद्यमशीलता मंत्रालय (MSDE)</span>
          </div>
          <div className="flex items-center space-x-3 text-[11px] text-slate-300">
            <span className="flex items-center space-x-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span>NIC Verified Network</span>
            </span>
            <span>•</span>
            <span>DPDP Act, 2023 Compliant</span>
            <span>•</span>
            <span className="text-amber-300 font-medium">PMKVY 4.0 / DDU-GKY</span>
          </div>
        </div>
      </div>

      {/* Main Navigation Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 px-6 py-3.5 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          {/* Logo & Portal Identity */}
          <div 
            className="flex items-center space-x-3.5 cursor-pointer" 
            onClick={() => setView('overview')}
            title="Go to Centres Overview"
          >
            <div className="w-10 h-10 rounded-lg bg-[#1e3a8a] text-white flex items-center justify-center shadow-md border border-blue-900">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2.5">
                <span className="font-black text-xl tracking-tight text-slate-900">
                  KaushalDrishit
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-900 border border-blue-200">
                  कौशल दृष्टि
                </span>
                <span className="hidden sm:inline-block text-[11px] font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                  Govt Inspection Portal
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                National Automated Skilling Infrastructure &amp; Attendance Telemetry System
              </p>
            </div>
          </div>

          {/* Navigation & Controls */}
          <div className="flex items-center space-x-3 w-full md:w-auto justify-between md:justify-end">
            {/* View Tabs */}
            <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200">
              <button
                onClick={() => setView('overview')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${
                  view === 'overview'
                    ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Centres Overview
              </button>
              <button
                onClick={() => setView('detail')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${
                  view === 'detail'
                    ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Inspection Detail
              </button>
            </div>

            {/* Ministry CSV Export */}
            <button
              onClick={handleExportCSV}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-300 text-xs font-semibold text-slate-700 transition shadow-sm"
              title="Download certified CSV audit spreadsheet"
            >
              <Download className="w-3.5 h-3.5 text-blue-700" />
              <span className="hidden sm:inline">Ministry Export (CSV)</span>
              <span className="sm:hidden">Export</span>
            </button>

            {/* Role Switcher */}
            <div className="flex items-center bg-slate-100 border border-slate-300 p-0.5 rounded-lg">
              <span className="text-[11px] text-slate-500 px-2 font-medium">Role:</span>
              <button
                onClick={() => setRole('monitor')}
                className={`px-2.5 py-1 text-xs rounded font-medium transition ${
                  role === 'monitor' 
                    ? 'bg-[#1e3a8a] text-white shadow-xs' 
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Inspector
              </button>
              <button
                onClick={() => setRole('admin')}
                className={`px-2.5 py-1 text-xs rounded font-medium transition ${
                  role === 'admin' 
                    ? 'bg-slate-800 text-white shadow-xs' 
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Directorate
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {/* ========================================================= */}
        {/* VIEW 1: CENTRES OVERVIEW                                  */}
        {/* ========================================================= */}
        {view === 'overview' && (
          <div className="space-y-6">
            {/* KPI Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="gov-card p-5 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between text-slate-600">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Monitored Centres</span>
                  <Building2 className="w-4 h-4 text-blue-700" />
                </div>
                <div className="mt-3 flex items-baseline space-x-2">
                  <span className="text-3xl font-extrabold text-slate-900">{centres.length || 1}</span>
                  <span className="text-xs text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    Active Telemetry
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-2">100% Edge compliance cameras transmitting</p>
              </div>

              <div className="gov-card p-5 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between text-slate-600">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Open Discrepancies</span>
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                </div>
                <div className="mt-3 flex items-baseline space-x-2">
                  <span className="text-3xl font-extrabold text-amber-700">
                    {centres.reduce((acc, c) => acc + (c.open_alerts_count || 0), 0)}
                  </span>
                  <span className="text-xs text-amber-800 font-medium bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                    Requires Review
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-2">Flagged for human-in-the-loop inspector check</p>
              </div>

              <div className="gov-card p-5 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between text-slate-600">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">High-Severity Alerts</span>
                  <AlertCircle className="w-4 h-4 text-red-600" />
                </div>
                <div className="mt-3 flex items-baseline space-x-2">
                  <span className="text-3xl font-extrabold text-red-700">
                    {centres.reduce((acc, c) => acc + (c.high_severity_count || 0), 0)}
                  </span>
                  <span className="text-xs text-red-800 font-medium bg-red-50 px-2 py-0.5 rounded border border-red-200">
                    Action Required
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-2">Overreported headcount or missing equipment</p>
              </div>

              <div className="gov-card p-5 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between text-slate-600">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Avg Compliance Index</span>
                  <Activity className="w-4 h-4 text-blue-700" />
                </div>
                <div className="mt-3 flex items-baseline space-x-2">
                  <span className="text-3xl font-extrabold text-slate-900">
                    {centres.length ? Math.round(centres.reduce((acc, c) => acc + c.compliance_score, 0) / centres.length) : 100}%
                  </span>
                  <span className="text-xs text-slate-700 font-medium bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                    Benchmark: &ge;85%
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-2">National scheme compliance quality threshold</p>
              </div>
            </div>

            {/* Centres Table */}
            <div className="gov-card rounded-xl border border-slate-200 overflow-hidden">
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Registered Vocational Training Centres</h2>
                  <p className="text-xs text-slate-600">Continuous edge inspection feeds streaming telemetry</p>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Filter by centre ID, city, state..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-white border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-blue-600 w-full"
                  />
                </div>
              </div>

              <div className="divide-y divide-slate-200">
                {filteredCentres.length > 0 ? (
                  filteredCentres.map((c) => {
                    const cScore = Math.round(c.compliance_score);
                    const cBadgeClass = cScore >= 90 
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300' 
                      : (cScore >= 70 ? 'bg-amber-50 text-amber-800 border-amber-300' : 'bg-red-50 text-red-800 border-red-300');

                    return (
                      <div
                        key={c.id}
                        onClick={() => { setSelectedCentreId(c.id); setView('detail'); }}
                        className="p-4 flex items-center justify-between hover:bg-slate-50 cursor-pointer transition"
                      >
                        <div className="flex items-center space-x-4">
                          <div className={`w-12 h-12 rounded-lg border font-black text-base flex items-center justify-center ${cBadgeClass}`}>
                            {cScore}%
                          </div>
                          <div>
                            <div className="flex items-center space-x-2">
                              <h3 className="font-bold text-sm text-slate-900 hover:text-blue-700 transition">
                                {c.name}
                              </h3>
                              <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono font-semibold border border-slate-200">
                                {c.id}
                              </span>
                            </div>
                            <p className="text-xs text-slate-600 mt-0.5 flex items-center space-x-1">
                              <MapPin className="w-3 h-3 text-slate-400" />
                              <span>{c.district}, {c.state}</span>
                              <span>•</span>
                              <span>Scheme: {c.scheme}</span>
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center space-x-6">
                          <div className="text-right">
                            <div className="flex items-center space-x-1.5 justify-end">
                              <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                              <span className="text-xs text-slate-700 font-medium">{c.cameras_count || 2} Cameras Active</span>
                            </div>
                            <span className="text-[11px] text-slate-500 font-medium">
                              {c.open_alerts_count || 0} open discrepancies
                            </span>
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-400" />
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-8 text-center text-slate-500 text-xs">
                    No training centres found matching "{searchQuery}".
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* VIEW 2: CENTRE DEEP-DIVE INSPECTION                       */}
        {/* ========================================================= */}
        {view === 'detail' && (
          <div className="space-y-6">
            {/* Centre Profile Banner */}
            <div className="gov-card p-6 rounded-xl border border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <button
                  onClick={() => setView('overview')}
                  className="flex items-center space-x-1 text-xs font-semibold text-blue-700 hover:text-blue-900 mb-2 transition"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Centres Directory</span>
                </button>
                <div className="flex items-center space-x-3">
                  <h1 className="text-xl font-black text-slate-900 tracking-tight">
                    {currentCentre?.name || 'Skill Training Centre Raipur'}
                  </h1>
                  <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-900 text-xs font-mono font-bold border border-blue-200">
                    ID: {currentCentre?.id || 'TC001'}
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span><strong>Location:</strong> {currentCentre?.district}, {currentCentre?.state}</span>
                  <span>•</span>
                  <span><strong>Sanctioned Scheme:</strong> {currentCentre?.scheme}</span>
                  <span>•</span>
                  <span><strong>Contact:</strong> {currentCentre?.contact_email}</span>
                </p>
              </div>

              {/* Compliance Rating Gauge Card */}
              <div className={`px-5 py-3 rounded-xl border flex items-center space-x-4 ${scoreBadgeBg}`}>
                <div className="text-right">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-slate-600">
                    Centre Compliance Index
                  </div>
                  <div className="text-2xl font-black text-slate-900">{complianceScore}%</div>
                </div>
                <div className="w-10 h-10 rounded-full border-2 border-current flex items-center justify-center font-bold text-xs bg-white">
                  {complianceScore >= 90 ? <Check className="w-5 h-5 text-emerald-700" /> : <AlertTriangle className="w-5 h-5 text-amber-700" />}
                </div>
              </div>
            </div>

            {/* LIVE CAMERA TELEMETRY CARD (STREAMED FROM EDGE AGENT) */}
            {centreData?.live_feed?.image && (
              <div className="gov-card p-5 rounded-xl border-2 border-blue-600/30 bg-blue-50/30">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-3 border-b border-slate-200 gap-2">
                  <div className="flex items-center space-x-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 animate-pulse"></span>
                    <h2 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                      <Camera className="w-4 h-4 text-blue-700" />
                      <span>कौशल दृष्टि लाइव कैमरा | KaushalDrishit Live Edge Telemetry</span>
                    </h2>
                    <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-mono font-bold border border-emerald-300">
                      DPDP Act 2023 Compliant
                    </span>
                  </div>
                  <div className="flex items-center space-x-3 text-xs text-slate-600">
                    <span>Camera: <strong className="text-slate-800 font-mono">{centreData.live_feed.camera_id}</strong></span>
                    <span>•</span>
                    <span>Session: <strong className="text-slate-800 font-mono">{centreData.live_feed.session_id}</strong></span>
                    <span>•</span>
                    <span className="text-blue-800 font-bold">Detected Headcount: {centreData.live_feed.estimated_count}</span>
                  </div>
                </div>

                <div className="mt-4 flex flex-col md:flex-row items-center gap-6">
                  {/* Blurred Anonymized Feed */}
                  <div className="relative rounded-lg overflow-hidden border border-slate-300 shadow-sm max-w-sm w-full bg-slate-900">
                    <img
                      src={`data:image/webp;base64,${centreData.live_feed.image}`}
                      alt="KaushalDrishit Live Edge Camera Stream"
                      className="w-full h-48 object-cover"
                    />
                    <div className="absolute top-2 left-2 bg-slate-900/90 text-white px-2 py-0.5 rounded text-[10px] font-mono font-semibold border border-slate-600 flex items-center space-x-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                      <span>TELEMETRY FEED (Zero Biometric Storage)</span>
                    </div>
                  </div>

                  {/* Statutory Telemetry Notes */}
                  <div className="flex-1 space-y-3 w-full">
                    <div className="p-3 rounded-lg bg-white border border-slate-200">
                      <div className="text-xs font-bold text-slate-900">Privacy-by-Design Compliance Statement</div>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                        In strict compliance with Sections 4 and 6 of the <strong>Digital Personal Data Protection Act, 2023</strong>, all computer vision inference and face-blurring executes locally on the edge processor. No raw video streams, biometric facial embeddings, or unblurred imagery leave the training centre premises.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-center">
                      <div className="p-3 rounded-lg bg-white border border-slate-200">
                        <div className="text-[10px] uppercase text-slate-500 font-bold">Visual Headcount (ROI)</div>
                        <div className="text-xl font-extrabold text-blue-800 mt-0.5">
                          {centreData.live_feed.estimated_count} Trainee(s)
                        </div>
                      </div>
                      <div className="p-3 rounded-lg bg-white border border-slate-200">
                        <div className="text-[10px] uppercase text-slate-500 font-bold">Vision Confidence</div>
                        <div className="text-xl font-extrabold text-emerald-700 mt-0.5">
                          {Math.round((centreData.live_feed.confidence || 0.85) * 100)}%
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Attendance Analytics & Discrepancy Chart */}
            <div className="gov-card p-6 rounded-xl border border-slate-200">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between pb-4 border-b border-slate-200 gap-2">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                    <Users className="w-4 h-4 text-blue-700" />
                    <span>Attendance Integrity Audit: Submitted vs. Computer Vision Estimation</span>
                  </h2>
                  <p className="text-xs text-slate-600">Cross-verifies claims submitted on the Skill India Portal against edge vision detections</p>
                </div>
                <div className="flex items-center space-x-4 text-xs font-medium">
                  <span className="flex items-center space-x-1.5 text-slate-700">
                    <span className="w-3 h-3 rounded bg-amber-600"></span>
                    <span>Submitted (Skill India Portal)</span>
                  </span>
                  <span className="flex items-center space-x-1.5 text-slate-700">
                    <span className="w-3 h-3 rounded bg-blue-700"></span>
                    <span>Measured (KaushalDrishit Edge Vision)</span>
                  </span>
                </div>
              </div>

              <div className="mt-6 h-64 w-full">
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="submittedColor" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#d97706" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#d97706" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="estimatedColor" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#1d4ed8" stopOpacity={0.25}/>
                          <stop offset="95%" stopColor="#1d4ed8" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 11 }} />
                      <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{ 
                          backgroundColor: '#ffffff', 
                          borderColor: '#cbd5e1', 
                          borderRadius: '8px',
                          color: '#0f172a',
                          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                        }}
                        itemStyle={{ fontSize: '12px' }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="submitted" 
                        stroke="#d97706" 
                        strokeWidth={2}
                        fillOpacity={1} 
                        fill="url(#submittedColor)" 
                        name="Portal Submitted Trainees" 
                      />
                      <Area 
                        type="monotone" 
                        dataKey="estimated" 
                        stroke="#1d4ed8" 
                        strokeWidth={2}
                        fillOpacity={1} 
                        fill="url(#estimatedColor)" 
                        name="Visual Headcount (YOLO+ByteTrack)" 
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-500 text-xs">
                    No session telemetry received yet. Run the camera edge agent to stream events.
                  </div>
                )}
              </div>
            </div>

            {/* Two-Column Grid: Sanctioned Inventory & Discrepancy Alerts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Sanctioned Inventory Checklist */}
              <div className="gov-card p-6 rounded-xl border border-slate-200 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                    <div>
                      <h2 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                        <Box className="w-4 h-4 text-blue-700" />
                        <span>Sanctioned Infrastructure &amp; Machine Operability</span>
                      </h2>
                      <p className="text-xs text-slate-600">SSIM baseline image verification &amp; active motion auditing</p>
                    </div>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                      {centreData?.inventory?.length || 0} Mandated Items
                    </span>
                  </div>

                  <div className="mt-4 space-y-3">
                    {centreData?.inventory?.map((item) => {
                      const isPresent = item.status === 'present';
                      const isIdle = item.status === 'idle';
                      const isMissing = item.status === 'missing';

                      const statusBadge = isPresent 
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300' 
                        : (isIdle ? 'bg-amber-50 text-amber-800 border-amber-300' : 'bg-red-50 text-red-800 border-red-300');

                      return (
                        <div key={item.id} className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${
                              isPresent ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                              (isIdle ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-red-100 text-red-800 border-red-300')
                            }`}>
                              {item.type === 'machine' ? <Cpu className="w-4 h-4" /> : <Box className="w-4 h-4" />}
                            </div>
                            <div>
                              <div className="flex items-center space-x-2">
                                <span className="text-xs font-bold text-slate-900">{item.name}</span>
                                <span className="text-[10px] font-mono text-slate-500 font-semibold">({item.id})</span>
                              </div>
                              <p className="text-[11px] text-slate-600">
                                Camera: {item.camera_id} • Expected: {item.expected_count} unit(s)
                              </p>
                            </div>
                          </div>

                          <div className="text-right">
                            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${statusBadge}`}>
                              {isPresent ? 'Verified Active' : (isIdle ? 'Apparent Idle' : 'Missing / Altered')}
                            </span>
                            <div className="text-[10px] text-slate-500 mt-1 font-medium">
                              Persistence: &ge;3 Checks
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Compliance Discrepancy Alerts & Audit Trail */}
              <div className="gov-card p-6 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                      <AlertTriangle className="w-4 h-4 text-red-700" />
                      <span>Statutory Discrepancy Alerts</span>
                    </h2>
                    <p className="text-xs text-slate-600">Click any alert to inspect anonymized evidence &amp; audit history</p>
                  </div>
                  <span className="text-xs font-bold px-2 py-0.5 rounded bg-red-100 text-red-800 border border-red-300">
                    {centreData?.alerts?.filter(a => a.status === 'open').length || 0} Open
                  </span>
                </div>

                <div className="mt-4 space-y-3 max-h-96 overflow-y-auto pr-1">
                  {centreData?.alerts?.length > 0 ? (
                    centreData.alerts.map((alert) => {
                      const isHigh = alert.severity === 'high';
                      const isOpen = alert.status === 'open';

                      const alertBorder = isOpen 
                        ? (isHigh ? 'border-red-300 bg-red-50/50' : 'border-amber-300 bg-amber-50/50') 
                        : 'border-slate-200 bg-slate-50 opacity-80';

                      return (
                        <div
                          key={alert.id}
                          onClick={() => openAlertModal(alert.id)}
                          className={`p-3.5 rounded-lg border transition cursor-pointer hover:shadow-sm ${alertBorder}`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-start space-x-2.5">
                              <span className={`w-2 h-2 rounded-full mt-1.5 ${
                                isOpen ? (isHigh ? 'bg-red-600' : 'bg-amber-600') : 'bg-slate-400'
                              }`} />
                              <div>
                                <div className="flex items-center space-x-2">
                                  <span className="text-xs font-bold text-slate-900">{alert.rule}</span>
                                  <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border ${
                                    isHigh ? 'bg-red-100 text-red-800 border-red-200' : 'bg-amber-100 text-amber-800 border-amber-200'
                                  }`}>
                                    {alert.severity}
                                  </span>
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold border ${
                                    isOpen ? 'bg-blue-100 text-blue-900 border-blue-200' : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                  }`}>
                                    {alert.status}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-700 mt-1 leading-relaxed">
                                  {alert.message}
                                </p>
                                <div className="flex items-center space-x-3 mt-2 text-[11px] text-slate-600">
                                  <span>Measured: <strong className="text-slate-800">{alert.measured}</strong></span>
                                  <span>•</span>
                                  <span>Confidence: {Math.round(alert.confidence * 100)}%</span>
                                </div>
                              </div>
                            </div>

                            <button className="text-xs font-bold text-blue-700 hover:text-blue-900 flex items-center space-x-1 shrink-0 pt-1">
                              <Eye className="w-3.5 h-3.5" />
                              <span>Evidence</span>
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-8 text-center text-slate-500 text-xs">
                      <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                      No active alerts. Centre is currently fully compliant with scheme requirements.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ========================================================= */}
      {/* EVIDENCE & HUMAN AUDIT TRAIL MODAL                        */}
      {/* ========================================================= */}
      {activeAlertModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-2xl rounded-xl border border-slate-300 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-bold text-slate-900">{activeAlertModal.rule}</span>
                  <span className="text-[10px] uppercase font-mono font-bold px-2 py-0.5 rounded bg-red-100 text-red-800 border border-red-300">
                    {activeAlertModal.severity} SEVERITY
                  </span>
                  <span className="text-[10px] uppercase font-mono font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-800">
                    STATUS: {activeAlertModal.status}
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-1">Alert ID: {activeAlertModal.id} • Triggered: {activeAlertModal.created_at}</p>
              </div>
              <button
                onClick={() => setActiveAlertModal(null)}
                className="p-1 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 overflow-y-auto flex-1">
              {/* Rule & Mathematical Breakdown */}
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                <div className="text-xs font-medium text-slate-800">{activeAlertModal.message}</div>
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200 text-[11px]">
                  <div>
                    <span className="text-slate-500">Threshold:</span> <span className="text-slate-900 font-mono font-bold">{activeAlertModal.threshold}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Measured:</span> <span className="text-slate-900 font-mono font-bold">{activeAlertModal.measured}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Confidence:</span> <span className="text-emerald-700 font-bold">{Math.round(activeAlertModal.confidence * 100)}%</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Camera / Session:</span> <span className="text-slate-800 font-semibold">{activeAlertModal.camera_id} / {activeAlertModal.session_id}</span>
                  </div>
                </div>
              </div>

              {/* Edge-Anonymized Evidence Thumbnails */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-slate-900 flex items-center space-x-1.5">
                    <Shield className="w-3.5 h-3.5 text-blue-700" />
                    <span>Edge-Anonymized Evidence Thumbnails</span>
                  </h3>
                  <span className="text-[10px] text-slate-500 font-mono font-semibold">Face-Blurred at Edge • DPDP 2023 Compliant</span>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {activeAlertModal.thumbnails && activeAlertModal.thumbnails.length > 0 ? (
                    activeAlertModal.thumbnails.map((thumbB64, idx) => (
                      <div key={idx} className="rounded-lg overflow-hidden border border-slate-300 bg-slate-100 group relative shadow-xs">
                        <img
                          src={`data:image/webp;base64,${thumbB64}`}
                          alt={`Evidence Frame ${idx + 1}`}
                          className="w-full h-28 object-cover"
                        />
                        <div className="absolute bottom-1 right-1 text-[9px] bg-slate-900/80 text-white px-1 rounded font-mono font-semibold">
                          Frame {idx + 1}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="col-span-3 p-6 text-center text-slate-500 text-xs bg-slate-50 rounded-lg border border-slate-200">
                      No thumbnail captured for this event.
                    </div>
                  )}
                </div>
              </div>

              {/* Audit Trail Timeline */}
              <div>
                <h3 className="text-xs font-bold text-slate-900 mb-2 flex items-center space-x-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  <span>Audit Trail &amp; Inspector Verification Notes</span>
                </h3>
                <div className="space-y-2">
                  {activeAlertModal.audit_trail && activeAlertModal.audit_trail.length > 0 ? (
                    activeAlertModal.audit_trail.map((entry, idx) => (
                      <div key={idx} className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                        <div className="flex items-center justify-between text-slate-500 text-[10px]">
                          <span className="font-bold text-slate-800">Action: {entry.action.toUpperCase()} by {entry.user}</span>
                          <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <p className="text-slate-700 mt-1">{entry.note}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-500 italic">No notes logged yet.</p>
                  )}
                </div>
              </div>

              {/* Reviewer Action Form */}
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-3">
                <label className="text-xs font-bold text-slate-800 block">
                  Add Official Inspection Note ({role.toUpperCase()} Role):
                </label>
                <textarea
                  value={actionNote}
                  onChange={(e) => setActionNote(e.target.value)}
                  placeholder={
                    role === 'monitor'
                      ? 'e.g., Telephoned training centre director; verified roster mismatch against biometric device...'
                      : 'e.g., District inspection team dispatched; formal explanation notice issued under scheme guidelines...'
                  }
                  rows={2}
                  className="w-full rounded-lg bg-white border border-slate-300 p-2.5 text-xs text-slate-900 focus:outline-none focus:border-blue-600"
                />

                <div className="flex items-center justify-end space-x-3 pt-1">
                  {activeAlertModal.status === 'open' && (
                    <button
                      onClick={handleAcknowledge}
                      disabled={actionLoading}
                      className="px-3.5 py-1.5 rounded-lg bg-[#1e3a8a] hover:bg-blue-900 text-white text-xs font-semibold transition flex items-center space-x-1 shadow-sm"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Acknowledge Discrepancy</span>
                    </button>
                  )}

                  {role === 'admin' && activeAlertModal.status !== 'resolved' && (
                    <button
                      onClick={handleResolve}
                      disabled={actionLoading}
                      className="px-3.5 py-1.5 rounded-lg bg-[#15803d] hover:bg-green-800 text-white text-xs font-semibold transition flex items-center space-x-1 shadow-sm"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Resolve &amp; Close Audit Alert</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
