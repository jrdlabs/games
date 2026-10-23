import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../js/dominoes-table.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
const {chainLayout,tileOffset}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const deck=Array.from({length:7},(_,a)=>Array.from({length:7-a},(_,b)=>[a,a+b])).flat();
for(const [width,height] of [[170,220],[170,330],[230,420],[480,600],[700,700]]){
 for(let count=1;count<=28;count++)for(let anchor=0;anchor<count;anchor++){
  const poses=chainLayout(count,anchor,width,height,deck.slice(0,count));assert.equal(poses.length,count);
  for(const p of poses){assert(p.x-p.w/2>=2);assert(p.x+p.w/2<=width-2);assert(p.y-p.h/2>=2);assert(p.y+p.h/2<=height-2);}
  for(const side of [-1,1]){
   let previous=poses[anchor];
   for(let i=anchor+side;i>=0&&i<count;i+=side){const current=poses[i];
    if(current.leg===1&&previous.leg===0)assert(Math.abs((current.y+side*current.h/2)-(previous.y+side*previous.h/2))<.01,'Corner end-halves do not align');
    if(current.leg===2&&previous.leg===1)assert(Math.abs((current.x+side*current.w/2)-(previous.x+side*previous.w/2))<.01,'Outer corner end-halves do not align');
    previous=current;
   }
  }
  for(let a=0;a<count;a++)for(let b=a+1;b<count;b++){
   const p=poses[a],q=poses[b];assert(Math.abs(p.x-q.x)>=(p.w+q.w)/2+1||Math.abs(p.y-q.y)>=(p.h+q.h)/2+1,`Overlap: ${width} ${height} ${count} ${anchor} ${a} ${b}`);
  }
 }
}
assert.deepEqual(tileOffset([2,5]),tileOffset([5,2]));
assert.deepEqual(tileOffset([2,5]),tileOffset([2,5]));
assert.equal(chainLayout(1,0,300,500,[[6,6]])[0].angle,90,'Opening double must lie crosswise');
assert.equal(chainLayout(2,0,300,500,[[6,6],[6,3]])[1].angle,0,'Ordinary tile stays vertical');
const poses=chainLayout(20,10,300,500);
assert(poses.slice(0,10).some(p=>p.x<150),'Upper branch never turns left');
assert(poses.slice(11).some(p=>p.x>150),'Lower branch never turns right');
console.log('PASS: 28 tiles, every opening-tile position, four viewport sizes, no overlap/clipping, both outward bends, stable tile offsets.');
