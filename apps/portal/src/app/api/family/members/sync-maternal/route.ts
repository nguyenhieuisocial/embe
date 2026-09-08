import { memberAuthorization, memberRpc, memberFailure } from '../../../../../lib/family-members-server';
import { validFamilyMember } from '../../../../../lib/family-members';
import { photoStore, privateReply } from '../../../../../lib/photo-upload-server';
import { validDocumentAnalysis, type DocumentScan } from '../../../../../lib/medical-document-scan';
import { normalizeMedicalRecord } from '../../../../../lib/pregnancy-medical';
import { mergeMaternalSources } from '../../../../../lib/maternal-profile-sync';
import { revalidateFamilyViews } from '../../../../../lib/family-view-revalidation';

export async function POST(request: Request) {
  const denied = await memberAuthorization(request, true); if (denied) return denied;
  const store = photoStore(); if (!store) return memberFailure(503);
  try {
    const [members, records] = await Promise.all([memberRpc('embe_list_family_members'), store.rpc('embe_list_pregnancy_medical_records').abortSignal(AbortSignal.timeout(8000))]);
    if (members.status !== 200 || !Array.isArray(members.data) || !members.data.every(validFamilyMember) || records.error || !Array.isArray(records.data)) return memberFailure(503);
    const mother = members.data.find(member => member.role === 'mother' && !member.archived);
    if (!mother) return memberFailure(404);
    const ids = [...new Set<string>(records.data.flatMap((raw: unknown) => normalizeMedicalRecord(raw)?.documents.map(document => document.id) ?? []))];
    // Fail closed on incomplete reads; an unavailable source may contain a conflicting value.
    if (ids.length > 48) return privateReply({error:'too_many_sources'}, 503);
    const scans: DocumentScan[] = [];
    for (let offset = 0; offset < ids.length; offset += 4) {
      await Promise.all(ids.slice(offset, offset + 4).map(async id => {
        const result = await store.rpc('embe_get_document_scan', {p_document_id:id}).abortSignal(AbortSignal.timeout(5000));
        if (result.error || result.data?.documentId !== id || !['idle','queued','processing','failed','review','confirmed'].includes(result.data.status)) throw new Error('source');
        if (result.data.analysis && !validDocumentAnalysis(result.data.analysis)) throw new Error('analysis');
        scans.push(result.data as DocumentScan);
      }));
    }
    const merged = mergeMaternalSources(mother, scans);
    if (merged.added.length) {
      const saved = await memberRpc('embe_save_family_member', { p_id: mother.id, p_revision: mother.revision, p_profile: merged.member });
      if (saved.status !== 200 || !validFamilyMember(saved.data)) return memberFailure(saved.status === 200 ? 503 : saved.status);
      revalidateFamilyViews();
    }
    return privateReply({added:merged.added, conflicts:merged.conflicts, skipped:merged.skipped}, 200);
  } catch { return memberFailure(503); }
}
