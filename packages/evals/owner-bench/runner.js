// The owner's 30-request benchmark runner (README.md). Paste into the signed-in owner's browser tab on the
// benchmark project: it uses his session, runs every item in a fresh chat on the clean-Baseplate checkpoint, and
// keeps every result in localStorage['ownerBench:<version>'] and window.ownerBench.
// Start: ownerBenchRun(bank, { from: 'o01' }). Read: JSON.parse(localStorage['ownerBench:owner-30-v1']).
(() => {
  const TURN_MS = 12 * 60_000;
  const projectId = location.pathname.split('/').pop();
  const token = () => {
    const k = Object.keys(localStorage).find((x) => /^sb-.*-auth-token$/.test(x));
    return JSON.parse(localStorage.getItem(k)).access_token;
  };
  const api = async (path, body, method = 'POST') => {
    const r = await fetch(`/api/projects/${projectId}${path}`, { method, headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const text = await r.text();
    try { return { status: r.status, ...JSON.parse(text) }; } catch { return { status: r.status, text }; }
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /** One chat turn over the project socket; resolves on msg_end with the reply text. */
  const turn = (text) => new Promise((resolve) => {
    const ws = new WebSocket(`${location.origin.replace('http', 'ws')}/api/projects/${projectId}/ws`, ['golem.v1', 'golem.jwt.' + token()]);
    let reply = '', started = Date.now(), tools = [];
    const done = (stopReason, error) => { clearTimeout(timer); try { ws.close(); } catch {} resolve({ reply, stopReason, error, ms: Date.now() - started, tools }); };
    const timer = setTimeout(() => done('timeout'), TURN_MS);
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.type === 'hello') ws.send(JSON.stringify({ type: 'chat', text, mode: 'agent' }));
      else if (m.type === 'delta') reply += m.text;
      else if (m.type === 'tool_end') tools.push(`${m.ok ? '✓' : '✗'} ${m.summary}`);
      else if (m.type === 'error' && m.terminal) done('error', `${m.code}: ${m.message}`);
      else if (m.type === 'msg_end') done(m.stopReason);
    };
    ws.onerror = () => done('ws-error');
  });

  window.ownerBenchRun = async (bank, opts = {}) => {
    const key = `ownerBench:${bank.version}`;
    const results = JSON.parse(localStorage.getItem(key) || '{}');
    window.ownerBench = results;
    const cps = await api('/checkpoints', null, 'GET');
    const baseline = (cps.checkpoints || []).find((c) => c.label === 'bench-baseline');
    if (!baseline) throw new Error('no bench-baseline checkpoint on this project');
    let go = !opts.from;
    for (const item of bank.items) {
      if (!go && item.id === opts.from) go = true;
      if (!go || (results[item.id] && !opts.redo)) continue;
      const row = { id: item.id, category: item.category, turns: item.turns, at: new Date().toISOString(), status: 'running' };
      results[item.id] = row; localStorage.setItem(key, JSON.stringify(results));
      try {
        // A clean place or no run (live 2026-10-02: restore alone left earlier builds standing).
        const reset = await api('/bench/reset');
        row.reset = reset.ok === true;
        if (!row.reset) throw new Error(`the place could not be emptied: ${JSON.stringify(reset).slice(0, 300)}`);
        const restored = await api('/restore', { checkpointId: baseline.id });
        row.restored = restored.ok === true; row.restoreInfo = JSON.stringify(restored).slice(0, 300);
        if (!row.restored) throw new Error(`the baseline could not be restored: ${row.restoreInfo}`);
        await sleep(3000);
        row.turnResults = [];
        for (const t of item.turns) {
          const r = await turn(t);
          row.turnResults.push({ text: t, stopReason: r.stopReason, ms: r.ms, error: r.error, tools: r.tools.slice(0, 40) });
          row.reply = r.reply;
          if (r.stopReason !== 'done') break;
          await sleep(2000);
        }
        const msgs = await api('/messages', null, 'GET');
        const assistant = (msgs.messages || []).filter((m) => m.role === 'assistant');
        row.credits = assistant.reduce((a, m) => a + (m.creditsSpent || 0), 0);
        row.steps = assistant.reduce((a, m) => a + ((m.toolTrace || []).length), 0);
        row.ms = row.turnResults.reduce((a, t) => a + t.ms, 0);
        const ev = await api('/bench/evaluate', { request: item.turns.join(' → then: '), reply: row.reply || '' });
        Object.assign(row, { eval: ev, total: ev.total, scores: ev.scores, critique: ev.critique });
        row.status = 'done';
      } catch (e) { row.status = 'error'; row.error = String(e); }
      localStorage.setItem(key, JSON.stringify(results));
      if (opts.only) break;
    }
    return results;
  };
})();
