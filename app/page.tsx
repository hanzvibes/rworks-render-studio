'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { upload } from '@vercel/blob/client';
import JSZip from 'jszip';
import {
  Activity, AlertCircle, ArrowDownToLine, ArrowUpRight, Check, CheckCircle2, ChevronDown,
  CircleHelp, Clock3, CloudUpload, ExternalLink, Film, FolderOpen, Gauge, History,
  KeyRound, LoaderCircle, LockKeyhole, Play, Plus, RotateCcw, Settings2, ShieldCheck,
  SlidersHorizontal, Sparkles, X, Zap
} from 'lucide-react';

type Step = { name: string; status: string; conclusion: string | null };
type RenderJob = {
  requestId: string; compositionId: string; createdAt: string; status: string;
  conclusion?: string | null; runId?: number; htmlUrl?: string; artifactUrl?: string | null;
  progress?: number; currentStep?: string; steps?: Step[];
};
type Preset = 'draft' | 'standard' | 'final';
type ProjectInspection = {
  status: 'idle' | 'scanning' | 'ready' | 'warning' | 'error';
  projectName?: string;
  remotionVersion?: string;
  entryPoint?: string;
  lockfile?: string;
  compositions: string[];
  warnings: string[];
  error?: string;
};
const STORAGE_KEY = 'rworks-render-jobs-v1';
const TERMINAL = ['completed', 'failed', 'cancelled'];
const EMPTY_INSPECTION: ProjectInspection = { status: 'idle', compositions: [], warnings: [] };
const MAX_ZIP_ENTRIES = 10000;
const MAX_ZIP_EXPANDED = 2 * 1024 * 1024 * 1024;
const MAX_SOURCE_FILE = 2 * 1024 * 1024;

