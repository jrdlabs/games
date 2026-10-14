-- Update existing Dominoes: double-six opens only hand one; winners lead subsequent hands.
create or replace function dominoes_private.action(p_action text,p_room uuid,p_args jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid(); rid uuid:=p_room; s jsonb; code text; me int; n int; i int; j int;
 deck jsonb; hands jsonb; h jsonb; tile jsonb; board jsonb; players jsonb;
 a int; b int; l int; r int; turn int; winner int; best int; pip int;
 ties int; points jsonb; result jsonb; counts jsonb; changed boolean:=false;
begin
 if uid is null then raise exception 'Sign in first'; end if;
 if p_action='create' then
  if length(trim(coalesce(p_args->>'name',''))) not between 1 and 24 then raise exception 'Enter a name (1–24 characters)'; end if;
  -- A user's lobby creation is bounded; completed matches may remain as history.
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  if (select count(*) from dominoes_private.games where state->'players'->0->>'id'=uid::text and state->>'phase'='lobby')>=5 then raise exception 'You already have five waiting rooms'; end if;
  loop
   code:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
   begin
    insert into public.dominoes_rooms(code) values(code) returning id into rid;
    exit;
   exception when unique_violation then null;
   end;
  end loop;
  s:=jsonb_build_object('phase','lobby','players',jsonb_build_array(jsonb_build_object('id',uid,'name',trim(p_args->>'name'))),'scores','[0,0,0,0]'::jsonb,'history','[]'::jsonb,'handNumber',0);
  insert into dominoes_private.games values(rid,s);
 elsif p_action='join' then
  select id into rid from public.dominoes_rooms where dominoes_rooms.code=upper(trim(p_args->>'code'));
  if rid is null then raise exception 'Room not found'; end if;
 end if;
 select state into s from dominoes_private.games where room_id=rid for update;
 if s is null then raise exception 'Room not found'; end if;
 select ordinality::int-1 into me from jsonb_array_elements(s->'players') with ordinality where value->>'id'=uid::text;
 if p_action='join' and me is null then
  if s->>'phase'<>'lobby' or jsonb_array_length(s->'players')>=4 then raise exception 'This room is full or already playing'; end if;
  if length(trim(coalesce(p_args->>'name',''))) not between 1 and 24 then raise exception 'Enter a name (1–24 characters)'; end if;
  me:=jsonb_array_length(s->'players');
  s:=jsonb_set(s,'{players}',(s->'players')||jsonb_build_array(jsonb_build_object('id',uid,'name',trim(p_args->>'name')))); changed:=true;
 end if;
 if me is null then raise exception 'You are not seated in this room'; end if;
 if p_action in ('start','next') then
  if me<>0 then raise exception 'Only the host can deal'; end if;
  if jsonb_array_length(s->'players')<>4 then raise exception 'Four players are required'; end if;
  if (p_action='start' and s->>'phase'<>'lobby') or (p_action='next' and s->>'phase'<>'hand_complete') then raise exception 'Cannot deal now'; end if;
  select jsonb_agg(jsonb_build_array(x,y) order by random()) into deck from generate_series(0,6) x cross join generate_series(0,6) y where x<=y;
  hands:='[]';
  for i in 0..3 loop
   h:='[]';
   for j in 0..6 loop
    tile:=deck->(i*7+j); h:=h||jsonb_build_array(tile);
    if p_action='start' and tile='[6,6]'::jsonb then turn:=i; end if;
   end loop;
   hands:=hands||jsonb_build_array(h);
  end loop;
  if p_action='next' then
   -- A tied block has no winner: retain that hand's starter for the redeal.
   -- Event fallback supports rooms created before starter was recorded explicitly.
   turn:=coalesce((s->'result'->>'winner')::int,(s->>'starter')::int,(s->'events'->0->>'seat')::int,(s->>'turn')::int,0);
  end if;
  s:=s||jsonb_build_object('hands',hands,'board','[]'::jsonb,'turn',turn,'starter',turn,'passes',0,'phase','playing','handNumber',(s->>'handNumber')::int+1,'events','[]'::jsonb,'result',null);
  changed:=true;
 elsif p_action in ('play','pass') then
  if s->>'phase'<>'playing' or (s->>'turn')::int<>me then raise exception 'It is not your turn'; end if;
  if (p_args->>'revision')::bigint is distinct from (select revision from public.dominoes_rooms where id=rid) then raise exception 'Table changed. Try again.'; end if;
  h:=s->'hands'->me; board:=s->'board';
  n:=jsonb_array_length(board);
  if n>0 then l:=(board->0->>0)::int; r:=(board->(n-1)->>1)::int; end if;
  if p_action='pass' then
   if n=0 or exists(select 1 from jsonb_array_elements(h) t where (t->>0)::int in(l,r) or (t->>1)::int in(l,r)) then raise exception 'You have a playable tile'; end if;
   s:=jsonb_set(s,'{passes}',to_jsonb((s->>'passes')::int+1));
   s:=jsonb_set(s,'{events}',(s->'events')||jsonb_build_array(jsonb_build_object('seat',me,'action','pass','ends',jsonb_build_array(l,r))));
  else
   tile:=p_args->'tile';
   if not exists(select 1 from jsonb_array_elements(h) t where t=tile) then raise exception 'Tile is not in your hand'; end if;
   a:=(tile->>0)::int; b:=(tile->>1)::int;
   if n=0 then
    if (s->>'handNumber')::int=1 and tile<>'[6,6]'::jsonb then raise exception 'Open the first hand with double-six'; end if;
    board:=jsonb_build_array(tile);
   elsif p_args->>'end'='left' then
    if b=l then null; elsif a=l then tile:=jsonb_build_array(b,a); else raise exception 'Tile does not fit the left end'; end if;
    board:=jsonb_build_array(tile)||board;
   elsif p_args->>'end'='right' then
    if a=r then null; elsif b=r then tile:=jsonb_build_array(b,a); else raise exception 'Tile does not fit the right end'; end if;
    board:=board||jsonb_build_array(tile);
   else raise exception 'Choose left or right';
   end if;
   select coalesce(jsonb_agg(t),'[]'::jsonb) into h from jsonb_array_elements(h) t where t<>p_args->'tile';
   s:=jsonb_set(s,array['hands',me::text],h);
   s:=s||jsonb_build_object('board',board,'passes',0);
   s:=jsonb_set(s,'{events}',(s->'events')||jsonb_build_array(jsonb_build_object('seat',me,'action','play','tile',tile,'end',p_args->>'end')));
   if jsonb_array_length(h)=0 then winner:=me; end if;
  end if;
  if (s->>'passes')::int=4 then
   best:=1000; ties:=0;
   for i in 0..3 loop
    select coalesce(sum((t->>0)::int+(t->>1)::int),0)::int into pip from jsonb_array_elements(s->'hands'->i) t;
    if pip<best then best:=pip; winner:=i; ties:=1; elsif pip=best then ties:=ties+1; end if;
   end loop;
   if ties>1 then winner:=null; end if;
  end if;
  if winner is not null or (s->>'passes')::int=4 then
   points:=s->'scores';
   if winner is not null then points:=jsonb_set(points,array[winner::text],to_jsonb((points->>winner)::int+1)); end if;
   result:=jsonb_build_object('hand',s->'handNumber','winner',winner,'blocked',(s->>'passes')::int=4,'scores',points,'hands',s->'hands');
   s:=s||jsonb_build_object('scores',points,'phase',case when winner is not null and (points->>winner)::int>=6 then 'match_complete' else 'hand_complete' end,'result',result,'history',(s->'history')||jsonb_build_array(result));
  else s:=jsonb_set(s,'{turn}',to_jsonb((me+1)%4));
  end if;
  changed:=true;
 elsif p_action not in ('create','join','get') then raise exception 'Unknown action';
 end if;
 if changed then
  update dominoes_private.games set state=s where room_id=rid;
  update public.dominoes_rooms set revision=revision+1 where id=rid;
 end if;
 -- Return the caller's hand and public counts, never opponents' live hands or IDs.
 players:='[]'; counts:='[]';
 for i in 0..jsonb_array_length(s->'players')-1 loop
  players:=players||jsonb_build_array(jsonb_build_object('name',s->'players'->i->>'name','seat',i));
  counts:=counts||to_jsonb(coalesce(jsonb_array_length(s->'hands'->i),0));
 end loop;
 return (s-'hands'-'players')||jsonb_build_object('room',rid,'code',(select dominoes_rooms.code from public.dominoes_rooms where id=rid),'revision',(select revision from public.dominoes_rooms where id=rid),'me',me,'players',players,'counts',counts,'hand',coalesce(s->'hands'->me,'[]'::jsonb));
end;
$$;
