import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { refreshFamilyData, notifyFamilyDataChanged } from '../src/lib/family-data-refresh';
import { useFamilyDataRefresh } from '../src/lib/use-family-data-refresh';
import FamilyDataRuntime, { FAMILY_SYNC_INTERVAL_MS } from '../src/components/family-data-runtime';
import FamilyPlanner from '../src/components/family-planner';

const navigation = vi.hoisted(() => ({ pathname: '/me-bau', router: { refresh: vi.fn() } }));
vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname, useRouter: () => navigation.router }));

beforeEach(() => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  navigation.pathname = '/me-bau'; navigation.router.refresh.mockClear();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('family data subscriptions', () => {
  it('refreshes once for a burst of verified writes without a service worker', async()=>{
    vi.useFakeTimers();
    const view=render(<FamilyDataRuntime/>);
    act(()=>{notifyFamilyDataChanged();notifyFamilyDataChanged();notifyFamilyDataChanged();});
    await act(async()=>{await vi.advanceTimersByTimeAsync(301);});
    expect(navigation.router.refresh).toHaveBeenCalledOnce();
    view.unmount();
  });
  it('defers changes while editing and catches up when the draft closes', async () => {
    const callback = vi.fn();
    const view = renderHook(({ enabled }) => useFamilyDataRefresh(callback, enabled), { initialProps: { enabled: false } });
    act(() => { refreshFamilyData(); refreshFamilyData(); });
    expect(callback).not.toHaveBeenCalled();
    view.rerender({ enabled: true });
    await waitFor(() => expect(callback).toHaveBeenCalledTimes(1));
    view.unmount(); act(refreshFamilyData); expect(callback).toHaveBeenCalledTimes(1);
  });
  it('coalesces signals in flight and rejects an old response if editing started', async () => {
    let done!: () => void; let allowed!: () => boolean;
    const callback = vi.fn().mockImplementationOnce((canApply: () => boolean) => {
      allowed = canApply; return new Promise<void>(resolve => { done = resolve; });
    });
    const view = renderHook(({ enabled }) => useFamilyDataRefresh(callback, enabled), { initialProps: { enabled: true } });
    act(refreshFamilyData); expect(allowed()).toBe(true);
    act(() => { refreshFamilyData(); refreshFamilyData(); });
    view.rerender({ enabled: false }); expect(allowed()).toBe(false);
    await act(async () => done()); expect(callback).toHaveBeenCalledTimes(1);
    view.rerender({ enabled: true }); await waitFor(() => expect(callback).toHaveBeenCalledTimes(2));
    expect(allowed()).toBe(false);
  });
  it('does not fetch offline or hidden, and retries on the next foreground signal', async () => {
    const callback = vi.fn(); renderHook(() => useFamilyDataRefresh(callback));
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    act(refreshFamilyData); expect(callback).not.toHaveBeenCalled();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    act(refreshFamilyData); expect(callback).not.toHaveBeenCalled();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    act(refreshFamilyData); await waitFor(() => expect(callback).toHaveBeenCalledOnce());
  });
});

describe('background runtime', () => {
  it('coalesces successful change signals and refreshes client and server views without reload', async () => {
    vi.useFakeTimers(); const callback = vi.fn();
    renderHook(() => useFamilyDataRefresh(callback)); render(<FamilyDataRuntime />);
    act(() => { window.dispatchEvent(new Event('embe:local-data-changed')); window.dispatchEvent(new Event('embe:local-data-changed')); });
    await act(async () => { await vi.advanceTimersByTimeAsync(301); });
    expect(callback).toHaveBeenCalledOnce(); expect(navigation.router.refresh).toHaveBeenCalledOnce();
  });
  it('covers worker results with visible-only fallback and defers server refresh during typing', async () => {
    vi.useFakeTimers(); render(<><FamilyDataRuntime /><input aria-label="Nháp" /></>);
    screen.getByLabelText('Nháp').focus();
    await act(async () => { await vi.advanceTimersByTimeAsync(FAMILY_SYNC_INTERVAL_MS + 301); });
    expect(navigation.router.refresh).not.toHaveBeenCalled();
    fireEvent.blur(screen.getByLabelText('Nháp')); (document.activeElement as HTMLElement).blur();
    fireEvent.focusOut(document);
    expect(navigation.router.refresh).toHaveBeenCalledOnce();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    await act(async () => { await vi.advanceTimersByTimeAsync(FAMILY_SYNC_INTERVAL_MS * 2); });
    expect(navigation.router.refresh).toHaveBeenCalledOnce();
  });
  it('ignores login pages and removes its timers on navigation/unmount', async () => {
    vi.useFakeTimers(); navigation.pathname = '/login'; const view = render(<FamilyDataRuntime />);
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(navigation.router.refresh).not.toHaveBeenCalled();
    navigation.pathname = '/ke-hoach'; view.rerender(<FamilyDataRuntime />); view.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(navigation.router.refresh).not.toHaveBeenCalled();
  });
  it('receives service worker and cross-tab signals without broadcasting private values or looping', async () => {
    vi.useFakeTimers(); const sw = new EventTarget();
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: sw });
    let channel!: { onmessage?: (event: MessageEvent) => void; postMessage: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };
    vi.stubGlobal('BroadcastChannel', class { onmessage = undefined; postMessage = vi.fn(); close = vi.fn(); constructor() { channel = this; } });
    const view = render(<FamilyDataRuntime />);
    act(() => sw.dispatchEvent(new MessageEvent('message', { data: { type: 'EMBE_DATA_CHANGED' } })));
    await act(async () => { await vi.advanceTimersByTimeAsync(301); });
    expect(navigation.router.refresh).toHaveBeenCalledOnce(); expect(channel.postMessage).not.toHaveBeenCalled();
    act(() => channel.onmessage?.(new MessageEvent('message', { data: 'changed' })));
    await act(async () => { await vi.advanceTimersByTimeAsync(301); });
    expect(navigation.router.refresh).toHaveBeenCalledTimes(2); expect(channel.postMessage).not.toHaveBeenCalled();
    act(() => window.dispatchEvent(new Event('embe:local-data-changed')));
    expect(channel.postMessage).toHaveBeenCalledWith('changed');
    view.unmount(); expect(channel.close).toHaveBeenCalledOnce();
    delete (navigator as unknown as Record<string, unknown>).serviceWorker;
  });
});

