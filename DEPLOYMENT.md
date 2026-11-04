# Deployment

## 1. Import to Vercel
1. Import `hanzvibes/rworks-render-studio` into Vercel.
2. Framework: Next.js; root directory: repository root.
3. Deploy to Preview first. Do not promote to Production until upload and render dispatch have been tested.

## 2. Connect private Blob storage
A private Blob store named `rworks-render-source` has been created in Singapore (`sin1`). In Vercel Storage, connect it to the Render Studio project. Vercel will add `BLOB_READ_WRITE_TOKEN` to the project environment.

## 3. Configure server environment variables
Add these to the Vercel Preview environment:
- `GITHUB_TOKEN`: GitHub fine-grained token for this repository with Actions: Read and write, Contents: Read.
- `GITHUB_OWNER=hanzvibes`
- `GITHUB_REPO=rworks-render-studio`
- `GITHUB_WORKFLOW_ID=remotion-render.yml`
- `BLOB_READ_WRITE_TOKEN`: supplied by the connected private Blob store.

Also add `BLOB_READ_WRITE_TOKEN` as a GitHub Actions repository secret with the same value. This allows the runner to download private source ZIPs. Never expose or commit any secret.

Redeploy Preview after changing Vercel environment variables.

## 4. Render flow
1. Browser uploads ZIP directly to private Vercel Blob using a short-lived client upload token.
2. The server validates the uploaded Blob URL and dispatches `.github/workflows/remotion-render.yml`.
3. GitHub Actions downloads the ZIP, installs dependencies, and runs Remotion.
4. The MP4 is stored as a GitHub Actions artifact for 7 days.

## Notes
- Upload limit: 250 MB.
- The render workflow requires a GitHub token with Actions: write.
- Use Preview first. Production deployment is intentionally not part of this setup.
