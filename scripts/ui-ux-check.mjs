import {createServer} from 'node:http';
import {readFileSync,existsSync,statSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const stage=process.argv[2]||'before';
const root=resolve(fileURLToPath(new URL('..',import.meta.url))),out=resolve(process.env.UI_QA_OUTPUT || resolve(root,'..','audit','pose-gallery'),stage);mkdirSync(out,{recursive:true});
const server=createServer((req,res)=>{const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);const p=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!p.startsWith(root+sep)||!existsSync(p)||!statSync(p).isFile()){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.json':'application/json','.jpg':'image/jpeg','.png':'image/png'})[extname(p)]||'application/octet-stream');res.end(readFileSync(p));});
await new Promise(r=>server.listen(4351,'127.0.0.1',r));
let browser;const result={stage,rows:[],blockedExternal:[],errors:[]};
try{
 browser=await chromium.launch({headless:true,executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
 const context=await browser.newContext({reducedMotion:'reduce'});await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname==='127.0.0.1'||u.protocol==='data:')return route.continue();result.blockedExternal.push(u.origin);return route.abort();});
 const page=await context.newPage();page.on('pageerror',e=>result.errors.push(e.message));
 for(const[width,height]of[[360,780],[412,892],[440,956],[1440,1000],[844,390]]){
  await page.setViewportSize({width,height});await page.goto('http://127.0.0.1:4351/');await page.locator('.pose-card[data-index]').first().waitFor();await page.locator('.main-image').first().evaluate(img=>img.decode());
  await page.screenshot({path:resolve(out,`${width}-home.png`)});
  const home=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,smallTargets:[...document.querySelectorAll('.action-btn,.search-clear,.angle-strip .angle-thumb')].filter(x=>x.getBoundingClientRect().height>0).slice(0,9).map(x=>({name:x.getAttribute('aria-label')||x.textContent.trim(),w:x.getBoundingClientRect().width,h:x.getBoundingClientRect().height}))}));
  await page.locator('.pose-card[data-index]').first().focus();await page.keyboard.press('Enter');await page.locator('#viewer:not([hidden])').waitFor();await page.waitForFunction(()=>document.querySelector('#viewerImage').complete);await page.screenshot({path:resolve(out,`${width}-viewer.png`)});
  await page.locator('#copyId').focus();await page.keyboard.press('Tab');const escaped=await page.evaluate(()=>!document.activeElement.closest('#viewer'));
  result.rows.push({width,height,home,viewerWidth:await page.evaluate(()=>document.querySelector('.viewer-panel').scrollWidth),escapedAfterCopy:escaped});
  if(stage==='after'){
   await page.locator('#openImage').focus();await page.keyboard.press('Tab');if(await page.evaluate(()=>!document.activeElement.closest('#viewer')))throw new Error('Viewer focus escaped');
   await page.keyboard.press('Escape');if(!(await page.locator('.pose-card[data-index]').first().evaluate(x=>x===document.activeElement)))throw new Error('Focus was not restored');
   if(home.scrollWidth>width+1)throw new Error('Horizontal overflow');
   if(width<=440&&home.smallTargets.some(x=>x.w<44||x.h<44))throw new Error('Undersized mobile control');
  }
 }
 if(stage==='after'){
  await page.setViewportSize({width:360,height:780});await page.goto('http://127.0.0.1:4351/');await page.locator('.pose-card[data-index]').first().waitFor();
  await page.locator('#searchInput').fill('no-match-long-query-'.repeat(20));await page.locator('#emptyReset').waitFor();await page.screenshot({path:resolve(out,'empty-longtext.png')});
  result.emptyNoOverflow=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1);if(!result.emptyNoOverflow)throw new Error('Long search overflow');
  await page.locator('#emptyReset').click();await page.locator('.pose-card[data-index]').first().waitFor();await page.locator('#searchInput').focus();await page.keyboard.press('Tab');result.focusOutline=await page.evaluate(()=>getComputedStyle(document.activeElement).outlineColor);
  if(result.focusOutline!=='rgb(91, 91, 214)')throw new Error('Focus is not visible');
  result.namedHelp=await page.locator('[data-info]').evaluateAll(buttons=>buttons.every(b=>!!b.getAttribute('aria-label')));if(!result.namedHelp)throw new Error('Missing help button name');
  result.reducedMotion=await page.locator('.pose-card[data-index]').first().evaluate(e=>getComputedStyle(e).transitionDuration);if(result.reducedMotion!=='0s')throw new Error('Motion not reduced');
  await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>document.body.style.zoom='2');result.zoom200NoOverflow=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1);if(!result.zoom200NoOverflow)throw new Error('200% CSS zoom overflow');await page.screenshot({path:resolve(out,'zoom200.png')});
  await context.route('**/data/pose-zh.json',route=>route.fulfill({status:503,body:'Unavailable'}));await page.goto('http://127.0.0.1:4351/');await page.locator('#resultCount').filter({hasText:'图库加载失败'}).waitFor();result.errorState=true;await page.screenshot({path:resolve(out,'error.png')});
  await context.unroute('**/data/pose-zh.json');await context.route('**/data/pose-zh.json',async route=>{await new Promise(r=>setTimeout(r,700));await route.continue();});await page.goto('http://127.0.0.1:4351/');await page.locator('#grid[aria-busy="true"]').waitFor();await page.locator('.pose-card[data-index]').first().waitFor();result.loadingState=true;
 }
 result.pass=true;console.log(JSON.stringify(result));
}finally{result.blockedExternal=[...new Set(result.blockedExternal)];writeFileSync(resolve(out,'results.json'),JSON.stringify(result,null,2));await browser?.close();server.close();}
