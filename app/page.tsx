'use client';

import { useState } from 'react';
import { upload } from '@vercel/blob/client';
import { Film, FolderUp, Gauge, Play, Clock3, Settings2, Clapperboard, CircleCheck } from 'lucide-react';

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [composition, setComposition] = useState('');
  const [codec, setCodec] = useState('h264');
  const [quality, setQuality] = useState('18');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Ready to configure a render');

  async function startRender() {
    if (!file) return setMessage('Choose a Remotion project ZIP first.');
    if (!file.name.toLowerCase().endsWith('.zip')) return setMessage('Please select a ZIP archive.');
    if (file.size > 250 * 1024 * 1024) return setMessage('ZIP must be 250 MB or smaller.');
    if (!composition.trim()) return setMessage('Enter the Remotion composition ID.');

    setBusy(true);
    try {
      setMessage('Uploading project ZIP to private storage…');
      const blob = await upload(file.name, file, {
        access: 'private',
        handleUploadUrl: '/api/upload',
      });

      setMessage('Upload complete. Dispatching GitHub Actions…');
      const response = await fetch('/api/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceZipUrl: blob.url,
          compositionId: composition.trim(),
          codec,
          crf: quality,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not start the render.');
      setMessage('Render queued successfully. Check the GitHub Actions tab for progress and the MP4 artifact.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Something went wrong while starting the render.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 1180, margin: '0 auto', padding: '34px 24px 70px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20, marginBottom: 48 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: 13, background: '#c4f56b', color: '#111', display: 'grid', placeItems: 'center', fontWeight: 900 }}>R/</div>
          <div><b style={{ letterSpacing: '.08em' }}>R/WORKS</b><div className="muted" style={{ fontSize: 12 }}>RENDER STUDIO</div></div>
        </div>
        <div className="muted" style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}><span className="accent">●</span> Workspace online</div>
      </header>

      <section style={{ marginBottom: 30 }}>
        <div className="muted" style={{ fontSize: 12, letterSpacing: '.18em', marginBottom: 12 }}>REMOTION CLOUD RENDERING</div>
        <h1 style={{ fontSize: 'clamp(34px,6vw,58px)', lineHeight: 1.04, letterSpacing: '-.05em', margin: '0 0 14px' }}>Your timeline.<br /><span className="accent">Rendered in the cloud.</span></h1>
        <p className="muted" style={{ maxWidth: 560, lineHeight: 1.7 }}>Upload a Remotion project, choose a composition and render settings, then let GitHub Actions handle the heavy work.</p>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.55fr) minmax(280px,1fr)', gap: 18 }}>
        <section className="panel" style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}><Clapperboard size={18} /><b>New render</b><span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>01 / SOURCE</span></div>
          <label className="muted" style={{ fontSize: 12 }}>REMOTION PROJECT (.ZIP)</label>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, border: '1px dashed #424754', borderRadius: 14, padding: 24, margin: '10px 0 22px', cursor: 'pointer', background: '#171a20' }}>
            <FolderUp size={22} className="accent" />
            <span><b style={{ display: 'block', fontSize: 14 }}>{file ? file.name : 'Choose project archive'}</b><small className="muted">ZIP archive · max 250 MB</small></span>
            <input type="file" accept=".zip,application/zip" hidden onChange={e => setFile(e.target.files?.[0] ?? null)} />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div><label className="muted" style={{ fontSize: 12 }}>COMPOSITION ID</label><input value={composition} onChange={e => setComposition(e.target.value)} placeholder="MyComposition" style={field} /></div>
            <div><label className="muted" style={{ fontSize: 12 }}>OUTPUT CODEC</label><select value={codec} onChange={e => setCodec(e.target.value)} style={field}><option value="h264">H.264 / MP4</option><option value="h265">H.265</option><option value="vp8">VP8 / WebM</option></select></div>
            <div><label className="muted" style={{ fontSize: 12 }}>QUALITY · CRF</label><select value={quality} onChange={e => setQuality(e.target.value)} style={field}><option value="15">15 · Very high</option><option value="18">18 · High</option><option value="23">23 · Balanced</option><option value="28">28 · Compact</option></select></div>
            <div><label className="muted" style={{ fontSize: 12 }}>RENDER ENGINE</label><div style={{ ...field, display: 'flex', alignItems: 'center', gap: 8, color: '#c4f56b' }}><Gauge size={15} /> GitHub Actions</div></div>
          </div>

          <button onClick={startRender} disabled={busy} style={{ width: '100%', padding: 15, marginTop: 22, border: 0, borderRadius: 12, background: busy ? '#82915f' : '#c4f56b', color: '#10120c', fontWeight: 800, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 9, cursor: busy ? 'wait' : 'pointer' }}>
            <Play size={16} />{busy ? 'Working…' : 'Start cloud render'}
          </button>
          <p className="muted" role="status" aria-live="polite" style={{ fontSize: 12, marginBottom: 0 }}>{message}</p>
        </section>

        <aside style={{ display: 'grid', gap: 18, alignContent: 'start' }}>
          <div className="panel" style={{ padding: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 18 }}><Gauge size={17} /><b>Render pipeline</b></div>
            {['Upload source', 'Dispatch workflow', 'Render composition', 'Download artifact'].map((label, i) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '12px 0', borderTop: '1px solid #252831' }}>
                <span className="muted" style={{ fontSize: 12 }}>0{i + 1}</span><span style={{ fontSize: 13 }}>{label}</span><span className="muted" style={{ marginLeft: 'auto' }}>{i === 0 ? <FolderUp size={15} /> : i === 1 ? <Play size={15} /> : i === 2 ? <Film size={15} /> : <CircleCheck size={15} />}</span>
              </div>
            ))}
          </div>
          <div className="panel" style={{ padding: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}><Clock3 size={17} /><b>Recent renders</b></div>
            <div style={{ padding: '18px 0', textAlign: 'center' }}><div style={{ margin: '0 auto 10px', width: 40, height: 40, borderRadius: 12, background: '#1c2027', display: 'grid', placeItems: 'center' }}><Film size={18} className="muted" /></div><b style={{ fontSize: 13 }}>No renders yet</b><p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>Your completed MP4 files will appear here.</p></div>
          </div>
          <div className="muted" style={{ fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}><Settings2 size={14} /> Private source uploads · GitHub Actions rendering.</div>
        </aside>
      </div>

      <footer className="muted" style={{ marginTop: 38, fontSize: 11, display: 'flex', justifyContent: 'space-between' }}><span>R/WORKS RENDER STUDIO · MVP</span><span>Built for creators who ship.</span></footer>
    </main>
  );
}

const field: React.CSSProperties = { width: '100%', marginTop: 8, padding: '12px 13px', borderRadius: 10, border: '1px solid #303540', background: '#171a20', color: '#f5f5f5', outline: 'none' };
