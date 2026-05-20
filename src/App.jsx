import { useState, useRef, useEffect, useCallback } from 'react';

const DEFAULT_API = localStorage.getItem('bioscan_api') || '';

const MODES = [
  { id: 'plant',    label: 'Plant',    icon: '🌿', color: '#22c55e' },
  { id: 'insect',   label: 'Insect',   icon: '🐛', color: '#f59e0b' },
  { id: 'bird',     label: 'Bird',     icon: '🐦', color: '#3b82f6' },
  { id: 'mushroom', label: 'Mushroom', icon: '🍄', color: '#8b5cf6' },
  { id: 'reptile',  label: 'Reptile',  icon: '🦎', color: '#ef4444' },
  { id: 'marine',   label: 'Marine',   icon: '🐠', color: '#06b6d4' },
  { id: 'survival', label: 'Survival', icon: '⚠️', color: '#f97316' },
];

// ── Logo SVG ──────────────────────────────────────────────────
function BioScanLogo({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" rx="22" fill="#0a1628"/>
      {/* Corner brackets */}
      <path d="M14 28 L14 14 L28 14" stroke="#06b6d4" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M86 28 L86 14 L72 14" stroke="#06b6d4" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M14 72 L14 86 L28 86" stroke="#06b6d4" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M86 72 L86 86 L72 86" stroke="#06b6d4" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
      {/* Leaf */}
      <path d="M50 30 C36 38 30 52 38 62 C43 68 57 68 62 62 C70 52 64 38 50 30Z" fill="#06b6d4" opacity="0.9"/>
      {/* Leaf vein */}
      <line x1="50" y1="30" x2="50" y2="68" stroke="#0a1628" strokeWidth="2.5" opacity="0.7"/>
      {/* Scan line accent */}
      <line x1="20" y1="50" x2="34" y2="50" stroke="#06b6d4" strokeWidth="2" opacity="0.5"/>
      <line x1="66" y1="50" x2="80" y2="50" stroke="#06b6d4" strokeWidth="2" opacity="0.5"/>
    </svg>
  );
}

// ── Shared UI ─────────────────────────────────────────────────
function Card({ children, className = '' }) {
  return (
    <div className={`bg-[#0d1a27] border border-cyan-900/30 rounded-2xl ${className}`}>
      {children}
    </div>
  );
}

