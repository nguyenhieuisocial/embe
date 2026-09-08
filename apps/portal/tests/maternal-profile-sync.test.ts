import { expect, it } from 'vitest';
import { mergeMaternalSources } from '../src/lib/maternal-profile-sync';
import type { FamilyMember } from '../src/lib/family-members';
import type { DocumentScan } from '../src/lib/medical-document-scan';
const mother: FamilyMember = {id:'11111111-1111-4111-8111-111111111111',role:'mother',fullName:'Nguyễn Thị Ngân',preferredName:'Ngân',birthDate:null,sexAtBirth:'female',revision:2,archived:false,details:{}};
function scan(value='1', name=mother.fullName): DocumentScan {
 return {documentId:'22222222-2222-4222-8222-222222222222',recordId:mother.id,filename:'a.jpg',mimeType:'image/jpeg',status:'confirmed',revision:1,completedPages:1,pageCount:1,error:null,confirmedAt:'2026-09-08',analysis:{version:1,pages:[{page:1,kind:'other',title:'Phiếu',medicines:[],charges:[],warnings:[],fields:[{label:'Họ tên',value:name,unit:'',reference:'',evidence:name,unclear:false},{label:'Số lần mang thai',value,unit:'',reference:'',evidence:value,unclear:false}]}]}};
}
it('fills explicit reviewed facts with source and is idempotent',()=>{
 const result=mergeMaternalSources(mother,[scan()]);
 expect(result.added).toEqual(['pregnancyCount']);
 expect(result.member.details.pregnancyCount).toBe('1');
 expect(JSON.parse(result.member.details.maternalSource_pregnancyCount)[0].page).toBe(1);
 expect(mergeMaternalSources(result.member,[scan()]).added).toEqual([]);
});
it('does not overwrite edited or explicitly cleared fields',()=>{
 expect(mergeMaternalSources({...mother,details:{pregnancyCount:'2'}},[scan()]).conflicts).toEqual(['pregnancyCount']);
 expect(mergeMaternalSources({...mother,details:{pregnancyCount:''}},[scan()]).added).toEqual([]);
});
it('does not guess identity or accept unclear/unreviewed fields',()=>{
 expect(mergeMaternalSources(mother,[scan('1','Ngân')]).added).toEqual([]);
 const source=scan();source.status='review';
 expect(mergeMaternalSources(mother,[source]).added).toEqual([]);
 source.status='confirmed';source.analysis!.pages[0].fields[1].unclear=true;
 expect(mergeMaternalSources(mother,[source]).added).toEqual([]);
});
it('keeps conflicting values out, rejects invalid counts and other roles',()=>{
 expect(mergeMaternalSources(mother,[scan('1'),scan('2')]).conflicts).toEqual(['pregnancyCount']);
 expect(mergeMaternalSources(mother,[scan('1.5')]).added).toEqual([]);
 expect(mergeMaternalSources({...mother,role:'father'},[scan()]).added).toEqual([]);
});
