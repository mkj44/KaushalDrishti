import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Upload, AlertTriangle, Info, CheckCircle2, RotateCcw, FileCheck2 } from 'lucide-react';
import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { layoutToWorld } from '../components/layout.js';
import { fmtSecs, fmtTime } from '../components/ui.jsx';

const Room3D = lazy(() => import('../components/Room3D.jsx'));

const OBJ_COLOURS = { person: 'var(--measured)', chair: 'var(--verified)', table: '#b98a55', bench: '#b98a55', monitor: 'var(--ink)', laptop: 'var(--ink)' };
const INSIGHT_ICON = { warn: AlertTriangle, info: Info, ok: CheckCircle2 };
const ACCEPT = '.mp4,.mov,.avi,.mkv,.webm,.m4v,video/*';

export default function Analyse({ centres, onFiled }) {
  const [phase, setPhase] = useState('idle'); // idle | uploading | processing | done | failed
  const [file, setFile] = useState(null);
  const [uploadPct, setUploadPct] = useState(0);
  const [job, setJob] = useState(null);
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(false);
  const [view, setView] = useState('model');
  const [history, setHistory] = useState([]);
  const inputRef = useRef();

  const loadHistory = () => fetch('/api/v1/analyze/jobs').then((r) => r.json()).then((d) => setHistory(d.jobs || [])).catch(() => {});
  useEffect(() => { loadHistory(); }, []);

  // poll the job while it runs
  useEffect(() => {
    if (phase !== 'processing' || !job?.id) return;
    const t = setInterval(async () => {
      const res = await fetch(`/api/v1/analyze/jobs/${job.id}`);
      if (!res.ok) return;
      const j = await res.json();
      setJob(j);
      if (j.status === 'completed') { setPhase('done'); loadHistory(); }
      if (j.status === 'failed') { setPhase('failed'); setError(j.error || 'Analysis stopped.'); }
    }, 900);
    return () => clearInterval(t);
  }, [phase, job?.id]);

  const start = (f) => {
    if (!f) return;
    setFile(f); setError(''); setUploadPct(0); setPhase('uploading'); setView('model');
    const xhr = new XMLHttpRequest();
    const fd = new FormData();
    fd.append('file', f);
    xhr.upload.onprogress = (e) => e.lengthComputable && setUploadPct(e.loaded / e.total);
    xhr.onload = () => {
      let body = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
      if (xhr.status === 202) { setJob({ id: body.job_id, status: 'queued', progress: 0, stage: 'Queued' }); setPhase('processing'); }
      else { setPhase('failed'); setError(body.detail || `Upload was rejected (HTTP ${xhr.status}).`); }
    };
    xhr.onerror = () => { setPhase('failed'); setError('Upload failed. Check the API is running on port 8000.'); };
    xhr.open('POST', '/api/v1/analyze/video');
    xhr.send(fd);
  };

  const openPast = async (id) => {
    const res = await fetch(`/api/v1/analyze/jobs/${id}`);
    if (!res.ok) return;
    const j = await res.json();
    setJob(j); setFile({ name: j.filename }); setError('');
    setPhase(j.status === 'completed' ? 'done' : j.status === 'failed' ? 'failed' : 'processing');
  };

  const reset = () => { setPhase('idle'); setJob(null); setFile(null); setError(''); };

  const r = job?.result;
  const worldItems = useMemo(() => layoutToWorld(r?.layout?.items || []), [r]);
  const repFrame = r?.keyframes?.find((k) => k.representative) || r?.keyframes?.[0];
  const busy = phase === 'uploading' || phase === 'processing';
  const progress = phase === 'uploading' ? uploadPct * 0.1 : (job?.progress ?? 0) * 0.9 + 0.1;

  const onDrop = (e) => { e.preventDefault(); setDrag(false); if (!busy) start(e.dataTransfer.files?.[0]); };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Analyse footage</h1>
          <p>Upload a recording from a classroom or workshop. We count the people, chairs, desks and screens in it and rebuild the room so you can check it against what the centre claimed.</p>
        </div>
        {phase === 'done' && <button className="btn" onClick={reset}><RotateCcw size={16} aria-hidden="true" /> Analyse another video</button>}
      </div>

      <div className="analyse">
        <div className="stack">
          <div
            className={`room-stage${drag ? ' drag' : ''}`}
            onDragOver={(e) => { e.preventDefault(); if (!busy) setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
          >
            {phase === 'done' && (
              <div className="view-toggle" role="group" aria-label="Room view">
                <button aria-pressed={view === 'model'} onClick={() => setView('model')}>3D model</button>
                <button aria-pressed={view === 'heat'} onClick={() => setView('heat')}>Movement</button>
                <button aria-pressed={view === 'frame'} onClick={() => setView('frame')}>Camera frame</button>
              </div>
            )}

            {view === 'frame' && phase === 'done' && repFrame ? (
              <img src={`data:image/jpeg;base64,${repFrame.image}`} alt={`Face-blurred frame at ${fmtSecs(repFrame.t)} with detections outlined`}
                style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#14213d' }} />
            ) : (
              <Suspense fallback={null}>
                <Room3D
                  items={phase === 'done' ? (view === 'heat' ? worldItems.filter((i) => i.category !== 'person') : worldItems) : []}
                  rawItems={r?.layout?.items}
                  heatmap={phase === 'done' && view === 'heat' ? r?.heatmap : null}
                  scanning={busy}
                  autoRotate={phase !== 'idle'}
                  label={phase === 'done' ? `Reconstructed room with ${r.summary.people_median} people and ${r.summary.chairs} chairs` : 'Empty room model'}
                />
              </Suspense>
            )}

            {(phase === 'idle' || phase === 'failed') && (
              <div className="dropzone">
                <div className="dropzone-inner">
                  <h2>{phase === 'failed' ? 'That video could not be analysed' : 'Drop a classroom video here'}</h2>
                  <p className="muted">{phase === 'failed' ? error : 'MP4, MOV, AVI, MKV or WEBM up to 500 MB. A fixed camera covering the whole room gives the best counts.'}</p>
                  <button className="btn btn-primary" onClick={() => inputRef.current?.click()}><Upload size={17} aria-hidden="true" /> {phase === 'failed' ? 'Choose another video' : 'Choose a video'}</button>
                  <input ref={inputRef} type="file" accept={ACCEPT} hidden onChange={(e) => start(e.target.files?.[0])} />
                  <p className="small faint">The video is deleted from the server once analysis finishes. Saved frames have faces blurred.</p>
                </div>
              </div>
            )}

            {busy && (
              <div className="scanbar" role="status" aria-live="polite">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <strong>{phase === 'uploading' ? `Uploading ${file?.name}` : job?.stage || 'Starting'}</strong>
                  <span className="num">{Math.round(progress * 100)}%</span>
                </div>
                <div className="progress"><div style={{ width: `${progress * 100}%` }} /></div>
                <p className="small faint" style={{ marginTop: 8 }}>Detection runs on the server CPU, so a long video can take a few minutes.</p>
              </div>
            )}

            {phase === 'done' && view !== 'frame' && (
              <div className="stage-caption">
                <div className="legend" aria-hidden="true">
                  {view === 'heat'
                    ? <span><i style={{ background: 'var(--claimed)' }} />Where people spent time</span>
                    : <><span><i style={{ background: 'var(--measured)' }} />Person</span><span><i style={{ background: 'var(--verified)' }} />Occupied chair</span><span><i style={{ background: '#8fbfa5' }} />Empty chair</span><span><i style={{ background: '#d8b688' }} />Desk</span></>}
                </div>
                <span>Positions are approximate, from a single camera</span>
              </div>
            )}
          </div>

          {phase === 'done' && (
            <>
              <section className="panel panel-pad" aria-labelledby="tl-title">
                <div className="panel-head">
                  <div>
                    <h2 id="tl-title">Headcount through the video</h2>
                    <p>People and chairs detected in each sampled frame.</p>
                  </div>
                </div>
                <div style={{ height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={r.timeline} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                      <CartesianGrid stroke="#dde3e9" vertical={false} />
                      <XAxis dataKey="t" tickFormatter={fmtSecs} tick={{ fontSize: 12, fill: '#46536b' }} axisLine={{ stroke: '#c3ccd5' }} tickLine={false} minTickGap={30} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#46536b' }} axisLine={false} tickLine={false} />
                      <Tooltip labelFormatter={(t) => `At ${fmtSecs(t)}`} contentStyle={{ background: '#f6f8f9', border: '1px solid #c3ccd5', borderRadius: 8, fontSize: 13 }} />
                      <Area type="stepAfter" dataKey="people" name="People" stroke="#5a3fb0" strokeWidth={2} fill="#5a3fb0" fillOpacity={0.14} />
                      <Line type="stepAfter" dataKey="chairs" name="Chairs" stroke="#1e7a4c" strokeWidth={2} dot={false} />
                      <Line type="stepAfter" dataKey="occupied" name="Occupied chairs" stroke="#1e7a4c" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section className="panel panel-pad" aria-labelledby="kf-title">
                <div className="panel-head">
                  <div>
                    <h2 id="kf-title">Evidence frames</h2>
                    <p>Faces blurred, detections outlined.</p>
                  </div>
                </div>
                <div className="frames">
                  {r.keyframes.map((k, i) => (
                    <figure key={i}>
                      <img src={`data:image/jpeg;base64,${k.image}`} alt={`Frame at ${fmtSecs(k.t)} showing ${k.people} people`} />
                      <figcaption>{fmtSecs(k.t)}, {k.people} people{k.representative ? ', used for the 3D model' : ''}</figcaption>
                    </figure>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>

        <aside className="stack">
          {phase === 'done' ? <Results r={r} job={job} centres={centres} onFiled={onFiled} /> : (
            <section className="panel panel-pad">
              <h2>What you'll get</h2>
              <ul className="muted" style={{ margin: '12px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <li>Typical, peak and unique headcount, tracked across the video</li>
                <li>Chairs, desks, benches, monitors and laptops, with seat occupancy</li>
                <li>A 3D model of the room and a map of where people moved</li>
                <li>Blurred evidence frames you can file against a centre as a session</li>
              </ul>
            </section>
          )}

          {history.length > 0 && (
            <section className="panel panel-pad" aria-labelledby="hist-title">
              <h2 id="hist-title" style={{ marginBottom: 10 }}>Recent analyses</h2>
              {history.map((h) => (
                <button key={h.id} className="history-item" onClick={() => openPast(h.id)} aria-current={h.id === job?.id ? 'true' : undefined}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.filename}</div>
                    <div className="small faint">{fmtTime(h.created_at)}</div>
                  </div>
                  <span className="small muted" style={{ whiteSpace: 'nowrap' }}>
                    {h.status === 'completed' ? `${h.summary.people_median} people` : h.status === 'failed' ? 'Failed' : `${Math.round(h.progress * 100)}%`}
                  </span>
                </button>
              ))}
            </section>
          )}
        </aside>
      </div>
    </>
  );
}

function Results({ r, job, centres, onFiled }) {
  const s = r.summary;
  const maxObj = Math.max(...r.objects.map((o) => o.estimated), 1);
  const [centreId, setCentreId] = useState(centres[0]?.id || 'TC001');
  const [claimed, setClaimed] = useState('');
  const [filing, setFiling] = useState(false);
  const [msg, setMsg] = useState('');

  const file = async (e) => {
    e.preventDefault();
    setFiling(true); setMsg('');
    const res = await fetch(`/api/v1/analyze/jobs/${job.id}/attach`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ centre_id: centreId, submitted_count: Number(claimed) }),
    });
    setFiling(false);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { setMsg(body.detail || 'Could not file this session.'); return; }
    onFiled(centreId);
  };

  return (
    <>
      <section className="panel panel-pad" aria-labelledby="res-title">
        <h2 id="res-title" className="small muted" style={{ fontFamily: 'var(--font-body)', fontWeight: 500 }}>People in the room, typically</h2>
        <div className="count-big" style={{ marginTop: 6 }}>
          <span className="num">{s.people_median}</span>
          <span className="muted">peak {s.people_peak} at {fmtSecs(s.peak_at)}</span>
        </div>
        <p className="small muted" style={{ marginTop: 8 }}>
          {s.unique_people} different people were tracked across the video
          {s.avg_dwell_sec ? `, staying ${fmtSecs(s.avg_dwell_sec)} on average` : ''}.
        </p>

        <div className="objects" style={{ marginTop: 18 }}>
          {r.objects.map((o) => (
            <div className="obj-row" key={o.key}>
              <span>{o.label}</span>
              <span className="num">{o.estimated}</span>
              <div className="obj-bar" aria-hidden="true"><div style={{ width: `${(o.estimated / maxObj) * 100}%`, background: OBJ_COLOURS[o.key] || 'var(--ink-faint)' }} /></div>
            </div>
          ))}
          {s.seat_occupancy !== null && (
            <div className="obj-row">
              <span>Seats occupied</span>
              <span className="num">{Math.round(s.seat_occupancy * 100)}%</span>
            </div>
          )}
        </div>
        <p className="small faint" style={{ marginTop: 12 }}>
          {r.video.frames_analysed} frames from {fmtSecs(r.video.duration_sec)} of {r.video.width}×{r.video.height} video,
          average detection confidence {Math.round(s.confidence * 100)}%. Took {fmtSecs(r.processing_sec)}.
        </p>
      </section>

      <section className="stack" style={{ gap: 8 }} aria-label="Observations">
        {r.insights.map((ins, i) => {
          const Icon = INSIGHT_ICON[ins.level] || Info;
          return <div key={i} className={`insight insight-${ins.level}`}><Icon size={18} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} /><span>{ins.text}</span></div>;
        })}
      </section>

      <form className="panel panel-pad" onSubmit={file} aria-labelledby="file-title">
        <h2 id="file-title">File as a session</h2>
        <p className="small muted" style={{ margin: '4px 0 14px' }}>Compare with the attendance the centre submitted. A mismatch raises an alert on the centre's inspection page.</p>
        <label className="lbl" htmlFor="centre">Centre</label>
        <select id="centre" className="field" value={centreId} onChange={(e) => setCentreId(e.target.value)}>
          {(centres.length ? centres : [{ id: 'TC001', name: 'Skill Training Centre Raipur' }]).map((c) => <option key={c.id} value={c.id}>{c.id}, {c.name}</option>)}
        </select>
        <label className="lbl" htmlFor="claimed" style={{ marginTop: 12 }}>Trainees claimed for this session</label>
        <input id="claimed" className="field" type="number" min="0" required value={claimed} onChange={(e) => setClaimed(e.target.value)} placeholder="From the Skill India portal" />
        {claimed !== '' && (
          <p className="small" style={{ marginTop: 8, color: Number(claimed) - s.people_median > 2 ? 'var(--danger)' : 'var(--ink-soft)' }}>
            {Number(claimed) === s.people_median ? 'Matches the headcount.' : `${Math.abs(Number(claimed) - s.people_median)} ${Number(claimed) > s.people_median ? 'more claimed than seen' : 'fewer claimed than seen'}.`}
          </p>
        )}
        {msg && <p className="small" role="alert" style={{ color: 'var(--danger)', marginTop: 8 }}>{msg}</p>}
        <button className="btn btn-primary" style={{ marginTop: 14, width: '100%' }} disabled={filing || claimed === ''}>
          <FileCheck2 size={16} aria-hidden="true" /> {filing ? 'Filing session' : 'File session'}
        </button>
      </form>
    </>
  );
}
