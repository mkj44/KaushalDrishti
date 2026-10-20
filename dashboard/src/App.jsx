import React, { useState, useEffect } from 'react';
import {
  ShieldCheck, AlertTriangle, AlertCircle, Camera, Users,
  CheckCircle2, Clock, ArrowLeft, Download, RefreshCw,
  Search, Eye, Activity, Box, Cpu, FileText, ChevronRight,
  Shield, Check, X, Info
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
    }, 6000);
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
  const scoreColor = complianceScore >= 90 ? 'text-emerald-400' : (complianceScore >= 70 ? 'text-amber-400' : 'text-rose-400');
  const scoreBg = complianceScore >= 90 ? 'bg-emerald-500/10 border-emerald-500/30' : (complianceScore >= 70 ? 'bg-amber-500/10 border-amber-500/30' : 'bg-rose-500/10 border-rose-500/30');

  // Prepare attendance chart data
  const chartData = (centreData?.attendance_sessions || []).map((s, idx) => ({
    name: s.session_id.replace('SESS_', ''),
    submitted: s.submitted_count,
    estimated: s.estimated_count,
    median: s.count_median,
    confidence: Math.round(s.confidence * 100)
  }));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Navigation Bar */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-40 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setView('overview')}>
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                SkillSight
              </span>
              <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                Gov Compliance
              </span>
            </div>
            <p className="text-xs text-slate-400">AI Edge Analytics for Skilling Scheme Inspections</p>
          </div>
        </div>

        {/* Center Navigation Toggle */}
        <div className="hidden md:flex items-center space-x-1 bg-slate-800/50 p-1 rounded-lg border border-slate-700/50">
          <button
            onClick={() => setView('overview')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${view === 'overview' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Centres Overview
          </button>
          <button
            onClick={() => setView('detail')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${view === 'detail' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Centre Deep-Dive
          </button>
        </div>

        {/* Right Action Controls */}
        <div className="flex items-center space-x-4">
          <button
            onClick={handleExportCSV}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-200 transition shadow-sm"
          >
            <Download className="w-3.5 h-3.5 text-blue-400" />
            <span>Ministry Export (CSV)</span>
          </button>

          {/* Role Switcher */}
          <div className="flex items-center space-x-1 bg-slate-900 border border-slate-700/70 p-1 rounded-lg">
            <span className="text-[11px] text-slate-400 px-2 font-medium">Role:</span>
            <button
              onClick={() => setRole('monitor')}
              className={`px-2.5 py-1 text-xs rounded font-medium transition ${role === 'monitor' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Monitor
            </button>
            <button
              onClick={() => setRole('admin')}
              className={`px-2.5 py-1 text-xs rounded font-medium transition ${role === 'admin' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Admin
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {/* OVERVIEW VIEW */}
        {view === 'overview' && (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="glass-panel p-5 rounded-2xl">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-xs font-medium uppercase tracking-wider">Monitored Centres</span>
                  <Shield className="w-4 h-4 text-blue-400" />
                </div>
                <div className="mt-3 flex items-baseline space-x-2">
                  <span className="text-3xl font-bold text-white">{centres.length || 1}</span>
                  <span className="text-xs text-emerald-400 font-medium">100% Edge Active</span>
                </div>
              </div>

              <div className="glass-panel p-5 rounded-2xl">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-xs font-medium uppercase tracking-wider">Open Discrepancies</span>
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                </div>
                <div className="mt-3 flex items-baseline space-x-2">
                  <span className="text-3xl font-bold text-amber-400">
                    {centres.reduce((acc, c) => acc + (c.open_alerts_count || 0), 0)}
                  </span>
                  <span className="text-xs text-slate-400">Requires Review</span>
                </div>
              </div>

              <div className="glass-panel p-5 rounded-2xl">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-xs font-medium uppercase tracking-wider">High Severity Alerts</span>
                  <AlertCircle className="w-4 h-4 text-rose-400" />
                </div>
                <div className="mt-3 flex items-baseline space-x-2">
                  <span className="text-3xl font-bold text-rose-400">
                    {centres.reduce((acc, c) => acc + (c.high_severity_count || 0), 0)}
                  </span>
                  <span className="text-xs text-rose-400/80 font-medium">Critical</span>
                </div>
              </div>

              <div className="glass-panel p-5 rounded-2xl">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-xs font-medium uppercase tracking-wider">Avg Compliance Score</span>
                  <Activity className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="mt-3 flex items-baseline space-x-2">
                  <span className="text-3xl font-bold text-emerald-400">
                    {centres.length ? Math.round(centres.reduce((acc, c) => acc + c.compliance_score, 0) / centres.length) : 100}%
                  </span>
                  <span className="text-xs text-slate-400">PMKVY Target: &gt;85%</span>
                </div>
              </div>
            </div>

            {/* Centres List */}
            <div className="glass-panel rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-200">Registered Training Centres</h2>
                  <p className="text-xs text-slate-400">Centres streaming edge compliance signals</p>
                </div>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search centre, district..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-slate-900 border border-slate-700/80 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 w-60"
                  />
                </div>
              </div>

              <div className="divide-y divide-slate-800/60">
                {centres.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => { setSelectedCentreId(c.id); setView('detail'); }}
                    className="p-4 flex items-center justify-between hover:bg-slate-800/40 cursor-pointer transition"
                  >
                    <div className="flex items-center space-x-4">
                      <div className={`w-12 h-12 rounded-xl border flex items-center justify-center font-bold text-base ${scoreBg} ${scoreColor}`}>
                        {Math.round(c.compliance_score)}%
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <h3 className="font-semibold text-sm text-slate-100">{c.name}</h3>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                            {c.id}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">{c.district}, {c.state} • Scheme: {c.scheme}</p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-6">
                      <div className="text-right">
                        <div className="flex items-center space-x-1.5 justify-end">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                          <span className="text-xs text-slate-300 font-medium">{c.cameras_count || 2} Cameras Active</span>
                        </div>
                        <span className="text-[11px] text-slate-400">{c.open_alerts_count || 0} open discrepancies</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-500" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* CENTRE DEEP-DIVE VIEW */}
        {view === 'detail' && (
          <div className="space-y-6">
            {/* Header with Centre Profile & Compliance Banner */}
            <div className="glass-panel p-6 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <button
                  onClick={() => setView('overview')}
                  className="flex items-center space-x-1 text-xs text-blue-400 hover:text-blue-300 mb-2 transition"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Centres Overview</span>
                </button>
                <div className="flex items-center space-x-3">
                  <h1 className="text-xl font-bold text-white tracking-tight">
                    {currentCentre?.name || 'Skill Training Centre Raipur'}
                  </h1>
                  <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 text-xs font-mono font-medium">
                    {currentCentre?.id || 'TC001'}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Location: {currentCentre?.district}, {currentCentre?.state} • Scheme: {currentCentre?.scheme} • Contact: {currentCentre?.contact_email}
                </p>
              </div>

              {/* Live Compliance Score Gauge */}
              <div className={`px-5 py-3 rounded-2xl border flex items-center space-x-4 ${scoreBg}`}>
                <div className="text-right">
                  <div className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">Centre Compliance Index</div>
                  <div className={`text-2xl font-black ${scoreColor}`}>{complianceScore}%</div>
                </div>
                <div className="w-10 h-10 rounded-full border-2 border-current flex items-center justify-center font-bold text-xs">
                  {complianceScore >= 90 ? <Check className="w-5 h-5 text-emerald-400" /> : <AlertTriangle className="w-5 h-5 text-amber-400" />}
                </div>
              </div>
            </div>

            {/* Attendance Analytics & Discrepancy Chart */}
            <div className="glass-panel p-6 rounded-2xl">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between pb-4 border-b border-slate-800/80 gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-slate-200 flex items-center space-x-2">
                    <Users className="w-4 h-4 text-blue-400" />
                    <span>Attendance Compliance: Submitted vs Visual Estimation</span>
                  </h2>
                  <p className="text-xs text-slate-400">Cross-checks portal claims against edge-estimated headcount</p>
                </div>
                <div className="flex items-center space-x-4 text-xs">
                  <span className="flex items-center space-x-1.5 text-slate-300">
                    <span className="w-3 h-3 rounded bg-amber-500/30 border border-amber-500"></span>
                    <span>Submitted (Portal)</span>
                  </span>
                  <span className="flex items-center space-x-1.5 text-slate-300">
                    <span className="w-3 h-3 rounded bg-blue-500/30 border border-blue-500"></span>
                    <span>Estimated (YOLO+ByteTrack)</span>
                  </span>
                </div>
              </div>

              <div className="mt-6 h-64 w-full">
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="submittedColor" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="estimatedColor" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 11 }} />
                      <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }}
                        itemStyle={{ fontSize: '12px' }}
                      />
                      <Area type="monotone" dataKey="submitted" stroke="#f59e0b" fillOpacity={1} fill="url(#submittedColor)" name="Submitted Trainees" />
                      <Area type="monotone" dataKey="estimated" stroke="#3b82f6" fillOpacity={1} fill="url(#estimatedColor)" name="Estimated Trainees" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-500 text-xs">
                    No session data received yet. Run edge agent to stream events.
                  </div>
                )}
              </div>
            </div>

            {/* Two-Column Layout: Inventory Checklist & Discrepancy Alerts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Sanctioned Inventory Checklist */}
              <div className="glass-panel p-6 rounded-2xl flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                    <div>
                      <h2 className="text-sm font-semibold text-slate-200 flex items-center space-x-2">
                        <Box className="w-4 h-4 text-purple-400" />
                        <span>Sanctioned Inventory &amp; Operability</span>
                      </h2>
                      <p className="text-xs text-slate-400">Baseline SSIM verification and apparent operability</p>
                    </div>
                    <span className="text-xs text-slate-400">
                      {centreData?.inventory?.length || 0} Sanctioned Items
                    </span>
                  </div>

                  <div className="mt-4 space-y-3">
                    {centreData?.inventory?.map((item) => {
                      const isPresent = item.status === 'present';
                      const isIdle = item.status === 'idle';
                      const isMissing = item.status === 'missing';

                      return (
                        <div key={item.id} className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800/80 flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                              isPresent ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                              (isIdle ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20')
                            }`}>
                              {item.type === 'machine' ? <Cpu className="w-4 h-4" /> : <Box className="w-4 h-4" />}
                            </div>
                            <div>
                              <div className="flex items-center space-x-2">
                                <span className="text-xs font-semibold text-slate-200">{item.name}</span>
                                <span className="text-[10px] font-mono text-slate-400">({item.id})</span>
                              </div>
                              <p className="text-[11px] text-slate-400">
                                Camera: {item.camera_id} • Expected: {item.expected_count} unit(s)
                              </p>
                            </div>
                          </div>

                          <div className="text-right">
                            <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md border ${
                              isPresent ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                              (isIdle ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' : 'bg-rose-500/10 text-rose-400 border-rose-500/30')
                            }`}>
                              {isPresent ? 'Verified Active' : (isIdle ? 'Apparent Idle' : 'Missing / Altered')}
                            </span>
                            <div className="text-[10px] text-slate-500 mt-1">
                              Persistence: ≥3 checks
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Live Discrepancy Alerts & Audit Timeline */}
              <div className="glass-panel p-6 rounded-2xl">
                <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-200 flex items-center space-x-2">
                      <AlertTriangle className="w-4 h-4 text-rose-400" />
                      <span>Compliance Discrepancy Alerts</span>
                    </h2>
                    <p className="text-xs text-slate-400">Click any alert to inspect anonymized evidence &amp; audit trail</p>
                  </div>
                  <span className="text-xs font-medium px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
                    {centreData?.alerts?.filter(a => a.status === 'open').length || 0} Open
                  </span>
                </div>

                <div className="mt-4 space-y-3 max-h-96 overflow-y-auto pr-1">
                  {centreData?.alerts?.length > 0 ? (
                    centreData.alerts.map((alert) => {
                      const isHigh = alert.severity === 'high';
                      const isOpen = alert.status === 'open';

                      return (
                        <div
                          key={alert.id}
                          onClick={() => openAlertModal(alert.id)}
                          className={`p-3.5 rounded-xl border transition cursor-pointer glass-panel-hover ${
                            isOpen ? (isHigh ? 'bg-rose-950/20 border-rose-800/40' : 'bg-amber-950/20 border-amber-800/40') : 'bg-slate-900/60 border-slate-800/60 opacity-75'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-start space-x-2.5">
                              <span className={`w-2 h-2 rounded-full mt-1.5 ${
                                isOpen ? (isHigh ? 'bg-rose-400 animate-pulse' : 'bg-amber-400') : 'bg-slate-500'
                              }`} />
                              <div>
                                <div className="flex items-center space-x-2">
                                  <span className="text-xs font-bold text-slate-100">{alert.rule}</span>
                                  <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.2 rounded ${
                                    isHigh ? 'bg-rose-500/20 text-rose-300' : 'bg-amber-500/20 text-amber-300'
                                  }`}>
                                    {alert.severity}
                                  </span>
                                  <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                                    isOpen ? 'bg-blue-500/20 text-blue-300' : 'bg-emerald-500/20 text-emerald-300'
                                  }`}>
                                    {alert.status}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                                  {alert.message}
                                </p>
                                <div className="flex items-center space-x-3 mt-2 text-[11px] text-slate-400">
                                  <span>Measured: <strong className="text-slate-300">{alert.measured}</strong></span>
                                  <span>•</span>
                                  <span>Conf: {Math.round(alert.confidence * 100)}%</span>
                                </div>
                              </div>
                            </div>

                            <button className="text-xs text-blue-400 hover:text-blue-300 flex items-center space-x-1 shrink-0 pt-1">
                              <Eye className="w-3.5 h-3.5" />
                              <span>Evidence</span>
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-8 text-center text-slate-500 text-xs">
                      <CheckCircle2 className="w-8 h-8 text-emerald-500/40 mx-auto mb-2" />
                      No active alerts. Centre is currently fully compliant.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* EVIDENCE & AUDIT TRAIL MODAL */}
      {activeAlertModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-2xl rounded-2xl border border-slate-700 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-bold text-white">{activeAlertModal.rule}</span>
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                    {activeAlertModal.severity} SEVERITY
                  </span>
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                    STATUS: {activeAlertModal.status}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">Alert ID: {activeAlertModal.id} • Triggered: {activeAlertModal.created_at}</p>
              </div>
              <button
                onClick={() => setActiveAlertModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 overflow-y-auto flex-1">
              {/* Rule & Details */}
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                <div className="text-xs text-slate-300">{activeAlertModal.message}</div>
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/80 text-[11px]">
                  <div>
                    <span className="text-slate-500">Threshold:</span> <span className="text-slate-300 font-mono">{activeAlertModal.threshold}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Measured:</span> <span className="text-slate-300 font-mono">{activeAlertModal.measured}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Confidence:</span> <span className="text-emerald-400 font-semibold">{Math.round(activeAlertModal.confidence * 100)}%</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Camera / Session:</span> <span className="text-slate-300">{activeAlertModal.camera_id} / {activeAlertModal.session_id}</span>
                  </div>
                </div>
              </div>

              {/* Anonymized Blurred Evidence Thumbnails */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold text-slate-200 flex items-center space-x-1.5">
                    <Shield className="w-3.5 h-3.5 text-blue-400" />
                    <span>Edge-Anonymized Evidence Thumbnails</span>
                  </h3>
                  <span className="text-[10px] text-slate-400 font-mono">Face-Blurred at Edge • DPDP 2023 Compliant</span>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {activeAlertModal.thumbnails && activeAlertModal.thumbnails.length > 0 ? (
                    activeAlertModal.thumbnails.map((thumbB64, idx) => (
                      <div key={idx} className="rounded-lg overflow-hidden border border-slate-800 bg-slate-900 group relative">
                        <img
                          src={`data:image/webp;base64,${thumbB64}`}
                          alt={`Evidence Frame ${idx + 1}`}
                          className="w-full h-28 object-cover"
                        />
                        <div className="absolute bottom-1 right-1 text-[9px] bg-black/70 px-1 rounded text-slate-300 font-mono">
                          Frame {idx + 1}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="col-span-3 p-6 text-center text-slate-500 text-xs bg-slate-900 rounded-lg">
                      No thumbnail captured for this event.
                    </div>
                  )}
                </div>
              </div>

              {/* Audit Trail Timeline */}
              <div>
                <h3 className="text-xs font-semibold text-slate-200 mb-2 flex items-center space-x-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>Audit Trail &amp; Human Inspection Notes</span>
                </h3>
                <div className="space-y-2">
                  {activeAlertModal.audit_trail?.map((entry, idx) => (
                    <div key={idx} className="p-3 rounded-lg bg-slate-900/60 border border-slate-800/80 text-xs">
                      <div className="flex items-center justify-between text-slate-400 text-[10px]">
                        <span className="font-semibold text-slate-300">Action: {entry.action.toUpperCase()} by {entry.user}</span>
                        <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <p className="text-slate-300 mt-1">{entry.note}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Reviewer Action Form */}
              <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3">
                <label className="text-xs font-semibold text-slate-300 block">
                  Add Reviewer Inspection Note ({role.toUpperCase()} Role):
                </label>
                <textarea
                  value={actionNote}
                  onChange={(e) => setActionNote(e.target.value)}
                  placeholder={
                    role === 'monitor'
                      ? 'e.g. Telephoned centre director; verified trainee roster mismatch...'
                      : 'e.g. Official physical verification completed; warning notice issued...'
                  }
                  rows={2}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 p-2.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                />

                <div className="flex items-center justify-end space-x-3 pt-1">
                  {activeAlertModal.status === 'open' && (
                    <button
                      onClick={handleAcknowledge}
                      disabled={actionLoading}
                      className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition flex items-center space-x-1"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Acknowledge Discrepancy</span>
                    </button>
                  )}

                  {role === 'admin' && activeAlertModal.status !== 'resolved' && (
                    <button
                      onClick={handleResolve}
                      disabled={actionLoading}
                      className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition flex items-center space-x-1"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Resolve &amp; Close Alert</span>
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
