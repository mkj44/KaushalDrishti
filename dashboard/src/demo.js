/**
 * Demo mode (VITE_DEMO=1): answers /api/v1/* from a snapshot of real API
 * responses (mock.json, served next to the page) so the dashboard can be shown
 * without the Python backend. Uploads replay a recorded analysis.
 */

let db = null;
const ready = fetch('./mock.json').then((r) => r.json()).then((d) => { db = d; });
const clone = (o) => JSON.parse(JSON.stringify(o));
const now = () => new Date().toISOString().replace('Z', '');
const realFetch = window.fetch.bind(window);
const running = {}; // job id -> { started, filename }

const STAGES = ['Loading detection model', 'Analysing frames', 'Tracking people across frames', 'Building 3D layout and evidence'];

function jobState(id) {
  const run = running[id];
  if (!run) return db[`/api/v1/analyze/jobs/${id}`];
  const p = Math.min(1, (Date.now() - run.started) / 9000);
  const done = db[`/api/v1/analyze/jobs/${run.source}`];
  if (p >= 1) return { ...clone(done), id, filename: run.filename, created_at: run.created_at };
  return { id, filename: run.filename, status: 'processing', progress: p, stage: STAGES[Math.min(STAGES.length - 1, Math.floor(p * STAGES.length))], created_at: run.created_at, result: null };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function recomputeCentre() {
  const detail = db['/api/v1/centres/TC001'];
  const open = detail.alerts.filter((a) => a.status !== 'resolved');
  let penalty = 0;
  open.forEach((a) => { const w = a.severity === 'high' ? 20 : a.severity === 'medium' ? 10 : 5; penalty += a.status === 'acknowledged' ? w / 2 : w; });
  const score = Math.max(0, 100 - penalty);
  detail.centre.compliance_score = score;
  const c = db['/api/v1/centres'].centres.find((x) => x.id === 'TC001');
  Object.assign(c, {
    compliance_score: score,
    open_alerts_count: detail.alerts.filter((a) => a.status === 'open').length,
    high_severity_count: detail.alerts.filter((a) => a.status === 'open' && a.severity === 'high').length,
    total_alerts_count: detail.alerts.length,
  });
}

async function handle(path, opts = {}) {
  await ready;
  const method = (opts.method || 'GET').toUpperCase();
  let m;

  if (method === 'GET' && (m = path.match(/^\/api\/v1\/analyze\/jobs\/(\w+)$/))) {
    const j = jobState(m[1]);
    return j ? json(j) : json({ detail: 'Analysis job not found' }, 404);
  }
  if (method === 'GET' && path === '/api/v1/analyze/jobs') {
    const extra = Object.keys(running).reverse().map((id) => {
      const j = jobState(id);
      return { id, filename: j.filename, status: j.status, progress: j.progress, created_at: j.created_at, summary: j.result?.summary || null };
    });
    return json({ jobs: [...extra, ...db['/api/v1/analyze/jobs'].jobs] });
  }
  if (method === 'POST' && (m = path.match(/^\/api\/v1\/analyze\/jobs\/(\w+)\/attach$/))) {
    const j = jobState(m[1]);
    if (!j || j.status !== 'completed') return json({ detail: 'Analysis is not finished yet' }, 409);
    const req = JSON.parse(opts.body || '{}');
    const s = j.result.summary;
    const submitted = Number(req.submitted_count);
    const est = s.people_median;
    const sid = `VID_${m[1].slice(0, 6).toUpperCase()}`;
    const detail = db['/api/v1/centres/TC001'];
    detail.attendance_sessions.push({ id: sid, session_id: sid, camera_id: 'upload', date: now().slice(0, 10), submitted_count: submitted, estimated_count: est, count_median: est, count_p90: s.people_p90, unique_tracks: s.unique_people, confidence: s.confidence, created_at: now() });
    const threshold = Math.max(2, Math.round(0.15 * submitted));
    const flags = [];
    if (submitted - est > threshold) flags.push({ rule: 'ATTENDANCE_OVERREPORT', severity: 'high', message: `Submitted attendance (${submitted}) exceeds the headcount in uploaded footage (${est}).`, threshold: `diff > ${threshold} (submitted ${submitted} vs estimated ${est})` });
    else if (est - submitted > threshold) flags.push({ rule: 'ATTENDANCE_UNDERREPORT', severity: 'low', message: `Uploaded footage shows ${est} people, more than the ${submitted} submitted.`, threshold: `estimated - submitted > ${threshold}` });
    flags.forEach((f) => {
      const id = `ALT_DEMO_${Math.random().toString(16).slice(2, 10).toUpperCase()}`;
      const a = { id, centre_id: 'TC001', camera_id: 'upload', session_id: sid, item_id: null, rule: f.rule, severity: f.severity, status: 'open', message: f.message, threshold: f.threshold, measured: `median=${est}, peak=${s.people_peak}, unique=${s.unique_people}`, confidence: s.confidence, created_at: now(), updated_at: now() };
      detail.alerts.unshift({ ...a, has_thumbnails: true });
      db[`/api/v1/alerts/${id}`] = { ...a, thumbnails: j.result.keyframes.slice(0, 3).map((k) => k.image), audit_trail: [{ timestamp: now(), action: 'created', user: 'video_analysis', note: `Rule ${f.rule} triggered by uploaded video analysis.` }] };
    });
    recomputeCentre();
    return json({ status: 'success', session_id: sid, flags: flags.map((f) => f.rule) });
  }
  if (method === 'POST' && (m = path.match(/^\/api\/v1\/alerts\/(\w+)\/(acknowledge|resolve)$/))) {
    const a = db[`/api/v1/alerts/${m[1]}`];
    if (!a) return json({ detail: 'Alert not found' }, 404);
    const req = JSON.parse(opts.body || '{}');
    a.status = m[2] === 'resolve' ? 'resolved' : 'acknowledged';
    a.audit_trail.push({ timestamp: now(), action: a.status, user: req.user || 'inspector', note: req.note });
    const row = db['/api/v1/centres/TC001'].alerts.find((x) => x.id === m[1]);
    if (row) row.status = a.status;
    recomputeCentre();
    return json({ status: 'success' });
  }
  const key = path.split('?')[0];
  if (method === 'GET' && db[key]) return json(clone(db[key]));
  if (method === 'GET' && key === '/api/v1/health') return json({ status: 'healthy' });
  return json({ detail: 'Not available in the demo' }, 404);
}

window.fetch = (input, opts) => {
  const url = typeof input === 'string' ? input : input.url;
  return url.startsWith('/api/') ? handle(url, opts) : realFetch(input, opts);
};

// Upload: simulate transfer progress, then start a replayed job.
const RealXHR = window.XMLHttpRequest;
class DemoXHR {
  constructor() { this.upload = {}; this.status = 0; this.responseText = ''; }
  open(method, url) { this.url = url; }
  send(body) {
    if (!this.url.startsWith('/api/v1/analyze/video')) return;
    const file = body?.get?.('file');
    const total = file?.size || 1;
    const ext = (file?.name || '').toLowerCase().split('.').pop();
    let sent = 0;
    const tick = setInterval(() => {
      sent = Math.min(total, sent + total / 8);
      this.upload.onprogress?.({ lengthComputable: true, loaded: sent, total });
      if (sent < total) return;
      clearInterval(tick);
      if (!['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v'].includes(ext)) {
        this.status = 415;
        this.responseText = JSON.stringify({ detail: `Unsupported file type '.${ext}'. Use MP4, MOV, AVI, MKV or WEBM.` });
      } else {
        const id = Math.random().toString(16).slice(2, 14);
        running[id] = { started: Date.now(), filename: file.name, source: db.__replay, created_at: now() };
        this.status = 202;
        this.responseText = JSON.stringify({ job_id: id, status: 'queued' });
      }
      this.onload?.();
    }, 120);
  }
}
window.XMLHttpRequest = DemoXHR;
window.__KD_DEMO__ = { RealXHR };
