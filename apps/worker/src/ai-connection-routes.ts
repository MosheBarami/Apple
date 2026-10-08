import { Hono } from 'hono';
import { ENGINE_RELEASE, INFERENCE_ROUTES, isAiProviderId, parseInferenceSelection, type AiModelCatalog } from '@studpilot/shared';
import type { AuthedUser, Env } from './env';
import { createAiConnection, deleteAiConnection, getAiConnection, listAiConnections, replaceAiConnection,
  updateAiConnectionCheck, validateAiCredentials } from './ai-connections';
import { API_PROVIDERS } from './providers/api-registry';
import { discoverApiModels } from './providers/api-catalog';
import { invokeApi, ApiInvocationError } from './providers/api-transport';
import { inferencePreferenceKey, savedInferenceSelection, runnerRequest } from './inference-runs';

export const aiConnectionRoutes = new Hono<{ Bindings: Env; Variables: { user: AuthedUser } }>();
// The parent app verifies JWT and rate-limits /api/*. Defense in depth for mounting/tests.
aiConnectionRoutes.use('*', async (c, next) => {
  if (!c.get('user')?.userId) return c.json({ error: 'unauthorized' }, 401);
  c.header('Cache-Control', 'private, no-store'); await next();
});
aiConnectionRoutes.use('/connections*', async (c, next) => {
  // Existing connections can still be inspected or removed during a rollback.
  if (['POST', 'PUT'].includes(c.req.method) && c.env.AI_BYOK_ENABLED !== 'true') return c.json({
    error: 'route_disabled', message: 'Bring Your Own Key is not enabled in this environment.' }, 503);
  await next();
});
aiConnectionRoutes.onError((error, c) => c.json({ error: 'connection_unavailable',
  message: error instanceof ApiInvocationError ? error.message : 'AI connections are unavailable. Try again or replace the connection.' }, 503));

aiConnectionRoutes.get('/providers', (c) => c.json({ providers: Object.values(API_PROVIDERS).map((provider) => ({
  id: provider.id, name: provider.name, producer: provider.producer, source: provider.docs,
  accountIdRequired: provider.id === 'cloudflare', endpoint: provider.origin,
  billing: 'Your provider bills your API account directly. StudPilot service limits still apply.',
})) }));
aiConnectionRoutes.get('/connections', async (c) => c.json({ connections: await listAiConnections(c.env, c.get('user').userId) }));
aiConnectionRoutes.get('/selection', async (c) => c.json({ selection: await savedInferenceSelection(c.env, c.get('user').userId),
  routes: INFERENCE_ROUTES, engine: ENGINE_RELEASE }));
aiConnectionRoutes.put('/selection', async (c) => {
  const body = await c.req.json().catch(() => null), selection = parseInferenceSelection(body?.selection);
  if (!selection) return c.json({ error: 'invalid_selection' }, 400);
  if (selection.route === 'byok') {
    const connection = await getAiConnection(c.env, c.get('user').userId, selection.connectionId);
    if (!connection || connection.view.provider !== selection.provider) return c.json({ error: 'connection_not_found' }, 404);
  }
  await c.env.KV.put(inferencePreferenceKey(c.get('user').userId), JSON.stringify(selection));
  return c.json({ selection });
});
aiConnectionRoutes.get('/opencode/models', async (c) => {
  if (c.env.AI_OPENCODE_ENABLED !== 'true') return c.json({ available: false, models: [],
    message: 'OpenCode Free is awaiting a verified and permitted service runner.' }, 503);
  try {
    const response = await runnerRequest(c.env, '/v1/models', 'GET', undefined, c.req.raw.signal);
    if (!response.ok) return c.json({ available: false, models: [], message: 'OpenCode Free runner is unavailable.' }, 503);
    return c.json(await response.json());
  } catch { return c.json({ available: false, models: [], message: 'OpenCode Free is awaiting a verified service runner.' }, 503); }
});

