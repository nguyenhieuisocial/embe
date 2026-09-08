import { beforeEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({auth:vi.fn(),member:vi.fn(),rpc:vi.fn()}));
vi.mock('../src/lib/family-members-server',()=>({memberAuthorization:mocks.auth,memberRpc:mocks.member,memberFailure:(status:number)=>new Response('{}',{status})}));
vi.mock('../src/lib/photo-upload-server',()=>({photoStore:()=>({rpc:mocks.rpc}),privateReply:(value:unknown,status:number)=>Response.json(value,{status})}));
vi.mock('../src/lib/family-view-revalidation',()=>({revalidateFamilyViews:vi.fn()}));
import {POST} from '../src/app/api/family/members/sync-maternal/route';
beforeEach(()=>{vi.clearAllMocks();mocks.auth.mockResolvedValue(null);mocks.member.mockResolvedValue({status:200,data:[{id:'11111111-1111-4111-8111-111111111111',role:'mother',fullName:'Mẹ',preferredName:'',birthDate:null,sexAtBirth:'female',revision:1,archived:false,details:{}}]});mocks.rpc.mockReturnValue({abortSignal:()=>Promise.resolve({data:[],error:null})});});
it('requires active authorized mutation before reading private sources',async()=>{
 mocks.auth.mockResolvedValue(new Response('{}',{status:401}));
 expect((await POST(new Request('https://embe.hieu.asia/api/family/members/sync-maternal',{method:'POST'}))).status).toBe(401);
 expect(mocks.member).not.toHaveBeenCalled();expect(mocks.rpc).not.toHaveBeenCalled();
});
it('does not write when there is nothing to merge',async()=>{
 const response=await POST(new Request('https://embe.hieu.asia/api/family/members/sync-maternal',{method:'POST'}));
 expect(response.status).toBe(200);expect((await response.json()).added).toEqual([]);
 expect(mocks.member).toHaveBeenCalledTimes(1);
});
it('fails closed when source inventory is unavailable',async()=>{
 mocks.rpc.mockReturnValue({abortSignal:()=>Promise.resolve({data:null,error:{message:'unavailable'}})});
 expect((await POST(new Request('https://embe.hieu.asia/api/family/members/sync-maternal',{method:'POST'}))).status).toBe(503);
 expect(mocks.member).toHaveBeenCalledTimes(1);
});
