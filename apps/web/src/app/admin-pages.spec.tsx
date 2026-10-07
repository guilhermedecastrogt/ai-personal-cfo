import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { ADMIN_HOUSEHOLD, ADMIN_HOUSEHOLDS, SESSION } from '@/testing/fixtures';
import AdminHouseholdPage from './(dashboard)/admin/[household]/page';
import AdminPage from './(dashboard)/admin/page';

const apiGet = jest.fn<Promise<unknown>, [string]>();
const apiFind = jest.fn<Promise<unknown>, [string]>();
let isPlatformAdmin = true;

jest.mock('@/lib/session', () => ({
  currentSession: (): Promise<unknown> => Promise.resolve({ ...SESSION, isPlatformAdmin }),
}));

jest.mock('@/lib/api', () => ({
  apiGet: (path: string): Promise<unknown> => apiGet(path),
  apiFind: (path: string): Promise<unknown> => apiFind(path),
}));

jest.mock('next/navigation', () => ({
  notFound: (): never => {
    throw new Error('not found');
  },
}));

jest.mock('@/app/(dashboard)/admin/actions', () => ({}));

describe('administration pages', () => {
  beforeEach(() => {
    apiGet.mockReset();
    apiFind.mockReset();
    isPlatformAdmin = true;
  });

  it('lists the households for a platform admin', async () => {
    apiGet.mockResolvedValue(ADMIN_HOUSEHOLDS);

    render((await AdminPage()) as ReactElement);

    expect(apiGet).toHaveBeenCalledWith('/platform/households');
    expect(screen.getByRole('heading', { name: 'Households', level: 1 })).toBeInTheDocument();
  });

  it('opens one household through the not-found aware client', async () => {
    apiFind.mockResolvedValue(ADMIN_HOUSEHOLD);

    render(
      (await AdminHouseholdPage({
        params: Promise.resolve({ household: 'household key/other' }),
        searchParams: Promise.resolve({ welcome: 'SENT' }),
      })) as ReactElement,
    );

    expect(apiFind).toHaveBeenCalledWith('/platform/households/household%20key%2Fother');
    expect(screen.getByRole('heading', { name: 'Other Household', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Welcome sent on WhatsApp.')).toBeInTheDocument();
  });

  it('does not exist for anyone else, and asks the API nothing', async () => {
    isPlatformAdmin = false;

    await expect(AdminPage()).rejects.toThrow('not found');
    await expect(
      AdminHouseholdPage({ params: Promise.resolve({ household: 'household-key-other' }) }),
    ).rejects.toThrow('not found');
    expect(apiGet).not.toHaveBeenCalled();
    expect(apiFind).not.toHaveBeenCalled();
  });
});
