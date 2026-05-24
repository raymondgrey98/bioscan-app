import { Component, createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const API = import.meta.env.VITE_API_BASE_URL || localStorage.getItem('bioscan_api') || 'https://plant-scanner-wfl8.onrender.com/api';
const CESIUM_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN || '';

const escHtml = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function safeJson(r) {
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    const text = await r.text();
    throw new Error(r.ok ? 'Server returned non-JSON response' : `Server error ${r.status}: ${text.slice(0, 120)}`);
  }
  return r.json();
}

// ── Error Boundary ────────────────────────────────────────────
class ErrorBoundary extends Component {
  state = { err: null };
  static getDerivedStateFromError(e) { return { err: e.message }; }
  render() {
    if (this.state.err) return (
      <div className="max-w-md mx-auto mt-20 p-8 bg-zinc-900 border border-zinc-800 rounded-2xl text-center">
        <p className="text-sm text-zinc-500 uppercase tracking-widest mb-2">Something went wrong</p>
        <p className="text-zinc-300 mb-6">{this.state.err}</p>
        <button onClick={() => this.setState({ err: null })} className="px-5 py-2 bg-green-500 text-black text-sm font-bold rounded-lg hover:bg-green-400 transition-colors">Reload</button>
      </div>
    );
    return this.props.children;
  }
}

// ── Auth Context ──────────────────────────────────────────────
const AuthCtx = createContext(null);
const useAuth = () => useContext(AuthCtx);

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const r = await fetch(`${API}/auth/me`, { credentials: 'include' });
      if (r.ok) setUser(await r.json());
      else setUser(null);
    } catch { setUser(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { refreshUser(); }, [refreshUser]);

  const login = useCallback(async (email, password) => {
    const r = await fetch(`${API}/auth/login`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    const d = await safeJson(r);
    if (!r.ok) throw new Error(d.error || 'Login failed');
    setUser(d.user);
    return d.user;
  }, []);

  const signup = useCallback(async (name, email, password) => {
    const r = await fetch(`${API}/auth/signup`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, password }) });
    const d = await safeJson(r);
    if (!r.ok) throw new Error(d.error || 'Signup failed');
    setUser(d.user);
    return d.user;
  }, []);

  const logout = useCallback(async () => {
    await fetch(`${API}/auth/logout`, { method: 'POST', credentials: 'include' });
    setUser(null);
  }, []);

  return <AuthCtx.Provider value={{ user, loading, login, signup, logout, refreshUser }}>{children}</AuthCtx.Provider>;
}

// ── Online status hook ────────────────────────────────────────
function useOnlineStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}

// ── Language system ───────────────────────────────────────────
const LANGUAGES = [
  { code: 'en', label: 'English' }, { code: 'tl', label: 'Filipino' },
  { code: 'es', label: 'Español' }, { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' }, { code: 'pt', label: 'Português' },
  { code: 'id', label: 'Bahasa' }, { code: 'ms', label: 'Melayu' },
  { code: 'th', label: 'ภาษาไทย' }, { code: 'vi', label: 'Tiếng Việt' },
  { code: 'ja', label: '日本語' }, { code: 'zh', label: '中文' },
  { code: 'ko', label: '한국어' }, { code: 'ar', label: 'العربية' },
  { code: 'hi', label: 'हिन्दी' }, { code: 'ru', label: 'Русский' },
  { code: 'it', label: 'Italiano' }, { code: 'nl', label: 'Nederlands' },
  { code: 'pl', label: 'Polski' }, { code: 'sv', label: 'Svenska' },
  { code: 'tr', label: 'Türkçe' }, { code: 'uk', label: 'Українська' },
  { code: 'bn', label: 'বাংলা' }, { code: 'sw', label: 'Kiswahili' },
  { code: 'ha', label: 'Hausa' },
];

function LangSwitcher() {
  const [lang, setLang] = useState(() => localStorage.getItem('lang') || 'en');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const select = code => { setLang(code); localStorage.setItem('lang', code); setOpen(false); };
  const current = LANGUAGES.find(l => l.code === lang) || LANGUAGES[0];
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)} className="flex items-center gap-1 px-2 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors">
        🌐 {current.code.toUpperCase()}
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-50 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl py-1 w-40 max-h-72 overflow-y-auto">
          {LANGUAGES.map(l => (
            <button key={l.code} onClick={() => select(l.code)} className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${l.code === lang ? 'text-green-400 bg-green-500/10' : 'text-zinc-300 hover:bg-zinc-800'}`}>
              {l.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── UI Atoms ──────────────────────────────────────────────────
const Card = ({ children, className = '', onClick }) => (
  <div onClick={onClick} className={`glass-card ${onClick ? 'cursor-pointer' : ''} ${className}`}>{children}</div>
);

const Badge = ({ children, color = 'zinc' }) => {
  const colors = { zinc: 'bg-zinc-800 text-zinc-400', green: 'bg-green-500/10 text-green-400 border border-green-500/20', blue: 'bg-blue-500/10 text-blue-400 border border-blue-500/20', amber: 'bg-amber-500/10 text-amber-400 border border-amber-500/20', purple: 'bg-purple-500/10 text-purple-400 border border-purple-500/20', red: 'bg-red-500/10 text-red-400 border border-red-500/20' };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors[color] || colors.zinc}`}>{children}</span>;
};

const Btn = ({ children, onClick, variant = 'primary', size = 'md', className = '', disabled, type = 'button' }) => {
  const variants = {
    primary: 'btn-violet',
    secondary: 'bg-white/5 hover:bg-white/10 text-zinc-200 border border-white/8',
    danger: 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30',
    survival: 'bg-amber-500 hover:bg-amber-400 text-black font-bold',
    ghost: 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5',
  };
  const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm', lg: 'px-6 py-3 text-base' };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`rounded-lg transition-colors inline-flex items-center justify-center gap-1.5 ${variants[variant]} ${sizes[size]} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}>
      {children}
    </button>
  );
};

const Input = ({ label, error, className = '', ...props }) => (
  <div className={className}>
    {label && <label className="block text-xs font-medium text-zinc-400 mb-1">{label}</label>}
    <input {...props} className={`w-full px-3 py-2 bg-white/5 border ${error ? 'border-red-500' : 'border-white/10'} rounded-lg text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors`} />
    {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
  </div>
);

const Textarea = ({ label, className = '', ...props }) => (
  <div className={className}>
    {label && <label className="block text-xs font-medium text-zinc-400 mb-1">{label}</label>}
    <textarea {...props} className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors resize-none" />
  </div>
);

function Modal({ open, onClose, title, children }) {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative glass-card w-full max-w-lg overflow-y-auto max-h-[90vh]" style={{ background: 'rgba(8,8,22,0.95)' }}>
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
            <h3 className="font-semibold text-zinc-100">{title}</h3>
            <button onClick={onClose} className="text-zinc-600 hover:text-zinc-400 text-xl leading-none">×</button>
          </div>
        )}
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

const DangerLevel = ({ level }) => {
  const levels = {
    SAFE:      { bg: 'bg-green-500/10',  border: 'border-green-500/30',  text: 'text-green-400',  dot: 'bg-green-400' },
    CAUTION:   { bg: 'bg-amber-500/10',  border: 'border-amber-500/30',  text: 'text-amber-400',  dot: 'bg-amber-400' },
    DANGEROUS: { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-400', dot: 'bg-orange-400' },
    DEADLY:    { bg: 'bg-red-500/10',    border: 'border-red-500/30',    text: 'text-red-400',    dot: 'bg-red-400' },
  };
  const l = levels[String(level || '').toUpperCase()] || levels.CAUTION;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${l.bg} ${l.border} ${l.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${l.dot}`} />
      {level || 'UNKNOWN'}
    </span>
  );
};

// ── Notifications ─────────────────────────────────────────────
function NotifBell({ count, onClick }) {
  return (
    <button onClick={onClick} className="relative p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors">
      🔔
      {count > 0 && <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{count > 9 ? '9+' : count}</span>}
    </button>
  );
}

function NotifPanel({ open, onClose }) {
  const [notifs, setNotifs] = useState([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`${API}/notifications`, { credentials: 'include' })
      .then(r => r.json()).then(d => setNotifs(Array.isArray(d) ? d : []))
      .catch(() => {}).finally(() => setLoading(false));
  }, [open]);
  const markRead = id => {
    fetch(`${API}/notifications/${id}/read`, { method: 'PATCH', credentials: 'include' }).catch(() => {});
    setNotifs(n => n.map(x => x.id === id ? { ...x, read: true } : x));
  };
  const markAll = () => {
    fetch(`${API}/notifications/read-all`, { method: 'PATCH', credentials: 'include' }).catch(() => {});
    setNotifs(n => n.map(x => ({ ...x, read: true })));
  };
  if (!open) return null;
  return (
    <div className="absolute right-0 top-14 z-50 w-80 bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <span className="text-sm font-semibold text-zinc-200">Notifications</span>
        <div className="flex items-center gap-2">
          <button onClick={markAll} className="text-xs text-zinc-500 hover:text-zinc-300">Mark all read</button>
          <button onClick={onClose} className="text-zinc-600 hover:text-zinc-400">×</button>
        </div>
      </div>
      <div className="max-h-80 overflow-y-auto divide-y divide-zinc-800/60">
        {loading && <p className="px-4 py-6 text-sm text-zinc-500 text-center">Loading…</p>}
        {!loading && notifs.length === 0 && <p className="px-4 py-6 text-sm text-zinc-600 text-center">No notifications</p>}
        {notifs.map(n => (
          <div key={n.id} onClick={() => markRead(n.id)} className={`px-4 py-3 cursor-pointer hover:bg-zinc-900 transition-colors ${n.read ? 'opacity-50' : ''}`}>
            <p className="text-xs font-medium text-zinc-200">{n.title || n.type}</p>
            {n.message && <p className="text-xs text-zinc-500 mt-0.5 truncate">{n.message}</p>}
            {!n.read && <span className="inline-block w-1.5 h-1.5 bg-green-400 rounded-full ml-auto" />}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Navigation ────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: 'home',      label: 'Home',      icon: '🏠' },
  { id: 'scan',      label: 'Identify',  icon: '📷' },
  { id: 'sos',       label: 'SOS',       icon: '🆘' },
  { id: 'survival',  label: 'Survival',  icon: '🏕️' },
  { id: 'map',       label: 'Map',       icon: '🗺️' },
  { id: 'farming',   label: 'Farm',      icon: '🌾' },
  { id: 'farm-ops',  label: 'Farm Ops',  icon: '🚜' },
  { id: 'landscape', label: 'Landscape', icon: '🌍' },
  { id: 'library',   label: 'Library',   icon: '📚' },
  { id: 'history',   label: 'History',   icon: '🕒' },
  { id: 'journal',   label: 'Journal',   icon: '📓' },
];

const BOTTOM_NAV = [
  { id: 'home',      label: 'Home',    icon: '🏠' },
  { id: 'scan',      label: 'Scan',    icon: '📷' },
  { id: 'sos',       label: 'SOS',     icon: '🆘' },
  { id: 'landscape', label: 'Terrain', icon: '🌍' },
  { id: 'map',       label: 'Map',     icon: '🗺️' },
];

function Navbar({ active, onNav, notifCount, onOpenNotifs, showNotifs, onCloseNotifs }) {
  const { user, logout } = useAuth();
  const online = useOnlineStatus();
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 glass-nav border-b">
      <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-14 relative">
        <button onClick={() => onNav('home')} className="font-display font-extrabold text-lg text-white tracking-tight shrink-0">
          Bio<span style={{ color: '#06b6d4' }}>Scan</span>
          {!online && <span className="ml-2 text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full px-2 py-0.5">Offline</span>}
        </button>
        <nav className="hidden lg:flex items-center gap-1 mx-4">
          {NAV_ITEMS.map(n => (
            <button key={n.id} onClick={() => onNav(n.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${active === n.id ? 'bg-violet-500/20 text-violet-300 border border-violet-500/25' : 'text-slate-400 hover:text-white hover:bg-white/6'}`}>
              {n.icon} {n.label}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-1">
          <LangSwitcher />
          {user && <NotifBell count={notifCount} onClick={onOpenNotifs} />}
          {user?.role === 'admin' && (
            <button onClick={() => onNav('admin')} className="hidden sm:flex px-2 py-1.5 text-xs font-bold text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 rounded-lg transition-colors">⚙️ Admin</button>
          )}
          {user ? (
            <button onClick={() => onNav('profile')} className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors">
              👤 {user.name?.split(' ')[0]}
            </button>
          ) : (
            <>
              <button onClick={() => onNav('login')} className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white hover:bg-white/6 rounded-lg transition-colors">Sign in</button>
              <button onClick={() => onNav('signup')} className="btn-violet px-3 py-1.5 text-xs rounded-lg">Sign up</button>
            </>
          )}
          <button onClick={() => setMenuOpen(o => !o)} className="lg:hidden p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors text-lg">☰</button>
        </div>
        <NotifPanel open={showNotifs} onClose={onCloseNotifs} />
        {menuOpen && (
          <div className="lg:hidden absolute right-4 top-14 z-50 glass-card py-2 w-52 shadow-2xl">
            {NAV_ITEMS.map(n => (
              <button key={n.id} onClick={() => { onNav(n.id); setMenuOpen(false); }}
                className={`flex items-center gap-2 text-left px-3 py-2.5 rounded-lg text-sm font-medium mb-0.5 mx-1 transition-colors ${active === n.id ? 'bg-violet-500/20 text-violet-300' : 'text-slate-400 hover:bg-white/6'}`}>
                {n.icon} {n.label}
              </button>
            ))}
            {user && <button onClick={() => { onNav('profile'); setMenuOpen(false); }} className="flex items-center gap-2 w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium text-zinc-400 mb-0.5 mx-1">👤 Profile</button>}
            {user?.role === 'admin' && <button onClick={() => { onNav('admin'); setMenuOpen(false); }} className="flex items-center gap-2 w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium text-purple-400 mb-0.5 mx-1">⚙️ Admin</button>}
            {user && <button onClick={() => { onNav('favorites'); setMenuOpen(false); }} className="flex items-center gap-2 w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium text-zinc-400 mx-1">❤️ Favorites</button>}
            {!user && <>
              <button onClick={() => { onNav('login'); setMenuOpen(false); }} className="flex items-center gap-2 w-full text-left px-3 py-2.5 rounded-lg text-sm text-zinc-400 mx-1">Sign in</button>
              <button onClick={() => { onNav('signup'); setMenuOpen(false); }} className="flex items-center gap-2 w-full text-left px-3 py-2.5 rounded-lg text-sm font-bold text-green-400 bg-green-500/10 mx-1">Sign up</button>
            </>}
          </div>
        )}
      </div>
    </header>
  );
}

function BottomNav({ active, onNav }) {
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 glass-nav border-t flex">
      {BOTTOM_NAV.map(n => (
        <button key={n.id} onClick={() => onNav(n.id)}
          className={`flex-1 flex flex-col items-center py-2 gap-0.5 transition-colors ${active === n.id ? 'text-violet-400' : 'text-slate-500'}`}>
          <span className="text-lg">{n.icon}</span>
          <span className="text-[9px] font-medium">{n.label}</span>
        </button>
      ))}
    </nav>
  );
}

// ── Auth Pages ────────────────────────────────────────────────
function LoginPage({ onNav }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async e => {
    e.preventDefault(); setErr(''); setLoading(true);
    try { await login(email, pw); onNav('home'); }
    catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  };
  return (
    <div className="max-w-sm mx-auto mt-16 px-4">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-extrabold text-white mb-1">Welcome back</h1>
        <p className="text-sm text-zinc-500">Sign in to FloraIQ</p>
      </div>
      <Card className="p-6">
        <form onSubmit={submit} className="space-y-4">
          <Input label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
          <Input label="Password" type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="••••••••" required />
          {err && <p className="text-xs text-red-400">{err}</p>}
          <Btn type="submit" disabled={loading} className="w-full">{loading ? 'Signing in…' : 'Sign In'}</Btn>
          <div className="flex items-center justify-between pt-2">
            <button type="button" onClick={() => onNav('forgot')} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Forgot password?</button>
            <p className="text-xs text-zinc-600">No account? <button type="button" onClick={() => onNav('signup')} className="text-green-400 hover:text-green-300 font-medium transition-colors">Sign up free</button></p>
          </div>
        </form>
      </Card>
    </div>
  );
}

function SignupPage({ onNav }) {
  const { signup } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async e => {
    e.preventDefault(); setErr(''); setLoading(true);
    try { await signup(name, email, pw); onNav('home'); }
    catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  };
  return (
    <div className="max-w-sm mx-auto mt-16 px-4">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-extrabold text-white mb-1">Create account</h1>
        <p className="text-sm text-zinc-500">Join FloraIQ — free forever</p>
      </div>
      <Card className="p-6">
        <form onSubmit={submit} className="space-y-4">
          <Input label="Name" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" required />
          <Input label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
          <Input label="Password" type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="Min 8 characters" minLength={8} required />
          {err && <p className="text-xs text-red-400">{err}</p>}
          <Btn type="submit" disabled={loading} className="w-full">{loading ? 'Creating…' : 'Create Account'}</Btn>
          <p className="mt-4 text-center text-xs text-zinc-600">Already have an account? <button type="button" onClick={() => onNav('login')} className="text-green-400 hover:text-green-300 font-medium transition-colors">Sign in</button></p>
        </form>
      </Card>
    </div>
  );
}

function ForgotPage({ onNav }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const submit = async e => {
    e.preventDefault(); setLoading(true);
    await fetch(`${API}/auth/forgot-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) }).catch(() => {});
    setSent(true); setLoading(false);
  };
  return (
    <div className="max-w-sm mx-auto mt-16 px-4">
      <Card className="p-6">
        <h2 className="text-lg font-bold text-white mb-4">Reset password</h2>
        {sent ? (
          <div className="text-center space-y-4">
            <p className="text-sm text-zinc-400">If that email exists, we sent a reset link.</p>
            <Btn onClick={() => onNav('login')} variant="secondary">Back to Sign In</Btn>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <Input label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
            <Btn type="submit" disabled={loading} className="w-full">{loading ? 'Sending…' : 'Send Reset Link'}</Btn>
            <button type="button" onClick={() => onNav('login')} className="w-full text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Back to Sign In</button>
          </form>
        )}
      </Card>
    </div>
  );
}

// ── Plant Card ────────────────────────────────────────────────
function PlantCard({ plant, onFavorite }) {
  const [imgSrc, setImgSrc] = useState(plant.image_url || null);
  useEffect(() => {
    if (imgSrc) return;
    const name = plant.scientific_name || plant.common_name;
    if (!name) return;
    const ctrl = new AbortController();
    fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name.replace(/ /g,'_'))}`, { signal: ctrl.signal })
      .then(r => r.json()).then(d => { if (d?.thumbnail?.source) setImgSrc(d.thumbnail.source); }).catch(() => {});
    return () => ctrl.abort();
  }, [plant.scientific_name, plant.common_name]);

  return (
    <Card className="overflow-hidden group">
      {imgSrc && <img src={imgSrc} alt={plant.common_name} className="w-full h-36 object-cover" onError={() => setImgSrc(null)} />}
      {!imgSrc && <div className="w-full h-36 bg-zinc-800/60 flex items-center justify-center text-4xl">🌿</div>}
      <div className="p-3">
        <p className="text-sm font-semibold text-zinc-100 truncate">{plant.common_name || plant.name}</p>
        {plant.scientific_name && <p className="text-xs italic text-zinc-500 truncate">{plant.scientific_name}</p>}
        <div className="flex items-center gap-1 mt-2 flex-wrap">
          {plant.family && <Badge color="green">{plant.family}</Badge>}
          {plant.edible && <Badge color="amber">Edible</Badge>}
          {plant.medicinal && <Badge color="blue">Medicinal</Badge>}
          {plant.toxic && <Badge color="red">Toxic</Badge>}
        </div>
        {onFavorite && (
          <button onClick={() => onFavorite(plant)} className="mt-2 text-xs text-zinc-600 hover:text-red-400 transition-colors">♡ Save</button>
        )}
      </div>
    </Card>
  );
}

// ── Location Tab ─────────────────────────────────────────────
function LocationTab({ loc, distribution, habitat }) {
  const mapRef = useRef(null);
  const mapInst = useRef(null);
  const hasGps = loc?.latitude && loc?.longitude;

  useEffect(() => {
    if (!hasGps || !mapRef.current) return;
    if (mapInst.current) return;
    const map = L.map(mapRef.current, { zoomControl: true, scrollWheelZoom: false })
      .setView([loc.latitude, loc.longitude], 10);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap © CARTO', maxZoom: 19,
    }).addTo(map);
    L.circleMarker([loc.latitude, loc.longitude], {
      radius: 10, color: '#3d6b4f', fillColor: '#5a9e72', fillOpacity: 0.85, weight: 2,
    }).addTo(map).bindPopup(
      `<b>${loc.city || ''}${loc.city && loc.country ? ', ' : ''}${loc.country || 'Photo location'}</b><br/>
       <span style="font-size:11px;color:#888">${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)}</span>`
    ).openPopup();
    mapInst.current = map;
    return () => { map.remove(); mapInst.current = null; };
  }, [hasGps, loc?.latitude, loc?.longitude]);

  return (
    <div className="space-y-3 text-sm">
      {hasGps ? (
        <>
          <div ref={mapRef} className="w-full rounded-xl overflow-hidden border border-zinc-800" style={{ height: 220 }} />
          <div className="grid grid-cols-2 gap-2">
            {loc.country && <div className="bg-zinc-800/60 rounded-xl p-3"><p className="text-xs text-zinc-500 uppercase tracking-wide mb-0.5">Country</p><p className="text-zinc-200">🌍 {loc.country}</p></div>}
            {loc.city    && <div className="bg-zinc-800/60 rounded-xl p-3"><p className="text-xs text-zinc-500 uppercase tracking-wide mb-0.5">City</p><p className="text-zinc-200">🏙️ {loc.city}</p></div>}
            {loc.state   && <div className="bg-zinc-800/60 rounded-xl p-3"><p className="text-xs text-zinc-500 uppercase tracking-wide mb-0.5">State</p><p className="text-zinc-200">{loc.state}</p></div>}
            {loc.street  && <div className="bg-zinc-800/60 rounded-xl p-3 col-span-2"><p className="text-xs text-zinc-500 uppercase tracking-wide mb-0.5">Street</p><p className="text-zinc-200">📍 {loc.street}</p></div>}
          </div>
          <div className="bg-zinc-800/40 rounded-xl p-3">
            <p className="text-xs text-zinc-500 uppercase tracking-wide mb-0.5">GPS Coordinates</p>
            <p className="text-zinc-200 font-mono text-xs">{loc.latitude.toFixed(6)}, {loc.longitude.toFixed(6)}</p>
            <a href={`https://maps.google.com/?q=${loc.latitude},${loc.longitude}`} target="_blank" rel="noopener noreferrer"
              className="text-xs text-green-400 hover:text-green-300 mt-1 inline-block underline underline-offset-2">
              Open in Google Maps →
            </a>
          </div>
        </>
      ) : (
        <div className="space-y-3">
          <div className="bg-zinc-800/40 rounded-xl p-4 text-center">
            <p className="text-2xl mb-2">📍</p>
            <p className="text-zinc-400 text-sm font-medium">No GPS data in this photo</p>
            <p className="text-zinc-600 text-xs mt-1">Enable location on your camera to auto-geotag future scans.</p>
          </div>
          {distribution && (
            <div className="bg-zinc-800/60 rounded-xl p-3">
              <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">🌍 Natural Distribution</p>
              <p className="text-zinc-300 text-sm">{distribution}</p>
            </div>
          )}
          {habitat && (
            <div className="bg-zinc-800/60 rounded-xl p-3">
              <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">🌿 Native Habitat</p>
              <p className="text-zinc-300 text-sm">{habitat}</p>
            </div>
          )}
          <a href="https://maps.google.com" target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 py-2.5 border border-zinc-700 rounded-xl text-xs text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors">
            📌 Open Google Maps to find location manually
          </a>
        </div>
      )}
    </div>
  );
}