describe('planner cross-device updates', () => {
  it('shows a remote change without a skeleton and preserves a pending form', async () => {
    const task = { id: '12', occurrenceOn: '2026-09-08', startsOn: '2026-09-08', title: 'Lịch cũ', note: '', ownerRole: 'family', category: 'appointment', linkTarget: 'pregnancy', dueTime: '09:30', repeatRule: 'none', completed: false };
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ tasks: [task] })));
    render(<FamilyPlanner selectedDate="2026-09-08" />);
    await screen.findByText('Lịch cũ');
    task.title = 'Lịch vừa đổi'; act(refreshFamilyData);
    expect(await screen.findByText('Lịch vừa đổi')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Thêm việc mới' }));
    fireEvent.change(screen.getByLabelText('Việc cần làm'), { target: { value: 'Đang nhập dở' } });
    const requests = vi.mocked(fetch).mock.calls.length;
    task.title = 'Lịch từ điện thoại kia'; act(refreshFamilyData);
    expect(screen.getByLabelText('Việc cần làm')).toHaveValue('Đang nhập dở');
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(requests);
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    expect(await screen.findByText('Lịch từ điện thoại kia')).toBeInTheDocument();
  });
});

describe('service worker data invalidation', () => {
  it.each([200, 500])('notifies only after successful writes (%i), even when push fails', async status => {
    let listener!: (event: unknown) => void;
    const notify = vi.fn(); const pending: Promise<unknown>[] = [];
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status }));
    runInNewContext(readFileSync('public/sw.js', 'utf8'), {
      self: { location: { origin: 'https://embe.hieu.asia' }, addEventListener: (kind: string, fn: typeof listener) => { if (kind === 'fetch') listener = fn; },
        clients: { matchAll: async () => [{ postMessage: notify }] }, registration: { pushManager: { getSubscription: async () => { throw new Error('denied'); } } } },
      fetch: fetchMock, URL, Response, crypto, caches: { open: async () => ({ match: async () => undefined }) }
    });
    listener({ request: new Request('https://embe.hieu.asia/api/tasks', { method: 'POST' }), respondWith: (p: Promise<unknown>) => pending.push(p), waitUntil: (p: Promise<unknown>) => pending.push(p) });
    await Promise.all(pending);
    expect(notify.mock.calls).toEqual(status === 200 ? [[{ type: 'EMBE_DATA_CHANGED' }]] : []);
  });
});
