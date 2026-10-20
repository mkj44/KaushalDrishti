import React, { useEffect, useRef, useState } from 'react';
import { X, Check, CheckCircle2 } from 'lucide-react';
import { Pill, ruleLabel, fmtTime } from './ui.jsx';

export default function AlertModal({ alertId, role, onClose, onChanged }) {
  const [alert, setAlert] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const closeRef = useRef();

  const load = async () => {
    const res = await fetch(`/api/v1/alerts/${alertId}`);
    if (res.ok) setAlert(await res.json());
  };

  useEffect(() => { load(); closeRef.current?.focus(); }, [alertId]);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const act = async (action) => {
    if (note.trim().length < 2) { setError(action === 'resolve' ? 'Add a resolution note before closing the alert.' : 'Add a note saying what you checked.'); return; }
    setBusy(true); setError('');
    const res = await fetch(`/api/v1/alerts/${alertId}/${action}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note, user: role === 'admin' ? 'directorate_admin' : 'district_inspector' }),
    });
    setBusy(false);
    if (res.ok) { setNote(''); await load(); onChanged(); } else setError('The note was not saved. Check the API is running and try again.');
  };

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="alert-title">
        {!alert ? <div className="modal-body">Loading alert…</div> : (
          <>
            <div className="modal-head">
              <div>
                <h2 id="alert-title">{ruleLabel(alert.rule)}</h2>
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <Pill tone={alert.severity === 'high' ? 'bad' : alert.severity === 'medium' ? 'warn' : 'quiet'}>{alert.severity} severity</Pill>
                  <Pill tone={alert.status === 'resolved' ? 'ok' : alert.status === 'open' ? 'warn' : 'quiet'}>{alert.status}</Pill>
                </div>
              </div>
              <button ref={closeRef} className="btn btn-ghost" onClick={onClose} aria-label="Close"><X size={20} /></button>
            </div>
            <div className="modal-body">
              <p>{alert.message}</p>
              <dl className="facts">
                <div><dt>Rule threshold</dt><dd>{alert.threshold || '—'}</dd></div>
                <div><dt>Measured</dt><dd>{alert.measured || '—'}</dd></div>
                <div><dt>Confidence</dt><dd>{Math.round(alert.confidence * 100)}%</dd></div>
                <div><dt>Camera and session</dt><dd>{alert.camera_id}, {alert.session_id}</dd></div>
                <div><dt>Raised</dt><dd>{fmtTime(alert.created_at)}</dd></div>
                <div><dt>Alert ID</dt><dd>{alert.id}</dd></div>
              </dl>

              <div>
                <h3 style={{ marginBottom: 10 }}>Evidence</h3>
                {alert.thumbnails?.length ? (
                  <div className="thumbs">
                    {alert.thumbnails.map((t, i) => <img key={i} src={`data:image/jpeg;base64,${t}`} alt={`Face-blurred evidence frame ${i + 1}`} />)}
                  </div>
                ) : <p className="small muted">No frames were captured with this alert.</p>}
                <p className="small faint" style={{ marginTop: 8 }}>Faces were blurred on site before these frames were sent.</p>
              </div>

              <div>
                <h3 style={{ marginBottom: 10 }}>Review history</h3>
                <div className="trail">
                  {(alert.audit_trail || []).map((e, i) => (
                    <div key={i}>
                      <div className="small"><strong style={{ textTransform: 'capitalize' }}>{e.action}</strong> by {e.user.replace(/_/g, ' ')}, {fmtTime(e.timestamp)}</div>
                      <p className="small muted" style={{ marginTop: 2 }}>{e.note}</p>
                    </div>
                  ))}
                </div>
              </div>

              {alert.status !== 'resolved' && (
                <div>
                  <label className="lbl" htmlFor="note">Your note</label>
                  <textarea id="note" className="field" rows={3} value={note} onChange={(e) => setNote(e.target.value)}
                    placeholder={role === 'admin' ? 'For example: inspection team visited, explanation notice issued.' : 'For example: called the centre head, roster shows 12 present.'} />
                  {error && <p className="small" style={{ color: 'var(--danger)', marginTop: 6 }} role="alert">{error}</p>}
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12, flexWrap: 'wrap' }}>
                    {alert.status === 'open' && <button className="btn btn-primary" disabled={busy} onClick={() => act('acknowledge')}><Check size={16} aria-hidden="true" /> Acknowledge</button>}
                    {role === 'admin'
                      ? <button className="btn btn-verify" disabled={busy} onClick={() => act('resolve')}><CheckCircle2 size={16} aria-hidden="true" /> Resolve alert</button>
                      : <p className="small faint" style={{ alignSelf: 'center' }}>Switch to Directorate to resolve.</p>}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
