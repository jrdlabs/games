export const tileKey=tile=>[...tile].sort((a,b)=>a-b).join(':');
export function orderedKeys(hand,saved=[]){
 const available=hand.map(tileKey),valid=new Set(available);
 return [...new Set([...saved.filter(key=>valid.has(key)),...available])];
}
export function moveKey(keys,key,target){
 const result=keys.filter(item=>item!==key);if(!keys.includes(key))return [...keys];
 result.splice(Math.max(0,Math.min(target,result.length)),0,key);return result;
}
// Entirely local: ordering never changes the server hand or other players' views.
export function createHandOrder(hand){
 const bar=document.createElement('div');bar.className='hand-order-toolbar';
 const left=document.createElement('button'),right=document.createElement('button');
 for(const [button,text,label] of [[left,'←','Move selected tile left'],[right,'→','Move selected tile right']]){button.type='button';button.textContent=text;button.setAttribute('aria-label',label);}
 const help=document.createElement('span');help.className='hand-order-help';help.textContent='Drag to arrange · tap to play';
 bar.append(left,right,help);hand.before(bar);
 let selected=null,drag=null,storageKey,keys=[],context,suppressClickUntil=0;
 const memory=new Map();
 const announce=document.createElement('span');announce.className='hand-order-announcement';announce.setAttribute('role','status');bar.append(announce);
 const children=()=>[...hand.querySelectorAll('.tile')];
 function controls(){
  left.hidden=right.hidden=!selected;
  left.disabled=!selected||keys.indexOf(selected)<=0;right.disabled=!selected||keys.indexOf(selected)>=keys.length-1;
  hand.classList.add('is-reorderable');
  for(const el of children()){
   if(el.disabled)el.disabled=false;el.setAttribute('aria-disabled',el.dataset.playDisabled);
   el.classList.toggle('order-selected',el.dataset.tileKey===selected);
  }
 }
 function save(){memory.set(storageKey,keys);try{localStorage.setItem(storageKey,JSON.stringify(keys));}catch{}}
 function move(key,target){keys=moveKey(keys,key,target);selected=key;save();const nodes=new Map(children().map(el=>[el.dataset.tileKey,el]));keys.forEach(k=>hand.append(nodes.get(k)));controls();hand.dispatchEvent(new CustomEvent('hand-reordered',{bubbles:true}));announce.textContent=`Tile moved to position ${keys.indexOf(key)+1} of ${keys.length}`;}
 left.onclick=()=>move(selected,keys.indexOf(selected)-1);right.onclick=()=>move(selected,keys.indexOf(selected)+1);
 hand.addEventListener('click',event=>{
  const el=event.target.closest('.tile');if(!el)return;
  if(Date.now()<suppressClickUntil){event.preventDefault();event.stopImmediatePropagation();return;}
  selected=el.dataset.tileKey;controls();
  if(el.dataset.playDisabled==='true'){event.preventDefault();event.stopImmediatePropagation();}
 },true);
 hand.addEventListener('pointerdown',event=>{
  if(event.button!==0)return;const el=event.target.closest('.tile');if(!el)return;
  selected=el.dataset.tileKey;drag={key:selected,x:event.clientX,y:event.clientY,dx:0,dy:0,moved:false,el};controls();
 });
 hand.addEventListener('pointermove',event=>{
  if(!drag)return;drag.dx=event.clientX-drag.x;drag.dy=event.clientY-drag.y;
  if(!drag.moved&&Math.hypot(drag.dx,drag.dy)>7){drag.moved=true;hand.setPointerCapture(event.pointerId);hand.closest('.domino-table').classList.add('hand-drag-active');}
  if(drag.moved){event.preventDefault();drag.el.classList.add('order-dragging');drag.el.style.translate=`${drag.dx}px ${drag.dy}px`;}
 });
 hand.addEventListener('pointerup',event=>{
  if(!drag)return;const current=drag;drag=null;current.el.classList.remove('order-dragging');current.el.style.translate='';hand.closest('.domino-table').classList.remove('hand-drag-active');
  if(current.moved){suppressClickUntil=Date.now()+450;const others=children().filter(el=>el.dataset.tileKey!==current.key);let target=others.findIndex(el=>event.clientX<el.getBoundingClientRect().left+el.getBoundingClientRect().width/2);if(target<0)target=others.length;move(current.key,target);}
  else if(event.pointerType==='touch'){
   // Touch engines may omit the compatibility click after pointer capture/repainting.
   // Dispatch the tap once ourselves and suppress any delayed native duplicate.
   suppressClickUntil=0;current.el.click();suppressClickUntil=Date.now()+450;
  }
 });
 hand.addEventListener('pointercancel',()=>{if(drag){drag.el.style.translate='';drag.el.classList.remove('order-dragging');drag=null;}hand.closest('.domino-table').classList.remove('hand-drag-active');});
 hand.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight'].includes(event.key))return;const el=event.target.closest('.tile');if(!el)return;event.preventDefault();event.stopImmediatePropagation();move(el.dataset.tileKey,keys.indexOf(el.dataset.tileKey)+(event.key==='ArrowLeft'?-1:1));el.focus();},true);
 return state=>{
  const nextContext=`${state.room}:${state.handNumber}:${state.me}`;
  if(context!==nextContext||(drag&&!state.hand.some(tile=>tileKey(tile)===drag.key))){drag=null;hand.closest('.domino-table').classList.remove('hand-drag-active');}
  context=nextContext;
  storageKey=`dominoes.handOrder:${context}`;
  let stored=memory.get(storageKey)||[];try{const parsed=JSON.parse(localStorage.getItem(storageKey)||'null');if(Array.isArray(parsed))stored=parsed;}catch{}
  keys=orderedKeys(state.hand,stored);save();
  const nodes=children();nodes.forEach((el,index)=>{el.dataset.tileKey=tileKey(state.hand[index]);el.dataset.playDisabled=String(el.disabled);});
  const byKey=new Map(nodes.map(el=>[el.dataset.tileKey,el]));keys.forEach(key=>hand.append(byKey.get(key)));
  if(!keys.includes(selected))selected=null;
  if(drag){const replacement=byKey.get(drag.key);if(replacement){drag.el=replacement;if(drag.moved){replacement.classList.add('order-dragging');replacement.style.translate=`${drag.dx}px ${drag.dy}px`;}}}
  controls();
 };
}
