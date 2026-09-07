-- Autonomous creation uses reviewed editorial seeds, never family data or scraped media.
-- A rendered private draft is NOT a clinical approval or a social publication.
CREATE TABLE embe_studio.automation (
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  enabled boolean NOT NULL DEFAULT false,
  revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
  next_run_at timestamptz NOT NULL DEFAULT now(),
  last_checked_at timestamptz,
  last_status text NOT NULL DEFAULT 'paused' CHECK(last_status IN
    ('paused','scheduled','created','queue_full','workspace_full','sources_expired','topics_exhausted','render_failed','plan_error'))
);
INSERT INTO embe_studio.automation DEFAULT VALUES;
CREATE TABLE embe_studio.automation_topic (
  slug text PRIMARY KEY CHECK(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  priority integer NOT NULL,
  checked_at date NOT NULL,
  review_due date NOT NULL CHECK(review_due >= checked_at AND review_due-checked_at <= 31),
  payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<24000
    AND payload->'autoRender'='true'::jsonb
    AND jsonb_array_length(payload->'scenes') BETWEEN 1 AND 6
    AND jsonb_array_length(payload->'sources') BETWEEN 1 AND 6),
  project_id uuid UNIQUE REFERENCES embe_studio.project(id)
);
ALTER TABLE embe_studio.automation ENABLE ROW LEVEL SECURITY;
ALTER TABLE embe_studio.automation_topic ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON embe_studio.automation,embe_studio.automation_topic FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON embe_studio.automation,embe_studio.automation_topic TO service_role;

CREATE FUNCTION public.embe_studio_automation(p_enabled boolean DEFAULT NULL,p_revision integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE a embe_studio.automation; day_local date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
BEGIN
  IF p_enabled IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(73915431);
    SELECT * INTO a FROM embe_studio.automation WHERE id FOR UPDATE;
    IF p_revision IS DISTINCT FROM a.revision THEN RAISE sqlstate 'PT409' USING message='revision_conflict'; END IF;
    -- Resuming never resets the daily limit or reuses a consumed topic.
    UPDATE embe_studio.automation SET enabled=p_enabled,revision=revision+1,
      last_status=CASE WHEN p_enabled THEN 'scheduled' ELSE 'paused' END WHERE id;
  END IF;
  SELECT * INTO a FROM embe_studio.automation WHERE id;
  RETURN jsonb_build_object('enabled',a.enabled,'revision',a.revision,'nextRunAt',a.next_run_at,
    'lastCheckedAt',a.last_checked_at,'status',a.last_status,'workerSeenAt',(SELECT seen_at FROM embe_studio.worker_state WHERE id),
    'remaining',(SELECT count(*) FROM embe_studio.automation_topic WHERE project_id IS NULL AND day_local BETWEEN checked_at AND review_due),
    'reviewDue',(SELECT max(review_due) FROM embe_studio.automation_topic),
    'publication',jsonb_build_object('status','not_connected','publishedCount',0),
    'history',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC),'[]') FROM (
      SELECT t.slug,p.id AS project_id,p.payload->>'title' AS title,p.created_at,p.deleted,
        r.id AS render_id,r.status AS render_status,r.progress,r.error
      FROM embe_studio.automation_topic t JOIN embe_studio.project p ON p.id=t.project_id
      LEFT JOIN embe_studio.render r ON r.project_id=p.id AND r.revision=p.revision
      ORDER BY p.created_at DESC LIMIT 10
    ) x));
