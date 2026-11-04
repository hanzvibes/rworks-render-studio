# R/WORKS Render Studio

A private cloud-render workspace for Remotion projects. Upload a ZIP, inspect its compositions, choose an export preset, and render through GitHub Actions.

## Workflow

1. Upload a Remotion project ZIP (maximum 250 MB).
2. The browser inspects `package.json`, Remotion version, lockfile, entry point, and likely Composition IDs.
3. Choose a composition and Draft, Standard, or Final preset. Advanced settings allow codec and CRF overrides.
4. Add the job to the browser-local FIFO queue. One job is dispatched at a time from this browser.
5. Follow workflow progress, cancel an active job or remove a queued job, and retry failed renders from the private source archive.
6. Preview the rendered video and download the GitHub artifact ZIP.

## Workspace features

- Upload progress and multipart upload for archives larger than 100 MB.
- ZIP safety checks before render: path traversal, symlink, file-count, and expanded-size validation.
- Browser-local render history, queue, usage counters, average render duration, and approximate time estimates.
- Output filename validation and per-render artifact size / codec / CRF / duration comparison.
- Plain-language failure hints with direct access to authoritative GitHub Actions logs.

## Queue and history behavior

Queue and history are stored in this browser's local storage, not in a shared server database. The workspace key is held in memory only and is not saved with the history. If the page is refreshed, enter the workspace key again to resume polling and dispatch pending queue items. The queue is not coordinated across different browsers or devices.

Private source Blob URLs are retained with local history so a failed job can be retried without uploading again. Clear local history when you no longer need those retry references.

## Setup

See [DEPLOYMENT.md](./DEPLOYMENT.md) for required Vercel environment variables, GitHub Actions permissions, and Blob configuration.

## Validation

A successful Vercel Preview build verifies the Next.js application build, but does not prove a real Remotion render works. Before production release, run an end-to-end test with a small Remotion ZIP: upload, inspect, queue, render, preview, download, retry, and cancellation.