const PRESETS: Record<Preset, { label: string; description: string; codec: string; crf: string; detail: string }> = {
  draft: { label: 'Draft', description: 'Fast review', codec: 'h264', crf: '28', detail: 'Smaller file · Faster export' },
  standard: { label: 'Standard', description: 'Everyday delivery', codec: 'h264', crf: '18', detail: 'Balanced quality and size' },
  final: { label: 'Final', description: 'High quality', codec: 'h264', crf: '15', detail: 'High visual quality · Larger file' },
};

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [inspection, setInspection] = useState<ProjectInspection>(EMPTY_INSPECTION);
  const [composition, setComposition] = useState('');
  const [accessKey, setAccessKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [preset, setPreset] = useState<Preset>('standard');
  const [codec, setCodec] = useState('h264');
  const [quality, setQuality] = useState('18');
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<'idle' | 'uploading' | 'dispatching'>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'info' | 'error' | 'success'>('info');
  const [jobs, setJobs] = useState<RenderJob[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [downloading, setDownloading] = useState<number | null>(null);
  const [cancelling, setCancelling] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewJobId, setPreviewJobId] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState<number | null>(null);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [sourceUrls, setSourceUrls] = useState<Record<string, string>>({});
  const fileInput = useRef<HTMLInputElement>(null);
  const jobsRef = useRef<RenderJob[]>([]);
  jobsRef.current = jobs;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setJobs(parsed.slice(0, 12));
      }
    } catch { /* Ignore corrupt local history. */ }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs.slice(0, 12)));
  }, [jobs, hydrated]);

  useEffect(() => {
    if (!accessKey.trim()) return;
    let cancelled = false;
    const poll = async () => {
      const active = jobsRef.current.filter(job => !TERMINAL.includes(job.status));
      for (const job of active) {
        try {
          const response = await fetch(`/api/renders?requestId=${encodeURIComponent(job.requestId)}`, {
            headers: { 'x-render-studio-key': accessKey.trim() }, cache: 'no-store',
          });
          const data = await response.json();
          if (!response.ok || cancelled) continue;
          setJobs(current => current.map(item => item.requestId === job.requestId ? { ...item, ...data } : item));
        } catch { /* Retry on the next polling cycle. */ }
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 6000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [accessKey]);

  const activeCount = jobs.filter(job => !TERMINAL.includes(job.status)).length;
  const selectedJob = jobs.find(job => job.requestId === activeJobId) || jobs[0] || null;
  const failedJobs = jobs.filter(job => (job.status === 'completed' && job.conclusion !== 'success') || job.status === 'failed').length;
  const presetInfo = PRESETS[preset];

  async function inspectProject(selectedFile: File) {
    setInspection({ status: 'scanning', compositions: [], warnings: [] });
    setComposition('');
    try {
      const zip = await JSZip.loadAsync(selectedFile, { checkCRC32: false, createFolders: false });
      const entries = Object.values(zip.files).filter(entry => !entry.dir);
      if (entries.length > MAX_ZIP_ENTRIES) throw new Error('ZIP memiliki lebih dari 10.000 file.');
      const expandedSize = entries.reduce((total, entry) => total + ((entry as typeof entry & { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0), 0);
      if (expandedSize > MAX_ZIP_EXPANDED) throw new Error('Ukuran hasil ekstraksi ZIP melebihi batas 2 GB.');

      const packageFiles = entries.filter(entry => /(^|\/)package\.json$/i.test(entry.name));
      if (!packageFiles.length) throw new Error('package.json tidak ditemukan. Pastikan ZIP berisi root project Remotion.');
      const rootPackage = packageFiles.sort((a, b) => a.name.split('/').length - b.name.split('/').length)[0];
      const packageText = await rootPackage.async('text');
      const packageJson = JSON.parse(packageText) as {
        name?: string;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        remotion?: { entryPoint?: string };
      };
      const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
      const remotionVersion = dependencies.remotion;
      if (!remotionVersion) throw new Error('Dependency "remotion" tidak ditemukan di package.json.');

      const rootPrefix = rootPackage.name.slice(0, rootPackage.name.lastIndexOf('/') + 1);
      const lockfile = ['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock']
        .find(name => entries.some(entry => entry.name === rootPrefix + name));
      const sourceEntries = entries.filter(entry =>
        entry.name.startsWith(rootPrefix) &&
        /\.(tsx?|jsx?)$/i.test(entry.name) &&
        !/(^|\/)(node_modules|\.next|dist|build)\//.test(entry.name) &&
        ((entry as typeof entry & { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? MAX_SOURCE_FILE + 1) <= MAX_SOURCE_FILE
      );
      const found = new Set<string>();
      const compositionPattern = /\bid\s*=\s*(?:\{\s*)?(['"`])([A-Za-z0-9_-]{1,120})\1/g;
      for (const entry of sourceEntries.slice(0, 1500)) {
        const source = await entry.async('text');
        let match: RegExpExecArray | null;
        while ((match = compositionPattern.exec(source)) !== null) found.add(match[2]);
        if (found.size >= 100) break;
      }

      const compositions = [...found].sort((a, b) => a.localeCompare(b));
      const warnings: string[] = [];
      if (!lockfile) warnings.push('Lockfile tidak ditemukan. Versi dependency dapat berubah saat render.');
      if (!compositions.length) warnings.push('Composition ID tidak terdeteksi secara statis. Kamu masih bisa memasukkan ID secara manual.');
      if (sourceEntries.length > 1500) warnings.push('Pemindaian dibatasi ke 1.500 file source pertama.');
      const entryPoint = packageJson.remotion?.entryPoint;
      const result: ProjectInspection = {
        status: warnings.length ? 'warning' : 'ready',
        projectName: packageJson.name || rootPackage.name.replace(/(^|\/)package\.json$/, ''),
        remotionVersion,
        entryPoint,
        lockfile,
        compositions,
        warnings,
      };
      setInspection(result);
      if (compositions.length === 1) setComposition(compositions[0]);
      setNotice(compositions.length ? 'Project berhasil diperiksa. Pilih Composition ID yang akan dirender.' : 'Project terbaca, tetapi Composition ID perlu diisi manual.', 'success');
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'ZIP tidak dapat diperiksa.';
      setInspection({ status: 'error', compositions: [], warnings: [], error: reason });
      setNotice(reason, 'error');
    }
  }

  function setNotice(text: string, type: 'info' | 'error' | 'success' = 'info') {
    setMessage(text);
    setMessageType(type);
  }

  function choosePreset(value: Preset) {
    setPreset(value);
    setCodec(PRESETS[value].codec);
    setQuality(PRESETS[value].crf);
    setAdvanced(false);
  }

  async function dispatchRender(sourceZipUrl: string, requestId: string, compositionId: string, selectedCodec = codec, selectedQuality = quality) {
    const response = await fetch('/api/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-render-studio-key': accessKey.trim() },
      body: JSON.stringify({ sourceZipUrl, compositionId, codec: selectedCodec, crf: selectedQuality, requestId }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not start the render.');
  }

  async function startRender() {
    if (!accessKey.trim()) return setNotice('Masukkan workspace access key terlebih dahulu.', 'error');
    if (!file) return setNotice('Pilih file ZIP project Remotion terlebih dahulu.', 'error');
    if (!file.name.toLowerCase().endsWith('.zip')) return setNotice('File harus berupa arsip ZIP.', 'error');
    if (file.size > 250 * 1024 * 1024) return setNotice('Ukuran ZIP maksimal 250 MB.', 'error');
    if (!composition.trim()) return setNotice('Isi Composition ID project Remotion.', 'error');

    setBusy(true);
    try {
      setStage('uploading');
      setUploadProgress(0);
      setNotice('Mengunggah project ke private storage…');
      const blob = await upload(file.name, file, {
        access: 'private',
        handleUploadUrl: '/api/upload',
        clientPayload: accessKey.trim(),
        // Vercel recommends multipart uploads for files larger than 100 MB.
        multipart: file.size > 100 * 1024 * 1024,
        onUploadProgress: ({ percentage }) => setUploadProgress(Math.round(percentage)),
      });
      const requestId = crypto.randomUUID();
      setSourceUrls(current => ({ ...current, [requestId]: blob.url }));
      setStage('dispatching');
      setNotice('Upload selesai. Menyiapkan cloud render…');
      await dispatchRender(blob.url, requestId, composition.trim());
      const job: RenderJob = {
        requestId, compositionId: composition.trim(), createdAt: new Date().toISOString(), status: 'queued',
      };
      setJobs(current => [job, ...current].slice(0, 12));
      setActiveJobId(requestId);
      setFile(null);
      if (fileInput.current) fileInput.current.value = ''; setInspection(EMPTY_INSPECTION);
      setNotice('Render masuk antrean. Status akan diperbarui otomatis.', 'success');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Terjadi kesalahan saat memulai render.', 'error');
    } finally {
      setBusy(false);
      setStage('idle');
      setUploadProgress(0);
    }
  }

  async function cancelRender(job: RenderJob) {
    if (!job.runId) return setNotice('Workflow belum terdaftar di GitHub Actions. Coba lagi sebentar.', 'info');
    if (!window.confirm('Batalkan render ini? Proses yang sedang berjalan akan dihentikan.')) return;
    setCancelling(job.runId);
    try {
      const response = await fetch(`/api/renders/${job.runId}/cancel`, { method: 'POST', headers: { 'x-render-studio-key': accessKey.trim() } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Tidak bisa membatalkan render.');
      setNotice('Permintaan pembatalan dikirim. Status akan diperbarui otomatis.', 'success');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Tidak bisa membatalkan render.', 'error'); }
    finally { setCancelling(null); }
  }
  async function retryRender(job: RenderJob) {
    const sourceUrl = sourceUrls[job.requestId];
    if (!sourceUrl) return setNotice('Sumber ZIP tidak tersedia di sesi ini. Upload ulang project untuk menjalankan render baru.', 'error');
    const requestId = crypto.randomUUID();
    setBusy(true);
    try {
      await dispatchRender(sourceUrl, requestId, job.compositionId);
      const retry: RenderJob = { requestId, compositionId: job.compositionId, createdAt: new Date().toISOString(), status: 'queued' };
      setJobs(current => [retry, ...current].slice(0, 12));
      setSourceUrls(current => ({ ...current, [requestId]: sourceUrl }));
      setActiveJobId(requestId);
      setNotice('Render ulang berhasil masuk antrean.', 'success');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Tidak bisa mengulang render.', 'error');
    } finally { setBusy(false); }
  }

  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  async function fetchRenderedVideo(runId: number) {
    const response = await fetch(`/api/renders/${runId}/file`, {
      headers: { 'x-render-studio-key': accessKey.trim() },
      cache: 'no-store',
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'File video belum tersedia.');
    }
    return { blob: await response.blob(), filename: response.headers.get('x-render-filename') || `rworks-render-${runId}.mp4` };
  }

  async function previewRender(runId: number) {
    setPreviewLoading(runId);
    try {
      const { blob } = await fetchRenderedVideo(runId);
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      setPreviewJobId(runId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Preview tidak dapat dimuat.', 'error');
    } finally { setPreviewLoading(null); }
  }

  async function downloadArtifact(runId: number) {
    setDownloading(runId);
    try {
      const response = await fetch(`/api/renders/${runId}/file?mode=archive`, {
        headers: { 'x-render-studio-key': accessKey.trim() },
        cache: 'no-store',
      });
      const result = await response.json();
      if (!response.ok || !result.downloadUrl) throw new Error(result.error || 'Download artifact gagal disiapkan.');
      // The signed GitHub URL is short-lived. Navigate directly so large files bypass
      // the Vercel Function response-size limit.
      const anchor = document.createElement('a');
      anchor.href = result.downloadUrl;
      anchor.target = '_blank';
      anchor.rel = 'noreferrer';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setNotice('Paket render sedang diunduh. Ekstrak ZIP untuk mengambil file MP4/WebM.', 'success');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Download video gagal.', 'error');
    } finally { setDownloading(null); }
  }

  function clearHistory() {
    setJobs([]);
    setActiveJobId(null);
    setNotice('Riwayat lokal dibersihkan.', 'success');
  }

  const progress = selectedJob?.progress ?? (selectedJob?.status === 'completed' && selectedJob?.conclusion === 'success' ? 100 : 0);
  const completed = selectedJob?.status === 'completed' && selectedJob?.conclusion === 'success';
  const failed = Boolean(selectedJob && ((selectedJob.status === 'completed' && selectedJob.conclusion !== 'success') || selectedJob.status === 'failed'));
  const running = Boolean(selectedJob && !TERMINAL.includes(selectedJob.status));

  return (
    <main className="studio-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="R Works Render Studio home">
          <span className="brand-mark">R/</span><span><b>R/WORKS</b><small>RENDER STUDIO</small></span>
        </a>
        <div className="topbar-right"><span className="status-dot" /> <span>Cloud workspace</span><span className="topbar-divider" /><span className="private-label"><LockKeyhole size={13}/> Private</span></div>
      </header>

      <section className="hero">
        <div className="eyebrow"><span className="eyebrow-line"/> REMOTION CLOUD RENDERING</div>
        <div className="hero-row">
          <div><h1>Your timeline.<br/><span>Rendered in the cloud.</span></h1><p>From project archive to finished video. One simple workspace.</p></div>
          <div className="hero-orbit" aria-hidden="true"><div className="orbit-ring"/><div className="orbit-core"><Film size={25}/></div><span className="orbit-dot"/></div>
        </div>
      </section>

      <section className="workspace-grid">
        <div className="panel create-panel">
          <div className="panel-heading"><div><span className="section-index">01</span><div><h2>New render</h2><p>Set up your next export</p></div></div><span className="heading-icon"><Sparkles size={17}/></span></div>

          <div className="form-section">
            <div className="field-heading"><label htmlFor="project-file">PROJECT ARCHIVE</label><span>ZIP · MAX 250 MB</span></div>
            <input ref={fileInput} id="project-file" type="file" accept=".zip,application/zip" className="visually-hidden" onChange={event => {
              const next = event.target.files?.[0] ?? null;
              setFile(next);
              setInspection(EMPTY_INSPECTION);
              if (next && next.size > 250 * 1024 * 1024) setNotice('Ukuran ZIP maksimal 250 MB.', 'error');
              else if (next) void inspectProject(next);
            }}/>
            <button type="button" className={`dropzone ${file ? 'has-file' : ''}`} onClick={() => fileInput.current?.click()} onDragOver={event => event.preventDefault()} onDrop={event => {
              event.preventDefault();
              const dropped = event.dataTransfer.files?.[0];
              if (!dropped) return;
              if (!dropped.name.toLowerCase().endsWith('.zip') || dropped.size > 250 * 1024 * 1024) return setNotice('Pilih ZIP yang valid dengan ukuran maksimal 250 MB.', 'error');
              setFile(dropped); setInspection(EMPTY_INSPECTION); void inspectProject(dropped);
            }}>
              <span className="drop-icon">{file ? <FolderOpen size={22}/> : <CloudUpload size={23}/>}</span>
              <span className="drop-copy"><b>{file ? file.name : 'Drop your Remotion project'}</b><small>{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB · Ready to upload` : 'or browse files from your device'}</small></span>
              {file ? <span className="file-clear" onClick={event => { event.stopPropagation(); setFile(null); if(fileInput.current) fileInput.current.value=''; }}><X size={16}/></span> : <span className="browse-link">Browse <ArrowUpRight size={13}/></span>}
            </button>
          </div>

          <div className="form-section">
            <div className="field-heading"><label htmlFor="composition">COMPOSITION</label><span>{inspection.status === 'scanning' ? 'SCANNING PROJECT' : inspection.compositions.length ? inspection.compositions.length + ' FOUND' : 'REMOTION ID'}</span></div>
            {inspection.status === 'scanning' ? <div className="inspector-card scanning"><LoaderCircle size={16} className="spin"/><div><b>Inspecting project archive</b><small>Reading package metadata and source files…</small></div></div> :
              inspection.compositions.length > 0 ? <select id="composition" className="text-input" value={composition} onChange={event => setComposition(event.target.value)}>
                <option value="">Select a composition</option>
                {inspection.compositions.map(id => <option key={id} value={id}>{id}</option>)}
              </select> :
              <input id="composition" className="text-input" value={composition} onChange={event => setComposition(event.target.value)} placeholder="e.g. RWorksPortfolio" autoComplete="off"/>}
            {inspection.status === 'ready' || inspection.status === 'warning' ? <div className="inspector-card">
              <span className="inspector-status"><CheckCircle2 size={15}/></span><div className="inspector-content">
                <b>{inspection.projectName || 'Remotion project detected'}</b>
                <small>Remotion {inspection.remotionVersion}{inspection.lockfile ? ' · ' + inspection.lockfile : ' · No lockfile'}</small>
                {inspection.entryPoint && <small>Entry: {inspection.entryPoint}</small>}
                {inspection.warnings.map(warning => <small className="inspector-warning" key={warning}>{warning}</small>)}
              </div>
            </div> : inspection.status === 'error' ? <p className="field-hint inspector-error"><AlertCircle size={13}/>{inspection.error}</p> :
              <p className="field-hint"><CircleHelp size={13}/> Choose a ZIP to scan compositions automatically. You can still enter an ID manually.</p>}
          </div>

          <div className="form-section">
            <div className="field-heading"><label>EXPORT PRESET</label><span>CHOOSE QUALITY</span></div>
            <div className="preset-grid">
              {(Object.keys(PRESETS) as Preset[]).map(key => {
                const item = PRESETS[key];
                const Icon = key === 'draft' ? Zap : key === 'standard' ? SlidersHorizontal : Sparkles;
                return <button type="button" key={key} className={`preset-card ${preset === key ? 'selected' : ''}`} onClick={() => choosePreset(key)} aria-pressed={preset === key}>
                  <span className="preset-icon"><Icon size={16}/></span><b>{item.label}</b><small>{item.description}</small>{preset === key && <Check size={14} className="preset-check"/>}
                </button>;
              })}
            </div>
            <p className="preset-description">{presetInfo.detail}</p>
          </div>

          <div className="advanced-wrap">
            <button type="button" className="advanced-toggle" onClick={() => setAdvanced(value => !value)} aria-expanded={advanced}><Settings2 size={15}/> Advanced settings <ChevronDown size={15} className={advanced ? 'rotate' : ''}/></button>
            {advanced && <div className="advanced-fields">
              <div><label htmlFor="codec">OUTPUT CODEC</label><select id="codec" className="text-input" value={codec} onChange={event => setCodec(event.target.value)}><option value="h264">H.264 / MP4</option><option value="h265">H.265</option><option value="vp8">VP8 / WebM</option></select></div>
              <div><label htmlFor="quality">QUALITY (CRF)</label><select id="quality" className="text-input" value={quality} onChange={event => setQuality(event.target.value)}><option value="15">15 · Very high</option><option value="18">18 · High</option><option value="23">23 · Balanced</option><option value="28">28 · Compact</option></select></div>
            </div>}
          </div>

          <div className="form-section key-section">
            <div className="field-heading"><label htmlFor="access-key">WORKSPACE ACCESS KEY</label><span><ShieldCheck size={12}/> STORED IN THIS SESSION ONLY</span></div>
            <div className="key-input-wrap"><KeyRound size={15}/><input id="access-key" type={showKey ? 'text' : 'password'} value={accessKey} onChange={event => setAccessKey(event.target.value)} placeholder="Enter your workspace key" autoComplete="off"/><button type="button" onClick={() => setShowKey(value => !value)}>{showKey ? 'Hide' : 'Show'}</button></div>
          </div>

          <button type="button" className="render-button" onClick={() => void startRender()} disabled={busy || !file || inspection.status === 'scanning' || !composition.trim() || !accessKey.trim()}>
            {busy ? <><LoaderCircle size={17} className="spin"/>{stage === 'uploading' ? `Uploading ${uploadProgress}%…` : 'Starting cloud render…'}</> : <><Play size={16} fill="currentColor"/> Render project <ArrowUpRight size={16}/></>}
          </button>
          {stage === 'uploading' && <div className="upload-progress" role="status" aria-live="polite"><div className="upload-progress-meta"><span>Uploading project to private storage</span><b>{uploadProgress}%</b></div><div className="upload-progress-track"><div className="upload-progress-fill" style={{ width: `${uploadProgress}%` }}/></div><small>{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB · ` : ''}Large archives use multipart transfer.</small></div>}
          <p className="secure-note"><LockKeyhole size={12}/> Source uploads use private storage. Your access key is not saved to render history.</p>
          {message && <div className={`notice ${messageType}`} role="status" aria-live="polite">{messageType === 'error' ? <AlertCircle size={15}/> : messageType === 'success' ? <CheckCircle2 size={15}/> : <Activity size={15}/>}<span>{message}</span></div>}
        </div>

        <aside className="right-column">
          <section className="panel activity-panel">
            <div className="panel-heading"><div><span className="section-index">02</span><div><h2>Render activity</h2><p>Track your cloud jobs</p></div></div><span className="live-indicator"><i/> LIVE</span></div>
            <div className="stats-row"><div><strong>{jobs.length}</strong><span>Total renders</span></div><div><strong>{activeCount}</strong><span>In progress</span></div><div><strong>{failedJobs}</strong><span>Needs attention</span></div></div>
            {selectedJob ? <div className="active-render">
              <div className="render-title-row"><div><span className="render-overline">SELECTED RENDER</span><b>{selectedJob.compositionId}</b></div><span className={`state-pill ${completed ? 'success' : failed ? 'error' : 'working'}`}>{completed ? 'Completed' : failed ? 'Failed' : selectedJob.status === 'queued' ? 'Queued' : 'Rendering'}</span></div>
              <div className="progress-meta"><span>{selectedJob.currentStep || (completed ? 'Render finished' : failed ? 'Render needs attention' : 'Waiting for runner')}</span><b>{progress}%</b></div>
              <div className="progress-track"><div className="progress-fill" style={{width:`${progress}%`}}/></div>
              <div className="timeline">
                {(selectedJob.steps?.length ? selectedJob.steps : [{name:'Waiting for GitHub Actions',status:'queued',conclusion:null}]).map((step,index) => {
                  const done=step.status==='completed'&&step.conclusion==='success';
                  const isFailed=step.status==='completed'&&step.conclusion==='failure';
                  const isRunning=step.status==='in_progress';
                  const expanded=expandedStep===step.name;
                  return <div className="timeline-item" key={step.name}>
                    <button type="button" className="timeline-step" onClick={()=>setExpandedStep(expanded?null:step.name)} aria-expanded={expanded}>
                      <span className={`timeline-node ${done?'done':isFailed?'failed':isRunning?'running':''}`}>{done?<Check size={13}/>:isFailed?<X size={13}/>:isRunning?<LoaderCircle size={13} className="spin"/>:String(index+1).padStart(2,'0')}</span>
                      <span className="timeline-label"><b>{step.name}</b><small>{done?'Completed':isFailed?'Failed':isRunning?'In progress':'Waiting'}</small></span><ChevronDown size={14} className={expanded?'rotate':''}/>
                    </button>
                    {expanded&&<p className="timeline-detail">{done?'This step completed successfully.':isFailed?'This step failed. Open workflow logs to inspect the error.':isRunning?'GitHub Actions is executing this step. Status refreshes automatically.':'This step has not started yet.'}</p>}
                  </div>;
                })}
              </div>
              <div className="activity-foot"><span><Clock3 size={12}/> Updated automatically every 6 seconds</span>{selectedJob.htmlUrl&&<a href={selectedJob.htmlUrl} target="_blank" rel="noreferrer">Workflow logs <ExternalLink size={12}/></a>}</div>
              {running&&selectedJob.runId&&<div className="success-helper"><AlertCircle size={15}/><div><b>Render sedang berjalan</b><small>Batalkan untuk menghentikan antrean atau proses render.</small></div><button type="button" onClick={()=>void cancelRender(selectedJob)} disabled={cancelling===selectedJob.runId}>{cancelling===selectedJob.runId?<LoaderCircle size={14} className="spin"/>:<X size={14}/>} Cancel render</button></div>}
              {failed&&<div className="error-helper"><AlertCircle size={15}/><div><b>Render did not finish</b><p>Open workflow logs to see the exact error. If the source ZIP is still available in this session, you can retry.</p></div>{sourceUrls[selectedJob.requestId]&&<button type="button" onClick={()=>void retryRender(selectedJob)} disabled={busy}><RotateCcw size={13}/> Retry</button>}</div>}
              {completed&&selectedJob.runId&&<div className="success-helper"><CheckCircle2 size={16}/><div><b>Your video is ready</b><small>Preview or download the rendered video directly.</small></div><button type="button" onClick={()=>void previewRender(selectedJob.runId!)} disabled={previewLoading===selectedJob.runId}>{previewLoading===selectedJob.runId?<LoaderCircle size={14} className="spin"/>:<Play size={14}/>} Preview</button><button type="button" onClick={()=>void downloadArtifact(selectedJob.runId!)} disabled={downloading===selectedJob.runId}>{downloading===selectedJob.runId?<LoaderCircle size={14} className="spin"/>:<ArrowDownToLine size={14}/>} Download video (.zip)</button></div>}{previewJobId===selectedJob.runId&&previewUrl&&<div className="video-preview"><video controls playsInline preload="metadata" src={previewUrl}/><div className="video-preview-caption"><Film size={13}/> Render preview · {selectedJob.compositionId}</div></div>}
            </div> : <div className="empty-state"><span><Film size={23}/></span><b>Your next render starts here</b><p>Upload a Remotion project to see live progress, workflow steps and finished outputs.</p></div>}
          </section>

          <section className="panel history-panel">
            <div className="panel-heading compact"><div><span className="heading-icon"><History size={16}/></span><div><h2>Recent renders</h2><p>Saved in this browser</p></div></div>{jobs.length>0&&<button type="button" className="text-action" onClick={clearHistory}>Clear</button>}</div>
            {jobs.length===0 ? <div className="history-empty">No render history yet.</div> : <div className="job-list">{jobs.map(job=>{
              const isDone=job.status==='completed'&&job.conclusion==='success';
              const isFailed=(job.status==='completed'&&job.conclusion!=='success')||job.status==='failed';
              const isSelected=selectedJob?.requestId===job.requestId;
              return <button type="button" className={`job-row ${isSelected?'selected':''}`} key={job.requestId} onClick={()=>setActiveJobId(job.requestId)}>
                <span className={`job-icon ${isDone?'done':isFailed?'failed':'pending'}`}>{isDone?<Check size={15}/>:isFailed?<AlertCircle size={15}/>:<LoaderCircle size={15} className="spin"/>}</span>
                <span className="job-info"><b>{job.compositionId}</b><small>{new Date(job.createdAt).toLocaleString()}</small></span>
                <span className="job-status">{isDone?'Ready':isFailed?'Failed':job.status==='queued'?'Queued':'Running'}</span>
              </button>;
            })}</div>}
            <div className="history-note"><LockKeyhole size={12}/> History stays in this browser. It is not synced across devices.</div>
          </section>
          <div className="engine-note"><Gauge size={15}/><span>Powered by GitHub Actions</span><span className="engine-divider"/> <span>Private source storage</span></div>
        </aside>
      </section>

      <footer className="footer"><span>R/WORKS RENDER STUDIO</span><span>Built for creators who ship.</span></footer>
    </main>
  );
}
