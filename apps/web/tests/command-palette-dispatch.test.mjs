import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {rankCommands,groupBySection} from '../src/lib/command-match.ts';
const {transformSync}=createRequire(new URL('../../worker/package.json',import.meta.url))(process.env.STUDPILOT_TEST_ESBUILD??'esbuild');
const source=readFileSync(new URL('../src/components/command-palette.tsx',import.meta.url),'utf8');
function render(selected=0){
 const calls=[];const commands=[
  {id:'help',title:'Help',section:'Navigation'},
  {id:'ws-connect',title:'Connect Studio',section:'Project'},
  {id:'roadmap',title:'Roadmap',section:'Navigation'},
  {id:'files',title:'Files',section:'Project'},
 ].map(c=>({...c,run:()=>calls.push(c.id)}));
 let state=0;
 const hooks={useMemo:fn=>fn(),useState:()=>[state++===0?'':selected,()=>{}],useRef:()=>({current:null}),useEffect:()=>{},useLayoutEffect:()=>{},useCommandRegistry:()=>({commands,open:true,setOpen:()=>{}}),useOverlayScrollLock:()=>{}};
 const code=transformSync(source.replace(/^import .*;\n/gm,''),{loader:'tsx',format:'cjs',jsxFactory:'h',tsconfigRaw:{}}).code;
 const module={exports:{}};const h=(type,props,...children)=>({type,props:props??{},children:children.flat(Infinity)});
 new Function('module','exports','h',...Object.keys(hooks),'groupBySection','rankCommands',code)(module,module.exports,h,...Object.values(hooks),groupBySection,rankCommands);
 const tree=module.exports.CommandPalette();
 function find(predicate,node=tree){if(predicate(node))return node;for(const child of node?.children??[])if(child&&typeof child==='object'){const found=find(predicate,child);if(found)return found;}}
 return {calls,find};
}
test('clicking grouped Connect Studio row executes pairing, not a differently ranked Roadmap',()=>{
 const {calls,find}=render();const row=find(n=>n.props.id==='cmdk-ws-connect');assert.ok(row);row.props.onMouseDown({preventDefault(){}});assert.deepEqual(calls,['ws-connect']);
});
test('keyboard Enter executes the same selected row shown by grouped navigation',()=>{
 const {calls,find}=render(2);assert.equal(find(n=>n.props.id==='cmdk-ws-connect').props['aria-selected'],true);
 find(n=>n.props.role==='combobox').props.onKeyDown({key:'Enter',preventDefault(){}});assert.deepEqual(calls,['ws-connect']);
});
