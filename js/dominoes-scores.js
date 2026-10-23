export function scoreRows(state){
 return (state.history||[]).map((hand,index)=>({hand:Number(hand.hand)||index+1,winner:hand.winner,blocked:!!hand.blocked,scores:hand.scores||[0,0,0,0]}));
}
export function createScoresheet(surface){
 const button=document.createElement('button');button.type='button';button.className='scores-button';button.textContent='Scores';
 button.setAttribute('aria-haspopup','dialog');surface.append(button);
 const dialog=document.createElement('dialog');dialog.className='scores-dialog';dialog.setAttribute('aria-label','Dominoes scoresheet');
 const top=document.createElement('div');top.className='scores-heading';const title=document.createElement('h2');title.textContent='Scoresheet';
 const close=document.createElement('button');close.type='button';close.textContent='Close';close.onclick=()=>dialog.close();top.append(title,close);
 const content=document.createElement('div');dialog.append(top,content);document.body.append(dialog);
 button.onclick=()=>{if(!dialog.open)dialog.showModal();};
 return state=>{
  button.disabled=false;
  const table=document.createElement('table');const caption=document.createElement('caption');caption.textContent=`Room ${state.code||'Test'} · First to 6 points`;table.append(caption);
  const header=document.createElement('thead'),hr=document.createElement('tr');
  ['Hand',...state.players.map(p=>p.name)].forEach(name=>{const th=document.createElement('th');th.scope='col';th.textContent=name;hr.append(th);});header.append(hr);table.append(header);
  const body=document.createElement('tbody');
  for(const row of scoreRows(state)){
   const tr=document.createElement('tr'),label=document.createElement('th');label.scope='row';label.textContent=String(row.hand);tr.append(label);
   row.scores.forEach((score,i)=>{const cell=document.createElement('td');cell.textContent=String(score);if(row.winner===i){cell.className='score-won';cell.setAttribute('aria-label',`${score} points, hand winner`);}tr.append(cell);});
   if(row.winner==null)label.textContent+=' · tie';else if(row.blocked)label.textContent+=' · block';body.append(tr);
  }
  table.append(body);const foot=document.createElement('tfoot'),totals=document.createElement('tr');
  ['Total',...state.scores].forEach((value,i)=>{const cell=document.createElement(i===0?'th':'td');cell.textContent=String(value);totals.append(cell);});foot.append(totals);table.append(foot);
  const note=document.createElement('p');note.textContent=state.history?.length?'Scores show running totals after each completed hand. Gold marks the hand winner.':'No hands completed yet. Totals will appear here as you play.';
  content.replaceChildren(table,note);
 };
}
