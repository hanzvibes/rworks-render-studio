import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const allowedCodecs = new Set(['h264', 'h265', 'vp8']);
const allowedCrf = new Set(['15', '18', '23', '28']);

export async function POST(request: Request) {
  const expectedKey = process.env.RENDER_STUDIO_API_KEY;
  if (!expectedKey) return NextResponse.json({ error: 'Render Studio access key is not configured.' }, { status: 503 });
  if (request.headers.get('x-render-studio-key') !== expectedKey) return NextResponse.json({ error: 'Invalid Render Studio access key.' }, { status: 401 });

  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const workflow = process.env.GITHUB_WORKFLOW_ID || 'remotion-render.yml';
  if (!token || !owner || !repo) return NextResponse.json({ error: 'GitHub Actions credentials are not configured on the server.' }, { status: 503 });

  try {
    const body = await request.json() as { sourceZipUrl?: string; compositionId?: string; codec?: string; crf?: string; requestId?: string };
    const sourceUrl = new URL(body.sourceZipUrl || '');
    if (sourceUrl.protocol !== 'https:' || !sourceUrl.hostname.endsWith('.blob.vercel-storage.com')) {
      return NextResponse.json({ error: 'Invalid private Blob source URL.' }, { status: 400 });
    }
    if (!body.compositionId?.trim() || body.compositionId.length > 120) return NextResponse.json({ error: 'Enter a valid composition ID.' }, { status: 400 });
    if (!body.requestId || !/^[a-zA-Z0-9-]{8,80}$/.test(body.requestId)) return NextResponse.json({ error: 'Invalid render request ID.' }, { status: 400 });

    const codec = body.codec || 'h264';
    const crf = body.crf || '18';
    if (!allowedCodecs.has(codec) || !allowedCrf.has(crf)) return NextResponse.json({ error: 'Invalid render settings.' }, { status: 400 });

    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`, {
      method: 'POST',
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: process.env.VERCEL_GIT_COMMIT_REF || 'main', inputs: {
        request_id: body.requestId,
        source_zip_url: sourceUrl.toString(),
        composition_id: body.compositionId.trim(),
        codec,
        crf,
        output_name: 'render.mp4',
      } }),
      cache: 'no-store',
    });
    if (!response.ok) {
      const detail = await response.text();
      return NextResponse.json({ error: `GitHub dispatch failed (${response.status}): ${detail.slice(0, 300)}` }, { status: 502 });
    }
    return NextResponse.json({ ok: true, requestId: body.requestId, message: 'Render workflow dispatched.' });
  } catch {
    return NextResponse.json({ error: 'Invalid request or source URL.' }, { status: 400 });
  }
}
