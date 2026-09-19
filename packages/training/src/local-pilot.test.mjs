import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const source = fileURLToPath(new URL('./local_pilot.py', import.meta.url));
// No MLX import/model load/network or training: the guards are standard-library Python.
function check(code) {
  const result = spawnSync('python3', ['-c', `import importlib.util\ns=importlib.util.spec_from_file_location('pilot',${JSON.stringify(source)})\nm=importlib.util.module_from_spec(s)\ns.loader.exec_module(m)\n${code}`], {encoding:'utf8'});
  assert.equal(result.status, 0, result.stderr);
}
const setup = `
class Tokenizer:
    eos_token_id = 999
    def apply_chat_template(self,messages,**kwargs):
        assert messages[-1]['role'] == 'user', 'completed template must NEVER author the target'
        return [1,2,3]
    def encode(self,text,**kwargs): return list(map(ord,text))
    def decode(self,tokens): return ''.join(map(chr,tokens))
messages=[{'role':'system','content':'system'}, {'role':'user','content':'prompt'}, {'role':'assistant','content':'return 1'}]
`;
test('training uses the exact inference prefix and literal answer, with masked prompt and EOS', () => check(setup + `
tokens,offset=m.completion_tokens(Tokenizer(),messages)
assert tokens[:offset]==[1,2,3]
assert tokens[offset:-1]==list(map(ord,'return 1'))
assert tokens[-1]==999 and offset==3
`));
test('long targets fail before silent truncation', () => check(setup + `
try: m.verify_tokens(Tokenizer(),{'train':[{'messages':messages}]},4)
except ValueError as error: assert 'truncated' in str(error)
else: raise AssertionError('truncation accepted')
`));
test('mutating tokenizer and missing EOS are refused', () => check(setup + `
class Changed(Tokenizer):
    def decode(self,tokens): return '<think>'+super().decode(tokens)
for tok in [Changed(),Tokenizer()]:
    if type(tok)==Tokenizer: tok.eos_token_id=None
    try: m.completion_tokens(tok,messages)
    except ValueError: pass
    else: raise AssertionError('corrupt tokenizer accepted')
`));
test('starting training requires explicit opt-in and a new output directory', () => {
  const result=spawnSync('python3',[source,'--model','missing','--data','missing','--out','missing'],{encoding:'utf8'});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/--run is required/);
});

test('iteration ablations stay finite and bounded before any model imports', () => check(`
assert m.bounded_iterations('1') == 1
assert m.bounded_iterations('64') == 64
assert m.bounded_iterations('128') == 128
for value in ['0','129','-1','1.5','nan','infinity','1000000']:
    try: m.bounded_iterations(value)
    except m.argparse.ArgumentTypeError: pass
    else: raise AssertionError('unbounded training admitted: '+value)
`));

const rowsSetup = `
import copy
splits={}
card={'splitSizes':{},'families':{},'examples':3,'customerData':False}
for i,split in enumerate(['train','val','test']):
    source='return '+str(i)
    splits[split]=[{'messages':[{'role':'system','content':'system'},{'role':'user','content':'prompt'},{'role':'assistant','content':'\x60\x60\x60luau\\n'+source+'\\n\x60\x60\x60'}], 'meta':{'id':split,'family':split,'origin':'first-party-authored-synthetic','evidence':{'sourceSha256':m.digest(source),'behaviorPassed':True,'mutationRejected':True}}}]
    card['splitSizes'][split]=1
    card['families'][split]=split
m.validate_rows(splits,card)
`;
test('changed reference source, missing execution evidence, cross-family leaks and customer data fail closed', () => check(rowsSetup + `
for kind in ['source','evidence','family','customer']:
    changed=copy.deepcopy(splits); changed_card=copy.deepcopy(card)
    if kind=='source': changed['train'][0]['messages'][-1]['content']='\x60\x60\x60luau\\nreturn 42\\n\x60\x60\x60'
    if kind=='evidence': changed['train'][0]['meta']['evidence']['behaviorPassed']=False
    if kind=='family': changed['test'][0]['meta']['family']='train'
    if kind=='customer': changed_card['customerData']=True
    try: m.validate_rows(changed,changed_card)
    except ValueError: pass
    else: raise AssertionError(kind+' accepted')
`));
