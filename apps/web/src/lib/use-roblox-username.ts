// The Roblox username of a Roblox-only account, for the places that would otherwise print its placeholder address.
import { useQuery } from '@tanstack/react-query';
import { fetchRobloxConnection } from './api';
import { isRobloxAccount } from './account-identity';

/**
 * Read from the same query the Connections card uses, so one request serves both. Null for every other account, and until the
 * answer arrives (callers then say "Roblox account", never the placeholder address).
 */
export function useRobloxUsername(user: { id?: string } | null | undefined): string | null {
  const roblox = isRobloxAccount(user);
  const id = user?.id ?? '';
  const connection = useQuery({ queryKey: ['roblox-connection', id], queryFn: fetchRobloxConnection, enabled: roblox && id.length > 0 });
  return roblox ? (connection.data?.username ?? null) : null;
}
