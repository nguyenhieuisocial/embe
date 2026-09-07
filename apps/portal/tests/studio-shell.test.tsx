import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const navigation = vi.hoisted(() => ({ pathname: '/studio' }));
vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname }));
vi.mock('../src/components/family-nav', () => ({ default: () => <nav>Điều hướng EmBe</nav> }));
vi.mock('../src/components/quick-actions', () => ({ default: () => <button>Ghi nhanh</button> }));
vi.mock('../src/components/device-access-prompt', () => ({ default: () => <div role="dialog">Thiết lập quyền sức khỏe</div> }));
import AppShell from '../src/components/app-shell';

describe('Studio stays separate from personal health permissions', () => {
  it.each(['/studio', '/studio/ca-phe-tra-sua'])('does not block %s with unrelated device setup', path => {
    navigation.pathname = path;
    render(<AppShell><h1>Studio</h1></AppShell>);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });
  it('preserves device onboarding in the care app', () => {
    navigation.pathname = '/me-bau';
    render(<AppShell><h1>Mẹ bầu</h1></AppShell>);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
