import { equivalentAddresses } from './whatsapp-address.js';

describe('equivalent WhatsApp addresses', () => {
  it('adds the form without the ninth digit to a Brazilian mobile number', () => {
    expect(equivalentAddresses('5511987654321')).toEqual(['5511987654321', '551187654321']);
  });

  it('adds the form with the ninth digit to a Brazilian mobile number written without it', () => {
    expect(equivalentAddresses('551187654321')).toEqual(['551187654321', '5511987654321']);
  });

  it.each([
    ['a Brazilian landline', '556232345678'],
    ['a Brazilian number of the wrong length', '55119876543'],
    ['an Irish mobile number', '353850000001'],
    ['a North American number', '12025550101'],
    ['a test identifier', 'resolution-0'],
  ])('leaves %s alone', (_, address) => {
    expect(equivalentAddresses(address)).toEqual([address]);
  });
});
