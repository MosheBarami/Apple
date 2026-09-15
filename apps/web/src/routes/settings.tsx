// /settings — profile, appearance, privacy, danger-zone signpost.
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PairingCodeDto } from '@golem/shared';
import { MOCK_MODE, mockProfile } from '../lib/mock';
import { supabase, type ProfileRow } from '../lib/supabase';
import { createDiscordCode, disconnectDiscord, fetchDiscordLink } from '../lib/api';
import { countdownTo } from '../lib/format';
import { Failure } from '../components/failure';
import { useAuth } from '../lib/auth';
import { useToast } from '../components/toast';
import { useTheme } from '../lib/theme';

async function fetchProfile(userId: string): Promise<ProfileRow | null> {
  if (MOCK_MODE) return mockProfile;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, plan, is_admin, training_opt_in')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ProfileRow | null) ?? null;
}

/**
 * CONNECT DISCORD.
 *
 * The code is minted HERE, signed in, on a project this account owns, and typed into Discord. That
 * direction is the whole proof: only somebody signed in to this account can produce a code, so
 * presenting one in Discord demonstrates ownership. Minting in Discord instead would demonstrate
 * nothing about the Discord user — only that they could read a code somebody sent them.
 *
 * The card states plainly what the connection can do, because it can spend money: the connected
 * Discord account can start builds in the chosen project and see the balance. That sentence is on
 * screen at the moment of connecting, not buried.
 */
