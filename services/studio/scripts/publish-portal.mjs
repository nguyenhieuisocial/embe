// Publish only verified editorial drafts, never family media or runtime credentials.
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, realpath } from 'node:fs/promises';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { parseArgs, parseEnv } from 'node:util';

const { values } = parseArgs({ options: {
  campaign: { type: 'string' }, catalog: { type: 'string' }, 'env-file': { type: 'string' }, output: { type: 'string' }, merge: { type: 'boolean', default: false }
} });
const bucket = 'embe-studio-drafts';
const hash = body => createHash('sha256').update(body).digest('hex');

async function main() {
  for (const key of ['campaign', 'catalog', 'env-file', 'output']) if (!values[key]) throw new Error(`missing_${key}`);
  const env = parseEnv(await readFile(resolve(values['env-file']), 'utf8'));
  const base = new URL(env.SUPABASE_URL);
  const secret = env.SUPABASE_SECRET_KEY;
  if (base.origin !== 'https://tpqqzowhndbkmkckpbgv.supabase.co' || !secret || secret.length < 30) throw new Error('invalid_storage_config');
  const campaign = await realpath(values.campaign);
  async function sourceFile(path) {
    const exact = await realpath(path);
    const inside = relative(campaign, exact);
    if (!inside || inside.startsWith('..') || isAbsolute(inside)) throw new Error('outside_campaign');
    const body = await readFile(exact);
    if (body.length > 4_000_000) throw new Error('asset_exceeds_portal_budget');
    return body;
  }
  const report = JSON.parse(await sourceFile(resolve(campaign, 'report.json')));
  const catalog = JSON.parse(await readFile(values.catalog, 'utf8'));
  if (report.status !== 'draft' || report.published !== false || report.clinical_review !== 'not_reviewed'
    || catalog.editorial_status !== 'draft' || catalog.clinical_review !== 'not_reviewed'
    || report.videos.length !== catalog.items.length) throw new Error('unverified_campaign');
  const narrated = report.format === 'infographic-voice-v1';
  if (narrated && hash(await readFile(values.catalog)) !== report.catalog_sha256) throw new Error('catalog_changed_after_render');
  const output = resolve(values.output);
  const existing = values.merge ? JSON.parse(await readFile(output, 'utf8')) : null;
  if (existing && (existing.version !== 1 || !Array.isArray(existing.topics) || !Array.isArray(existing.ideas))) throw new Error('invalid_existing_catalog');
  if (new Set(report.videos.map(video => video.slug)).size !== report.videos.length) throw new Error('duplicate_rendered_topic');
  const headers = { apikey: secret, Authorization: `Bearer ${secret}` };
  const request = (path, options = {}) => fetch(`${base.origin}/storage/v1/${path}`, {
    ...options, redirect: 'error', signal: AbortSignal.timeout(30000), headers: { ...headers, ...options.headers }
  });
  let info = await request(`bucket/${bucket}`);
  if (!info.ok) {
    const failure = await info.json();
    if (![400, 404].includes(info.status) || !/bucket.*not found/i.test(failure.message ?? '')) throw new Error(`bucket_read_${info.status}`);
    // A create conflict fails safely; never alter the visibility of an existing bucket.
    const created = await request('bucket', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: bucket, name: bucket, public: false, file_size_limit: 4_000_000, allowed_mime_types: ['video/mp4', 'image/png'] }) });
    if (!created.ok) throw new Error(`bucket_create_${created.status}`);
    info = await request(`bucket/${bucket}`);
  }
  if (!info.ok || (await info.json()).public !== false) throw new Error('bucket_must_be_private');
  async function upload(body, mime, ext) {
    const checksum = hash(body);
    const path = `editorial/${checksum}.${ext}`;
    const result = await request(`object/${bucket}/${path}`, { method: 'POST', headers: { 'content-type': mime, 'x-upsert': 'false', 'cache-control': '3600' }, body });
    if (!result.ok && ![400, 409].includes(result.status)) throw new Error(`upload_${result.status}`);
    // Also verifies idempotent conflicts; never accept a different object with the same locator.
    const downloaded = await request(`object/authenticated/${bucket}/${path}`);
    if (!downloaded.ok || hash(Buffer.from(await downloaded.arrayBuffer())) !== checksum) throw new Error('uploaded_checksum_mismatch');
    return { path, mime, size: body.length, checksum };
  }
  const manifest = JSON.parse(await sourceFile(resolve(campaign, 'cards/manifest.json')));
  const topics = [];
  for (const rendered of report.videos) {
    const topic = catalog.items.find(item => item.slug === rendered.slug);
    if (!topic || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(topic.slug) || rendered.status !== 'completed') throw new Error('invalid_topic');
    const project = JSON.parse(await sourceFile(resolve(campaign, `${topic.slug}.${narrated ? 'timeline' : 'project'}.json`)));
    if (!Array.isArray(project.scenes) || project.scenes.some(scene => !Number.isInteger(scene.seconds) || scene.seconds < 2 || scene.seconds > 26)) throw new Error('invalid_timeline');
    if (narrated && (project.format !== report.format || rendered.audio !== true || project.audio !== true || rendered.result.audio_codec !== 'aac')) throw new Error('narration_not_verified');
    if (narrated && (!project.voiceCredit?.attribution || !project.voiceCredit.url?.startsWith('https://huggingface.co/rhasspy/piper-voices/')
      || project.voiceCredit.license !== 'https://creativecommons.org/licenses/by/4.0/')) throw new Error('missing_voice_credit');
    const poster = manifest[project.scenes[0].asset_id];
    if (poster?.provenance !== 'embe_educational_layout' || !/^[a-f0-9-]{36}\.png$/.test(poster.file)) throw new Error('invalid_poster');
    const image = await sourceFile(resolve(campaign, 'cards', poster.file));
    const video = await sourceFile(rendered.local_path);
    if (hash(image) !== poster.checksum_sha256 || hash(video) !== rendered.result.checksum_sha256) throw new Error('local_checksum_mismatch');
    if (topic.beats.length !== project.scenes.length) throw new Error('scene_count_mismatch');
    let at = 0;
    const beats = topic.beats.map((beat, index) => {
      const start = at; at += project.scenes[index].seconds;
      return { heading: beat.heading, text: beat.text, start, end: at };
    });
    if (at !== rendered.result.duration_seconds || at > 260) throw new Error('rendered_timeline_mismatch');
    topics.push({ slug: topic.slug, title: topic.title, pillar: topic.pillar, stage: topic.stage, hookB: topic.hook_b,
      caption: topic.caption, hashtags: topic.hashtags, duration: at, beats, audio: narrated,
      checkedAt: catalog.sources_checked_at, reviewDue: catalog.review_due,
      ...(narrated ? { voiceCredit: project.voiceCredit } : {}),
      sources: topic.sources.map(key => catalog.sources[key]),
      assets: { video: await upload(video, 'video/mp4', 'mp4'), poster: await upload(image, 'image/png', 'png') } });
    console.log(`Verified private upload: ${topic.slug}`);
  }
  await mkdir(dirname(output), { recursive: true });
  const merged = [...topics, ...(existing?.topics ?? []).filter(topic => !topics.some(added => added.slug === topic.slug))];
  const ideas = [...new Set([...(existing?.ideas ?? []), ...catalog.research_backlog])];
  // Generated build input: no disk paths, session data, tokens or bucket credentials.
  await writeFile(output, JSON.stringify({ version: 1, brand: catalog.brand, checkedAt: catalog.sources_checked_at,
    reviewDue: catalog.review_due, clinicalReview: 'not_reviewed', audio: merged.every(topic => topic.audio === true), topics: merged, ideas }, null, 2) + '\n');
  console.log(`Ready for portal: ${merged.length} topics, ${ideas.length} ideas; bucket private`);
}
main().catch(error => { console.error(error instanceof Error && /^[a-zA-Z0-9_-]+$/.test(error.message) ? error.message : 'publication_failed'); process.exitCode = 1; });
