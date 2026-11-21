import React, { useState, useEffect, useRef } from 'react';
import {
  HardDrive, ShieldCheck, Database, RefreshCw, Folder,
  Trash2, Plus, Clock, CheckCircle2, AlertTriangle,
  Check, Layers, Play, Pause, Server, Wifi, WifiOff,
  ArrowUpCircle, ArrowDownCircle, Activity, Cpu, MemoryStick,
  Package, FileText, Users, AlertCircle, Terminal, X
} from 'lucide-react';

interface BackupItem {
  filename: string; fullPath: string; sizeBytes: number; sizeMB: string;
  createdAt: string; label?: string; notes?: string; isSafety?: boolean;
  counts?: { invoices: number; products: number; customers: number; sessions: number; customItems?: number };
}

interface ServerStats {
  isOnline: boolean;
  local: { invoices: number; products: number; sessions: number; customers: number; users: number; expenses: number };
  pending: { invoices: number; ledger: number; sessions: number; total: number };
  synced: { invoices: number };
  remote: { invoices: number | null; products: number | null; sessions: number | null };
  db: { sizeMB: string; path: string };
  backup: { count: number; lastBackupTime: string | null };
  lastSyncTime: string | null;
  system: { uptimeH: number; uptimeM: number; usedRamGB: string; totalRamGB: string; ramPct: number; hostname: string; platform: string };
}

