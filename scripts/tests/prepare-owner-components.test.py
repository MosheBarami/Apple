import importlib.util,pathlib,tempfile,json,hashlib,unittest
spec=importlib.util.spec_from_file_location('prepare',pathlib.Path(__file__).parents[1]/'prepare-owner-components.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Boundary(unittest.TestCase):
 def test_complete_inert_description_and_corrupt_cas_refusal(self):
  with tempfile.TemporaryDirectory() as d:
   p=pathlib.Path(d);(p/'cas').mkdir();props=b'<Item><Properties><string name="Name">Panel</string></Properties></Item>';code=b'-- original CRLF\r\nreturn "owner"\r\n'
   sha=lambda b:hashlib.sha256(b).hexdigest();sid='a'*64;nid=sid+':2'
   (p/'cas/p').write_bytes(props);(p/'cas/s').write_bytes(code)
   node=dict(id=nid,source_id=sid,parent_id=sid+':0',ordinal=2,referent='2',name='Panel',path='game.Workspace.Panel',**{'class':'ModuleScript'},component_sha=sha(props),script_sha=sha(code),propertyFile='cas/p',scriptFile='cas/s')
   (p/'nodes.jsonl').write_text(json.dumps(node)+'\n')
   for file in ['script-context','media','dependencies']:(p/(file+'.jsonl')).write_text('')
   (p/'reference-changes.jsonl').write_text(json.dumps(dict(nodeId=nid,property='Target',targetNodeId=sid+':3',resolvedInternal=False))+'\n')
   bundle=dict(output=str(p),sources=[dict(id=sid,name='owner.rbxl',normalized_sha='b'*64,status='indexed')],counts={'selectedNodes':1},selectedRootContext=[{'id':nid}],referents='explicit nulls')
   result=m.description(bundle,{'nativeInstances':0,'nativeSha256':'c'*64},[])
   self.assertEqual(result['scripts'][0]['source'],code.decode());self.assertEqual(result['nodes'][0]['propertiesXML'],props.decode());self.assertFalse(result['normalizedNodeMappingProved']);self.assertFalse(result['verifiedGameplay']);self.assertNotIn(str(p),json.dumps(result));self.assertEqual(len(result['referenceChanges']),1)
   (p/'cas/s').write_bytes(b'tampered')
   with self.assertRaises(ValueError):m.description(bundle,{},[])
 def test_native_identity_admission_refuses_mismatch(self):
  with tempfile.TemporaryDirectory() as d:
   p=pathlib.Path(d);data=b'<roblox!native';job=dict(nativeInstances=1,nativeBytes=len(data),nativeSha256=hashlib.sha256(data).hexdigest())
   with self.assertRaises(ValueError):m.persist({},job,[],data,'a'*64+':0',p)
   with self.assertRaises(ValueError):m.persist({},job,[{}],b'<roblox!corrupt','a'*64+':0',p)
 def test_path_escape_and_transport_integrity(self):
  with tempfile.TemporaryDirectory() as d:
   with self.assertRaises(ValueError):m.verified_cas(pathlib.Path(d),'../escape','a'*64)
  with self.assertRaises(ValueError):m.validate_chunk({'encoding':'base64','offset':0,'totalBytes':2,'sha256':'a'*64,'chunkSha256':'a'*64,'data':'YWI=','nextOffset':None},0,2,'a'*64)
if __name__=='__main__':unittest.main()
