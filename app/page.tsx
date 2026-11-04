'use client';

import { useEffect, useRef, useState } from 'react';
import { upload } from '@vercel/blob/client';
import { Film, FolderUp, Gauge, Play, Clock3, Settings2, CircleCheck, LoaderCircle, CircleX, Download, ExternalLink, RefreshCw } from 'lucide-react';

type RenderJob = {
  requestId: string;
  compositionId: string;
  createdAt: string;
  status: string;
  conclusion?: string | null;
  runId?: number;
  htmlUrl?: string;
  artifactUrl?: string | null;
};

const STORAGE_KEY = 'rworks-render-jobs-v1';

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [composition, setComposition] = useState('');
  const [accessKey, setAccessKey] = useState('');
  const [codec, setCodec] = useState('h264');
  const [quality, setQuality] = useState('18');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Ready to configure a render');
  const [jobs, setJobs] = useState<RenderJob[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [downloading, setDownloading] = useState<number | null>(null);
  const jobsRef = useRef<RenderJob[]>([]);
  jobsRef.current = jobs;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setJobs(JSON.parse(saved) as RenderJob[]);
    } catch { /* Ignore invalid local history. */ }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs.slice(0, 12)));
  }, [jobs, hydrated]);

  useEffect(() => {
    if (!accessKey) return;
    const poll = async () => {
      const active = jobsRef.current.filter(job => !['completed', 'failed', 'cancelled'].includes(job.status));
      for (const job of active) {
        try {
          const response = await fetch(`/api/renders?requestId=${encodeURIComponent(job.requestId)}`, {
            headers: { 'x-render-studio-key': accessKey },
            cache: 'no-store',
          });
          const data = await response.json();
          if (!response.ok) continue;
          setJobs(current => current.map(item => item.requestId === job.requestId ? { ...item, ...data } : item));
        } catch { /* A later poll will retry transient network errors. */ }
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 5000);
    return () => window.clearInterval(timer);
  }, [accessKey]);

  async function startRender() {
    if (!accessKey.trim()) return setMessage('Enter your Render Studio access key first.');
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
        clientPayload: accessKey.trim(),
      });

      const requestId = crypto.randomUUID();
      setMessage('Upload complete. Dispatching GitHub Actions…');
      const response = await fetch('/api/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-render-studio-key': accessKey.trim() },
        body: JSON.stringify({ sourceZipUrl: blob.url, compositionId: composition.trim(), codec, crf: quality, requestId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not start the render.');
      setJobs(current => [{
        requestId,
        compositionId: composition.trim(),
        createdAt: new Date().toISOString(),
        status: 'queued',
      }, ...current].slice(0, 12));
      setMessage('Render queued. This dashboard will update its status automatically.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Something went wrong while starting the render.');
    } finally {
      setBusy(false);
    }
  }

  async function downloadArtifact(runId: number) {
    setDownloading(runId);
    try {
      const response = await fetch(`/api/renders/${runId}/download`, { headers: { 'x-render-studio-key': accessKey } });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Artifact download failed.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `remotion-render-${runId}.zip`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Artifact download failed.');
    } finally {
      setDownloading(null);
    }
  }

  const activeCount = jobs.filter(job => !['completed', 'failed', 'cancelled'].includes(job.status)).length;

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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}><ClapperboardIcon /><b>New render</b><span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>01 / SOURCE</span></div>
          <label className="muted" style={{ fontSize: 12 }}>REMOTION PROJECT (.ZIP)</label>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, border: '1px dashed #424754', borderRadius: 14, padding: 24, margin: '10px 0 22px', cursor: 'pointer', background: '#171a20' }}>
            <FolderUp size={22} className="accent" />
            <span><b style={{ display: 'block', fontSize: 14 }}>{file ? file.name : 'Choose project archive'}</b><small className="muted">ZIP archive · max 250 MB</small></span>
            <input type="file" accept=".zip,application/zip" hidden onChange={e => setFile(e.target.files?.[0] ?? null)} />
          </label>

          <div style={{ marginBottom: 14 }}><label className="muted" style={{ fontSize: 12 }}>WORKSPACE ACCESS KEY</label><input type="password" autoComplete="off" value={accessKey} onChange={e => setAccessKey(e.target.value)} placeholder="Enter the key configured in Vercel" style={field} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div><label className="muted" style={{ fontSize: 12 }}>COMPOSITION ID</label><input value={composition} onChange={e => setComposition(e.target.value)} placeholder="e.g. RWorksPortfolio" style={field} /></div>
            <div><label className="muted" style={{ fontSize: 12 }}>OUTPUT CODEC</label><select value={codec} onChange={e => setCodec(e.target.value)} style={field}><option value="h264">H.264 / MP4</option><option value="h265">H.265</option><option value="vp8">VP8 / WebM</option></select></div>
            <div><label className="muted" style={{ fontSize: 12 }}>QUALITY · CRF</label><select value={quality} onChange={e => setQuality(e.target.value)} style={field}><option value="15">15 · Very high</option><option value="18">18 · High</option><option value="23">23 · Balanced</option><option value="28">28 · Compact</option></select></div>
            <div><label className="muted" style={{ fontSize: 12 }}>RENDER ENGINE</label><div style={{ ...field, display: 'flex', alignItems: 'center', gap: 8, color: '#c4f56b' }}><Gauge size={15} /> GitHub Actions</div></div>
          </div>

          <button onClick={startRender} disabled={busy} style={{ width: '100%', padding: 15, marginTop: 22, border: 0, borderRadius: 12, background: busy ? '#82915f' : '#c4f56b', color: '#10120c', fontWeight: 800, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 9, cursor: busy ? 'wait' : 'pointer' }}>
            {busy ? <LoaderCircle size={16} className="spin" /> : <Play size={16} />}{busy ? 'Working…' : 'Start cloud render'}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}><Clock3 size={17} /><b>Recent renders</b><span className="muted" style={{ marginLeft: 'auto', fontSize: 11 }}>{activeCount ? `${activeCount} active` : `${jobs.length} total`}</span></div>
            {jobs.length === 0 ? (
              <div style={{ padding: '18px 0', textAlign: 'center' }}><Film size={22} className="muted" /><b style={{ display: 'block', fontSize: 13, marginTop: 8 }}>No renders yet</b><p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>Your render jobs will appear here.</p></div>
            ) : jobs.map(job => {
              const failed = job.status === 'completed' && job.conclusion !== 'success' || job.status === 'failed';
              const completed = job.status === 'completed' && job.conclusion === 'success';
              const label = completed ? 'Completed' : failed ? 'Failed' : job.status === 'in_progress' ? 'Rendering' : job.status === 'queued' ? 'Queued' : job.status;
              return <div key={job.requestId} style={{ borderTop: '1px solid #252831', padding: '14px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {completed ? <CircleCheck size={16} className="accent" /> : failed ? <CircleX size={16} color="#ff7777" /> : <LoaderCircle size={16} className="accent spin" />}
                  <b style={{ fontSize: 13 }}>{job.compositionId}</b><span className="muted" style={{ marginLeft: 'auto', fontSize: 11 }}>{label}</span>
                </div>
                <p className="muted" style={{ fontSize: 11, margin: '7px 0' }}>{new Date(job.createdAt).toLocaleString()}</p>
                <div style={{ height: 4, borderRadius: 10, background: '#292d35', overflow: 'hidden', marginBottom: 9 }}><div style={{ height: '100%', width: completed ? '100%' : failed ? '100%' : job.status === 'in_progress' ? '65%' : '12%', background: failed ? '#ff7777' : '#c4f56b', transition: 'width .3s' }} /></div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                  {job.artifactUrl && job.runId && <button onClick={() => void downloadArtifact(job.runId!)} disabled={downloading === job.runId} style={smallButton}>{downloading === job.runId ? 'Preparing…' : <><Download size={13} /> Download artifact (.zip)</>}</button>}
                  {job.htmlUrl && <a href={job.htmlUrl} target="_blank" rel="noreferrer" style={smallLink}>View logs <ExternalLink size={12} /></a>}
                  {failed && <span style={{ color: '#ff9999', fontSize: 11 }}>Check logs for the error.</span>}
                </div>
              </div>;
            })}
            {jobs.length > 0 && <button onClick={() => setJobs([])} style={{ ...smallButton, marginTop: 4, opacity: .7 }}>Clear local history</button>}
          </div>
          <div className="muted" style={{ fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}><Settings2 size={14} /> Private source uploads · GitHub Actions rendering.</div>
        </aside>
      </div>

      <footer className="muted" style={{ marginTop: 38, fontSize: 11, display: 'flex', justifyContent: 'space-between' }}><span>R/WORKS RENDER STUDIO · MVP</span><span>Built for creators who ship.</span></footer>
    </main>
  );
}

function ClapperboardIcon() { return <Film size={18} />; }
const field: React.CSSProperties = { width: '100%', marginTop: 8, padding: '12px 13px', borderRadius: 10, border: '1px solid #303540', background: '#171a20', color: '#f5f5f5', outline: 'none' };
const smallButton: React.CSSProperties = { border: '1px solid #3a414d', background: '#1b2028', color: '#e7e9ed', borderRadius: 8, padding: '7px 9px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' };
const smallLink: React.CSSProperties = { color: '#c4f56b', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 5, textDecoration: 'none' };
