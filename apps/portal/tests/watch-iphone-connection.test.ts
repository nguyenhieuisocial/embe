import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {watchIphoneConnection} from '../src/lib/watch-iphone-connection';

describe('exact-device connection receipts',()=>{
  let stop:(()=>void)|undefined;
  const state=vi.fn(),received=vi.fn();
  const token=`embe_health_${'a'.repeat(43)}`;
  beforeEach(()=>{
    vi.useFakeTimers();vi.setSystemTime(0);state.mockReset();received.mockReset();
    vi.spyOn(document,'visibilityState','get').mockReturnValue('visible');
  });
  afterEach(()=>{stop?.();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
  it('waits without claiming success, probes only the exact token, and stops after receipt',async()=>{
    const fetchMock=vi.fn().mockResolvedValueOnce(Response.json({connected:true,lastSyncedAt:null}))
      .mockResolvedValue(Response.json({connected:true,lastSyncedAt:'2026-09-12T10:00:00Z'}));
    vi.stubGlobal('fetch',fetchMock);stop=watchIphoneConnection(token,state,received);
    await vi.advanceTimersByTimeAsync(0);
    expect(state).toHaveBeenLastCalledWith('waiting');expect(received).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith('/api/pregnancy/iphone-health',expect.objectContaining({cache:'no-store',headers:{authorization:`Bearer ${token}`}}));
    await vi.advanceTimersByTimeAsync(15_000);expect(received).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(120_000);expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('stops for an expired or revoked token',async()=>{
    const fetchMock=vi.fn().mockResolvedValue(new Response(null,{status:401}));
    vi.stubGlobal('fetch',fetchMock);stop=watchIphoneConnection(token,state,received);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(state).toHaveBeenLastCalledWith('expired');expect(fetchMock).toHaveBeenCalledTimes(1);expect(received).not.toHaveBeenCalled();
  });
  it('retries temporary failures but pauses after two minutes',async()=>{
    const fetchMock=vi.fn().mockResolvedValue(new Response(null,{status:503}));
    vi.stubGlobal('fetch',fetchMock);stop=watchIphoneConnection(token,state,received);
    await vi.advanceTimersByTimeAsync(0);expect(state).toHaveBeenLastCalledWith('network-error');
    await vi.advanceTimersByTimeAsync(120_000);expect(state).toHaveBeenLastCalledWith('paused');
    const count=fetchMock.mock.calls.length;expect(count).toBeGreaterThan(1);
    await vi.advanceTimersByTimeAsync(120_000);expect(fetchMock).toHaveBeenCalledTimes(count);expect(received).not.toHaveBeenCalled();
  });
  it('does not query while hidden, resumes on return, and aborts on cleanup',async()=>{
    const visible=vi.spyOn(document,'visibilityState','get').mockReturnValue('hidden');
    let signal:AbortSignal|undefined;
    const fetchMock=vi.fn((_url:string,init:RequestInit)=>{signal=init.signal as AbortSignal;return new Promise(()=>{});});
    vi.stubGlobal('fetch',fetchMock);stop=watchIphoneConnection(token,state,received);
    await vi.advanceTimersByTimeAsync(15_000);expect(fetchMock).not.toHaveBeenCalled();
    visible.mockReturnValue('visible');document.dispatchEvent(new Event('visibilitychange'));
    expect(fetchMock).toHaveBeenCalledTimes(1);stop();expect(signal?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(120_000);window.dispatchEvent(new Event('focus'));
    expect(fetchMock).toHaveBeenCalledTimes(1);expect(received).not.toHaveBeenCalled();
  });
  it('never accepts an invalid receipt or timestamp as synced',async()=>{
    const fetchMock=vi.fn().mockResolvedValueOnce(Response.json({connected:false,lastSyncedAt:'2026-09-12T10:00:00Z'}))
      .mockResolvedValue(Response.json({connected:true,lastSyncedAt:'invalid'}));
    vi.stubGlobal('fetch',fetchMock);stop=watchIphoneConnection(token,state,received);
    await vi.advanceTimersByTimeAsync(0);expect(state).toHaveBeenLastCalledWith('network-error');
    await vi.advanceTimersByTimeAsync(15_000);expect(received).not.toHaveBeenCalled();
  });
});
