-- Run as a database administrator. All fixtures are rolled back.
begin;
do $$
declare
 users uuid[]:=array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
 snap jsonb; other jsonb; rid uuid; code text; tile jsonb; chosen jsonb; side text;
 i int; k int; steps int:=0; turn int; expected_starter int; rejected boolean; seen jsonb;
begin
 perform set_config('request.jwt.claim.sub',users[1]::text,true);
 snap:=public.dominoes_action('create',null,'{"name":"Test host"}');
 rid:=(snap->>'room')::uuid; code:=snap->>'code';
 for i in 2..4 loop
  perform set_config('request.jwt.claim.sub',users[i]::text,true);
  snap:=public.dominoes_action('join',null,jsonb_build_object('name','Test '||i,'code',code));
 end loop;
 -- Same browser identity reconnects without consuming another seat.
 snap:=public.dominoes_action('join',null,jsonb_build_object('name','Again','code',code));
 assert jsonb_array_length(snap->'players')=4,'Rejoin duplicated seat';
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 rejected:=false;
 begin perform public.dominoes_action('get',rid); exception when others then rejected:=true; end;
 assert rejected,'Outsider read was allowed';
 perform set_config('request.jwt.claim.sub',users[2]::text,true);
 rejected:=false;
 begin perform public.dominoes_action('start',rid); exception when others then rejected:=true; end;
 assert rejected,'Non-host started match';
 perform set_config('request.jwt.claim.sub',users[1]::text,true);
 snap:=public.dominoes_action('start',rid);
 assert jsonb_array_length(snap->'hand')=7,'Incorrect deal';
 assert not snap ? 'hands','Live opponent hands leaked';
 select state->'hands' into seen from dominoes_private.games where room_id=rid;
 assert (select count(distinct t) from jsonb_array_elements(seen) h cross join jsonb_array_elements(h) t)=28,'Deal has duplicates';
 turn:=(snap->>'turn')::int;
 perform set_config('request.jwt.claim.sub',users[(turn+1)%4+1]::text,true);
 rejected:=false;
 begin perform public.dominoes_action('pass',rid,jsonb_build_object('revision',snap->'revision')); exception when others then rejected:=true; end;
 assert rejected,'Out of turn action allowed';
 perform set_config('request.jwt.claim.sub',users[turn+1]::text,true);
 rejected:=false;
 begin perform public.dominoes_action('pass',rid,jsonb_build_object('revision',snap->'revision')); exception when others then rejected:=true; end;
 assert rejected,'Illegal pass allowed';
 rejected:=false;
 begin perform public.dominoes_action('play',rid,jsonb_build_object('revision',-1,'tile','[6,6]'::jsonb,'end','right')); exception when others then rejected:=true; end;
 assert rejected,'Stale action allowed';
 snap:=public.dominoes_action('get',rid);
 select value into chosen from jsonb_array_elements(snap->'hand') where value<>'[6,6]'::jsonb limit 1;
 rejected:=false;
 begin perform public.dominoes_action('play',rid,jsonb_build_object('revision',snap->'revision','tile',chosen,'end','right')); exception when others then rejected:=true; end;
 assert rejected,'First hand allowed a non-double-six opening';
 -- Exercise complete matches with server-validated plays and forced passes.
 for k in 1..3 loop
  loop
   steps:=steps+1; assert steps<10000,'Match did not terminate';
   exit when snap->>'phase'='match_complete';
   if snap->>'phase'='hand_complete' then
    expected_starter:=coalesce((snap->'result'->>'winner')::int,(snap->>'starter')::int);
    perform set_config('request.jwt.claim.sub',users[1]::text,true);
    snap:=public.dominoes_action('next',rid);
    assert (snap->>'turn')::int=expected_starter,'Previous winner did not start';
   end if;
   turn:=(snap->>'turn')::int;
   perform set_config('request.jwt.claim.sub',users[turn+1]::text,true);
   snap:=public.dominoes_action('get',rid); chosen:=null; side:='right';
   for tile in select value from jsonb_array_elements(snap->'hand') loop
    if jsonb_array_length(snap->'board')=0 then
     if (snap->>'handNumber')::int>1 or tile='[6,6]'::jsonb then chosen:=tile; exit; end if;
    elsif tile @> jsonb_build_array(snap->'board'->0->0) then chosen:=tile; side:='left'; exit;
    elsif tile @> jsonb_build_array(snap->'board'->(jsonb_array_length(snap->'board')-1)->1) then chosen:=tile; exit;
    end if;
   end loop;
   if chosen is null then snap:=public.dominoes_action('pass',rid,jsonb_build_object('revision',snap->'revision'));
   else snap:=public.dominoes_action('play',rid,jsonb_build_object('revision',snap->'revision','tile',chosen,'end',side)); end if;
   if snap->>'phase'='playing' then assert not snap ? 'hands','Live hands leaked'; end if;
  end loop;
  assert (select max(value::int) from jsonb_array_elements_text(snap->'scores'))=6,'Match target wrong';
  if k<3 then
   -- Reset fixture to lobby for another independent randomized match.
   update dominoes_private.games set state=state||'{"phase":"lobby","scores":[0,0,0,0],"history":[],"handNumber":0}'::jsonb where room_id=rid;
   perform set_config('request.jwt.claim.sub',users[1]::text,true);
   snap:=public.dominoes_action('start',rid);
  end if;
 end loop;
 -- Deterministic blocked win and tied blocked hand.
 for k in 1..2 loop
  update dominoes_private.games set state=state||jsonb_build_object('phase','playing','turn',0,'starter',2,'passes',0,'board','[[6,6]]'::jsonb,'scores','[0,0,0,0]'::jsonb,'hands',case when k=1 then '[[[0,0]],[[1,1]],[[2,2]],[[3,3]]]'::jsonb else '[[[0,3]],[[1,2]],[[4,4]],[[5,5]]]'::jsonb end) where room_id=rid;
  for i in 1..4 loop
   perform set_config('request.jwt.claim.sub',users[i]::text,true);
   snap:=public.dominoes_action('get',rid);
   snap:=public.dominoes_action('pass',rid,jsonb_build_object('revision',snap->'revision'));
  end loop;
  assert snap->>'phase'='hand_complete','Blocked hand did not finish';
  if k=1 then assert snap->'result'->>'winner'='0','Lowest pips did not win';
  else assert snap->'result'->>'winner' is null and snap->'scores'='[0,0,0,0]'::jsonb,'Tied block awarded a point'; end if;
  perform set_config('request.jwt.claim.sub',users[1]::text,true);
  snap:=public.dominoes_action('next',rid);
  assert (snap->>'turn')::int=case when k=1 then 0 else 2 end,'Blocked win/tie chose wrong starter';
  turn:=(snap->>'turn')::int;
  perform set_config('request.jwt.claim.sub',users[turn+1]::text,true);
  snap:=public.dominoes_action('get',rid);
  select value into chosen from jsonb_array_elements(snap->'hand') where value<>'[6,6]'::jsonb limit 1;
  snap:=public.dominoes_action('play',rid,jsonb_build_object('revision',snap->'revision','tile',chosen,'end','right'));
  assert snap->'board'->0=chosen,'Later hand rejected chosen opening tile';
 end loop;
 raise notice 'PASS: access, deal, rejoin, turn/pass/revision enforcement and 3 full matches (% actions)',steps;
end $$;
set local role authenticated;
do $$
declare snap jsonb; rid uuid; denied boolean:=false;
begin
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 snap:=public.dominoes_action('create',null,'{"name":"RLS test"}');
 rid:=(snap->>'room')::uuid;
 assert (select count(*) from public.dominoes_rooms where id=rid)=1,'Member cannot read realtime row';
 begin perform state from dominoes_private.games; exception when insufficient_privilege then denied:=true; end;
 assert denied,'Authenticated role can read private game state';
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 assert (select count(*) from public.dominoes_rooms where id=rid)=0,'Outsider can read realtime row';
end $$;
select 'PASS: three full matches, blocked win/tie, RLS and private-hand protections' as test_result;
rollback;
