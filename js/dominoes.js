import { supabase, ensureAnonymousSession } from './supabase.js';
import { fits, canPlay } from './dominoes-rules.js';
import { tileNode, createTable } from './dominoes-table.js';
const $ = id => document.getElementById(id);
let state, selected, busy = false, channel, refreshing = false, sessionReady = false;
let saved = localStorage.getItem('dominoes.room');
const error = message => { $('error').textContent = message; $('error').hidden = !message; };
async function rpc(action, args = {}) {
  const { data, error: problem } = await supabase.rpc('dominoes_action', { p_action: action, p_room: state?.room || null, p_args: args });
  if (problem) throw problem;
  return data;
}
async function adopt(data) {
  const changedRoom = state?.room !== data.room;
  state = data; saved = data.room; localStorage.setItem('dominoes.room', saved);
  history.replaceState(null, '', `${location.pathname}?room=${data.code}`);
  if (changedRoom) {
    if (channel) await supabase.removeChannel(channel);
    channel = supabase.channel(`dominoes:${saved}`).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'dominoes_rooms', filter: `id=eq.${saved}` }, refresh).subscribe(status => {
      $('connection').textContent = status === 'SUBSCRIBED' ? 'Live table' : 'Reconnecting…';
      if (status === 'SUBSCRIBED') refresh();
    });
  }
  render();
}
async function act(action, args = {}) {
  if (busy || !sessionReady) return;
  busy = true; error(''); renderBusy();
  try { await adopt(await rpc(action, { ...args, revision: state?.revision })); selected = null; }
  catch (e) { error(e.message || 'Could not reach the table. Try again.'); await refresh(); }
  finally { busy = false; if (state) render(); else renderBusy(); }
}
async function refresh() {
  if (!state?.room || refreshing || busy) return;
  refreshing = true;
  try { const data = await rpc('get'); if (data.revision >= state.revision) { state = data; render(); } $('connection').textContent = 'Connected'; }
  catch (e) { $('connection').textContent = navigator.onLine ? 'Retrying connection…' : 'Offline — reconnect to play'; }
  finally { refreshing = false; }
}
function renderBusy() { document.querySelectorAll('main button:not([data-install])').forEach(b => b.disabled = busy || !sessionReady); }
const renderTable=createTable({board:$('board'),hand:$('hand'),pass:$('pass'),choice:$('choice'),status:$('status')});
function render() {
  if (!state) return;
  $('home').hidden = true; $('room').hidden = false;
  $('room-code').textContent = state.code;
  $('players').replaceChildren(...Array.from({ length: 4 }, (_, i) => {
    const el = document.createElement('div'); el.className = `seat ${state.phase === 'playing' && state.turn === i ? 'active' : ''}`;
    const name = document.createElement('strong'); name.textContent = state.players[i]?.name || 'Open seat';
    const info = document.createElement('small'); info.textContent = state.players[i] ? `${i === state.me ? 'You · ' : ''}${state.scores[i]} points · ${state.counts[i]} tiles${i === 0 ? ' · Host' : ''}` : 'Waiting for a friend'; el.append(name, info); return el;
  }));
  const lobby = state.phase === 'lobby', playing = state.phase === 'playing', myTurn = playing && state.turn === state.me;
  document.body.classList.toggle('dominoes-playing',!lobby);
  $('lobby').hidden = !lobby; $('table').hidden = lobby;
  $('waiting').textContent = `${state.players.length}/4 seated. ${state.me === 0 ? 'Deal when everyone is here.' : 'The host will deal.'}`;
  renderBusy();
  $('start').disabled = busy || state.me !== 0 || state.players.length !== 4;
  if (lobby) return;
  $('status').textContent = `Hand ${state.handNumber} · ${playing ? (myTurn ? 'Your turn — choose a highlighted tile' : `${state.players[state.turn].name} to play`) : state.phase === 'match_complete' ? 'Match complete' : 'Hand complete'}`;
  const board = state.board || [];

  $('ends').textContent = board.length ? `Open ends: ${board[0][0]} and ${board.at(-1)[1]}` : '';
  $('empty').hidden = board.length > 0;
  $('empty').textContent = state.handNumber === 1 ? 'Double-six opens the first hand' : `${state.players[state.turn].name} opens with any tile`;
  $('hand').replaceChildren(...state.hand.map(tile => {
    const el = tileNode(tile, true), valid = canPlay(tile, board, state.handNumber);
    el.disabled = busy || !myTurn || !valid; if (myTurn && valid) el.classList.add('playable');
    el.onclick = () => { selected = tile; showChoice(); }; return el;
  }));
  renderTable(state);
  $('pass').disabled = busy || !myTurn || state.hand.some(t => canPlay(t, board, state.handNumber));
  if (!myTurn) selected = null;
  showChoice();
  $('next').hidden = state.phase !== 'hand_complete' || state.me !== 0;
  $('result').hidden = !state.result;
  if (state.result) {
    const who = state.result.winner;
    $('result').textContent = `${who == null ? 'Blocked hand tied — no point.' : `${state.players[who].name} wins ${state.phase === 'match_complete' ? 'the match!' : 'the hand! +1 point.'}`} ${state.result.blocked ? 'Lowest remaining pip count decides blocked hands.' : ''} ${state.phase === 'hand_complete' && state.me !== 0 ? 'Waiting for the host to deal.' : ''}`;
  }
  $('history').replaceChildren(...state.history.map(h => {
    const row = document.createElement('div'); row.className = 'review-row';
    row.textContent = `Hand ${h.hand}: ${h.winner == null ? 'Tie' : state.players[h.winner].name + ' won'} · Scores ${h.scores.join(' / ')} · Remaining pips ${h.hands.map(hand => hand.reduce((sum,t)=>sum+t[0]+t[1],0)).join(' / ')}`; return row;
  }));
  $('events').replaceChildren(...(state.events || []).map(e => { const li = document.createElement('li'); li.textContent = `${state.players[e.seat].name} ${e.action === 'pass' ? `passed on ${e.ends.join(' / ')}` : `played ${e.tile.join('–')} ${e.end || ''}`}`; return li; }));
}
function showChoice() {
  $('choice').hidden = !selected;
  if (!selected) return;
  $('choice-text').textContent = `Play ${selected.join('–')} on which end?`;
  for (const end of ['left','right']) $(end).disabled = busy || !fits(selected, state.board, end, state.handNumber);
}
$('entry').onsubmit = e => {
  e.preventDefault(); const action = e.submitter.value;
  localStorage.setItem('dominoes.name', $('name').value.trim());
  act(action, { name: $('name').value.trim(), code: $('code').value.trim().toUpperCase() });
};
$('start').onclick = () => act('start'); $('next').onclick = () => act('next'); $('pass').onclick = () => act('pass');
for (const end of ['left','right']) $(end).onclick = () => act('play', { tile: selected, end });
$('cancel').onclick = () => { selected = null; showChoice(); };
$('invite').onclick = async () => { try { await navigator.clipboard.writeText(`${location.origin}${location.pathname}?room=${state.code}`); $('invite').textContent = 'Copied!'; } catch { error(`Share room code: ${state.code}`); } };
$('tables').onclick = async () => { if (channel) await supabase.removeChannel(channel); channel = null; state = null; selected = null; document.body.classList.remove('dominoes-playing'); $('room').hidden = true; $('home').hidden = false; $('resume').hidden = !saved; history.replaceState(null, '', location.pathname); };
async function resume(expectedCode) {
  if (!saved || busy || !sessionReady) return;
  busy = true;
  try { const { data, error: problem } = await supabase.rpc('dominoes_action', { p_action: 'get', p_room: saved }); if (problem) throw problem; if (!expectedCode || data.code === expectedCode.toUpperCase()) await adopt(data); }
  catch(e) { error(e.message); }
  finally { busy = false; if (state) render(); }
}
$('resume').onclick = () => resume();
$('name').value = localStorage.getItem('dominoes.name') || '';
const invite = new URLSearchParams(location.search).get('room'); $('code').value = invite || '';
renderBusy();
try { await ensureAnonymousSession(); sessionReady = true; renderBusy(); $('connection').textContent = 'Ready'; $('resume').hidden = !saved; if (saved) await resume(invite); }
catch(e) { error(`Unable to connect: ${e.message}. Reload to try again.`); }
setInterval(refresh, 5000);
window.addEventListener('online', refresh); document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
