import { serveStudioAsset } from '../../../../../lib/studio-media-server';
import { memberAuthorization } from '../../../../../lib/family-members-server';
import { studioAsset, studioScript, studioSubtitles, studioTopic } from '../../../../../lib/studio';

export const runtime = 'nodejs';
type Context = { params: Promise<{ slug: string; kind: string }> };
const privacy = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };

export async function GET(request: Request, context: Context): Promise<Response> {
  const denied = await memberAuthorization(request);
  if (denied) return denied;
  const { slug, kind } = await context.params;
  const topic = studioTopic(slug);
  if (!topic || !['video', 'poster', 'script', 'subtitles'].includes(kind)) return new Response('Not found', { status: 404, headers: privacy });
  const download = new URL(request.url).searchParams.get('download') === '1';
  if (kind === 'script' || kind === 'subtitles') {
    return new Response(kind === 'script' ? studioScript(topic) : studioSubtitles(topic), { headers: {
      ...privacy, 'Content-Type': kind === 'script' ? 'text/plain; charset=utf-8' : 'text/vtt; charset=utf-8',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="embe-${slug}.${kind === 'script' ? 'txt' : 'vtt'}"`
    } });
  }
  const asset = studioAsset(slug, kind as 'video' | 'poster');
  if (!asset) return new Response('Not found', { status: 404, headers: privacy });
  return serveStudioAsset(request, asset, slug, kind as 'video' | 'poster');
}
