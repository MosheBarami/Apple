#!/usr/bin/env python3
"""Adapt existing local gateway exports to bounded private cloud ingestion. No decoder/ingestor."""
import argparse,base64,hashlib,json,pathlib,time,urllib.request,urllib.parse
MAX=4*1024*1024
SHA=lambda data:hashlib.sha256(data).hexdigest()
def verified_cas(root,relative,sha):
 p=(root/relative).resolve()
 if not p.is_relative_to(root.resolve()):raise ValueError('bundle path escape')
 if p.stat().st_size>8*1024*1024:raise ValueError('CAS record exceeds bound')
 data=p.read_bytes()
 if SHA(data)!=sha:raise ValueError('bundle CAS integrity failed')
 return data

def records(root,name):
 with (root/(name+'.jsonl')).open() as f:
  for line in f:
   if line.strip():yield json.loads(line)

def description(bundle,job,mapping):
 root=pathlib.Path(bundle['output']);nodes=[];scripts=[];property_bytes=0
 for row in records(root,'nodes'):
  props=verified_cas(root,row['propertyFile'],row['component_sha']).decode('utf-8')
  node={k:v for k,v in row.items() if k not in ('propertyFile','scriptFile')};node['propertiesXML']=props;node['propertiesRepresentation']='normalized-Lune-shallow-XML';nodes.append(node)
  property_bytes+=len(props.encode())
  if len(nodes)>20000 or property_bytes>MAX:raise ValueError('description properties exceed bounded import size')
  if row.get('scriptFile'):
   data=verified_cas(root,row['scriptFile'],row['script_sha'])
   scripts.append(dict(id=row['id'],path=row['path'],className=row['class'],source=data.decode('utf-8'),sha256=row['script_sha'],representation='normalized-Lune-UTF8',sourceExecuted=False))
 result=dict(schemaVersion=1,nodes=nodes,scripts=scripts,sources=bundle['sources'],selectedRootContext=bundle['selectedRootContext'],counts=bundle['counts'],media=list(records(root,'media')),dependencies=list(records(root,'dependencies')),referenceChanges=list(records(root,'reference-changes')),staticCodeContext=list(records(root,'script-context')),nativeMap=mapping,
  native=dict(sha256=job.get('nativeSha256'),instances=job.get('nativeInstances'),scriptFree=True,scriptsExecuted=0,representation='reconstructed-native-RBXM',originalSourceBytes=False),
  originalSource=dict(storage='owner-local-CAS',identity='sourceSHA',exactBinaryStrings='available-through-owner-original-string-tools-when-extracted'),normalizedNodeMappingProved=False,
  permission='owner-attested-commercial-use',allGenresAllowed=True,actualScreenshotRequired=True,verifiedGameplay=False,crossBundleRefRepairImplemented=False)
 data=json.dumps(result,ensure_ascii=False,separators=(',',':')).encode()
 if len(data)>MAX:raise ValueError('complete description exceeds 4 MiB; select smaller subtrees')
 return result

def validate_chunk(c,offset,total,sha):
 data=base64.b64decode(c['data'],validate=True)
 if c.get('encoding')!='base64' or c.get('offset')!=offset or c.get('totalBytes')!=total or c.get('sha256')!=sha or not data or len(data)>131072 or SHA(data)!=c.get('chunkSha256') or offset+len(data)>total or c.get('nextOffset')!=(offset+len(data) if offset+len(data)<total else None):raise ValueError('native chunk integrity failed')
 return data

class Gateway:
 def __init__(self,ready):
  r=json.loads(pathlib.Path(ready).read_text());u=urllib.parse.urlsplit(r['url'])
  if u.scheme!='http' or u.hostname!='127.0.0.1' or u.path not in ('','/'):raise ValueError('owner gateway must be loopback')
  self.cache=pathlib.Path(r['cache']);self.url=r['url'];self.key=pathlib.Path(r['keyFile']).read_text().strip()
 def request(self,path,body=None,**query):
  url=self.url+path+('?' +urllib.parse.urlencode(query) if query else '')
  req=urllib.request.Request(url,data=json.dumps(body).encode() if body is not None else None,headers={'Authorization':'Bearer '+self.key,'Content-Type':'application/json'})
  # Never include URLs, credentials or source/server errors in logging.
  with urllib.request.urlopen(req,timeout=20) as r:return json.load(r)
 def export(self,nid,dest):
  job=self.request('/v1/materialize',{'id':nid});deadline=time.monotonic()+120
  while job.get('status')=='pending':
   if time.monotonic()>deadline:raise ValueError('materialization deadline reached')
   time.sleep(1);job=self.request('/v1/job',jobId=job['jobId'])
  if job.get('status')!='ready':raise ValueError('gateway materialization refused selected subtree')
  if job.get('nativeScripts')!=0 or not 0<job['nativeBytes']<=MAX or not 0<job['nativeInstances']<=20000:raise ValueError('native admission failed')
  key=job['jobId'];data=bytearray()
  while len(data)<job['nativeBytes']:
   c=self.request('/v1/artifact',jobId=key,offset=len(data),limit=131072);data.extend(validate_chunk(c,len(data),job['nativeBytes'],job['nativeSha256']))
  if SHA(data)!=job['nativeSha256'] or data[:8]!=b'<roblox!':raise ValueError('native whole SHA/header failed')
  bundle=self.request('/v1/bundle-manifest',jobId=key);bundle['output']=str(self.cache/key/'bundle');mapping=[];after=0
  while True:
   page=self.request('/v1/native-map',jobId=key,limit=100,after=after);mapping.extend(page['items'])
   if page['nextAfter'] is None:break
   if page['nextAfter']<=after:raise ValueError('map cursor failed')
   after=page['nextAfter']
  if len(mapping)!=job['nativeInstances']:raise ValueError('native identity count failed')
  return persist(bundle,job,mapping,data,nid,dest)

