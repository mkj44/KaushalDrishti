import React from 'react';

export const RULE_LABELS = {
  ATTENDANCE_OVERREPORT: 'Attendance over-reported',
  ATTENDANCE_UNDERREPORT: 'More trainees seen than claimed',
  SESSION_EMPTY: 'Classroom empty during claimed session',
  CAMERA_OFFLINE: 'Camera offline or blocked',
  ITEM_MISSING: 'Sanctioned item missing',
  EQUIPMENT_POSSIBLY_NONFUNCTIONAL: 'Equipment appears unused',
  SEATING_SHORTFALL: 'Fewer chairs than people',
};

export const ruleLabel = (rule) =>
  RULE_LABELS[rule] || rule.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export const scoreTone = (s) => (s >= 90 ? 'ok' : s >= 70 ? 'warn' : 'bad');
export const toneColour = { ok: 'var(--verified)', warn: 'var(--claimed)', bad: 'var(--danger)' };

export function ScoreDial({ score = 100, size = 56 }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const tone = scoreTone(score);
  return (
    <div className="score-dial" style={{ width: size, height: size }} aria-label={`Compliance index ${Math.round(score)} out of 100`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--slab)" strokeWidth="5" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={toneColour[tone]} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={`${(circ * score) / 100} ${circ}`} transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span>{Math.round(score)}</span>
    </div>
  );
}

export function Pill({ tone = 'quiet', children }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

export const fmtTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso.endsWith('Z') ? iso : `${iso}Z`);
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

export const fmtSecs = (s) => {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m ? `${m}m ${sec.toString().padStart(2, '0')}s` : `${sec}s`;
};
