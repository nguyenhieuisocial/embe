-- Synthetic database-only verifier. Never commits fixtures or reads family health data.
BEGIN;
DO $$
DECLARE a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); r uuid:=gen_random_uuid(); other_record uuid:=gen_random_uuid();
  d uuid:=gen_random_uuid(); value jsonb; doc jsonb; result jsonb;
BEGIN
  ASSERT NOT has_table_privilege('anon','portal_read_model.family_health_document','SELECT');
  ASSERT NOT has_table_privilege('authenticated','portal_read_model.family_health_document','INSERT');
  ASSERT NOT has_function_privilege('anon','public.embe_family_health_documents(uuid,uuid,text,uuid,jsonb)','EXECUTE');
  ASSERT NOT has_function_privilege('authenticated','public.embe_search_member_records(uuid,integer,boolean,text,text)','EXECUTE');
  ASSERT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='portal_read_model.family_health_document'::regclass);
  PERFORM public.embe_save_family_member(a,0,jsonb_build_object('role','relative','fullName','SYNTHETIC HEALTH VERIFIER A','preferredName','',
    'birthDate',null,'sexAtBirth','unknown','details','{}'::jsonb,'archived',false));
  PERFORM public.embe_save_family_member(b,0,jsonb_build_object('role','relative','fullName','SYNTHETIC HEALTH VERIFIER B','preferredName','',
    'birthDate',null,'sexAtBirth','unknown','details','{}'::jsonb,'archived',false));
  value:=jsonb_build_object('id',r,'memberId',a,'kind','visit','title','SYNTHETIC clinical record',
    'occurredAt','2025-01-01T08:00:00Z','notes','','source','SYNTHETIC facility','nextDueDate',null,
    'metric',null,'value',null,'secondaryValue',null,'unit',null,'deleted',false,
    'clinical',jsonb_build_object('specialty','Synthetic specialty','clinician','Synthetic clinician','diagnosis','Copied from fixture'),
    'labResults',jsonb_build_array(jsonb_build_object('name','Synthetic result','value','Negative','unit','','referenceRange','Per fixture')));
  result:=public.embe_save_member_record(a,r,0,value);
  ASSERT result->'clinical'->>'diagnosis'='Copied from fixture';
  ASSERT result->'labResults'->0->>'value'='Negative';
  PERFORM public.embe_save_member_record(b,other_record,0,value||jsonb_build_object('id',other_record,'memberId',b));
  doc:=public.embe_family_health_documents(a,r,'create',d,jsonb_build_object('filename','fixture.pdf','mimeType','application/pdf','byteSize',3));
  ASSERT doc->>'storage_path'='family/'||a||'/'||r||'/'||d||'.pdf';
  ASSERT doc->>'status'='pending';
  -- Idempotent retry does not insert a duplicate object registration.
  PERFORM public.embe_family_health_documents(a,r,'create',d,jsonb_build_object('filename','fixture.pdf','mimeType','application/pdf','byteSize',3));
  ASSERT jsonb_array_length(public.embe_family_health_documents(a,r,'list'))=1;
  ASSERT NOT (public.embe_family_health_documents(a,r,'list')->0 ? 'storage_path');
  BEGIN
    PERFORM public.embe_family_health_documents(b,r,'get',d);
    RAISE EXCEPTION 'wrong member was accepted';
  EXCEPTION WHEN no_data_found THEN NULL; END;
  BEGIN
    PERFORM public.embe_family_health_documents(b,other_record,'get',d);
    RAISE EXCEPTION 'document from another record was accepted';
  EXCEPTION WHEN no_data_found THEN NULL; END;
  BEGIN
    PERFORM public.embe_family_health_documents(a,r,'create',d,jsonb_build_object('filename','changed.pdf','mimeType','application/pdf','byteSize',3));
    RAISE EXCEPTION 'conflicting metadata was accepted';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  -- Completion here tests DB transitions only. HTTP verifier covers actual blob type/size.
  PERFORM public.embe_family_health_documents(a,r,'complete',d);
  PERFORM public.embe_family_health_documents(a,r,'remove',d);
  BEGIN
    PERFORM public.embe_family_health_documents(a,r,'get',d);
    RAISE EXCEPTION 'removed document was readable';
  EXCEPTION WHEN no_data_found THEN NULL; END;
  PERFORM public.embe_family_health_documents(a,r,'restore',d);
  ASSERT public.embe_family_health_documents(a,r,'get',d)->>'status'='ready';
  ASSERT jsonb_array_length(public.embe_search_member_records(a,0,false,'visit','Synthetic clinician')->'records')=1;
  ASSERT jsonb_array_length(public.embe_search_member_records(a,0,false,'measurement','Synthetic clinician')->'records')=0;
  result:=public.embe_save_member_record(a,r,1,value||jsonb_build_object('notes','Edited fixture'));
  ASSERT (result->>'revision')::int=2;
  BEGIN
    PERFORM public.embe_save_member_record(a,r,1,value||jsonb_build_object('notes','Stale edit'));
    RAISE EXCEPTION 'stale revision was accepted';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  PERFORM public.embe_save_member_record(a,r,2,result||jsonb_build_object('deleted',true));
  BEGIN
    PERFORM public.embe_family_health_documents(a,r,'get',d);
    RAISE EXCEPTION 'deleted record attachment was readable';
  EXCEPTION WHEN no_data_found THEN NULL; END;
  ASSERT jsonb_array_length(public.embe_search_member_records(a,0,false,'','')->'records')=0;
  ASSERT jsonb_array_length(public.embe_search_member_records(a,0,true,'','')->'records')=1;
END;
$$;
ROLLBACK;
SELECT 'family health isolation, revisions, filters, private document transitions passed; fixtures rolled back' AS verification;
