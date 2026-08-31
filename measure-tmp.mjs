import { chromium } from '@playwright/test';
const b=await chromium.launch();
const grab=async(p,extraCss)=>{
  await p.goto('http://localhost:4322/');
  await p.waitForTimeout(1200);
  await p.addStyleTag({content:'.frame{visibility:hidden !important}'+(extraCss||'')});
  await p.waitForTimeout(300);
  const shot=(await p.screenshot()).toString('base64');
  return await p.evaluate(async b64=>{
    const img=new Image(); img.src='data:image/png;base64,'+b64; await img.decode();
    const c=document.createElement('canvas');c.width=img.width;c.height=img.height;
    const g=c.getContext('2d');g.drawImage(img,0,0);
    const dpr=img.width/innerWidth;
    const col=[];let best={l:-1};
    for(let y=0;y<innerHeight;y+=4){
      const d=g.getImageData(Math.round(innerWidth/2*dpr),Math.round(y*dpr),1,1).data;
      const l=d[0]+d[1]+d[2];
      col.push([y,d[0],d[1],d[2]]);
      if(l>best.l) best={l,y,rgb:`rgb(${d[0]},${d[1]},${d[2]})`};
    }
    // brightest pixel anywhere in the whole stage
    const all=g.getImageData(0,0,img.width,img.height).data;
    let gl=-1,gx=0,gy=0;
    for(let i=0;i<all.length;i+=4){const s=all[i]+all[i+1]+all[i+2];
      if(s>gl){gl=s;const px=(i/4)%img.width;gx=Math.round(px/dpr);gy=Math.round(Math.floor((i/4)/img.width)/dpr);}}
    return {col,bestCentre:best,globalMax:{rgb:`rgb(${gl})`,x:gx,y:gy,
      exact:(()=>{const d=g.getImageData(Math.round(gx*dpr),Math.round(gy*dpr),1,1).data;return `rgb(${d[0]},${d[1]},${d[2]})`;})()}};
  },shot);
};
const p=await b.newPage({viewport:{width:1440,height:900},deviceScaleFactor:2});
const withGlow=await grab(p,'');
const noGlow=await grab(p,'.stage__glow{display:none !important}');
console.log('=== desktop 1440x900, centre column (stage only) ===');
console.log('  y   with-glow        no-glow        delta(sum rgb)');
for(let i=0;i<withGlow.col.length;i+=8){
  const a=withGlow.col[i], z=noGlow.col[i];
  const d=(a[1]+a[2]+a[3])-(z[1]+z[2]+z[3]);
  console.log(`  ${String(a[0]).padStart(3)}  rgb(${a[1]},${a[2]},${a[3]})`.padEnd(28)+`rgb(${z[1]},${z[2]},${z[3]})`.padEnd(18)+`+${d}`);
}
console.log('\nbrightest on centre column WITH glow:', JSON.stringify(withGlow.bestCentre));
console.log('brightest on centre column NO glow  :', JSON.stringify(noGlow.bestCentre));
console.log('brightest pixel anywhere WITH glow  :', JSON.stringify(withGlow.globalMax));
console.log('brightest pixel anywhere NO glow    :', JSON.stringify(noGlow.globalMax));
await b.close();
