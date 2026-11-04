import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ runId: string }> }) {
  const expectedKey = process.env.RENDER_STUDIO_API_KEY;
  if (!expectedKey) return NextResponse.json({ error: 'Render Studio access key is not configured.' }, { status: 503 });
  if (request.headers.get('x-render-studio-key') !== expectedKey) {
    return NextResponse.json({ error: 'Invalid Render Studio access key.' }, { status: 401 });
  }

  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const workflow = process.env.GITHUB_WORKFLOW_ID || 'remotion-render.yml';
  const { runId } = await context.params;

  if (!token || !owner || !repo) {
    return NextResponse.json({ error: 'GitHub Actions credentials are not configured.' }, { status: 503 });
  }
  if (!/^\d+$/.test(runId)) {
    return NextResponse.json({ error: 'Invalid workflow run ID.' }, { status: 400 });
  }

  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };

  try {
    const runResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}`,
      { headers, cache: 'no-store' },
    );
    if (!runResponse.ok) {
      return NextResponse.json({ error: 'Could not find this render job.' }, { status: 404 });
    }

    const run = await runResponse.json();
    if (run.path !== `.github/workflows/${workflow}`) {
      return NextResponse.json({ error: 'This run does not belong to the Remotion render workflow.' }, { status: 403 });
    }
    if (!['queued', 'in_progress'].includes(run.status)) {
      return NextResponse.json({ error: 'Only queued or running renders can be cancelled.' }, { status: 409 });
    }

    const cancelResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}/cancel`,
      { method: 'POST', headers, cache: 'no-store' },
    );
    if (cancelResponse.status !== 202) {
      return NextResponse.json({ error: 'GitHub could not cancel this render.' }, { status: 502 });
    }

    return NextResponse.json({ ok: true, runId: Number(runId), status: 'cancelled' });
  } catch {
    return NextResponse.json({ error: 'Unable to contact GitHub Actions.' }, { status: 502 });
  }
}
