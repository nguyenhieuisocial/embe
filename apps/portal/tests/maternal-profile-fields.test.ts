import { describe, expect, it } from 'vitest';
import { PROFILE_GROUPS, PROFILE_HISTORY_FIELDS, validFamilyMember } from '../src/lib/family-members';

const base = { id: '11111111-1111-4111-8111-111111111111', role: 'mother', fullName: 'Mẹ', preferredName: '', birthDate: null, sexAtBirth: 'female', revision: 1, archived: false, details: {} };
describe('maternal profile fields', () => {
  it('accepts and preserves every new field through JSON serialization, including zero counts', () => {
    const groups = PROFILE_GROUPS.filter(group => group.role === 'mother');
    expect(groups).toHaveLength(3);
    const details = Object.fromEntries(groups.flatMap(group => group.fields.map(field => [field.key,
      field.type === 'number' ? '0' : field.type === 'date' ? '2026-09-08' : field.options?.[0] ?? 'Theo hồ sơ bác sĩ'])));
    const member = JSON.parse(JSON.stringify({ ...base, details }));
    expect(validFamilyMember(member)).toBe(true);
    expect(member.details).toEqual(details);
    for (const key of Object.keys(details)) expect(PROFILE_HISTORY_FIELDS.some(field => field.key === key)).toBe(true);
  });
  it('rejects fractional counts, negative counts, invalid dates and unknown fields', () => {
    for (const details of [{ pregnancyCount: '1.5' }, { pregnancyCount: '-1' }, { pregnancyCount: '41' },
      { carePlanReviewedAt: '2026-02-30' }, { unknownClinicalField: 'yes' }]) {
      expect(validFamilyMember({ ...base, details })).toBe(false);
    }
    expect(validFamilyMember({ ...base, details: { pregnancyCount: '' } })).toBe(true);
  });
  it('leaves ordinary family groups available for other roles', () => {
    expect(PROFILE_GROUPS.filter(group => !group.role || group.role === 'father').some(group => group.title === 'Tiền sử sản khoa')).toBe(false);
    expect(validFamilyMember(base)).toBe(true);
  });
});
