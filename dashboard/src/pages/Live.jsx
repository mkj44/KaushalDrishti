import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Video, Square, Webcam, Cctv, Clapperboard, Maximize2, Box } from 'lucide-react';
import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid } from 'recharts';
import { layoutToWorld } from '../components/layout.js';
import { fmtSecs } from '../components/ui.jsx';

const Room3D = lazy(() => import('../components/Room3D.jsx'));

const SOURCES = [
  { id: 'browser', icon: Webcam, title: "This computer's camera", text: 'Uses the webcam through your browser. You will be asked for permission.' },
  { id: 'stream', icon: Cctv, title: 'Camera number or CCTV stream', text: 'The server opens it directly: 0 for its built-in webcam, or an rtsp:// address.' },
  { id: 'sample', icon: Clapperboard, title: 'Sample clip as a live feed', text: 'Plays a bundled clip on a loop, for demos without a camera.' },
];

const SEND_WIDTH = 960;

export default function Live({ centres, onFinished }) {
  const [sourceType, setSourceType] = useState('browser');
  const [stream, setStream] = useState('0');
  const [samples, setSamples] = useState([]);
  const [sample, setSample] = useState('');
  const [centreId, setCentreId] = useState('TC001');
  const [state, setState] = useState(null);       // latest snapshot from the API
  const [phase, setPhase] = useState('idle');     // idle | starting | running | stopping
  const [error, setError] = useState('');
  const [bigCamera, setBigCamera] = useState(false);

  const videoRef = useRef(null);
  const mediaRef = useRef(null);
  const loopRef = useRef({ on: false });

  useEffect(() => {
    fetch('/api/v1/live/sources').then((r) => r.json()).then((d) => {
      setSamples(d.samples || []);
      setSample((d.samples || []).find((s) => s === 'normal.mp4') || d.samples?.[0] || '');
    }).catch(() => {});
    // pick up a session that is already running on the server
    fetch('/api/v1/live/state').then((r) => r.json()).then((s) => {
      if (s.active && s.mode === 'server') { setState(s); setPhase('running'); startPolling(); }
    }).catch(() => {});
    return () => stopLoops();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (centres[0] && !centres.find((c) => c.id === centreId)) setCentreId(centres[0].id); }, [centres]);

  const stopLoops = () => {
    loopRef.current.on = false;
    mediaRef.current?.getTracks().forEach((t) => t.stop());
    mediaRef.current = null;
  };

  const startPolling = () => {
    const token = { on: true };
    loopRef.current = token;
    const tick = async () => {
      if (!token.on) return;
      try {
        const s = await (await fetch('/api/v1/live/state')).json();
        if (!token.on) return;
        if (!s.active) { token.on = false; setPhase('idle'); return; }
        setState(s);
      } catch { /* transient */ }
      setTimeout(tick, 300);
    };
    tick();
  };

  const startBrowserLoop = () => {
    const token = { on: true };
    loopRef.current = token;
    const canvas = document.createElement('canvas');
    const send = async () => {
      if (!token.on) return;
      const v = videoRef.current;
      if (!v || !v.videoWidth) { setTimeout(send, 100); return; }
      const k = Math.min(1, SEND_WIDTH / v.videoWidth);
      canvas.width = Math.round(v.videoWidth * k);
      canvas.height = Math.round(v.videoHeight * k);
      canvas.getContext('2d').drawImage(v, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.8));
      try {
        const res = await fetch('/api/v1/live/frame', { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
        const body = await res.json();
        if (!token.on) return;
        if (!res.ok) { setError(body.detail || 'The server stopped accepting frames.'); token.on = false; setPhase('idle'); stopLoops(); return; }
        setState(body);
      } catch {
        setError('Lost connection to the API. Check it is still running on port 8000.');
        token.on = false; setPhase('idle'); stopLoops(); return;
      }
      send(); // next frame as soon as the server is ready: natural back-pressure
    };
    send();
  };

  const start = async () => {
    setError(''); setPhase('starting'); setState(null);
    try {
      if (sourceType === 'browser') {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser cannot open the camera here. Open the dashboard at http://localhost:3000 on the same computer as the camera.');
        const media = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        mediaRef.current = media;
        videoRef.current.srcObject = media;
        await videoRef.current.play();
      }
      const res = await fetch('/api/v1/live/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: sourceType === 'browser' ? 'push' : 'server',
          source: sourceType === 'stream' ? stream.trim() : sample,
          centre_id: centreId, camera_id: 'live',
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || 'The live session could not start.');
      setState(body);
      setPhase('running');
      if (sourceType === 'browser') startBrowserLoop(); else startPolling();
    } catch (e) {
      stopLoops();
      setPhase('idle');
      setError(e.name === 'NotAllowedError'
        ? 'Camera access was blocked. Allow it from the camera icon in the address bar, then press Start again.'
        : e.name === 'NotFoundError' ? 'No camera was found on this computer. Try a sample clip instead.' : e.message);
    }
  };

  const stop = async () => {
    setPhase('stopping');
    stopLoops();
    try {
      const body = await (await fetch('/api/v1/live/stop', { method: 'POST' })).json();
      if (body.job_id) { onFinished(body.job_id); return; }
    } catch { /* fall through */ }
    setPhase('idle');
  };

  const running = phase === 'running' || phase === 'stopping';
  const horizon = state?.layout?.horizon;
  const items = useMemo(() => layoutToWorld(state?.layout?.items || [], horizon ?? undefined), [state, horizon]);
  const canStart = sourceType !== 'sample' || sample;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Live camera</h1>
          <p>Counts people, chairs and equipment as the camera sees them, a few times a second, and moves everyone around the 3D room as they are tracked.</p>
        </div>
        {running && (
          <button className="btn btn-danger" onClick={stop} disabled={phase === 'stopping'}>
            <Square size={15} aria-hidden="true" /> {phase === 'stopping' ? 'Stopping' : 'Stop and see summary'}
          </button>
        )}
      </div>

      {/* hidden capture element for browser-camera mode; only blurred frames are shown */}
      <video ref={videoRef} muted playsInline hidden />

      <div className="analyse">
        <div className="stack">
          <div className="room-stage">
            {running && state?.frame && bigCamera ? (
              <img className="live-frame-big" src={`data:image/jpeg;base64,${state.frame}`} alt="Live camera with faces blurred and detections outlined" />
            ) : (
              <Suspense fallback={null}>
                <Room3D items={items} live autoRotate={!running} label={running ? `Live room with ${state?.people_now ?? 0} people` : 'Empty room model'} />
              </Suspense>
            )}

            {running && state?.frame && (
              <button className="pip" onClick={() => setBigCamera((b) => !b)} aria-label={bigCamera ? 'Show the 3D room large' : 'Show the camera large'}>
                {bigCamera
                  ? <span className="pip-3d"><Box size={22} aria-hidden="true" />3D room</span>
                  : <img src={`data:image/jpeg;base64,${state.frame}`} alt="" />}
                <span className="pip-hint"><Maximize2 size={13} aria-hidden="true" /> Swap</span>
              </button>
            )}

            {running && (
              <div className="live-badge" role="status">
                <span className="rec" aria-hidden="true" /> Live
                {state?.fps ? <span className="faint">{state.fps} frames/s</span> : <span className="faint">waiting for the first frame</span>}
              </div>
            )}

            {!running && (
              <div className="dropzone">
                <div className="dropzone-inner">
                  <h2>{phase === 'starting' ? 'Starting the camera' : 'Choose a camera to start'}</h2>
                  <p className="muted">{error || 'Pick a source on the right. The detector starts in a couple of seconds.'}</p>
                </div>
              </div>
            )}
          </div>

          {running && (
            <section className="panel panel-pad" aria-labelledby="roll-title">
              <div className="panel-head">
                <div>
                  <h2 id="roll-title">Last two minutes</h2>
                  <p>People and chairs in each processed frame.</p>
                </div>
                <span className="small faint">{fmtSecs(state?.elapsed_sec || 0)} running</span>
              </div>
              <div style={{ height: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={state?.timeline || []} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid stroke="#dde3e9" vertical={false} />
                    <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={fmtSecs} tick={{ fontSize: 12, fill: '#46536b' }} axisLine={{ stroke: '#c3ccd5' }} tickLine={false} minTickGap={40} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#46536b' }} axisLine={false} tickLine={false} />
                    <Area type="stepAfter" dataKey="people" stroke="#5a3fb0" strokeWidth={2} fill="#5a3fb0" fillOpacity={0.14} isAnimationActive={false} />
                    <Line type="stepAfter" dataKey="chairs" stroke="#1e7a4c" strokeWidth={2} dot={false} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}
        </div>

        <aside className="stack">
          {running ? <LiveStats s={state} /> : (
            <section className="panel panel-pad" aria-labelledby="src-title">
              <h2 id="src-title" style={{ marginBottom: 12 }}>Camera</h2>
              <div className="source-list" role="radiogroup" aria-label="Camera source">
                {SOURCES.map(({ id, icon: Icon, title, text }) => (
                  <label key={id} className="source" data-checked={sourceType === id}>
                    <input type="radio" name="source" value={id} checked={sourceType === id} onChange={() => setSourceType(id)} />
                    <Icon size={20} aria-hidden="true" />
                    <span><strong>{title}</strong><span className="small muted">{text}</span></span>
                  </label>
                ))}
              </div>

              {sourceType === 'stream' && (
                <div style={{ marginTop: 14 }}>
                  <label className="lbl" htmlFor="stream">Camera number or stream address</label>
                  <input id="stream" className="field" value={stream} onChange={(e) => setStream(e.target.value)} placeholder="0 or rtsp://user:pass@192.168.1.20:554/stream1" />
                </div>
              )}
              {sourceType === 'sample' && (
                <div style={{ marginTop: 14 }}>
                  <label className="lbl" htmlFor="sample">Clip</label>
                  {samples.length ? (
                    <select id="sample" className="field" value={sample} onChange={(e) => setSample(e.target.value)}>
                      {samples.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : <p className="small muted">No sample clips yet. Run <code>python data/generate_sample_data.py</code> once, then reload this page.</p>}
                </div>
              )}

              <label className="lbl" htmlFor="live-centre" style={{ marginTop: 14 }}>Show on centre</label>
              <select id="live-centre" className="field" value={centreId} onChange={(e) => setCentreId(e.target.value)}>
                {(centres.length ? centres : [{ id: 'TC001', name: 'Skill Training Centre Raipur' }]).map((c) => <option key={c.id} value={c.id}>{c.id}, {c.name}</option>)}
              </select>
              <p className="small faint" style={{ marginTop: 6 }}>The centre's Inspection page shows this feed while it runs.</p>

              {error && <p className="small" role="alert" style={{ color: 'var(--danger)', marginTop: 12 }}>{error}</p>}
              <button className="btn btn-primary" style={{ marginTop: 16, width: '100%' }} onClick={start} disabled={phase === 'starting' || !canStart}>
                <Video size={17} aria-hidden="true" /> {phase === 'starting' ? 'Starting' : 'Start live analysis'}
              </button>
              <p className="small faint" style={{ marginTop: 10 }}>Faces are blurred before any frame is shown or saved. Nothing is recorded; only counts and a few blurred stills are kept.</p>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}

function LiveStats({ s }) {
  if (!s) return <section className="panel panel-pad"><p className="muted">Waiting for the first frame…</p></section>;
  const maxObj = Math.max(1, ...(s.objects || []).map((o) => o.estimated));
  return (
    <>
      <section className="panel panel-pad" aria-labelledby="now-title">
        <h2 id="now-title" className="small muted" style={{ fontFamily: 'var(--font-body)', fontWeight: 500 }}>People in view right now</h2>
        <div className="count-big" style={{ marginTop: 6 }} aria-live="polite">
          <span className="num">{s.people_now}</span>
        </div>
        <div className="gap-strip" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div><span className="small muted">Typical, last 30 s</span><span className="num">{s.people_typical}</span></div>
          <div><span className="small muted">Peak</span><span className="num">{s.people_peak}</span></div>
          <div><span className="small muted">Different people</span><span className="num">{s.unique_people}</span></div>
        </div>
      </section>

      <section className="panel panel-pad" aria-labelledby="room-title">
        <h2 id="room-title" style={{ marginBottom: 6 }}>In the room</h2>
        <div className="objects">
          {(s.objects || []).filter((o) => o.key !== 'person').map((o) => (
            <div className="obj-row" key={o.key}>
              <span>{o.label}</span>
              <span className="num">{o.estimated}</span>
              <div className="obj-bar" aria-hidden="true"><div style={{ width: `${(o.estimated / maxObj) * 100}%`, background: o.key === 'chair' ? 'var(--verified)' : 'var(--ink-faint)' }} /></div>
            </div>
          ))}
          {s.seat_occupancy !== null && s.seat_occupancy !== undefined && (
            <div className="obj-row"><span>Seats occupied now</span><span className="num">{Math.round(s.seat_occupancy * 100)}%</span></div>
          )}
          {!(s.objects || []).some((o) => o.key !== 'person') && <p className="small muted" style={{ paddingTop: 8 }}>No chairs, desks or screens detected yet.</p>}
        </div>
      </section>

      <p className="small faint">
        {s.source}. {s.fps} frames/s{s.latency_ms ? `, ${s.latency_ms} ms per frame` : ''}. {s.frames} frames analysed.
        {s.error && <span style={{ color: 'var(--danger)', display: 'block', marginTop: 4 }}>{s.error}</span>}
      </p>
    </>
  );
}
