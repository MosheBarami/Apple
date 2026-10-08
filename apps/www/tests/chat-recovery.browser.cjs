const {chromium,expect}=require('@playwright/test');
const fs=require('node:fs');
const base=process.env.WWW_TEST_URL||'http://localhost:3100';
(async()=>{
 const b=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
 const results=[];
 try{
  const p=await b.newPage();
  for(const width of [390,1440]){
   await p.setViewportSize({width,height:960});await p.goto(base+'/dev/app?view=chat');await p.waitForLoadState('networkidle');
   const draft=p.getByRole('textbox',{name:'Message StudPilot'});await draft.fill('Keep my next request');
   await p.getByRole('button',{name:'Stop working',exact:true}).click();
   await expect(p.getByRole('button',{name:'Send message',exact:true})).toBeEnabled();
   await expect(draft).toHaveValue('Keep my next request');
   expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
   results.push({name:'Stop releases composer and preserves draft at '+width,pass:true});
  }
  await p.goto(base+'/dev/app?view=chat-stop-error');await p.waitForLoadState('networkidle');
  await p.getByRole('textbox',{name:'Message StudPilot'}).fill('Retain this on failed stop');
  await p.getByRole('button',{name:'Stop working',exact:true}).click();
  await expect(p.getByRole('alert').filter({hasText:'Could not stop the run'})).toBeVisible();
  await expect(p.getByRole('button',{name:'Stop working',exact:true})).toBeEnabled();
  await expect(p.getByRole('textbox',{name:'Message StudPilot'})).toHaveValue('Retain this on failed stop');
  results.push({name:'Failed stop is visible and retryable without losing draft',pass:true});
  fs.writeFileSync('/tmp/studpilot-chat-recovery-results.json',JSON.stringify(results,null,2));console.log(results);
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
