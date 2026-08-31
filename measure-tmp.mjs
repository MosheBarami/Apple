import { chromium } from '@playwright/test';
const OUT='/private/tmp/claude-501/-Users-moshe-Desktop-RbxAI/9ccebc8c-facb-4db9-84ff-c4b074e2c252/scratchpad';
const b=await chromium.launch();
for (const [name,vp] of [['desktop',{width:1440,height:900}],['laptop',{width:1366,height:768}],['mobile',{width:390,height:844}]]) {
  const p=await b.newPage({viewport:vp,deviceScaleFactor:2});
  await p.goto('http://localhost:4322/');
  await p.waitForTimeout(1300);
  // Hide the frame: measure the STAGE only, which is what the spec claim describes.
  await p.addStyleTag({content:'.frame{visibility:hidden !important}'});
  await p.waitForTimeout(300);
  await p.screenshot({path:`${OUT}/stage-${name}.png`});
  const shot=(await p.screenshot()).toString('base64');
  const r=await p.evaluate(async b64=>{
    const img=new Image(); img.src='data:image/png;base64,'+b64; await img.decode();
    const c=document.createElement('canvas'); c.width=img.width;c.height=img.height;
    const g=c.getContext('2d'); g.drawImage(img,0,0);
    const lin=v=>v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4);
    const L=(d,i)=>0.2126*lin(d[i]/255)+0.7152*lin(d[i+1]/255)+0.0722*lin(d[i+2]/255);
    const band=(y0,y1)=>{const d=g.getImageData(0,y0,img.width,y1-y0).data;let s=0,n=0;
      for(let i=0;i<d.length;i+=4){s+=L(d,i);n++;}return s/n;};
    const t=Math.floor(img.height/3);
    const px=(x,y)=>{const d=g.getImageData(Math.round(x),Math.round(y),1,1).data;return `rgb(${d[0]},${d[1]},${d[2]})`;};
    const dpr=img.width/innerWidth;
    return {top:band(0,t),mid:band(t,2*t),bottom:band(2*t,img.height),
      atTop:px(img.width/2,10*dpr),
      atSummit:px(img.width/2,(innerHeight*0.78-4)*dpr),
      atBottom:px(img.width/2,(innerHeight-6)*dpr)};
  },shot);
  console.log(`\n=== ${name} ${vp.width}x${vp.height} — STAGE ONLY ===`);
  console.log(` luminance  top=${r.top.toExponential(3)}  mid=${r.mid.toExponential(3)}  bottom=${r.bottom.toExponential(3)}`);
  console.log(` bottom third darker than top? ${r.bottom<r.top?'YES':'NO — bottom reads LIGHTER'}`);
  console.log(` sampled backdrop: top=${r.atTop}  near summit=${r.atSummit}  bottom edge=${r.atBottom}`);
  await p.close();
}
await b.close();
