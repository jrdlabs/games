// Uses disposable anonymous identities; prints IDs for administrator cleanup.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const config = readFileSync(new URL('../js/config.js', import.meta.url), 'utf8');
const url = config.match(/SUPABASE_URL = "([^"]+)/)[1];
const key = config.match(/SUPABASE_PUBLISHABLE_KEY = "([^"]+)/)[1];
async function request(path, token, body) {
  const response = await fetch(url + path, { method: 'POST', headers: { apikey:key, Authorization:`Bearer ${token || key}`, 'Content-Type':'application/json' }, body:JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(data));
  return data;
}
const users = [];
let room, socket;
try {
  for (let i=0;i<4;i++) users.push(await request('/auth/v1/signup',null,{}));
  const call = (i, action, args={}) => request('/rest/v1/rpc/dominoes_action',users[i].access_token,{p_action:action,p_room:room || null,p_args:args});
  let state = await call(0,'create',{name:'Smoke host'}); room=state.room;
  const realtime = new Promise((resolve,reject) => {
    socket=new WebSocket(url.replace('https:','wss:')+'/realtime/v1/websocket?apikey='+key+'&vsn=1.0.0');
    const timeout=setTimeout(()=>reject(new Error('Realtime timed out')),20000);
    socket.onopen=()=>socket.send(JSON.stringify({topic:'realtime:dominoes-smoke',event:'phx_join',ref:'1',payload:{access_token:users[0].access_token,config:{broadcast:{self:false},presence:{key:''},postgres_changes:[{event:'UPDATE',schema:'public',table:'dominoes_rooms',filter:'id=eq.'+room}]}}}));
    socket.onmessage=async e=>{
      const message=JSON.parse(e.data);
      if(message.event==='phx_reply' && message.ref==='1') {
        if(message.payload.status!=='ok') {clearTimeout(timeout);reject(new Error(JSON.stringify(message.payload)));return;}
        try {await call(1,'join',{name:'Smoke 2',code:state.code});} catch(e){clearTimeout(timeout);reject(e);}
      }
      if(message.event==='postgres_changes'){clearTimeout(timeout);resolve();}
    };
    socket.onerror=()=>{clearTimeout(timeout);reject(new Error('Realtime websocket failed'));};
  });
  await realtime;
  for(let i=2;i<4;i++) await call(i,'join',{name:'Smoke '+(i+1),code:state.code});
  state=await call(0,'start');
  assert.equal(state.players.length,4); assert.equal(state.hand.length,7); assert.equal(state.hands,undefined);
  const turn=state.turn;
  state=await call(turn,'get');
  state=await call(turn,'play',{tile:[6,6],end:'right',revision:state.revision});
  assert.deepEqual(state.board,[[6,6]]);
  const restored=await call(turn,'get'); assert.equal(restored.revision,state.revision);
  console.log('PASS: four real anonymous sessions, REST joins/deal/play/reconnect and member-authorized realtime update.');
} finally {
  socket?.close();
  console.log(JSON.stringify({cleanupRoom:room,cleanupUsers:users.map(u=>u.user.id)}));
}
