import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as HandleUploadBody;
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.toLowerCase().endsWith('.zip')) {
          throw new Error('Only ZIP archives are allowed.');
        }
        return {
          access: 'private',
          allowedContentTypes: ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'],
          maximumSizeInBytes: 250 * 1024 * 1024,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ purpose: 'remotion-source' }),
        };
      },
      onUploadCompleted: async () => {
        // Upload completion is confirmed by the client before dispatching a render.
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
