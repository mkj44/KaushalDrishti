import React, { Suspense, lazy, useMemo, useState } from 'react';
import { Search, ChevronRight, Film } from 'lucide-react';
import { ScoreDial, Pill } from '../components/ui.jsx';
import { demoClassroom } from '../components/layout.js';

const Room3D = lazy(() => import('../components/Room3D.jsx'));

export default function Overview({ centres, centreData, onOpenCentre, onAnalyse }) {
  const [q, setQ] = useState('');

  const sessions = centreData?.attendance_sessions || [];
  const last = sessions[sessions.length - 1];
  const claimed = last?.submitted_count ?? 18;
  const measured = centreData?.live_feed?.estimated_count ?? last?.estimated_count ?? 14;
  const scene = useMemo(() => demoClassroom(Math.min(24, measured)), [measured]);

  const openAlerts = centres.reduce((a, c) => a + (c.open_alerts_count || 0), 0);
  const high = centres.reduce((a, c) => a + (c.high_severity_count || 0), 0);
  const avg = centres.length ? Math.round(centres.reduce((a, c) => a + c.compliance_score, 0) / centres.length) : 100;
  const cams = centres.reduce((a, c) => a + (c.cameras_count || 0), 0);

  const shown = centres.filter((c) =>
    [c.name, c.id, c.district, c.state].some((v) => (v || '').toLowerCase().includes(q.toLowerCase())),
  );

  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <h1 id="hero-title">Every claimed trainee, checked against the room.</h1>
          <p>
            KaushalDrishti counts the people, chairs and equipment the cameras actually see and lines them up with
            attendance submitted on the Skill India portal.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={onAnalyse}><Film size={17} aria-hidden="true" /> Analyse a recording</button>
            {centreData?.centre && (
              <button className="btn" onClick={() => onOpenCentre(centreData.centre.id)}>Open {centreData.centre.id} inspection</button>
            )}
          </div>
          <div className="ledger">
            <div className="claimed">
              <span className="small muted">Claimed on portal</span>
              <span className="num">{claimed}</span>
            </div>
            <div className="measured">
              <span className="small muted">Seen by camera</span>
              <span className="num">{measured}</span>
            </div>
          </div>
          <p className="small faint">Latest session at {centreData?.centre?.name || 'the selected centre'}.</p>
        </div>
        <div className="hero-stage">
          <Suspense fallback={null}>
            <Room3D items={scene} label={`Model classroom with ${measured} trainees seated`} />
          </Suspense>
          <div className="stage-caption">
            <div className="legend" aria-hidden="true">
              <span><i style={{ background: 'var(--measured)' }} />Trainee</span>
              <span><i style={{ background: 'var(--verified)' }} />Occupied chair</span>
              <span><i style={{ background: '#8fbfa5' }} />Empty chair</span>
            </div>
            <span>Drag to turn the model</span>
          </div>
        </div>
      </section>

      <div className="kpis">
        <div className="kpi"><span className="small muted">Centres monitored</span><span className="num">{centres.length}</span><p>{cams} cameras reporting</p></div>
        <div className="kpi"><span className="small muted">Open discrepancies</span><span className="num" style={{ color: openAlerts ? 'var(--claimed)' : undefined }}>{openAlerts}</span><p>Waiting for an inspector</p></div>
        <div className="kpi"><span className="small muted">High severity</span><span className="num" style={{ color: high ? 'var(--danger)' : undefined }}>{high}</span><p>Inflated headcount or missing items</p></div>
        <div className="kpi"><span className="small muted">Average compliance</span><span className="num">{avg}</span><p>Scheme benchmark is 85</p></div>
      </div>

      <section className="panel" aria-labelledby="centres-title">
        <div className="panel-head panel-pad" style={{ marginBottom: 0 }}>
          <div>
            <h2 id="centres-title">Training centres</h2>
            <p>Select a centre to review its sessions, equipment and alerts.</p>
          </div>
          <label className="search">
            <Search size={15} aria-hidden="true" />
            <input type="search" placeholder="Search by name, ID or district" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search centres" />
          </label>
        </div>
        {shown.length ? shown.map((c) => (
          <button key={c.id} className="centre-row" onClick={() => onOpenCentre(c.id)}>
            <ScoreDial score={c.compliance_score} />
            <div style={{ minWidth: 0 }}>
              <h3>{c.name}</h3>
              <p className="small muted">{c.id}, {c.district}, {c.state}. {c.scheme}</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              {c.open_alerts_count
                ? <Pill tone={c.high_severity_count ? 'bad' : 'warn'}>{c.open_alerts_count} open</Pill>
                : <Pill tone="ok">No open alerts</Pill>}
              <p className="small faint" style={{ marginTop: 4 }}>{c.cameras_count} cameras</p>
            </div>
            <ChevronRight size={18} className="faint" aria-hidden="true" />
          </button>
        )) : (
          <p className="empty">{centres.length ? `No centre matches "${q}".` : 'No centres yet. Start the API to load TC001 from configs/.'}</p>
        )}
      </section>
    </>
  );
}