END $$;
REVOKE ALL ON FUNCTION public.embe_studio_automation(boolean,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.embe_studio_automation(boolean,integer) TO service_role;

CREATE FUNCTION public.embe_studio_autoplan()
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE a embe_studio.automation; t embe_studio.automation_topic; project uuid; reason text;
  day_local date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
BEGIN
  PERFORM pg_advisory_xact_lock(73915431);
  SELECT * INTO a FROM embe_studio.automation WHERE id FOR UPDATE;
  IF NOT a.enabled THEN reason:='paused';
  ELSIF a.next_run_at>now() THEN reason:='scheduled';
  ELSIF (SELECT count(*) FROM embe_studio.project)>=100 OR (SELECT count(*) FROM embe_studio.render)>=100 THEN reason:='workspace_full';
  ELSIF (SELECT count(*) FROM embe_studio.render WHERE status IN ('queued','rendering'))>=3 THEN reason:='queue_full';
  ELSIF EXISTS (
    SELECT 1 FROM embe_studio.automation_topic tt JOIN embe_studio.project pp ON pp.id=tt.project_id
    JOIN embe_studio.render rr ON rr.project_id=pp.id AND rr.revision=pp.revision
    WHERE NOT pp.deleted AND rr.status='failed'
  ) THEN reason:='render_failed';
  ELSE
    SELECT * INTO t FROM embe_studio.automation_topic
      WHERE project_id IS NULL AND day_local BETWEEN checked_at AND review_due
      ORDER BY priority DESC,slug LIMIT 1 FOR UPDATE;
    IF t.slug IS NULL THEN
      reason:=CASE WHEN EXISTS(SELECT 1 FROM embe_studio.automation_topic WHERE project_id IS NULL)
        THEN 'sources_expired' ELSE 'topics_exhausted' END;
    ELSE
      project:=gen_random_uuid();
      PERFORM public.embe_studio_workspace('save',project,0,t.payload);
      UPDATE embe_studio.automation_topic SET project_id=project WHERE slug=t.slug;
      -- No catch-up burst after an outage: at most one new project each local day.
      UPDATE embe_studio.automation SET next_run_at=((day_local+1)+time '08:00') AT TIME ZONE 'Asia/Ho_Chi_Minh' WHERE id;
      reason:='created';
    END IF;
  END IF;
  UPDATE embe_studio.automation SET last_checked_at=now(),last_status=reason WHERE id;
  RETURN jsonb_build_object('status',reason,'projectId',project);
END $$;
REVOKE ALL ON FUNCTION public.embe_studio_autoplan() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.embe_studio_autoplan() TO service_role;

-- The installed worker already calls this entry point every 30 seconds. No restart.
ALTER FUNCTION public.embe_studio_autorender() RENAME TO embe_studio_render_saved_drafts;
CREATE FUNCTION public.embe_studio_autorender()
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE plan jsonb; rendered jsonb;
BEGIN
  BEGIN
    plan:=public.embe_studio_autoplan();
  EXCEPTION WHEN OTHERS THEN
    -- An editorial planning failure must not stop manually saved render jobs.
    UPDATE embe_studio.automation SET last_checked_at=now(),last_status='plan_error' WHERE id;
    plan:=jsonb_build_object('status','plan_error');
  END;
  rendered:=public.embe_studio_render_saved_drafts();
  RETURN rendered || jsonb_build_object('planning',plan);
END $$;
REVOKE ALL ON FUNCTION public.embe_studio_autorender() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.embe_studio_autorender() TO service_role;

-- Generated from services/studio/content/catalog.json; exercise topic excluded because its source review is overdue.
INSERT INTO embe_studio.automation_topic(slug,priority,checked_at,review_due,payload)
SELECT slug,priority,checked_at,review_due,payload FROM jsonb_to_recordset($catalog$
[
  {
    "slug": "ca-phe-tra-sua",
    "priority": 100,
    "checked_at": "2026-09-07",
    "review_due": "2026-10-07",
    "payload": {
      "title": "Bầu uống cà phê: đừng chỉ đếm số ly",
      "stage": "Thai kỳ",
      "caption": "Cùng EmBe Mẹ Bầu đọc nhãn đồ uống. Nguồn ở dưới; không thay tư vấn cá nhân.\n#EmBeMeBau #AnUongThaiKy #HieuDungDeYenTam",
      "scenes": [
        {
          "heading": "Đừng chỉ đếm số ly",
          "text": "Bầu uống cà phê: điều cần tính là tổng caffeine trong ngày."
        },
        {
          "heading": "Không chỉ cà phê",
          "text": "Trà, cola và chocolate cũng có caffeine."
        },
        {
          "heading": "Mốc tham khảo",
          "text": "NHS khuyên không quá 200 mg caffeine mỗi ngày khi mang thai."
        },
        {
          "heading": "Một ly không cố định",
          "text": "Hãy xem nhãn hoặc hỏi nơi bán. Không mặc định mọi ly đều giống nhau."
        },
        {
          "heading": "Theo kế hoạch riêng",
          "text": "Nếu bác sĩ dặn khác, làm theo hướng dẫn của bác sĩ."
        },
        {
          "heading": "Lưu để xem lại",
          "text": "Đây là giới hạn tham khảo, không phải lượng cần uống cho đủ."
        }
      ],
      "sources": [
        {
          "title": "NHS",
          "url": "https://www.nhs.uk/pregnancy/keeping-well/foods-to-avoid/"
        }
      ],
      "voice": {
        "id": "auto-south",
        "speed": 1
      },
      "autoRender": true
    }
  },
  {
    "slug": "bau-an-ca",
    "priority": 98,
    "checked_at": "2026-09-07",
    "review_due": "2026-10-07",
    "payload": {
      "title": "Có bầu không đồng nghĩa phải kiêng hết cá",
      "stage": "Thai kỳ và cho con bú",
      "caption": "Chọn có căn cứ, không kiêng quá rộng. Hướng dẫn FDA/EPA là nguồn tham khảo, không phải thực đơn cá nhân.\n#EmBeMeBau #BauAnGi #ChonThucPham",
      "scenes": [
        {
          "heading": "Không kiêng hết cá",
          "text": "Điều quan trọng là chọn loại ít thủy ngân và ăn đa dạng."
        },
        {
          "heading": "Những lựa chọn quen",
          "text": "Cá hồi, cá mòi và tôm nằm trong nhóm Best Choices của FDA/EPA."
        },
        {
          "heading": "Tần suất tham khảo",
          "text": "FDA/EPA gợi ý 2–3 khẩu phần mỗi tuần từ nhóm này khi mang thai hoặc cho con bú."
        },
        {
          "heading": "Khẩu phần là bao nhiêu?",
          "text": "Một khẩu phần người lớn khoảng 113 g, tính trước khi nấu."
        },
        {
          "heading": "Đúng loài mới tra được",
          "text": "Tên gọi ngoài chợ có thể khác. Chưa rõ loài thì đừng đoán mức thủy ngân."
        },
        {
          "heading": "Chọn đúng, nấu chín",
          "text": "Không ăn cá sống khi mang thai. Đối chiếu bảng nguồn và chỉ định ăn uống riêng."
        }
      ],
      "sources": [
        {
          "title": "FDA/EPA",
          "url": "https://www.fda.gov/food/consumers/advice-about-eating-fish"
        },
        {
          "title": "FDA/EPA",
          "url": "https://www.fda.gov/food/consumers/questions-answers-fdaepa-advice-about-eating-fish-those-who-might-become-or-are-pregnant-or"
        }
      ],
      "voice": {
        "id": "auto-south",
        "speed": 1
      },
      "autoRender": true
    }
  },
  {
    "slug": "om-nghen-bua-nho",
    "priority": 96,
    "checked_at": "2026-09-07",
    "review_due": "2026-10-07",
    "payload": {
      "title": "Ốm nghén không phải lúc nào cũng vào buổi sáng",
      "stage": "Tam cá nguyệt đầu",
      "caption": "Gợi ý sinh hoạt, không phải điều trị nghén nặng. Có triệu chứng đáng lo thì đi khám, không chờ phản hồi bình luận.\n#EmBeMeBau #OmNghen #BaDongHanh",
      "scenes": [
        {
          "heading": "Không chỉ buổi sáng",
          "text": "Buồn nôn thai kỳ có thể xuất hiện cả ngày lẫn đêm."
        },
        {
          "heading": "Thử chia nhỏ bữa",
          "text": "Ăn ít một, nhiều lần. Chọn món đơn giản bạn thấy dễ chịu."
        },
        {
          "heading": "Nhấp nước từng ngụm",
          "text": "Uống ít một và thường xuyên; tránh mùi khiến bạn buồn nôn."
        },
        {
          "heading": "Không cần cố chịu",
          "text": "Nôn nhiều, không giữ được nước, tiểu ít hoặc chóng mặt: liên hệ cơ sở y tế."
        },
        {
          "heading": "Mỗi người một khác",
          "text": "Không có mẹo nào hiệu quả cho tất cả. Đừng tự dùng thuốc chống nôn."
        },
        {
          "heading": "Nhờ một việc nhỏ",
          "text": "Người đồng hành có thể giúp chuẩn bị bữa nhỏ và ghi điều làm mẹ khó chịu."
        }
      ],
      "sources": [
        {
          "title": "NHS",
          "url": "https://www.nhs.uk/pregnancy/common-symptoms/vomiting-and-morning-sickness/"
        }
      ],
      "voice": {
        "id": "auto-south",
        "speed": 1
      },
      "autoRender": true
    }
  },
  {
    "slug": "be-ngu-an-toan",
    "priority": 94,
    "checked_at": "2026-09-07",
    "review_due": "2026-10-07",
    "payload": {
      "title": "Giường bé ít đồ hơn, không phải ít yêu thương hơn",
      "stage": "Sau sinh",
      "caption": "Trao đổi với nhân viên y tế nếu bé sinh non hoặc có nhu cầu chăm sóc riêng. Minh họa không thay hướng dẫn thực hành.\n#EmBeMeBau #BeNguAnToan #LanDauLamMe",
      "scenes": [
        {
          "heading": "Ít đồ, không ít yêu",
          "text": "Chỗ ngủ an toàn của bé không cần đầy gối và thú bông."
        },
        {
          "heading": "Đặt bé nằm ngửa",
          "text": "Bắt đầu mỗi giấc ngủ bằng tư thế nằm ngửa, trên nệm phẳng và chắc."
        },
        {
          "heading": "Dọn chỗ ngủ thoáng",
          "text": "Không để gối, chăn lỏng, thú bông hay vật chèn giữ bé trong cũi."
        },
        {
          "heading": "Cùng phòng, chỗ riêng",
          "text": "Cho bé ngủ chỗ riêng trong phòng bố mẹ ít nhất 6 tháng đầu."
        },
        {
          "heading": "Tránh ngủ quên trên sofa",
          "text": "Không ngủ cùng bé trên sofa hoặc ghế bành."
        },
        {
          "heading": "Cùng kiểm tra tối nay",
          "text": "Đây là cách giảm nguy cơ, không phải bảo đảm tuyệt đối."
        }
      ],
      "sources": [
        {
          "title": "NHS",
          "url": "https://www.nhs.uk/baby/caring-for-a-newborn/sudden-infant-death-syndrome-sids/"
        }
      ],
      "voice": {
        "id": "auto-south",
        "speed": 1
      },
      "autoRender": true
    }
  },
  {
    "slug": "gio-di-sinh",
    "priority": 92,
    "checked_at": "2026-09-07",
    "review_due": "2026-10-07",
    "payload": {
      "title": "Giỏ đi sinh: chia ba nhóm để dễ tìm",
      "stage": "Tam cá nguyệt cuối",
      "caption": "Cách chia túi là gợi ý biên tập EmBe. Danh sách cuối cùng cần theo bệnh viện bạn chọn, không phải danh sách mua sắm bắt buộc.\n#EmBeMeBau #GioDiSinh #ChuanBiDiSinh",
      "scenes": [
        {
          "heading": "Chia nhóm, đỡ tìm",
          "text": "Giỏ đi sinh có thể gọn hơn khi đồ được chia theo người dùng."
        },
        {
          "heading": "Hồ sơ trước",
          "text": "Để hồ sơ thai kỳ, kế hoạch sinh và danh sách thuốc ở chỗ dễ lấy."
        },
        {
          "heading": "Một túi cho mẹ",
          "text": "Quần áo thoải mái, đồ vệ sinh cá nhân, băng sau sinh và sạc điện thoại."
        },
        {
          "heading": "Một túi cho bé",
          "text": "Quần áo và bỉm theo nhu cầu; kiểm tra bệnh viện đã cung cấp gì."
        },
        {
          "heading": "Người đồng hành biết chỗ",
          "text": "Cùng xem từng ngăn trước ngày đi sinh, đừng để mẹ phải tìm hộ mọi thứ."
        }
      ],
      "sources": [
        {
          "title": "NHS",
          "url": "https://www.nhs.uk/best-start-in-life/pregnancy/preparing-for-labour-and-birth/hospital-bag-checklist/"
        }
      ],
      "voice": {
        "id": "auto-south",
        "speed": 1
      },
      "autoRender": true
    }
  },
  {
    "slug": "me-khong-can-luon-vui",
    "priority": 90,
    "checked_at": "2026-09-07",
    "review_due": "2026-10-07",
    "payload": {
      "title": "Mang thai không có nghĩa mẹ phải vui mọi lúc",
      "stage": "Thai kỳ",
      "caption": "Câu hỏi dành cho người đồng hành là gợi ý giao tiếp, không phải liệu pháp. EmBe không chẩn đoán qua bình luận.\n#EmBeMeBau #MeDuocLangNghe #NguoiDongHanh",
      "scenes": [
        {
          "heading": "Không cần luôn vui",
          "text": "Lo âu và khó khăn tinh thần có thể xuất hiện trong thai kỳ."
        },
        {
          "heading": "Nói điều mình đang cần",
          "text": "Chia sẻ cảm xúc với người tin cậy hoặc nhân viên y tế đang chăm sóc bạn."
        },
        {
          "heading": "Một câu hỏi nhẹ nhàng",
          "text": "Hôm nay em muốn anh lắng nghe, hay giúp một việc cụ thể?"
        },
        {
          "heading": "Có hỗ trợ chuyên môn",
          "text": "Nếu lo về sức khỏe tinh thần, hãy trao đổi với bác sĩ; không tự ngừng thuốc đang dùng."
        },
        {
          "heading": "Không đợi bình luận",
          "text": "Nếu có nguy cơ làm hại bản thân hoặc em bé, cần hỗ trợ y tế khẩn cấp."
        }
      ],
      "sources": [
        {
          "title": "NHS",
          "url": "https://www.nhs.uk/pregnancy/mental-health-in-pregnancy-and-after-the-birth/mental-health/"
        },
        {
          "title": "CDC",
          "url": "https://www.cdc.gov/hearher/maternal-warning-signs/index.html"
        }
      ],
      "voice": {
        "id": "auto-south",
        "speed": 1
      },
      "autoRender": true
    }
  },
  {
    "slug": "sau-sinh-can-di-kham",
    "priority": 88,
    "checked_at": "2026-09-07",
    "review_due": "2026-10-07",
    "payload": {
      "title": "Sinh xong vẫn cần để ý sức khỏe của mẹ",
      "stage": "Thai kỳ và sau sinh",
      "caption": "Nội dung nhận biết theo CDC, không dùng để tự loại trừ biến chứng. Khi có dấu hiệu nguy hiểm, tìm hỗ trợ y tế ngay.\n#EmBeMeBau #ChamMeSauSinh #BietLucCanTroGiup",
      "scenes": [
        {
          "heading": "Mẹ vẫn cần được chăm",
          "text": "Một số dấu hiệu nguy hiểm có thể xuất hiện cả trong và sau thai kỳ."
        },
        {
          "heading": "Khó thở hoặc đau ngực",
          "text": "Cần được đánh giá y tế ngay, không tự đoán do mệt."
        },
        {
          "heading": "Đau đầu nặng, nhìn mờ",
          "text": "Đừng chỉ chờ nghỉ ngơi sẽ hết; hãy tìm hỗ trợ y tế ngay."
        },
        {
          "heading": "Sau sinh ra máu nhiều",
          "text": "Thấm một băng hoặc hơn trong một giờ là dấu hiệu cần trợ giúp ngay."
        },
        {
          "heading": "Nói rõ với nhân viên y tế",
          "text": "Cho biết bạn đang mang thai hoặc đã sinh trong vòng một năm."
        },
        {
          "heading": "Không phải danh sách đầy đủ",
          "text": "Thấy có điều không ổn thì liên hệ cơ sở y tế. Đừng chờ phản hồi của EmBe."
        }
      ],
      "sources": [
        {
          "title": "CDC",
          "url": "https://www.cdc.gov/hearher/maternal-warning-signs/index.html"
        }
      ],
      "voice": {
        "id": "auto-south",
        "speed": 1
      },
      "autoRender": true
    }
  }
]
$catalog$::jsonb) AS t(slug text,priority integer,checked_at date,review_due date,payload jsonb);
