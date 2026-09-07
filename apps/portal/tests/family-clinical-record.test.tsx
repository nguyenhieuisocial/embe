import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import FamilyMembers from '../src/components/family-members';
import { validMemberRecord, type MemberRecord } from '../src/lib/family-members';
import { ClinicalRecordDetails } from '../src/components/family-clinical-record';

const id = '11111111-1111-4111-8111-111111111111'; const memberId = '22222222-2222-4222-8222-222222222222';
const record: MemberRecord = { id, memberId, kind: 'visit', title: 'Khám tai mũi họng', occurredAt: '2025-01-01T08:00:00Z',
  notes: '', source: 'Cơ sở minh họa', nextDueDate: null, metric: null, value: null, secondaryValue: null, unit: null, revision: 1, deleted: false,
  clinical: { specialty: 'Tai mũi họng', diagnosis: 'Nội dung chép từ phiếu', status: 'monitoring' },
  labResults: [{ name: 'Xét nghiệm minh họa', value: 'Âm tính', unit: '', referenceRange: 'Theo phiếu' }] };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('general family clinical records', () => {
  it('accepts existing records and non-pregnancy structured records, including qualitative results', () => {
    expect(validMemberRecord(record)).toBe(true);
    expect(validMemberRecord({ ...record, clinical: undefined, labResults: undefined })).toBe(true);
  });
  it('rejects arbitrary clinical fields, invalid statuses, incomplete labs and oversized content', () => {
    expect(validMemberRecord({ ...record, clinical: { guessedDiagnosis: 'x' } })).toBe(false);
    expect(validMemberRecord({ ...record, clinical: { status: '__proto__' } })).toBe(false);
    expect(validMemberRecord({ ...record, clinical: { diagnosis: 'x'.repeat(801) } })).toBe(false);
    expect(validMemberRecord({ ...record, labResults: [{ name: 'Hb', value: '', unit: 'g/dL', referenceRange: '' }] })).toBe(false);
    expect(validMemberRecord({ ...record, labResults: Array(13).fill(record.labResults![0]) })).toBe(false);
    expect(validMemberRecord({ ...record, documents: [{ storage_path: 'someone-else' }] })).toBe(false);
  });
  it('shows doctor-supplied information without invented interpretations', () => {
    render(<ClinicalRecordDetails record={record} />);
    expect(screen.getByText('Nội dung chép từ phiếu')).toBeInTheDocument();
    expect(screen.getByText('Âm tính')).toBeInTheDocument();
    expect(screen.getByText('Tham chiếu trên phiếu: Theo phiếu')).toBeInTheDocument();
  });
  it('saves a father clinical record and searches the full history through the API', async () => {
    const saved: MemberRecord[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      if (String(url) === '/api/family/members') return Response.json({ members: [{ id: memberId, role: 'father', fullName: 'Ba minh họa', preferredName: 'Ba', birthDate: '1990-01-01', sexAtBirth: 'male', details: {}, revision: 1, archived: false }] });
      if (String(url).endsWith('/documents')) return Response.json({ documents: [] });
      if (init?.method === 'POST') { const value = JSON.parse(String(init.body)); saved.push({ ...value, revision: 1 }); return Response.json({ record: saved.at(-1) }); }
      return Response.json({ records: saved, latest: [], nextOffset: null });
    }));
    render(<FamilyMembers initialRole="father" initialTab="records" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Thêm bệnh án / lần khám' }));
    fireEvent.change(screen.getByLabelText('Tiêu đề'), { target: { value: 'Khám tai mũi họng' } });
    fireEvent.change(screen.getByLabelText('Chuyên khoa'), { target: { value: 'Tai mũi họng' } });
    fireEvent.change(screen.getByLabelText('Chẩn đoán được ghi trên hồ sơ'), { target: { value: 'Theo phiếu khám' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bản ghi' }));
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].memberId).toBe(memberId); expect(saved[0].kind).toBe('visit');
    expect(saved[0].clinical?.specialty).toBe('Tai mũi họng');
    expect(saved[0]).not.toHaveProperty('pregnancyMemory');
    await screen.findByRole('button', { name: 'Chụp giấy tờ' });
    fireEvent.change(screen.getByLabelText('Tìm trong lịch sử'), { target: { value: 'Tai mũi họng' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Tìm bệnh án' }));
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('q=Tai%20m%C5%A9i%20h%E1%BB%8Dng'))).toBe(true));
  });
});
