import { hashPassword, spendTimeLikeAVerification, verifyPassword } from './passwords.js';

describe('passwords', () => {
  it('stores a salted scrypt hash, never the password', async () => {
    const stored = await hashPassword('correct horse battery');

    expect(stored).toMatch(/^scrypt\$32768\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(stored).not.toContain('correct horse');
    expect(await hashPassword('correct horse battery')).not.toBe(stored);
  });

  it('accepts the right password and refuses any other', async () => {
    const stored = await hashPassword('correct horse battery');

    expect(await verifyPassword('correct horse battery', stored)).toBe(true);
    expect(await verifyPassword('correct horse batterY', stored)).toBe(false);
    expect(await verifyPassword('', stored)).toBe(false);
  });

  it('treats differently composed accents as the same password', async () => {
    const stored = await hashPassword('senha com ação');

    expect(await verifyPassword('senha com ação', stored)).toBe(true);
  });

  it('refuses a stored value that is not a recognised hash', async () => {
    expect(await verifyPassword('anything', 'plain-text')).toBe(false);
    expect(await verifyPassword('anything', 'bcrypt$1$2$3$4$5')).toBe(false);
  });

  it('spends time on an unknown account without accepting anything', async () => {
    await expect(spendTimeLikeAVerification('whatever')).resolves.toBeUndefined();
  });
});
