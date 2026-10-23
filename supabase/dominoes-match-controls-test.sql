-- Isolated lifecycle fixtures: all changes roll back, including generated rooms.
begin;
do $$
declare host uuid:=gen_random_uuid(); guest uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid(); snap jsonb; rid uuid; code text; revision bigint; failed boolean;
begin
 perform set_config('request.jwt.claim.sub',host::text,true);
 snap:=public.dominoes_action('create',null,'{"name":"Lifecycle test"}');rid:=(snap->>'room')::uuid;code:=snap->>'code';
 snap:=dominoes_private.engine(guest,'join',null,jsonb_build_object('name','Guest','code',code));
 perform dominoes_private.engine(gen_random_uuid(),'join',null,jsonb_build_object('name','Third','code',code));
 perform dominoes_private.engine(gen_random_uuid(),'join',null,jsonb_build_object('name','Fourth','code',code));
 snap:=public.dominoes_action('start',rid,'{}');revision:=(snap->>'revision')::bigint;
 failed:=false;begin perform public.dominoes_action('close',rid,jsonb_build_object('revision',revision));exception when others then failed:=sqlerrm='The match must finish first';end;assert failed,'Live match was closed';
 update dominoes_private.games set state=state||'{"phase":"match_complete","scores":[6,2,1,0],"result":{"winner":0},"history":[{"hand":6,"winner":0,"scores":[6,2,1,0]}]}'::jsonb where room_id=rid;
 perform set_config('request.jwt.claim.sub',guest::text,true);
 failed:=false;begin perform public.dominoes_action('restart',rid,jsonb_build_object('revision',revision));exception when others then failed:=sqlerrm='Only the host can restart or close the table';end;assert failed,'Guest restarted match';
 failed:=false;begin perform public.dominoes_action('close',rid,jsonb_build_object('revision',revision));exception when others then failed:=sqlerrm='Only the host can restart or close the table';end;assert failed,'Guest closed match';
 perform set_config('request.jwt.claim.sub',outsider::text,true);
 failed:=false;begin perform public.dominoes_action('close',rid,jsonb_build_object('revision',revision));exception when others then failed:=sqlerrm='Only the host can restart or close the table';end;assert failed,'Outsider closed match';
 perform set_config('request.jwt.claim.sub',host::text,true);
 failed:=false;begin perform public.dominoes_action('restart',rid,jsonb_build_object('revision',revision-1));exception when others then failed:=sqlerrm='Table changed. Try again.';end;assert failed,'Stale restart accepted';
 snap:=public.dominoes_action('restart',rid,jsonb_build_object('revision',revision));
 assert snap->>'phase'='playing' and snap->'scores'='[0,0,0,0]'::jsonb and snap->>'handNumber'='1','Restart did not reset match';
 assert jsonb_array_length(snap->'players')=4 and jsonb_array_length(snap->'hand')=7 and snap->>'code'=code,'Restart lost seats or code';
 assert snap->'previousMatches'->0->'scores'='[6,2,1,0]'::jsonb and jsonb_array_length(snap->'history')=0,'Scores were not archived';
 assert exists(select 1 from dominoes_private.games g,jsonb_array_elements(g.state->'hands'->(snap->>'turn')::int) tile where g.room_id=rid and tile='[6,6]'::jsonb),'Double-six holder does not start rematch';
 update dominoes_private.games set state=state||'{"phase":"match_complete","result":{"winner":0}}'::jsonb where room_id=rid;
 snap:=public.dominoes_action('close',rid,jsonb_build_object('revision',snap->'revision'));
 assert snap->>'phase'='closed','Close did not persist';
 perform set_config('request.jwt.claim.sub',guest::text,true);
 execute 'set local role authenticated';
 snap:=public.dominoes_action('get',rid,'{}');assert snap->>'phase'='closed','Guest cannot observe close through authenticated RPC';
 assert not has_function_privilege('authenticated','dominoes_private.finish_match(text,uuid,jsonb)','EXECUTE'),'Private lifecycle bypass callable';
 assert not has_function_privilege('anon','public.dominoes_action(text,uuid,jsonb)','EXECUTE'),'Anonymous RPC privilege broadened';
end;
$$;
rollback;
