import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ runId: string }> }) {
  const expectedKey = process.env.RENDER_STUDIO_API_KEY;
  if (!expectedKey) return NextResponse.json({ error: 'Render Studio access key is not configured.' }, { status: 503 });
  if (request.headers.get('x-render-studio-key') !== expectedKey) return NextResponse.json({ error: 'Invalid Render Studio access key.' }, { status: 401 });
  const token = process.env.GITHUB_TOKEN, owner = process.env.GITHUB_OWNER, repo = process.env.GITHUB_REPO;
  const { runId } = await context.params;
  if (!token || !owner || !repo) return NextResponse.json({ error: 'GitHub Actions credentials are not configured.' }, { status: 503 });
  if (!/^\d+$/.test(runId) || !Number.isSafeInteger(Number(runId))) return NextResponse.json({ error: 'Invalid workflow run ID.' }, { status: 400 });
  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}/cancel`, {
      method: 'POST',
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' },
      cache: 'no-store',
    });
    if (response.status === 409) return NextResponse.json({ error: 'Render sudah selesai atau tidak bisa dibatalkan.' }, { status: 409 });
    if (!response.ok) return NextResponse.json({ error: `GitHub gagal membatalkan workflow (${response.status}). Pastikan token memiliki izin Actions write.` }, { status: 502 });
    return NextResponse.json({ ok: true, runId: Number(runId), message: 'Cancellation requested.' });
  } catch { return NextResponse.json({ error: 'Unable to contact GitHub Actions.' }, { status: 502 }); }
}
