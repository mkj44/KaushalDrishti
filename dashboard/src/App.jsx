import React, { useCallback, useEffect, useState } from 'react';
import { LayoutGrid, ClipboardCheck, Film, Download } from 'lucide-react';
import Overview from './pages/Overview.jsx';
import Inspection from './pages/Inspection.jsx';
import Analyse from './pages/Analyse.jsx';
import AlertModal from './components/AlertModal.jsx';

const PAGES = [
  { id: 'overview', label: 'Centres', icon: LayoutGrid },
  { id: 'inspection', label: 'Inspection', icon: ClipboardCheck },
  { id: 'analyse', label: 'Analyse footage', icon: Film },
];

export default function App() {
  const [page, setPage] = useState(() => (location.hash.replace('#', '') || 'overview'));
  const [role, setRole] = useState('monitor');
  const [centres, setCentres] = useState([]);
  const [selectedId, setSelectedId] = useState('TC001');
  const [centreData, setCentreData] = useState(null);
  const [alertId, setAlertId] = useState(null);
  const [apiDown, setApiDown] = useState(false);

  const go = (id) => { setPage(id); history.replaceState(null, '', `#${id}`); window.scrollTo({ top: 0 }); };

  const refresh = useCallback(async () => {
    try {
      const [cRes, dRes] = await Promise.all([
        fetch('/api/v1/centres'),
        selectedId ? fetch(`/api/v1/centres/${selectedId}`) : null,
      ]);
      if (!cRes.ok) throw new Error('api');
      setCentres((await cRes.json()).centres || []);
      if (dRes?.ok) setCentreData(await dRes.json());
      setApiDown(false);
    } catch {
      setApiDown(true);
    }
  }, [selectedId]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [refresh]);

  const openCentre = (id) => { setSelectedId(id); go('inspection'); };

  return (
    <div className="shell">
      <aside className="rail">
        <div className="tricolour" aria-hidden="true">
          <span style={{ background: '#e07a10' }} /><span style={{ background: '#ffffff' }} /><span style={{ background: '#1e7a4c' }} />
        </div>
        <div className="wordmark">
          <span className="deva" lang="hi">कौशल दृष्टि</span>
          <span className="latin">KaushalDrishti</span>
        </div>
        <nav className="nav" aria-label="Main">
          {PAGES.map(({ id, label, icon: Icon }) => (
            <button key={id} aria-current={page === id ? 'page' : undefined} onClick={() => go(id)} title={label}>
              <Icon size={18} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="rail-foot">
          <div>
            <div className="faint-note" style={{ marginBottom: 6 }}>Signed in as</div>
            <div className="role-toggle" role="group" aria-label="Role">
              <button aria-pressed={role === 'monitor'} onClick={() => setRole('monitor')}>Inspector</button>
              <button aria-pressed={role === 'admin'} onClick={() => setRole('admin')}>Directorate</button>
            </div>
          </div>
          <a className="btn btn-ghost" style={{ color: '#b7c2d6', justifyContent: 'flex-start', padding: '6px 0' }}
            href={`/api/v1/export/alerts?centre_id=${selectedId || ''}`} target="_blank" rel="noreferrer">
            <Download size={16} aria-hidden="true" /> <span className="faint-note">Export alerts (CSV)</span>
          </a>
          <p className="faint-note">MSDE skilling schemes. Faces are blurred on site before any image is stored.</p>
        </div>
      </aside>

      <main className="main">
        {apiDown && (
          <div className="insight insight-warn" style={{ marginBottom: 20 }} role="status">
            Can't reach the compliance API on port 8000. Start it with <code>./start_services.sh</code>, then this page refreshes on its own.
          </div>
        )}
        {page === 'overview' && (
          <Overview centres={centres} centreData={centreData} onOpenCentre={openCentre} onAnalyse={() => go('analyse')} />
        )}
        {page === 'inspection' && (
          <Inspection centreData={centreData} centres={centres} selectedId={selectedId} onSelect={setSelectedId} onOpenAlert={setAlertId} onAnalyse={() => go('analyse')} />
        )}
        {page === 'analyse' && <Analyse centres={centres} onFiled={(id) => { refresh(); openCentre(id); }} />}
      </main>

      {alertId && <AlertModal alertId={alertId} role={role} onClose={() => setAlertId(null)} onChanged={refresh} />}
    </div>
  );
}
