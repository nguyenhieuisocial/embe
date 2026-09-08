import { afterEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import PullToRefresh from '../src/components/pull-to-refresh';
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
function pull(distance = 120) {
  fireEvent.touchStart(document.body, { touches: [{ clientX: 20, clientY: 10 }] });
  fireEvent.touchMove(document.body, { touches: [{ clientX: 20, clientY: 10 + distance }] });
  fireEvent.touchEnd(document.body);
}
it('reloads only after a deliberate pull at the top', () => {
  const reload = vi.spyOn(history, 'go').mockImplementation(() => {});
  render(<PullToRefresh />);
  pull(40); expect(reload).not.toHaveBeenCalled();
  pull(); expect(reload).toHaveBeenCalledWith(0);
  expect(screen.getByRole('status')).toHaveTextContent('Đang tải lại');
  pull(); expect(reload).toHaveBeenCalledTimes(1);
});
it('does not reload while scrolled, offline or after cancelling the unsaved warning', () => {
  const reload = vi.spyOn(history, 'go').mockImplementation(() => {});
  const scroll = vi.spyOn(window, 'scrollY', 'get').mockReturnValue(100);
  render(<><input aria-label="Nội dung" /><PullToRefresh /></>);
  pull(); expect(reload).not.toHaveBeenCalled();
  scroll.mockReturnValue(0);
  const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  pull(); expect(screen.getByRole('status')).toHaveTextContent('Chưa có mạng');
  online.mockReturnValue(true);
  fireEvent.input(screen.getByLabelText('Nội dung'));
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  pull(); expect(window.confirm).toHaveBeenCalled(); expect(reload).not.toHaveBeenCalled();
});
it('recovers when navigation is cancelled and allows another pull', () => {
  vi.useFakeTimers();
  const reload = vi.spyOn(history, 'go').mockImplementation(() => {});
  render(<PullToRefresh />);
  pull();
  act(() => vi.advanceTimersByTime(12000));
  expect(screen.getByRole('status')).toHaveTextContent('Trang chưa tải lại');
  fireEvent.click(screen.getByRole('button', { name: 'Đóng thông báo làm mới' }));
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  pull(); expect(reload).toHaveBeenCalledTimes(2);
});
it('cancels multi-touch, horizontal gestures and interrupted gestures', () => {
  const reload = vi.spyOn(history, 'go').mockImplementation(() => {});
  render(<PullToRefresh />);
  fireEvent.touchStart(document.body, { touches: [{ clientX: 0, clientY: 0 }] });
  fireEvent.touchMove(document.body, { touches: [{ clientX: 200, clientY: 120 }] });
  fireEvent.touchEnd(document.body);
  fireEvent.touchStart(document.body, { touches: [{ clientX: 0, clientY: 0 }] });
  fireEvent.touchMove(document.body, { touches: [{ clientX: 0, clientY: 120 }, { clientX: 40, clientY: 20 }] });
  fireEvent.touchEnd(document.body);
  fireEvent.touchStart(document.body, { touches: [{ clientX: 0, clientY: 0 }] });
  fireEvent.touchMove(document.body, { touches: [{ clientX: 0, clientY: 120 }] });
  fireEvent.touchCancel(document.body); fireEvent.touchEnd(document.body);
  expect(reload).not.toHaveBeenCalled();
});
it('leaves a modal and nested scroller untouched', () => {
  const reload = vi.spyOn(history, 'go').mockImplementation(() => {});
  const { rerender } = render(<><div role="dialog">Ảnh</div><PullToRefresh /></>);
  pull(); expect(reload).not.toHaveBeenCalled();
  rerender(<><div data-testid="scroll" style={{ overflowY: 'auto' }}>Nội dung</div><PullToRefresh /></>);
  const nested = screen.getByTestId('scroll');
  Object.defineProperty(nested, 'scrollHeight', { value: 200 });
  Object.defineProperty(nested, 'clientHeight', { value: 100 });
  fireEvent.touchStart(nested, { touches: [{ clientX: 0, clientY: 0 }] });
  fireEvent.touchMove(nested, { touches: [{ clientX: 0, clientY: 120 }] }); fireEvent.touchEnd(nested);
  expect(reload).not.toHaveBeenCalled();
});
