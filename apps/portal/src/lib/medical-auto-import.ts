import { proposeDocumentImport, validImportDetails } from './medical-document-import';
import { validDocumentAnalysis, type DocumentScan } from './medical-document-scan';
import type { MedicalRecord } from './pregnancy-medical';

const nameKey = (value: string) => value.normalize('NFC').trim().toLocaleLowerCase('vi').replace(/\s+/g, ' ');
/** Automatic import never upgrades an unreviewed transcription to a clinical fact. */
export function automaticDocumentImport(scan: DocumentScan, records: MedicalRecord[], motherName: string) {
  if (scan.status !== 'confirmed' || !scan.confirmedAt || !validDocumentAnalysis(scan.analysis)) return null;
  if (scan.analysis.pages.some(page => page.warnings.length)) return null;
  const proposal = proposeDocumentImport(scan.analysis, records, scan.recordId);
  if (!motherName.trim() || proposal.patients.length !== 1 || nameKey(proposal.patients[0]) !== nameKey(motherName)
    || proposal.identityConflict || proposal.ambiguousScope || proposal.candidates.length > 1
    || proposal.unresolved || proposal.warnings.length || !validImportDetails(proposal.details)) return null;
  return proposal.details;
}
