import { afterEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import PullToRefresh from '../src/components/pull-to-refresh';
afterEach(() => vi.restoreAllMocks());
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