// ── Scan Result ───────────────────────────────────────────────
function ScanResult({ result, onSave }) {
  const [tab, setTab] = useState('overview');
  const [imgErr, setImgErr] = useState(false);
  if (!result) return null;

  const a = result.result || result.result_json || result.identification?.result_json || result.identification || result;
  const taxon   = a.taxonomy || {};
  const danger  = a.danger_level ?? null;
  const conf    = a.confidence != null ? (a.confidence > 1 ? Math.round(a.confidence) : Math.round(a.confidence * 100)) : null;
  const loc     = result.location || {};
  const tabs = ['overview', 'survival', 'taxonomy', 'uses', 'location'];

  // Image: only use URL if it's a real external URL (Cloudinary/http), not a broken local path
  const primaryImg  = [result.url, result.image_url, result.cloud_url].find(u => u && u.startsWith('http'));
  const fallbackImg = result.example_photo;
  const imgSrc      = (!imgErr && primaryImg) ? primaryImg : fallbackImg;

  // External databases — organized by type
  const sci  = a.scientific_name;
  const name = a.common_name || a.plant_name || '';
  const q    = encodeURIComponent(sci || name);
  const isPlant    = ['plant','tree','shrub','herb','grass','crop','weed','succulent','aquatic'].includes(a.subject_type);
  const isAnimal   = ['bird','mammal','reptile','amphibian','fish','insect','spider'].includes(a.subject_type);
  const isMushroom = ['mushroom','fungi'].includes(a.subject_type);

  const databases = [
    { label: '🌍 iNaturalist',           url: `https://www.inaturalist.org/search?q=${q}`,                            bg: 'bg-emerald-900 hover:bg-emerald-800' },
    { label: '🔬 GBIF',                  url: `https://www.gbif.org/species/search?q=${q}`,                           bg: 'bg-zinc-700 hover:bg-zinc-600' },
    { label: '📖 Wikipedia',             url: `https://en.wikipedia.org/wiki/Special:Search?search=${q}`,             bg: 'bg-slate-700 hover:bg-slate-600' },
    { label: '🌐 Encyclopedia of Life',  url: `https://eol.org/search?q=${q}`,                                        bg: 'bg-blue-900 hover:bg-blue-800' },
    { label: '🔭 ITIS',                  url: `https://www.itis.gov/servlet/SingleRpt/SingleRpt?search_topic=SNL&search_value=${q}`, bg: 'bg-indigo-900 hover:bg-indigo-800' },
    ...(isPlant ? [
      { label: '🌺 Plants of World (Kew)',  url: `https://powo.science.kew.org/results?q=${q}`,                       bg: 'bg-green-900 hover:bg-green-800' },
      { label: '🌾 USDA PLANTS',            url: `https://plants.usda.gov/home/search?q=${q}`,                        bg: 'bg-lime-900 hover:bg-lime-800' },
      { label: '🌿 PlantNet',              url: `https://identify.plantnet.org/the-plant-list/species/${q}/data`,      bg: 'bg-teal-900 hover:bg-teal-800' },
      { label: '🏛️ Tropicos (MBG)',        url: `https://tropicos.org/search?name=${q}`,                              bg: 'bg-amber-900 hover:bg-amber-800' },
      { label: '📚 World Flora Online',    url: `https://www.worldfloraonline.org/search?query=${q}`,                  bg: 'bg-green-950 hover:bg-green-900' },
      { label: '🧬 NCBI Taxonomy',         url: `https://www.ncbi.nlm.nih.gov/Taxonomy/Browser/wwwtax.cgi?name=${q}`, bg: 'bg-blue-950 hover:bg-blue-900' },
      { label: '🌱 Useful Plants (Kew)',    url: `https://usefulness.kew.org/search?searchTerm=${q}`,                  bg: 'bg-emerald-950 hover:bg-emerald-900' },
    ] : []),
    ...(isAnimal ? [
      { label: '🔴 IUCN Red List',         url: `https://www.iucnredlist.org/search?query=${q}`,                      bg: 'bg-red-900 hover:bg-red-800' },
      { label: '🐦 eBird (Birds)',          url: `https://ebird.org/search?q=${q}`,                                   bg: 'bg-sky-900 hover:bg-sky-800' },
      { label: '🦎 Reptile Database',       url: `https://reptile-database.reptarium.cz/search?q=${q}`,               bg: 'bg-orange-900 hover:bg-orange-800' },
      { label: '🧬 NCBI Taxonomy',          url: `https://www.ncbi.nlm.nih.gov/Taxonomy/Browser/wwwtax.cgi?name=${q}`,bg: 'bg-blue-950 hover:bg-blue-900' },
      { label: '🌐 ARKive Archive',         url: `https://www.wildscreen.org/explore/?search=${q}`,                   bg: 'bg-cyan-900 hover:bg-cyan-800' },
    ] : []),
    ...(isMushroom ? [
      { label: '🍄 MycoBank',              url: `https://www.mycobank.org/quicksearch.aspx?criteria=${q}`,             bg: 'bg-orange-900 hover:bg-orange-800' },
      { label: '🔬 Index Fungorum',        url: `https://www.indexfungorum.org/names/names.asp?fusename=${q}`,         bg: 'bg-amber-900 hover:bg-amber-800' },
      { label: '🔴 IUCN Red List',         url: `https://www.iucnredlist.org/search?query=${q}`,                      bg: 'bg-red-900 hover:bg-red-800' },
    ] : []),
    { label: '📜 BHL (Literature)',       url: `https://www.biodiversitylibrary.org/search?searchTerm=${q}`,          bg: 'bg-stone-700 hover:bg-stone-600' },
    { label: '▶️ YouTube',               url: `https://www.youtube.com/results?search_query=${encodeURIComponent(name + ' identification')}`, bg: 'bg-red-700 hover:bg-red-600' },
  ].filter(d => d.url && !d.url.includes('undefined'));

  return (
    <Card className="overflow-hidden">
      {imgSrc && (
        <img
          src={imgSrc}
          alt={a.common_name}
          className="w-full h-52 object-cover"
          onError={() => { if (!imgErr) setImgErr(true); }}
        />
      )}
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-1">
          <div>
            <h3 className="text-xl font-extrabold text-white capitalize">{a.common_name || a.plant_name || 'Unknown Organism'}</h3>
            {a.scientific_name && <p className="text-sm italic text-zinc-400">{a.scientific_name}</p>}
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {conf != null && <Badge color="green">{conf}% match</Badge>}
            {danger != null && <DangerLevel level={danger} />}
          </div>
        </div>
        {a.subject_type && <p className="text-xs text-zinc-500 mb-3 capitalize">{a.subject_type}</p>}

        {a.safety_warning && (
          <div className="mb-3 p-3 bg-red-950/60 border border-red-700/50 rounded-xl flex gap-2">
            <span className="text-red-400 shrink-0">⚠️</span>
            <p className="text-xs text-red-300 font-medium">{a.safety_warning}</p>
          </div>
        )}

        <div className="flex gap-1 mb-4 flex-wrap">
          {tabs.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1 rounded-lg text-xs font-medium capitalize transition-colors ${tab === t ? 'bg-green-500 text-black font-bold' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}>
              {t}
            </button>
          ))}
        </div>

        {tab === 'overview' && (
          <div className="space-y-3">
            {a.description && <p className="text-sm text-zinc-300 leading-relaxed">{a.description}</p>}
            {(a.habitat || a.distribution) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {a.habitat && <div className="bg-zinc-800/60 rounded-xl p-3"><p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Habitat</p><p className="text-sm text-zinc-300">{a.habitat}</p></div>}
                {a.distribution && <div className="bg-zinc-800/60 rounded-xl p-3"><p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Distribution</p><p className="text-sm text-zinc-300">{a.distribution}</p></div>}
              </div>
            )}
            {a.ecology && <div><p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Ecology</p><p className="text-sm text-zinc-300">{a.ecology}</p></div>}
            {a.lookalikes && <div className="p-3 bg-amber-950/40 border border-amber-700/30 rounded-xl"><p className="text-xs font-bold text-amber-400 mb-1">⚠️ Lookalikes / Confusion Species</p><p className="text-sm text-zinc-300">{a.lookalikes}</p></div>}
            {a.life_cycle && <div><p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Life Cycle</p><p className="text-sm text-zinc-300">{a.life_cycle}</p></div>}
            {result.example_photo && (
              <div className="pt-2">
                <p className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Reference Photo</p>
                <img src={result.example_photo} alt="Reference" className="w-full max-h-40 object-contain rounded-xl border border-zinc-800" />
              </div>
            )}
          </div>
        )}

        {tab === 'survival' && (
          <div className="space-y-3">
            {danger != null && (
              <div className="flex items-center gap-3 p-3 bg-zinc-800/60 rounded-xl">
                <span className="text-xs text-zinc-400 shrink-0">Danger Level</span>
                <DangerLevel level={danger} />
                <span className="text-xs text-zinc-500">/ 10</span>
              </div>
            )}
            {a.edibility && <div className="p-3 bg-green-950/40 border border-green-800/30 rounded-xl"><p className="text-xs font-bold text-green-400 mb-1">🍃 Edibility</p><p className="text-sm text-zinc-300">{a.edibility}</p></div>}
            {a.toxicity && <div className="p-3 bg-red-950/40 border border-red-800/30 rounded-xl"><p className="text-xs font-bold text-red-400 mb-1">☠️ Toxicity</p><p className="text-sm text-zinc-300">{a.toxicity}</p></div>}
            {a.survival_uses && <div><p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Survival Uses</p><p className="text-sm text-zinc-300">{a.survival_uses}</p></div>}
            {a.ethnobotany && <div><p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Medicinal / Traditional Uses</p><p className="text-sm text-zinc-300">{a.ethnobotany}</p></div>}
            {a.first_aid && <div className="p-3 bg-red-950/60 border border-red-600/40 rounded-xl"><p className="text-xs font-bold text-red-300 mb-1">🚑 Emergency First Aid</p><p className="text-sm text-zinc-300">{a.first_aid}</p></div>}
            {!a.edibility && !a.toxicity && !a.survival_uses && <p className="text-sm text-zinc-500">No survival data available for this organism.</p>}
            {/* YouTube link */}
            {(a.common_name || a.plant_name) && (
              <a href={`https://www.youtube.com/results?search_query=${encodeURIComponent((a.common_name || a.plant_name) + ' edible wild survival foraging')}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 mt-2 px-4 py-2.5 bg-red-700 hover:bg-red-600 text-white text-sm font-semibold rounded-xl transition">
                ▶️ YouTube — Survival & Foraging Videos
              </a>
            )}
          </div>
        )}

        {tab === 'taxonomy' && (
          <div className="grid grid-cols-2 gap-3 text-sm">
            {['kingdom','phylum','class','order','family','genus','species'].map(k => (
              (taxon[k] || a[k]) && (
                <div key={k} className="bg-zinc-800/60 rounded-xl p-3">
                  <p className="text-xs text-zinc-500 capitalize">{k}</p>
                  <p className="text-zinc-200 font-medium">{taxon[k] || a[k]}</p>
                </div>
              )
            ))}
            {a.genetic_proximity_hint && (
              <div className="col-span-2 bg-zinc-800/60 rounded-xl p-3">
                <p className="text-xs text-zinc-500">Genetic Proximity</p>
                <p className="text-zinc-200 text-sm">{a.genetic_proximity_hint}</p>
              </div>
            )}
          </div>
        )}

        {tab === 'uses' && (
          <div className="space-y-3">
            {a.edibility && <div><p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1">Edibility / Culinary</p><p className="text-sm text-zinc-300">{a.edibility}</p></div>}
            {a.ethnobotany && <div><p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1">Medicinal / Ethnobotany</p><p className="text-sm text-zinc-300">{a.ethnobotany}</p></div>}
            {a.economic_importance && <div><p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1">Economic Importance</p><p className="text-sm text-zinc-300">{a.economic_importance}</p></div>}
            {a.care_summary && <div><p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1">Cultivation Guide</p><p className="text-sm text-zinc-300">{a.care_summary}</p></div>}
            {a.conservation_status && <div><p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1">Conservation</p><Badge color={a.conservation_status.includes('Least') ? 'green' : 'amber'}>{a.conservation_status}</Badge></div>}
            {a.research_notes && <div><p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1">Research Notes</p><p className="text-sm text-zinc-400">{a.research_notes}</p></div>}
            {/* External databases */}
            {databases.length > 0 && (
              <div className="pt-2">
                <p className="text-xs font-bold text-zinc-500 uppercase tracking-wide mb-2">External Databases</p>
                <div className="grid grid-cols-2 gap-2">
                  {databases.map((d, i) => (
                    <a key={i} href={d.url} target="_blank" rel="noopener noreferrer"
                      className={`flex items-center gap-1.5 px-3 py-2 ${d.bg} text-white text-xs font-semibold rounded-xl transition`}>
                      {d.label}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'location' && (
          <LocationTab loc={loc} distribution={a.distribution} habitat={a.habitat} />
        )}

        {onSave && (
          <div className="mt-4 pt-4 border-t border-zinc-800">
            <Btn onClick={onSave} variant="secondary" size="sm">💾 Save to Library</Btn>
          </div>
        )}
      </div>
    </Card>
  );
}

// ── Search Results ────────────────────────────────────────────
function SearchResults({ query }) {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!query) return;
    setLoading(true);
    fetch(`${API}/search?q=${encodeURIComponent(query)}&sources=gbif,organisms,papers,wiki`, { credentials: 'include' })
      .then(r => r.json()).then(setResults).catch(() => {}).finally(() => setLoading(false));
  }, [query]);
  if (loading) return <div className="py-8 text-center"><div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin mx-auto" /></div>;
  if (!results) return null;
  return (
    <div className="space-y-4">
      {results.organisms?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Database ({results.organisms.length})</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {results.organisms.map((o, i) => <PlantCard key={i} plant={o} />)}
          </div>
        </div>
      )}
      {results.gbif?.filter(g => g.rank === 'SPECIES' || g.rank === 'SUBSPECIES').length > 0 && (
        <div>
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">GBIF Species</p>
          <div className="space-y-2">
            {results.gbif.filter(g => g.rank === 'SPECIES' || g.rank === 'SUBSPECIES').slice(0, 8).map((g, i) => (
              <Card key={i} className="p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-zinc-200">{g.canonicalName}</p>
                  <p className="text-xs text-zinc-500">{g.family} · {g.kingdom}</p>
                </div>
                <a href={`https://www.gbif.org/species/${g.key}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:text-blue-300">GBIF ↗</a>
              </Card>
            ))}
          </div>
        </div>
      )}
      {results.wiki && (
        <div>
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Wikipedia</p>
          <Card className="p-4"><p className="text-sm text-zinc-300">{results.wiki.extract}</p></Card>
        </div>
      )}
    </div>
  );
}

