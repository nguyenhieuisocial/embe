import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {watchIphoneConnection} from '../src/lib/watch-iphone-connection';

describe('exact-device connection receipts',()=>{
  let stop:(()=>void)|undefined;
  const state=vi.fn(),received=vi.fn();
  const token=`embe_health_${'a'.repeat(43)}`;
  beforeEach(()=>{
    vi.useFakeTimers();vi.setSystemTime(0);state.mockReset();received.mockReset();
    vi.spyOn(document,'visibilityState','get').mockReturnValue('visible');
    vi.spyOn(navigator,'onLine','get').mockReturnValue(true);
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
    expect(state).toHaveBeenLastCalledWith('network-error');
  });
  it('resumes after a long app switch, without polling in the background',async()=>{
    const visible=vi.spyOn(document,'visibilityState','get');
    const fetchMock=vi.fn().mockImplementation(async()=>Response.json({connected:true,lastSyncedAt:null}));
    vi.stubGlobal('fetch',fetchMock);stop=watchIphoneConnection(token,state,received);
    await vi.advanceTimersByTimeAsync(0);
    visible.mockReturnValue('hidden');document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(300_000);expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockImplementation(async()=>Response.json({connected:true,lastSyncedAt:'2026-09-12T10:00:00Z'}));
    visible.mockReturnValue('visible');document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);expect(received).toHaveBeenCalledTimes(1);
  });
  it('resumes a paused check on return, not from idle timers',async()=>{
    const fetchMock=vi.fn().mockImplementation(async()=>Response.json({connected:true,lastSyncedAt:null}));
    vi.stubGlobal('fetch',fetchMock);stop=watchIphoneConnection(token,state,received);
    await vi.advanceTimersByTimeAsync(120_000);expect(state).toHaveBeenLastCalledWith('paused');
    const count=fetchMock.mock.calls.length;
    await vi.advanceTimersByTimeAsync(120_000);expect(fetchMock).toHaveBeenCalledTimes(count);
    window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(count+1);expect(state).toHaveBeenLastCalledWith('waiting');
  });
  it('waits offline and automatically checks after connectivity returns',async()=>{
    const online=vi.spyOn(navigator,'onLine','get').mockReturnValue(false);
    const fetchMock=vi.fn().mockResolvedValue(Response.json({connected:true,lastSyncedAt:'2026-09-12T10:00:00Z'}));
    vi.stubGlobal('fetch',fetchMock);stop=watchIphoneConnection(token,state,received);
    await vi.advanceTimersByTimeAsync(300_000);expect(fetchMock).not.toHaveBeenCalled();expect(state).toHaveBeenLastCalledWith('offline');
    online.mockReturnValue(true);window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);expect(received).toHaveBeenCalledTimes(1);
  });
  it('ignores an old response after suspending and restarting',async()=>{
    const visible=vi.spyOn(document,'visibilityState','get');
    let resolveOld!:(response:Response)=>void;
    const fetchMock=vi.fn().mockImplementationOnce(()=>new Promise<Response>(resolve=>{resolveOld=resolve;}))
      .mockResolvedValue(Response.json({connected:true,lastSyncedAt:null}));
    vi.stubGlobal('fetch',fetchMock);stop=watchIphoneConnection(token,state,received);
    visible.mockReturnValue('hidden');document.dispatchEvent(new Event('visibilitychange'));
    visible.mockReturnValue('visible');document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    resolveOld(Response.json({connected:true,lastSyncedAt:'2026-09-12T10:00:00Z'}));
    await vi.advanceTimersByTimeAsync(0);
    expect(received).not.toHaveBeenCalled();expect(state).toHaveBeenLastCalledWith('waiting');
  });
  it('aborts a hung request after ten seconds and permits a retry',async()=>{
    const fetchMock=vi.fn().mockImplementation((_url:string,init:RequestInit)=>new Promise((_,reject)=>{
      init.signal?.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')),{once:true});
    }));
    vi.stubGlobal('fetch',fetchMock);stop=watchIphoneConnection(token,state,received);
    await vi.advanceTimersByTimeAsync(10_000);expect(state).toHaveBeenLastCalledWith('network-error');
    await vi.advanceTimersByTimeAsync(5_000);expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(received).not.toHaveBeenCalled();
  });
});
