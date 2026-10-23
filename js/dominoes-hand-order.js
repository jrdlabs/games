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
 const toggle=document.createElement('button');toggle.type='button';toggle.textContent='Arrange tiles';toggle.setAttribute('aria-pressed','false');
 const left=document.createElement('button'),right=document.createElement('button');
 for(const [button,text,label] of [[left,'←','Move selected tile left'],[right,'→','Move selected tile right']]){button.type='button';button.textContent=text;button.setAttribute('aria-label',label);}
 const help=document.createElement('span');help.className='hand-order-help';help.textContent='Drag, or select a tile and use arrows';
 bar.append(toggle,left,right,help);hand.closest('.domino-table').before(bar);
 let arranging=false,selected=null,drag=null,storageKey,keys=[],context,signature;
 const memory=new Map();
 const announce=document.createElement('span');announce.className='hand-order-announcement';announce.setAttribute('role','status');bar.append(announce);
 const children=()=>[...hand.querySelectorAll('.tile')];
 function controls(){
  toggle.textContent=arranging?'Done arranging':'Arrange tiles';toggle.setAttribute('aria-pressed',String(arranging));
  left.hidden=right.hidden=help.hidden=!arranging;
  left.disabled=!selected||keys.indexOf(selected)<=0;right.disabled=!selected||keys.indexOf(selected)>=keys.length-1;
  hand.classList.toggle('is-arranging',arranging);
  hand.closest('.domino-table').classList.toggle('hand-arranging',arranging);
  for(const el of children()){el.disabled=arranging?false:el.dataset.playDisabled==='true';el.classList.toggle('order-selected',arranging&&el.dataset.tileKey===selected);}
 }
 function save(){memory.set(storageKey,keys);try{localStorage.setItem(storageKey,JSON.stringify(keys));}catch{}}
 function move(key,target){keys=moveKey(keys,key,target);selected=key;save();const nodes=new Map(children().map(el=>[el.dataset.tileKey,el]));keys.forEach(k=>hand.append(nodes.get(k)));controls();announce.textContent=`Tile moved to position ${keys.indexOf(key)+1} of ${keys.length}`;}
 toggle.onclick=()=>{arranging=!arranging;drag=null;controls();};
 left.onclick=()=>move(selected,keys.indexOf(selected)-1);right.onclick=()=>move(selected,keys.indexOf(selected)+1);
 hand.addEventListener('click',event=>{if(!arranging)return;event.preventDefault();event.stopImmediatePropagation();const el=event.target.closest('.tile');if(el){selected=el.dataset.tileKey;controls();}},true);
 hand.addEventListener('pointerdown',event=>{
  if(!arranging||event.button!==0)return;const el=event.target.closest('.tile');if(!el)return;
  selected=el.dataset.tileKey;drag={key:selected,x:event.clientX,y:event.clientY,moved:false,el};hand.setPointerCapture(event.pointerId);controls();
 });
 hand.addEventListener('pointermove',event=>{if(!drag)return;if(Math.hypot(event.clientX-drag.x,event.clientY-drag.y)>6)drag.moved=true;if(drag.moved){drag.el.classList.add('order-dragging');drag.el.style.translate=`${event.clientX-drag.x}px ${event.clientY-drag.y}px`;}});
 hand.addEventListener('pointerup',event=>{
  if(!drag)return;const current=drag;drag=null;current.el.classList.remove('order-dragging');current.el.style.translate='';
  if(current.moved){const others=children().filter(el=>el.dataset.tileKey!==current.key);let target=others.findIndex(el=>event.clientX<el.getBoundingClientRect().left+el.getBoundingClientRect().width/2);if(target<0)target=others.length;move(current.key,target);}
 });
 hand.addEventListener('pointercancel',()=>{if(drag){drag.el.style.translate='';drag.el.classList.remove('order-dragging');drag=null;}});
 hand.addEventListener('keydown',event=>{if(!arranging||!['ArrowLeft','ArrowRight'].includes(event.key))return;const el=event.target.closest('.tile');if(!el)return;event.preventDefault();event.stopImmediatePropagation();move(el.dataset.tileKey,keys.indexOf(el.dataset.tileKey)+(event.key==='ArrowLeft'?-1:1));el.focus();},true);
 return state=>{
  context=`${state.room}:${state.handNumber}:${state.me}`;
  const nextSignature=context+'|'+state.hand.map(tileKey).join(',');
  if(signature!==nextSignature){signature=nextSignature;drag=null;}
  storageKey=`dominoes.handOrder:${context}`;
  let stored=memory.get(storageKey)||[];try{const parsed=JSON.parse(localStorage.getItem(storageKey)||'null');if(Array.isArray(parsed))stored=parsed;}catch{}
  keys=orderedKeys(state.hand,stored);save();
  const nodes=children();nodes.forEach((el,index)=>{el.dataset.tileKey=tileKey(state.hand[index]);el.dataset.playDisabled=String(el.disabled);});
  const byKey=new Map(nodes.map(el=>[el.dataset.tileKey,el]));keys.forEach(key=>hand.append(byKey.get(key)));
  if(!keys.includes(selected))selected=null;
  // Normal game renderers may disable every button while a network action is pending.
  toggle.disabled=false;controls();
 };
}
