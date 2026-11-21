import React, { useState, useEffect } from 'react';
import { 
  Lock, User, ArrowRight, AlertCircle, Phone, Globe, Eye, EyeOff, 
  Laptop, Building2, Check, X, Wifi, WifiOff, Server 
} from 'lucide-react';
import lunaLogo from '../assets/lunapos-logo.png';
import novaLogo from '../assets/nova-freshmart-logo.png';

export default function LoginSplash({ onLoginSuccess, deviceMode = 'pos' }: { onLoginSuccess: (user: any) => void; deviceMode?: string }) {
  const [splashStage, setSplashStage] = useState<'luna' | 'nova' | 'login'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Terminal & Branch configuration state
  const [terminalConfig, setTerminalConfig] = useState<any>({
    current_branch_id: 'BR-MAIN',
    current_branch_name: 'Main FreshMart Branch',
    current_terminal_id: 'TERM-01',
    current_terminal_name: 'Touch Terminal 01'
  });
  const [branches, setBranches] = useState<any[]>([]);
  const [terminals, setTerminals] = useState<any[]>([]);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [showConfigModal, setShowConfigModal] = useState<boolean>(false);
  
  // Terminal config edit form & security lock
  const [editBranchId, setEditBranchId] = useState<string>('BR-MAIN');
  const [editTerminalId, setEditTerminalId] = useState<string>('TERM-01');
  const [editTerminalName, setEditTerminalName] = useState<string>('');
  const [isCreatingNewTerminal, setIsCreatingNewTerminal] = useState<boolean>(false);
  const [newCustomTerminalId, setNewCustomTerminalId] = useState<string>('');
  const [setupPin, setSetupPin] = useState<string>('');
  const [setupError, setSetupError] = useState<string>('');

  // Admin authorization modal before opening config
  const [showAdminAuthModal, setShowAdminAuthModal] = useState<boolean>(false);
  const [adminAuthPin, setAdminAuthPin] = useState<string>('');
  const [adminAuthError, setAdminAuthError] = useState<string>('');
  const [isAdminAuthorizing, setIsAdminAuthorizing] = useState<boolean>(false);

  useEffect(() => {
    loadTerminalInfo();
  }, []);

  const loadTerminalInfo = async () => {
    // @ts-ignore
    if (!window.db) return;
    try {
      // @ts-ignore
      const st = await window.db.getSyncStatus();
      if (st) {
        setIsOnline(Boolean(st.online || st.isOnline));
        if (st.config) {
          setTerminalConfig(st.config);
          setEditBranchId(st.config.current_branch_id || 'BR-MAIN');
          setEditTerminalId(st.config.current_terminal_id || 'TERM-01');
          setEditTerminalName(st.config.current_terminal_name || 'Touch Terminal 01');

          // If device has never been provisioned on this machine, prompt setup
          if (st.config.device_provisioned !== 'true') {
            setShowConfigModal(true);
          }
        }
      }
      // @ts-ignore
      const bList = await window.db.getBranches();
      if (bList && bList.length > 0) setBranches(bList);
      // @ts-ignore
      const tList = await window.db.getTerminals();
      if (tList && tList.length > 0) {
        setTerminals(tList);
        // If assigned terminal was deleted in backoffice, adjust edit selection
        if (st?.config?.current_terminal_id) {
          const exists = tList.some((t: any) => t.id === st.config.current_terminal_id);
          if (!exists && !st.config.current_terminal_id.includes('BACKOFFICE')) {
            setEditTerminalId(tList[0]?.id || 'TERM-01');
            setEditTerminalName(tList[0]?.name || 'Touch Terminal 01');
          }
        }
      }
    } catch (e) {
      console.warn('Could not load terminal info:', e);
    }
  };

  const handleVerifyAdminAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminAuthError('');
    if (!adminAuthPin.trim()) return;

    setIsAdminAuthorizing(true);
    try {
      // @ts-ignore
      const res = await window.db.verifyPin({ pin: adminAuthPin });
      const isAdmin = res?.success && (res.user?.role === 'Admin' || res.user?.role === 'Manager' || (res.user?.username || '').toLowerCase() === 'admin');
      if (isAdmin) {
        setShowAdminAuthModal(false);
        setEditBranchId(terminalConfig.current_branch_id || 'BR-MAIN');
        setEditTerminalId(terminalConfig.current_terminal_id || 'TERM-01');
        setEditTerminalName(terminalConfig.current_terminal_name || 'Touch Terminal 01');
        setSetupPin(adminAuthPin);
        setSetupError('');
        setShowConfigModal(true);
      } else {
        setAdminAuthError('Access Denied: Incorrect Admin PIN. Only Store Admin or Manager can reconfigure this PC.');
      }
    } catch (err: any) {
      setAdminAuthError('Verification error: ' + err.message);
    } finally {
      setIsAdminAuthorizing(false);
    }
  };

  const handleSaveTerminalSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSetupError('');

    if (!setupPin.trim()) {
      setSetupError('Admin PIN is required to bind and lock this device.');
      return;
    }

    try {
      // @ts-ignore
      const res = await window.db.verifyPin({ pin: setupPin });
      const isAdmin = res?.success && (res.user?.role === 'Admin' || res.user?.role === 'Manager' || (res.user?.username || '').toLowerCase() === 'admin');
      if (!isAdmin) {
        setSetupError('Authorization failed: Invalid Admin PIN. Only Admin or Manager can lock device identity.');
        return;
      }
    } catch (err: any) {
      setSetupError('PIN verification failed: ' + err.message);
      return;
    }

    const branch = branches.find(b => b.id === editBranchId) || { id: editBranchId, name: 'Main Branch' };
    
    let finalTerminalId = editTerminalId;
    let finalTerminalName = editTerminalName.trim();

    if (isCreatingNewTerminal) {
      finalTerminalId = (newCustomTerminalId.trim() || `TERM-${Date.now()}`).toUpperCase().replace(/\s+/g, '-');
      finalTerminalName = editTerminalName.trim() || `Terminal ${finalTerminalId}`;
      try {
        // @ts-ignore
        if (window.db?.createTerminal) {
          // @ts-ignore
          await window.db.createTerminal({
            id: finalTerminalId,
            branch_id: branch.id,
            name: finalTerminalName,
            status: 'online'
          });
        }
      } catch (err: any) {
        console.warn('Could not register new terminal:', err);
      }
    } else {
      const term = terminals.find(t => t.id === editTerminalId);
      finalTerminalName = editTerminalName.trim() || term?.name || `Terminal ${editTerminalId}`;
    }

    const isBackoffice = finalTerminalId === 'TERM-BACKOFFICE' || finalTerminalId.toLowerCase().includes('backoffice');

    const newConf = {
      current_branch_id: branch.id,
      current_branch_name: branch.name,
      current_terminal_id: finalTerminalId,
      current_terminal_name: finalTerminalName,
      is_backoffice: isBackoffice ? 'true' : 'false',
      device_provisioned: 'true'
    };

    try {
      // @ts-ignore
      if (window.db?.setTerminalConfig) {
        // @ts-ignore
        await window.db.setTerminalConfig(newConf);
      }
      setTerminalConfig(newConf);
      setShowConfigModal(false);
      setIsCreatingNewTerminal(false);
      setSetupPin('');
      // Reload terminal list
      // @ts-ignore
      const updatedTList = await window.db.getTerminals();
      if (updatedTList && updatedTList.length > 0) setTerminals(updatedTList);
    } catch (err: any) {
      alert('Failed to save terminal configuration: ' + err.message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    
    setIsLoading(true);
    setError('');
    
    try {
      // @ts-ignore
      const user = await window.db.login({ username, password });
      
      if (user) {
        // Check branch restriction if user is bound to a specific branch (Admins bypass)
        if (user.role !== 'Admin' && user.branch_id && user.branch_id !== 'ALL' && terminalConfig.current_branch_id) {
          if (user.branch_id !== terminalConfig.current_branch_id) {
            setError(`Branch Access Denied: User "${user.username}" is assigned to branch "${user.branch_id}". Cannot sign in on ${terminalConfig.current_branch_name || terminalConfig.current_branch_id}.`);
            setIsLoading(false);
            return;
          }
        }

        // Check terminal restriction if user is bound to specific terminal(s) (Admins bypass)
        if (user.role !== 'Admin' && user.allowed_terminals && user.allowed_terminals !== 'ALL' && terminalConfig.current_terminal_id) {
          const allowedList = user.allowed_terminals.split(',').map((t: string) => t.trim().toLowerCase());
          const curId = (terminalConfig.current_terminal_id || '').toLowerCase();
          const curName = (terminalConfig.current_terminal_name || '').toLowerCase();

          const isMatch = allowedList.some((allowed: string) => {
            if (allowed === curId) return true;
            if (curName && curName.includes(allowed)) return true;
            // Match digits (e.g. "1" matches "TERM-01")
            const numA = allowed.replace(/\D/g, '');
            const numB = curId.replace(/\D/g, '');
            if (numA && numB && parseInt(numA, 10) === parseInt(numB, 10)) return true;
            if (allowed.includes('backoffice') && curId.includes('backoffice')) return true;
            if (allowed.includes('express') && (curId.includes('03') || curName.includes('express'))) return true;
            return false;
          });

          if (!isMatch) {
            setError(`Terminal Access Denied: User "${user.username}" is restricted to terminal(s) [${user.allowed_terminals}]. This machine is configured as "${terminalConfig.current_terminal_name || terminalConfig.current_terminal_id}".`);
            setIsLoading(false);
            return;
          }
        }

        // Log cashier login to remote activity table
        try {
          // @ts-ignore
          if (window.db?.logTerminalActivity) {
            // @ts-ignore
            window.db.logTerminalActivity({
              action_type: 'LOGIN',
              username: user.username,
              details: `Cashier signed into ${terminalConfig.current_terminal_name || 'Terminal'} (${terminalConfig.current_terminal_id})`
            });
          }
        } catch(e) {}

        setTimeout(() => onLoginSuccess({ ...user, terminalConfig }), 300);
      } else {
        setError('Invalid username or password');
        setIsLoading(false);
      }
    } catch (err) {
      console.error("Login failed:", err);
      setError('An error occurred during login');
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#F4F8F5] flex items-center justify-center z-50 overflow-hidden">
      {/* Background Glows: Stage 1 LunaPOS Coral/Cyan glow vs Stage 2+ Supermarket Green glow */}
      <div 
        className={`absolute inset-0 pointer-events-none transition-opacity duration-1000 ${splashStage === 'luna' ? 'opacity-35' : 'opacity-0'}`} 
        style={{ background: 'radial-gradient(circle at top right, rgba(237,76,123,0.45), transparent 45%), radial-gradient(circle at bottom left, rgba(60,188,207,0.45), transparent 45%), radial-gradient(circle at center, rgba(39,52,106,0.10), transparent 50%)' }}
      />
      <div 
        className={`absolute inset-0 pointer-events-none transition-opacity duration-1000 ${splashStage !== 'luna' ? 'opacity-30' : 'opacity-0'}`} 
        style={{ background: 'radial-gradient(circle at top right, rgba(0,139,68,0.25), transparent 45%), radial-gradient(circle at bottom left, rgba(16,185,129,0.22), transparent 45%), radial-gradient(circle at center, rgba(249,115,22,0.10), transparent 50%)' }}
      />
      <div className="absolute inset-0 pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-[0.03]"></div>

      {/* ── STAGE 1: LunaPOS Brand Presentation (By Lunatech Creations) ── */}
      <div 
        className={`absolute inset-0 flex flex-col items-center justify-center transition-all duration-700 ease-in-out z-20 ${
          splashStage === 'luna' 
            ? 'opacity-100 scale-100 pointer-events-auto' 
            : 'opacity-0 scale-110 pointer-events-none'
        }`}
      >
        <div className="w-32 h-32 rounded-3xl bg-white/95 shadow-2xl shadow-[#27346A]/20 flex items-center justify-center mb-5 p-3.5 border border-slate-100 backdrop-blur-md">
          <img src={lunaLogo} alt="LunaPOS" className="w-full h-full object-contain drop-shadow-md animate-bounce-subtle" />
        </div>
        <h1 className="text-5xl font-black text-[#27346A] tracking-tighter mb-2">
          Luna<span className="text-[#ED4C7B]">POS</span>
        </h1>
        <p className="text-xs font-black text-slate-500 tracking-[0.25em] uppercase">
          By Lunatech Creations Pvt Ltd
        </p>
        <div className="mt-4 flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#27346A]/5 border border-[#27346A]/10 text-[10px] font-black text-[#27346A]/80 uppercase tracking-widest">
          <span className="w-2 h-2 rounded-full bg-[#ED4C7B] animate-pulse"></span>
          <span>Enterprise Retail Platform</span>
        </div>
      </div>

      {/* ── STAGE 2 & 3: Nova FreshMart Store Identity & Login Screen ── */}
      <div 
        className={`relative z-10 w-full max-w-md transition-all duration-1000 ease-out ${
          splashStage === 'luna' 
            ? 'opacity-0 translate-y-10 pointer-events-none' 
            : 'opacity-100 translate-y-0 pointer-events-auto'
        }`}
      >
        {/* Nova FreshMart Brand Logo */}
        <div 
          className={`transition-all duration-1000 ease-out flex flex-col items-center ${
            splashStage === 'login' ? 'translate-y-0 scale-100 mb-6' : 'translate-y-20 scale-125'
          }`}
        >
          <div className="w-24 h-24 rounded-full bg-white shadow-2xl flex items-center justify-center mb-4 relative overflow-hidden border border-emerald-100 p-2">
            <div className="absolute inset-0 bg-gradient-to-tr from-emerald-600/15 to-emerald-400/20"></div>
            <img src={novaLogo} alt="Nova FreshMart Logo" className="w-full h-full object-contain relative z-10" />
          </div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">
            Nova <span className="text-emerald-600">FreshMart</span>
          </h1>
          <p className="text-slate-500 font-bold tracking-widest uppercase text-[11px] mt-1 opacity-90">
            Supermarket Retail Management System
          </p>
        </div>

        {/* Login Form Card */}
        <div 
          className={`transition-all duration-700 ease-out delay-200 ${
            splashStage === 'login' ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-10 pointer-events-none'
          }`}
        >
          <div className="bg-white p-7 rounded-[2rem] shadow-2xl shadow-emerald-700/10 border border-emerald-100 backdrop-blur-sm relative">
            
            {/* Terminal & Branch Identification Banner */}
            <div className="mb-5 p-3 rounded-2xl bg-emerald-50/80 border border-emerald-200/90 flex items-center justify-between shadow-2xs">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="h-8 w-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Laptop size={16} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-black text-slate-900 truncate">
                      {terminalConfig.current_terminal_name || 'Touch Terminal 01'}
                    </span>
                    <span className="text-[9px] bg-emerald-200 text-emerald-900 font-bold px-1.5 py-0.5 rounded">
                      {terminalConfig.current_terminal_id || 'TERM-01'}
                    </span>
                    <span className="text-[9px] bg-slate-200 text-slate-700 font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5" title="Hardware identity locked">
                      <Lock size={9} /> Locked
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 font-semibold truncate flex items-center gap-1 mt-0.5">
                    <Building2 size={10} className="text-emerald-700" />
                    <span>{terminalConfig.current_branch_name || 'Main Branch'}</span>
                    <span>•</span>
                    <span className={isOnline ? 'text-emerald-700 font-bold' : 'text-amber-700 font-bold'}>
                      {isOnline ? '🟢 Cloud Online' : '🟠 Local Offline'}
                    </span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAdminAuthPin('');
                  setAdminAuthError('');
                  setShowAdminAuthModal(true);
                }}
                className="text-[11px] font-bold text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 px-2.5 py-1.5 rounded-xl border border-slate-200 shadow-2xs transition-all shrink-0 ml-2 cursor-pointer flex items-center gap-1"
                title="Change terminal hardware mode (Requires Admin PIN)"
              >
                <Lock size={11} className="text-slate-400" />
                <span>Setup</span>
              </button>
            </div>

            <h2 className="text-xl font-bold text-slate-900 mb-1 text-center">Cashier & Staff Login</h2>
            <p className="text-xs text-slate-500 mb-6 text-center font-medium">Enter your credentials to access the POS & Back Office</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Username</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-600" size={18} />
                  <input 
                    type="text" 
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-11 pr-4 py-3 outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/15 text-slate-900 font-bold text-sm transition-all" 
                    value={username} 
                    onChange={e => setUsername(e.target.value)} 
                    placeholder="e.g. Admin or Cashier"
                    autoFocus
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-600" size={18} />
                  <input 
                    type={showPassword ? "text" : "password"} 
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-11 pr-11 py-3 outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/15 text-slate-900 font-bold text-sm transition-all" 
                    value={password} 
                    onChange={e => setPassword(e.target.value)} 
                    placeholder="Enter password"
                    required
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowPassword(!showPassword)} 
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="bg-rose-50 border border-rose-200 text-rose-600 p-3 rounded-xl text-xs font-bold flex items-center">
                  <AlertCircle size={16} className="mr-2 shrink-0" />
                  {error}
                </div>
              )}

              <button 
                type="submit" 
                disabled={isLoading}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl py-3.5 font-black text-sm flex items-center justify-center transition-all shadow-lg shadow-emerald-600/25 group disabled:opacity-70 mt-2 cursor-pointer active:scale-[0.98]"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                ) : (
                  <>
                    Sign In <ArrowRight size={18} className="ml-2 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>
            
            {/* Tech Support Footer */}
            <div className="mt-6 pt-5 border-t border-slate-100 text-center">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Technical Support</p>
              <div className="flex flex-col items-center space-y-1">
                <div className="flex items-center text-xs font-semibold text-slate-700">
                  <Phone size={12} className="mr-2 text-emerald-600" /> 
                  +94 740 181 200 &nbsp;•&nbsp; 072 019 1200 &nbsp;•&nbsp; 078 800 0828
                </div>
                <div className="flex items-center text-xs font-semibold text-slate-600">
                  <Globe size={12} className="mr-2 text-teal-600" /> 
                  lunapos.site
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* ── MODAL: ADMIN PIN AUTHORIZATION TO UNLOCK TERMINAL SETUP ── */}
      {showAdminAuthModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden border border-emerald-100 animate-in fade-in zoom-in-95">
            <div className="px-6 py-4 bg-slate-900 text-white flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Lock size={18} className="text-emerald-400" />
                <h3 className="font-black text-sm">Admin Security Check</h3>
              </div>
              <button 
                type="button"
                onClick={() => setShowAdminAuthModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleVerifyAdminAuth} className="p-6 space-y-4">
              <div className="text-center">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-2 border border-emerald-100">
                  <Laptop size={24} />
                </div>
                <h4 className="font-black text-slate-800 text-base">Reconfigure Device Identity</h4>
                <p className="text-xs text-slate-500 mt-1">
                  This machine is locked as <strong>{terminalConfig.current_terminal_name || terminalConfig.current_terminal_id}</strong>. Enter Admin PIN to unlock and change device mode.
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider mb-1.5">
                  Admin / Manager PIN
                </label>
                <input
                  type="password"
                  value={adminAuthPin}
                  onChange={e => setAdminAuthPin(e.target.value)}
                  placeholder="Enter Admin PIN"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-center text-lg font-black tracking-widest text-slate-900 outline-none focus:border-emerald-600"
                  autoFocus
                  required
                />
              </div>

              {adminAuthError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold flex items-center gap-2">
                  <AlertCircle size={15} className="shrink-0" />
                  <span>{adminAuthError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAdminAuthModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAdminAuthorizing}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isAdminAuthorizing ? 'Checking...' : 'Authorize & Open Setup'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: TERMINAL & BRANCH CONFIGURATION ── */}
      {showConfigModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-emerald-100 animate-in fade-in zoom-in-95">
            <div className="px-6 py-4 bg-emerald-600 text-white flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Laptop size={20} />
                <h3 className="font-black text-base">Terminal Hardware Identity</h3>
              </div>
              <button 
                onClick={() => setShowConfigModal(false)}
                className="text-emerald-100 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveTerminalSetup} className="p-6 space-y-4">
              <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-200 text-emerald-900 text-xs font-medium">
                🔒 <strong>Device Locking:</strong> Assign this physical machine to its dedicated role. Once saved, this PC is permanently bound to this terminal. Cashiers cannot switch to other terminals.
              </div>

              {/* Branch Selector */}
              <div>
                <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5">
                  Assigned Store Branch
                </label>
                <select
                  value={editBranchId}
                  onChange={e => setEditBranchId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-800 outline-none focus:border-emerald-600"
                >
                  {branches.length === 0 ? (
                    <option value="BR-MAIN">Main FreshMart Branch</option>
                  ) : (
                    branches.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.id})
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Terminal Profile Selector */}
              <div>
                <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                  <span>Terminal / Device Role</span>
                  <span className="text-[10px] text-slate-400 font-normal">
                    {terminals.length} registered terminal(s)
                  </span>
                </label>
                <select
                  value={isCreatingNewTerminal ? '__NEW__' : editTerminalId}
                  onChange={e => {
                    const tid = e.target.value;
                    if (tid === '__NEW__') {
                      setIsCreatingNewTerminal(true);
                      setNewCustomTerminalId(`TERM-0${terminals.length + 1}`);
                      setEditTerminalName('');
                    } else {
                      setIsCreatingNewTerminal(false);
                      setEditTerminalId(tid);
                      const found = terminals.find(t => t.id === tid);
                      if (found) setEditTerminalName(found.name);
                    }
                  }}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-800 outline-none focus:border-emerald-600"
                >
                  {terminals.map(t => (
                    <option key={t?.id || Math.random()} value={t?.id || ''}>
                      {String(t?.id || '').includes('BACKOFFICE') ? '🏢' : '🛒'} {t?.name || t?.id} ({t?.id})
                    </option>
                  ))}
                  <option value="__NEW__">➕ Register / Add New Terminal...</option>
                </select>
              </div>

              {/* If creating new terminal */}
              {isCreatingNewTerminal && (
                <div>
                  <label className="block text-xs font-black text-emerald-800 uppercase tracking-wider mb-1.5">
                    New Terminal ID (Code)
                  </label>
                  <input
                    type="text"
                    value={newCustomTerminalId}
                    onChange={e => setNewCustomTerminalId(e.target.value.toUpperCase())}
                    placeholder="e.g. TERM-04, COUNTER-3, SCALE-1"
                    className="w-full bg-emerald-50/50 border border-emerald-300 rounded-xl px-3 py-2.5 text-xs font-black text-emerald-900 outline-none focus:border-emerald-600"
                    required
                  />
                  <p className="text-[10px] text-slate-400 mt-1">This ID will be registered in the central system and sync across all terminals.</p>
                </div>
              )}

              {/* Terminal Display Name */}
              <div>
                <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5">
                  Terminal Display Name
                </label>
                <input
                  type="text"
                  value={editTerminalName}
                  onChange={e => setEditTerminalName(e.target.value)}
                  placeholder={isCreatingNewTerminal ? "e.g. Counter 04 Touch POS" : "e.g. Counter 01 Touch POS"}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-800 outline-none focus:border-emerald-600"
                  required
                />
              </div>

              {/* Admin Confirmation PIN */}
              <div>
                <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <Lock size={12} className="text-emerald-600" />
                  <span>Admin PIN Confirmation</span>
                </label>
                <input
                  type="password"
                  value={setupPin}
                  onChange={e => setSetupPin(e.target.value)}
                  placeholder="Enter Admin PIN to lock this device"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-800 outline-none focus:border-emerald-600"
                  required
                />
              </div>

              {setupError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold flex items-center gap-1.5">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{setupError}</span>
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowConfigModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-md shadow-emerald-600/30 flex items-center gap-1.5 cursor-pointer"
                >
                  <Check size={16} /> Lock & Assign Device
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
