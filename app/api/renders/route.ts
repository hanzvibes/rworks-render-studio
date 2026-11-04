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
    // Search by the unique request ID across branches. Preview deployments may dispatch
    // workflows from a different ref than the production deployment.
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/runs?event=workflow_dispatch&per_page=100`, {
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' },
      cache: 'no-store',
    });
    if (!response.ok) return NextResponse.json({ error: `Could not read GitHub Actions status (${response.status}).` }, { status: 502 });
    const data = await response.json();
    const run = data.workflow_runs?.find((item: { display_title?: string }) => item.display_title?.includes(requestId));
    if (!run) return NextResponse.json({ requestId, status: 'queued', message: 'Waiting for GitHub Actions to register the run.' });

    const jobsResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/runs/${run.id}/jobs?per_page=20`, {
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' },
      cache: 'no-store',
    });
    const jobsData = jobsResponse.ok ? await jobsResponse.json() : { jobs: [] };
    const jobs = jobsData.jobs || [];
    const allJobsCompleted = jobs.length > 0 && jobs.every((job: { status: string }) => job.status === 'completed');
    const allJobsSucceeded = allJobsCompleted && jobs.every((job: { conclusion: string | null }) => job.conclusion === 'success');
    // GitHub can leave a workflow run marked in_progress after its job and all post-job steps completed.
    // Reconcile the dashboard state from authoritative job conclusions instead of polling forever.
    const effectiveStatus = run.status === 'in_progress' && allJobsCompleted ? 'completed' : run.status;
    const effectiveConclusion = run.conclusion ?? (allJobsCompleted ? (allJobsSucceeded ? 'success' : 'failure') : null);
    const steps = (jobs[0]?.steps || []).map((step: { name: string; status: string; conclusion: string | null }) => ({
      name: step.name,
      status: step.status,
      conclusion: step.conclusion,
    }));
    const completedSteps = steps.filter((step: { status: string }) => step.status === 'completed').length;
    const progress = steps.length ? Math.round((completedSteps / steps.length) * 100) : run.status === 'completed' ? 100 : 0;
    const currentStep = steps.find((step: { status: string }) => step.status === 'in_progress')?.name
      || steps.find((step: { status: string; conclusion: string | null }) => step.status === 'completed' && step.conclusion === 'failure')?.name
      || (effectiveStatus === 'completed' ? 'Render finished' : 'Waiting for runner');

    let artifactUrl: string | null = null;
    if (effectiveStatus === 'completed' && effectiveConclusion === 'success') {
      const artifactsResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/runs/${run.id}/artifacts`, {
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' },
        cache: 'no-store',
      });
      if (artifactsResponse.ok) {
        const artifacts = await artifactsResponse.json();
        if (artifacts.artifacts?.some((artifact: { name: string; expired: boolean }) => artifact.name === 'remotion-render' && !artifact.expired)) {
          artifactUrl = `/api/renders/${run.id}/file`;
        }
      }
    }

    return NextResponse.json({
      requestId,
      runId: run.id,
      status: effectiveStatus,
      conclusion: effectiveConclusion,
      displayTitle: run.display_title,
      htmlUrl: run.html_url,
      createdAt: run.created_at,
      updatedAt: run.updated_at,
      artifactUrl,
      steps,
      progress,
      currentStep,
    });
  } catch {
    return NextResponse.json({ error: 'Unable to contact GitHub Actions.' }, { status: 502 });
  }
}
