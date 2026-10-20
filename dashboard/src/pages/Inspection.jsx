import React from 'react';
import { Cpu, Box, Film, CheckCircle2 } from 'lucide-react';
import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { Pill, ruleLabel, scoreTone, toneColour, fmtTime } from '../components/ui.jsx';

const ITEM_STATUS = {
  present: { tone: 'ok', text: 'Seen and in use' },
  idle: { tone: 'warn', text: 'Seen, looks unused' },
  missing: { tone: 'bad', text: 'Not seen' },
};

const chartTooltip = {
  contentStyle: { background: '#f6f8f9', border: '1px solid #c3ccd5', borderRadius: 8, fontSize: 13 },
  labelStyle: { fontWeight: 700, color: '#14213d' },
};

export default function Inspection({ centreData, centres, selectedId, onSelect, onOpenAlert, onAnalyse }) {
  if (!centreData) return <p className="empty">Loading centre…</p>;
  const { centre, attendance_sessions: sessions = [], inventory = [], alerts = [], live_feed: live } = centreData;
  const tone = scoreTone(centre.compliance_score);
  const open = alerts.filter((a) => a.status === 'open');

  const chart = sessions.map((s) => ({
    name: s.session_id.replace('SESS_', '').replace('VID_', 'Video '),
    Claimed: s.submitted_count,
    Seen: s.estimated_count,
  }));
  const avg = (k) => (sessions.length ? Math.round(sessions.reduce((a, s) => a + (s[k] || 0), 0) / sessions.length) : 0);
  const avgClaimed = avg('submitted_count');
  const avgSeen = avg('estimated_count');
  const gap = avgClaimed - avgSeen;

  return (
    <div className="stack">
      <section className="panel panel-pad centre-banner" aria-labelledby="centre-name">
        <div>
          {centres.length > 1 && (
            <select className="field" style={{ width: 'auto', marginBottom: 12 }} value={selectedId} onChange={(e) => onSelect(e.target.value)} aria-label="Choose centre">
              {centres.map((c) => <option key={c.id} value={c.id}>{c.id}, {c.name}</option>)}
            </select>
          )}
          <h1 id="centre-name">{centre.name}</h1>
          <dl>
            <div><dt>Centre ID</dt><dd>{centre.id}</dd></div>
            <div><dt>Location</dt><dd>{centre.district}, {centre.state}</dd></div>
            <div><dt>Scheme</dt><dd>{centre.scheme}</dd></div>
            <div><dt>Contact</dt><dd>{centre.contact_email || '—'}</dd></div>
          </dl>
        </div>
        <div className="index-meter">
          <div>
            <div className="small muted">Compliance index</div>
            <div className="num" style={{ color: toneColour[tone] }}>{Math.round(centre.compliance_score)}</div>
          </div>
          <Pill tone={tone}>{tone === 'ok' ? 'Within benchmark' : tone === 'warn' ? 'Needs review' : 'Action required'}</Pill>
        </div>
      </section>

      {live?.image && (
        <section className="panel panel-pad" aria-labelledby="live-title">
          <div className="panel-head">
            <div>
              <h2 id="live-title"><span className="live-dot" aria-hidden="true" style={{ marginRight: 10 }} />Live from {live.camera_id}</h2>
              <p>Session {live.session_id}. Updated {fmtTime(live.updated_at)}.</p>
            </div>
          </div>
          <div className="live">
            <img src={`data:image/webp;base64,${live.image}`} alt={`Face-blurred frame from ${live.camera_id}`} />
            <div className="gap-strip" style={{ marginTop: 0, borderTop: 0 }}>
              <div style={{ paddingTop: 0 }}><span className="small muted">Trainees in view</span><span className="num" style={{ color: 'var(--measured)' }}>{live.estimated_count}</span></div>
              <div style={{ paddingTop: 0 }}><span className="small muted">Claimed</span><span className="num" style={{ color: 'var(--claimed)' }}>{live.submitted_count ?? '—'}</span></div>
              <div style={{ paddingTop: 0 }}><span className="small muted">Detection confidence</span><span className="num">{Math.round((live.confidence || 0) * 100)}%</span></div>
            </div>
          </div>
        </section>
      )}

      <section className="panel panel-pad" aria-labelledby="att-title">
        <div className="panel-head">
          <div>
            <h2 id="att-title">Attendance: claimed against seen</h2>
            <p>Portal submissions next to the median headcount from the camera, per session.</p>
          </div>
          <button className="btn" onClick={onAnalyse}><Film size={16} aria-hidden="true" /> Check a recording</button>
        </div>
        <div style={{ height: 260 }}>
          {chart.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chart} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="#dde3e9" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#46536b' }} axisLine={{ stroke: '#c3ccd5' }} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#46536b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip {...chartTooltip} />
                <Area type="monotone" dataKey="Seen" stroke="#5a3fb0" strokeWidth={2.5} fill="#5a3fb0" fillOpacity={0.12} />
                <Line type="monotone" dataKey="Claimed" stroke="#e07a10" strokeWidth={2.5} strokeDasharray="6 4" dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty">No sessions yet. Run the edge agent, or analyse a recording and file it against this centre.</div>
          )}
        </div>
        <div className="legend small muted" style={{ marginTop: 10 }}>
          <span><i style={{ background: 'var(--claimed)' }} />Claimed (dashed)</span>
          <span><i style={{ background: 'var(--measured)' }} />Seen by camera</span>
        </div>
        {sessions.length > 0 && (
          <div className="gap-strip">
            <div><span className="small muted">Average claimed</span><span className="num" style={{ color: 'var(--claimed)' }}>{avgClaimed}</span></div>
            <div><span className="small muted">Average seen</span><span className="num" style={{ color: 'var(--measured)' }}>{avgSeen}</span></div>
            <div><span className="small muted">Average gap</span><span className="num" style={{ color: gap > 2 ? 'var(--danger)' : undefined }}>{gap > 0 ? `+${gap}` : gap}</span></div>
          </div>
        )}
      </section>

      <div className="grid-2">
        <section className="panel panel-pad" aria-labelledby="inv-title">
          <div className="panel-head">
            <div>
              <h2 id="inv-title">Sanctioned equipment</h2>
              <p>Compared with baseline photos; machines are checked for movement.</p>
            </div>
            <span className="small muted">{inventory.length} items</span>
          </div>
          <div className="list">
            {inventory.map((it) => {
              const st = ITEM_STATUS[it.status] || ITEM_STATUS.present;
              const Icon = it.type === 'machine' ? Cpu : Box;
              return (
                <div className="list-item" key={it.id}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
                    <Icon size={18} className="faint" aria-hidden="true" />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }}>{it.name}</div>
                      <div className="small faint">{it.id}, {it.camera_id}, expected {it.expected_count}</div>
                    </div>
                  </div>
                  <Pill tone={st.tone}>{st.text}</Pill>
                </div>
              );
            })}
            {!inventory.length && <p className="empty">No equipment registered for this centre.</p>}
          </div>
        </section>

        <section className="panel panel-pad" aria-labelledby="alerts-title">
          <div className="panel-head">
            <div>
              <h2 id="alerts-title">Alerts</h2>
              <p>Open one to see the blurred evidence and add a note.</p>
            </div>
            {open.length > 0 && <Pill tone="bad">{open.length} open</Pill>}
          </div>
          <div className="scroll">
            {alerts.length ? alerts.map((a) => (
              <button key={a.id} className="alert-item" data-sev={a.severity} data-open={String(a.status === 'open')} onClick={() => onOpenAlert(a.id)}>
                <span className="bar" aria-hidden="true" />
                <div>
                  <div className="alert-rule">{ruleLabel(a.rule)}</div>
                  <p className="small muted" style={{ marginTop: 3 }}>{a.message}</p>
                  <p className="small faint" style={{ marginTop: 4 }}>{fmtTime(a.created_at)}, {a.severity} severity</p>
                </div>
                <Pill tone={a.status === 'open' ? (a.severity === 'high' ? 'bad' : 'warn') : a.status === 'resolved' ? 'ok' : 'quiet'}>{a.status}</Pill>
              </button>
            )) : (
              <div className="empty"><CheckCircle2 size={28} style={{ color: 'var(--verified)', margin: '0 auto 8px' }} aria-hidden="true" />Nothing to review. This centre matches its claims.</div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