function DiscordCard({ userId }: { userId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [projectId, setProjectId] = useState('');
  const [code, setCode] = useState<PairingCodeDto | null>(null);
  const [remaining, setRemaining] = useState<string | null>(null);

  const link = useQuery({
    queryKey: ['discord-link', userId],
    queryFn: fetchDiscordLink,
    enabled: userId.length > 0,
  });

  const projects = useQuery({
    queryKey: ['projects-for-discord', userId],
    queryFn: async (): Promise<{ id: string; name: string }[]> => {
      if (MOCK_MODE) return [];
      const { data, error } = await supabase
        .from('projects')
        .select('id, name')
        .is('archived_at', null)
        .order('updated_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as { id: string; name: string }[];
    },
    enabled: userId.length > 0,
  });

  useEffect(() => {
    if (!projectId && projects.data && projects.data.length > 0) setProjectId(projects.data[0]!.id);
  }, [projects.data, projectId]);

  // A code with no visible clock is a code people paste five minutes after it died and then blame
  // the bot for. The countdown is the same one the Studio pairing dialog shows.
  useEffect(() => {
    if (!code) {
      setRemaining(null);
      return;
    }
    setRemaining(countdownTo(code.expiresAtIso));
    const t = window.setInterval(() => setRemaining(countdownTo(code.expiresAtIso)), 1000);
    return () => window.clearInterval(t);
  }, [code]);

  const mint = useMutation({
    mutationFn: () => createDiscordCode(projectId),
    onSuccess: (dto) => setCode(dto),
    onError: (e: Error) => toast(`Couldn't make a code: ${e.message}`, 'error'),
  });

  const disconnect = useMutation({
    mutationFn: disconnectDiscord,
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['discord-link', userId] });
      toast(res.removed ? 'Discord disconnected.' : 'There was nothing connected.', 'success');
    },
    onError: (e: Error) => toast(`Couldn't disconnect: ${e.message}`, 'error'),
  });

  const connected = link.data?.link ?? null;

  return (
    <section className="card settings-card">
      <h2>Discord</h2>
      {link.isError && <Failure error={link.error} onRetry={() => void link.refetch()} compact />}

      {connected ? (
        <>
          <p>
            A Discord account is connected to <strong>{connected.projectName}</strong>. It can start builds there and
            see this account&rsquo;s Sparks.
          </p>
          <button type="button" className="btn" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>
            {disconnect.isPending ? 'Disconnecting…' : 'Disconnect Discord'}
          </button>
          <p className="muted">
            Disconnecting takes effect immediately. The same thing happens if you run <code>/unlink</code> in Discord.
          </p>
        </>
      ) : (
        <>
          <p>
            Connect one Discord account to one project, then use <code>/build</code>, <code>/status</code> and{' '}
            <code>/credits</code> there. <strong>The connected Discord account spends this account&rsquo;s Sparks</strong>,
            so only connect your own.
          </p>
          <div className="settings-inline">
            <label className="field settings-grow">
              <span className="field-label">Project</span>
              <select
                id="discord-project"
                name="discordProject"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                disabled={projects.isPending || (projects.data?.length ?? 0) === 0}
              >
                {(projects.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn"
              onClick={() => mint.mutate()}
              disabled={!projectId || mint.isPending}
            >
              {mint.isPending ? 'Making a code…' : 'Get a code'}
            </button>
          </div>
          {projects.data?.length === 0 && <p className="muted">Make a project first — a Discord link always points at one.</p>}
          {code && (
            <div className="pairing-code-box">
              <span className="pairing-label">Type this in Discord</span>
              <output className="pairing-code" aria-live="polite">
                /link {code.code}
              </output>
              <span className="pairing-countdown" role="timer">
                {remaining ? `Expires in ${remaining}` : 'Expired — get another'}
              </span>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export function SettingsPage() {
  const { session } = useAuth();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const qc = useQueryClient();
  const userId = session?.user.id ?? '';

  const profile = useQuery({
    queryKey: ['profile', userId],
    queryFn: () => fetchProfile(userId),
    enabled: userId.length > 0,
  });

  const [displayName, setDisplayName] = useState('');
  useEffect(() => {
    if (profile.data) setDisplayName(profile.data.display_name ?? '');
  }, [profile.data]);

  const saveName = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: displayName.trim() || null })
        .eq('id', userId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['profile', userId] });
      void qc.invalidateQueries({ queryKey: ['me'] });
      toast('Display name saved', 'success');
    },
    onError: (e: Error) => toast(`Couldn't save: ${e.message}`, 'error'),
  });

  const setOptIn = useMutation({
    mutationFn: async (optIn: boolean) => {
      const { error } = await supabase.from('profiles').update({ training_opt_in: optIn }).eq('id', userId);
      if (error) throw new Error(error.message);
      return optIn;
    },
    onSuccess: (optIn) => {
      void qc.invalidateQueries({ queryKey: ['profile', userId] });
      toast(optIn ? 'Thanks for contributing.' : 'Opted out — your work stays fully private.', 'success');
    },
    onError: (e: Error) => toast(`Couldn't update: ${e.message}`, 'error'),
  });

  const submitName = (e: FormEvent) => {
    e.preventDefault();
    if (!saveName.isPending) saveName.mutate();
  };

  return (
    <div className="page page-narrow">
      <div className="page-head">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-sub">Signed in as {session?.user.email}</p>
        </div>
      </div>

      {profile.isError && (
        <div className="card">
          <Failure error={profile.error} onRetry={() => void profile.refetch()} compact />
        </div>
      )}

      <section className="card settings-card">
        <h2>Profile</h2>
        <form onSubmit={submitName} className="settings-inline">
          <label className="field settings-grow">
            <span className="field-label">Display name</span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={60}
              name="displayName"
              id="display-name"
              // A disabled field showing "How Apple should address you" reads as "you have not set
              // one" while the answer is still being fetched. Same conflation as everywhere else.
              placeholder={profile.isPending ? 'Loading…' : 'How Apple should address you'}
              disabled={profile.isPending}
            />
          </label>
          <button type="submit" className="btn" disabled={saveName.isPending || profile.isPending}>
            {saveName.isPending ? 'Saving…' : 'Save'}
          </button>
        </form>
      </section>

      <section className="card settings-card">
        <h2>Appearance</h2>
        <div className="theme-toggle" role="radiogroup" aria-label="Theme">
          <button
            type="button"
            role="radio"
            aria-checked={theme === 'dark'}
            className={`theme-btn${theme === 'dark' ? ' theme-btn-active' : ''}`}
            onClick={() => setTheme('dark')}
          >
            Night quarry
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={theme === 'light'}
            className={`theme-btn${theme === 'light' ? ' theme-btn-active' : ''}`}
            onClick={() => setTheme('light')}
          >
            Quarry daylight
          </button>
        </div>
        <p className="muted">Dark is the apple&rsquo;s natural habitat, but daylight works too.</p>
      </section>

      <section className="card settings-card">
        <h2>Privacy</h2>
        <p>
          <strong>Your projects are private. Apple never trains on your work.</strong>
        </p>
        <label className="switch-row">
          <input
            type="checkbox"
            name="trainingOptIn"
            id="training-opt-in"
            checked={profile.data?.training_opt_in ?? false}
            onChange={(e) => setOptIn.mutate(e.target.checked)}
            disabled={profile.isPending || setOptIn.isPending}
          />
          <span>
            Contribute anonymised snippets to improve Apple
            <span className="field-hint"> — optional, off by default, revocable any time.</span>
          </span>
        </label>
      </section>

      <DiscordCard userId={userId} />

      <section className="card settings-card danger-card">
        <h2>Danger zone</h2>
        <p className="muted">
          Deleting a project removes its chat history, checkpoints and Studio pairing forever. The delete action lives
          in each <Link to="/">project card&rsquo;s menu</Link> — it asks you to type the project&rsquo;s name to
          confirm.
        </p>
      </section>
    </div>
  );
}
