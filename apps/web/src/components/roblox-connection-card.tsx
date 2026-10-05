/**
 * SIGN IN WITH ROBLOX, as the Connections section shows it: who is linked, and the way to disconnect.
 *
 * Not the Open Cloud key panel beside it. That one is a credential a person pastes in; this is the Roblox
 * account they sign in with. What each sentence says, and what Disconnect does, is decided in
 * lib/roblox-signin.ts and by the worker; this file is a query, a button and the words they return.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { disconnectRobloxSignIn, fetchRobloxConnection } from '../lib/api';
import { describeConnection, disconnectMessage } from '../lib/roblox-signin';
import { Failure } from './failure';
import { useToast } from './toast';

export function RobloxConnectionCard({ userId }: { userId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const connection = useQuery({
    queryKey: ['roblox-connection', userId],
    queryFn: fetchRobloxConnection,
    enabled: userId.length > 0,
  });
  const disconnect = useMutation({
    mutationFn: disconnectRobloxSignIn,
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ['roblox-connection', userId] });
      toast(disconnectMessage(result), 'success');
    },
    onError: (e: Error) => toast(`Couldn't disconnect: ${e.message}`, 'error'),
  });

  const view = connection.data ? describeConnection(connection.data) : null;

  return (
    <>
      <h3 className="settings-sub">Sign in with Roblox</h3>
      {/* A failed read is not "not connected": that would be a claim about somebody's Roblox account made
          from a network error. */}
      {connection.isPending && <p className="settings-note settings-note-busy" role="status">Checking…</p>}
      {connection.isError && <Failure error={connection.error} onRetry={() => void connection.refetch()} compact />}
      {view && (
        <>
          <p className="settings-note" role="status">{view.status}</p>
          {view.canDisconnect && (
            <button type="button" className="btn" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>
              {disconnect.isPending ? 'Disconnecting…' : 'Disconnect Roblox'}
            </button>
          )}
          {view.caution && <p className="settings-note">{view.caution}</p>}
        </>
      )}
    </>
  );
}