aiConnectionRoutes.post('/connections', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!isAiProviderId(body?.provider) || typeof body?.name !== 'string' || !validateAiCredentials(body?.credentials)
    || (body.provider === 'cloudflare' && !body.credentials.accountId)) return c.json({ error: 'invalid_connection',
    message: 'Choose a supported provider, name and API credential. Cloudflare also needs an account ID.' }, 400);
  const connection = await createAiConnection(c.env, c.get('user').userId, body.provider, body.name, body.credentials);
  return c.json({ connection }, 201);
});
aiConnectionRoutes.put('/connections/:id', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (typeof body?.name !== 'string' || !validateAiCredentials(body?.credentials)) return c.json({ error: 'invalid_connection' }, 400);
  const existing = await getAiConnection(c.env, c.get('user').userId, c.req.param('id'));
  if (!existing) return c.json({ error: 'connection_not_found' }, 404);
  if (existing.view.provider === 'cloudflare' && !body.credentials.accountId) return c.json({ error: 'invalid_connection',
    message: 'Cloudflare requires its account ID as well as the replacement API token.' }, 400);
  const connection = await replaceAiConnection(c.env, c.get('user').userId, c.req.param('id'), body.name, body.credentials);
  return connection ? c.json({ connection }) : c.json({ error: 'connection_not_found' }, 404);
});
aiConnectionRoutes.delete('/connections/:id', async (c) => {
  const removed = await deleteAiConnection(c.env, c.get('user').userId, c.req.param('id'));
  return removed ? c.json({ removed: true }) : c.json({ error: 'connection_not_found' }, 404);
});

aiConnectionRoutes.post('/connections/:id/models/refresh', async (c) => {
  const owner = c.get('user').userId, id = c.req.param('id');
  const connection = await getAiConnection(c.env, owner, id);
  if (!connection || !isAiProviderId(connection.view.provider)) return c.json({ error: 'connection_not_found' }, 404);
  if (connection.view.checkedAt && Date.now() - Date.parse(connection.view.checkedAt) < 30_000) {
    return c.json({ error: 'refresh_limited', message: 'Wait 30 seconds before checking this connection again.' }, 429);
  }
  try {
    const catalog = await discoverApiModels(connection.view.provider, connection.credentials, { signal: c.req.raw.signal });
    if (!await updateAiConnectionCheck(c.env, owner, id, connection.view.revision, 'catalog_loaded', catalog, catalog.version)) {
      return c.json({ error: 'connection_changed', message: 'The key changed while checking. Refresh the connection.' }, 409);
    }
    return c.json({ catalog, status: 'catalog_loaded', inferenceVerified: false,
      message: 'Models loaded. Test a selected model to verify inference access.' });
  } catch (error) {
    await updateAiConnectionCheck(c.env, owner, id, connection.view.revision,
      error instanceof ApiInvocationError && error.code === 'auth' ? 'invalid' : 'unavailable');
    return c.json({ error: error instanceof ApiInvocationError ? error.code : 'catalog_unavailable',
      message: error instanceof ApiInvocationError ? error.message : 'The provider model catalog could not be loaded.' }, 422);
  }
});
aiConnectionRoutes.get('/connections/:id/models', async (c) => {
  const connection = await getAiConnection(c.env, c.get('user').userId, c.req.param('id'));
  return connection ? c.json({ catalog: connection.catalog, connection: connection.view }) : c.json({ error: 'connection_not_found' }, 404);
});

/** An explicit test click may use provider tokens; loading a public model list never verifies a key. */
aiConnectionRoutes.post('/connections/:id/check', async (c) => {
  const body = await c.req.json().catch(() => null), owner = c.get('user').userId, id = c.req.param('id');
  const connection = await getAiConnection(c.env, owner, id);
  if (!connection || !isAiProviderId(connection.view.provider)) return c.json({ error: 'connection_not_found' }, 404);
  const catalog = connection.catalog as AiModelCatalog | null;
  const model = catalog?.models?.find((model) => model.id === body?.modelId && model.provider === connection.view.provider);
  if (!model || model.lifecycle === 'retired') return c.json({ error: 'model_unavailable', message: 'Load models and choose a current model first.' }, 422);
  try {
    const result = await invokeApi(connection.view.provider, connection.credentials, { modelId: model.id,
      messages: [{ role: 'user', content: 'Reply with exactly OK.' }], maxTokens: 512, temperature: 0.25 }, { signal: c.req.raw.signal });
    if (result.finishReason !== 'stop' || !result.text.trim()) return c.json({ error: 'check_incomplete', message: 'The provider did not finish the test response.' }, 422);
    const models = catalog!.models.map((record) => record.id === model.id ? { ...record, access: 'inference-verified' as const,
      runtimeCheckedAt: new Date().toISOString(), availability: { kind: 'available' as const, checkedAt: new Date().toISOString() } } : record);
    if (!await updateAiConnectionCheck(c.env, owner, id, connection.view.revision, 'verified', { ...catalog, models }, catalog!.version)) {
      return c.json({ error: 'connection_changed' }, 409);
    }
    return c.json({ verified: true, provider: result.provider, modelId: result.model, usage: result.usage });
  } catch (error) {
    await updateAiConnectionCheck(c.env, owner, id, connection.view.revision,
      error instanceof ApiInvocationError && error.code === 'auth' ? 'invalid' : 'unavailable', catalog, catalog!.version);
    return c.json({ error: error instanceof ApiInvocationError ? error.code : 'check_failed',
      message: error instanceof ApiInvocationError ? error.message : 'The provider connection test failed.' }, 422);
  }
});

