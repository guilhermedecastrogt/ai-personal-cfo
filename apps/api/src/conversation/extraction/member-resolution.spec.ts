import { resolveMentionedMember } from './member-resolution.js';

const MARIA = { id: 'maria', name: 'Maria Souza' };
const MARCOS = { id: 'marcos', name: 'Marcos' };
const JOSE = { id: 'jose', name: 'José' };
const MEMBERS = [MARIA, MARCOS, JOSE];

describe('resolveMentionedMember', () => {
  it.each([
    ['Maria Souza', MARIA],
    ['maria', MARIA],
    ['Jose', JOSE],
    ['JOSÉ', JOSE],
    ['Marcos', MARCOS],
  ])('resolves %j to one member', (mention, member) => {
    expect(resolveMentionedMember(mention, MEMBERS)).toEqual({ status: 'RESOLVED', member });
  });

  it.each(['Mar', 'Ana', '', '  '])('does not guess for %j', (mention) => {
    expect(resolveMentionedMember(mention, MEMBERS)).toEqual({ status: 'UNKNOWN' });
  });

  it('accepts a unique beginning of a name', () => {
    expect(resolveMentionedMember('Jo', MEMBERS)).toEqual({ status: 'RESOLVED', member: JOSE });
  });
});
