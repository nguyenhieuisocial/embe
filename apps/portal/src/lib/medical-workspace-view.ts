export type MedicalWorkspaceView='overview'|'documents'|'visits';
export function medicalWorkspaceView(hash:string):MedicalWorkspaceView {
 if(hash==='#lich-kham-ke-tiep')return 'visits';
 if(hash==='#them-giay-to'||hash==='#ho-so-da-luu'||hash.startsWith('#record-'))return 'documents';
 return 'overview';
}
