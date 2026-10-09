/**
 * An asset uploaded into the person's OWN Roblox account and waited on until Roblox names it: through their OAuth upload
 * grant (Settings > Connect Roblox for uploads) first, then an Open Cloud key they stored. Shared by make_image (Image)
 * and generate_sound with upload (Audio). Nothing here writes to any account but theirs.
 */
import { getUploadStatus, uploadAsset as uploadToOwnAccount } from './creator-dashboard';
import { robloxUploadAccess } from './roblox-oauth';
import { pollOperation, uploadAsset as postAssetWithGrant, type RobloxUploadType } from './roblox-upload';

export async function uploadToOwnRoblox(
  env: unknown,
  userId: string,
  bytes: Uint8Array,
  contentType: string,
  type: RobloxUploadType,
  name: string,
): Promise<{ assetId: string | number } | { error: string }> {
  const file = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const grant = await robloxUploadAccess(env as never, userId).catch((e: unknown) => ({ ok: false as const, error: String(e) }));
  if (grant.ok) {
    const account = { ROBLOX_BEARER: grant.accessToken, ROBLOX_CREATOR_USER_ID: grant.robloxUserId, ROBLOX_UPLOAD_AUTHORISED_FOR: grant.robloxUserId };
    let up = await postAssetWithGrant(account, { file, contentType, displayName: name, description: 'Made with StudPilot', type, expectedPrice: 0 });
    for (let i = 0; i < 10 && up.ok && !up.done; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      up = await pollOperation(account, up.operationId);
    }
    if (up.ok && up.done) return { assetId: up.assetId };
    return { error: up.ok ? `Roblox is still processing the upload (operation ${up.operationId}); try again in a moment` : up.error };
  }
  const up = await uploadToOwnAccount(env as never, userId, { file, contentType, displayName: name, description: 'Made with StudPilot', type });
  if (!up.ok) return { error: `${grant.error}. ${up.error}` };
  if (up.data.assetId !== null) return { assetId: up.data.assetId };
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const st = await getUploadStatus(env as never, userId, up.data.operationId);
    if (st.ok && st.data.assetId !== null) return { assetId: st.data.assetId };
    if (!st.ok) return { error: `uploaded, but its status could not be read (${st.error}); operation ${up.data.operationId}` };
  }
  return { error: `Roblox is still processing the upload (operation ${up.data.operationId}); try again in a moment` };
}
