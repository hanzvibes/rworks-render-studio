import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(request: Request, context: { params: Promise<{ runId: string }> }) {
  const expectedKey = process.env.RENDER_STUDIO_API_KEY;
  if (!expectedKey) return NextResponse.json({ error: 'Render Studio access key is not configured.' }, { status: 503 });
  if (request.headers.get('x-render-studio-key') !== expectedKey) return NextResponse.json({ error: 'Invalid Render Studio access key.' }, { status: 401 });

  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const { runId } = await context.params;
  if (!token || !owner || !repo) return NextResponse.json({ error: 'GitHub Actions credentials are not configured.' }, { status: 503 });
  if (!/^\d+$/.test(runId)) return NextResponse.json({ error: 'Invalid workflow run ID.' }, { status: 400 });

  const headers = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' };
  const list = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}/artifacts`, { headers, cache: 'no-store' });
  if (!list.ok) return NextResponse.json({ error: 'Could not find render artifact.' }, { status: 404 });
  const data = await list.json();
  const artifact = data.artifacts?.find((item: { name: string; expired: boolean }) => item.name === 'remotion-render' && !item.expired);
  if (!artifact) return NextResponse.json({ error: 'Render artifact is not available or has expired.' }, { status: 404 });

  const download = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/artifacts/${artifact.id}/zip`, { headers, redirect: 'manual', cache: 'no-store' });
  const location = download.headers.get('location');
  if (download.status !== 302 || !location) return NextResponse.json({ error: 'GitHub did not provide an artifact download.' }, { status: 502 });
  return NextResponse.redirect(location);
}
