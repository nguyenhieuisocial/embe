import { expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import UpdatesPage from '../src/app/cap-nhat/page';
import { APP_UPDATES, LATEST_APP_UPDATE } from '../src/lib/app-updates';
import { GET } from '../src/app/api/health/route';

it('serves a version-linked summary without caching or private family details', async () => {
  const response = GET();
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect((await response.json()).update).toEqual(LATEST_APP_UPDATE);
});
it('lists concrete changes and links to the affected feature', () => {
  render(<UpdatesPage />);
  expect(screen.getByRole('heading', {name:'Có gì mới trong EmBe?'})).toBeTruthy();
  for(const release of APP_UPDATES) for(const item of release.items) {
    expect(screen.getByRole('heading',{name:item.title})).toBeTruthy();
    expect(item.href.startsWith('/') && !item.href.startsWith('//')).toBe(true);
    expect(screen.getByText(item.description)).toBeTruthy();
  }
  expect(screen.getByRole('link',{name:'Xem trạng thái tự khớp'}).getAttribute('href')).toBe('/nha-minh/ho-so?role=mother');
});
