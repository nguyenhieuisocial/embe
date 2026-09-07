import { createFamilyDocument, listFamilyDocuments } from '../../../../../../../../lib/family-health-documents-server';
type Context = { params: Promise<{ id: string; recordId: string }> };
export async function GET(request: Request, context: Context) { return listFamilyDocuments(request, await context.params); }
export async function POST(request: Request, context: Context) { return createFamilyDocument(request, await context.params); }
