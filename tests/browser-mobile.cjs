// Headless component regression tests; no live Auth or game rooms are used.
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}fs.readFile(file,(e,data)=>{res.writeHead(e?404:200,{'Content-Type':file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':file.endsWith('.jpg')?'image/jpeg':'text/html; charset=utf-8'});res.end(e?'Not found':data);});});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try{
  for(const [width,height] of [[320,568],[360,740],[390,844],[768,1024],[1280,900]]){
   const context=await browser.newContext({viewport:{width,height},hasTouch:width<600});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+'/tests/table-fixture.html');await page.waitForFunction(()=>window.ready);
   const geometry=await page.evaluate(()=>{
    const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
    return {overflow:document.documentElement.scrollWidth>innerWidth,table:rect(document.querySelector('.domino-table')),hand:[...document.querySelectorAll('.hand .tile')].map(rect),pass:rect(document.querySelector('.table-actions')),top:rect(document.querySelector('.table-player--top')),status:rect(document.querySelector('.table-turn-status'))};
   });
   assert(!geometry.overflow,`Horizontal overflow at ${width}`);assert.equal(geometry.hand.length,7);
   for(const tile of geometry.hand){assert(tile.height>tile.width*1.7,`Hand not vertical at ${width}`);assert(tile.x>=geometry.table.x&&tile.right<=geometry.table.right,`Hand clipped at ${width}`);assert(tile.bottom<=geometry.table.bottom);}
   assert(geometry.pass.right<geometry.table.right&&geometry.pass.bottom<geometry.table.bottom,`Pass clipped at ${width}`);
   assert(geometry.status.y>=geometry.top.bottom,`Status overlaps opponent at ${width}`);
   if(height>=700)assert(geometry.table.bottom<=height+2,`Table does not fit mobile height at ${width}`);
   const tiles=page.locator('.hand .tile');const before=await tiles.first().getAttribute('data-tile-key');const first=await tiles.first().boundingBox(),last=await tiles.last().boundingBox();
   await page.mouse.move(first.x+first.width/2,first.y+first.height/2);await page.mouse.down();await page.mouse.move(last.x+last.width,last.y+last.height/2,{steps:10});await page.mouse.up();
   assert.equal(await tiles.last().getAttribute('data-tile-key'),before,`Drag failed at ${width}`);assert.equal(await page.evaluate(()=>window.playChoices),0,'Drag opened play UI');
   await page.reload();await page.waitForFunction(()=>window.ready);assert.equal(await tiles.last().getAttribute('data-tile-key'),before,'Reload lost private order');
   await tiles.first().focus();const keyboardKey=await tiles.first().getAttribute('data-tile-key');await page.keyboard.press('ArrowRight');assert.equal(await tiles.nth(1).getAttribute('data-tile-key'),keyboardKey,'Keyboard reorder failed');
   await page.getByRole('button',{name:'Scores',exact:true}).click();assert(await page.getByRole('dialog').isVisible());assert.equal(await page.locator('.scores-dialog tbody tr').count(),2);assert.equal(await page.locator('.scores-dialog .score-won').count(),2);if(width===390)await page.screenshot({path:path.join(root,'tests/scores-390.png')});await page.getByRole('button',{name:'Close',exact:true}).click();
   await page.screenshot({path:path.join(root,`tests/mobile-${width}.png`),fullPage:true});
   if(width===360){
    const a=await tiles.first().boundingBox(),b=await tiles.last().boundingBox(),touchKey=await tiles.first().getAttribute('data-tile-key');const cdp=await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:a.x+a.width/2,y:a.y+a.height/2}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:b.x+b.width,y:b.y+b.height/2}]});
    // Simulate another player's realtime update arriving during a drag.
    await page.evaluate(()=>window.render());
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.equal(await tiles.last().getAttribute('data-tile-key'),touchKey,'Touch drag/update failed');assert.equal(await page.evaluate(()=>window.playChoices),0,'Touch drag played a tile');
    await page.waitForTimeout(500);await page.evaluate(()=>{window.state.turn=0;window.render();});await tiles.first().tap();
    await page.waitForFunction(()=>window.playChoices===1,{},{timeout:1500});
    assert.equal(await page.evaluate(()=>window.playChoices),1,'Tap should open end confirmation');
   }
   for(const anchor of [0,13,27]){
    await page.evaluate(anchor=>{
     const edges=[];for(let a=0;a<=6;a++)for(let b=a;b<=6;b++)edges.push([a,b]);const used=new Set(),stack=[6],circuit=[];
     while(stack.length){const v=stack.at(-1),i=edges.findIndex((e,i)=>!used.has(i)&&e.includes(v));if(i<0)circuit.push(stack.pop());else{used.add(i);stack.push(edges[i][0]===v?edges[i][1]:edges[i][0]);}}
     circuit.reverse();state.board=circuit.slice(0,-1).map((v,i)=>[v,circuit[i+1]]);state.hand=[];state.counts=[0,0,0,0];state.events=[{action:'play',tile:state.board[anchor]}];state.phase='hand_complete';state.result={winner:1};window.render();
    },anchor);
    const fits=await page.evaluate(()=>{const b=document.getElementById('board').getBoundingClientRect();return [...document.querySelectorAll('.domino-chain .tile')].every(el=>{const r=el.getBoundingClientRect();return r.left>=b.left-1&&r.right<=b.right+1&&r.top>=b.top-1&&r.bottom<=b.bottom+1;});});
    assert(fits,`Full chain clips at ${width}, anchor ${anchor}`);
   }
   assert.deepEqual(errors,[],`Browser errors at ${width}`);await context.close();
  }
  console.log('PASS: five browser sizes, seven vertical tiles, no horizontal clipping, height fit, mouse/touch/keyboard reordering, realtime-during-drag, no accidental play, persistence and scoresheet.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
