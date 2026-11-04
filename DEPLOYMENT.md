# Render Studio — operational notes

## Render lifecycle

1. The browser uploads a ZIP to private Vercel Blob storage.
2. The render API validates the workspace key and dispatches a GitHub Actions workflow.
3. GitHub Actions downloads the archive using the Blob token, validates ZIP paths, symlinks, integrity, file count and expanded size, then checks for a Remotion dependency.
4. Dependencies are installed with the lockfile when present, the Remotion browser is prepared, and the requested composition is rendered.
5. The output is uploaded as a GitHub Actions artifact for seven days.

## Queue and resource limits

- Render workflows are serialized per repository; later jobs wait rather than competing for runners.
- Each job has a 90-minute timeout.
- Source ZIP upload is limited to 250 MB.
- ZIP extraction is limited to 10,000 entries and 2 GB expanded data.
- Artifacts expire after seven days.

## Preflight behavior

The workflow rejects invalid ZIP archives, unsafe paths, symlinks, missing package.json, and projects without the remotion dependency. It warns when no lockfile or conventional entry point is found. A static source scan looks for the requested literal Composition ID, but this is advisory: dynamic IDs and imported constants cannot be reliably resolved with a text scan. Remotion's own CLI remains the authoritative composition check.

## Current product limitations

- Composition discovery is advisory, not a full interactive ZIP inspector.
- Progress reflects completed GitHub Actions steps, not rendered frames.
- Render history remains local to the browser.
- The download is a GitHub Actions artifact ZIP containing the rendered media.
- Video preview, persistent server-side history, batch rendering, and multi-user accounts are not implemented yet.

## Security notes

- Keep GITHUB_TOKEN, RENDER_STUDIO_API_KEY, and BLOB_READ_WRITE_TOKEN in encrypted environment/secret storage. Never expose them to client bundles or logs.
- The Blob token is only injected into the archive download step; it is not passed to project dependency installation or render commands.
- Uploaded projects execute dependency lifecycle scripts and Remotion code on an ephemeral GitHub-hosted runner. Treat uploaded archives as untrusted and only render projects you control. This MVP is not a hardened multi-tenant sandbox.
