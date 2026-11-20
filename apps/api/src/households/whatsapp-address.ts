const AREA_CODE_END = 4;
const NINTH_DIGIT = '9';
const MOBILE_WITH_NINTH_DIGIT = /^55[1-9]{2}9[6-9]\d{7}$/;
const MOBILE_WITHOUT_NINTH_DIGIT = /^55[1-9]{2}[6-9]\d{7}$/;

/**
 * The addresses WhatsApp may use for the same person. A Brazilian mobile number is
 * written with a ninth digit, but WhatsApp identifies some accounts by the older form
 * without it, so a number registered one way can message in from the other.
 */
export function equivalentAddresses(address: string): readonly string[] {
  if (MOBILE_WITH_NINTH_DIGIT.test(address)) {
    return [address, address.slice(0, AREA_CODE_END) + address.slice(AREA_CODE_END + 1)];
  }
  if (MOBILE_WITHOUT_NINTH_DIGIT.test(address)) {
    return [address, address.slice(0, AREA_CODE_END) + NINTH_DIGIT + address.slice(AREA_CODE_END)];
  }
  return [address];
}
