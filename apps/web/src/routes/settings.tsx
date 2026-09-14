// /settings — profile, appearance, privacy, danger-zone signpost.
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MOCK_MODE, mockProfile } from '../lib/mock';
import { supabase, type ProfileRow } from '../lib/supabase';
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
        <div className="card" role="alert">
          <p className="form-error">Couldn&rsquo;t load your profile: {(profile.error as Error).message}</p>
          <button type="button" className="btn btn-sm" onClick={() => void profile.refetch()}>
            Retry
          </button>
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
              placeholder="How Apple should address you"
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
