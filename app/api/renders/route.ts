import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const expectedKey = process.env.RENDER_STUDIO_API_KEY;
  if (!expectedKey) return NextResponse.json({ error: 'Render Studio access key is not configured.' }, { status: 503 });
  if (request.headers.get('x-render-studio-key') !== expectedKey) return NextResponse.json({ error: 'Invalid Render Studio access key.' }, { status: 401 });

  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const workflow = process.env.GITHUB_WORKFLOW_ID || 'remotion-render.yml';
  const requestId = new URL(request.url).searchParams.get('requestId');
  if (!token || !owner || !repo) return NextResponse.json({ error: 'GitHub Actions credentials are not configured.' }, { status: 503 });
  if (!requestId || !/^[a-zA-Z0-9-]{8,80}$/.test(requestId)) return NextResponse.json({ error: 'Invalid render request ID.' }, { status: 400 });

  try {
    const branch = process.env.VERCEL_GIT_COMMIT_REF || 'main';
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/runs?branch=${encodeURIComponent(branch)}&event=workflow_dispatch&per_page=30`, {
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' },
      cache: 'no-store',
    });
    if (!response.ok) return NextResponse.json({ error: `Could not read GitHub Actions status (${response.status}).` }, { status: 502 });
    const data = await response.json();
    const run = data.workflow_runs?.find((item: { display_title?: string }) => item.display_title?.includes(requestId));
    if (!run) return NextResponse.json({ requestId, status: 'queued', message: 'Waiting for GitHub Actions to register the run.' });

    let artifactUrl: string | null = null;
    if (run.status === 'completed' && run.conclusion === 'success') {
      const artifactsResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/runs/${run.id}/artifacts`, {
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' },
        cache: 'no-store',
      });
      if (artifactsResponse.ok) {
        const artifacts = await artifactsResponse.json();
        if (artifacts.artifacts?.some((artifact: { name: string; expired: boolean }) => artifact.name === 'remotion-render' && !artifact.expired)) {
          artifactUrl = `/api/renders/${run.id}/download`;
        }
      }
    }

    return NextResponse.json({
      requestId,
      runId: run.id,
      status: run.status,
      conclusion: run.conclusion,
      displayTitle: run.display_title,
      htmlUrl: run.html_url,
      createdAt: run.created_at,
      updatedAt: run.updated_at,
      artifactUrl,
    });
  } catch {
    return NextResponse.json({ error: 'Unable to contact GitHub Actions.' }, { status: 502 });
  }
}
