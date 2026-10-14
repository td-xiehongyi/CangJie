export interface Membership { ownerId: string; expiresAt: number }
export function renewMembership(member: Membership, days: number) {
  member.expiresAt += days * 86400000;
  return member;
}
