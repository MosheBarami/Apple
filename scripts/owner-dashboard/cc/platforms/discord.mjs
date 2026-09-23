// Discord: the application's public profile (no token needed). A bot token is not in .env, so guild
// counts and commands stay out until DISCORD_BOT_TOKEN is added.
import { fetchJson, cached, ok, fail } from '../http.mjs';

export function discord() {
  const id = process.env.DISCORD_APPLICATION_ID;
  if (!id || !/^\d{5,25}$/.test(id)) return Promise.resolve(ok({ configured: false, need: ['DISCORD_APPLICATION_ID'] }));
  return cached('discord', async () => {
    try {
      const a = await fetchJson(`https://discord.com/api/v10/applications/${id}/rpc`, { label: 'Discord', what: 'פרטי האפליקציה' });
      return ok({ configured: true, bot: Boolean(process.env.DISCORD_BOT_TOKEN), app: { id, name: a?.name ?? null, description: a?.description || null,
        botPublic: Boolean(a?.bot_public), verified: Boolean(a?.is_verified), monetized: Boolean(a?.is_monetized),
        discoverable: Boolean(a?.is_discoverable), scopes: a?.install_params?.scopes || [], hook: Boolean(a?.hook) },
      inviteUrl: `https://discord.com/oauth2/authorize?client_id=${id}`, portalUrl: `https://discord.com/developers/applications/${id}` });
    } catch (e) { return fail(e?.reason || 'Discord לא זמין', { configured: true }); }
  }, 300000);
}
