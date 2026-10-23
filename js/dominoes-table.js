// Shared live/admin presentation. Server rules and state remain authoritative.
import { createHandOrder } from './dominoes-hand-order.js';
import { createScoresheet } from './dominoes-scores.js';
const patterns=[[],[4],[0,8],[0,4,8],[0,2,6,8],[0,2,4,6,8],[0,2,3,5,6,8]];
export function tileNode(tile,button=false){
 const el=document.createElement(button?'button':'div');el.className='tile domino-piece';
 el.setAttribute('aria-label',`${tile[0]}–${tile[1]}`);if(!button)el.setAttribute('role','img');
 for(const value of tile){const half=document.createElement('span');half.className='pip-face';half.setAttribute('aria-hidden','true');
  for(let p=0;p<9;p++){const dot=document.createElement('i');dot.className=patterns[value].includes(p)?'pip':'pip empty-pip';half.append(dot);}el.append(half);}
 return el;
}
export function tileOffset(tile){const seed=Math.min(...tile)*7+Math.max(...tile);return {angle:((seed*13)%7-3)*.32,x:((seed*5)%3-1)*.35,y:((seed*11)%3-1)*.35};}
export function chainLayout(count,anchor,width,height,tiles=[]){
 if(!count)return [];
 for(let length=Math.min(54,width/4,height/4);length>=8;length-=.5){
  const short=length/2,gap=Math.max(2,length*.09),pad=3;
  const isDouble=index=>tiles[index]?.[0]===tiles[index]?.[1]&&!!tiles[index];
  const start={x:width/2,y:height/2,angle:isDouble(anchor)?90:0,w:isDouble(anchor)?length:short,h:isDouble(anchor)?short:length,leg:0};const poses=Array(count);poses[anchor]=start;
  let failed=false;
  for(const side of [-1,1]){
   let previous=start,leg=0;const indices=side<0?Array.from({length:anchor},(_,i)=>anchor-1-i):Array.from({length:count-anchor-1},(_,i)=>anchor+1+i);
   for(const index of indices){
    let pose;
    while(leg<3){
     const vertical=leg!==1;const dx=leg===1?side:0,dy=leg===0?side:leg===2?-side:0;
     const crosswise=isDouble(index),upright=vertical!==crosswise;
     const w=upright?short:length,h=upright?length:short;
     let x=previous.x+dx*((previous.w+w)/2+gap),y=previous.y+dy*((previous.h+h)/2+gap);
     // Align the outside edges at bends so matching end-halves meet in a clean L.
     // A whole-tile offset leaves a diagonal hole; zero offset joins at the divider.
     if(leg!==previous.leg){
      if(previous.leg===0)y+=side*(previous.h-h)/2;
      if(previous.leg===1)x+=side*(previous.w-w)/2;
     }
     const marginX=pad,marginY=pad;
     if(x-w/2<marginX||x+w/2>width-marginX||y-h/2<marginY||y+h/2>height-marginY){leg++;continue;}
     if(poses.some(p=>p&&Math.abs(x-p.x)<(w+p.w)/2+1&&Math.abs(y-p.y)<(h+p.h)/2+1)){failed=true;break;}
     // Rotation follows the chain's logical order, even when the left end grows backwards.
     const forwardY=dy*side;pose={x,y,w,h,leg,angle:(vertical?(forwardY>0?0:180):-90)+(crosswise?90:0)};break;
    }
    if(!pose){failed=true;break;}poses[index]=pose;previous=pose;
   }
   if(failed)break;
  }
  if(!failed)return poses;
 }
 throw new Error('The table is too small to lay out the domino chain.');
}
export function createTable({board,hand,pass,choice,status,seats}){
 const surface=board.closest('.felt');surface.classList.add('domino-table');
 const updateScores=createScoresheet(surface);
 const layer=document.createElement('div');layer.className='table-seats';surface.append(layer);
 const dock=document.createElement('div');dock.className='table-hand-dock';hand.setAttribute('aria-label','Your dominoes');hand.setAttribute('role','group');dock.append(hand);surface.append(dock);
 const orderHand=createHandOrder(hand);
 const actions=document.createElement('div');actions.className='table-actions';actions.append(pass);surface.append(actions);
 const next=document.getElementById('next')||document.getElementById('next-hand');
 if(next){next.textContent='Next hand';actions.append(next);}
 surface.append(choice);choice.classList.add('table-choice');surface.append(status);status.classList.add('table-turn-status');
 const heading=document.getElementById('hand-title')||document.querySelector('.hand-heading');if(heading)heading.hidden=true;
 if(seats)seats.hidden=true;
 board.classList.add('domino-chain');let latest;
 const fitHeight=()=>{
  if(!surface.clientWidth)return;
  const viewportHeight=window.visualViewport?.height||window.innerHeight;
  const documentTop=surface.getBoundingClientRect().top+window.scrollY;
  surface.style.height=`${Math.max(430,Math.min(900,viewportHeight-Math.min(documentTop,145)-10))}px`;
 };
 const paint=()=>{
  if(surface.clientWidth)board.style.bottom=`${Math.max(95,surface.clientHeight-dock.offsetTop+12)}px`;
  if(!latest||!board.clientWidth||!board.clientHeight)return;
  const state=latest,first=state.events?.find(e=>e.action==='play')?.tile;
  let anchor=first?state.board.findIndex(t=>[...t].sort().join() === [...first].sort().join()):Math.floor(state.board.length/2);if(anchor<0)anchor=Math.floor(state.board.length/2);
  const poses=chainLayout(state.board.length,anchor,board.clientWidth,board.clientHeight,state.board);
  board.replaceChildren(...state.board.map((tile,i)=>{const el=tileNode(tile);const p=poses[i],offset=tileOffset(tile);
   el.style.width=`${Math.min(p.w,p.h)}px`;el.style.height=`${Math.max(p.w,p.h)}px`;
   el.style.left=`${p.x+offset.x}px`;el.style.top=`${p.y+offset.y}px`;el.style.transform=`translate(-50%,-50%) rotate(${p.angle+offset.angle}deg)`;
   if(i===0||i===state.board.length-1){el.classList.add('chain-end');el.setAttribute('aria-label',`${i===0?'Left':'Right'} end: ${tile.join('–')}`);}return el;}));
 };
 new ResizeObserver(paint).observe(board);
 window.addEventListener('resize',()=>{fitHeight();paint();});window.visualViewport?.addEventListener('resize',()=>{fitHeight();paint();});
 return state=>{
  latest=state;
  fitHeight();updateScores(state);
  pass.hidden=state.phase!=='playing';
  if(next)next.hidden=state.phase!=='hand_complete'||(next.id==='next'&&state.me!==0);
  if(state.result&&state.phase!=='playing')status.textContent=`Hand ${state.handNumber} · ${state.result.winner==null?'Blocked hand tied':state.players[state.result.winner].name+' wins +1'}`;
  layer.replaceChildren(...state.players.map((player,index)=>{
   const relative=(index-state.me+4)%4,positions=['bottom','left','top','right'];
   const seat=document.createElement('div');seat.className=`table-player table-player--${positions[relative]}${state.phase==='playing'&&state.turn===index?' is-turn':''}`;
   const plaque=document.createElement('div');plaque.className='player-plaque';
   const avatar=document.createElement('b');avatar.className='player-avatar';avatar.textContent=player.name.slice(0,1).toUpperCase();
   const label=document.createElement('div');const name=document.createElement('strong');name.textContent=player.name;const info=document.createElement('small');info.textContent=relative===0?`You · ${state.scores[index]} points`:`${state.scores[index]} pt · ${state.counts[index]} tiles`;label.append(name,info);plaque.append(avatar,label);seat.append(plaque);
   if(relative!==0){const backs=document.createElement('div');backs.className='opponent-tiles';backs.setAttribute('aria-label',`${state.counts[index]} hidden tiles`);for(let n=0;n<state.counts[index];n++){const back=document.createElement('i');back.style.setProperty('--tilt',`${((n*3)%5-2)*.5}deg`);backs.append(back);}seat.append(backs);}return seat;
  }));
  hand.querySelectorAll('.tile').forEach((el,index)=>{const offset=tileOffset(state.hand[index]);el.style.setProperty('--hand-tilt',`${offset.angle}deg`);el.style.setProperty('--hand-offset',`${offset.y}px`);});
  orderHand(state);
  paint();
 };
}
