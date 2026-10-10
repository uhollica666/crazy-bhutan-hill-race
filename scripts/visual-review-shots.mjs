import { chromium } from '@playwright/test';
import { mkdirSync,writeFileSync } from 'node:fs';
const out='screenshots/visual-upgrade-assets';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.goto('http://127.0.0.1:4173/tools/visual-review.html');await page.waitForFunction(()=>!!window.__visualReview);
const stats={};for(const id of ['dzo-hatch','tourist-coaster','druk-ranger','dragon-cruiser','hotel','office','shops','chorten','house','pine','broadleaf','yak','tourist','yeti','ghost','zombie']){
 await page.evaluate(id=>window.__visualReview.show(id),id);await page.waitForTimeout(350);await page.screenshot({path:`${out}/${id}.png`});stats[id]=await page.evaluate(()=>window.__visualReview.stats());}
writeFileSync(`${out}/render-report.json`,JSON.stringify({errors,stats},null,2));await browser.close();if(errors.length)throw Error(errors.join('\n'));console.log('Captured 16 assets without browser errors.');