/** A separate explicit probe measures native tools; a plain chat 200 does not establish this. */
aiConnectionRoutes.post('/connections/:id/capabilities', async (c) => {
  const probeStarted = Date.now();
  const body = await c.req.json().catch(() => null), owner = c.get('user').userId, id = c.req.param('id');
  const connection = await getAiConnection(c.env, owner, id);
  if (!connection || !isAiProviderId(connection.view.provider)) return c.json({ error: 'connection_not_found' }, 404);
  const catalog = connection.catalog as AiModelCatalog | null;
  const model = catalog?.models?.find((model) => model.id === body?.modelId && model.provider === connection.view.provider);
  if (!model || model.lifecycle === 'retired') return c.json({ error: 'model_unavailable' }, 422);
  try {
    const result = await invokeApi(connection.view.provider, connection.credentials, { modelId: model.id,
      messages: [{ role: 'user', content: 'Call probe_result with ok=true. This is an inference test; no Studio operation runs.' }],
      tools: [{ name: 'probe_result', description: 'Return the verified test result.', parameters: { type: 'object',
        properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false } }], requiredTool: 'probe_result',
      maxTokens: 2048, temperature: 0.25 }, { signal: c.req.raw.signal });
    if (result.truncated || !['stop', 'tool_calls'].includes(result.finishReason)
      || (!result.text.trim() && !result.toolCalls.length)) return c.json({ error: 'check_incomplete',
      message: 'The provider did not finish the tool-support test. No capability verdict was saved.' }, 422);
    let tools = false;
    if (!result.truncated && result.toolCalls.length === 1 && result.toolCalls[0]?.name === 'probe_result') {
      try { const args = JSON.parse(result.toolCalls[0].arguments);
        tools = args && typeof args === 'object' && !Array.isArray(args)
          && Object.keys(args).length === 1 && args.ok === true;
      } catch { /* invalid parameters are not verified */ }
    }
    const checkedAt = new Date().toISOString();
    const previous = model.quality?.tools;
    const latenciesMs = [...(previous?.latenciesMs ?? []).slice(-31), Date.now() - probeStarted];
    const sortedLatency = [...latenciesMs].sort((a, b) => a - b);
    const measured = { attempts: (previous?.attempts ?? 0) + 1, passed: (previous?.passed ?? 0) + (tools ? 1 : 0),
      medianLatencyMs: sortedLatency[Math.floor(sortedLatency.length / 2)] ?? null, latenciesMs };
    const models = catalog!.models.map((record) => record.id === model.id ? { ...record,
      capabilities: { ...record.capabilities, tools: tools ? true : record.capabilities.tools },
      verification: { ...record.verification, tools: { passed: tools, checkedAt } },
      quality: { ...record.quality, tools: measured },
      availability: { kind: 'available' as const, checkedAt },
      access: 'inference-verified' as const, runtimeCheckedAt: checkedAt } : record);
    if (!await updateAiConnectionCheck(c.env, owner, id, connection.view.revision, 'verified', { ...catalog, models }, catalog!.version)) {
      return c.json({ error: 'connection_changed' }, 409);
    }
    return c.json({ tools, provider: result.provider, modelId: result.model, usage: result.usage,
      message: tools ? 'Native tool calling verified. Building quality still requires Studio evaluation.' : 'This model did not pass the native tool test.' });
  } catch (error) {
    return c.json({ error: error instanceof ApiInvocationError ? error.code : 'capability_check_failed',
      message: error instanceof ApiInvocationError ? error.message : 'The model capability test could not be completed.' }, 422);
  }
});