// ── Home Page ─────────────────────────────────────────────────
function HomePage({ onNav }) {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  useEffect(() => {
    fetch(`${API}/map/stats`).then(r => r.json()).then(setStats).catch(() => {});
  }, []);

  const features = [
    { icon: '📷', title: 'AI Plant ID', desc: 'Identify any plant, insect, bird, or mushroom with multi-model AI — Gemini, GPT-4o, Claude', action: 'scan' },
    { icon: '🏕️', title: 'Survival Toolkit', desc: 'Edibility assessment, danger levels, SOS beacon, and trail safety for hikers and campers', action: 'survival' },
    { icon: '🌍', title: 'Landscape OSINT', desc: 'Analyze any environment photo — hemisphere, climate zone, dangers, wild food, and disaster risks', action: 'landscape' },
    { icon: '🗺️', title: 'Species Map', desc: 'Global interactive map of all sightings, filterable by species type and region', action: 'map' },
    { icon: '🌾', title: 'Farm Assistant', desc: 'AI-powered crop planning, hydroponics setup, and growing calendar for any region', action: 'farming' },
    { icon: '🍳', title: 'Wild Food Guide', desc: 'Harvest and cook wild plants — traditional recipes, fire and no-fire methods, preservation', action: 'landscape' },
    { icon: '📚', title: 'Species Library', desc: '200+ organisms with taxonomy, habitat, edibility, medicinal uses, and cultural significance', action: 'library' },
    { icon: '📓', title: 'Plant Journal', desc: 'Track plant health, observations, and growth progress with timestamped notes', action: 'journal' },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 pb-28">
      {/* Hero */}
      <div className="text-center mb-12">
        {/* Isometric 3D hero art */}
        <div className="iso-hero">
          <div className="iso-glow" />
          <div className="iso-platform" />
          <div className="iso-inner" />
          <div className="iso-icon">🌿</div>
          <div className="iso-particle" />
          <div className="iso-particle" />
          <div className="iso-particle" />
          <div className="iso-particle" />
        </div>

        <h1 className="text-5xl font-extrabold text-white mb-3 tracking-tight">
          Flora<span className="gradient-text">IQ</span>
        </h1>
        <p className="text-slate-400 text-lg max-w-2xl mx-auto leading-relaxed">
          AI-powered plant intelligence for hikers, farmers, foragers, and nature enthusiasts worldwide.
        </p>

        {stats && (
          <div className="flex items-center justify-center gap-4 mt-5 flex-wrap">
            <div className="stat-glow"><span className="text-xl font-bold text-violet-300">{(stats.total_scans||0).toLocaleString()}</span><p className="text-xs text-slate-500 mt-0.5">Scans</p></div>
            <div className="stat-glow"><span className="text-xl font-bold text-blue-300">{(stats.species_count||0).toLocaleString()}</span><p className="text-xs text-slate-500 mt-0.5">Species</p></div>
            <div className="stat-glow"><span className="text-xl font-bold text-teal-300">{(stats.country_count||0).toLocaleString()}</span><p className="text-xs text-slate-500 mt-0.5">Countries</p></div>
          </div>
        )}

        <div className="flex items-center justify-center gap-3 mt-7 flex-wrap">
          <Btn onClick={() => onNav('scan')} size="lg">📷 Identify Now</Btn>
          <Btn onClick={() => onNav('survival')} variant="survival" size="lg">🏕️ Survival Mode</Btn>
          <Btn onClick={() => onNav('landscape')} variant="secondary" size="lg">🌍 Landscape</Btn>
        </div>
      </div>

      {/* Feature grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        {features.map((f, i) => (
          <Card key={i} onClick={() => onNav(f.action)} className="p-5 cursor-pointer">
            <div className="feature-icon-bubble">{f.icon}</div>
            <h3 className="text-sm font-bold text-zinc-100 mb-1">{f.title}</h3>
            <p className="text-xs text-slate-500 leading-relaxed">{f.desc}</p>
          </Card>
        ))}
      </div>

      {!user && (
        <Card className="p-8 text-center" style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.12), rgba(59,130,246,0.08))' }}>
          <h2 className="text-xl font-bold text-white mb-2">Start your FloraIQ journey</h2>
          <p className="text-sm text-slate-400 mb-6">Free forever. No credit card. Access all features with an account.</p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Btn onClick={() => onNav('signup')} size="lg">Create Free Account</Btn>
            <Btn onClick={() => onNav('scan')} variant="secondary" size="lg">Try Without Account</Btn>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Scan Page ─────────────────────────────────────────────────
const SCAN_MODES = [
  { id: 'plant',    label: 'Plant / Herb',   icon: '🌿', desc: 'Flowers, leaves, trees, herbs' },
  { id: 'insect',   label: 'Insect / Bug',   icon: '🐛', desc: 'Beetles, spiders, flies, butterflies' },
  { id: 'bird',     label: 'Bird',           icon: '🐦', desc: 'All bird species worldwide' },
  { id: 'mushroom', label: 'Mushroom',       icon: '🍄', desc: 'Edible, toxic, and medicinal fungi' },
  { id: 'reptile',  label: 'Reptile / Amphibian', icon: '🦎', desc: 'Snakes, lizards, frogs, turtles' },
  { id: 'marine',   label: 'Marine Life',   icon: '🐠', desc: 'Fish, coral, jellyfish, crustaceans' },
  { id: 'survival', label: 'Survival Scan', icon: '⚠️', desc: 'Edibility, danger level, emergency actions' },
];

function ScanPage({ onNav }) {
  const { user } = useAuth();
  const fileRef = useRef(null);
  const camRef = useRef(null);
  const videoRef = useRef(null);
  const [mode, setMode] = useState('plant');
  const [preview, setPreview] = useState(null);
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [stream, setStream] = useState(null);
  const [aiModel, setAiModel] = useState('');
  const [celebrate, setCelebrate] = useState(false);

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
      setStream(s); setCameraOpen(true);
      setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = s; }, 100);
    } catch { setError('Camera access denied. Use file upload instead.'); }
  };

  const capture = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext('2d').drawImage(videoRef.current, 0, 0);
    canvas.toBlob(blob => {
      const f = new File([blob], 'capture.jpg', { type: 'image/jpeg' });
      setFile(f); setPreview(canvas.toDataURL());
      stream?.getTracks().forEach(t => t.stop()); setStream(null); setCameraOpen(false); setResult(null);
    }, 'image/jpeg', 0.85);
  };

  const closeCamera = () => {
    stream?.getTracks().forEach(t => t.stop()); setStream(null); setCameraOpen(false);
  };

  const analyze = async () => {
    if (!file) return;
    setLoading(true); setError(''); setResult(null); setAiModel('');
    const fd = new FormData();
    fd.append('photo', file);
    fd.append('mode', mode);
    try {
      const r = await fetch(`${API}/scans`, { method: 'POST', credentials: 'include', body: fd });
      const d = await safeJson(r);
      if (!r.ok) throw new Error(d.error || 'Analysis failed');
      setResult(d);
      setAiModel(d.ai_model || d.model || '');
      setCelebrate(true);
      setTimeout(() => setCelebrate(false), 2000);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 pb-28">
      <h1 className="text-2xl font-extrabold text-white mb-6">Identify Organism</h1>

      <div className="mb-6">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">Scan Mode</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {SCAN_MODES.map(m => (
            <button key={m.id} onClick={() => setMode(m.id)}
              className={`p-3 rounded-xl border text-left transition-colors ${mode === m.id ? 'border-green-500 bg-green-500/10' : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'}`}>
              <div className="text-xl mb-1">{m.icon}</div>
              <div className="text-xs font-medium text-zinc-200">{m.label}</div>
              <div className="text-xs text-zinc-500 mt-0.5">{m.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {cameraOpen && (
        <div className="mb-6 relative rounded-2xl overflow-hidden border border-zinc-800">
          <video ref={videoRef} autoPlay playsInline className="w-full rounded-xl" />
          <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-3">
            <Btn onClick={capture} size="lg">📸 Capture</Btn>
            <Btn onClick={closeCamera} variant="secondary" size="lg">Cancel</Btn>
          </div>
        </div>
      )}

      {!cameraOpen && (
        <div className="mb-6">
          {preview ? (
            <div className="relative rounded-2xl overflow-hidden border border-zinc-800">
              <img src={preview} alt="Preview" className="w-full max-h-64 object-cover" />
              <button onClick={() => { setPreview(null); setFile(null); setResult(null); }}
                className="absolute top-3 right-3 bg-zinc-950/80 text-zinc-300 hover:text-white rounded-full w-8 h-8 flex items-center justify-center text-lg">×</button>
            </div>
          ) : (
            <div className="border-2 border-dashed border-zinc-700 rounded-2xl p-10 text-center hover:border-zinc-600 transition-colors cursor-pointer" onClick={() => fileRef.current?.click()}>
              <div className="text-4xl mb-3">📷</div>
              <p className="text-sm text-zinc-400 mb-1">Click to upload or drop an image</p>
              <p className="text-xs text-zinc-600">JPEG, PNG, WebP — up to 10MB</p>
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickFile} />
        </div>
      )}

      {error && (
        <div className="mb-4 p-4 bg-red-950/40 border border-red-700/40 rounded-xl flex gap-3 items-start">
          <span className="text-red-400 text-lg shrink-0">⚠️</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-red-300 font-medium">{error}</p>
            <p className="text-xs text-red-500 mt-1">Check your connection or try a clearer photo.</p>
          </div>
          <button onClick={() => { setError(''); if (file) analyze(); }}
            className="shrink-0 text-xs text-red-400 hover:text-red-200 underline underline-offset-2 transition-colors">
            Retry
          </button>
        </div>
      )}

      {aiModel && <p className="text-xs text-zinc-600 mb-3">Analyzed with <span className="text-green-400">{aiModel}</span></p>}

      <div className="flex gap-3 mb-6">
        {!cameraOpen && <Btn onClick={() => openCamera()} variant="secondary" className="flex-1">📷 Camera</Btn>}
        {!cameraOpen && <Btn onClick={() => fileRef.current?.click()} variant="secondary" className="flex-1">📁 Upload</Btn>}
        {file && !cameraOpen && <Btn onClick={analyze} disabled={loading} className="flex-1">{loading ? '🔄 Analyzing…' : '🔍 Analyze'}</Btn>}
      </div>

      {loading && (
        <Card className="p-8 text-center">
          <div className="text-5xl mb-3 animate-bounce">
            {SCAN_MODES.find(m => m.id === mode)?.icon || '🔍'}
          </div>
          <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-zinc-400">Running multi-model AI analysis…</p>
          <p className="text-xs text-zinc-600 mt-1">Gemini → GPT-4o → Claude chain</p>
        </Card>
      )}

      {celebrate && <ResultCelebration mode={mode} />}

      {result && (
        <div className="space-y-4">
          <ScanResult result={result} />
          {user && <Btn onClick={() => onNav('history')} variant="ghost" className="w-full">📜 View History</Btn>}
          {!user && <p className="text-xs text-center text-zinc-500"><button onClick={() => onNav('signup')} className="text-green-400 font-semibold hover:text-green-300 transition-colors">Sign up free</button> to save scans and view history.</p>}
        </div>
      )}
    </div>
  );
}

// ── History Page ──────────────────────────────────────────────
function HistoryPage() {
  const { user } = useAuth();
  const [scans, setScans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState(null);
  const PER_PAGE = 20;

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const q = new URLSearchParams({ page, limit: PER_PAGE, ...(filter !== 'all' && { mode: filter }) });
    fetch(`${API}/scans?${q}`, { credentials: 'include' })
      .then(r => r.json()).then(d => { setScans(Array.isArray(d.scans) ? d.scans : []); setTotal(d.total || 0); })
      .catch(() => {}).finally(() => setLoading(false));
  }, [user, page, filter]);

  const exportCsv = () => {
    window.open(`${API}/export/scans?format=csv`, '_blank');
  };

  if (!user) return (
    <div className="max-w-lg mx-auto px-4 py-16 text-center">
      <p className="text-zinc-500 mb-4">Sign in to view your scan history.</p>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 pb-28">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold text-white">Scan History</h1>
        <div className="flex items-center gap-2">
          <select value={filter} onChange={e => { setFilter(e.target.value); setPage(1); }} className="px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-xs text-zinc-300">
            <option value="all">All types</option>
            {SCAN_MODES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
          <Btn onClick={exportCsv} variant="secondary" size="sm">Export CSV</Btn>
        </div>
      </div>

      {loading && <div className="py-8 text-center"><div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin mx-auto" /></div>}
      {!loading && scans.length === 0 && <p className="text-center text-zinc-500 py-8">No scans yet. Go identify something!</p>}

      <div className="space-y-3">
        {scans.map(s => (
          <Card key={s.id} className="overflow-hidden">
            <div className="p-4 flex items-center justify-between cursor-pointer" onClick={() => setExpanded(expanded === s.id ? null : s.id)}>
              <div className="flex items-center gap-3">
                {s.image_url && <img src={s.image_url} className="w-10 h-10 rounded-lg object-cover" />}
                <div>
                  <p className="text-sm font-medium text-zinc-200">{s.common_name || 'Unknown'}</p>
                  <p className="text-xs text-zinc-500">{s.scientific_name || s.mode || ''} · {new Date(s.created_at).toLocaleDateString()}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {s.confidence && <Badge color="green">{s.confidence}%</Badge>}
                <span className="text-zinc-600 text-xs">{expanded === s.id ? '▲' : '▼'}</span>
              </div>
            </div>
            {expanded === s.id && (
              <div className="border-t border-zinc-800 p-4">
                <ScanResult result={{ identification: s, survival_assessment: s.survival_assessment, location: s.location, image_url: s.image_url }} />
              </div>
            )}
          </Card>
        ))}
      </div>

      {total > PER_PAGE && (
        <div className="flex items-center justify-center gap-3 mt-6">
          <Btn onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} variant="secondary" size="sm">← Prev</Btn>
          <span className="text-xs text-zinc-500">Page {page} of {Math.ceil(total / PER_PAGE)}</span>
          <Btn onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total / PER_PAGE)} variant="secondary" size="sm">Next →</Btn>
        </div>
      )}
    </div>
  );
}

// ── Library Page ──────────────────────────────────────────────
// taxonId = iNaturalist's internal taxon ID — used with observations/species_counts
// ancestor_id = same ID used to scope text searches to descendants of that taxon
const LIB_CATS = [
  { id: 'Plantae',        taxonId: 47126, label: 'Plants',    icon: '🌿', color: '#22c55e', desc: 'Flowers, trees, herbs, crops' },
  { id: 'Insecta',        taxonId: 47158, label: 'Insects',   icon: '🐛', color: '#f59e0b', desc: 'Beetles, butterflies, ants' },
  { id: 'Aves',           taxonId: 3,     label: 'Birds',     icon: '🐦', color: '#3b82f6', desc: 'All bird species worldwide' },
  { id: 'Fungi',          taxonId: 47170, label: 'Mushrooms', icon: '🍄', color: '#8b5cf6', desc: 'Edible, toxic, medicinal fungi' },
  { id: 'Reptilia',       taxonId: 26036, label: 'Reptiles',  icon: '🦎', color: '#ef4444', desc: 'Snakes, lizards, turtles' },
  { id: 'Actinopterygii', taxonId: 47178, label: 'Marine',    icon: '🐠', color: '#06b6d4', desc: 'Fish, coral, ocean life' },
  { id: 'Mammalia',       taxonId: 40151, label: 'Mammals',   icon: '🐆', color: '#f97316', desc: 'Wild mammals and predators' },
  { id: 'Arachnida',      taxonId: 47119, label: 'Spiders',   icon: '🕷️', color: '#a78bfa', desc: 'Spiders, scorpions, mites' },
];

const STATUS_COLORS = { LC: '#22c55e', NT: '#84cc16', VU: '#f59e0b', EN: '#f97316', CR: '#ef4444', EW: '#dc2626', EX: '#7f1d1d' };

function SpeciesModal({ sp, onClose }) {
  const inatUrl    = `https://www.inaturalist.org/taxa/${sp.id}`;
  const wikiUrl    = sp.wikipedia_url;
  const status     = sp.conservation_status?.status?.toUpperCase() || 'LC';
  const statusColor = STATUS_COLORS[status] || '#6b7280';
  const img        = sp.default_photo?.medium_url;
  const obs        = sp.observations_count ? sp.observations_count.toLocaleString() : '—';
  const name       = sp.preferred_common_name || sp.name;
  const sciName    = sp.name;
  const taxon      = sp.iconic_taxon_name || '';
  const ytQuery    = encodeURIComponent(`${name} ${sciName} species wildlife`);
  const ytSearchUrl = `https://www.youtube.com/results?search_query=${ytQuery}`;

  // Category-specific sources
  const extraSources = [];
  if (taxon === 'Aves')      extraSources.push({ label: '🐦 eBird — Bird Sightings & Range Maps', url: `https://ebird.org/search?q=${encodeURIComponent(sciName)}`, bg: 'bg-teal-900 hover:bg-teal-800' }, { label: '🦅 All About Birds (Cornell)', url: `https://www.allaboutbirds.org/guide/search/?q=${encodeURIComponent(name)}`, bg: 'bg-sky-900 hover:bg-sky-800' }, { label: '🪶 Audubon Society', url: `https://www.audubon.org/search#${encodeURIComponent(name)}`, bg: 'bg-blue-900 hover:bg-blue-800' });
  if (taxon === 'Insecta')   extraSources.push({ label: '🐛 BugGuide — North American Insects', url: `https://bugguide.net/index.php?q=search&keys=${encodeURIComponent(sciName)}`, bg: 'bg-amber-900 hover:bg-amber-800' }, { label: '🦋 Butterflies & Moths of NA', url: `https://www.butterfliesandmoths.org/search?field_scientific_name=${encodeURIComponent(sciName)}`, bg: 'bg-orange-900 hover:bg-orange-800' });
  if (taxon === 'Fungi')     extraSources.push({ label: '🍄 Mushroom Observer', url: `https://mushroomobserver.org/observer/lookup_name?name=${encodeURIComponent(sciName)}`, bg: 'bg-purple-900 hover:bg-purple-800' }, { label: '🔬 Index Fungorum', url: `https://www.indexfungorum.org/names/Names.asp?name=${encodeURIComponent(sciName)}`, bg: 'bg-violet-900 hover:bg-violet-800' });
  if (taxon === 'Reptilia')  extraSources.push({ label: '🦎 Reptile Database', url: `https://www.reptile-database.org/db-info/SpecieSearch.html?taxon=${encodeURIComponent(sciName)}`, bg: 'bg-red-900 hover:bg-red-800' }, { label: '🐍 HerpMapper', url: `https://herpmapper.org/search?q=${encodeURIComponent(sciName)}`, bg: 'bg-rose-900 hover:bg-rose-800' });
  if (taxon === 'Actinopterygii' || taxon === 'Animalia') extraSources.push({ label: '🐠 FishBase', url: `https://www.fishbase.se/search.php?q=${encodeURIComponent(sciName)}`, bg: 'bg-cyan-900 hover:bg-cyan-800' }, { label: '🌊 OBIS — Ocean Biodiversity', url: `https://obis.org/taxon/${sp.id}`, bg: 'bg-blue-900 hover:bg-blue-800' });
  if (taxon === 'Plantae')   extraSources.push({ label: '🌺 Plants of the World (Kew)', url: `https://powo.science.kew.org/results?q=${encodeURIComponent(sciName)}`, bg: 'bg-green-900 hover:bg-green-800' }, { label: '🌾 USDA PLANTS Database', url: `https://plants.usda.gov/search?query=${encodeURIComponent(sciName)}`, bg: 'bg-lime-900 hover:bg-lime-800' });
  if (taxon === 'Mammalia')  extraSources.push({ label: '🐆 IUCN Red List', url: `https://www.iucnredlist.org/search?query=${encodeURIComponent(sciName)}`, bg: 'bg-orange-900 hover:bg-orange-800' }, { label: '🐘 Wildscreen Arkive', url: `https://www.wildscreen.org/species/${encodeURIComponent(name.replace(/ /g,'-'))}`, bg: 'bg-amber-900 hover:bg-amber-800' });
  if (taxon === 'Arachnida') extraSources.push({ label: '🕷️ World Spider Catalog', url: `https://wsc.nmbe.ch/search?sSearch=${encodeURIComponent(sciName)}`, bg: 'bg-slate-800 hover:bg-slate-700' });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Hero image with YouTube overlay */}
        <div className="relative">
          {img && <img src={img} alt={sp.name} className="w-full h-52 object-cover rounded-t-2xl" />}
          <a href={ytSearchUrl} target="_blank" rel="noopener noreferrer"
            className="absolute bottom-3 right-3 flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold px-3 py-2 rounded-xl shadow-lg transition">
            ▶ Watch on YouTube
          </a>
        </div>

        <div className="p-5 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-xl font-extrabold text-white capitalize">{name}</h2>
              <p className="text-sm italic text-zinc-400">{sciName}</p>
            </div>
            <span className="text-xs font-bold px-2 py-1 rounded-full shrink-0" style={{ background: statusColor + '22', color: statusColor, border: `1px solid ${statusColor}55` }}>{status}</span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs text-zinc-400">
            <div className="bg-zinc-800 rounded-lg p-2"><span className="text-zinc-500 block">Observations</span><p className="font-bold text-white">{obs}</p></div>
            <div className="bg-zinc-800 rounded-lg p-2"><span className="text-zinc-500 block">Rank</span><p className="font-bold text-white capitalize">{sp.rank || 'species'}</p></div>
            <div className="bg-zinc-800 rounded-lg p-2"><span className="text-zinc-500 block">Group</span><p className="font-bold text-white capitalize">{taxon || '—'}</p></div>
          </div>

          {sp.wikipedia_summary && <p className="text-sm text-zinc-400 leading-relaxed">{sp.wikipedia_summary}</p>}

          {/* Core sources — all species */}
          <div className="flex flex-col gap-2 pt-1">
            <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Core Sources</p>
            {wikiUrl && <a href={wikiUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2.5 bg-blue-700 hover:bg-blue-600 text-white text-sm font-semibold rounded-xl transition">📖 Wikipedia — Full Species Article</a>}
            <a href={inatUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-semibold rounded-xl transition">🌍 iNaturalist — Sightings & Photos</a>
            <a href={`https://www.gbif.org/species/search?q=${encodeURIComponent(sciName)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2.5 bg-zinc-700 hover:bg-zinc-600 text-white text-sm font-semibold rounded-xl transition">🔬 GBIF — Scientific Occurrence Data</a>
            <a href={`https://eol.org/search?q=${encodeURIComponent(sciName)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2.5 bg-indigo-800 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition">🌐 Encyclopedia of Life</a>
            <a href={`https://www.itis.gov/servlet/SingleRpt/SingleRpt?search_topic=Scientific_Name&search_value=${encodeURIComponent(sciName)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white text-sm font-semibold rounded-xl transition">🏛️ ITIS — Taxonomic Information</a>
            <a href={`https://animaldiversity.org/search/?q=${encodeURIComponent(sciName)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2.5 bg-stone-700 hover:bg-stone-600 text-white text-sm font-semibold rounded-xl transition">🦎 Animal Diversity Web (ADW)</a>
            <a href={`https://www.britannica.com/search?query=${encodeURIComponent(name)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-semibold rounded-xl transition">📚 Britannica — Natural Sciences</a>
          </div>

          {/* Category-specific sources */}
          {extraSources.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Specialist Sources</p>
              {extraSources.map((s, i) => (
                <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className={`flex items-center gap-2 px-4 py-2.5 text-white text-sm font-semibold rounded-xl transition ${s.bg}`}>{s.label}</a>
              ))}
            </div>
          )}

          {/* Video links */}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Video</p>
            <a href={ytSearchUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2.5 bg-red-700 hover:bg-red-600 text-white text-sm font-semibold rounded-xl transition">▶️ YouTube — Species Videos</a>
            <a href={`https://www.youtube.com/results?search_query=${encodeURIComponent(name + ' documentary nature')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2.5 bg-red-900 hover:bg-red-800 text-white text-sm font-semibold rounded-xl transition">🎬 YouTube — Nature Documentaries</a>
          </div>

          {/* Search Engines */}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Search Online</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { icon: '🔍', label: 'Google', href: `https://www.google.com/search?q=${encodeURIComponent(name + ' ' + sciName)}`, cls: 'bg-blue-950/40 border-blue-700/40 text-blue-300 hover:bg-blue-950/70' },
                { icon: '🦆', label: 'DuckDuckGo', href: `https://duckduckgo.com/?q=${encodeURIComponent(name + ' species')}`, cls: 'bg-orange-950/40 border-orange-700/40 text-orange-300 hover:bg-orange-950/70' },
                { icon: '🔎', label: 'Bing', href: `https://www.bing.com/search?q=${encodeURIComponent(sciName + ' species')}`, cls: 'bg-cyan-950/40 border-cyan-700/40 text-cyan-300 hover:bg-cyan-950/70' },
                { icon: '🖼️', label: 'Google Images', href: `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(name + ' ' + sciName)}`, cls: 'bg-green-950/40 border-green-700/40 text-green-300 hover:bg-green-950/70' },
              ].map(s => (
                <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer"
                  className={`flex items-center gap-2 px-3 py-2.5 border rounded-xl text-sm font-semibold transition ${s.cls}`}>
                  {s.icon} {s.label}
                </a>
              ))}
            </div>
          </div>

          <button onClick={onClose} className="w-full mt-2 py-2 text-sm text-zinc-500 hover:text-zinc-300 transition">Close</button>
        </div>
      </div>
    </div>
  );
}

function LibraryPage() {
  const [category, setCategory] = useState('Plantae');
  const [species, setSpecies]   = useState([]);
  const [loading, setLoading]   = useState(false);
  const [selected, setSelected] = useState(null);
  const [query, setQuery]       = useState('');
  const [isSearchMode, setIsSearchMode] = useState(false);
  const debounceRef  = useRef(null);
  const abortRef     = useRef(null);  // cancel in-flight requests on category switch
  const categoryRef  = useRef('Plantae'); // always current — avoids stale closure in debounce
  const catInfo = LIB_CATS.find(c => c.id === category) || LIB_CATS[0];

  const loadCategory = async (catId) => {
    const cat = LIB_CATS.find(c => c.id === catId);
    if (!cat) return;
    categoryRef.current = catId;
    setCategory(catId); setIsSearchMode(false); setQuery(''); setLoading(true); setSpecies([]);

    // Cancel any previous in-flight request to prevent race conditions
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      // Use observations/species_counts with taxonId — this is the correct iNaturalist approach
      // that guarantees Reptilia returns ONLY reptiles, Aves returns ONLY birds, etc.
      const r = await fetch(
        `https://api.inaturalist.org/v1/observations/species_counts?taxon_id=${cat.taxonId}&photos=true&quality_grade=research&per_page=48&order=desc&order_by=count`,
        { signal: ctrl.signal }
      );
      const d = await r.json();
      // species_counts wraps each species in { count, taxon }
      const list = (d.results || []).map(item => item.taxon).filter(s => s?.default_photo?.medium_url);
      if (!ctrl.signal.aborted) setSpecies(list);
    } catch (e) {
      if (e.name !== 'AbortError') setSpecies([]);
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  };

  const doSearch = async (q, catId) => {
    if (!q.trim()) { loadCategory(catId); return; }
    const cat = LIB_CATS.find(c => c.id === catId);
    if (!cat) return;

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true); setIsSearchMode(true); setSpecies([]);

    try {
      // ancestor_id scopes the text search to descendants of that taxon — birds in birds, reptiles in reptiles
      const r = await fetch(
        `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(q)}&ancestor_id=${cat.taxonId}&rank=species&per_page=48&photos=true&order_by=observations_count&order=desc`,
        { signal: ctrl.signal }
      );
      const d = await r.json();
      if (!ctrl.signal.aborted) setSpecies((d.results || []).filter(s => s.default_photo?.medium_url));
    } catch (e) {
      if (e.name !== 'AbortError') setSpecies([]);
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  };

  const handleInput = e => {
    const val = e.target.value;
    setQuery(val);
    clearTimeout(debounceRef.current);
    // Use categoryRef.current so debounce always uses latest category, not stale closure
    debounceRef.current = setTimeout(() => doSearch(val, categoryRef.current), 300);
  };

  useEffect(() => { loadCategory('Plantae'); }, []);
  useEffect(() => () => { clearTimeout(debounceRef.current); abortRef.current?.abort(); }, []);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 pb-28">
      <h1 className="text-2xl font-extrabold text-white mb-2">Species Library</h1>
      <p className="text-sm text-zinc-500 mb-5">
        {isSearchMode
          ? `Showing ${catInfo.label} matching "${query}"`
          : `Top ${catInfo.label.toLowerCase()} species — click any for 10+ data sources & video`}
      </p>

      {/* Category tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
        {LIB_CATS.map(cat => (
          <button key={cat.id} onClick={() => loadCategory(cat.id)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition border"
            style={category === cat.id
              ? { background: cat.color + '22', color: cat.color, borderColor: cat.color + '55' }
              : { background: '#18181b', color: '#a1a1aa', borderColor: '#3f3f46' }}>
            {cat.icon} {cat.label}
          </button>
        ))}
      </div>

      {/* Instant search — stays within active category */}
      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <input
            value={query}
            onChange={handleInput}
            placeholder={`Search ${catInfo.label.toLowerCase()} — type to search instantly…`}
            className="w-full px-4 py-2.5 bg-zinc-900 border border-zinc-700 rounded-xl text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500 pr-8"
          />
          {loading && query && <span className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full animate-spin"/>}
        </div>
        {(isSearchMode || query) && (
          <button onClick={() => { setQuery(''); loadCategory(category); }} className="px-3 py-2.5 bg-zinc-800 text-zinc-400 text-sm rounded-xl hover:text-white">✕</button>
        )}
      </div>
      {/* Web search engines */}
      <div className="flex gap-2 flex-wrap mb-5">
        <span className="text-xs text-zinc-600 self-center">Search web:</span>
        {[
          { label: '🔍 Google', base: 'https://www.google.com/search?q=', color: 'border-blue-700/40 text-blue-400 hover:bg-blue-950/30' },
          { label: '🦆 DuckDuckGo', base: 'https://duckduckgo.com/?q=', color: 'border-orange-700/40 text-orange-400 hover:bg-orange-950/30' },
          { label: '🔎 Bing', base: 'https://www.bing.com/search?q=', color: 'border-cyan-700/40 text-cyan-400 hover:bg-cyan-950/30' },
          { label: '📖 Wikipedia', base: 'https://en.wikipedia.org/wiki/Special:Search?search=', color: 'border-zinc-600 text-zinc-400 hover:bg-zinc-800' },
        ].map(s => {
          const searchTerm = query.trim() ? `${query} ${catInfo.label}` : `${catInfo.label} species`;
          return (
            <a key={s.label} href={`${s.base}${encodeURIComponent(searchTerm)}`} target="_blank" rel="noreferrer"
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${s.color}`}>
              {s.label}
            </a>
          );
        })}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
          {Array.from({ length: 24 }).map((_, i) => (
            <div key={i} className="aspect-square rounded-xl bg-zinc-800 animate-pulse" />
          ))}
        </div>
      ) : species.length === 0 ? (
        <div className="text-center py-16 text-zinc-500">No results found. Try a different search.</div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
          {species.map(sp => {
            const status = sp.conservation_status?.status?.toUpperCase();
            const isDangerous = ['CR','EN','EX'].includes(status);
            const isVulnerable = status === 'VU';
            return (
              <div key={sp.id} onClick={() => setSelected(sp)}
                className="group relative cursor-pointer rounded-xl overflow-hidden border border-zinc-800 hover:border-zinc-600 transition aspect-square">
                <img src={sp.default_photo?.square_url || sp.default_photo?.medium_url} alt={sp.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                {isDangerous && <span className="absolute top-1.5 right-1.5 text-xs bg-red-600 text-white px-1.5 py-0.5 rounded-full font-bold">☠️</span>}
                {isVulnerable && <span className="absolute top-1.5 right-1.5 text-xs bg-orange-500 text-white px-1.5 py-0.5 rounded-full font-bold">⚠️</span>}
                <div className="absolute bottom-0 left-0 right-0 p-2">
                  <p className="text-white text-xs font-bold leading-tight capitalize truncate">{sp.preferred_common_name || sp.name}</p>
                  <p className="text-zinc-400 text-[10px] italic truncate">{sp.name}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selected && <SpeciesModal sp={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

// ── Survival Page ─────────────────────────────────────────────
function TrailsTab() {
  const { user } = useAuth();
  const [trails, setTrails] = useState([]);
  const [form, setForm] = useState({ name: '', destination: '', expected_return: '', emergency_contact: '' });
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetch(`${API}/survival/trails`, { credentials: 'include' }).then(r => r.json()).then(d => setTrails(Array.isArray(d) ? d : [])).catch(() => {});
  }, [user]);

  const createTrail = async e => {
    e.preventDefault(); setCreating(true);
    try {
      const r = await fetch(`${API}/survival/trails`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const d = await r.json();
      if (r.ok) { setTrails(t => [d, ...t]); setForm({ name: '', destination: '', expected_return: '', emergency_contact: '' }); }
    } catch {} finally { setCreating(false); }
  };

  const checkIn = async id => {
    setLoading(true);
    navigator.geolocation.getCurrentPosition(async pos => {
      await fetch(`${API}/survival/trails/${id}/checkin`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }) }).catch(() => {});
      setLoading(false);
    }, () => setLoading(false));
  };

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <h3 className="text-base font-bold text-zinc-100 mb-4">Register Trail</h3>
        <form onSubmit={createTrail} className="space-y-3">
          <Input label="Trail Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Morning Hike — Palawan" required />
          <Input label="Destination" value={form.destination} onChange={e => setForm(f => ({ ...f, destination: e.target.value }))} placeholder="Mt. Pulag Summit" required />
          <Input label="Expected Return" type="datetime-local" value={form.expected_return} onChange={e => setForm(f => ({ ...f, expected_return: e.target.value }))} required />
          <Input label="Emergency Contact" type="tel" value={form.emergency_contact} onChange={e => setForm(f => ({ ...f, emergency_contact: e.target.value }))} placeholder="+1 555 0100" required />
          <Btn type="submit" disabled={creating} variant="survival" className="w-full">{creating ? 'Registering…' : '🏕️ Register Trail'}</Btn>
        </form>
      </Card>
      {trails.map(t => (
        <Card key={t.id} className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-zinc-200">{t.name}</p>
              <p className="text-xs text-zinc-500">{t.destination} · Return: {new Date(t.expected_return).toLocaleString()}</p>
            </div>
            <Btn onClick={() => checkIn(t.id)} disabled={loading} variant="survival" size="sm">📍 Check In</Btn>
          </div>
          {t.last_checkin && <p className="text-xs text-zinc-600 mt-1">Last check-in: {new Date(t.last_checkin).toLocaleString()}</p>}
        </Card>
      ))}
    </div>
  );
}

function SurvivalPage({ onNav }) {
  const [tab, setTab] = useState('scanner');
  const [guide, setGuide] = useState(null);
  const [guideLoading, setGuideLoading] = useState(false);
  const [sosLoading, setSosLoading] = useState(false);
  const [sosMsg, setSosMsg] = useState('');

  const loadGuide = async () => {
    setGuideLoading(true);
    const r = await fetch(`${API}/survival/guide`, { method: 'GET' }).catch(() => null);
    if (r?.ok) { const d = await r.json(); setGuide(d.guide || d); }
    setGuideLoading(false);
  };

  const sendSOS = async () => {
    setSosLoading(true); setSosMsg('');
    navigator.geolocation.getCurrentPosition(async pos => {
      const r = await fetch(`${API}/survival/sos`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, message: 'SOS from FloraIQ app' }) }).catch(() => null);
      setSosMsg(r?.ok ? '✅ SOS sent! Emergency contacts notified.' : '⚠️ SOS queued offline — will send when connected.');
      setSosLoading(false);
    }, () => { setSosMsg('⚠️ Location unavailable. SOS queued.'); setSosLoading(false); });
  };

  const survivalTabs = ['scanner', 'guide', 'sos', 'trails'];

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 pb-28">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-3xl">🏕️</span>
        <div>
          <h1 className="text-2xl font-extrabold text-white">Survival Toolkit</h1>
          <p className="text-xs text-zinc-500">For hikers, campers, and wilderness explorers</p>
        </div>
      </div>

      <div className="flex gap-1 mb-6 flex-wrap">
        {survivalTabs.map(t => (
          <button key={t} onClick={() => { setTab(t); if (t === 'guide' && !guide) loadGuide(); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${tab === t ? 'bg-amber-500 text-black font-bold' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}>
            {t === 'sos' ? '🆘 SOS' : t === 'trails' ? '🗺️ Trails' : t === 'guide' ? '📖 Guide' : '🔍 Scanner'}
          </button>
        ))}
      </div>

      {tab === 'scanner' && (
        <div className="text-center py-8">
          <p className="text-zinc-400 mb-6 text-sm">Use the survival scan mode to assess edibility, danger level, and emergency actions for any organism you encounter.</p>
          <Btn onClick={() => onNav('scan')} variant="survival" size="lg" className="w-full max-w-sm mx-auto">Open Survival Scanner</Btn>
        </div>
      )}

      {tab === 'guide' && (
        <div>
          {guideLoading && <div className="py-8 text-center"><div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" /></div>}
          {guide && (
            <div className="space-y-4">
              {guide.sections?.map((s, i) => (
                <Card key={i} className="p-4">
                  <h3 className="text-sm font-bold text-amber-400 mb-2">{s.title}</h3>
                  <p className="text-sm text-zinc-300">{s.content}</p>
                  {s.tips?.length > 0 && <ul className="mt-2 space-y-1">{s.tips.map((tip, j) => <li key={j} className="text-xs text-zinc-400 flex gap-2"><span className="text-amber-400">•</span>{tip}</li>)}</ul>}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'sos' && (
        <Card className="p-8 text-center border-red-500/30">
          <div className="text-5xl mb-4">🆘</div>
          <h2 className="text-xl font-bold text-red-400 mb-2">Emergency SOS Beacon</h2>
          <p className="text-sm text-zinc-400 mb-6">Sends your GPS location to emergency contacts. Works offline via background sync.</p>
          <Btn onClick={sendSOS} disabled={sosLoading} variant="danger" size="lg" className="w-full max-w-xs mx-auto text-red-400 border-red-500">{sosLoading ? '📡 Sending…' : '🆘 SEND SOS'}</Btn>
          {sosMsg && <p className="mt-4 text-sm text-zinc-300">{sosMsg}</p>}
          <div className="mt-6 text-xs text-zinc-600 space-y-1">
            <p>Local emergency numbers: 112 (EU) · 911 (US) · 999 (UK) · 000 (AU)</p>
            <p>Philippine SAR: +63 2 8365 4705</p>
          </div>
        </Card>
      )}

      {tab === 'trails' && <TrailsTab />}
    </div>
  );
}

// ── Cesium 3D Globe ───────────────────────────────────────────
function loadCesium() {
  return new Promise((resolve, reject) => {
    if (window.Cesium) { resolve(); return; }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cesium.com/downloads/cesiumjs/releases/1.124/Build/Cesium/Widgets/widgets.css';
    document.head.appendChild(link);
    const script = document.createElement('script');
    script.src = 'https://cesium.com/downloads/cesiumjs/releases/1.124/Build/Cesium/Cesium.js';
    script.onload  = () => resolve();
    script.onerror = () => reject(new Error('Failed to load CesiumJS'));
    document.head.appendChild(script);
  });
}

function CesiumGlobe({ sightings, layers, disasters }) {
  const globeRef  = useRef(null);
  const viewerRef = useRef(null);
  const [ready, setReady]       = useState(false);
  const [loading, setLoading]   = useState(true);
  const [err, setErr]           = useState(null);
  const [flyInput, setFlyInput] = useState('');
  const [satellites, setSatellites] = useState([]);

  // Load CesiumJS CDN once
  useEffect(() => {
    let alive = true;
    loadCesium()
      .then(() => { if (alive) setReady(true); })
      .catch(e => { if (alive) setErr(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  // Fetch ISS + Sentinel-2A TLE positions for live satellite tracking
  useEffect(() => {
    if (!ready) return;
    const TLE_SATS = [
      { name: 'ISS',        noradId: 25544 },
      { name: 'Sentinel-2A', noradId: 40697 },
      { name: 'Landsat-9',  noradId: 49260 },
    ];
    Promise.allSettled(
      TLE_SATS.map(sat =>
        fetch(`https://celestrak.org/SPACETRACK/query/class=gp&CATNR=${sat.noradId}&FORMAT=JSON`)
          .then(r => r.ok ? r.json() : null)
          .then(data => data?.[0] ? { ...sat, tle: data[0] } : null)
          .catch(() => null)
      )
    ).then(results => {
      setSatellites(results.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value));
    });
  }, [ready]);

  // Initialize Cesium viewer
  useEffect(() => {
    if (!ready || !globeRef.current || viewerRef.current) return;
    if (!CESIUM_TOKEN) { setErr('No Cesium ion token — add VITE_CESIUM_ION_TOKEN to frontend/.env'); return; }

    const C = window.Cesium;
    C.Ion.defaultAccessToken = CESIUM_TOKEN;

    const viewer = new C.Viewer(globeRef.current, {
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
    });

    // Dark space, lighting, atmosphere
    viewer.scene.globe.enableLighting = true;
    viewer.scene.globe.showGroundAtmosphere = true;
    viewer.scene.backgroundColor = C.Color.BLACK;
    viewer.scene.skyBox.show = true;
    viewer.scene.moon = new C.Moon();
    viewer.scene.sun  = new C.Sun();

    // Add Cesium World Terrain (ion asset 1)
    C.createWorldTerrainAsync({ requestWaterMask: true, requestVertexNormals: true })
      .then(t => { if (viewerRef.current && !viewer.isDestroyed()) viewer.terrainProvider = t; })
      .catch(() => {});

    // Add Cesium OSM Buildings (ion asset 96188) — 3D city tiles
    C.IonResource.fromAssetId(96188).then(resource => {
      if (!viewerRef.current || viewer.isDestroyed()) return;
      return C.Cesium3DTileset.fromUrl(resource);
    }).then(tileset => {
      if (tileset && viewerRef.current && !viewer.isDestroyed()) {
        viewer.scene.primitives.add(tileset);
      }
    }).catch(() => {});

    // Start camera over equator
    viewer.camera.flyTo({
      destination: C.Cartesian3.fromDegrees(0, 20, 20000000),
      orientation: { heading: 0, pitch: C.Math.toRadians(-90), roll: 0 },
      duration: 0,
    });

    viewerRef.current = viewer;
    return () => {
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, [ready]);

  // ── Sightings entities ────────────────────────────────────────
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    const C = window.Cesium;
    viewer.entities.values.filter(e => e._floraSighting).forEach(e => viewer.entities.remove(e));
    const colorMap = {
      plant:'#22c55e', insect:'#f59e0b', bird:'#3b82f6',
      mushroom:'#8b5cf6', reptile:'#ef4444', marine:'#06b6d4', survival:'#f97316',
    };
    sightings.forEach(s => {
      if (!s.latitude || !s.longitude) return;
      const col = colorMap[s.scan_mode] || '#6b7280';
      const e = viewer.entities.add({
        position: C.Cartesian3.fromDegrees(s.longitude, s.latitude),
        point: {
          pixelSize: 9, color: C.Color.fromCssColorString(col),
          outlineColor: C.Color.WHITE, outlineWidth: 1,
          heightReference: C.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: s.common_name || s.scientific_name || '?',
          font: '11px Arial', fillColor: C.Color.WHITE,
          style: C.LabelStyle.FILL_AND_OUTLINE, outlineWidth: 2,
          outlineColor: C.Color.BLACK,
          verticalOrigin: C.VerticalOrigin.BOTTOM,
          pixelOffset: new C.Cartesian2(0, -14),
          distanceDisplayCondition: new C.DistanceDisplayCondition(0, 300000),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      e._floraSighting = true;
    });
  }, [sightings, ready]);

  // ── Earthquake entities ───────────────────────────────────────
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    const C = window.Cesium;
    viewer.entities.values.filter(e => e._floraQuake).forEach(e => viewer.entities.remove(e));
    if (!layers.quakes) return;
    disasters.quakes.forEach(eq => {
      const [lng, lat] = eq.geometry?.coordinates || [0,0];
      const mag = eq.properties?.mag || 5;
      const col = mag >= 7 ? '#7f1d1d' : mag >= 6 ? '#ef4444' : '#f97316';
      const e = viewer.entities.add({
        position: C.Cartesian3.fromDegrees(lng, lat),
        ellipse: {
          semiMinorAxis: mag * 40000, semiMajorAxis: mag * 40000,
          material: C.Color.fromCssColorString(col).withAlpha(0.35),
          outline: true, outlineColor: C.Color.fromCssColorString(col),
          outlineWidth: 2, heightReference: C.HeightReference.CLAMP_TO_GROUND,
        },
        label: {
          text: `M${mag}`, font: 'bold 13px Arial',
          fillColor: C.Color.fromCssColorString(col),
          style: C.LabelStyle.FILL, disableDepthTestDistance: Number.POSITIVE_INFINITY,
          distanceDisplayCondition: new C.DistanceDisplayCondition(0, 3000000),
        },
      });
      e._floraQuake = true;
    });
  }, [layers.quakes, disasters.quakes, ready]);

  // ── Fire entities ─────────────────────────────────────────────
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    const C = window.Cesium;
    viewer.entities.values.filter(e => e._floraFire).forEach(e => viewer.entities.remove(e));
    if (!layers.fires) return;
    disasters.fires.slice(0, 800).forEach(f => {
      const size = Math.max(4, Math.min(12, f.frp / 15 + 4));
      const e = viewer.entities.add({
        position: C.Cartesian3.fromDegrees(f.lng, f.lat),
        point: {
          pixelSize: size,
          color: C.Color.fromCssColorString('#f97316').withAlpha(0.85),
          outlineColor: C.Color.fromCssColorString('#fbbf24'), outlineWidth: 1,
          heightReference: C.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      e._floraFire = true;
    });
  }, [layers.fires, disasters.fires, ready]);

  // ── Satellite tracking entities ───────────────────────────────
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || satellites.length === 0) return;
    const C = window.Cesium;
    viewer.entities.values.filter(e => e._floraSat).forEach(e => viewer.entities.remove(e));
    satellites.forEach(sat => {
      // Rough LEO position estimate (without full SGP4 propagation)
      const inc = parseFloat(sat.tle?.INCLINATION || 51.6);
      const e = viewer.entities.add({
        position: C.Cartesian3.fromDegrees(0, inc > 45 ? 51 : 0, 420000),
        point: {
          pixelSize: 6, color: C.Color.CYAN,
          outlineColor: C.Color.WHITE, outlineWidth: 1,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: `🛰 ${sat.name}`, font: '11px Arial',
          fillColor: C.Color.CYAN, style: C.LabelStyle.FILL,
          pixelOffset: new C.Cartesian2(0, -14),
          distanceDisplayCondition: new C.DistanceDisplayCondition(0, 60000000),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      e._floraSat = true;
    });
  }, [satellites, ready]);

  // ── flyTo helpers ─────────────────────────────────────────────
  const flyTo = (lat, lng, altKm = 50) => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    viewer.camera.flyTo({
      destination: window.Cesium.Cartesian3.fromDegrees(lng, lat, altKm * 1000),
      orientation: {
        heading: window.Cesium.Math.toRadians(0),
        pitch:   window.Cesium.Math.toRadians(-45),
        roll:    0,
      },
      duration: 2.5,
      easingFunction: window.Cesium.EasingFunction.CUBIC_IN_OUT,
    });
  };

  const flyToMyLocation = () => {
    navigator.geolocation.getCurrentPosition(
      pos => flyTo(pos.coords.latitude, pos.coords.longitude, 8),
      () => {}
    );
  };

  const handleFly = e => {
    e.preventDefault();
    const parts = flyInput.split(',').map(p => parseFloat(p.trim()));
    if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      flyTo(parts[0], parts[1], parts[2] || 50);
      setFlyInput('');
    }
  };

  if (loading) return (
    <div className="w-full h-[560px] flex flex-col items-center justify-center bg-black rounded-2xl border border-zinc-800">
      <div className="w-14 h-14 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mb-4" />
      <p className="text-zinc-300 font-bold">Loading 3D Globe…</p>
      <p className="text-zinc-600 text-xs mt-1">CesiumJS ~4MB — one-time download</p>
    </div>
  );

  if (err) return (
    <div className="w-full h-[560px] flex flex-col items-center justify-center bg-black rounded-2xl border border-zinc-800 px-8 text-center">
      <p className="text-4xl mb-3">🌍</p>
      <p className="text-red-400 font-bold mb-1">Globe Error</p>
      <p className="text-zinc-500 text-sm">{err}</p>
    </div>
  );

  return (
    <div className="relative rounded-2xl overflow-hidden" style={{ border: '1px solid #3f3f46' }}>
      <div ref={globeRef} style={{ width: '100%', height: '560px' }} />
      {/* HUD controls */}
      <div className="absolute top-3 left-3 flex flex-col gap-2 z-10">
        <button onClick={flyToMyLocation}
          className="flex items-center gap-1.5 px-3 py-2 bg-black/80 backdrop-blur-sm border border-zinc-700 rounded-lg text-xs text-zinc-200 hover:border-violet-500 hover:text-white transition-colors">
          📍 My Location
        </button>
        <form onSubmit={handleFly} className="flex gap-1">
          <input value={flyInput} onChange={e => setFlyInput(e.target.value)}
            placeholder="lat, lng, km"
            className="px-2 py-1.5 bg-black/80 backdrop-blur-sm border border-zinc-700 rounded-lg text-xs text-zinc-300 placeholder-zinc-700 w-32 focus:outline-none focus:border-violet-500" />
          <button type="submit" className="px-2.5 py-1.5 bg-violet-600 hover:bg-violet-500 rounded-lg text-xs text-white font-bold transition-colors">Fly ↗</button>
        </form>
        {satellites.length > 0 && (
          <div className="px-2 py-1.5 bg-black/80 backdrop-blur-sm border border-cyan-700/50 rounded-lg">
            <p className="text-xs text-cyan-400 font-bold">🛰 {satellites.length} satellites tracked</p>
          </div>
        )}
      </div>
      <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between pointer-events-none">
        <div className="px-2 py-1 bg-black/70 backdrop-blur-sm rounded-lg text-xs text-zinc-500">
          Cesium World Terrain · OSM Buildings · Ion ✓
        </div>
        <div className="px-2 py-1 bg-black/70 backdrop-blur-sm rounded-lg text-xs text-zinc-500">
          {sightings.length} sightings
          {layers.quakes && disasters.quakes.length > 0 && ` · ${disasters.quakes.length} quakes`}
          {layers.fires  && disasters.fires.length  > 0 && ` · ${disasters.fires.length} fires`}
        </div>
      </div>
    </div>
  );
}

// ── Map Page ──────────────────────────────────────────────────
const DISASTER_LAYERS = [
  { id: 'quakes',   label: 'Earthquakes',    icon: '🔴', color: '#ef4444' },
  { id: 'gdacs',    label: 'Floods/Storms',  icon: '🌊', color: '#3b82f6' },
  { id: 'fires',    label: 'Active Fires',   icon: '🔥', color: '#f97316' },
  { id: 'weather',  label: 'Weather Alerts', icon: '⛈️', color: '#f59e0b' },
  { id: 'relief',   label: 'Active Disasters',icon: '🆘', color: '#a855f7' },
  { id: 'radar',    label: 'Live Radar',     icon: '🌧️', color: '#06b6d4' },
];

const GDACS_COLORS = { eq: '#ef4444', tc: '#8b5cf6', fl: '#3b82f6', dr: '#f59e0b', wf: '#f97316', vo: '#dc2626' };

function MapPage() {
  const mapRef      = useRef(null);
  const leafletMap  = useRef(null);
  const tileLayerRef = useRef(null);
  const [sightings, setSightings]   = useState([]);
  const [filter, setFilter]         = useState('all');
  const [loading, setLoading]       = useState(true);
  const [satellite, setSatellite]   = useState(false);
  const [layers, setLayers]         = useState({ quakes: false, gdacs: false, fires: false, weather: false, relief: false, radar: false });
  const [disasters, setDisasters]   = useState({ quakes: [], gdacs: [], fires: [], weather: [], relief: [], radar: [] });
  const [loadingDis, setLoadingDis] = useState({});
  const [disPanel, setDisPanel]     = useState(null);
  const [radarTs, setRadarTs]       = useState(null);
  const [globeMode, setGlobeMode]   = useState(false);

  useEffect(() => {
    fetch(`${API}/map/sightings?limit=500`).then(r => r.json()).then(d => setSightings(Array.isArray(d) ? d : [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const toggleLayer = async (id) => {
    const next = !layers[id];
    setLayers(l => ({ ...l, [id]: next }));

    if (id === 'radar') {
      if (next && !radarTs) {
        setLoadingDis(l => ({ ...l, radar: true }));
        try {
          const r = await fetch('https://api.rainviewer.com/public/weather-maps.json');
          const d = await r.json();
          const ts = d.radar?.past?.[d.radar.past.length - 1]?.time;
          if (ts) setRadarTs(ts);
        } catch {}
        setLoadingDis(l => ({ ...l, radar: false }));
      }
      return;
    }

    if (next && disasters[id].length === 0) {
      setLoadingDis(l => ({ ...l, [id]: true }));
      try {
        let url = '';
        if (id === 'quakes') url = 'https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minmagnitude=4.5&limit=150&orderby=time';
        if (id === 'gdacs')   url = `${API}/disasters/gdacs`;
        if (id === 'fires')   url = `${API}/disasters/fires`;
        if (id === 'weather') url = `${API}/disasters/weather-alerts`;
        if (id === 'relief')  url = `${API}/disasters/reliefweb`;
        const r = await fetch(url); const d = await r.json();
        if (id === 'quakes') setDisasters(p => ({ ...p, quakes: d.features || [] }));
        else setDisasters(p => ({ ...p, [id]: d }));
      } catch {}
      setLoadingDis(l => ({ ...l, [id]: false }));
    }
  };

  useEffect(() => {
    if (!mapRef.current || globeMode) return;
    initLeaflet();
    function initLeaflet() {
      if (!mapRef.current || globeMode) return;
      if (leafletMap.current) { leafletMap.current.remove(); leafletMap.current = null; }
      const map = L.map(mapRef.current, { center: [20, 0], zoom: 2, zoomControl: true });
      // Esri public tiles — no API key, no CDN blocking, proper CORS
      const tileUrl = satellite
        ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
        : 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';
      const tileAttr = satellite ? 'Tiles © Esri | Airbus | USGS' : 'Tiles © Esri | DeLorme | HERE';
      tileLayerRef.current = L.tileLayer(tileUrl, { attribution: tileAttr, maxZoom: 19 }).addTo(map);
      const colorMap = { plant: '#22c55e', insect: '#f59e0b', bird: '#3b82f6', mushroom: '#8b5cf6', reptile: '#ef4444', marine: '#06b6d4', survival: '#f97316' };
      const filtered = filter === 'all' ? sightings : sightings.filter(s => s.scan_mode === filter);
      filtered.forEach(s => {
        if (!s.latitude || !s.longitude) return;
        const color = colorMap[s.scan_mode] || '#6b7280';
        L.circleMarker([s.latitude, s.longitude], { radius: 6, fillColor: color, color: '#fff', weight: 1, fillOpacity: 0.85 })
          .addTo(map)
          .bindPopup(`<b>${escHtml(s.common_name || 'Unknown')}</b><br><i>${escHtml(s.scientific_name || '')}</i><br><small>${escHtml(s.country || '')}</small>`);
      });

      // Earthquake overlay
      if (layers.quakes) {
        disasters.quakes.forEach(eq => {
          const [lng, lat] = eq.geometry.coordinates;
          const mag = eq.properties.mag || 5;
          const color = mag >= 7 ? '#7f1d1d' : mag >= 6 ? '#ef4444' : '#f87171';
          L.circleMarker([lat, lng], { radius: Math.max(5, mag * 3), fillColor: color, color: '#fff', weight: 1, fillOpacity: 0.8 })
            .addTo(map)
            .bindPopup(`<b>🔴 M${escHtml(String(mag))} Earthquake</b><br>${escHtml(eq.properties.place)}<br><small>${escHtml(new Date(eq.properties.time).toLocaleString())}</small>`);
        });
      }

      // NASA FIRMS real-time fire overlay
      if (layers.fires) {
        disasters.fires.forEach(f => {
          const intensity = Math.min(Math.max(f.frp / 100, 0.4), 1);
          const radius = Math.max(3, Math.min(8, f.frp / 30 + 3));
          L.circleMarker([f.lat, f.lng], {
            radius, fillColor: '#f97316', color: '#fbbf24', weight: 1, fillOpacity: intensity,
          }).addTo(map)
            .bindPopup(`<b>🔥 Active Fire</b><br>${escHtml(f.date || '')} ${escHtml(f.time || '')}<br><small>FRP: ${f.frp} MW · ${escHtml(f.confidence || '')} confidence · ${escHtml(f.satellite || '')}</small>`);
        });
      }

      // GDACS overlay (floods, cyclones, volcanoes, wildfires)
      if (layers.gdacs) {
        disasters.gdacs.forEach(ev => {
          if (!ev.lat || !ev.lng) return;
          const color = GDACS_COLORS[ev.type] || '#6b7280';
          const icon = ev.type === 'tc' ? '🌀' : ev.type === 'fl' ? '🌊' : ev.type === 'vo' ? '🌋' : ev.type === 'wf' ? '🔥' : ev.type === 'dr' ? '🏜️' : '⚠️';
          L.circleMarker([ev.lat, ev.lng], { radius: 10, fillColor: color, color: '#fff', weight: 1.5, fillOpacity: 0.85 })
            .addTo(map)
            .bindPopup(`<b>${icon} ${escHtml(ev.name || ev.type?.toUpperCase() || '')}</b><br>${escHtml(ev.country || '')}<br><span style="color:${ev.alert==='red'?'#ef4444':ev.alert==='orange'?'#f97316':'#22c55e'}">${escHtml((ev.alert||'').toUpperCase())} ALERT</span><br><small>${escHtml(ev.description || '')}</small>`);
        });
      }

      // NOAA weather alerts (US bounding boxes — show as list, not map pins)
      if (layers.weather && disasters.weather.length > 0) {
        L.popup({ maxWidth: 320 })
          .setLatLng([38, -96])
          .setContent(`<b>⛈️ ${disasters.weather.length} Active US Weather Alerts</b><br>Click "Weather Alerts" panel below for details.`)
          .addTo(map);
      }

      // RainViewer live precipitation radar overlay
      if (layers.radar && radarTs) {
        L.tileLayer(
          `https://tilecache.rainviewer.com/v2/radar/${radarTs}/512/{z}/{x}/{y}/4/1_1.png`,
          { opacity: 0.55, attribution: '© RainViewer', errorTileUrl: '', maxZoom: 12 }
        ).addTo(map);
      }

      leafletMap.current = map;
      setTimeout(() => map.invalidateSize(), 200);
    }
    return () => { if (leafletMap.current) { leafletMap.current.remove(); leafletMap.current = null; } };
  }, [sightings, filter, layers, disasters, satellite, radarTs, globeMode]);

  const totalDisasters = Object.entries(layers).filter(([id, on]) => on && id !== 'radar').reduce((acc, [id]) => acc + (disasters[id]?.length || 0), 0);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 pb-28">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-extrabold text-white">{globeMode ? '🌐 3D Globe' : '🌍 Global Intelligence Map'}</h1>
          <p className="text-xs text-zinc-500 mt-0.5">{globeMode ? 'Cesium World Terrain · real-time planetary intelligence' : 'Live species sightings + real-time disaster data'}</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          {/* 3D Globe toggle */}
          <button onClick={() => setGlobeMode(g => !g)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${globeMode ? 'bg-violet-900/60 border-violet-500 text-violet-300' : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-white'}`}>
            {globeMode ? '🗺️ 2D Map' : '🌐 3D Globe'}
          </button>
          {!globeMode && (
            <button onClick={() => setSatellite(s => !s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${satellite ? 'bg-blue-900/60 border-blue-600 text-blue-300' : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-white'}`}>
              🛰️ {satellite ? 'Satellite' : 'Standard'}
            </button>
          )}
          {!globeMode && (
            <select value={filter} onChange={e => setFilter(e.target.value)} className="px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-xs text-zinc-300">
              <option value="all">All Species</option>
              {SCAN_MODES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Disaster layer toggles */}
      <div className="flex gap-2 flex-wrap mb-3">
        {DISASTER_LAYERS.map(dl => (
          <button key={dl.id} onClick={() => toggleLayer(dl.id)} disabled={loadingDis[dl.id]}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition ${layers[dl.id] ? 'text-white border-opacity-60' : 'bg-zinc-900 border-zinc-700 text-zinc-500 hover:text-zinc-300'}`}
            style={layers[dl.id] ? { background: dl.color + '22', borderColor: dl.color + '88', color: dl.color } : {}}>
            {loadingDis[dl.id] ? <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin inline-block" /> : dl.icon}
            {dl.label}
            {layers[dl.id] && disasters[dl.id]?.length > 0 && <span className="ml-0.5 opacity-70">({disasters[dl.id].length})</span>}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-zinc-500 mb-3">Loading sightings…</p>}

      {/* Map — 2D Leaflet or 3D Cesium Globe */}
      {globeMode ? (
        <CesiumGlobe sightings={sightings} layers={layers} disasters={disasters} />
      ) : (
        <div ref={mapRef} style={{ width: '100%', height: '520px', borderRadius: '1rem', border: '1px solid #3f3f46', background: '#0c0c0e' }} />
      )}

      {/* Legend + stats */}
      <div className="flex flex-wrap gap-x-4 gap-y-2 mt-3 items-center">
        <p className="text-xs text-zinc-600 mr-2">Species:</p>
        {[['plant','#22c55e'],['insect','#f59e0b'],['bird','#3b82f6'],['mushroom','#8b5cf6'],['reptile','#ef4444'],['marine','#06b6d4']].map(([k,c]) => (
          <div key={k} className="flex items-center gap-1.5 text-xs text-zinc-400 capitalize"><span className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />{k}</div>
        ))}
        {totalDisasters > 0 && <span className="ml-4 text-xs text-red-400 font-bold animate-pulse">{totalDisasters} live disaster events</span>}
      </div>

      {/* Disaster detail panels */}
      {layers.weather && disasters.weather.length > 0 && (
        <div className="mt-4 p-4 bg-amber-950/40 border border-amber-700/40 rounded-xl">
          <h3 className="text-sm font-bold text-amber-400 mb-3">⛈️ Active US Weather Alerts ({disasters.weather.length})</h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {disasters.weather.slice(0, 15).map((w, i) => (
              <div key={w.id || i} className="flex gap-3 items-start text-xs border-b border-amber-900/30 pb-2">
                <span className={`font-bold shrink-0 ${w.severity === 'Extreme' ? 'text-red-400' : 'text-amber-400'}`}>{w.severity}</span>
                <div>
                  <p className="text-zinc-200 font-medium">{w.event}</p>
                  <p className="text-zinc-500">{w.areaDesc?.slice(0, 80)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {layers.gdacs && disasters.gdacs.length > 0 && (
        <div className="mt-4 p-4 bg-blue-950/40 border border-blue-700/40 rounded-xl">
          <h3 className="text-sm font-bold text-blue-400 mb-3">🌍 Global Active Disasters — GDACS ({disasters.gdacs.length})</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto">
            {disasters.gdacs.slice(0, 20).map((ev, i) => {
              const icon = ev.type === 'tc' ? '🌀' : ev.type === 'fl' ? '🌊' : ev.type === 'vo' ? '🌋' : ev.type === 'wf' ? '🔥' : ev.type === 'dr' ? '🏜️' : ev.type === 'eq' ? '🔴' : '⚠️';
              return (
                <div key={ev.id || i} className="flex gap-2 items-start text-xs bg-zinc-900/60 rounded-lg p-2">
                  <span className="text-base shrink-0">{icon}</span>
                  <div>
                    <p className="text-zinc-200 font-medium leading-tight">{ev.name}</p>
                    <p className="text-zinc-500">{ev.country} · <span style={{ color: ev.alert === 'red' ? '#ef4444' : ev.alert === 'orange' ? '#f97316' : '#22c55e' }}>{(ev.alert || '').toUpperCase()}</span></p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {layers.relief && disasters.relief.length > 0 && (
        <div className="mt-4 p-4 bg-purple-950/40 border border-purple-700/40 rounded-xl">
          <h3 className="text-sm font-bold text-purple-400 mb-3">🆘 Active Disaster Reports — ReliefWeb ({disasters.relief.length})</h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {disasters.relief.slice(0, 12).map((r, i) => (
              <div key={r.id || i} className="flex gap-3 items-start text-xs border-b border-purple-900/30 pb-2">
                <span className="text-zinc-500 shrink-0">{r.type || '⚠️'}</span>
                <div className="flex-1">
                  <p className="text-zinc-200 font-medium">{r.name}</p>
                  <p className="text-zinc-500">{r.country} · {r.status}</p>
                </div>
                {r.url && <a href={r.url} target="_blank" rel="noreferrer" className="text-purple-400 shrink-0 hover:text-purple-300">↗</a>}
              </div>
            ))}
          </div>
        </div>
      )}

      {layers.quakes && disasters.quakes.length > 0 && (
        <div className="mt-4 p-4 bg-red-950/40 border border-red-700/40 rounded-xl">
          <h3 className="text-sm font-bold text-red-400 mb-3">🔴 Recent Earthquakes M4.5+ — USGS ({disasters.quakes.length})</h3>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {disasters.quakes.slice(0, 15).map((eq, i) => {
              const mag = eq.properties.mag;
              return (
                <div key={eq.id || i} className="flex gap-3 items-center text-xs">
                  <span className={`font-black w-10 shrink-0 ${mag >= 7 ? 'text-red-400' : mag >= 6 ? 'text-orange-400' : 'text-amber-400'}`}>M{mag}</span>
                  <span className="text-zinc-300 flex-1 truncate">{eq.properties.place}</span>
                  <span className="text-zinc-600 shrink-0">{new Date(eq.properties.time).toLocaleDateString()}</span>
                  {eq.properties.url && <a href={eq.properties.url} target="_blank" rel="noreferrer" className="text-red-400 hover:text-red-300 shrink-0">↗</a>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <NewsPanel />
    </div>
  );
}

function NewsPanel() {
  const [news, setNews]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [topic, setTopic]     = useState('wildlife');
  const TOPICS = [
    { id: 'wildlife',      label: '🦁 Wildlife' },
    { id: 'environment',   label: '🌱 Environment' },
    { id: 'disaster',      label: '🌪️ Disasters' },
    { id: 'conservation',  label: '♻️ Conservation' },
    { id: 'agriculture',   label: '🌾 Agriculture' },
  ];

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/news?q=${encodeURIComponent(topic)}&limit=15`)
      .then(r => r.json())
      .then(d => setNews(Array.isArray(d.articles) ? d.articles : []))
      .catch(() => setNews([]))
      .finally(() => setLoading(false));
  }, [topic]);

  return (
    <div className="mt-6 glass-card p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="text-sm font-bold text-white">📰 Global News Feed</h3>
        <div className="flex gap-1.5 flex-wrap">
          {TOPICS.map(t => (
            <button key={t.id} onClick={() => setTopic(t.id)}
              className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${topic === t.id ? 'bg-violet-600 border-violet-500 text-white' : 'border-zinc-700 text-slate-400 hover:border-violet-600'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {loading && <div className="space-y-2">{Array.from({length:5}).map((_,i)=><div key={i} className="h-12 bg-zinc-800 rounded-lg animate-pulse"/>)}</div>}
      {!loading && news.length === 0 && <p className="text-zinc-500 text-sm">No news available right now.</p>}
      <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
        {news.map((a, i) => (
          <a key={i} href={a.url} target="_blank" rel="noopener noreferrer"
            className="flex gap-3 items-start p-3 rounded-xl bg-zinc-900/60 hover:bg-zinc-800/80 border border-zinc-800 hover:border-zinc-600 transition group">
            {a.image && <img src={a.image} alt="" className="w-16 h-12 object-cover rounded-lg flex-shrink-0 opacity-80 group-hover:opacity-100"/>}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-zinc-200 group-hover:text-white leading-snug line-clamp-2">{a.title}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] text-zinc-500">{a.source}</span>
                {a.publishedAt && <span className="text-[10px] text-zinc-600">{new Date(a.publishedAt).toLocaleDateString()}</span>}
              </div>
            </div>
            <span className="text-zinc-600 group-hover:text-violet-400 text-sm flex-shrink-0">↗</span>
          </a>
        ))}
      </div>
      <p className="text-[10px] text-zinc-600 mt-3 text-right">Powered by GDELT Project & NewsData</p>
    </div>
  );
}

// ── Farming Page ──────────────────────────────────────────────
function FarmingPage() {
  const [tab, setTab] = useState('farm');
  const [query, setQuery] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const ask = async endpoint => {
    if (!query.trim()) return;
    setLoading(true); setResult(null);
    let r;
    if (endpoint === 'calendar') {
      r = await fetch(`${API}/farming/calendar?region=${encodeURIComponent(query)}`, { credentials: 'include' }).catch(() => null);
    } else {
      r = await fetch(`${API}/farming/${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) }).catch(() => null);
    }
    if (r?.ok) setResult(await r.json());
    else setResult({ error: 'AI unavailable — check API keys in .env' });
    setLoading(false);
  };

  const farmTabs = [
    { id: 'farm', label: '🌾 Farm Plan', endpoint: 'plan', placeholder: 'Describe your land — size, location, climate, goals…' },
    { id: 'hydro', label: '💧 Hydroponics', endpoint: 'hydroponics', placeholder: 'What crops? Indoor or outdoor? Budget?' },
    { id: 'calendar', label: '📅 Calendar', endpoint: 'calendar', placeholder: 'Enter your region, e.g. Philippines, Vietnam, Texas…' },
  ];
  const current = farmTabs.find(t => t.id === tab) || farmTabs[0];

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 pb-28">
      <h1 className="text-2xl font-extrabold text-white mb-6">🌾 Farm Assistant</h1>
      <div className="flex gap-2 mb-6">
        {farmTabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? 'bg-green-500 text-black font-bold' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <Textarea label="Describe your situation" value={query} onChange={e => setQuery(e.target.value)} placeholder={current.placeholder} className="mb-4" rows={4} />
      <Btn onClick={() => ask(current.endpoint)} disabled={loading || !query.trim()} className="w-full mb-6">{loading ? '🔄 Generating plan…' : '🌱 Generate Plan'}</Btn>
      {result && (
        <Card className="p-5 space-y-4">
          {result.error && <p className="text-sm text-red-400">{result.error}</p>}
          {/* Farm plan / hydroponics response (advice object) */}
          {result.advice?.summary && <div><p className="text-xs font-bold text-zinc-500 uppercase tracking-wide mb-2">Summary</p><p className="text-sm text-zinc-300 leading-relaxed">{result.advice.summary}</p></div>}
          {result.advice?.soil_preparation && <div><p className="text-xs font-bold text-zinc-500 uppercase tracking-wide mb-1">Soil Preparation</p><p className="text-sm text-zinc-400">{result.advice.soil_preparation}</p></div>}
          {result.advice?.recommended_crops?.length > 0 && (
            <div>
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-wide mb-2">Recommended Crops</p>
              <div className="space-y-2">{result.advice.recommended_crops.map((c, i) => (
                <div key={i} className="flex items-center gap-2 text-sm"><span className="text-green-400">🌱</span><span className="text-zinc-200 font-medium">{c.name || c}</span>{c.days_to_harvest && <Badge color="amber">{c.days_to_harvest} days</Badge>}{c.difficulty && <Badge color="blue">{c.difficulty}</Badge>}</div>
              ))}</div>
            </div>
          )}
          {result.advice?.fertilizer_plan && <div><p className="text-xs font-bold text-zinc-500 uppercase tracking-wide mb-1">Fertilizer Plan</p><p className="text-sm text-zinc-400">{result.advice.fertilizer_plan}</p></div>}
          {result.advice?.pest_prevention && <div><p className="text-xs font-bold text-zinc-500 uppercase tracking-wide mb-1">Pest Prevention</p><p className="text-sm text-zinc-400">{result.advice.pest_prevention}</p></div>}
          {result.advice?.cost_breakdown && (
            <div><p className="text-xs font-bold text-zinc-500 uppercase tracking-wide mb-1">Estimated Cost</p>
            <p className="text-lg font-bold text-amber-400">${result.advice.cost_breakdown.total?.toLocaleString() || '—'}</p></div>
          )}
          {result.advice?.market_potential && <div><p className="text-xs font-bold text-zinc-500 uppercase tracking-wide mb-1">Market Potential</p><p className="text-sm text-zinc-400">{result.advice.market_potential}</p></div>}
          {/* Hydroponics response */}
          {result.setup && <div><p className="text-xs font-bold text-zinc-500 uppercase tracking-wide mb-1">Setup</p><p className="text-sm text-zinc-300 whitespace-pre-wrap">{typeof result.setup === 'string' ? result.setup : JSON.stringify(result.setup, null, 2)}</p></div>}
          {/* Hydroponic e-commerce sourcing */}
          {tab === 'hydro' && !result.error && (
            <div>
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-wide mb-2">🛒 Source Components</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: '🏭 Alibaba', href: `https://www.alibaba.com/trade/search?SearchText=${encodeURIComponent('hydroponic system ' + (query.split(' ').slice(0,3).join(' ')))}`, cls: 'border-orange-700/40 bg-orange-950/20 text-orange-400 hover:bg-orange-950/40' },
                  { label: '📦 Amazon', href: `https://www.amazon.com/s?k=${encodeURIComponent('hydroponic system ' + (query.split(' ').slice(0,3).join(' ')))}`, cls: 'border-amber-700/40 bg-amber-950/20 text-amber-400 hover:bg-amber-950/40' },
                  { label: '🛍 AliExpress', href: `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent('hydroponics kit')}`, cls: 'border-red-700/40 bg-red-950/20 text-red-400 hover:bg-red-950/40' },
                  { label: '🏪 eBay', href: `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent('hydroponic grow kit')}`, cls: 'border-blue-700/40 bg-blue-950/20 text-blue-400 hover:bg-blue-950/40' },
                ].map(s => (
                  <a key={s.label} href={s.href} target="_blank" rel="noreferrer"
                    className={`flex items-center justify-center px-3 py-2.5 border rounded-xl text-sm font-bold transition-colors ${s.cls}`}>
                    {s.label}
                  </a>
                ))}
              </div>
              <p className="text-xs text-zinc-600 mt-2 text-center">Search results open in new tab — compare prices before buying</p>
            </div>
          )}
          {/* Calendar response */}
          {result.calendar?.length > 0 && (
            <div>
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-wide mb-3">Monthly Calendar — {result.country || ''}</p>
              <div className="space-y-3">{result.calendar.slice(0,6).map((m, i) => (
                <div key={i} className="border border-zinc-800 rounded-lg p-3">
                  <p className="text-xs font-bold text-green-400 mb-1">{m.month}</p>
                  {m.planting && <p className="text-xs text-zinc-400"><span className="text-zinc-500">🌱 Plant:</span> {m.planting}</p>}
                  {m.harvest && <p className="text-xs text-zinc-400 mt-0.5"><span className="text-zinc-500">🌾 Harvest:</span> {m.harvest}</p>}
                </div>
              ))}</div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

// ── Journal Page ──────────────────────────────────────────────
function JournalPage() {
  const { user } = useAuth();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ plant_name: '', notes: '', health_score: 7 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    fetch(`${API}/journal`, { credentials: 'include' }).then(r => r.json()).then(d => setEntries(Array.isArray(d) ? d : [])).catch(() => {}).finally(() => setLoading(false));
  }, [user]);

  const save = async e => {
    e.preventDefault(); setSaving(true);
    const r = await fetch(`${API}/journal`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }).catch(() => null);
    if (r?.ok) { const d = await r.json(); setEntries(en => [d, ...en]); setForm({ plant_name: '', notes: '', health_score: 7 }); }
    setSaving(false);
  };

  const del = async id => {
    await fetch(`${API}/journal/${id}`, { method: 'DELETE', credentials: 'include' }).catch(() => {});
    setEntries(e => e.filter(x => x.id !== id));
  };

  if (!user) return <div className="max-w-lg mx-auto px-4 py-16 text-center"><p className="text-zinc-500">Sign in to use your plant journal.</p></div>;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 pb-28">
      <h1 className="text-2xl font-extrabold text-white mb-6">📓 Plant Journal</h1>
      <Card className="p-5 mb-6">
        <h3 className="text-sm font-bold text-zinc-200 mb-4">New Entry</h3>
        <form onSubmit={save} className="space-y-3">
          <Input label="Plant Name" value={form.plant_name} onChange={e => setForm(f => ({ ...f, plant_name: e.target.value }))} placeholder="e.g. Tomato, Basil, Fern" required />
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Health Score: <span className="text-green-400 font-bold">{form.health_score}/10</span></label>
            <input type="range" min="1" max="10" value={form.health_score} onChange={e => setForm(f => ({ ...f, health_score: +e.target.value }))} className="w-full accent-green-500" />
          </div>
          <Textarea label="Observations" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Growth, color, issues, changes…" rows={3} />
          <Btn type="submit" disabled={saving} className="w-full">{saving ? 'Saving…' : '+ Add Entry'}</Btn>
        </form>
      </Card>
      {loading && <div className="py-6 text-center"><div className="w-5 h-5 border-2 border-green-500 border-t-transparent rounded-full animate-spin mx-auto" /></div>}
      <div className="space-y-3">
        {entries.map(e => (
          <Card key={e.id} className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm font-semibold text-zinc-200">{e.plant_name}</p>
                <p className="text-xs text-zinc-500">{new Date(e.created_at).toLocaleDateString()}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge color={e.health_score >= 7 ? 'green' : e.health_score >= 4 ? 'amber' : 'red'}>Health {e.health_score}/10</Badge>
                <button onClick={() => del(e.id)} className="text-zinc-700 hover:text-red-400 transition-colors text-xs">✕</button>
              </div>
            </div>
            {e.notes && <p className="text-sm text-zinc-400">{e.notes}</p>}
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── Favorites Page ────────────────────────────────────────────
function FavoritesPage() {
  const { user } = useAuth();
  const [favorites, setFavorites] = useState([]);
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newCol, setNewCol] = useState('');

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([
      fetch(`${API}/favorites`, { credentials: 'include' }).then(r => r.json()),
      fetch(`${API}/favorites/collections`, { credentials: 'include' }).then(r => r.json()),
    ]).then(([favs, cols]) => { setFavorites(Array.isArray(favs) ? favs : []); setCollections(Array.isArray(cols) ? cols : []); }).catch(() => {}).finally(() => setLoading(false));
  }, [user]);

  const removeFav = async id => {
    await fetch(`${API}/favorites/${id}`, { method: 'DELETE', credentials: 'include' }).catch(() => {});
    setFavorites(f => f.filter(x => x.id !== id));
  };

  const createCollection = async e => {
    e.preventDefault();
    const r = await fetch(`${API}/favorites/collections`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newCol }) }).catch(() => null);
    if (r?.ok) { const d = await r.json(); setCollections(c => [d, ...c]); setNewCol(''); }
  };

  if (!user) return <div className="max-w-lg mx-auto px-4 py-16 text-center"><p className="text-zinc-500">Sign in to view favorites.</p></div>;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 pb-28">
      <h1 className="text-2xl font-extrabold text-white mb-6">❤️ Favorites</h1>
      {loading && <div className="py-6 text-center"><div className="w-5 h-5 border-2 border-green-500 border-t-transparent rounded-full animate-spin mx-auto" /></div>}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
        {favorites.map((f, i) => (
          <div key={i} className="relative">
            <PlantCard plant={f.plant || f} />
            <button onClick={() => removeFav(f.id)} className="absolute top-2 right-2 w-6 h-6 bg-zinc-950/80 rounded-full text-zinc-400 hover:text-red-400 transition-colors text-xs flex items-center justify-center">✕</button>
          </div>
        ))}
      </div>
      <div>
        <h3 className="text-sm font-bold text-zinc-300 mb-3">Collections</h3>
        <form onSubmit={createCollection} className="flex gap-2 mb-4">
          <Input value={newCol} onChange={e => setNewCol(e.target.value)} placeholder="New collection name…" className="flex-1" />
          <Btn type="submit" variant="secondary">+ Create</Btn>
        </form>
        <div className="grid sm:grid-cols-2 gap-3">
          {collections.map(c => (
            <Card key={c.id} className="p-3">
              <p className="text-sm font-medium text-zinc-200">{c.name}</p>
              <p className="text-xs text-zinc-500">{c.item_count || 0} plants</p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Profile Page ──────────────────────────────────────────────
function ProfilePage({ onNav }) {
  const { user, logout, refreshUser } = useAuth();
  const [tab, setTab] = useState('profile');
  const [form, setForm] = useState({ name: '', email: '' });
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [sub, setSub] = useState(null);

  useEffect(() => {
    if (user) { setForm({ name: user.name || '', email: user.email || '' }); }
    fetch(`${API}/subscription/status`, { credentials: 'include' }).then(r => r.json()).then(setSub).catch(() => {});
  }, [user]);

  if (!user) return <div className="max-w-lg mx-auto px-4 py-16 text-center"><Btn onClick={() => onNav('login')}>Sign In</Btn></div>;

  const saveProfile = async e => {
    e.preventDefault(); setSaving(true); setMsg('');
    const r = await fetch(`${API}/auth/profile`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }).catch(() => null);
    if (r?.ok) { await refreshUser(); setMsg('Profile updated!'); }
    else setMsg('Update failed.');
    setSaving(false);
  };

  const changePw = async e => {
    e.preventDefault();
    if (pw.next !== pw.confirm) { setMsg('Passwords do not match'); return; }
    setSaving(true); setMsg('');
    const r = await fetch(`${API}/auth/change-password`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ current_password: pw.current, new_password: pw.next }) }).catch(() => null);
    setMsg(r?.ok ? 'Password changed!' : 'Password change failed.'); setSaving(false);
  };

  return (
    <div className="max-w-lg mx-auto px-4 py-8 pb-28">
      <h1 className="text-2xl font-extrabold text-white mb-6">Profile</h1>
      <div className="flex gap-2 mb-6">
        {['profile','password','subscription'].map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${tab === t ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>{t}</button>
        ))}
      </div>
      {msg && <p className="text-sm text-green-400 mb-4">{msg}</p>}

      {tab === 'profile' && (
        <Card className="p-5">
          <form onSubmit={saveProfile} className="space-y-4">
            <Input label="Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            <Input label="Email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            <Btn type="submit" disabled={saving} className="w-full">{saving ? 'Saving…' : 'Save Profile'}</Btn>
            <div className="pt-4 border-t border-zinc-800">
              <Btn onClick={() => { logout(); onNav('home'); }} variant="danger" className="w-full">Sign Out</Btn>
            </div>
          </form>
        </Card>
      )}

      {tab === 'password' && (
        <Card className="p-5">
          <form onSubmit={changePw} className="space-y-4">
            <Input label="Current Password" type="password" value={pw.current} onChange={e => setPw(p => ({ ...p, current: e.target.value }))} />
            <Input label="New Password" type="password" value={pw.next} onChange={e => setPw(p => ({ ...p, next: e.target.value }))} minLength={8} />
            <Input label="Confirm New Password" type="password" value={pw.confirm} onChange={e => setPw(p => ({ ...p, confirm: e.target.value }))} />
            <Btn type="submit" disabled={saving} className="w-full">{saving ? 'Changing…' : 'Change Password'}</Btn>
          </form>
        </Card>
      )}

      {tab === 'subscription' && (
        <Card className="p-5">
          <div className="mb-4">
            <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Current Plan</p>
            <p className="text-lg font-bold text-zinc-100">{sub?.plan || 'Free'}</p>
            {sub?.status && <Badge color={sub.status === 'active' ? 'green' : 'zinc'}>{sub.status}</Badge>}
          </div>
          {sub?.current_period_end && <p className="text-xs text-zinc-500 mb-4">Renews {new Date(sub.current_period_end * 1000).toLocaleDateString()}</p>}
          {(!sub || sub.plan === 'free') && (
            <div>
              <p className="text-sm text-zinc-400 mb-3">Upgrade to FloraIQ Pro for unlimited scans and priority AI.</p>
              <Btn onClick={() => window.open(`${API}/subscription/checkout`, '_blank')} className="w-full">Upgrade to Pro</Btn>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

// ── Admin Page ────────────────────────────────────────────────
function EmergencyTrailsTab() {
  const [trails, setTrails] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch(`${API}/admin/emergency-trails`, { credentials: 'include' }).then(r => r.json()).then(d => setTrails(Array.isArray(d) ? d : [])).catch(() => {}).finally(() => setLoading(false));
  }, []);
  if (loading) return <div className="py-6 text-center"><div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto" /></div>;
  return (
    <div className="space-y-3">
      {trails.length === 0 && <p className="text-sm text-zinc-500 text-center py-4">No overdue trails</p>}
      {trails.map(t => (
        <Card key={t.id} className="p-4 border-red-500/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-zinc-200">{t.name}</p>
              <p className="text-xs text-zinc-500">User: {t.user_name} · Dest: {t.destination}</p>
              <p className="text-xs text-red-400">Overdue since {new Date(t.expected_return).toLocaleString()}</p>
            </div>
            {t.latitude && t.longitude && (
              <a href={`https://maps.google.com/?q=${t.latitude},${t.longitude}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:text-blue-300">Maps 🔗</a>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}

function AdminPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('stats');
  const [userSearch, setUserSearch] = useState('');

  useEffect(() => {
    if (!user || user.role !== 'admin') return;
    Promise.all([
      fetch(`${API}/admin/stats`, { credentials: 'include' }).then(r => r.json()),
      fetch(`${API}/admin/users`, { credentials: 'include' }).then(r => r.json()),
    ]).then(([s, u]) => { setStats(s); setUsers(Array.isArray(u) ? u : []); }).catch(() => {}).finally(() => setLoading(false));
  }, [user]);

  const toggleBan = async (id, banned) => {
    await fetch(`${API}/admin/users/${id}/${banned ? 'unban' : 'ban'}`, { method: 'POST', credentials: 'include' }).catch(() => {});
    setUsers(u => u.map(x => x.id === id ? { ...x, banned: !banned } : x));
  };

  if (!user || user.role !== 'admin') return <div className="max-w-lg mx-auto px-4 py-16 text-center"><p className="text-zinc-500">Admin access required.</p></div>;
  if (loading) return <div className="py-16 text-center"><div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto" /></div>;

  const filtered = users.filter(u => !userSearch || u.name?.toLowerCase().includes(userSearch.toLowerCase()) || u.email?.toLowerCase().includes(userSearch.toLowerCase()));

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 pb-28">
      <h1 className="text-2xl font-extrabold text-white mb-6">⚙️ Admin Dashboard</h1>
      <div className="flex gap-2 mb-6">
        {['stats', 'users', 'trails'].map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${tab === t ? 'bg-purple-500 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}>{t}</button>
        ))}
      </div>

      {tab === 'stats' && stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[['Users', stats.total_users, 'blue'], ['Scans', stats.total_scans, 'green'], ['Subscribers', stats.subscribers, 'purple'], ['Species', stats.species_count, 'amber']].map(([label, val, color]) => (
            <Card key={label} className="p-4 text-center">
              <p className="text-2xl font-extrabold text-zinc-100">{(val || 0).toLocaleString()}</p>
              <p className="text-xs text-zinc-500 mt-1">{label}</p>
            </Card>
          ))}
        </div>
      )}

      {tab === 'users' && (
        <div>
          <Input value={userSearch} onChange={e => setUserSearch(e.target.value)} placeholder="Search users…" className="mb-4" />
          <div className="space-y-2">
            {filtered.map(u => (
              <Card key={u.id} className="p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-zinc-200">{u.name}</p>
                  <p className="text-xs text-zinc-500">{u.email} · {u.role} · joined {new Date(u.created_at).toLocaleDateString()}</p>
                </div>
                <Btn onClick={() => toggleBan(u.id, u.banned)} variant={u.banned ? 'secondary' : 'danger'} size="sm">{u.banned ? 'Unban' : 'Ban'}</Btn>
              </Card>
            ))}
          </div>
        </div>
      )}

      {tab === 'trails' && <EmergencyTrailsTab />}
    </div>
  );
}

// ── Landscape Intelligence Page ────────────────────────────────────────────────────────────────────────────
// (landscape components inserted here by PowerShell)

// ── Landscape Intelligence Page ────────────────────────────────
// (appended to App.jsx)

function LandscapePage() {
  const { user } = useAuth();
  const fileRef = useRef(null);
  const [tab, setTab] = useState('scanner');
  const [preview, setPreview] = useState(null);
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [regionQuery, setRegionQuery] = useState('');
  const [regionResult, setRegionResult] = useState(null);
  const [regionLoading, setRegionLoading] = useState(false);
  const [cookingQuery, setCookingQuery] = useState('');
  const [cookingResult, setCookingResult] = useState(null);
  const [cookingLoading, setCookingLoading] = useState(false);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    if (user && tab === 'history') {
      fetch(`${API}/landscape/history`, { credentials: 'include' })
        .then(r => r.json()).then(d => setHistory(Array.isArray(d) ? d : [])).catch(() => {});
    }
  }, [user, tab]);

  const pickFile = e => {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f); setPreview(URL.createObjectURL(f)); setResult(null); setError('');
  };

  const analyze = async () => {
    if (!file) { setError('Please upload a landscape photo first'); return; }
    setLoading(true); setError(''); setResult(null);
    try {
      const fd = new FormData();
      fd.append('image', file);
      const r = await fetch(`${API}/landscape/analyze`, { method: 'POST', credentials: 'include', body: fd });
      const data = await safeJson(r);
      if (!r.ok) throw new Error(data.error || 'Analysis failed');
      setResult(data);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const getRegionIntel = async e => {
    e.preventDefault(); setRegionLoading(true); setRegionResult(null);
    try {
      const r = await fetch(`${API}/landscape/region-intel/${encodeURIComponent(regionQuery)}`, { credentials: 'include' });
      setRegionResult(await r.json());
    } catch { } finally { setRegionLoading(false); }
  };

  const getCookingGuide = async e => {
    e.preventDefault(); setCookingLoading(true); setCookingResult(null);
    try {
      const r = await fetch(`${API}/landscape/cooking-guide/${encodeURIComponent(cookingQuery)}`);
      setCookingResult(await r.json());
    } catch { } finally { setCookingLoading(false); }
  };

  const safetyColor = label => {
    if (!label) return 'zinc';
    const l = String(label).toUpperCase();
    if (l === 'SAFE') return 'green';
    if (l === 'CAUTION') return 'amber';
    if (l === 'RISKY') return 'orange';
    if (l === 'DANGEROUS') return 'red';
    return 'zinc';
  };

  const riskColor = level => {
    if (!level) return 'text-zinc-500';
    const l = level.toLowerCase();
    if (l.startsWith('low')) return 'text-green-400';
    if (l.startsWith('medium') || l.startsWith('moderate')) return 'text-amber-400';
    if (l.startsWith('high')) return 'text-red-400';
    return 'text-zinc-400';
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="font-display font-extrabold text-2xl text-white">🌍 Landscape Intelligence</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Upload ANY landscape photo — AI extracts hemisphere, climate, camping safety, wild foods, dangers, and survival intelligence. No GPS required.
        </p>
      </div>

      <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
        <p className="text-xs text-blue-300 leading-relaxed">
          <strong>How it works:</strong> One photo of the environment tells us: hemisphere (sun/shadow angle), climate zone (vegetation type), regional identity (endemic plants), camping risks, edible plants visible, wildlife dangers, natural disaster risks, water sources, and navigation hints — even without GPS or prior research.
        </p>
      </div>

      <div className="flex gap-2 flex-wrap border-b border-zinc-800 pb-4">
        {[
          { id: 'scanner',  label: '📷 Landscape Scan' },
          { id: 'cooking',  label: '🍳 Cooking Guide' },
          { id: 'region',   label: '🗺️ Region Intel' },
          { id: 'history',  label: '📋 History' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${tab === t.id ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'scanner' && (
        <div className="space-y-6">
          <div>
            {!preview ? (
              <div onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-zinc-700 hover:border-blue-500/50 rounded-2xl p-12 text-center cursor-pointer transition-colors">
                <div className="text-5xl mb-4">🌄</div>
                <p className="text-zinc-300 font-semibold mb-1">Upload a landscape, forest, field, or environment photo</p>
                <p className="text-zinc-600 text-xs mb-4">Works with any outdoor scene — jungle, mountain, beach, grassland, urban edge</p>
                <Btn onClick={e => { e.stopPropagation(); fileRef.current?.click(); }} variant="secondary" size="sm">Browse Photo</Btn>
              </div>
            ) : (
              <div className="relative rounded-2xl overflow-hidden">
                <img src={preview} alt="Landscape" className="w-full max-h-72 object-cover rounded-2xl" />
                <button onClick={() => { setFile(null); setPreview(null); setResult(null); }}
                  className="absolute top-3 right-3 bg-black/60 text-white rounded-full w-7 h-7 flex items-center justify-center hover:bg-black/80 text-sm">x</button>
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*" onChange={pickFile} className="hidden" />
          </div>

          {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">{error}</p>}

          {preview && !result && (
            <Btn onClick={analyze} disabled={loading} size="lg" className="w-full !bg-blue-600 hover:!bg-blue-500 text-white">
              {loading ? 'Analyzing landscape with AI…' : 'Analyze Landscape Intelligence'}
            </Btn>
          )}

          {loading && (
            <div className="text-center py-8 space-y-3">
              <div className="animate-spin w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full mx-auto" />
              <p className="text-zinc-400 text-sm">Extracting environmental intelligence…</p>
              <p className="text-zinc-600 text-xs">Analyzing vegetation, terrain, sun angle, and regional indicators</p>
            </div>
          )}

          {result && <LandscapeResult result={result} safetyColor={safetyColor} riskColor={riskColor} />}
        </div>
      )}

      {tab === 'cooking' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-sm font-bold text-zinc-300 mb-1">Wild Plant Cooking and Harvesting Guide</h2>
            <p className="text-xs text-zinc-500 mb-4">Get a complete guide on how to harvest, prepare, and cook any wild plant — including traditional recipes, survival methods without fire, and medicinal preparation. Works for any plant, herb, mushroom, or crop.</p>
            <form onSubmit={getCookingGuide} className="flex gap-2">
              <input value={cookingQuery} onChange={e => setCookingQuery(e.target.value)}
                placeholder="Enter any plant, herb, mushroom e.g. 'Dandelion', 'Stinging Nettle', 'Moringa', 'Wild Ginger'"
                className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors" required />
              <Btn type="submit" disabled={cookingLoading} className="!bg-blue-600 hover:!bg-blue-500 text-white">
                {cookingLoading ? '…' : 'Get Guide'}
              </Btn>
            </form>
          </div>

          {cookingResult && <CookingGuideResult guide={cookingResult} />}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {['Dandelion', 'Stinging Nettle', 'Moringa (Malunggay)', 'Banana Blossom', 'Purslane', 'Wild Ginger', 'Lemongrass', 'Cassava Leaf'].map(plant => (
              <button key={plant} onClick={() => { setCookingQuery(plant); setCookingResult(null); }}
                className="px-2 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 transition-colors text-left">
                {plant}
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === 'region' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-sm font-bold text-zinc-300 mb-1">Regional Environmental Intelligence</h2>
            <p className="text-xs text-zinc-500 mb-4">Get a complete danger and opportunity assessment for any region — predators, toxic plants, edible plants, natural disasters, emergency contacts, and indigenous survival knowledge. For travelers going to an unfamiliar place.</p>
            <form onSubmit={getRegionIntel} className="flex gap-2">
              <input value={regionQuery} onChange={e => setRegionQuery(e.target.value)}
                placeholder="Enter region e.g. 'Mindanao Philippines', 'Vietnam Central Highlands', 'Amazon Brazil', 'Borneo'"
                className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors" required />
              <Btn type="submit" disabled={regionLoading} className="!bg-blue-600 hover:!bg-blue-500 text-white">
                {regionLoading ? '…' : 'Get Intel'}
              </Btn>
            </form>
          </div>

          {regionResult && <RegionIntelResult intel={regionResult} riskColor={riskColor} />}

          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {['Cordillera Mountains, Philippines', 'Mekong Delta, Vietnam', 'Amazon Rainforest, Brazil', 'Serengeti, Tanzania', 'Scottish Highlands, UK', 'Borneo, Malaysia'].map(r => (
              <button key={r} onClick={() => { setRegionQuery(r); setRegionResult(null); }}
                className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 transition-colors text-left">
                {r}
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div className="space-y-3">
          {!user ? <p className="text-center text-zinc-500 text-sm py-8">Sign in to view landscape history</p>
          : history.length === 0 ? <p className="text-center text-zinc-600 text-sm py-8">No landscape analyses yet</p>
          : history.map(h => (
            <Card key={h.id} className="p-4">
              <div className="flex items-center gap-3">
                {h.image_url && <img src={h.image_url} alt={h.environment_label} className="w-16 h-16 rounded-xl object-cover shrink-0" />}
                <div className="flex-1">
                  <p className="font-semibold text-zinc-200 text-sm">{h.environment_label || h.environment_type}</p>
                  <p className="text-xs text-zinc-500">{h.likely_region}</p>
                  <div className="flex gap-2 mt-1 flex-wrap">
                    {h.camping_safety_label && <Badge color={safetyColor(h.camping_safety_label)}>{h.camping_safety_label}</Badge>}
                    {h.climate_zone && <Badge>{h.climate_zone}</Badge>}
                    {(h.city || h.country) && <span className="text-xs text-zinc-600">📍 {[h.city, h.country].filter(Boolean).join(', ')}</span>}
                  </div>
                </div>
                <p className="text-xs text-zinc-600 shrink-0">{new Date(h.created_at).toLocaleDateString()}</p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function LandscapeResult({ result, safetyColor, riskColor }) {
  const [tab, setTab] = useState('overview');

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-zinc-800">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">{result.environment_type?.replace(/_/g,' ')}</p>
            <h2 className="font-display font-extrabold text-xl text-white">{result.environment_label}</h2>
            <p className="text-sm text-zinc-400 mt-1">{result.likely_region}</p>
            {result.likely_countries?.length > 0 && (
              <p className="text-xs text-zinc-600 mt-0.5">Likely: {result.likely_countries.join(', ')}</p>
            )}
            {(result.exif_city || result.exif_country) && (
              <p className="text-xs text-green-400 mt-0.5">📍 GPS: {[result.exif_city, result.exif_country].filter(Boolean).join(', ')}</p>
            )}
          </div>
          <div className="text-center shrink-0">
            <Badge color={safetyColor(result.camping_safety_label)}>{result.camping_safety_label || 'UNKNOWN'}</Badge>
            {result.camping_safety_score != null && (
              <p className="text-2xl font-extrabold text-white mt-1">{result.camping_safety_score}<span className="text-sm text-zinc-500">/10</span></p>
            )}
            <p className="text-xs text-zinc-500">Camp Safety</p>
          </div>
        </div>

        <div className="flex gap-3 mt-3 flex-wrap">
          {result.hemisphere && (
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-600 text-xs">Hemisphere:</span>
              <Badge color={result.hemisphere === 'northern' ? 'blue' : result.hemisphere === 'southern' ? 'amber' : 'zinc'}>{result.hemisphere}</Badge>
            </div>
          )}
          {result.climate_zone && <Badge>{result.climate_zone}</Badge>}
          {result.season_indicator && <Badge color="green">{result.season_indicator?.replace(/_/g,' ')}</Badge>}
          {result.altitude_estimate && <span className="text-xs text-zinc-500">{result.altitude_estimate}</span>}
        </div>

        {result.hemisphere_reasoning && (
          <p className="text-xs text-zinc-500 mt-2 italic">Sun/shadow analysis: {result.hemisphere_reasoning}</p>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-800 px-5 overflow-x-auto">
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'dangers', label: 'Dangers' },
          { id: 'food', label: 'Wild Food' },
          { id: 'plants', label: 'Plants' },
          { id: 'navigate', label: 'Navigate' },
          { id: 'disaster', label: 'Disasters' },
          { id: 'environment', label: 'Environment' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`py-2.5 px-3 text-xs font-semibold uppercase tracking-wide border-b-2 -mb-px transition-colors whitespace-nowrap ${tab === t.id ? 'border-blue-500 text-blue-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="divide-y divide-zinc-800">
          {result.overall_assessment && (
            <div className="p-5">
              <p className="text-xs font-bold uppercase text-zinc-500 mb-2">Overall Assessment</p>
              <p className="text-sm text-zinc-300 leading-relaxed">{result.overall_assessment}</p>
            </div>
          )}
          {result.camping_pros?.length > 0 && (
            <div className="p-5">
              <p className="text-xs font-bold uppercase text-green-400 mb-2">Camping Advantages</p>
              <ul className="space-y-1">{result.camping_pros.map((p, i) => <li key={i} className="text-sm text-zinc-300 flex gap-2"><span className="text-green-500">+</span><span>{p}</span></li>)}</ul>
            </div>
          )}
          {result.camping_cons?.length > 0 && (
            <div className="p-5">
              <p className="text-xs font-bold uppercase text-red-400 mb-2">Camping Risks</p>
              <ul className="space-y-1">{result.camping_cons.map((c, i) => <li key={i} className="text-sm text-zinc-300 flex gap-2"><span className="text-red-500">!</span><span>{c}</span></li>)}</ul>
            </div>
          )}
          {result.survival_priority_actions?.length > 0 && (
            <div className="p-5 bg-orange-500/5">
              <p className="text-xs font-bold uppercase text-orange-400 mb-2">Priority Survival Actions</p>
              <ol className="space-y-1">{result.survival_priority_actions.map((a, i) => <li key={i} className="text-sm text-zinc-300 flex gap-2"><span className="text-orange-400 font-bold shrink-0">{i+1}.</span><span>{a}</span></li>)}</ol>
            </div>
          )}
          {result.water_assessment && (
            <div className="p-5">
              <p className="text-xs font-bold uppercase text-blue-400 mb-2">Water Assessment</p>
              <p className="text-sm text-zinc-300">{result.water_assessment.water_description}</p>
              {result.water_assessment.purification_methods && <p className="text-xs text-zinc-500 mt-1">Purify by: {result.water_assessment.purification_methods}</p>}
              {result.water_assessment.waterborne_risks && <p className="text-xs text-red-400 mt-1">Risk: {result.water_assessment.waterborne_risks}</p>}
            </div>
          )}
          {result.fire_resources && (
            <div className="p-5">
              <p className="text-xs font-bold uppercase text-amber-400 mb-2">Fire Resources</p>
              {result.fire_resources.tinder && <p className="text-xs text-zinc-400">Tinder: {result.fire_resources.tinder}</p>}
              {result.fire_resources.fuel && <p className="text-xs text-zinc-400 mt-0.5">Fuel: {result.fire_resources.fuel}</p>}
              {result.fire_resources.fire_hazard && <p className="text-xs text-red-400 mt-0.5">Fire risk: {result.fire_resources.fire_hazard}</p>}
            </div>
          )}
          {result.shelter_resources && (
            <div className="p-5">
              <p className="text-xs font-bold uppercase text-zinc-500 mb-2">Shelter Materials</p>
              <p className="text-sm text-zinc-300">{result.shelter_resources}</p>
            </div>
          )}
          {result.cooking_methods_available && (
            <div className="p-5">
              <p className="text-xs font-bold uppercase text-green-400 mb-2">Cooking Methods Available</p>
              {result.cooking_methods_available.fire_cooking && <div className="mb-2"><p className="text-xs text-amber-400 font-semibold">With Fire:</p><p className="text-xs text-zinc-400">{result.cooking_methods_available.fire_cooking}</p></div>}
              {result.cooking_methods_available.no_fire_methods && <div className="mb-2"><p className="text-xs text-blue-400 font-semibold">Without Fire:</p><p className="text-xs text-zinc-400">{result.cooking_methods_available.no_fire_methods}</p></div>}
              {result.cooking_methods_available.preservation && <div><p className="text-xs text-zinc-500 font-semibold">Preservation:</p><p className="text-xs text-zinc-400">{result.cooking_methods_available.preservation}</p></div>}
            </div>
          )}
        </div>
      )}

      {tab === 'dangers' && (
        <div className="divide-y divide-zinc-800">
          {result.immediate_hazards?.length > 0 && (
            <div className="p-5 bg-red-500/5">
              <p className="text-xs font-bold uppercase text-red-400 mb-2">Immediate Hazards Visible</p>
              <ul className="space-y-1">{result.immediate_hazards.map((h, i) => <li key={i} className="text-sm text-red-300 flex gap-2"><span>!</span><span>{h}</span></li>)}</ul>
            </div>
          )}
          {result.wildlife_dangers && (
            <div className="p-5">
              <p className="text-xs font-bold uppercase text-red-400 mb-3">Wildlife Dangers</p>
              {result.wildlife_dangers.predators && <div className="mb-3"><p className="text-xs font-bold text-orange-400 mb-1">Apex Predators</p><p className="text-sm text-zinc-300">{result.wildlife_dangers.predators}</p></div>}
              {result.wildlife_dangers.venomous && <div className="mb-3"><p className="text-xs font-bold text-amber-400 mb-1">Venomous Creatures</p><p className="text-sm text-zinc-300">{result.wildlife_dangers.venomous}</p></div>}
              {result.wildlife_dangers.insects && <div className="mb-3"><p className="text-xs font-bold text-zinc-400 mb-1">Disease Vectors</p><p className="text-sm text-zinc-300">{result.wildlife_dangers.insects}</p></div>}
              {result.wildlife_dangers.other && <div><p className="text-xs font-bold text-zinc-400 mb-1">Other Risks</p><p className="text-sm text-zinc-300">{result.wildlife_dangers.other}</p></div>}
            </div>
          )}
          {result.emergency_signal_options && (
            <div className="p-5">
              <p className="text-xs font-bold uppercase text-yellow-400 mb-2">Emergency Signal Options</p>
              <p className="text-sm text-zinc-300">{result.emergency_signal_options}</p>
            </div>
          )}
        </div>
      )}

      {tab === 'food' && (
        <div className="divide-y divide-zinc-800">
          {result.wild_food_sources && (
            <>
              {result.wild_food_sources.plants && <div className="p-5"><p className="text-xs font-bold uppercase text-green-400 mb-2">Wild Plants</p><p className="text-sm text-zinc-300">{result.wild_food_sources.plants}</p></div>}
              {result.wild_food_sources.fungi && <div className="p-5"><p className="text-xs font-bold uppercase text-amber-400 mb-2">Fungi and Mushrooms</p><p className="text-sm text-zinc-300">{result.wild_food_sources.fungi}</p></div>}
              {result.wild_food_sources.insects && <div className="p-5"><p className="text-xs font-bold uppercase text-blue-400 mb-2">Edible Insects</p><p className="text-sm text-zinc-300">{result.wild_food_sources.insects}</p></div>}
              {result.wild_food_sources.small_game && <div className="p-5"><p className="text-xs font-bold uppercase text-zinc-400 mb-2">Small Game</p><p className="text-sm text-zinc-300">{result.wild_food_sources.small_game}</p></div>}
              {result.wild_food_sources.water_plants && <div className="p-5"><p className="text-xs font-bold uppercase text-blue-400 mb-2">Aquatic Plants</p><p className="text-sm text-zinc-300">{result.wild_food_sources.water_plants}</p></div>}
            </>
          )}
          {result.indigenous_knowledge_note && (
            <div className="p-5 bg-purple-500/5">
              <p className="text-xs font-bold uppercase text-purple-400 mb-2">Indigenous Knowledge</p>
              <p className="text-sm text-zinc-300 italic">{result.indigenous_knowledge_note}</p>
            </div>
          )}
        </div>
      )}

      {tab === 'plants' && (
        <div className="p-5 space-y-4">
          {!result.visible_plants || result.visible_plants.length === 0 ? (
            <p className="text-zinc-500 text-sm text-center py-8">No specific plants identified in visible area</p>
          ) : result.visible_plants.map((plant, i) => (
            <Card key={i} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="font-semibold text-zinc-200 text-sm">{plant.likely_species || plant.description}</p>
                    <Badge color={plant.edible ? 'green' : plant.toxic_risk ? 'red' : 'zinc'}>{plant.edible ? 'Edible' : plant.toxic_risk ? 'Toxic Risk' : 'Unknown'}</Badge>
                    <Badge color={plant.survival_value === 'high' ? 'green' : plant.survival_value === 'medium' ? 'amber' : 'zinc'}>{plant.survival_value} value</Badge>
                  </div>
                  {plant.description && plant.likely_species && <p className="text-xs text-zinc-500 mb-2">{plant.description}</p>}
                  {plant.edible_parts && <p className="text-xs text-zinc-400"><span className="text-green-400 font-semibold">Edible parts:</span> {plant.edible_parts}</p>}
                  {plant.how_to_harvest && <p className="text-xs text-zinc-400 mt-0.5"><span className="text-amber-400 font-semibold">Harvest:</span> {plant.how_to_harvest}</p>}
                  {plant.how_to_cook && <p className="text-xs text-zinc-400 mt-0.5"><span className="text-blue-400 font-semibold">Prepare:</span> {plant.how_to_cook}</p>}
                  {plant.medicinal_use && <p className="text-xs text-zinc-400 mt-0.5"><span className="text-purple-400 font-semibold">Medicinal:</span> {plant.medicinal_use}</p>}
                  {plant.toxic_risk && <p className="text-xs text-red-400 mt-1">Warning: {plant.toxic_risk}</p>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === 'navigate' && result.navigation_hints && (
        <div className="divide-y divide-zinc-800">
          {result.navigation_hints.sun_position && <div className="p-5"><p className="text-xs font-bold uppercase text-amber-400 mb-2">Sun Position Analysis</p><p className="text-sm text-zinc-300">{result.navigation_hints.sun_position}</p></div>}
          {result.navigation_hints.vegetation_clues && <div className="p-5"><p className="text-xs font-bold uppercase text-green-400 mb-2">Vegetation Navigation Clues</p><p className="text-sm text-zinc-300">{result.navigation_hints.vegetation_clues}</p></div>}
          {result.navigation_hints.terrain_clues && <div className="p-5"><p className="text-xs font-bold uppercase text-zinc-400 mb-2">Terrain Clues</p><p className="text-sm text-zinc-300">{result.navigation_hints.terrain_clues}</p></div>}
          {result.navigation_hints.landmark_features && <div className="p-5"><p className="text-xs font-bold uppercase text-blue-400 mb-2">Landmark Features</p><p className="text-sm text-zinc-300">{result.navigation_hints.landmark_features}</p></div>}
        </div>
      )}

      {tab === 'disaster' && result.natural_disaster_risks && (
        <div className="p-5 space-y-3">
          <p className="text-xs font-bold uppercase text-zinc-500 mb-3">Natural Disaster Risk Assessment</p>
          {Object.entries(result.natural_disaster_risks).map(([k, v]) => (
            <div key={k} className="flex items-start gap-3">
              <span className={`text-xs font-bold shrink-0 capitalize w-28 ${riskColor(v)}`}>{k.replace(/_/g,' ')}</span>
              <p className="text-xs text-zinc-400">{v}</p>
            </div>
          ))}
        </div>
      )}

      {tab === 'environment' && result.environmental_assessment && (
        <div className="divide-y divide-zinc-800">
          <div className="p-5">
            <p className="text-xs font-bold uppercase text-zinc-500 mb-2">Biodiversity</p>
            <Badge color={result.environmental_assessment.biodiversity_estimate === 'high' ? 'green' : result.environmental_assessment.biodiversity_estimate === 'degraded' ? 'red' : 'amber'}>
              {result.environmental_assessment.biodiversity_estimate} biodiversity
            </Badge>
          </div>
          {result.environmental_assessment.damage_visible && (
            <div className="p-5 bg-red-500/5">
              <p className="text-xs font-bold uppercase text-red-400 mb-2">Environmental Damage Detected</p>
              <p className="text-sm text-zinc-300">{result.environmental_assessment.damage_types}</p>
            </div>
          )}
          {result.environmental_assessment.conservation_concern && (
            <div className="p-5">
              <p className="text-xs font-bold uppercase text-amber-400 mb-2">Conservation Concerns</p>
              <p className="text-sm text-zinc-300">{result.environmental_assessment.conservation_concern}</p>
            </div>
          )}
          {result.environmental_assessment.human_impact && (
            <div className="p-5">
              <p className="text-xs font-bold uppercase text-zinc-500 mb-2">Human Impact Visible</p>
              <p className="text-sm text-zinc-300">{result.environmental_assessment.human_impact}</p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function CookingGuideResult({ guide }) {
  const [expandedPart, setExpandedPart] = useState(0);
  return (
    <Card className="overflow-hidden">
      <div className="p-5 border-b border-zinc-800">
        <h2 className="font-display font-extrabold text-xl text-white">{guide.plant_name}</h2>
        {guide.caution && (
          <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-xs text-red-400">Warning: {guide.caution}</p>
          </div>
        )}
      </div>

      {guide.edible_parts?.length > 0 && (
        <div className="divide-y divide-zinc-800">
          {guide.edible_parts.map((part, i) => (
            <div key={i}>
              <button onClick={() => setExpandedPart(expandedPart === i ? -1 : i)}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-zinc-800/30 transition-colors">
                <div className="flex items-center gap-3">
                  <Badge color="green">{part.part}</Badge>
                  <span className="text-sm font-semibold text-zinc-200">{part.season_to_harvest}</span>
                  {part.toxic_if_raw && <Badge color="red">Cook Required</Badge>}
                </div>
                <span className="text-zinc-500 text-xs">{expandedPart === i ? 'Less' : 'More'}</span>
              </button>
              {expandedPart === i && (
                <div className="px-5 pb-5 space-y-4">
                  {part.how_to_identify_ripe && <div><p className="text-xs font-bold text-amber-400 uppercase mb-1">How to Identify Ripe</p><p className="text-sm text-zinc-300">{part.how_to_identify_ripe}</p></div>}
                  {part.how_to_harvest && <div><p className="text-xs font-bold text-green-400 uppercase mb-1">Harvesting</p><p className="text-sm text-zinc-300">{part.how_to_harvest}</p></div>}
                  {part.taste_profile && <div><p className="text-xs font-bold text-zinc-500 uppercase mb-1">Taste and Texture</p><p className="text-sm text-zinc-300">{part.taste_profile}</p></div>}
                  {part.nutritional_value && <div><p className="text-xs font-bold text-blue-400 uppercase mb-1">Nutrition</p><p className="text-sm text-zinc-300">{part.nutritional_value}</p></div>}
                  {part.cooking_methods?.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-amber-400 uppercase mb-2">Cooking Methods</p>
                      <div className="space-y-2">
                        {part.cooking_methods.map((m, j) => (
                          <div key={j} className="bg-zinc-800/50 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-xs font-bold text-zinc-200">{m.method}</p>
                              {m.time_minutes > 0 && <span className="text-xs text-zinc-500">{m.time_minutes} min</span>}
                            </div>
                            <p className="text-xs text-zinc-400">{m.instructions}</p>
                            {m.result && <p className="text-xs text-green-400 mt-1">Result: {m.result}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {part.toxic_parts_nearby && <div className="p-2 bg-red-500/10 rounded-lg"><p className="text-xs font-bold text-red-400 mb-1">Do Not Eat:</p><p className="text-xs text-red-300">{part.toxic_parts_nearby}</p></div>}
                  {part.safety_notes && <div><p className="text-xs font-bold text-orange-400 uppercase mb-1">Safety Notes</p><p className="text-sm text-zinc-300">{part.safety_notes}</p></div>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {guide.survival_cooking_without_fire && (
        <div className="p-5 border-t border-zinc-800 bg-green-500/5">
          <p className="text-xs font-bold uppercase text-green-400 mb-2">No-Fire / No-Tool Preparation</p>
          <p className="text-sm text-zinc-300 leading-relaxed">{guide.survival_cooking_without_fire}</p>
        </div>
      )}

      {guide.traditional_recipes?.length > 0 && (
        <div className="p-5 border-t border-zinc-800">
          <p className="text-xs font-bold uppercase text-purple-400 mb-3">Traditional Recipes</p>
          <div className="space-y-3">
            {guide.traditional_recipes.map((recipe, i) => (
              <div key={i} className="bg-zinc-800/40 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-bold text-zinc-200">{recipe.name}</p>
                  {recipe.origin && <Badge color="purple">{recipe.origin}</Badge>}
                </div>
                {recipe.ingredients_wild && <p className="text-xs text-zinc-500 mb-1">Wild ingredients: {recipe.ingredients_wild}</p>}
                <p className="text-xs text-zinc-400 leading-relaxed">{recipe.steps}</p>
                {recipe.serves && <p className="text-xs text-zinc-600 mt-1">Serves {recipe.serves}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {guide.medicinal_preparation && (
        <div className="p-5 border-t border-zinc-800">
          <p className="text-xs font-bold uppercase text-purple-400 mb-3">Medicinal Preparation</p>
          <div className="space-y-2">
            {guide.medicinal_preparation.tea && <div><p className="text-xs font-semibold text-zinc-400">Herbal Tea:</p><p className="text-xs text-zinc-500">{guide.medicinal_preparation.tea}</p></div>}
            {guide.medicinal_preparation.poultice && <div><p className="text-xs font-semibold text-zinc-400">Poultice (wounds):</p><p className="text-xs text-zinc-500">{guide.medicinal_preparation.poultice}</p></div>}
            {guide.medicinal_preparation.raw_application && <div><p className="text-xs font-semibold text-zinc-400">Direct Application:</p><p className="text-xs text-zinc-500">{guide.medicinal_preparation.raw_application}</p></div>}
          </div>
        </div>
      )}

      {guide.preservation_methods?.length > 0 && (
        <div className="p-5 border-t border-zinc-800">
          <p className="text-xs font-bold uppercase text-zinc-500 mb-2">Preservation Without Refrigeration</p>
          <div className="flex flex-wrap gap-2">
            {guide.preservation_methods.map((m, i) => <Badge key={i}>{m}</Badge>)}
          </div>
        </div>
      )}

      {guide.cultural_significance && (
        <div className="p-5 border-t border-zinc-800 bg-purple-500/5">
          <p className="text-xs font-bold uppercase text-purple-400 mb-2">Cultural Significance</p>
          <p className="text-sm text-zinc-300 italic">{guide.cultural_significance}</p>
        </div>
      )}
    </Card>
  );
}

function RegionIntelResult({ intel, riskColor }) {
  const [tab, setTab] = useState('dangers');
  return (
    <Card className="overflow-hidden">
      <div className="p-5 border-b border-zinc-800">
        <h2 className="font-display font-extrabold text-xl text-white">{intel.region}</h2>
        {intel.environment_type && <p className="text-sm text-zinc-500 mt-1">{intel.environment_type}</p>}
        {intel.climate && <p className="text-xs text-zinc-600 mt-0.5">{intel.climate}</p>}
        {intel.best_camping_months?.length > 0 && (
          <p className="text-xs text-green-400 mt-1">Best camping months: {intel.best_camping_months.join(', ')}</p>
        )}
      </div>

      <div className="flex border-b border-zinc-800 px-5 overflow-x-auto">
        {[{ id: 'dangers', label: 'Dangers' }, { id: 'food', label: 'Wild Food' }, { id: 'disasters', label: 'Disasters' }, { id: 'emergency', label: 'Emergency' }, { id: 'cultural', label: 'Culture' }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`py-2.5 px-3 text-xs font-semibold uppercase tracking-wide border-b-2 -mb-px transition-colors whitespace-nowrap ${tab === t.id ? 'border-blue-500 text-blue-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'dangers' && (
        <div className="divide-y divide-zinc-800">
          {intel.apex_predators?.length > 0 && (
            <div className="p-5">
              <p className="text-xs font-bold uppercase text-red-400 mb-3">Apex Predators</p>
              {intel.apex_predators.map((a, i) => (
                <div key={i} className="mb-3 last:mb-0">
                  <p className="text-sm font-bold text-zinc-200">{a.animal}</p>
                  {a.habitat && <p className="text-xs text-zinc-500">Habitat: {a.habitat}</p>}
                  {a.avoidance && <p className="text-xs text-zinc-400 mt-0.5">Avoid: {a.avoidance}</p>}
                  {a.attack_response && <p className="text-xs text-amber-400 mt-0.5">If attacked: {a.attack_response}</p>}
                </div>
              ))}
            </div>
          )}
          {intel.venomous_creatures?.length > 0 && (
            <div className="p-5">
              <p className="text-xs font-bold uppercase text-orange-400 mb-3">Venomous Creatures</p>
              {intel.venomous_creatures.map((v, i) => (
                <div key={i} className="mb-3 last:mb-0 bg-zinc-800/30 rounded-lg p-3">
                  <p className="text-xs font-bold text-zinc-200">{v.creature}</p>
                  {v.venom_type && <p className="text-xs text-zinc-500">Venom: {v.venom_type}</p>}
                  {v.first_aid && <p className="text-xs text-blue-400 mt-0.5">First aid: {v.first_aid}</p>}
                  <p className="text-xs mt-0.5">{v.antivenom_available ? <span className="text-green-400">Antivenom available</span> : <span className="text-red-400">No antivenom — evaculate immediately</span>}</p>
                </div>
              ))}
            </div>
          )}
          {intel.toxic_plants?.length > 0 && (
            <div className="p-5">
              <p className="text-xs font-bold uppercase text-red-400 mb-3">Toxic Plants</p>
              {intel.toxic_plants.map((p, i) => (
                <div key={i} className="mb-2 last:mb-0">
                  <p className="text-xs font-bold text-zinc-200">{p.plant}</p>
                  {p.toxic_compounds && <p className="text-xs text-zinc-500">Toxin: {p.toxic_compounds}</p>}
                  {p.symptoms && <p className="text-xs text-red-400 mt-0.5">Symptoms: {p.symptoms}</p>}
                  {p.look_alikes && <p className="text-xs text-amber-400 mt-0.5">Confused with: {p.look_alikes}</p>}
                </div>
              ))}
            </div>
          )}
          {intel.water_sources && <div className="p-5"><p className="text-xs font-bold uppercase text-blue-400 mb-2">Water Sources</p><p className="text-sm text-zinc-300">{intel.water_sources}</p></div>}
        </div>
      )}

      {tab === 'food' && (
        <div className="divide-y divide-zinc-800">
          {intel.edible_wild_plants?.length > 0 && (
            <div className="p-5">
              <p className="text-xs font-bold uppercase text-green-400 mb-3">Edible Wild Plants</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {intel.edible_wild_plants.map((p, i) => (
                  <div key={i} className="bg-zinc-800/40 rounded-lg p-3">
                    <p className="text-xs font-bold text-zinc-200">{p.plant}</p>
                    {p.parts && <p className="text-xs text-green-400">Parts: {p.parts}</p>}
                    {p.season && <p className="text-xs text-zinc-500">Season: {p.season}</p>}
                    {p.how_to_prepare && <p className="text-xs text-zinc-400 mt-0.5">{p.how_to_prepare}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {intel.edible_mushrooms?.length > 0 && (
            <div className="p-5">
              <p className="text-xs font-bold uppercase text-amber-400 mb-3">Edible Mushrooms</p>
              {intel.edible_mushrooms.map((m, i) => (
                <div key={i} className="mb-2 last:mb-0">
                  <p className="text-xs font-bold text-zinc-200">{m.mushroom}</p>
                  {m.season && <span className="text-xs text-zinc-500">{m.season} — </span>}
                  {m.caution && <span className="text-xs text-red-400">{m.caution}</span>}
                </div>
              ))}
            </div>
          )}
          {intel.useful_survival_knowledge?.length > 0 && (
            <div className="p-5 bg-green-500/5">
              <p className="text-xs font-bold uppercase text-green-400 mb-2">Local Survival Knowledge</p>
              <ul className="space-y-1">{intel.useful_survival_knowledge.map((k, i) => <li key={i} className="text-sm text-zinc-300 flex gap-2"><span className="text-green-500">•</span><span>{k}</span></li>)}</ul>
            </div>
          )}
        </div>
      )}

      {tab === 'disasters' && intel.natural_disasters && (
        <div className="p-5 space-y-3">
          {Object.entries(intel.natural_disasters).map(([k, v]) => (
            <div key={k} className="flex items-start gap-3">
              <span className={`text-xs font-bold shrink-0 capitalize w-28 ${riskColor(v)}`}>{k.replace(/_/g,' ')}</span>
              <p className="text-xs text-zinc-400">{v}</p>
            </div>
          ))}
          {intel.dangerous_months?.length > 0 && (
            <div className="mt-3 p-3 bg-red-500/10 rounded-lg">
              <p className="text-xs font-bold text-red-400 mb-1">Dangerous Months</p>
              {intel.dangerous_months.map((m, i) => <p key={i} className="text-xs text-zinc-400">{m}</p>)}
            </div>
          )}
        </div>
      )}

      {tab === 'emergency' && (
        <div className="divide-y divide-zinc-800">
          {intel.emergency_contacts && (
            <div className="p-5">
              <p className="text-xs font-bold uppercase text-red-400 mb-3">Emergency Numbers</p>
              {Object.entries(intel.emergency_contacts).filter(([,v]) => v).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between py-1.5">
                  <span className="text-xs text-zinc-400 capitalize">{k.replace(/_/g,' ')}</span>
                  <a href={`tel:${v}`} className="text-sm font-bold text-red-400">{v}</a>
                </div>
              ))}
            </div>
          )}
          {intel.nearest_hospitals && <div className="p-5"><p className="text-xs font-bold uppercase text-blue-400 mb-2">Medical Access</p><p className="text-sm text-zinc-300">{intel.nearest_hospitals}</p></div>}
          {intel.navigation_landmarks && <div className="p-5"><p className="text-xs font-bold uppercase text-zinc-500 mb-2">Navigation Landmarks</p><p className="text-sm text-zinc-300">{intel.navigation_landmarks}</p></div>}
        </div>
      )}

      {tab === 'cultural' && (
        <div className="divide-y divide-zinc-800">
          {intel.indigenous_tribes && <div className="p-5"><p className="text-xs font-bold uppercase text-purple-400 mb-2">Indigenous Peoples</p><p className="text-sm text-zinc-300">{intel.indigenous_tribes}</p></div>}
          {intel.cultural_taboos?.length > 0 && (
            <div className="p-5">
              <p className="text-xs font-bold uppercase text-amber-400 mb-2">Cultural Rules to Respect</p>
              <ul className="space-y-1">{intel.cultural_taboos.map((t, i) => <li key={i} className="text-sm text-zinc-300 flex gap-2"><span className="text-amber-400">•</span><span>{t}</span></li>)}</ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}




// ── Farm Ops ──────────────────────────────────────────────────
const FARM_OPS_API = `${API}/farm-ops`;

const INV_CATEGORIES = ['seed', 'fertilizer', 'chemical', 'fuel', 'feed', 'parts'];
const TASK_STATUSES  = ['pending', 'in_progress', 'done'];
const TASK_PRIORITIES = ['low', 'medium', 'high'];
const PLANT_STATUSES  = ['planned', 'planted', 'growing', 'harvested', 'failed'];

function FarmAlert({ alerts }) {
  if (!alerts?.length) return null;
  return (
    <div className="mb-6 space-y-2">
      {alerts.map((a, i) => (
        <div key={i} className={`flex items-start gap-3 px-4 py-3 rounded-xl text-sm border ${
          a.severity === 'high'
            ? 'bg-red-950/40 border-red-800/50 text-red-300'
            : a.severity === 'medium'
            ? 'bg-amber-950/40 border-amber-800/50 text-amber-300'
            : 'bg-blue-950/40 border-blue-800/50 text-blue-300'
        }`}>
          <span>{a.severity === 'high' ? '🔴' : a.severity === 'medium' ? '🟡' : '🔵'}</span>
          <span>{a.message}</span>
        </div>
      ))}
    </div>
  );
}

function FarmModal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="glass-card w-full max-w-lg p-6 relative max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white text-xl">×</button>
        <h3 className="text-lg font-bold text-white mb-5">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function FarmOpsFields({ fields, setFields }) {
  const [modal, setModal]   = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm]     = useState({ name: '', acreage: '', soil_type: '', last_soil_test: '', notes: '' });

  const save = async e => {
    e.preventDefault(); setSaving(true);
    try {
      const r = await fetch(`${FARM_OPS_API}/fields`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!r.ok) throw new Error();
      const d = await r.json();
      setFields(f => [d, ...f]);
      setModal(false);
      setForm({ name: '', acreage: '', soil_type: '', last_soil_test: '', notes: '' });
    } catch { /* pass */ }
    setSaving(false);
  };

  const del = async id => {
    await fetch(`${FARM_OPS_API}/fields/${id}`, { method: 'DELETE', credentials: 'include' });
    setFields(f => f.filter(x => x.id !== id));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-white">Fields</h2>
        <button onClick={() => setModal(true)} className="btn-violet px-4 py-1.5 text-sm rounded-lg">+ Add Field</button>
      </div>
      {fields.length === 0 && <p className="text-slate-500 text-sm">No fields registered yet.</p>}
      <div className="space-y-3">
        {fields.map(f => (
          <div key={f.id} className="glass-card px-4 py-3 flex items-center justify-between">
            <div>
              <p className="font-semibold text-white">{f.name}</p>
              <p className="text-xs text-slate-400">{[f.acreage && `${f.acreage} acres`, f.soil_type].filter(Boolean).join(' · ')}</p>
            </div>
            <button onClick={() => del(f.id)} className="text-slate-600 hover:text-red-400 text-lg">×</button>
          </div>
        ))}
      </div>
      {modal && (
        <FarmModal title="Register Field" onClose={() => setModal(false)}>
          <form onSubmit={save} className="space-y-3">
            {[['name','Field Name *','text',true],['acreage','Acreage','number'],['soil_type','Soil Type','text'],['last_soil_test','Last Soil Test','date']].map(([k,label,type,req])=>(
              <div key={k}>
                <label className="block text-xs text-slate-400 mb-1">{label}</label>
                <input required={!!req} type={type||'text'} value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:border-violet-500 outline-none"/>
              </div>
            ))}
            <div>
              <label className="block text-xs text-slate-400 mb-1">Notes</label>
              <textarea rows={2} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:border-violet-500 outline-none"/>
            </div>
            <button type="submit" disabled={saving} className="btn-violet w-full py-2 text-sm rounded-lg">
              {saving ? 'Saving…' : 'Save Field'}
            </button>
          </form>
        </FarmModal>
      )}
    </div>
  );
}

function FarmOpsPlanting({ fields }) {
  const [plantings, setPlantings] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [modal, setModal]         = useState(false);
  const [saving, setSaving]       = useState(false);
  const [form, setForm] = useState({
    field_id: '', crop_name: '', variety: '', seed_lot: '', season: '',
    planned_date: '', actual_date: '', seed_rate: '', days_to_maturity: '',
    target_yield_kg: '', status: 'planned', crop_family: '', notes: '',
  });

  useEffect(() => {
    fetch(`${FARM_OPS_API}/plantings`, { credentials: 'include' })
      .then(r => r.json()).then(d => setPlantings(Array.isArray(d) ? d : []))
      .catch(() => {}).finally(() => setLoading(false));
  }, []);

  const save = async e => {
    e.preventDefault(); setSaving(true);
    try {
      const r = await fetch(`${FARM_OPS_API}/plantings`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, field_id: form.field_id || null }),
      });
      if (!r.ok) throw new Error();
      const d = await r.json();
      setPlantings(p => [d, ...p]);
      setModal(false);
    } catch { /* pass */ }
    setSaving(false);
  };

  const del = async id => {
    await fetch(`${FARM_OPS_API}/plantings/${id}`, { method: 'DELETE', credentials: 'include' });
    setPlantings(p => p.filter(x => x.id !== id));
  };

  const statusColor = s => ({ planted:'text-green-400', growing:'text-teal-400', harvested:'text-blue-400', failed:'text-red-400' })[s] || 'text-slate-400';

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-white">Planting Schedule</h2>
        <button onClick={() => setModal(true)} className="btn-violet px-4 py-1.5 text-sm rounded-lg">+ Add Planting</button>
      </div>
      {loading && <p className="text-slate-500 text-sm">Loading…</p>}
      {!loading && plantings.length === 0 && <p className="text-slate-500 text-sm">No plantings logged yet.</p>}
      <div className="space-y-3">
        {plantings.map(p => (
          <div key={p.id} className="glass-card px-4 py-3 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-white">{p.crop_name}</p>
                {p.variety && <span className="text-xs text-slate-400">{p.variety}</span>}
                <span className={`text-xs font-medium ${statusColor(p.status)}`}>{p.status}</span>
                {p.rotation_warning && <span className="text-xs text-amber-400">⚠ {p.rotation_warning}</span>}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {[p.field_name && `Field: ${p.field_name}`, p.planned_date && `Planned: ${new Date(p.planned_date).toLocaleDateString()}`, p.season].filter(Boolean).join(' · ')}
              </p>
            </div>
            <button onClick={() => del(p.id)} className="text-slate-600 hover:text-red-400 text-lg flex-shrink-0">×</button>
          </div>
        ))}
      </div>
      {modal && (
        <FarmModal title="Log Planting" onClose={() => setModal(false)}>
          <form onSubmit={save} className="space-y-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Field</label>
              <select value={form.field_id} onChange={e=>setForm(f=>({...f,field_id:e.target.value}))}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:border-violet-500 outline-none">
                <option value="">— none —</option>
                {fields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            {[['crop_name','Crop Name *','text',true],['variety','Variety','text'],['seed_lot','Seed Lot','text'],['season','Season (e.g. 2026-Q2)','text'],['crop_family','Crop Family (for rotation check)','text'],['planned_date','Planned Date','date'],['actual_date','Actual Date','date'],['seed_rate','Seed Rate (kg/acre)','number'],['days_to_maturity','Days to Maturity','number'],['target_yield_kg','Target Yield (kg)','number']].map(([k,label,type,req])=>(
              <div key={k}>
                <label className="block text-xs text-slate-400 mb-1">{label}</label>
                <input required={!!req} type={type} value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:border-violet-500 outline-none"/>
              </div>
            ))}
            <div>
              <label className="block text-xs text-slate-400 mb-1">Status</label>
              <select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:border-violet-500 outline-none">
                {PLANT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <button type="submit" disabled={saving} className="btn-violet w-full py-2 text-sm rounded-lg">
              {saving ? 'Saving…' : 'Log Planting'}
            </button>
          </form>
        </FarmModal>
      )}
    </div>
  );
}

function FarmOpsInventory() {
  const [items, setItems]   = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]   = useState(false);
  const [saving, setSaving] = useState(false);
  const [catFilter, setCatFilter] = useState('all');
  const [form, setForm] = useState({
    category: 'seed', name: '', quantity: '', unit: '', reorder_point: '',
    daily_usage: '', lead_time_days: '', preferred_supplier: '', last_price_usd: '',
    expiry_date: '', notes: '',
  });

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch(`${FARM_OPS_API}/inventory`, { credentials: 'include' }).then(r => r.json()),
      fetch(`${FARM_OPS_API}/inventory/alerts`, { credentials: 'include' }).then(r => r.json()),
    ]).then(([inv, al]) => { setItems(Array.isArray(inv) ? inv : []); setAlerts(Array.isArray(al) ? al : []); })
      .catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const save = async e => {
    e.preventDefault(); setSaving(true);
    try {
      const r = await fetch(`${FARM_OPS_API}/inventory`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!r.ok) throw new Error();
      const d = await r.json();
      setItems(i => [d, ...i]);
      setModal(false);
    } catch { /* pass */ }
    setSaving(false);
  };

  const del = async id => {
    await fetch(`${FARM_OPS_API}/inventory/${id}`, { method: 'DELETE', credentials: 'include' });
    setItems(i => i.filter(x => x.id !== id));
  };

  const visible = catFilter === 'all' ? items : items.filter(i => i.category === catFilter);
  const alertIds = new Set(alerts.map(a => a.id));

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-lg font-bold text-white">Inventory</h2>
        <button onClick={() => setModal(true)} className="btn-violet px-4 py-1.5 text-sm rounded-lg">+ Add Item</button>
      </div>
      {alerts.length > 0 && (
        <div className="mb-4 p-3 rounded-xl bg-amber-950/40 border border-amber-800/50">
          <p className="text-xs font-bold text-amber-400 mb-1">LOW STOCK ({alerts.length})</p>
          {alerts.map(a => <p key={a.id} className="text-xs text-amber-300">{a.name} — {a.quantity} {a.unit || 'units'} (reorder at {a.reorder_point})</p>)}
        </div>
      )}
      <div className="flex gap-2 flex-wrap mb-4">
        {['all', ...INV_CATEGORIES].map(c => (
          <button key={c} onClick={() => setCatFilter(c)}
            className={`px-3 py-1 text-xs rounded-full border transition-colors ${catFilter === c ? 'bg-violet-600 border-violet-500 text-white' : 'border-zinc-700 text-slate-400 hover:border-violet-600'}`}>
            {c}
          </button>
        ))}
      </div>
      {loading && <p className="text-slate-500 text-sm">Loading…</p>}
      {!loading && visible.length === 0 && <p className="text-slate-500 text-sm">No items in this category.</p>}
      <div className="space-y-2">
        {visible.map(item => (
          <div key={item.id} className={`glass-card px-4 py-3 flex items-center justify-between gap-4 ${alertIds.has(item.id) ? 'border-amber-800/60' : ''}`}>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-slate-400">{item.category}</span>
                <p className="font-medium text-white text-sm">{item.name}</p>
                {alertIds.has(item.id) && <span className="text-xs text-amber-400">⚠ low</span>}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {item.quantity} {item.unit || 'units'}{item.preferred_supplier ? ` · ${item.preferred_supplier}` : ''}
              </p>
            </div>
            <button onClick={() => del(item.id)} className="text-slate-600 hover:text-red-400 text-lg flex-shrink-0">×</button>
          </div>
        ))}
      </div>
      {modal && (
        <FarmModal title="Add Inventory Item" onClose={() => setModal(false)}>
          <form onSubmit={save} className="space-y-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Category</label>
              <select value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:border-violet-500 outline-none">
                {INV_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {[['name','Item Name *','text',true],['quantity','Current Quantity','number'],['unit','Unit (kg, L, bags…)','text'],['reorder_point','Reorder Point','number'],['daily_usage','Daily Usage','number'],['lead_time_days','Lead Time (days)','number'],['preferred_supplier','Preferred Supplier','text'],['last_price_usd','Last Price (USD)','number'],['expiry_date','Expiry Date','date']].map(([k,label,type,req])=>(
              <div key={k}>
                <label className="block text-xs text-slate-400 mb-1">{label}</label>
                <input required={!!req} type={type} value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:border-violet-500 outline-none"/>
              </div>
            ))}
            <button type="submit" disabled={saving} className="btn-violet w-full py-2 text-sm rounded-lg">
              {saving ? 'Saving…' : 'Add Item'}
            </button>
          </form>
        </FarmModal>
      )}
    </div>
  );
}

function FarmOpsEquipment() {
  const [equipment, setEquipment] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [modal, setModal]         = useState(false);
  const [logModal, setLogModal]   = useState(null);
  const [saving, setSaving]       = useState(false);
  const [form, setForm] = useState({ name: '', make_model: '', hours_current: '', service_interval_hrs: '', next_service_date: '', insurance_renewal: '', notes: '' });
  const [logForm, setLogForm] = useState({ log_type: 'maintenance', description: '', hours_at_service: '', cost_usd: '', downtime_hrs: '' });

  useEffect(() => {
    fetch(`${FARM_OPS_API}/equipment`, { credentials: 'include' })
      .then(r => r.json()).then(d => setEquipment(Array.isArray(d) ? d : []))
      .catch(() => {}).finally(() => setLoading(false));
  }, []);

  const save = async e => {
    e.preventDefault(); setSaving(true);
    try {
      const r = await fetch(`${FARM_OPS_API}/equipment`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!r.ok) throw new Error();
      const d = await r.json();
      setEquipment(eq => [d, ...eq]);
      setModal(false);
    } catch { /* pass */ }
    setSaving(false);
  };

  const saveLog = async e => {
    e.preventDefault(); setSaving(true);
    try {
      const r = await fetch(`${FARM_OPS_API}/equipment/${logModal}/log`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(logForm),
      });
      if (r.ok) { setLogModal(null); setLogForm({ log_type: 'maintenance', description: '', hours_at_service: '', cost_usd: '', downtime_hrs: '' }); }
    } catch { /* pass */ }
    setSaving(false);
  };

  const del = async id => {
    await fetch(`${FARM_OPS_API}/equipment/${id}`, { method: 'DELETE', credentials: 'include' });
    setEquipment(eq => eq.filter(x => x.id !== id));
  };

  const serviceStatus = eq => {
    if (!eq.next_service_date) return null;
    const days = Math.ceil((new Date(eq.next_service_date) - Date.now()) / 86400000);
    if (days < 0)  return { label: `Overdue ${Math.abs(days)}d`, cls: 'text-red-400' };
    if (days <= 7) return { label: `Due in ${days}d`, cls: 'text-amber-400' };
    return { label: `Due in ${days}d`, cls: 'text-slate-400' };
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-white">Equipment</h2>
        <button onClick={() => setModal(true)} className="btn-violet px-4 py-1.5 text-sm rounded-lg">+ Add Equipment</button>
      </div>
      {loading && <p className="text-slate-500 text-sm">Loading…</p>}
      {!loading && equipment.length === 0 && <p className="text-slate-500 text-sm">No equipment registered.</p>}
      <div className="space-y-3">
        {equipment.map(eq => {
          const svc = serviceStatus(eq);
          return (
            <div key={eq.id} className="glass-card px-4 py-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-semibold text-white">{eq.name}</p>
                  <p className="text-xs text-slate-400">{[eq.make_model, eq.hours_current != null && `${eq.hours_current}h`].filter(Boolean).join(' · ')}</p>
                  {svc && <p className={`text-xs font-medium mt-0.5 ${svc.cls}`}>{svc.label}</p>}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => setLogModal(eq.id)} className="text-xs text-violet-400 hover:text-violet-300 border border-violet-800 rounded px-2 py-1">Log Service</button>
                  <button onClick={() => del(eq.id)} className="text-slate-600 hover:text-red-400 text-lg">×</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {modal && (
        <FarmModal title="Register Equipment" onClose={() => setModal(false)}>
          <form onSubmit={save} className="space-y-3">
            {[['name','Equipment Name *','text',true],['make_model','Make / Model','text'],['hours_current','Current Hours','number'],['service_interval_hrs','Service Interval (hrs)','number'],['next_service_date','Next Service Date','date'],['insurance_renewal','Insurance Renewal','date']].map(([k,label,type,req])=>(
              <div key={k}>
                <label className="block text-xs text-slate-400 mb-1">{label}</label>
                <input required={!!req} type={type} value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:border-violet-500 outline-none"/>
              </div>
            ))}
            <button type="submit" disabled={saving} className="btn-violet w-full py-2 text-sm rounded-lg">
              {saving ? 'Saving…' : 'Register'}
            </button>
          </form>
        </FarmModal>
      )}
      {logModal && (
        <FarmModal title="Log Service / Repair" onClose={() => setLogModal(null)}>
          <form onSubmit={saveLog} className="space-y-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Type</label>
              <select value={logForm.log_type} onChange={e=>setLogForm(f=>({...f,log_type:e.target.value}))}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:border-violet-500 outline-none">
                {['maintenance','repair','inspection'].map(t=><option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            {[['description','Description','text'],['hours_at_service','Hours at Service','number'],['cost_usd','Cost (USD)','number'],['downtime_hrs','Downtime (hrs)','number']].map(([k,label,type])=>(
              <div key={k}>
                <label className="block text-xs text-slate-400 mb-1">{label}</label>
                <input type={type} value={logForm[k]} onChange={e=>setLogForm(f=>({...f,[k]:e.target.value}))}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:border-violet-500 outline-none"/>
              </div>
            ))}
            <button type="submit" disabled={saving} className="btn-violet w-full py-2 text-sm rounded-lg">
              {saving ? 'Saving…' : 'Save Log'}
            </button>
          </form>
        </FarmModal>
      )}
    </div>
  );
}

function FarmOpsTasks({ fields }) {
  const [tasks, setTasks]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]   = useState(false);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('pending');
  const [form, setForm] = useState({ field_id: '', title: '', description: '', due_date: '', assigned_to: '', status: 'pending', priority: 'medium', est_hours: '' });

  const load = () => {
    setLoading(true);
    fetch(`${FARM_OPS_API}/tasks`, { credentials: 'include' })
      .then(r => r.json()).then(d => setTasks(Array.isArray(d) ? d : []))
      .catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const save = async e => {
    e.preventDefault(); setSaving(true);
    try {
      const r = await fetch(`${FARM_OPS_API}/tasks`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, field_id: form.field_id || null }),
      });
      if (!r.ok) throw new Error();
      const d = await r.json();
      setTasks(t => [d, ...t]);
      setModal(false);
    } catch { /* pass */ }
    setSaving(false);
  };

  const toggle = async (id, cur) => {
    const next = cur === 'done' ? 'pending' : cur === 'pending' ? 'in_progress' : 'done';
    const r = await fetch(`${FARM_OPS_API}/tasks/${id}`, {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    }).then(x => x.json());
    setTasks(t => t.map(x => x.id === id ? { ...x, status: next } : x));
  };

  const del = async id => {
    await fetch(`${FARM_OPS_API}/tasks/${id}`, { method: 'DELETE', credentials: 'include' });
    setTasks(t => t.filter(x => x.id !== id));
  };

  const visible = tasks.filter(t => filter === 'all' || t.status === filter);
  const prioColor = p => ({ high: 'text-red-400', medium: 'text-amber-400', low: 'text-slate-400' })[p] || 'text-slate-400';

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-lg font-bold text-white">Tasks</h2>
        <button onClick={() => setModal(true)} className="btn-violet px-4 py-1.5 text-sm rounded-lg">+ Add Task</button>
      </div>
      <div className="flex gap-2 flex-wrap mb-4">
        {['all', ...TASK_STATUSES].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1 text-xs rounded-full border transition-colors ${filter === s ? 'bg-violet-600 border-violet-500 text-white' : 'border-zinc-700 text-slate-400 hover:border-violet-600'}`}>
            {s}
          </button>
        ))}
      </div>
      {loading && <p className="text-slate-500 text-sm">Loading…</p>}
      {!loading && visible.length === 0 && <p className="text-slate-500 text-sm">No tasks in this category.</p>}
      <div className="space-y-2">
        {visible.map(t => (
          <div key={t.id} className={`glass-card px-4 py-3 flex items-start gap-3 ${t.status === 'done' ? 'opacity-60' : ''}`}>
            <button onClick={() => toggle(t.id, t.status)} className="mt-0.5 flex-shrink-0 w-5 h-5 rounded border-2 border-violet-600 flex items-center justify-center text-xs text-violet-400 hover:bg-violet-600/20">
              {t.status === 'done' ? '✓' : t.status === 'in_progress' ? '…' : ''}
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className={`font-medium text-sm ${t.status === 'done' ? 'line-through text-slate-500' : 'text-white'}`}>{t.title}</p>
                <span className={`text-xs font-medium ${prioColor(t.priority)}`}>{t.priority}</span>
              </div>
              <p className="text-xs text-slate-400">{[t.field_name && `Field: ${t.field_name}`, t.assigned_to && `→ ${t.assigned_to}`, t.due_date && `Due: ${new Date(t.due_date).toLocaleDateString()}`].filter(Boolean).join(' · ')}</p>
            </div>
            <button onClick={() => del(t.id)} className="text-slate-600 hover:text-red-400 text-lg flex-shrink-0">×</button>
          </div>
        ))}
      </div>
      {modal && (
        <FarmModal title="Add Task" onClose={() => setModal(false)}>
          <form onSubmit={save} className="space-y-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Field</label>
              <select value={form.field_id} onChange={e=>setForm(f=>({...f,field_id:e.target.value}))}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:border-violet-500 outline-none">
                <option value="">— none —</option>
                {fields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            {[['title','Task Title *','text',true],['assigned_to','Assigned To','text'],['due_date','Due Date','date'],['est_hours','Estimated Hours','number']].map(([k,label,type,req])=>(
              <div key={k}>
                <label className="block text-xs text-slate-400 mb-1">{label}</label>
                <input required={!!req} type={type} value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:border-violet-500 outline-none"/>
              </div>
            ))}
            <div className="grid grid-cols-2 gap-3">
              {[['status','Status',TASK_STATUSES],['priority','Priority',TASK_PRIORITIES]].map(([k,label,opts])=>(
                <div key={k}>
                  <label className="block text-xs text-slate-400 mb-1">{label}</label>
                  <select value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:border-violet-500 outline-none">
                    {opts.map(o=><option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Description</label>
              <textarea rows={2} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:border-violet-500 outline-none"/>
            </div>
            <button type="submit" disabled={saving} className="btn-violet w-full py-2 text-sm rounded-lg">
              {saving ? 'Saving…' : 'Add Task'}
            </button>
          </form>
        </FarmModal>
      )}
    </div>
  );
}

function FarmOpsHarvest({ fields }) {
  const [harvests, setHarvests] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [modal, setModal]       = useState(false);
  const [saving, setSaving]     = useState(false);
  const [form, setForm] = useState({ field_id: '', crop_name: '', start_date: '', end_date: '', area_acres: '', yield_kg: '', moisture_pct: '', grade: '', storage_location: '', notes: '' });

  useEffect(() => {
    fetch(`${FARM_OPS_API}/harvests`, { credentials: 'include' })
      .then(r => r.json()).then(d => setHarvests(Array.isArray(d) ? d : []))
      .catch(() => {}).finally(() => setLoading(false));
  }, []);

  const save = async e => {
    e.preventDefault(); setSaving(true);
    try {
      const r = await fetch(`${FARM_OPS_API}/harvests`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, field_id: form.field_id || null }),
      });
      if (!r.ok) throw new Error();
      const d = await r.json();
      setHarvests(h => [d, ...h]);
      setModal(false);
    } catch { /* pass */ }
    setSaving(false);
  };

  const del = async id => {
    await fetch(`${FARM_OPS_API}/harvests/${id}`, { method: 'DELETE', credentials: 'include' });
    setHarvests(h => h.filter(x => x.id !== id));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-white">Harvest Records</h2>
        <button onClick={() => setModal(true)} className="btn-violet px-4 py-1.5 text-sm rounded-lg">+ Log Harvest</button>
      </div>
      {loading && <p className="text-slate-500 text-sm">Loading…</p>}
      {!loading && harvests.length === 0 && <p className="text-slate-500 text-sm">No harvest records yet.</p>}
      <div className="space-y-3">
        {harvests.map(h => (
          <div key={h.id} className="glass-card px-4 py-3 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="font-semibold text-white">{h.crop_name}</p>
              <p className="text-xs text-slate-400">
                {[h.field_name && `Field: ${h.field_name}`, h.yield_kg && `${h.yield_kg} kg`, h.area_acres && `${h.area_acres} acres`, h.start_date && new Date(h.start_date).toLocaleDateString()].filter(Boolean).join(' · ')}
              </p>
              {h.storage_location && <p className="text-xs text-teal-400 mt-0.5">Storage: {h.storage_location}</p>}
            </div>
            <button onClick={() => del(h.id)} className="text-slate-600 hover:text-red-400 text-lg flex-shrink-0">×</button>
          </div>
        ))}
      </div>
      {modal && (
        <FarmModal title="Log Harvest" onClose={() => setModal(false)}>
          <form onSubmit={save} className="space-y-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Field</label>
              <select value={form.field_id} onChange={e=>setForm(f=>({...f,field_id:e.target.value}))}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:border-violet-500 outline-none">
                <option value="">— none —</option>
                {fields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            {[['crop_name','Crop Name *','text',true],['start_date','Start Date','date'],['end_date','End Date','date'],['area_acres','Area (acres)','number'],['yield_kg','Yield (kg)','number'],['moisture_pct','Moisture %','number'],['grade','Grade','text'],['storage_location','Storage Location','text']].map(([k,label,type,req])=>(
              <div key={k}>
                <label className="block text-xs text-slate-400 mb-1">{label}</label>
                <input required={!!req} type={type} value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:border-violet-500 outline-none"/>
              </div>
            ))}
            <button type="submit" disabled={saving} className="btn-violet w-full py-2 text-sm rounded-lg">
              {saving ? 'Saving…' : 'Log Harvest'}
            </button>
          </form>
        </FarmModal>
      )}
    </div>
  );
}

function FarmOpsPage() {
  const { user } = useAuth();
  const [tab, setTab]         = useState('fields');
  const [fields, setFields]   = useState([]);
  const [hbAlerts, setHbAlerts] = useState([]);
  const [hbLoaded, setHbLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetch(`${FARM_OPS_API}/fields`, { credentials: 'include' })
      .then(r => r.json()).then(d => setFields(Array.isArray(d) ? d : [])).catch(() => {});
    fetch(`${FARM_OPS_API}/heartbeat`, { credentials: 'include' })
      .then(r => r.json()).then(d => { setHbAlerts(d.alerts || []); setHbLoaded(true); }).catch(() => {});
  }, [user]);

  if (!user) return (
    <div className="max-w-lg mx-auto px-4 py-16 text-center">
      <p className="text-slate-500">Sign in to use Farm Operations.</p>
    </div>
  );

  const TABS = [
    { id: 'fields',    label: 'Fields',    icon: '🗺️' },
    { id: 'planting',  label: 'Planting',  icon: '🌱' },
    { id: 'inventory', label: 'Inventory', icon: '📦' },
    { id: 'equipment', label: 'Equipment', icon: '🚜' },
    { id: 'tasks',     label: 'Tasks',     icon: '✅' },
    { id: 'harvest',   label: 'Harvest',   icon: '🌾' },
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 pb-28">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-3xl">🌾</span>
        <div>
          <h1 className="text-2xl font-extrabold text-white">Farm Operations</h1>
          <p className="text-xs text-slate-400">Fields · Planting · Inventory · Equipment · Tasks · Harvest</p>
        </div>
      </div>

      {hbLoaded && <FarmAlert alerts={hbAlerts} />}

      <div className="flex gap-1 flex-wrap mb-6">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${tab === t.id ? 'bg-violet-600 border-violet-500 text-white' : 'border-zinc-700 text-slate-400 hover:border-violet-600 hover:text-slate-200'}`}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      <div>
        {tab === 'fields'    && <FarmOpsFields    fields={fields} setFields={setFields} />}
        {tab === 'planting'  && <FarmOpsPlanting  fields={fields} />}
        {tab === 'inventory' && <FarmOpsInventory />}
        {tab === 'equipment' && <FarmOpsEquipment />}
        {tab === 'tasks'     && <FarmOpsTasks     fields={fields} />}
        {tab === 'harvest'   && <FarmOpsHarvest   fields={fields} />}
      </div>
    </div>
  );
}

// ── FloraBot Chatbot ──────────────────────────────────────────
function FloraBot() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([
    { role: 'bot', text: "Hi! I'm FloraBot 🌿 Ask me anything about plants, foraging, survival, or nature!" }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const msgsEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => msgsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
    inputRef.current?.focus();
    return () => clearTimeout(t);
  }, [open, msgs]);

  const SUGGESTIONS = ['Is this plant edible?', 'Survival tips?', 'Treat an insect sting?', 'Identify mushrooms safely?'];

  const send = async (text) => {
    const q = (text || input).trim();
    if (!q || loading) return;
    setInput('');
    setMsgs(m => [...m, { role: 'user', text: q }]);
    setLoading(true);
    try {
      const r = await fetch(`${API}/chat/public`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || `Server error ${r.status}`); }
      const d = await r.json();
      setMsgs(m => [...m, { role: 'bot', text: d.answer || d.reply || d.message || "I couldn't process that. Try again!" }]);
    } catch (e) {
      setMsgs(m => [...m, { role: 'bot', text: e.message?.includes('429') ? 'Too many messages — wait a moment and try again.' : "Connection issue — please try again in a moment." }]);
    }
    setLoading(false);
  };

  return (
    <>
      <button className="florabot-fab" onClick={() => setOpen(o => !o)} title="Chat with FloraBot">
        {open ? '✕' : '🌿'}
      </button>
      {open && (
        <div className="florabot-panel">
          <div className="florabot-header">
            <div className="florabot-avatar">🌿</div>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'white' }}>FloraBot</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <div className="florabot-online-dot" />
                <p style={{ margin: 0, fontSize: '11px', color: '#a78bfa' }}>AI Plant Assistant</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#475569', fontSize: '20px', lineHeight: 1 }}>×</button>
          </div>

          <div className="florabot-messages">
            {msgs.map((m, i) => (
              <div key={i} className={`florabot-msg ${m.role}`}>{m.text}</div>
            ))}
            {loading && (
              <div className="florabot-msg bot">
                <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
              </div>
            )}
            <div ref={msgsEndRef} />
          </div>

          {msgs.length <= 2 && (
            <div className="florabot-suggestions">
              {SUGGESTIONS.map(s => (
                <button key={s} className="florabot-chip" onClick={() => send(s)}>{s}</button>
              ))}
            </div>
          )}

          <div className="florabot-input-row">
            <input
              ref={inputRef}
              className="florabot-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
              placeholder="Ask about plants…"
              disabled={loading}
            />
            <button className="florabot-send" onClick={() => send()} disabled={loading || !input.trim()}>➤</button>
          </div>
        </div>
      )}
    </>
  );
}

// ── SOS Survival Scanner ──────────────────────────────────────
function LastSOSResult() {
  const [last, setLast] = useState(null);
  useEffect(() => {
    try { const c = JSON.parse(localStorage.getItem('sos_cache') || '[]'); if (c.length) setLast(c[0]); } catch {}
  }, []);
  if (!last) return null;
  const col = last.risk_level === 'CRITICAL' ? 'text-red-400' : last.risk_level === 'WARNING' ? 'text-amber-400' : 'text-green-400';
  return (
    <div className="max-w-sm mx-auto mt-6 p-4 bg-zinc-900/60 border border-zinc-800 rounded-2xl">
      <p className="text-xs text-zinc-600 uppercase tracking-widest mb-2">Last Scan (cached)</p>
      <div className="flex items-center gap-2">
        <span className={`font-bold text-sm ${col}`}>{last.risk_level}</span>
        <span className="text-zinc-400 text-sm">— {last.organism || 'Unknown'}</span>
      </div>
      {last.timestamp && <p className="text-xs text-zinc-700 mt-1">{new Date(last.timestamp).toLocaleString()}</p>}
    </div>
  );
}

function SOSPage() {
  const fileRef  = useRef(null);
  const [image, setImage]       = useState(null);
  const [imageData, setImageData] = useState(null);
  const [gps, setGps]           = useState(null);
  const [gpsStatus, setGpsStatus] = useState('getting');
  const [scanning, setScanning] = useState(false);
  const [result, setResult]     = useState(null);
  const [error, setError]       = useState(null);
  const [offline, setOffline]   = useState(false);

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      pos => { setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setGpsStatus('ok'); },
      ()  => setGpsStatus('denied'),
      { timeout: 10000, enableHighAccuracy: true, maximumAge: 60000 }
    );
  }, []);

  const handleCapture = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { setImage(ev.target.result); setImageData(ev.target.result); };
    reader.readAsDataURL(file);
  };

  const scan = async () => {
    if (!imageData) return;
    setScanning(true); setError(null);
    try {
      const r = await fetch(`${API}/sos/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageData, lat: gps?.lat, lng: gps?.lng }),
        signal: AbortSignal.timeout(30000),
      });
      if (!r.ok) throw new Error('AI scan failed');
      const data = await r.json();
      setResult(data);
      try {
        const cache = JSON.parse(localStorage.getItem('sos_cache') || '[]');
        cache.unshift({ ...data, timestamp: Date.now(), gps });
        localStorage.setItem('sos_cache', JSON.stringify(cache.slice(0, 5)));
      } catch {}
    } catch {
      try {
        const cache = JSON.parse(localStorage.getItem('sos_cache') || '[]');
        if (cache.length) { setResult({ ...cache[0], source: 'offline_cache' }); setOffline(true); }
        else throw new Error('No cached data available');
      } catch {
        setError('Network error. Call emergency services directly: 911 / 112 / 999');
      }
    }
    setScanning(false);
  };

  const reset = () => { setImage(null); setImageData(null); setResult(null); setError(null); setOffline(false); };

  if (scanning) return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-4">
      <div className="w-20 h-20 border-4 border-red-500 border-t-transparent rounded-full animate-spin mb-6" />
      <p className="text-red-400 text-xl font-bold tracking-wide animate-pulse">Analyzing for threats…</p>
      <p className="text-zinc-600 text-sm mt-2">AI scanning image + GPS coordinates</p>
    </div>
  );

  if (result) {
    const isCrit = result.risk_level === 'CRITICAL';
    const isWarn = result.risk_level === 'WARNING';
    const riskCol = isCrit ? 'text-red-400' : isWarn ? 'text-amber-400' : 'text-green-400';
    const riskBorder = isCrit ? 'border-red-500 bg-red-950/50' : isWarn ? 'border-amber-500 bg-amber-950/50' : 'border-green-500 bg-green-950/50';
    return (
      <div className="min-h-screen bg-black px-4 py-6 pb-28 max-w-lg mx-auto">
        {offline && <div className="mb-4 p-3 border border-amber-700/50 bg-amber-950/30 rounded-xl text-xs text-amber-400 text-center">⚠️ Offline mode — showing cached result. Call emergency services directly.</div>}
        {/* Risk banner */}
        <div className={`w-full rounded-2xl p-6 mb-5 text-center border-2 ${riskBorder}`}>
          <div className={`text-5xl mb-2 ${isCrit ? 'animate-pulse' : ''}`}>{isCrit ? '🚨' : isWarn ? '⚠️' : '✅'}</div>
          <div className={`text-3xl font-black tracking-widest mb-1 ${riskCol}`}>{result.risk_level}</div>
          <p className="text-white font-bold text-lg">{result.organism || 'Unknown organism'}</p>
          {result.scientific_name && <p className="text-zinc-500 text-sm italic mt-0.5">{result.scientific_name}</p>}
        </div>
        {/* Immediate action */}
        {result.immediate_action && (
          <div className={`mb-4 p-4 rounded-xl border ${isCrit ? 'border-red-600/60 bg-red-950/40' : 'border-amber-600/60 bg-amber-950/30'}`}>
            <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1">Do This NOW</p>
            <p className={`font-bold text-base leading-snug ${isCrit ? 'text-red-300' : 'text-amber-300'}`}>{result.immediate_action}</p>
          </div>
        )}
        {/* First aid steps */}
        {result.first_aid_steps?.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">First Aid Steps</p>
            <div className="space-y-3">
              {result.first_aid_steps.map((step, i) => (
                <div key={i} className="flex gap-3 items-start p-4 bg-zinc-900/80 border border-zinc-800 rounded-xl">
                  <span className={`text-2xl font-black w-8 shrink-0 ${riskCol}`}>{i + 1}</span>
                  <p className="text-zinc-200 text-base leading-snug">{step}</p>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* DO NOT */}
        {result.do_not && (
          <div className="mb-4 p-4 bg-red-950/25 border border-red-700/40 rounded-xl">
            <p className="text-xs font-bold text-red-500 uppercase tracking-widest mb-1">Critical — Do NOT</p>
            <p className="text-red-300 font-medium text-sm">{result.do_not}</p>
          </div>
        )}
        {/* Emergency numbers */}
        {result.emergency_numbers && (
          <div className="mb-4">
            <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">Emergency Numbers</p>
            <div className="grid grid-cols-2 gap-3">
              <a href={`tel:${result.emergency_numbers.primary}`} className="flex flex-col items-center py-4 bg-red-600 hover:bg-red-500 rounded-2xl transition-colors">
                <span className="text-3xl font-black text-white">{result.emergency_numbers.primary}</span>
                <span className="text-red-200 text-xs mt-0.5">Primary Emergency</span>
              </a>
              <a href={`tel:${result.emergency_numbers.secondary}`} className="flex flex-col items-center py-4 bg-zinc-800 hover:bg-zinc-700 rounded-2xl transition-colors">
                <span className="text-3xl font-black text-white">{result.emergency_numbers.secondary}</span>
                <span className="text-zinc-400 text-xs mt-0.5">International</span>
              </a>
            </div>
            {result.emergency_numbers.local_note && <p className="text-xs text-zinc-600 mt-2 text-center">{result.emergency_numbers.local_note}</p>}
          </div>
        )}
        {/* YouTube first aid video */}
        {result.youtube_query && (
          <a href={`https://www.youtube.com/results?search_query=${encodeURIComponent(result.youtube_query)}`}
            target="_blank" rel="noreferrer"
            className="block w-full p-4 bg-red-900/30 border border-red-700/40 rounded-xl text-center mb-4 hover:bg-red-900/50 transition-colors">
            <p className="text-red-400 font-bold">▶ Watch Emergency First Aid Video</p>
            <p className="text-xs text-zinc-600 mt-0.5 truncate">{result.youtube_query}</p>
          </a>
        )}
        {result.notes && (
          <div className="mb-4 p-3 bg-zinc-900/60 border border-zinc-800 rounded-xl">
            <p className="text-xs text-zinc-600 mb-1">Medical Note</p>
            <p className="text-sm text-zinc-400">{result.notes}</p>
          </div>
        )}
        <button onClick={reset} className="w-full py-4 bg-zinc-800 hover:bg-zinc-700 rounded-2xl text-zinc-300 font-bold text-lg transition-colors">
          ← Scan Again
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black px-4 py-8 pb-28">
      <div className="text-center mb-8">
        <div className="text-6xl mb-3">🆘</div>
        <h1 className="text-3xl font-black text-white tracking-widest">SOS SCANNER</h1>
        <p className="text-zinc-600 text-sm mt-1">Emergency hazard identification — snap a photo, get instant first aid</p>
      </div>
      {/* GPS status */}
      <div className={`flex items-center gap-2 px-4 py-3 rounded-xl mb-6 max-w-sm mx-auto border ${
        gpsStatus === 'ok' ? 'bg-green-950/30 border-green-700/40' :
        gpsStatus === 'denied' ? 'bg-red-950/30 border-red-700/40' : 'bg-zinc-900 border-zinc-800'
      }`}>
        <span>{gpsStatus === 'ok' ? '📍' : gpsStatus === 'denied' ? '⚠️' : '⏳'}</span>
        <span className={`text-sm font-medium ${gpsStatus === 'ok' ? 'text-green-400' : gpsStatus === 'denied' ? 'text-red-400' : 'text-zinc-500'}`}>
          {gpsStatus === 'ok' ? `GPS locked ${gps.lat.toFixed(4)}, ${gps.lng.toFixed(4)}` :
           gpsStatus === 'denied' ? 'GPS unavailable — location-adaptive numbers may not apply' :
           'Getting GPS location…'}
        </span>
      </div>
      {/* Image preview + scan */}
      {image ? (
        <div className="mb-6 max-w-sm mx-auto">
          <img src={image} className="w-full rounded-2xl border border-zinc-700 mb-3" alt="Captured" />
          <div className="flex gap-3">
            <button onClick={scan} className="flex-1 py-4 bg-red-600 hover:bg-red-500 active:scale-95 rounded-2xl text-white font-black text-lg transition-all shadow-lg shadow-red-500/30">
              🔍 SCAN FOR THREATS
            </button>
            <button onClick={reset} className="px-4 py-4 bg-zinc-800 hover:bg-zinc-700 rounded-2xl text-zinc-400 font-bold transition-colors">✕</button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-col items-center gap-4 mb-8">
            <button onClick={() => fileRef.current?.click()}
              className="w-40 h-40 rounded-full bg-red-600 hover:bg-red-500 active:scale-95 flex flex-col items-center justify-center border-4 border-red-400 transition-all shadow-2xl shadow-red-600/40">
              <span className="text-5xl">📷</span>
              <span className="text-white font-black text-xs mt-1 tracking-wide">SNAP PHOTO</span>
            </button>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleCapture} />
            <p className="text-zinc-600 text-sm text-center max-w-xs leading-relaxed">
              Point at snake, mushroom, plant, spider, or any potential hazard. AI will identify it and give emergency instructions.
            </p>
          </div>
          <div className="mb-6 max-w-sm mx-auto">
            <p className="text-xs text-zinc-700 uppercase tracking-widest text-center mb-3">Quick Emergency Dial</p>
            <div className="grid grid-cols-3 gap-2">
              {[['911','US/CA'], ['112','Global'], ['999','UK/MY'], ['000','AU'], ['119','ID'], ['143','PH']].map(([num, label]) => (
                <a key={num} href={`tel:${num}`}
                  className="flex flex-col items-center py-3 px-2 bg-zinc-900 border border-zinc-800 hover:border-red-600 rounded-xl transition-colors">
                  <span className="text-lg font-black text-white">{num}</span>
                  <span className="text-xs text-zinc-600">{label}</span>
                </a>
              ))}
            </div>
          </div>
        </>
      )}
      {error && (
        <div className="max-w-sm mx-auto p-4 bg-red-950/40 border border-red-700 rounded-xl text-center mb-4">
          <p className="text-red-400 font-bold mb-1">Scan Failed</p>
          <p className="text-zinc-400 text-sm">{error}</p>
        </div>
      )}
      {!image && <LastSOSResult />}
    </div>
  );
}

// ── Splash Screen ─────────────────────────────────────────────
function SplashScreen({ onDone }) {
  const [fading, setFading] = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setFading(true), 2000);
    const t2 = setTimeout(onDone, 2600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onDone]);
  return (
    <div className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center transition-opacity duration-500 ${fading ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
      style={{ background: 'linear-gradient(135deg, #020810 0%, #0a1f0a 50%, #020810 100%)' }}>
      {/* Animated rings */}
      <div className="relative flex items-center justify-center mb-8">
        {[1,2,3].map(i => (
          <div key={i} className="absolute rounded-full border border-green-500/20 animate-ping"
            style={{ width: i*80, height: i*80, animationDuration: `${i*0.8+0.6}s`, animationDelay: `${i*0.2}s` }} />
        ))}
        <div className="relative z-10 text-6xl">🌿</div>
      </div>
      <h1 className="text-5xl font-black tracking-widest text-white mb-2">
        Bio<span style={{ color: '#06b6d4' }}>Scan</span>
      </h1>
      <p className="text-zinc-500 text-sm tracking-widest uppercase mb-10">Field Intelligence Scanner</p>
      <div className="flex gap-2">
        {[0,1,2,3,4].map(i => (
          <div key={i} className="w-2 h-2 bg-green-400 rounded-full animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
    </div>
  );
}

// ── Subtle animated background ────────────────────────────────

function SvgButterfly({ top, duration, delay, scale = 1 }) {
  const flapSpeed = `${0.35 + Math.random() * 0.2}s`;
  const hue = [270, 310, 200, 160][Math.floor(Math.random() * 4)];
  const c1 = `hsla(${hue},80%,65%,0.5)`;
  const c2 = `hsla(${hue},70%,55%,0.35)`;
  return (
    <div style={{
      position: 'absolute', top, left: 0, willChange: 'transform',
      animation: `butterflyZig ${duration}s ease-in-out ${delay}s infinite`,
    }}>
      <svg viewBox="0 0 90 70" width={90 * scale} height={70 * scale} style={{ overflow: 'visible' }}>
        <g transform="translate(45,35)">
          {/* Left upper wing */}
          <path d="M0,0 Q-22,-28 -38,-12 Q-22,-2 0,0" fill={c1}
            style={{ transformOrigin:'0 0', animation:`wingFold ${flapSpeed} ease-in-out infinite alternate` }} />
          {/* Left lower wing */}
          <path d="M0,0 Q-28,8 -32,24 Q-16,20 0,0" fill={c2}
            style={{ transformOrigin:'0 0', animation:`wingFold ${flapSpeed} ease-in-out infinite alternate` }} />
          {/* Right upper wing */}
          <path d="M0,0 Q22,-28 38,-12 Q22,-2 0,0" fill={c1}
            style={{ transformOrigin:'0 0', animation:`wingFold ${flapSpeed} ease-in-out infinite alternate-reverse` }} />
          {/* Right lower wing */}
          <path d="M0,0 Q28,8 32,24 Q16,20 0,0" fill={c2}
            style={{ transformOrigin:'0 0', animation:`wingFold ${flapSpeed} ease-in-out infinite alternate-reverse` }} />
          {/* Body */}
          <ellipse cx="0" cy="4" rx="2.5" ry="11" fill={`hsla(${hue},60%,30%,0.6)`} />
          {/* Antennae */}
          <path d="M-1.5,-7 Q-6,-19 -5,-23" fill="none" stroke={`hsla(${hue},70%,70%,0.5)`} strokeWidth="1.2"/>
          <path d="M1.5,-7 Q6,-19 5,-23" fill="none" stroke={`hsla(${hue},70%,70%,0.5)`} strokeWidth="1.2"/>
          <circle cx="-5" cy="-23" r="2" fill={`hsla(${hue},70%,70%,0.5)`}/>
          <circle cx="5" cy="-23" r="2" fill={`hsla(${hue},70%,70%,0.5)`}/>
        </g>
      </svg>
    </div>
  );
}

function SvgLeaf({ left, duration, delay, scale = 1 }) {
  const green = `rgba(${34 + (delay|0)%40},${160 + (delay|0)%37},${94 + (delay|0)%30},0.38)`;
  return (
    <div style={{
      position: 'absolute', bottom: 0, left, willChange: 'transform',
      animation: `leafFloat ${duration}s ease-in-out ${delay}s infinite`,
    }}>
      <svg viewBox="0 0 38 56" width={38 * scale} height={56 * scale}>
        <path d="M19,52 C7,40 4,26 11,14 C15,6 23,4 27,11 C34,21 32,40 19,52Z" fill={green} />
        <path d="M19,52 Q21,33 19,14" fill="none" stroke={green} strokeWidth="1.5" opacity="0.6"/>
        {/* Side veins */}
        <path d="M19,38 Q25,30 27,26" fill="none" stroke={green} strokeWidth="0.8" opacity="0.5"/>
        <path d="M19,28 Q25,20 26,16" fill="none" stroke={green} strokeWidth="0.8" opacity="0.5"/>
        <path d="M19,38 Q13,30 11,26" fill="none" stroke={green} strokeWidth="0.8" opacity="0.5"/>
      </svg>
    </div>
  );
}

function SvgFirefly({ style }) {
  return (
    <div style={{ position: 'absolute', willChange: 'transform', ...style }}>
      <svg viewBox="0 0 12 12" width="12" height="12">
        <circle cx="6" cy="6" r="3" fill="rgba(255,255,150,0.9)">
          <animate attributeName="r" values="2;4;2" dur="1.8s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0.4;1;0.4" dur="1.8s" repeatCount="indefinite"/>
        </circle>
        <circle cx="6" cy="6" r="6" fill="rgba(255,255,100,0.15)">
          <animate attributeName="r" values="4;8;4" dur="1.8s" repeatCount="indefinite"/>
        </circle>
      </svg>
    </div>
  );
}

const BG_BUTTERFLIES = [
  { top:'18%', duration:44, delay:2,  scale:0.9 },
  { top:'42%', duration:52, delay:14, scale:1.1 },
  { top:'30%', duration:48, delay:28, scale:0.85 },
];
const BG_LEAVES = [
  { left:'5%',  duration:18, delay:0,  scale:1.0 },
  { left:'18%', duration:22, delay:4,  scale:0.85 },
  { left:'32%', duration:16, delay:9,  scale:1.2 },
  { left:'48%', duration:24, delay:2,  scale:0.9 },
  { left:'63%', duration:19, delay:13, scale:1.0 },
  { left:'75%', duration:21, delay:7,  scale:0.8 },
  { left:'88%', duration:17, delay:17, scale:1.1 },
  { left:'94%', duration:23, delay:5,  scale:0.95 },
];
const BG_FIREFLIES = [
  { left:'12%', top:'65%', animDur:'6s',  animDelay:'0s'  },
  { left:'28%', top:'55%', animDur:'8s',  animDelay:'2s'  },
  { left:'55%', top:'70%', animDur:'7s',  animDelay:'4s'  },
  { left:'72%', top:'60%', animDur:'9s',  animDelay:'1s'  },
  { left:'85%', top:'75%', animDur:'6.5s',animDelay:'3s'  },
  { left:'42%', top:'80%', animDur:'10s', animDelay:'5s'  },
];

function AnimatedBg() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0" aria-hidden>
      {BG_BUTTERFLIES.map((b, i) => <SvgButterfly key={`bf${i}`} {...b} />)}
      {BG_LEAVES.map((l, i) => <SvgLeaf key={`l${i}`} {...l} />)}
      {BG_FIREFLIES.map((f, i) => (
        <SvgFirefly key={`ff${i}`} style={{
          left: f.left, top: f.top,
          animation: `fireflyFloat ${f.animDur} ease-in-out ${f.animDelay} infinite`,
        }} />
      ))}
    </div>
  );
}

// ── Scan result celebration burst ─────────────────────────────
const MODE_EMOJIS = {
  plant:    ['🌿','🍃','🌸','🌺','🌱','🌻'],
  insect:   ['🐛','🦋','🐝','🐞','🦗','🦟'],
  bird:     ['🐦','🦅','🦜','🦢','🕊️','🦆'],
  mushroom: ['🍄','🌰','🍂','🌿'],
  reptile:  ['🦎','🐍','🐢','🐊'],
  marine:   ['🐠','🐟','🐬','🦈','🌊','🐙'],
  survival: ['⚠️','🔥','💧','🏕️','🌲','🪨'],
};

const BURST_COUNT = 10;
const BURST_ANGLES = Array.from({ length: BURST_COUNT }, (_, i) => (i * 360) / BURST_COUNT);

function ResultCelebration({ mode }) {
  const [alive, setAlive] = useState(true);
  const emojis = MODE_EMOJIS[mode] || MODE_EMOJIS.plant;
  useEffect(() => {
    const t = setTimeout(() => setAlive(false), 1800);
    return () => clearTimeout(t);
  }, []);
  if (!alive) return null;
  return (
    <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center">
      <div className="relative">
        {BURST_ANGLES.map((angle, i) => {
          const rad = (angle * Math.PI) / 180;
          const dist = 70 + (i % 3) * 45;
          return (
            <div key={i} className="absolute text-2xl" style={{
              top: 0, left: 0,
              '--tx': `${Math.cos(rad) * dist}px`,
              '--ty': `${Math.sin(rad) * dist}px`,
              '--rot': `${(i % 3 - 1) * 120}deg`,
              animation: `resultBurst 1.4s ease-out ${i * 0.06}s forwards`,
            }}>
              {emojis[i % emojis.length]}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState('home');
  const [notifCount, setNotifCount] = useState(0);
  const [showNotifs, setShowNotifs] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    const handler = e => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  const onNav = useCallback(p => { setPage(p); window.scrollTo(0, 0); }, []);

  const installPwa = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') setInstallPrompt(null);
  };

  const refreshNotifs = useCallback(async () => {
    try {
      const r = await fetch(`${API}/notifications/unread-count`, { credentials: 'include' });
      if (r.ok) { const d = await r.json(); setNotifCount(d.count || 0); }
    } catch {}
  }, []);

  useEffect(() => {
    refreshNotifs();
    const interval = setInterval(refreshNotifs, 60000);
    return () => clearInterval(interval);
  }, [refreshNotifs]);

  return (
    <AuthProvider>
      <ErrorBoundary>
        {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}
        <div className="min-h-screen text-slate-100">
          <Navbar
            active={page}
            onNav={onNav}
            notifCount={notifCount}
            onOpenNotifs={() => setShowNotifs(true)}
            showNotifs={showNotifs}
            onCloseNotifs={() => setShowNotifs(false)}
          />
          <main className="pb-24">
            {page === 'home'      && <HomePage onNav={onNav} />}
            {page === 'scan'      && <ScanPage onNav={onNav} />}
            {page === 'sos'       && <SOSPage />}
            {page === 'history'   && <HistoryPage />}
            {page === 'library'   && <LibraryPage />}
            {page === 'survival'  && <SurvivalPage onNav={onNav} />}
            {page === 'map'       && <MapPage />}
            {page === 'farming'   && <FarmingPage />}
            {page === 'farm-ops'  && <FarmOpsPage />}
            {page === 'journal'   && <JournalPage />}
            {page === 'favorites' && <FavoritesPage />}
            {page === 'landscape' && <LandscapePage />}
            {page === 'profile'   && <ProfilePage onNav={onNav} />}
            {page === 'admin'     && <AdminPage />}
            {page === 'login'     && <LoginPage onNav={onNav} />}
            {page === 'signup'    && <SignupPage onNav={onNav} />}
            {page === 'forgot'    && <ForgotPage onNav={onNav} />}
          </main>
          <BottomNav active={page} onNav={onNav} />
          <FloraBot />
          {installPrompt && (
            <div className="fixed bottom-20 left-4 right-4 lg:left-auto lg:right-4 lg:w-80 glass-card p-4 flex items-center justify-between shadow-2xl z-50">
              <span className="text-sm text-zinc-300">Install FloraIQ for offline use</span>
              <div className="flex gap-2">
                <button onClick={installPwa} className="btn-violet px-3 py-1.5 text-xs rounded-lg">Install</button>
                <button onClick={() => setInstallPrompt(null)} className="text-zinc-600 hover:text-zinc-400 text-xs px-2">×</button>
              </div>
            </div>
          )}
        </div>
      </ErrorBoundary>
    </AuthProvider>
  );
}
