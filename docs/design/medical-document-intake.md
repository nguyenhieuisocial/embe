# Camera-first pregnancy records

Implemented for the private Hiếu–Ngân portal, not a multi-patient clinical system.

## Interaction

The medical page starts with camera and multi-file selection (up to six files). A private intake record holds each original; a transaction-level trigger queues its OCR when upload verification succeeds. Closing the page after upload does not cancel reading. Failed uploads retry using the same record/document IDs. New prescriptions use the dedicated document worker, not the meal worker; existing legacy reviews remain readable.

The reader proposes document type, title, printed date, provider, clinician, gestational week and a linked visit. Provider history is reused only after conservative normalization (case, accents, punctuation, BV/PK abbreviations). Exactly one same-day/provider candidate is preselected; ambiguity requires selection. A linkage does not move the original or overwrite the linked appointment.

Existing warm rose surfaces, Vietnamese typefaces and compact disclosure sections are retained. Camera controls precede the long profile settings, touch targets are at least 44 px, inputs 16 px, and the confirmation action has one clear label. An explicit acknowledgement checks document ownership and transcription, rather than representing machine confidence as clinical certainty.

## Data and safety

- OCR is a transcription proposal. It does not interpret ultrasound pixels or diagnose.
- Known scalar metrics enter charts only with recognized units. No invented units, automatic unit conversion, range-to-number conversion, ambiguous repeated measurements or inferred drug doses.
- Unclear rows remain in the complete document, not in structured health measurements or medicines. Users correct the row and clear its uncertainty flag before import.
- All original fields, charges and instructions remain in the confirmed document linked from the record. Charges are not automatically expenses; prescriptions do not automatically become a medication schedule. Printed next-appointment text remains in the document, not a fabricated timed reminder.
- Date-only sources are displayed as dates without an invented appointment time.
- The import transaction locks the source record, checks record and scan versions, confirms the transcript, merges non-conflicting measurements/medicines, links the visit, and writes a private before/after audit. Repeated identical requests are idempotent. A conflict rolls back the entire operation.
- Existing record title/date/notes and nonempty provider/clinician are preserved. Imported transcripts may subsequently be edited, but do not silently rewrite previously imported clinical data.
- The original bucket remains private, secret keys remain server-only, new APIs check active sessions and same-origin mutations, and new functions/tables have no anonymous/authenticated direct grants.

## Verification

`apps/portal/tests/medical-document-import.test.tsx` covers matching, dates, measurements, uncertainty, authentication, version fences, mobile input affordances and retry identity.

`supabase/tests/medical_document_import.sql` is transaction-rolled-back synthetic data only. It checks automatic queuing, import atomicity, conflicting values, idempotency, source preservation and denied client access.

`scripts/health/medical-intake-live-smoke.mjs` runs the full UI upload → real local OCR → provider/visit matching → confirmed structured save → reload flow on the deployed SHA in isolated headless Cent. Only synthetic test records are created and then soft-deleted; its own login session is revoked. It checks 375/393/430/412/768/1280 px widths and keyboard activation. This is not a claim of physical iPhone/Safari verification or 100% OCR accuracy.
