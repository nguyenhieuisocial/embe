-- Isolated fixture only. No family records are loaded by this test.
BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE
  k uuid := gen_random_uuid();
  changed uuid := gen_random_uuid();
  receipt uuid;
  product bigint;
  state_before jsonb;
BEGIN
  receipt := public.embe_submit_inventory_action(k,'create',NULL,'Khăn thử nghiệm','baby','gói',8,2);
  SELECT source_product_id INTO STRICT product FROM public.embe_inventory_item WHERE name='Khăn thử nghiệm';
  ASSERT (SELECT quantity=8 AND NOT needs_restock FROM public.embe_inventory_item WHERE source_product_id=product);
  ASSERT (SELECT category='baby' FROM portal_read_model.inventory_item WHERE source_product_id=product);
  ASSERT public.embe_submit_inventory_action(k,'create',NULL,'Khăn thử nghiệm','baby','gói',8,2)=receipt;
  ASSERT (SELECT count(*) FROM portal_read_model.inventory_action)=1;
  BEGIN
    PERFORM public.embe_submit_inventory_action(k,'create',NULL,'Khăn thử nghiệm','baby','gói',9,2);
    RAISE EXCEPTION 'conflicting replay accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.embe_submit_inventory_action(gen_random_uuid(),'create',NULL,' khăn thử nghiệm ','baby','gói',8,2);
    RAISE EXCEPTION 'duplicate name accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  PERFORM public.embe_submit_inventory_action(changed,'set_amount',product,NULL,NULL,NULL,1,NULL);
  ASSERT (SELECT quantity=1 AND needs_restock FROM public.embe_inventory_item WHERE source_product_id=product);
  ASSERT (SELECT previous_amount=8 AND result_product_id=product AND completed_at IS NOT NULL
    FROM portal_read_model.inventory_action WHERE idempotency_key=changed);
  PERFORM public.embe_submit_inventory_action(gen_random_uuid(),'set_amount',product,NULL,NULL,NULL,5,NULL);
  PERFORM public.embe_submit_inventory_action(changed,'set_amount',product,NULL,NULL,NULL,1,NULL);
  ASSERT (SELECT quantity=5 FROM public.embe_inventory_item WHERE source_product_id=product), 'old retry rewound stock';
  state_before := (SELECT to_jsonb(i) FROM portal_read_model.inventory_item i WHERE source_product_id=product);
  PERFORM public.embe_sync_inventory(jsonb_build_array(jsonb_build_object('source_product_id',product,
    'name','Stale Grocy','quantity',999,'unit','gói','min_quantity',0,'needs_restock',false)));
  PERFORM public.embe_sync_inventory('[]');
  ASSERT state_before=(SELECT to_jsonb(i) FROM portal_read_model.inventory_item i WHERE source_product_id=product),
    'local snapshot overwrote or retired cloud stock';
  ASSERT (SELECT count(*) FROM public.embe_claim_inventory_actions(10))=0;
  ASSERT public.embe_inventory_queue_status()->>'mode'='cloud';
  ASSERT (public.embe_inventory_queue_status()->>'pending')::integer=0;
  ASSERT (public.embe_inventory_queue_status()->>'processing')::integer=0;
  BEGIN
    PERFORM public.embe_submit_inventory_action(gen_random_uuid(),'set_amount',2147483647,NULL,NULL,NULL,1,NULL);
    RAISE EXCEPTION 'missing product accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.embe_submit_inventory_action(gen_random_uuid(),'create',NULL,NULL,'baby','gói',1,1);
    RAISE EXCEPTION 'null name accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.embe_submit_inventory_action(gen_random_uuid(),'create',NULL,'Null category',NULL,'gói',1,1);
    RAISE EXCEPTION 'null category accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.embe_submit_inventory_action(gen_random_uuid(),NULL,NULL,'Null action','baby','gói',1,1);
    RAISE EXCEPTION 'null action accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.embe_submit_inventory_action(gen_random_uuid(),'create',NULL,'Bad amount','baby','gói','NaN',1);
    RAISE EXCEPTION 'NaN accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.embe_submit_inventory_action(gen_random_uuid(),'create',NULL,E'Bad\nname','baby','gói',1,1);
    RAISE EXCEPTION 'control character accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  ASSERT (SELECT count(*) FROM portal_read_model.inventory_action)=3, 'failed action left a receipt';
  ASSERT NOT has_function_privilege('anon','public.embe_submit_inventory_action(uuid,text,bigint,text,text,text,numeric,numeric)','execute');
  ASSERT NOT has_function_privilege('authenticated','public.embe_submit_inventory_action(uuid,text,bigint,text,text,text,numeric,numeric)','execute');
  ASSERT NOT has_table_privilege('anon','portal_read_model.inventory_item','select');
END $$;
ROLLBACK;