export default function MasterServerBackupView({ currentUser }: { currentUser?: any }) {
  const [stats, setStats] = useState<ServerStats | null>(null);
  const [hubInfo, setHubInfo] = useState<any>(null);
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [autoConfig, setAutoConfig] = useState<any>({ enabled: true, intervalMinutes: 30, retention: 30, lastBackupTime: null, nextBackupTime: null });
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [backupLabel, setBackupLabel] = useState('');
  const [backupNotes, setBackupNotes] = useState('');
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'backups' | 'sync'>('overview');
  const [logLines, setLogLines] = useState<string[]>([]);
  const [syncingNow, setSyncingNow] = useState(false);
  const [tick, setTick] = useState(0);
  const logRef = useRef<HTMLDivElement>(null);
  const isAdmin = currentUser?.role?.toLowerCase() === 'admin';

  // Clock tick every second
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Listen for REAL-TIME sync logs from electron main/syncService
  useEffect(() => {
    const handleSyncLog = (_event: any, log: any) => {
      const entry = typeof log === 'string' ? log : `${log.time || new Date().toLocaleTimeString('en-GB', { hour12: false })}  ${log.message}`;
      setLogLines(prev => [...prev.slice(-200), entry]);
      setTimeout(() => { logRef.current?.scrollTo({ top: 99999, behavior: 'smooth' }); }, 30);
    };

    // @ts-ignore
    window.ipcRenderer?.on('sync-log', handleSyncLog);

    // Initial logs fetch from main process memory buffer
    // @ts-ignore
    const invoker = window.ipcRenderer?.invoke || window.db?.invoke;
    if (invoker) {
      invoker('get-sync-logs').then((logs: string[]) => {
        if (Array.isArray(logs) && logs.length > 0) {
          setLogLines(logs);
          setTimeout(() => { logRef.current?.scrollTo({ top: 99999, behavior: 'smooth' }); }, 50);
        }
      }).catch(() => {});
    }

    return () => {
      // @ts-ignore
      window.ipcRenderer?.off('sync-log', handleSyncLog);
    };
  }, []);

  const handleForceSync = async () => {
    setSyncingNow(true);
    try {
      // @ts-ignore
      const invoker = window.ipcRenderer?.invoke || window.db?.invoke;
      const res = invoker ? await invoker('trigger-sync') : await window.db?.triggerSync?.();
      notify(res?.message || 'Sync cycle triggered', res?.success !== false ? 'success' : 'error');
      await loadAll();
    } catch (err: any) {
      notify('Sync error: ' + (err?.message || err), 'error');
    } finally {
      setSyncingNow(false);
    }
  };

  useEffect(() => {
    loadAll();
    const t = setInterval(loadAll, 15000);
    return () => clearInterval(t);
  }, []);

  const loadAll = async () => {
    try {
      // @ts-ignore
      const [st, info, list, cfg] = await Promise.all([
        // @ts-ignore
        window.db?.getServerStats?.() ?? null,
        // @ts-ignore
        window.db?.getBackupHubInfo?.() ?? null,
        // @ts-ignore
        window.db?.getLocalBackups?.() ?? [],
        // @ts-ignore
        window.db?.getAutoBackupConfig?.() ?? null,
      ]);
      if (st) setStats(st);
      if (info) setHubInfo(info);
      setBackups(list || []);
      if (cfg) setAutoConfig(cfg);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const notify = (text: string, type: 'success' | 'error' = 'success') => {
    setActionMessage({ text, type });
    setTimeout(() => setActionMessage(null), 5000);
  };

  const handleUpdateSchedule = async (updates: any) => {
    const updated = { ...autoConfig, ...updates };
    setAutoConfig(updated);
    try {
      // @ts-ignore
      await window.db?.setAutoBackupConfig?.(updated);
      notify('Backup schedule updated');
      loadAll();
    } catch (e: any) { notify(e.message, 'error'); }
  };

  const handleCreateBackup = async (e: React.FormEvent) => {
    e.preventDefault(); setCreating(true);
    try {
      // @ts-ignore
      const res = await window.db.createLocalBackup({ label: backupLabel.trim() || 'Manual Snapshot', notes: backupNotes.trim() });
      if (res?.filename) { notify(`Snapshot "${res.filename}" saved`); setShowCreateModal(false); setBackupLabel(''); setBackupNotes(''); loadAll(); }
      else notify(res?.error || 'Backup failed', 'error');
    } catch (e: any) { notify(e.message, 'error'); }
    finally { setCreating(false); }
  };

  const handleRestore = async (b: BackupItem) => {
    if (!isAdmin) return alert('Admins only');
    if (!confirm(`Restore from "${b.filename}"?\n\nA safety snapshot will be taken first.`)) return;
    setRestoring(b.fullPath);
    try {
      // @ts-ignore
      const res = await window.db.restoreLocalBackup(b.fullPath);
      if (res?.success) { notify('Database restored successfully'); loadAll(); }
      else notify(res?.error || 'Restore failed', 'error');
    } catch (e: any) { notify(e.message, 'error'); }
    finally { setRestoring(null); }
  };

  const handleDelete = async (b: BackupItem) => {
    if (!isAdmin) return alert('Admins only');
    if (!confirm(`Delete snapshot "${b.filename}"?`)) return;
    try {
      // @ts-ignore
      const res = await window.db.deleteLocalBackup(b.fullPath);
      if (res?.success) { notify('Snapshot deleted'); loadAll(); }
      else notify(res?.error || 'Delete failed', 'error');
    } catch (e: any) { notify(e.message, 'error'); }
  };

  const handleChooseDirectory = async () => {
    if (!isAdmin) return alert('Admins only');
    try {
      // @ts-ignore
      const res = await window.db.chooseBackupDirectory();
      if (res) { notify(`Backup dir: ${res}`); handleUpdateSchedule({ backupDirectory: res }); }
    } catch (e: any) { notify(e.message, 'error'); }
  };

  const handleRestoreFromFile = async () => {
    if (!isAdmin) return alert('Admins only');
    try {
      // @ts-ignore
      const fp = await window.db.chooseBackupFileToRestore();
      if (!fp) return;
      if (!confirm(`Restore from:\n${fp}`)) return;
      setRestoring(fp);
      // @ts-ignore
      const res = await window.db.restoreLocalBackup(fp);
      if (res?.success) { notify('External DB restored'); loadAll(); }
      else notify(res?.error || 'Restore failed', 'error');
    } catch (e: any) { notify(e.message, 'error'); }
    finally { setRestoring(null); }
  };

  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-GB', { hour12: false });
  const dateStr = now.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div className="flex flex-col h-full bg-[#0a0f1a] text-slate-100 font-mono select-none overflow-hidden">

      {/* ── TOP STATUS BAR ── */}
      <div className="shrink-0 flex items-center justify-between px-5 py-2 bg-[#0d1424] border-b border-slate-700/50 text-[11px]">
        <div className="flex items-center gap-4">
          <span className="text-emerald-400 font-black tracking-widest uppercase flex items-center gap-1.5">
            <Server size={13} /> Nova FreshMart — Server Node
          </span>
          <span className="text-slate-500">TERM-W80J · SVR02</span>
          <span className="text-slate-500">{hubInfo?.machineName || 'SVR02'}</span>
        </div>
        <div className="flex items-center gap-5">
          <span className={`flex items-center gap-1.5 font-bold ${stats?.isOnline ? 'text-emerald-400' : 'text-rose-400'}`}>
            {stats?.isOnline ? <Wifi size={12} /> : <WifiOff size={12} />}
            {stats?.isOnline ? 'CLOUD CONNECTED' : 'OFFLINE'}
          </span>
          <span className="text-cyan-400 font-black tabular-nums">{timeStr}</span>
          <span className="text-slate-400">{dateStr}</span>
          <button onClick={loadAll} className="text-slate-500 hover:text-emerald-400 cursor-pointer transition-colors">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── NOTIFICATION ── */}
      {actionMessage && (
        <div className={`shrink-0 px-5 py-2 text-xs font-bold flex items-center justify-between ${actionMessage.type === 'success' ? 'bg-emerald-900/60 text-emerald-300 border-b border-emerald-700/40' : 'bg-rose-900/60 text-rose-300 border-b border-rose-700/40'}`}>
          <span>{actionMessage.text}</span>
          <button onClick={() => setActionMessage(null)} className="cursor-pointer opacity-60 hover:opacity-100"><X size={13} /></button>
        </div>
      )}

      {/* ── TABS ── */}
      <div className="shrink-0 flex items-center gap-1 px-5 pt-3 pb-0 border-b border-slate-700/40">
        {([['overview','Overview'], ['sync','Sync & Data'], ['backups','Backup Archive']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={`px-4 py-2 text-xs font-bold rounded-t-lg transition-all cursor-pointer border-b-2 ${activeTab === id ? 'text-emerald-400 border-emerald-500 bg-slate-800/60' : 'text-slate-500 border-transparent hover:text-slate-300'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── MAIN CONTENT ── */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">

        {/* ════ TAB: OVERVIEW ════ */}
        {activeTab === 'overview' && (
          <div className="space-y-4">

            {/* KPI row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: 'Local Invoices', value: stats?.local.invoices ?? '—', sub: `${stats?.synced.invoices ?? 0} synced to cloud`, color: 'text-emerald-400', icon: FileText },
                { label: 'Local Products', value: stats?.local.products ?? '—', sub: `Remote: ${stats?.remote.products ?? '—'}`, color: 'text-cyan-400', icon: Package },
                { label: 'Pending Upload', value: stats?.pending.total ?? '—', sub: `${stats?.pending.invoices ?? 0} inv · ${stats?.pending.ledger ?? 0} ledger`, color: stats?.pending.total ? 'text-amber-400' : 'text-emerald-400', icon: ArrowUpCircle },
                { label: 'Backup Snapshots', value: stats?.backup.count ?? '—', sub: stats?.backup.lastBackupTime ? `Last: ${new Date(stats.backup.lastBackupTime).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}` : 'No backups yet', color: 'text-purple-400', icon: HardDrive },
              ].map(({ label, value, sub, color, icon: Icon }) => (
                <div key={label} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">{label}</span>
                    <Icon size={14} className={color} />
                  </div>
                  <p className={`text-2xl font-black tabular-nums ${color}`}>{value}</p>
                  <p className="text-[10px] text-slate-500 mt-1">{sub}</p>
                </div>
              ))}
            </div>

            {/* System + DB row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

              {/* System health */}
              <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 space-y-3">
                <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold flex items-center gap-1.5"><Cpu size={11} /> System Health</p>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Hostname</span>
                    <span className="text-white font-bold">{stats?.system.hostname || 'SVR02'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Uptime</span>
                    <span className="text-emerald-400 font-bold">{stats ? `${stats.system.uptimeH}h ${stats.system.uptimeM}m` : '—'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">RAM Usage</span>
                    <span className="text-cyan-400 font-bold">{stats ? `${stats.system.usedRamGB} / ${stats.system.totalRamGB} GB` : '—'}</span>
                  </div>
                  {stats && (
                    <div className="w-full bg-slate-700 rounded-full h-1.5">
                      <div className="bg-cyan-500 h-1.5 rounded-full transition-all" style={{ width: `${stats.system.ramPct}%` }} />
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-400">Platform</span>
                    <span className="text-slate-300 font-bold">{stats?.system.platform || 'win32'}</span>
                  </div>
                </div>
              </div>

              {/* Database */}
              <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 space-y-3">
                <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold flex items-center gap-1.5"><Database size={11} /> Local Database</p>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">DB Size</span>
                    <span className="text-white font-black">{stats?.db.sizeMB || '0.00'} MB</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Invoices</span>
                    <span className="text-emerald-400 font-bold">{stats?.local.invoices ?? '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Sessions</span>
                    <span className="text-cyan-400 font-bold">{stats?.local.sessions ?? '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Customers</span>
                    <span className="text-slate-300 font-bold">{stats?.local.customers ?? '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Users</span>
                    <span className="text-slate-300 font-bold">{stats?.local.users ?? '—'}</span>
                  </div>
                </div>
              </div>

              {/* Backup status */}
              <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 space-y-3">
                <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold flex items-center gap-1.5"><ShieldCheck size={11} /> Backup Status</p>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Auto-Backup</span>
                    <span className={`font-black ${autoConfig.enabled ? 'text-emerald-400' : 'text-rose-400'}`}>{autoConfig.enabled ? '● ACTIVE' : '○ PAUSED'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Interval</span>
                    <span className="text-slate-300 font-bold">Every {autoConfig.intervalMinutes} min</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Snapshots</span>
                    <span className="text-purple-400 font-black">{stats?.backup.count ?? 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Next Run</span>
                    <span className="text-cyan-400 font-mono text-[10px]">
                      {autoConfig.enabled && autoConfig.nextBackupTime ? new Date(autoConfig.nextBackupTime).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'}) : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Last Backup</span>
                    <span className="text-slate-300 font-mono text-[10px]">
                      {stats?.backup.lastBackupTime ? new Date(stats.backup.lastBackupTime).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : 'None yet'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Live terminal log */}
            <div className="bg-[#060b14] border border-slate-700/50 rounded-xl overflow-hidden shadow-lg">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-700/40 bg-slate-800/40">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold flex items-center gap-1.5"><Terminal size={12} className="text-emerald-400" /> Live Sync Diagnostics Log</span>
                  <span className="text-[10px] text-emerald-400 font-mono font-bold">● ACTIVE</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setLogLines([])}
                    className="text-[10px] text-slate-400 hover:text-white px-2 py-0.5 rounded bg-slate-700/40 hover:bg-slate-700 font-mono transition-colors"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={handleForceSync}
                    disabled={syncingNow}
                    className="text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-3 py-1 rounded-lg flex items-center gap-1.5 shadow-sm transition-all cursor-pointer active:scale-95"
                  >
                    <RefreshCw size={11} className={syncingNow ? 'animate-spin' : ''} />
                    <span>{syncingNow ? 'Syncing...' : 'Force Sync Now'}</span>
                  </button>
                </div>
              </div>
              <div ref={logRef} className="h-48 overflow-y-auto p-3.5 space-y-1 text-[11px] font-mono leading-relaxed select-text">
                {logLines.length === 0 && <p className="text-slate-600 italic">No sync events recorded yet. Click "Force Sync Now" to run an immediate cycle.</p>}
                {logLines.map((l, i) => {
                  const isErr = l.includes('ERROR') || l.includes('fail') || l.includes('Error') || l.includes('OFFLINE');
                  const isOk = l.includes('OK') || l.includes('connected') || l.includes('success');
                  const isPush = l.includes('[PUSH]');
                  const isPull = l.includes('[PULL]');
                  const isNet = l.includes('[NET]');
                  const isDb = l.includes('[DB]');
                  const colorClass = isErr ? 'text-rose-400 font-bold'
                    : isOk ? 'text-emerald-300 font-semibold'
                    : isPush ? 'text-cyan-400'
                    : isPull ? 'text-sky-300'
                    : isNet ? 'text-purple-300'
                    : isDb ? 'text-amber-300'
                    : 'text-slate-300';
                  return <p key={i} className={colorClass}>{l}</p>;
                })}
              </div>
            </div>

          </div>
        )}

        {/* ════ TAB: SYNC & DATA ════ */}
        {activeTab === 'sync' && (
          <div className="space-y-4">

            {/* Connection status banner */}
            <div className={`flex items-center justify-between p-4 rounded-xl border ${stats?.isOnline ? 'bg-emerald-900/20 border-emerald-700/40' : 'bg-rose-900/20 border-rose-700/40'}`}>
              <div className="flex items-center gap-3">
                {stats?.isOnline ? <Wifi size={20} className="text-emerald-400" /> : <WifiOff size={20} className="text-rose-400" />}
                <div>
                  <p className={`font-black text-sm ${stats?.isOnline ? 'text-emerald-400' : 'text-rose-400'}`}>{stats?.isOnline ? 'Cloud Database Connected' : 'Cloud Database Offline'}</p>
                  <p className="text-[11px] text-slate-400">sg-mariadb01.offloadsql.com · novafreshmart schema</p>
                </div>
              </div>
              <div className="text-right text-xs">
                <p className="text-slate-400">Last Sync</p>
                <p className="text-white font-mono font-bold">{stats?.lastSyncTime ? new Date(stats.lastSyncTime).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'}) : 'Never'}</p>
              </div>
            </div>

            {/* Push vs Pull grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

              {/* PUSH — local → cloud */}
              <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700/40 bg-slate-700/30">
                  <ArrowUpCircle size={15} className="text-emerald-400" />
                  <span className="text-xs font-black text-emerald-400 uppercase tracking-wider">Push — Local → Cloud</span>
                </div>
                <div className="p-4 space-y-3 text-xs">
                  {[
                    { label: 'Invoices synced to cloud', done: stats?.synced.invoices ?? 0, pending: stats?.pending.invoices ?? 0 },
                    { label: 'Inventory ledger entries', done: (stats?.local.invoices ?? 0) - (stats?.pending.ledger ?? 0), pending: stats?.pending.ledger ?? 0 },
                    { label: 'Sessions pushed', done: (stats?.local.sessions ?? 0) - (stats?.pending.sessions ?? 0), pending: stats?.pending.sessions ?? 0 },
                  ].map(row => (
                    <div key={row.label}>
                      <div className="flex justify-between mb-1">
                        <span className="text-slate-400">{row.label}</span>
                        <span className="font-bold">
                          <span className="text-emerald-400">{row.done} synced</span>
                          {row.pending > 0 && <span className="text-amber-400 ml-2">{row.pending} pending</span>}
                        </span>
                      </div>
                      <div className="w-full bg-slate-700 rounded-full h-1">
                        <div className="bg-emerald-500 h-1 rounded-full" style={{ width: row.done + row.pending > 0 ? `${Math.round((row.done / (row.done + row.pending)) * 100)}%` : '100%' }} />
                      </div>
                    </div>
                  ))}
                  <div className={`mt-2 p-2.5 rounded-lg border text-center font-black text-sm ${stats?.pending.total === 0 ? 'bg-emerald-900/30 border-emerald-700/40 text-emerald-400' : 'bg-amber-900/30 border-amber-700/40 text-amber-400'}`}>
                    {stats?.pending.total === 0 ? '✓ All records synced to cloud' : `${stats?.pending.total} records pending upload`}
                  </div>
                </div>
              </div>

              {/* PULL — cloud → local */}
              <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700/40 bg-slate-700/30">
                  <ArrowDownCircle size={15} className="text-cyan-400" />
                  <span className="text-xs font-black text-cyan-400 uppercase tracking-wider">Pull — Cloud → Local</span>
                </div>
                <div className="p-4 space-y-3 text-xs">
                  {[
                    { label: 'Products', local: stats?.local.products ?? 0, remote: stats?.remote.products },
                    { label: 'Invoices (all terminals)', local: stats?.local.invoices ?? 0, remote: stats?.remote.invoices },
                    { label: 'Sessions', local: stats?.local.sessions ?? 0, remote: stats?.remote.sessions },
                  ].map(row => (
                    <div key={row.label} className="flex justify-between items-center py-1.5 border-b border-slate-700/30 last:border-0">
                      <span className="text-slate-400">{row.label}</span>
                      <div className="flex items-center gap-3 font-mono font-bold text-[11px]">
                        <span className="text-slate-300">Local: <span className="text-white">{row.local}</span></span>
                        <span className="text-slate-600">|</span>
                        <span className="text-slate-300">Cloud: <span className="text-cyan-400">{row.remote ?? (stats?.isOnline ? '...' : 'offline')}</span></span>
                      </div>
                    </div>
                  ))}
                  <div className="mt-2 p-2.5 rounded-lg border bg-cyan-900/20 border-cyan-700/30 text-center text-[11px] text-cyan-400 font-bold">
                    Auto-pull every 15s · catalog watcher every 3.5s
                  </div>
                </div>
              </div>
            </div>

            {/* Scheduler controls */}
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-3">Backup Scheduler</p>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div className="flex items-center justify-between bg-slate-700/40 rounded-lg px-3 py-2.5">
                  <div>
                    <p className="text-slate-400 text-[10px] uppercase">Auto-Backup</p>
                    <p className={`font-black ${autoConfig.enabled ? 'text-emerald-400' : 'text-slate-400'}`}>{autoConfig.enabled ? '● Active' : '○ Paused'}</p>
                  </div>
                  {isAdmin && (
                    <button onClick={() => handleUpdateSchedule({ enabled: !autoConfig.enabled })} className={`p-1.5 rounded-lg border cursor-pointer ${autoConfig.enabled ? 'border-emerald-600/40 text-emerald-400 hover:bg-emerald-900/30' : 'border-slate-600 text-slate-400 hover:bg-slate-700'}`}>
                      {autoConfig.enabled ? <Pause size={13} /> : <Play size={13} />}
                    </button>
                  )}
                </div>
                <div className="bg-slate-700/40 rounded-lg px-3 py-2.5">
                  <p className="text-slate-400 text-[10px] uppercase mb-1">Frequency</p>
                  <select value={autoConfig.intervalMinutes} disabled={!isAdmin} onChange={e => handleUpdateSchedule({ intervalMinutes: Number(e.target.value) })}
                    className="w-full bg-slate-900 border border-slate-600 text-white rounded px-1.5 py-1 text-[11px] font-bold outline-none cursor-pointer disabled:opacity-50">
                    <option value={15}>Every 15 min</option>
                    <option value={30}>Every 30 min</option>
                    <option value={60}>Every 1 hour</option>
                    <option value={120}>Every 2 hours</option>
                    <option value={1440}>Once daily</option>
                  </select>
                </div>
                <div className="bg-slate-700/40 rounded-lg px-3 py-2.5">
                  <p className="text-slate-400 text-[10px] uppercase mb-1">Retention</p>
                  <select value={autoConfig.retention || 30} disabled={!isAdmin} onChange={e => handleUpdateSchedule({ retention: Number(e.target.value) })}
                    className="w-full bg-slate-900 border border-slate-600 text-white rounded px-1.5 py-1 text-[11px] font-bold outline-none cursor-pointer disabled:opacity-50">
                    <option value={15}>Keep 15</option>
                    <option value={30}>Keep 30</option>
                    <option value={50}>Keep 50</option>
                    <option value={100}>Keep 100</option>
                  </select>
                </div>
                <div className="bg-slate-700/40 rounded-lg px-3 py-2.5">
                  <p className="text-slate-400 text-[10px] uppercase">Next Run</p>
                  <p className="text-cyan-400 font-mono font-bold text-[11px] mt-0.5">
                    {autoConfig.enabled && autoConfig.nextBackupTime ? new Date(autoConfig.nextBackupTime).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'}) : '—'}
                  </p>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* ════ TAB: BACKUP ARCHIVE ════ */}
        {activeTab === 'backups' && (
          <div className="space-y-4">

            {/* Actions row */}
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400">{backups.length} snapshot{backups.length !== 1 ? 's' : ''} stored locally</p>
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <>
                    <button onClick={handleRestoreFromFile} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg border border-slate-600 cursor-pointer transition-colors">
                      <Folder size={12} /> Restore from File
                    </button>
                    <button onClick={handleChooseDirectory} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg border border-slate-600 cursor-pointer transition-colors">
                      <Folder size={12} /> Set Directory
                    </button>
                    <button onClick={() => setShowCreateModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg cursor-pointer transition-colors">
                      <Plus size={12} /> New Snapshot
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Backup list */}
            {backups.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-600">
                <HardDrive size={40} className="mb-3 opacity-30" />
                <p className="font-bold">No snapshots yet</p>
                <p className="text-xs mt-1">Create a manual snapshot or enable auto-backup</p>
              </div>
            ) : (
              <div className="space-y-2">
                {backups.map(b => (
                  <div key={b.fullPath} className={`bg-slate-800/60 border rounded-xl p-4 flex items-center justify-between gap-4 ${b.isSafety ? 'border-amber-700/40' : 'border-slate-700/50'}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <HardDrive size={16} className={b.isSafety ? 'text-amber-400 shrink-0' : 'text-purple-400 shrink-0'} />
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white truncate">{b.label || b.filename}</p>
                        <p className="text-[10px] text-slate-500 font-mono">{b.filename}</p>
                        {b.notes && <p className="text-[10px] text-slate-400 mt-0.5">{b.notes}</p>}
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-500">
                          <span>{b.sizeMB} MB</span>
                          <span>{new Date(b.createdAt).toLocaleString()}</span>
                          {b.counts && <span>{b.counts.invoices} inv · {b.counts.products} prod · {b.counts.sessions} sess</span>}
                        </div>
                      </div>
                    </div>
                    {isAdmin && (
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => handleRestore(b)} disabled={!!restoring} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-cyan-900/40 hover:bg-cyan-800/60 text-cyan-400 rounded-lg border border-cyan-700/40 cursor-pointer transition-colors disabled:opacity-40">
                          {restoring === b.fullPath ? <RefreshCw size={11} className="animate-spin" /> : <RefreshCw size={11} />} Restore
                        </button>
                        <button onClick={() => handleDelete(b)} disabled={!!restoring} className="p-1.5 text-slate-500 hover:text-rose-400 cursor-pointer transition-colors disabled:opacity-40">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>

      {/* ── CREATE SNAPSHOT MODAL ── */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0d1424] border border-slate-700 rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-black text-white flex items-center gap-2"><HardDrive size={16} className="text-purple-400" /> New Snapshot</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-500 hover:text-white cursor-pointer"><X size={16} /></button>
            </div>
            <form onSubmit={handleCreateBackup} className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wider block mb-1.5">Label</label>
                <input value={backupLabel} onChange={e => setBackupLabel(e.target.value)} placeholder="e.g. Before price update"
                  className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500" />
              </div>
              <div>
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wider block mb-1.5">Notes (optional)</label>
                <textarea value={backupNotes} onChange={e => setBackupNotes(e.target.value)} rows={2} placeholder="Any notes about this snapshot..."
                  className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500 resize-none" />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowCreateModal(false)} className="flex-1 py-2 text-sm font-bold bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg cursor-pointer transition-colors">Cancel</button>
                <button type="submit" disabled={creating} className="flex-1 py-2 text-sm font-bold bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg cursor-pointer transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  {creating ? <><RefreshCw size={13} className="animate-spin" /> Creating...</> : <><Check size={13} /> Create Snapshot</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
