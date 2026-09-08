import {it,expect} from 'vitest';
import {medicalWorkspaceView} from '../src/lib/medical-workspace-view';
it('opens correct sections for saved deep links',()=>{
 expect(medicalWorkspaceView('#record-123')).toBe('documents');
 expect(medicalWorkspaceView('#ho-so-da-luu')).toBe('documents');
 expect(medicalWorkspaceView('#them-giay-to')).toBe('documents');
 expect(medicalWorkspaceView('#lich-kham-ke-tiep')).toBe('visits');
 expect(medicalWorkspaceView('')).toBe('overview');
});
