import { Hono } from 'hono';
import type { Env, AuthedUser } from './env';
import { ingestOwnerBlob, ingestOwnerManifest, ingestOwnerDescription, readOwnerGrant, OWNER_COMPONENT_MAX_BYTES } from './owner-corpus';
export const ownerCorpusRoutes = new Hono<{ Bindings: Env; Variables: { user: AuthedUser } }>();
// This read-only bearer capability is minted only after owner-scoped lookup and byte verification.
ownerCorpusRoutes.get('/content/:token', async c => {
  try {
    const content = await readOwnerGrant(c.env,c.req.param('token'));
    return content ? c.json(content,200,{'Cache-Control':'private, no-store'}) : c.json({error:'content grant expired or unavailable'},404);
  } catch { return c.json({error:'component bytes could not be verified'},409); }
});
ownerCorpusRoutes.post('/manifest', async c => {
  const user = c.get('user');
  if (!user) return c.json({error:'unauthorized'},401);
  try { return c.json(await ingestOwnerManifest(c.env,user.userId,await c.req.json())); }
  catch (error) { return c.json({error:error instanceof Error ? error.message : 'manifest failed'},400); }
});
ownerCorpusRoutes.put('/blobs/:sha', async c => {
  const user = c.get('user');
  if (!user) return c.json({error:'unauthorized'},401);
  const length = Number(c.req.header('Content-Length'));
  if (!Number.isSafeInteger(length) || length < 1 || length > OWNER_COMPONENT_MAX_BYTES) return c.json({error:'bounded Content-Length required'},413);
  try { return c.json(await ingestOwnerBlob(c.env,user.userId,c.req.param('sha'),await c.req.arrayBuffer())); }
  catch (error) { return c.json({error:error instanceof Error ? error.message : 'blob failed'},400); }
});

ownerCorpusRoutes.put('/descriptions/:sha', async c => {
  const user = c.get('user');
  if (!user) return c.json({error:'unauthorized'},401);
  const length = Number(c.req.header('Content-Length'));
  if (!Number.isSafeInteger(length) || length < 1 || length > OWNER_COMPONENT_MAX_BYTES) return c.json({error:'bounded Content-Length required'},413);
  try { return c.json(await ingestOwnerDescription(c.env,user.userId,c.req.param('sha'),await c.req.arrayBuffer())); }
  catch (error) { return c.json({error:error instanceof Error ? error.message : 'description failed'},400); }
});
