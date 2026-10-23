import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';
import { fits, canPlay } from './dominoes-rules.js';
import { tileNode, createTable } from './dominoes-table.js';
// Separate storage preserves the anonymous identity and seats used in normal games.
const incomingType=new URLSearchParams(location.hash.slice(1)).get('type');
let passwordFlow=['invite','recovery'].includes(incomingType);
const client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { storageKey:'game-room-admin-auth', persistSession:true, autoRefreshToken:true, detectSessionInUrl:true, flowType:'implicit' } });
const $ = id => document.getElementById(id);
let state, selected, busy=false, allowed=false, botTimer, saved=localStorage.getItem('dominoes.admin.room');
const message = text => { $('message').textContent=text; };
function pause() { $('bots').checked=false; clearTimeout(botTimer); }
async function rpc(action,args={}) {
  const {data,error}=await client.rpc('dominoes_admin_action',{p_action:action,p_room:state?.room||null,p_args:{seat:Number($('seat').value),viewSeat:Number($('seat').value),reveal:$('reveal').checked,revision:state?.revision,...args}});
  if(error)throw error; return data;
}
async function run(action,args={}) {
  if(busy||!allowed)return;
  busy=true; clearTimeout(botTimer); updateButtons();
  try {
    state=await rpc(action,args);
    // Bot step uses its own action arguments; retrieve the selected view afterward.
    if(action==='step')state=await rpc('get');
    selected=null; saved=state.room;localStorage.setItem('dominoes.admin.room',saved);
    message('Private test table · normal games are unaffected.');
  } catch(e){pause();message(e.message||'Could not update test table.');}
  finally{busy=false;if(state?.players)render();updateButtons();scheduleBot();}
}
function updateButtons() {
  for(const id of ['create','restart','next-hand','step','load','pass','left','right'])$(id).disabled=busy||!allowed;
  for(const id of ['seat','scenario','reveal'])$(id).disabled=busy;
  $('restart').disabled=busy||!state;
  $('load').disabled=busy||!state;
  $('next-hand').disabled=busy||state?.phase!=='hand_complete';
  $('step').disabled=busy||state?.phase!=='playing';
  $('pass').disabled=busy||state?.phase!=='playing'||state.turn!==Number($('seat').value)||state.hand.some(t=>canPlay(t,state.board,state.handNumber));
  for(const end of ['left','right'])$(end).disabled=busy||!selected||!fits(selected,state.board,end,state.handNumber);
}
const renderTable=createTable({board:$('board'),hand:$('hand'),pass:$('pass'),choice:$('choice'),status:$('status'),seats:$('seats')});
$('hand').addEventListener('hand-reordered',()=>{selected=null;$('choice').hidden=true;});
function render() {
  if(!state)return;
  document.body.classList.add('admin-table-playing');
  $('test-table').hidden=false;
  $('status').textContent=`Hand ${state.handNumber} · ${state.phase==='playing'?state.players[state.turn].name+' to play':state.phase==='match_complete'?'Match complete':state.result?.winner==null?'Hand tied':state.players[state.result.winner].name+' wins the hand'} · Scores: ${state.scores.join(' / ')}`;
  if(state.phase==='playing'&&!state.board.length)$('status').textContent+=state.handNumber===1?' · Open with 6–6':' · Open with any tile';
  $('seats').replaceChildren(...state.players.map((p,i)=>{const el=document.createElement('div');el.className='seat'+(state.turn===i&&state.phase==='playing'?' active':'');el.textContent=`${p.name} · ${state.counts[i]} tiles · ${state.scores[i]} points`;return el;}));

  $('hand-title').textContent=`${state.players[Number($('seat').value)].name}’s tiles`;
  $('hand').replaceChildren(...state.hand.map(tile=>{const el=tileNode(tile,true);const valid=state.phase==='playing'&&state.turn===Number($('seat').value)&&canPlay(tile,state.board,state.handNumber);el.disabled=!valid||busy;if(valid)el.classList.add('playable');el.onclick=()=>{selected=tile;$('choice').hidden=false;$('choice-title').textContent=`Play ${tile.join('–')} on which end?`;updateButtons();};return el;}));
  renderTable(state);
  $('choice').hidden=!selected;
  $('all-hands').hidden=!state.fullHands;
  $('all-hands').replaceChildren();
  state.fullHands?.forEach((hand,i)=>{const label=document.createElement('h3');label.textContent=state.players[i].name;const row=document.createElement('div');row.className='reveal-hand';row.append(...hand.map(t=>tileNode(t)));$('all-hands').append(label,row);});
}
function scheduleBot(){clearTimeout(botTimer);if(allowed&&$('bots').checked&&state?.phase==='playing'&&state.turn!==Number($('seat').value))botTimer=setTimeout(()=>run('step'),900);}
async function checkAccount() {
  const {data,error}=await client.auth.getSession();if(error)throw error;
  $('admin').hidden=true;$('password-setup').hidden=true;$('signout').hidden=!data.session;
  if(!data.session){allowed=false;$('login').hidden=false;message('Sign in to use the private test area.');return;}
  const {data:account,error:problem}=await client.rpc('dominoes_admin_account');if(problem)throw problem;
  if(!account.approved){allowed=false;$('login').hidden=false;message('This account does not have admin access. Sign out and use your provisioned admin account.');return;}
  $('login').hidden=true;
  if(account.needsPassword||passwordFlow){allowed=false;$('password-setup').hidden=false;message('Choose your admin password to continue.');return;}
  const {error:denied}=await client.rpc('dominoes_admin_action',{p_action:'status'});if(denied)throw denied;
  allowed=true;$('admin').hidden=false;message('Signed in. Start a test table whenever you’re ready.');updateButtons();
  if(saved&&!state?.players){state={room:saved};await run('get');if(!state?.players)state=null;}
}
$('login-form').onsubmit=async event=>{
  event.preventDefault();$('signin').disabled=true;message('Signing in…');
  try{const {error}=await client.auth.signInWithPassword({email:$('admin-email').value.trim(),password:$('admin-password').value});if(error)throw error;passwordFlow=false;await checkAccount();}
  catch(e){message(e.message||'Sign-in failed.');}
  finally{$('admin-password').value='';$('signin').disabled=false;}
};
$('forgot').onclick=async()=>{
  const email=$('admin-email').value.trim();if(!$('admin-email').reportValidity())return;
  $('forgot').disabled=true;
  try{const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:new URL('./admin.html',location.href).href});if(error)throw error;message('If this email has an account, a password-reset link has been sent. Check your inbox.');}
  catch(e){message(e.message||'Could not send password-reset email.');}
  finally{$('forgot').disabled=false;}
};
$('password-form').onsubmit=async event=>{
  event.preventDefault();const password=$('new-password').value;
  if(password!==$('confirm-password').value){message('The passwords do not match.');return;}
  $('save-password').disabled=true;
  try{const {error}=await client.auth.updateUser({password});if(error)throw error;passwordFlow=false;$('password-form').reset();await checkAccount();message('Password saved. Your admin test area is ready.');}
  catch(e){message(e.message||'Could not save password. Request a fresh reset link if this one expired.');}
  finally{$('save-password').disabled=false;}
};
$('signout').onclick=async()=>{pause();const {error}=await client.auth.signOut({scope:'local'});if(error){message(error.message);return;}allowed=false;state=null;passwordFlow=false;$('admin').hidden=true;$('password-setup').hidden=true;$('login').hidden=false;$('signout').hidden=true;message('Signed out of the admin area.');};
$('create').onclick=()=>{pause();run('create');};$('restart').onclick=()=>{pause();run('reset');};$('next-hand').onclick=()=>run('next');$('step').onclick=()=>run('step');
$('load').onclick=()=>{pause();run('scenario',{scenario:$('scenario').value});};
$('seat').onchange=()=>{pause();run('get');};$('reveal').onchange=()=>run('get');$('bots').onchange=scheduleBot;
$('pass').onclick=()=>run('pass');for(const end of ['left','right'])$(end).onclick=()=>run('play',{tile:selected,end});
$('cancel').onclick=()=>{selected=null;$('choice').hidden=true;updateButtons();};
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});window.addEventListener('pagehide',pause);
try {
  const callbackError=new URLSearchParams(location.hash.slice(1)).get('error_description');
  if(callbackError)throw new Error(callbackError);
  await checkAccount();
  if(location.hash||new URLSearchParams(location.search).has('code'))history.replaceState(null,'',location.pathname);
}catch(e){allowed=false;$('login').hidden=false;message(e.message||'Admin sign-in failed. Request a new reset link if needed.');}
client.auth.onAuthStateChange((event,session)=>{
  if(event==='PASSWORD_RECOVERY'){passwordFlow=true;pause();queueMicrotask(()=>checkAccount().catch(e=>message(e.message)));}
  if(event==='SIGNED_OUT'||!session){pause();allowed=false;$('admin').hidden=true;$('password-setup').hidden=true;$('login').hidden=false;$('signout').hidden=true;}
});
