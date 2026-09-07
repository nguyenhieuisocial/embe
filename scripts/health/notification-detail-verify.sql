-- Run only against the identity-verified EmBe project by an authorized operator.
-- This is a production-DB transaction, NOT an isolated environment. All fixture
-- rows and tentative queued deliveries are rolled back; no sender is called and
-- other transactions cannot see these uncommitted events. Never replace ROLLBACK.
BEGIN;
SET LOCAL statement_timeout = '10s';
SET LOCAL ROLE service_role;
DO $verify$
<<fixture>>
DECLARE
  record_id uuid := gen_random_uuid(); source_id uuid := gen_random_uuid();
  event_id uuid; second_event uuid; title text; body text; event_url text;
  endpoint_base text := 'https://notification-fixture.example.invalid/'||gen_random_uuid()::text;
  source_endpoint text; private_endpoint text; detail_endpoint text;
  kind text; label text; pair text[]; returned jsonb;
BEGIN
  source_endpoint:=endpoint_base||'/mother'; private_endpoint:=endpoint_base||'/private'; detail_endpoint:=endpoint_base||'/detail';
  INSERT INTO portal_read_model.push_subscription(endpoint,p256dh,auth,device_role,detail_preview)
  VALUES(source_endpoint,repeat('a',87),repeat('b',22),'mother',false),
    (private_endpoint,repeat('a',87),repeat('b',22),'father',false),
    (detail_endpoint,repeat('a',87),repeat('b',22),'father',true);
  INSERT INTO portal_read_model.pregnancy_medical_record(id,kind,status,occurred_at,title,provider,notes,document_date_only)
  VALUES(record_id,'appointment','planned','2026-09-09 08:30:00+07','EMBE SYNTHETIC VISIT','BV Mẫu','NEVER SHOW CLINICAL NOTE',false);
  event_id:=gen_random_uuid();
  PERFORM public.embe_publish_family_activity_v2(event_id,source_id,source_endpoint,'medical','created','hồ sơ khám',
    '/me-bau/ho-so#record-'||record_id::text,'record',record_id);
  SELECT e.title,e.body,e.target_url INTO title,body,event_url FROM portal_read_model.family_activity_event e WHERE e.event_id=fixture.event_id;
  IF title<>'Mẹ Ngân đã thêm lịch khám' OR body NOT LIKE '%08:30 09/09/2026%' OR body NOT LIKE '%BV Mẫu%'
    OR body LIKE '%NEVER SHOW%' OR event_url<>'/me-bau/ho-so#record-'||record_id::text THEN RAISE EXCEPTION 'appointment detail failed'; END IF;
  IF EXISTS(SELECT 1 FROM portal_read_model.push_delivery d JOIN portal_read_model.push_subscription s ON s.id=d.subscription_id
    WHERE d.notification_key='activity:'||event_id::text AND s.endpoint=source_endpoint) THEN RAISE EXCEPTION 'sender exclusion failed'; END IF;
  SELECT d.body INTO body FROM portal_read_model.push_delivery d JOIN portal_read_model.push_subscription s ON s.id=d.subscription_id
    WHERE d.notification_key='activity:'||event_id::text AND s.endpoint=private_endpoint;
  IF body IS NULL OR body LIKE '%BV Mẫu%' OR body LIKE '%SYNTHETIC%' THEN RAISE EXCEPTION 'default privacy failed'; END IF;
  SELECT d.body INTO body FROM portal_read_model.push_delivery d JOIN portal_read_model.push_subscription s ON s.id=d.subscription_id
    WHERE d.notification_key='activity:'||event_id::text AND s.endpoint=detail_endpoint;
  IF body NOT LIKE '%BV Mẫu%' THEN RAISE EXCEPTION 'detail opt in failed'; END IF;
  IF public.embe_publish_family_activity_v2(event_id,source_id,source_endpoint,'medical','deleted','wrong','/',null,null)<>0
    THEN RAISE EXCEPTION 'idempotency failed'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.embe_list_family_activity_v2(gen_random_uuid(),now()-interval '1 hour',20) e
    WHERE e.event_id=fixture.event_id AND e.body LIKE '%BV Mẫu%') THEN RAISE EXCEPTION 'feed failed'; END IF;
  IF EXISTS(SELECT 1 FROM public.embe_list_family_activity_v2(source_id,now()-interval '1 hour',20) e
    WHERE e.event_id=fixture.event_id) THEN RAISE EXCEPTION 'feed source exclusion failed'; END IF;
  returned:=public.embe_push_preview(detail_endpoint,false);
  IF returned->>'detailPreview'<>'false' THEN RAISE EXCEPTION 'preview save failed'; END IF;
  SELECT d.body INTO body FROM portal_read_model.push_delivery d JOIN portal_read_model.push_subscription s ON s.id=d.subscription_id
    WHERE d.notification_key='activity:'||event_id::text AND s.endpoint=detail_endpoint;
  IF body LIKE '%BV Mẫu%' THEN RAISE EXCEPTION 'pending privacy revocation failed'; END IF;
  FOREACH pair SLICE 1 IN ARRAY ARRAY[['receipt','phiếu thu'],['prescription','đơn thuốc'],['ultrasound','phiếu siêu âm'],
    ['laboratory','phiếu xét nghiệm'],['clinical','bệnh án'],['discharge','giấy ra viện']]
  LOOP
    UPDATE portal_read_model.pregnancy_medical_record SET kind=pair[1],status='completed',document_date_only=true WHERE id=record_id;
    second_event:=gen_random_uuid();
    PERFORM public.embe_publish_family_activity_v2(second_event,source_id,source_endpoint,'medical','updated','hồ sơ khám',
      '/me-bau/ho-so#record-'||record_id::text,'record',record_id);
    SELECT e.title,e.body INTO title,body FROM portal_read_model.family_activity_event e WHERE e.event_id=second_event;
    IF title<>'Mẹ Ngân đã cập nhật '||pair[2] OR body LIKE '%08:30%' OR body NOT LIKE '%09/09/2026%' THEN RAISE EXCEPTION 'document category/date failed: %',pair[1]; END IF;
  END LOOP;
  second_event:=gen_random_uuid();
  PERFORM public.embe_publish_family_activity_v2(second_event,source_id,null,'medical','confirmed','tài liệu khám','/me-bau/ho-so','document',gen_random_uuid());
  IF EXISTS(SELECT 1 FROM portal_read_model.family_activity_event e WHERE e.event_id=second_event) THEN RAISE EXCEPTION 'missing document generated event'; END IF;
END $verify$;
ROLLBACK;
SELECT 'passed; all synthetic changes rolled back; no push sent' AS verification;