function CyanBtn({ children, onClick, disabled, className = '', variant = 'primary' }) {
  const base = 'flex items-center justify-center gap-2 rounded-xl font-semibold transition-all active:scale-95 disabled:opacity-40';
  const styles = {
    primary: 'bg-cyan-500 text-black px-5 py-3',
    outline: 'border border-cyan-500/50 text-cyan-400 px-5 py-3',
    ghost:   'text-cyan-400 px-4 py-2',
    danger:  'bg-red-500 text-white px-5 py-3',
  };
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${styles[variant]} ${className}`}>
      {children}
    </button>
  );
}

function DangerBadge({ level }) {
  if (level == null) return null;
  const n = Number(level);
  const color = n >= 7 ? '#ef4444' : n >= 4 ? '#f59e0b' : '#22c55e';
  const label = n >= 7 ? 'HIGH RISK' : n >= 4 ? 'MODERATE' : 'SAFE';
  return (
    <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: color + '22', color }}>
      {label} {n}/10
    </span>
  );
}

// ── Scan Page ─────────────────────────────────────────────────
function ScanPage({ apiUrl, onSave }) {
  const fileRef   = useRef(null);
  const videoRef  = useRef(null);
  const [mode, setMode]       = useState('plant');
  const [preview, setPreview] = useState(null);
  const [file, setFile]       = useState(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [stream, setStream]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState(null);
  const [error, setError]     = useState('');
  const [burst, setBurst]     = useState(false);

  const pickFile = e => {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f); setResult(null); setError('');
    const reader = new FileReader();
    reader.onload = ev => setPreview(ev.target.result);
    reader.readAsDataURL(f);
  };

  const openCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      setStream(s); setCameraOn(true);
      setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = s; }, 80);
    } catch { setError('Camera access denied — use file upload instead.'); }
  };

  const capture = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width  = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext('2d').drawImage(videoRef.current, 0, 0);
    canvas.toBlob(blob => {
      const f = new File([blob], 'capture.jpg', { type: 'image/jpeg' });
      setFile(f); setPreview(canvas.toDataURL());
      stream?.getTracks().forEach(t => t.stop());
      setStream(null); setCameraOn(false); setResult(null);
    }, 'image/jpeg', 0.85);
  };

  const closeCamera = () => {
    stream?.getTracks().forEach(t => t.stop());
    setStream(null); setCameraOn(false);
  };

  const analyze = async () => {
    if (!file) return;
    if (!apiUrl) { setError('Set your backend URL in Settings first.'); return; }
    setLoading(true); setError(''); setResult(null);
    const fd = new FormData();
    fd.append('photo', file);
    fd.append('mode', mode);
    try {
      const r = await fetch(`${apiUrl}/api/scans`, { method: 'POST', body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Analysis failed');
      setResult(d);
      setBurst(true);
      setTimeout(() => setBurst(false), 1800);
      onSave({ ...d, mode, preview, ts: Date.now() });
    } catch (e) {
      setError(e.message);
    } finally { setLoading(false); }
  };

  const reset = () => { setFile(null); setPreview(null); setResult(null); setError(''); };

  const modeObj = MODES.find(m => m.id === mode);

  return (
    <div className="flex flex-col h-full pb-20">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-5 pb-3">
        <div className="flex items-center gap-2">
          <BioScanLogo size={32} />
          <span className="text-lg font-black text-white tracking-tight">Bio<span className="text-cyan-400">Scan</span></span>
        </div>
        <span className="text-xs text-cyan-400/70 font-medium uppercase tracking-widest">Field Scanner</span>
      </div>

      {/* Mode selector — horizontal scroll */}
      <div className="flex gap-2 px-4 pb-3 overflow-x-auto scrollbar-hide">
        {MODES.map(m => (
          <button key={m.id} onClick={() => setMode(m.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap shrink-0 border transition-all ${mode === m.id ? 'text-black border-transparent' : 'border-cyan-900/40 text-slate-400 bg-transparent'}`}
            style={mode === m.id ? { background: m.color, borderColor: m.color } : {}}>
            {m.icon} {m.label}
          </button>
        ))}
      </div>

      {/* Camera / Upload area */}
      <div className="px-4 flex-1">
        {cameraOn ? (
          <div className="relative rounded-2xl overflow-hidden bg-black" style={{ height: '52vw', maxHeight: 280 }}>
            <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
            {/* Scanner overlay */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute inset-4 border-2 border-cyan-400/30 rounded-xl" />
              <div className="absolute left-4 right-4" style={{
                height: 2,
                background: 'linear-gradient(90deg, transparent, #06b6d4, transparent)',
                animation: 'scanLine 2s ease-in-out infinite alternate',
              }} />
            </div>
            <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-3">
              <CyanBtn onClick={capture} className="text-sm">📸 Capture</CyanBtn>
              <CyanBtn onClick={closeCamera} variant="outline" className="text-sm">✕ Cancel</CyanBtn>
            </div>
          </div>
        ) : preview ? (
          <div className="relative rounded-2xl overflow-hidden" style={{ height: '52vw', maxHeight: 280 }}>
            <img src={preview} alt="Preview" className="w-full h-full object-cover" />
            <button onClick={reset}
              className="absolute top-2 right-2 w-8 h-8 bg-black/60 rounded-full flex items-center justify-center text-white text-sm">✕</button>
          </div>
        ) : (
          <button onClick={openCamera}
            className="w-full flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-cyan-900/50 bg-[#0d1a27] relative"
            style={{ height: '52vw', maxHeight: 280 }}>
            {/* Pulsing rings */}
            <div className="relative">
              {[1,2,3].map(i => (
                <div key={i} className="absolute rounded-full border border-cyan-500/20"
                  style={{ inset: -(i*20), animation: `pulseRing ${1.5 + i*0.3}s ease-out ${i*0.4}s infinite` }} />
              ))}
              <div className="w-20 h-20 rounded-full bg-cyan-500/10 border-2 border-cyan-500/40 flex items-center justify-center text-3xl">
                {modeObj?.icon}
              </div>
            </div>
            <p className="mt-6 text-sm text-slate-500">Tap to open camera</p>
            <p className="text-xs text-slate-600 mt-1">or use file upload below</p>
          </button>
        )}

        {/* Action buttons */}
        {!cameraOn && (
          <div className="flex gap-2 mt-3">
            <CyanBtn onClick={() => fileRef.current?.click()} variant="outline" className="flex-1 text-sm">
              📁 Upload Photo
            </CyanBtn>
            {!cameraOn && !preview && (
              <CyanBtn onClick={openCamera} className="flex-1 text-sm">
                📷 Camera
              </CyanBtn>
            )}
            {file && (
              <CyanBtn onClick={analyze} disabled={loading} className="flex-1 text-sm">
                {loading ? '⟳ Scanning…' : '🔬 Identify'}
              </CyanBtn>
            )}
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickFile} />

        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

        {/* Loading */}
        {loading && (
          <Card className="mt-4 p-6 text-center">
            <div className="text-5xl animate-bounce mb-3">{modeObj?.icon}</div>
            <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-400">AI identification in progress…</p>
            <p className="text-xs text-slate-600 mt-1">Gemini → GPT-4o → Claude</p>
          </Card>
        )}

        {/* Burst celebration */}
        {burst && (
          <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center">
            <div className="relative">
              {Array.from({ length: 8 }, (_, i) => {
                const angle = (i * 360) / 8;
                const rad = (angle * Math.PI) / 180;
                return (
                  <div key={i} className="absolute text-2xl" style={{
                    top: 0, left: 0,
                    '--tx': `${Math.cos(rad) * 80}px`,
                    '--ty': `${Math.sin(rad) * 80}px`,
                    '--rot': `${i * 45}deg`,
                    animation: `resultBurst 1.3s ease-out ${i * 0.07}s forwards`,
                  }}>
                    {modeObj?.icon}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Result */}
        {result && !loading && <ScanResult result={result} mode={mode} />}
      </div>
    </div>
  );
}

function ScanResult({ result, mode }) {
  const a = result.result || result.result_json || result.identification || result;
  const modeObj = MODES.find(m => m.id === mode);
  return (
    <Card className="mt-4 overflow-hidden result-enter">
      {(result.url || result.image_url) && (
        <img src={result.url || result.image_url} alt={a.common_name} className="w-full h-40 object-cover" />
      )}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <h3 className="text-lg font-extrabold text-white">{a.common_name || 'Unknown Organism'}</h3>
            {a.scientific_name && <p className="text-xs italic text-slate-500">{a.scientific_name}</p>}
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {a.confidence != null && (
              <span className="text-xs font-bold text-cyan-400">
                {a.confidence > 1 ? Math.round(a.confidence) : Math.round(a.confidence * 100)}% match
              </span>
            )}
            <DangerBadge level={a.danger_level} />
          </div>
        </div>

        {a.safety_warning && (
          <div className="mb-3 p-2 bg-red-950/60 border border-red-700/40 rounded-xl text-xs text-red-300">
            ⚠️ {a.safety_warning}
          </div>
        )}

        {a.description && <p className="text-sm text-slate-300 leading-relaxed mb-3">{a.description}</p>}

        <div className="grid grid-cols-2 gap-2 text-xs">
          {a.edibility && <InfoChip label="Edibility" value={a.edibility} />}
          {a.habitat && <InfoChip label="Habitat" value={a.habitat} />}
          {a.toxicity && <InfoChip label="Toxicity" value={a.toxicity} color="red" />}
          {a.distribution && <InfoChip label="Range" value={a.distribution} />}
        </div>

        {a.survival_uses && (
          <div className="mt-3">
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Survival Uses</p>
            <p className="text-sm text-slate-300">{a.survival_uses}</p>
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <a href={`https://www.google.com/search?q=${encodeURIComponent((a.common_name || '') + ' ' + (a.scientific_name || ''))}`}
            target="_blank" rel="noreferrer"
            className="flex-1 text-center text-xs text-cyan-400 border border-cyan-900/40 rounded-lg py-2 hover:bg-cyan-950/30">
            🔍 Google
          </a>
          <a href={`https://en.wikipedia.org/wiki/${encodeURIComponent(a.scientific_name || a.common_name || '')}`}
            target="_blank" rel="noreferrer"
            className="flex-1 text-center text-xs text-cyan-400 border border-cyan-900/40 rounded-lg py-2 hover:bg-cyan-950/30">
            📖 Wikipedia
          </a>
        </div>
      </div>
    </Card>
  );
}

function InfoChip({ label, value, color = 'slate' }) {
  return (
    <div className="bg-[#0a1422] rounded-xl p-2">
      <p className="text-slate-500 uppercase tracking-wide mb-0.5" style={{ fontSize: 10 }}>{label}</p>
      <p className={`text-${color}-300 line-clamp-2`}>{value}</p>
    </div>
  );
}

// ── Field Log Page ────────────────────────────────────────────
function FieldLogPage({ history }) {
  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center px-8">
        <div className="text-5xl mb-4">📋</div>
        <p className="text-slate-400 font-medium">No scans yet</p>
        <p className="text-slate-600 text-sm mt-1">Your field scans will appear here</p>
      </div>
    );
  }

  return (
    <div className="px-4 pt-5 pb-24">
      <h2 className="text-xl font-extrabold text-white mb-4">Field Log</h2>
      <div className="space-y-3">
        {history.map((item, i) => {
          const a = item.result || item.result_json || item.identification || item;
          const modeObj = MODES.find(m => m.id === item.mode);
          return (
            <Card key={item.id || i} className="flex gap-3 p-3 overflow-hidden">
              {item.preview ? (
                <img src={item.preview} alt="" className="w-16 h-16 rounded-xl object-cover shrink-0" />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-[#0a1422] flex items-center justify-center text-2xl shrink-0">
                  {modeObj?.icon}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">{a.common_name || 'Unknown'}</p>
                {a.scientific_name && <p className="text-xs italic text-slate-500 truncate">{a.scientific_name}</p>}
                <div className="flex items-center gap-2 mt-1">
                  {modeObj && (
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: modeObj.color + '22', color: modeObj.color }}>
                      {modeObj.icon} {modeObj.label}
                    </span>
                  )}
                  <span className="text-xs text-slate-600">
                    {item.ts ? new Date(item.ts).toLocaleDateString() : ''}
                  </span>
                </div>
                <DangerBadge level={a.danger_level} />
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ── SOS Page ──────────────────────────────────────────────────
function SOSPage({ apiUrl }) {
  const fileRef = useRef(null);
  const [imageData, setImageData] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [result, setResult]     = useState(null);
  const [gps, setGps]           = useState(null);
  const [error, setError]       = useState('');

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      p => setGps({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { enableHighAccuracy: true }
    );
  }, []);

  const pickImage = e => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = ev => setImageData(ev.target.result);
    reader.readAsDataURL(f);
  };

  const scan = async () => {
    if (!imageData) return;
    if (!apiUrl) { setError('Set backend URL in Settings.'); return; }
    setScanning(true); setError(''); setResult(null);
    try {
      const r = await fetch(`${apiUrl}/api/sos/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageData, lat: gps?.lat, lng: gps?.lng }),
        signal: AbortSignal.timeout(30000),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'SOS scan failed');
      setResult(d);
    } catch (e) { setError(e.message); }
    finally { setScanning(false); }
  };

  const DIAL = ['911','112','999','000'];

  return (
    <div className="px-4 pt-5 pb-24">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">🆘</span>
        <h2 className="text-xl font-extrabold text-white">Emergency SOS</h2>
      </div>

      {/* Quick dial */}
      <Card className="p-4 mb-4">
        <p className="text-xs text-slate-500 uppercase tracking-wide mb-3">Quick Emergency Dial</p>
        <div className="grid grid-cols-4 gap-2">
          {DIAL.map(n => (
            <a key={n} href={`tel:${n}`}
              className="flex items-center justify-center bg-red-500/10 border border-red-500/30 text-red-400 font-bold rounded-xl py-3 text-sm active:scale-95 transition-transform">
              {n}
            </a>
          ))}
        </div>
      </Card>

      {/* AI threat scanner */}
      <Card className="p-4">
        <p className="text-xs text-slate-500 uppercase tracking-wide mb-3">AI Threat Assessment</p>
        {gps && <p className="text-xs text-cyan-400 mb-3">📍 GPS: {gps.lat.toFixed(4)}, {gps.lng.toFixed(4)}</p>}

        {imageData ? (
          <div className="relative mb-3">
            <img src={imageData} alt="SOS" className="w-full h-40 object-cover rounded-xl" />
            <button onClick={() => setImageData(null)}
              className="absolute top-2 right-2 w-7 h-7 bg-black/60 rounded-full flex items-center justify-center text-white text-xs">✕</button>
          </div>
        ) : (
          <button onClick={() => fileRef.current?.click()}
            className="w-full border-2 border-dashed border-red-900/50 rounded-xl py-8 text-center mb-3">
            <p className="text-3xl mb-2">📸</p>
            <p className="text-sm text-slate-500">Photograph the threat</p>
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickImage} capture="environment" />

        {error && <p className="text-sm text-red-400 mb-3">{error}</p>}

        <CyanBtn onClick={scan} disabled={!imageData || scanning} variant="danger" className="w-full">
          {scanning ? '⟳ Analyzing threat…' : '🚨 Analyze Emergency'}
        </CyanBtn>

        {result && (
          <div className={`mt-4 p-4 rounded-xl border ${result.risk_level === 'CRITICAL' ? 'bg-red-950/60 border-red-600/50' : result.risk_level === 'WARNING' ? 'bg-amber-950/60 border-amber-600/50' : 'bg-green-950/60 border-green-600/50'}`}>
            <p className={`font-extrabold text-lg mb-2 ${result.risk_level === 'CRITICAL' ? 'text-red-400 animate-pulse' : result.risk_level === 'WARNING' ? 'text-amber-400' : 'text-green-400'}`}>
              {result.risk_level === 'CRITICAL' ? '🚨' : result.risk_level === 'WARNING' ? '⚠️' : '✅'} {result.risk_level}
            </p>
            <p className="text-sm text-slate-300 mb-3">{result.immediate_action}</p>
            {result.first_aid_steps?.map((s, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <span className="w-5 h-5 rounded-full bg-cyan-500 text-black text-xs font-bold flex items-center justify-center shrink-0">{i+1}</span>
                <p className="text-sm text-slate-300">{s}</p>
              </div>
            ))}
            {result.do_not && <p className="text-sm text-red-400 mt-2 font-semibold">🚫 {result.do_not}</p>}
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Settings Page ─────────────────────────────────────────────
function SettingsPage({ apiUrl, setApiUrl, clearHistory }) {
  const [draft, setDraft] = useState(apiUrl);
  const [saved, setSaved] = useState(false);

  const save = () => {
    const url = draft.replace(/\/$/, '');
    localStorage.setItem('bioscan_api', url);
    setApiUrl(url);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="px-4 pt-5 pb-24">
      <div className="flex items-center justify-center flex-col mb-8">
        <BioScanLogo size={72} />
        <h1 className="text-2xl font-black text-white mt-3">Bio<span className="text-cyan-400">Scan</span></h1>
        <p className="text-xs text-slate-500 mt-1 tracking-widest uppercase">Field Intelligence Scanner</p>
      </div>

      <Card className="p-4 mb-4">
        <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Backend API URL</p>
        <p className="text-xs text-slate-600 mb-3">
          Enter your FloraIQ backend URL. On same WiFi? Use your PC's local IP e.g. <span className="text-cyan-500">http://192.168.1.x:3001</span>
        </p>
        <input
          type="url"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="http://192.168.1.100:3001"
          className="w-full bg-[#0a1422] border border-cyan-900/40 rounded-xl px-3 py-2.5 text-sm text-slate-300 outline-none focus:border-cyan-500 mb-3"
        />
        <CyanBtn onClick={save} className="w-full">
          {saved ? '✓ Saved!' : 'Save API URL'}
        </CyanBtn>
      </Card>

      <Card className="p-4 mb-4">
        <p className="text-xs text-slate-500 uppercase tracking-wide mb-3">Find Your Local IP</p>
        <p className="text-sm text-slate-400">On Windows PC, open Command Prompt and run:</p>
        <div className="bg-[#0a1422] rounded-xl px-3 py-2 mt-2 font-mono text-cyan-400 text-sm">ipconfig</div>
        <p className="text-sm text-slate-400 mt-2">Look for <span className="text-cyan-400">IPv4 Address</span> under your WiFi adapter.</p>
        <p className="text-xs text-slate-600 mt-2">Make sure your phone and PC are on the same WiFi network.</p>
      </Card>

      <Card className="p-4">
        <p className="text-xs text-slate-500 uppercase tracking-wide mb-3">Data</p>
        <CyanBtn onClick={clearHistory} variant="outline" className="w-full text-red-400 border-red-900/40">
          🗑️ Clear Field Log History
        </CyanBtn>
      </Card>

      <p className="text-center text-xs text-slate-700 mt-6">BioScan v1.0 — Field Intelligence Scanner</p>
    </div>
  );
}

// ── Bottom Nav ────────────────────────────────────────────────
const NAV = [
  { id: 'scan',     icon: '🔬', label: 'Scan'  },
  { id: 'log',      icon: '📋', label: 'Log'   },
  { id: 'sos',      icon: '🆘', label: 'SOS'   },
  { id: 'settings', icon: '⚙️', label: 'Setup' },
];

// ── Main App ──────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState('scan');
  const [apiUrl, setApiUrl] = useState(DEFAULT_API);
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('bioscan_history') || '[]'); }
    catch { return []; }
  });

  const onSave = useCallback(item => {
    setHistory(h => {
      const updated = [item, ...h].slice(0, 50);
      localStorage.setItem('bioscan_history', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const clearHistory = useCallback(() => {
    localStorage.removeItem('bioscan_history');
    setHistory([]);
  }, []);

  return (
    <div className="min-h-screen max-w-lg mx-auto flex flex-col" style={{ background: '#070d14' }}>
      <main className="flex-1 overflow-y-auto">
        {tab === 'scan'     && <ScanPage apiUrl={apiUrl} onSave={onSave} />}
        {tab === 'log'      && <FieldLogPage history={history} />}
        {tab === 'sos'      && <SOSPage apiUrl={apiUrl} />}
        {tab === 'settings' && <SettingsPage apiUrl={apiUrl} setApiUrl={setApiUrl} clearHistory={clearHistory} />}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 flex justify-around items-center h-16 z-50"
        style={{ background: '#0a1420ee', backdropFilter: 'blur(12px)', borderTop: '1px solid rgba(6,182,212,0.15)', maxWidth: 512, margin: '0 auto' }}>
        {NAV.map(n => (
          <button key={n.id} onClick={() => setTab(n.id)}
            className={`flex flex-col items-center gap-0.5 px-4 py-2 rounded-xl transition-all ${tab === n.id ? 'text-cyan-400' : 'text-slate-600'}`}>
            <span className={`text-xl transition-transform ${tab === n.id ? 'scale-110' : ''}`}>{n.icon}</span>
            <span className="text-[10px] font-medium">{n.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
