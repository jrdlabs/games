-- Run after dominoes-admin.sql (and the email/password admin update).
-- Additive match lifecycle controls; gameplay and Trumps remain unchanged.
begin;
create or replace function dominoes_private.finish_match(p_action text,p_room uuid,p_args jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); s jsonb; revision bigint; archived jsonb;
begin
 if uid is null then raise exception 'Sign in first'; end if;
 select state into s from dominoes_private.games where room_id=p_room for update;
 if s is null then raise exception 'Room not found'; end if;
 if s->'players'->0->>'id' is distinct from uid::text then raise exception 'Only the host can restart or close the table'; end if;
 if s->>'phase'<>'match_complete' then raise exception 'The match must finish first'; end if;
 select r.revision into revision from public.dominoes_rooms r where r.id=p_room;
 if (p_args->>'revision')::bigint is distinct from revision then raise exception 'Table changed. Try again.'; end if;
 if p_action='restart' then
  archived:=jsonb_build_object('scores',s->'scores','history',s->'history','winner',s->'result'->'winner','finishedAt',now());
  s:=s||jsonb_build_object('phase','lobby','scores','[0,0,0,0]'::jsonb,'history','[]'::jsonb,'handNumber',0,
   'previousMatches',coalesce(s->'previousMatches','[]'::jsonb)||jsonb_build_array(archived));
  update dominoes_private.games set state=s where room_id=p_room;
  -- The existing engine deals all 28 tiles and finds the double-six starter.
  return dominoes_private.engine(uid,'start',p_room,'{}');
 elsif p_action='close' then
  update dominoes_private.games set state=s||jsonb_build_object('phase','closed','closedAt',now()) where room_id=p_room;
  update public.dominoes_rooms r set revision=r.revision+1 where r.id=p_room;
  return dominoes_private.engine(uid,'get',p_room,'{}');
 end if;
 raise exception 'Unknown action';
end;
$$;
revoke all on function dominoes_private.finish_match(text,uuid,jsonb) from public,anon,authenticated;

create or replace function dominoes_private.action(p_action text,p_room uuid,p_args jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from dominoes_private.test_sessions t join public.dominoes_rooms r on r.id=t.room_id
  where t.room_id=p_room or (p_action='join' and r.code=upper(trim(p_args->>'code'))))
 then raise exception 'Test tables are available only in the admin area'; end if;
 if p_action in ('restart','close') then return dominoes_private.finish_match(p_action,p_room,p_args); end if;
 return dominoes_private.engine(auth.uid(),p_action,p_room,p_args);
end;
$$;
revoke all on function dominoes_private.action(text,uuid,jsonb) from public,anon;
grant execute on function dominoes_private.action(text,uuid,jsonb) to authenticated;
commit;
