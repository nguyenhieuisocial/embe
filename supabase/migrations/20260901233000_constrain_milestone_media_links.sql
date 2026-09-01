ALTER TABLE portal_read_model.baby_milestone ADD CONSTRAINT baby_milestone_safe_media_url CHECK (media_url='' OR media_url ~ '^https://embe\.hieu\.asia(/|$)' OR media_url ~ '^/ky-niem([/?#]|$)');