def persist(bundle,job,mapping,data,nid,dest):
 if not 0<job['nativeInstances']<=20000 or len(mapping)!=job['nativeInstances'] or SHA(data)!=job['nativeSha256'] or len(data)!=job['nativeBytes'] or len(data)>MAX or data[:8]!=b'<roblox!':raise ValueError('native admission failed')
 desc=description(bundle,job,mapping);by_id={n['id']:n for n in desc['nodes']};seen=set()
 for entry in mapping:
  node_id=entry.get('nodeId',entry.get('node_id'));indices=entry['nativeChildIndices'];node=by_id.get(node_id)
  if node_id in seen or not node or entry['namespace']!='R'+SHA(node_id.encode()) or entry.get('className',entry.get('class'))!=node['class'] or not indices or any(type(i)!=int or i<0 for i in indices):raise ValueError('native identity mapping failed')
  seen.add(node_id)
 row=next(n for n in desc['nodes'] if n['id']==nid)
 # Service roots are not ordinary insertion containers. Select their concrete children.
 if row['class'] not in ('Model','Folder','Frame','ScreenGui','SurfaceGui','BillboardGui','CanvasGroup','Part','MeshPart'):raise ValueError('select an insertable component, not a service/script root')
 payload=json.dumps(desc,ensure_ascii=False,separators=(',',':')).encode();stem=SHA(nid.encode())
 (dest/(stem+'.rbxm')).write_bytes(data);(dest/(stem+'.description.json')).write_bytes(payload)
 excluded=[r for r in desc['referenceChanges'] if not r['resolvedInternal']]
 return dict(id='owner:'+nid,name=row['name'],className=row['class'],path=row['path'],sourceSha256=row['source_id'],componentSha256=SHA(data),byteLength=len(data),summary=row.get('summary') or row['name'],usage=(row.get('usage') or 'Reuse owner component')+'; script-free native subtree; source/hierarchy/properties retained as inert data; native visual review required.',dependencyIds=sorted(set('owner:'+r['targetNodeId'] for r in excluded)),unresolvedRefs=[r['nodeId']+'.'+r['property']+'->'+r['targetNodeId'] for r in excluded],scriptsPreserved=True,descriptionSha256=SHA(payload),blobFile=stem+'.rbxm',descriptionFile=stem+'.description.json')

def main():
 p=argparse.ArgumentParser();p.add_argument('ids',nargs='*');p.add_argument('--cached-export',type=pathlib.Path,action='append',default=[]);p.add_argument('--ready-file',default='/private/tmp/studpilot-owner-gateway-ready.json');p.add_argument('--output',type=pathlib.Path,required=True);a=p.parse_args()
 a.output.mkdir(parents=True,exist_ok=True);g=Gateway(a.ready_file);manifest=a.output/'manifest.jsonl';existing=set()
 if manifest.exists():
  for line in manifest.read_text().splitlines()[1:]:
   c=json.loads(line);verified_cas(a.output,c['blobFile'],c['componentSha256']);verified_cas(a.output,c['descriptionFile'],c['descriptionSha256']);existing.add(c['id'])
 else:manifest.write_text(json.dumps({'ownerAttested':True})+'\n')
 completed=0;failed=[]
 for cached in a.cached_export:
  job=json.loads((cached/'receipt.json').read_text());nid=job['nodeId']
  if 'owner:'+nid in existing:continue
  data=(cached/'native.rbxm').read_bytes()
  if SHA(data)!=job['nativeSha256'] or len(data)!=job['nativeBytes'] or len(data)>MAX or data[:8]!=b'<roblox!' or job.get('nativeScripts')!=0:raise ValueError('cached native receipt failed')
  bundle=json.loads((cached/'bundle/manifest.json').read_text());bundle['output']=str(cached/'bundle');mapping=list(records(cached,'native-map'))
  if len(mapping)!=job['nativeInstances']:raise ValueError('cached native map count failed')
  c=persist(bundle,job,mapping,data,nid,a.output)
  with manifest.open('a') as f:f.write(json.dumps(c,ensure_ascii=False)+'\n')
  existing.add(c['id']);completed+=1
  print(json.dumps(dict(prepared=completed,nativeBytes=c['byteLength'],unresolvedRefs=len(c['unresolvedRefs']))),flush=True)
 for nid in dict.fromkeys(a.ids):
  if 'owner:'+nid in existing:continue
  try:
   c=g.export(nid,a.output)
   with manifest.open('a') as f:f.write(json.dumps(c,ensure_ascii=False)+'\n')
   completed+=1;print(json.dumps(dict(prepared=completed,nativeBytes=c['byteLength'],unresolvedRefs=len(c['unresolvedRefs']))),flush=True)
  except Exception as e:
   failed.append(dict(id=nid,error=type(e).__name__));print(json.dumps(dict(preparationFailed=len(failed),errorType=type(e).__name__)),flush=True)
 (a.output/'preparation-receipt.json').write_text(json.dumps(dict(prepared=completed,alreadyPrepared=len(existing),failed=failed,uploaded=False,scriptsExecuted=0),indent=2))
if __name__=='__main__':main()
