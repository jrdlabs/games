-- Admin-only database test; all users, identities, allowlist entries and rooms roll back.
begin;
do $$
declare
 admin_id uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid();
 snap jsonb; normal jsonb; rid uuid; code text; denied boolean; turns int:=0;
begin
 insert into dominoes_private.admin_email_allowlist values('admin-test@example.invalid');
 insert into auth.users(id,email,raw_user_meta_data,is_anonymous) values(admin_id,'admin-test@example.invalid','{}',false),(outsider,'outsider-test@example.invalid','{"email":"admin-test@example.invalid","email_verified":true}',false);
 perform set_config('request.jwt.claim.sub',outsider::text,true);
 denied:=false;
 begin perform public.dominoes_admin_action('status'); exception when others then denied:=true; end;
 assert denied,'Editable user metadata bypassed admin protection';
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 denied:=false;
 begin perform public.dominoes_admin_action('status'); exception when others then denied:=true; end;
 assert denied,'Unconfirmed email granted admin';
 update auth.users set email_confirmed_at=now() where id=admin_id;
 assert public.dominoes_admin_account()->>'needsPassword'='true','Invited user did not get password setup';
 denied:=false;
 begin perform public.dominoes_admin_action('status'); exception when others then denied:=true; end;
 assert denied,'Account without password received admin access';
 update auth.users set encrypted_password='fixture-hash-not-a-real-password' where id=admin_id;
 -- Run RPCs with the actual authenticated role, not database-owner privileges.
 execute 'set local role authenticated';
 assert public.dominoes_admin_action('status')->>'admin'='true','Approved confirmed password account rejected';
 denied:=false;
 begin perform dominoes_private.engine(admin_id,'create',null,'{"name":"Bypass"}'); exception when insufficient_privilege then denied:=true; end;
 assert denied,'Authenticated caller can impersonate an engine actor';
 snap:=public.dominoes_admin_action('create');rid:=(snap->>'room')::uuid;code:=snap->>'code';
 assert snap->>'test'='true' and jsonb_array_length(snap->'players')=4,'Test room not filled';
 assert not snap ? 'fullHands','Hands revealed without requesting';
 snap:=public.dominoes_admin_action('get',rid,'{"reveal":true,"seat":1}');
 assert jsonb_array_length(snap->'fullHands')=4 and snap->>'me'='1','Reveal/seat view failed';
 denied:=false;
 begin perform public.dominoes_action('join',null,jsonb_build_object('name','Sneak','code',code)); exception when others then denied:=true; end;
 assert denied,'Regular game API accepted a test room';
 perform set_config('request.jwt.claim.sub',outsider::text,true);
 denied:=false;
 begin perform public.dominoes_admin_action('get',rid,'{"reveal":true}'); exception when others then denied:=true; end;
 assert denied,'Outsider read admin hands';
 assert (select count(*) from public.dominoes_rooms where id=rid)=0,'Outsider read test realtime row';
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 -- Bots complete an entire match through the same engine as regular players.
 snap:=public.dominoes_admin_action('get',rid);
 while snap->>'phase'<>'match_complete' loop
  turns:=turns+1;assert turns<4000,'Bots did not complete match';
  snap:=public.dominoes_admin_action(case when snap->>'phase'='hand_complete' then 'next' else 'step' end,rid);
 end loop;
 assert (select max(value::int) from jsonb_array_elements_text(snap->'scores'))=6,'Bot match score wrong';
 snap:=public.dominoes_admin_action('reset',rid);
 assert snap->>'handNumber'='1' and snap->'scores'='[0,0,0,0]'::jsonb,'Reset failed';
 snap:=public.dominoes_admin_action('scenario',rid,'{"scenario":"blocked"}');
 for i in 1..4 loop snap:=public.dominoes_admin_action('step',rid);end loop;
 assert snap->'result'->>'winner'='0','Blocked scenario failed';
 snap:=public.dominoes_admin_action('scenario',rid,'{"scenario":"tie"}');
 for i in 1..4 loop snap:=public.dominoes_admin_action('step',rid);end loop;
 assert snap->>'phase'='hand_complete' and snap->'result'->>'winner' is null,'Tie scenario failed';
 snap:=public.dominoes_admin_action('scenario',rid,'{"scenario":"last_tile"}');
 snap:=public.dominoes_admin_action('step',rid);
 assert snap->'result'->>'winner'='0','Last tile scenario failed';
 snap:=public.dominoes_admin_action('scenario',rid,'{"scenario":"winner_opens"}');
 assert snap->>'turn'='2' and snap->>'handNumber'='3','Winner opening scenario failed';
 normal:=public.dominoes_action('create',null,'{"name":"Normal regression"}');
 assert normal->>'phase'='lobby','Regular game creation regressed';
end $$;
select 'PASS: bound email/password admin guard, unconfirmed and missing-password rejection, metadata spoof rejection, engine permissions, test isolation, full bot match and scenarios' as test_result;
rollback;
