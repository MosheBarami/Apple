#!/usr/bin/env node
/** Private ingestion; never uploads anything to Roblox or prints a credential. */
import {readFile} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createInterface} from 'node:readline';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const [manifestPath] = process.argv.slice(2);
if (!manifestPath) throw new Error('Usage: APPLE_OWNER_JWT=<signed-in JWT> node scripts/ingest-owner-corpus.mjs <manifest.json>');
const token = process.env.APPLE_OWNER_JWT;
if (!token) throw new Error('APPLE_OWNER_JWT must contain the signed-in owner JWT (never an admin key)');
const origin = new URL(process.env.APPLE_OWNER_ORIGIN ?? 'https://apple.moshe-barami111.workers.dev');
if (origin.protocol !== 'https:' && !['localhost','127.0.0.1'].includes(origin.hostname)) throw new Error('HTTPS required');
// JSONL: first line {"ownerAttested":true}, then one component per line.
// Use this for exhaustive exports: only one bounded batch is resident in memory.
async function* components() {
  if (manifestPath.endsWith('.jsonl')) {
    const lines=createInterface({input:createReadStream(manifestPath),crlfDelay:Infinity});
    let attested=false;
    for await (const line of lines) {
      if (!line.trim()) continue;
      const value=JSON.parse(line);
      if (!attested) {if(value.ownerAttested!==true) throw new Error('JSONL starts with ownerAttested:true');attested=true;continue;}
      yield value;
    }
    if (!attested) throw new Error('Empty owner manifest');
  } else {
    const input=JSON.parse(await readFile(manifestPath,'utf8'));
    if(input.ownerAttested!==true || !Array.isArray(input.components)) throw new Error('ownerAttested:true and components array required');
    yield* input.components;
  }
}
const batchSize=Number(process.env.APPLE_OWNER_BATCH_SIZE ?? 8);
const skip=Number(process.env.APPLE_OWNER_SKIP_COMPONENTS ?? 0);
if(!Number.isSafeInteger(batchSize)||batchSize<1||batchSize>100||!Number.isSafeInteger(skip)||skip<0) throw new Error('Invalid bounded batch size or resume offset');
const max = 4 * 1024 * 1024;
const base = dirname(resolve(manifestPath));
async function request(path,body,type) {
  const response = await fetch(new URL(path,origin),{method:type === 'application/json' && path.endsWith('/manifest') ? 'POST' : 'PUT',
    headers:{Authorization:`Bearer ${token}`,'Content-Type':type},body,redirect:'error',signal:AbortSignal.timeout(60_000)});
  if (!response.ok) throw new Error(`Ingestion failed (${response.status}) at ${path}: ${(await response.text()).slice(0,500)}`);
  return response.json();
}
async function verified(file,hash,binary) {
  if (typeof file !== 'string') throw new Error('Each export needs blobFile and, when present, descriptionFile');
  const bytes = await readFile(resolve(base,file));
  if (!bytes.length || bytes.length > max || createHash('sha256').update(bytes).digest('hex') !== hash) throw new Error(`Byte integrity/size failed: ${file}`);
  if (binary && bytes.subarray(0,8).toString() !== '<roblox!') throw new Error(`Binary RBXM required: ${file}`);
  return bytes;
}
let completed=skip,seen=0,batch=[];
async function ingestBatch(batch) {
  // Verify the entire batch before its first write. Writes are sequential; reruns are idempotent.
  const exports=[];
  for(const c of batch) exports.push({c,binary:await verified(c.blobFile,c.componentSha256,true),
    description:c.descriptionSha256 ? await verified(c.descriptionFile,c.descriptionSha256,false) : null});
  await request('/api/owner-corpus/manifest',JSON.stringify({ownerAttested:true,components:batch}),'application/json');
  for (const {c,binary,description} of exports) {
    await request(`/api/owner-corpus/blobs/${c.componentSha256}`,binary,'model/x-rbxm');
    if (description) await request(`/api/owner-corpus/descriptions/${c.descriptionSha256}`,description,'application/json');
    completed++;
    process.stdout.write(`Verified and ingested owner component ${completed}. Resume with APPLE_OWNER_SKIP_COMPONENTS=${completed}.\n`);
  }
}
for await(const c of components()) {
  if(seen++<skip) continue;
  batch.push(c);
  if(batch.length===batchSize){await ingestBatch(batch);batch=[];}
}
if(batch.length) await ingestBatch(batch);
if(seen<skip) throw new Error('Resume offset exceeds manifest length');
