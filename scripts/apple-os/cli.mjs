#!/usr/bin/env node
import { initVault, searchWiki, vaultPath } from './vault.mjs';
import { runBrief, latestBrief, collectBriefFacts } from './brief.mjs';
import { routeRequest } from './route.mjs';
import { transcribeFile, speakLocal, voiceStatus } from './voice.mjs';
import { SKILLS } from './skills.mjs';
import { discoverWorkflows, saveDiscovery } from './discover.mjs';

const [action, ...args] = process.argv.slice(2);
try {
  if (action === 'init') console.log(JSON.stringify(initVault(), null, 2));
  else if (action === 'brief') console.log(runBrief().path);
  else if (action === 'latest') console.log(latestBrief()?.text ?? 'No brief yet. Run: node scripts/apple-os/cli.mjs brief');
  else if (action === 'status') console.log(JSON.stringify({ vault: vaultPath(), voice: voiceStatus(), jevConfigured: Boolean(process.env.TYPESAFE_API_KEY), facts: collectBriefFacts() }, null, 2));
  else if (action === 'skills') console.log(JSON.stringify(SKILLS, null, 2));
  else if (action === 'discover') { const result = await discoverWorkflows(); console.log(JSON.stringify({ ...result, path: saveDiscovery(result) }, null, 2)); }
  else if (action === 'search') console.log(JSON.stringify(searchWiki(args.join(' ')), null, 2));
  else if (action === 'route') console.log(JSON.stringify(await routeRequest(args.join(' ')), null, 2));
  else if (action === 'transcribe') console.log(transcribeFile(args[0]));
  else if (action === 'speak') speakLocal(args.join(' '));
  else { console.error('Usage: node scripts/apple-os/cli.mjs init|brief|latest|status|skills|discover|search WORDS|route REQUEST|transcribe AUDIO|speak TEXT'); process.exitCode = 2; }
} catch (error) { console.error(error.message); process.exitCode = 1; }
