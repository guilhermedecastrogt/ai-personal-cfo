import { normalizeName } from './account-resolution.js';

export interface MemberOption {
  readonly id: string;
  readonly name: string;
}

export type MemberResolution<Member extends MemberOption> =
  { readonly status: 'RESOLVED'; readonly member: Member } | { readonly status: 'UNKNOWN' };

export function comparableName(name: string): string {
  return normalizeName(
    name
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^\p{L}\p{N}\s]/gu, ' '),
  );
}

export function resolveMentionedMember<Member extends MemberOption>(
  mention: string,
  members: readonly Member[],
): MemberResolution<Member> {
  const wanted = comparableName(mention);
  if (wanted === '') {
    return { status: 'UNKNOWN' };
  }
  const exact = members.filter((member) => comparableName(member.name) === wanted);
  const byFirstName = members.filter(
    (member) => comparableName(member.name).split(' ')[0] === wanted,
  );
  const byPrefix = members.filter((member) => comparableName(member.name).startsWith(wanted));
  for (const matches of [exact, byFirstName, byPrefix]) {
    const [only, ...others] = matches;
    if (only !== undefined && others.length === 0) {
      return { status: 'RESOLVED', member: only };
    }
  }
  return { status: 'UNKNOWN' };
}
