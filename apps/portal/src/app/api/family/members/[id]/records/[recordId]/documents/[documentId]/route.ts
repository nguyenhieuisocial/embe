import { changeFamilyDocument, readFamilyDocument } from '../../../../../../../../../lib/family-health-documents-server';
type Context = { params: Promise<{ id: string; recordId: string; documentId: string }> };
export async function GET(request: Request, context: Context) { return readFamilyDocument(request, await context.params); }
export async function POST(request: Request, context: Context) { return changeFamilyDocument(request, await context.params); }
