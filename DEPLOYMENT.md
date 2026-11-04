# Deployment

## Vercel Preview
1. Import `hanzvibes/rworks-render-studio` into Vercel.
2. Framework: Next.js; root directory: repository root.
3. Deploy to Preview first. Do not promote to Production until the render workflow and upload flow have been tested.

## Required integrations
- GitHub token scoped to this repository with Actions: write and Contents: read.
- Vercel Blob store and `BLOB_READ_WRITE_TOKEN`.
- Set `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`, and `GITHUB_WORKFLOW_ID` in Vercel.

Never commit secrets. The current dashboard is an MVP UI scaffold; its render button does not dispatch a job yet. Configure and test the API integration before using it for real renders.
