// /usage — sparks ring, 30-day usage bars (hand-rolled SVG), plan card + waitlist.
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { fetchMe, fetchUsage, type UsageDay } from '../lib/api';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useToast } from '../components/toast';
import { countdownTo } from '../lib/format';

function SparksRing({ remaining, daily }: { remaining: number; daily: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const frac = daily > 0 ? Math.max(0, Math.min(1, remaining / daily)) : 0;
  return (
    <svg width="140" height="140" viewBox="0 0 140 140" role="img" aria-label={`${remaining} of ${daily} sparks remaining today`}>
      <circle cx="70" cy="70" r={r} fill="none" stroke="var(--line)" strokeWidth="10" />
      <circle
        cx="70"
        cy="70"
        r={r}
        fill="none"
        stroke="var(--amber)"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={`${c * frac} ${c}`}
        transform="rotate(-90 70 70)"
        className="ring-arc"
      />
      <text x="70" y="66" textAnchor="middle" className="ring-number">
        {remaining}
      </text>
      <text x="70" y="88" textAnchor="middle" className="ring-caption">
        of {daily} ⚡
      </text>
    </svg>
  );
}

function UsageBars({ days }: { days: UsageDay[] }) {
  // Build a dense series for the last 30 days (API returns sparse desc rows).
  const byDay = new Map(days.map((d) => [d.day, d.sparks]));
  const series: { day: string; sparks: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    series.push({ day: d, sparks: byDay.get(d) ?? 0 });
  }
  const max = Math.max(10, ...series.map((s) => s.sparks));
  const W = 600;
  const H = 160;
  const pad = 4;
  const bw = (W - pad * 2) / 30;

  return (
    <div className="bars-wrap">
      <svg
        viewBox={`0 0 ${W} ${H + 22}`}
        className="usage-bars"
        role="img"
        aria-label="Sparks spent per day over the last 30 days"
      >
        {series.map((s, i) => {
          const h = Math.max(s.sparks > 0 ? 3 : 1.5, (s.sparks / max) * H);
          const x = pad + i * bw;
          const label = new Date(`${s.day}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
          return (
            <g key={s.day}>
              <rect
                x={x + 2}
                y={H - h}
                width={bw - 4}
                height={h}
                rx={2.5}
                className={s.sparks > 0 ? 'bar bar-active' : 'bar'}
              >
                <title>{`${label}: ${s.sparks} sparks`}</title>
              </rect>
              {(i === 0 || i === 29 || i === 15) && (
                <text x={x + bw / 2} y={H + 16} textAnchor="middle" className="bar-label">
                  {label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

const WAITLIST_KEY = 'golem-waitlist-joined';

function PlanCard({ plan }: { plan: string }) {
  const { session } = useAuth();
  const { toast } = useToast();
  const [joined, setJoined] = useState<boolean>(() => {
    try {
      return localStorage.getItem(WAITLIST_KEY) === '1';
    } catch {
      return false;
    }
  });

  const join = useMutation({
    mutationFn: async () => {
      const email = session?.user.email;
      if (!email) throw new Error('No email on file');
      const { error } = await supabase.from('waitlist').insert({ email, owner_id: session.user.id });
      // unique violation → already on the list; treat as success
      if (error && error.code !== '23505') throw new Error(error.message);
    },
    onSuccess: () => {
      setJoined(true);
      try {
        localStorage.setItem(WAITLIST_KEY, '1');
      } catch {
        /* private mode */
      }
      toast("You're on the Pro waitlist — we'll email you.", 'success');
    },
    onError: (e: Error) => toast(`Couldn't join the waitlist: ${e.message}`, 'error'),
  });

  return (
    <div className="card plan-card">
      <div className="plan-row">
        <div>
          <h3 className="plan-name">
            {plan === 'pro' ? 'Pro' : 'Free'} plan
            {plan === 'pro' && <span className="pill pill-live plan-pill">active</span>}
          </h3>
          <p className="muted">
            {plan === 'pro'
              ? '400 Sparks a day, priority queue, more checkpoints.'
              : '80 Sparks a day — enough for steady daily building.'}
          </p>
        </div>
      </div>
      {plan !== 'pro' && (
        <div className="plan-upsell">
          <div>
            <strong>Golem Pro</strong>
            <p className="muted">Bigger daily quota, priority queue, more checkpoints. Launching soon.</p>
          </div>
          {joined ? (
            <span className="pill pill-live">On the waitlist ✓</span>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => join.mutate()} disabled={join.isPending}>
              {join.isPending ? 'Joining…' : 'Join the waitlist'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function UsagePage() {
  const me = useQuery({ queryKey: ['me'], queryFn: fetchMe });
  const usage = useQuery({ queryKey: ['usage'], queryFn: fetchUsage });

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Usage</h1>
          <p className="page-sub">Sparks are Golem's daily energy. Every request spends a few.</p>
        </div>
      </div>

      {me.isPending && <p className="muted" aria-busy="true">Loading your Sparks…</p>}
      {me.isError && (
        <div className="card" role="alert">
          <p className="form-error">Couldn't load usage: {(me.error as Error).message}</p>
          <button type="button" className="btn btn-sm" onClick={() => void me.refetch()}>
            Retry
          </button>
        </div>
      )}

      {me.isSuccess && (
        <div className="usage-grid">
          <div className="card sparks-card">
            <h3>Today's Sparks</h3>
            <SparksRing remaining={me.data.quota.sparksRemaining} daily={me.data.quota.sparksDaily} />
            <p className="muted">
              Resets in {countdownTo(me.data.quota.resetsAtIso) ?? 'a moment'} · Clay 1⚡ · Stone 4⚡ · Rune 10⚡
            </p>
          </div>

          <div className="card bars-card">
            <h3>Last 30 days</h3>
            {usage.isPending && <p className="muted" aria-busy="true">Loading history…</p>}
            {usage.isError && (
              <p className="form-error" role="alert">
                Couldn't load history.{' '}
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void usage.refetch()}>
                  Retry
                </button>
              </p>
            )}
            {usage.isSuccess &&
              (usage.data.days.length === 0 ? (
                <p className="muted">No Sparks spent yet — go build something.</p>
              ) : (
                <UsageBars days={usage.data.days} />
              ))}
          </div>

          <PlanCard plan={me.data.quota.plan} />
        </div>
      )}
    </div>
  );
}
