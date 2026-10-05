/**
 * "SIGN IN WITH GOOGLE" / "SIGN IN WITH DISCORD", as the Connections section shows them: whether the account has that identity, a way to
 * add it (supabase.auth.linkIdentity) and a way to remove it (supabase.auth.unlinkIdentity).
 *
 * Drawn ONLY when the Supabase project says the provider is on (lib/auth-providers.ts): a card for a provider that is off would lead to
 * an error page. Today both are off (owner item N2), so today neither card exists. The settings page also hides the row and its search
 * entry on the same answer; this component asks again so it is never drawn on its own account.
 *
 * Not the Roblox card, not the Open Cloud key panel and not the Discord bot link: those are other things (lib/identity-links.ts says how).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { MOCK_MODE, mockIdentities } from '../lib/mock';
import { PROVIDER_NAME, useEnabledProviders, type OAuthProvider } from '../lib/auth-providers';
import { emailRedirectTo } from '../lib/auth-flows';
import {
  IDENTITY_COPY,
  NOT_CONNECTED,
  ONLY_WAY_IN,
  canUnlink,
  connectedLine,
  identityFor,
  type IdentityRow,
} from '../lib/identity-links';
import { Failure } from './failure';
import { useToast } from './toast';

/** The pure view: what the card says and offers for the identities the account has. */
export function IdentityCardView({
  provider,
  identities,
  busy,
  onConnect,
  onDisconnect,
}: {
  provider: OAuthProvider;
  identities: readonly IdentityRow[];
  busy: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  const identity = identityFor(identities, provider);
  const copy = IDENTITY_COPY[provider];
  return (
    <>
      <p className="settings-note">{copy.note}</p>
      <p className="settings-note" role="status">{identity ? connectedLine(provider, identity) : NOT_CONNECTED}</p>
      {identity ? (
        canUnlink(identities) ? (
          <button type="button" className="btn" onClick={onDisconnect} disabled={busy}>
            {busy ? 'Disconnecting…' : `Disconnect ${PROVIDER_NAME[provider]}`}
          </button>
        ) : (
          <p className="settings-note">{ONLY_WAY_IN}</p>
        )
      ) : (
        <button type="button" className="btn" onClick={onConnect} disabled={busy}>
          {busy ? 'Connecting…' : `Connect ${PROVIDER_NAME[provider]}`}
        </button>
      )}
    </>
  );
}

export function IdentityCard({ provider, userId }: { provider: OAuthProvider; userId: string }) {
  const enabled = useEnabledProviders();
  const { toast } = useToast();
  const qc = useQueryClient();
  const on = enabled.includes(provider);

  const identities = useQuery({
    queryKey: ['identities', userId],
    queryFn: async (): Promise<IdentityRow[]> => {
      if (MOCK_MODE) return mockIdentities();
      const { data, error } = await supabase.auth.getUserIdentities();
      if (error) throw new Error(error.message);
      return (data?.identities ?? []) as IdentityRow[];
    },
    enabled: on && userId.length > 0,
  });

  // The browser goes to the provider and comes back to Settings; only a failure to start returns here.
  const connect = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.linkIdentity({ provider, options: { redirectTo: emailRedirectTo('/settings') } });
      if (error) throw new Error(error.message);
    },
    onError: (e: Error) => toast(`Couldn't connect ${PROVIDER_NAME[provider]}: ${e.message}`, 'error'),
  });

  const disconnect = useMutation({
    mutationFn: async () => {
      const identity = identityFor(identities.data, provider);
      if (!identity || !canUnlink(identities.data)) throw new Error('There is no other way to sign in to this account.');
      // The identity is handed to Supabase exactly as it listed it.
      const { error } = await supabase.auth.unlinkIdentity(identity as Parameters<typeof supabase.auth.unlinkIdentity>[0]);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['identities', userId] });
      toast(`${PROVIDER_NAME[provider]} disconnected.`, 'success');
    },
    onError: (e: Error) => toast(`Couldn't disconnect ${PROVIDER_NAME[provider]}: ${e.message}`, 'error'),
  });

  if (!on) return null;
  return (
    <>
      <h3 className="settings-sub">{IDENTITY_COPY[provider].title}</h3>
      {/* A failed read is not "not connected": that would be a claim about somebody's account made from a network error. */}
      {identities.isPending && <p className="settings-note settings-note-busy" role="status">Checking…</p>}
      {identities.isError && <Failure error={identities.error} onRetry={() => void identities.refetch()} compact />}
      {identities.data && (
        <IdentityCardView
          provider={provider}
          identities={identities.data}
          busy={connect.isPending || disconnect.isPending}
          onConnect={() => connect.mutate()}
          onDisconnect={() => disconnect.mutate()}
        />
      )}
    </>
  );
}
