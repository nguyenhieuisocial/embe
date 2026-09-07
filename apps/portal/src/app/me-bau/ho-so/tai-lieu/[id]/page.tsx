import { notFound } from 'next/navigation';
import MedicalDocumentReview from '../../../../../components/medical-document-review';
import { isUuidV4 } from '../../../../../lib/photo-upload-server';
import './review.css';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuidV4(id)) notFound();
  return <main className="pregnancy-main document-main"><MedicalDocumentReview key={id} documentId={id} /></main>;
}
