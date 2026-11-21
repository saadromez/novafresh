import React, { useState, useEffect } from 'react';
import { 
  Building2, Monitor, RefreshCw, Plus, CheckCircle2, AlertCircle, 
  Clock, User, DollarSign, ArrowUpRight, TrendingUp, ShieldCheck, 
  MapPin, Phone, Laptop, Wifi, WifiOff, Activity, Layers, Store, Trash2, Edit3,
  FileText, Search, Eye, X, ShoppingBag, CreditCard, Check, ArrowRight, ArrowLeftRight, LogOut, Calendar, Printer, Coins
} from 'lucide-react';
import { formatSriLankaDateTime } from '../utils/dateUtils';

const parseSqliteUtc = (dStr: any): Date => {
  if (!dStr) return new Date();
  if (dStr instanceof Date) return dStr;
  let s = String(dStr).trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(s) && !s.includes('Z') && !s.includes('+')) {
    s = s.replace(' ', 'T') + 'Z';
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(s)) {
    s = s + 'Z';
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? new Date(dStr) : d;
};

export default function BranchTerminalBackoffice({ currentUser }: any) {
  const [activeTab, setActiveTab] = useState<'terminals' | 'invoices' | 'shifts' | 'branches' | 'logs'>('terminals');
  const [loading, setLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<any>(null);
  const [overview, setOverview] = useState<any>({
    online: true,
    branches: [],
    terminals: [],
    shifts: [],
    todaySales: [],
    recentInvoices: [],
    recentLogs: []
  });

  // Modals for Adding Branch & Terminal
  const [showAddBranch, setShowAddBranch] = useState(false);
  const [newBranch, setNewBranch] = useState({ name: '', code: '', address: '', phone: '' });

  const [showAddTerminal, setShowAddTerminal] = useState(false);
  const [newTerminal, setNewTerminal] = useState({ id: '', branch_id: '', name: '' });
  const [editingTerminal, setEditingTerminal] = useState<any | null>(null);

  const [config, setConfig] = useState<any>({});
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>('ALL');

  // Terminal Inspector Modal State
  const [selectedTerminalForModal, setSelectedTerminalForModal] = useState<any>(null);
  const [terminalDetails, setTerminalDetails] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [modalActiveSubTab, setModalActiveSubTab] = useState<'invoices' | 'session' | 'history'>('invoices');
  const [modalInvoiceSearch, setModalInvoiceSearch] = useState('');
  const [selectedPastShiftForModal, setSelectedPastShiftForModal] = useState<any>(null);
  const [pastShiftDetailsData, setPastShiftDetailsData] = useState<{
    transactions: any[];
    invoices: any[];
    loading: boolean;
  }>({ transactions: [], invoices: [], loading: false });
  const [showAuditInput, setShowAuditInput] = useState(false);
  const [auditCashValue, setAuditCashValue] = useState('');
  const [auditNotesValue, setAuditNotesValue] = useState('');
  const [isAuditing, setIsAuditing] = useState(false);

  const handleOpenPastShiftModal = async (sess: any) => {
    setSelectedPastShiftForModal(sess);
    setShowAuditInput(false);
    setAuditCashValue(Number(sess.actual_cash || sess.closing_cash || 0) > 0 ? String(sess.actual_cash || sess.closing_cash) : '');
    setAuditNotesValue('');
    setPastShiftDetailsData({ transactions: [], invoices: [], loading: true });
    try {
      // @ts-ignore
      const res = await window.db.invoke('get-session-details', sess.id);
      if (res) {
        setPastShiftDetailsData({
          transactions: res.transactions || [],
          invoices: res.invoices || [],
          loading: false
        });
        if (res.session) {
          setSelectedPastShiftForModal((prev: any) => ({
            ...prev,
            ...res.session,
            actual_cash: res.session.actual_cash != null ? Number(res.session.actual_cash) : (res.session.closing_cash != null ? Number(res.session.closing_cash) : prev?.actual_cash)
          }));
        }
      } else {
        setPastShiftDetailsData({ transactions: [], invoices: [], loading: false });
      }
    } catch (err) {
      console.warn('Could not load session details:', err);
      setPastShiftDetailsData({ transactions: [], invoices: [], loading: false });
    }
  };

  const handleSaveAudit = async () => {
    if (!selectedPastShiftForModal) return;
    const num = parseFloat(auditCashValue);
    if (isNaN(num) || num < 0) {
      alert('Please enter a valid actual cash amount (0 or greater).');
      return;
    }
    setIsAuditing(true);
    try {
      // @ts-ignore
      const res = await window.db.invoke('audit-shift-actual-cash', {
        sessionId: selectedPastShiftForModal.id,
        shiftId: selectedPastShiftForModal.id,
        actualCash: num,
        notes: auditNotesValue.trim(),
        auditedBy: currentUser?.username || 'Admin'
      });
      if (res && res.success) {
        setSelectedPastShiftForModal((prev: any) => ({
          ...prev,
          actual_cash: res.actual_cash,
          closing_cash: res.actual_cash,
          expected_cash: res.expected_cash,
          discrepancy: res.discrepancy,
          is_audited: true,
          notes: res.notes
        }));
        if (terminalDetails?.latestSessions) {
          setTerminalDetails((prev: any) => ({
            ...prev,
            latestSessions: (prev.latestSessions || []).map((s: any) => 
              s.id === selectedPastShiftForModal.id 
                ? { ...s, actual_cash: res.actual_cash, closing_cash: res.actual_cash, expected_cash: res.expected_cash, discrepancy: res.discrepancy, is_uncounted: false, is_audited: true } 
                : s
            )
          }));
        }
        setShowAuditInput(false);
        alert('✓ Shift audit saved successfully! Actual count and till discrepancy have been updated.');
      }
    } catch (err: any) {
      alert('Failed to save audit: ' + (err.message || err));
    } finally {
      setIsAuditing(false);
    }
  };

  // Terminal Invoices Tab State
  const [selectedTerminalFilterForInvoices, setSelectedTerminalFilterForInvoices] = useState<string>('ALL');
  const [terminalInvoicesList, setTerminalInvoicesList] = useState<any[]>([]);
  const [invoicesSearchTerm, setInvoicesSearchTerm] = useState('');
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  // Receipt Preview Modal
  const [selectedInvoiceForReceipt, setSelectedInvoiceForReceipt] = useState<any>(null);

  // Cashier Shift Handovers Sub-Tab State
  const [shiftSubTab, setShiftSubTab] = useState<'sessions' | 'handovers'>('sessions');
  const [handoversList, setHandoversList] = useState<any[]>([]);
  const [loadingHandovers, setLoadingHandovers] = useState(false);
  const [selectedHandoverSlip, setSelectedHandoverSlip] = useState<any | null>(null);

  // Shift Details Modal State
  const [selectedShiftForDetails, setSelectedShiftForDetails] = useState<any | null>(null);
  const [shiftDetailData, setShiftDetailData] = useState<any | null>(null);
  const [loadingShiftDetails, setLoadingShiftDetails] = useState(false);
  const [shiftDateFilter, setShiftDateFilter] = useState<'all' | 'today' | 'yesterday' | 'week' | 'month' | 'custom'>('all');
  const [shiftCustomStart, setShiftCustomStart] = useState('');
  const [shiftCustomEnd, setShiftCustomEnd] = useState('');
  const [shiftSearchQuery, setShiftSearchQuery] = useState('');

  const handleOpenShiftDetails = async (s: any) => {
    setSelectedShiftForDetails(s);
    setLoadingShiftDetails(true);
    try {
      // @ts-ignore
      const details = await window.db.invoke('get-session-details', s.id);
      setShiftDetailData(details || { session: s, transactions: [], invoices: [] });
    } catch (e) {
      console.error('Failed to get shift details:', e);
      setShiftDetailData({ session: s, transactions: [], invoices: [] });
    } finally {
      setLoadingShiftDetails(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeTab === 'invoices') {
      loadTerminalInvoices();
    } else if (activeTab === 'shifts' && shiftSubTab === 'handovers') {
      loadHandovers();
    }
  }, [activeTab, shiftSubTab, selectedTerminalFilterForInvoices, selectedBranchFilter]);

  const loadHandovers = async () => {
    setLoadingHandovers(true);
    try {
      // @ts-ignore
      if (window.db?.getShiftHandovers) {
        // @ts-ignore
        const list = await window.db.getShiftHandovers({
          branchId: selectedBranchFilter,
          terminalId: selectedTerminalFilterForInvoices !== 'ALL' ? selectedTerminalFilterForInvoices : undefined,
          limit: 100
        });
        setHandoversList(list || []);
      }
    } catch (err) {
      console.error('Failed to load handovers:', err);
    } finally {
      setLoadingHandovers(false);
    }
  };

  const loadData = async () => {
    // @ts-ignore
    if (!window.db) return;
    try {
      // @ts-ignore
      const st = await window.db.getSyncStatus();
      setSyncStatus(st);
      if (st?.config) {
        setConfig(st.config);
      }

      // @ts-ignore
      const ov = await window.db.getBackofficeOverview();
      if (ov) {
        setOverview(ov);
      }
    } catch (e) {
      console.error('Failed to load backoffice overview:', e);
    }
  };

  const loadTerminalInvoices = async () => {
    setLoadingInvoices(true);
    try {
      // @ts-ignore
      if (window.db?.getTerminalInvoices) {
        // @ts-ignore
        const invs = await window.db.getTerminalInvoices({
          terminalId: selectedTerminalFilterForInvoices,
          branchId: selectedBranchFilter,
          limit: 150
        });
        setTerminalInvoicesList(invs || []);
      }
    } catch (e) {
      console.error('Failed to load terminal invoices:', e);
    } finally {
      setLoadingInvoices(false);
    }
  };

  const handleOpenTerminalDetails = async (term: any) => {
    setSelectedTerminalForModal(term);
    setLoadingDetails(true);
    setModalActiveSubTab('invoices');
    setModalInvoiceSearch('');
    try {
      // @ts-ignore
      if (window.db?.getTerminalDetails) {
        // @ts-ignore
        const data = await window.db.getTerminalDetails(term.id);
        setTerminalDetails(data);
      }
    } catch (e) {
      console.error('Failed to get terminal details:', e);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleManualSync = async () => {
    setLoading(true);
    // @ts-ignore
    if (window.db?.triggerSync) {
      try {
        // @ts-ignore
        const res = await window.db.triggerSync();
        alert(res?.message || 'Sync completed!');
        await loadData();
      } catch (err: any) {
        alert('Sync error: ' + err.message);
      }
    }
    setLoading(false);
  };

  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBranch.name.trim()) return alert('Branch name is required');
    // @ts-ignore
    if (window.db?.createBranch) {
      // @ts-ignore
      await window.db.createBranch(newBranch);
      setShowAddBranch(false);
      setNewBranch({ name: '', code: '', address: '', phone: '' });
      await loadData();
    }
  };

  const handleCreateTerminal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTerminal.name.trim()) return alert('Terminal name is required');
    if (!newTerminal.branch_id) return alert('Please select a branch');
    // @ts-ignore
    if (window.db?.createTerminal) {
      // @ts-ignore
      await window.db.createTerminal(newTerminal);
      setShowAddTerminal(false);
      setNewTerminal({ id: '', branch_id: '', name: '' });
      await loadData();
    }
  };

  const handleUpdateTerminal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTerminal?.name?.trim()) return alert('Terminal name is required.');
    try {
      // @ts-ignore
      if (window.db?.updateTerminal) {
        // @ts-ignore
        await window.db.updateTerminal({
          id: editingTerminal.id,
          name: editingTerminal.name,
          branch_id: editingTerminal.branch_id || config.current_branch_id || 'BR-MAIN'
        });
      }
      setEditingTerminal(null);
      await loadData();
    } catch (err: any) {
      alert('Failed to update terminal: ' + (err.message || err));
    }
  };

  const isAdmin = currentUser?.role?.toLowerCase() === 'admin';

  const handleDeleteTerminal = async (term: any) => {
    if (!isAdmin) {
      alert('Security Restriction: Only System Administrators can delete records. Managers and other users are not authorized.');
      return;
    }
    if (config.current_terminal_id === term.id) {
      alert(`Cannot delete terminal "${term.name}" (${term.id}) while it is actively assigned to THIS PC. Please switch this PC to another terminal first.`);
      return;
    }
    if (!confirm(`Are you sure you want to permanently delete terminal "${term.name}" (${term.id})?`)) return;

    try {
      // @ts-ignore
      if (window.db?.deleteTerminal) {
        // @ts-ignore
        await window.db.deleteTerminal(term.id);
        await loadData();
      }
    } catch (e: any) {
      alert('Failed to delete terminal: ' + e.message);
    }
  };

  const handleSetCurrentTerminal = async (term: any) => {
    if (!confirm(`Switch this computer to use Terminal: ${term.name} (${term.id})?`)) return;
    // @ts-ignore
    if (window.db?.setTerminalConfig) {
      // @ts-ignore
      await window.db.setTerminalConfig({ key: 'current_terminal_id', value: term.id });
      // @ts-ignore
      await window.db.setTerminalConfig({ key: 'current_terminal_name', value: term.name });
      // @ts-ignore
      await window.db.setTerminalConfig({ key: 'current_branch_id', value: term.branch_id });
      const br = overview.branches?.find((b: any) => b.id === term.branch_id);
      if (br) {
        // @ts-ignore
        await window.db.setTerminalConfig({ key: 'current_branch_name', value: br.name });
      }
      alert(`This computer is now configured as: ${term.name} at ${br?.name || term.branch_id}`);
      await loadData();
    }
  };

  const filteredTerminals = overview.terminals?.filter((t: any) => 
    selectedBranchFilter === 'ALL' || t.branch_id === selectedBranchFilter
  ) || [];

  const filteredShifts = overview.shifts?.filter((s: any) => {
    if (selectedBranchFilter !== 'ALL' && s.branch_id !== selectedBranchFilter) return false;
    if (shiftDateFilter !== 'all') {
      const openedDate = parseSqliteUtc(s.opened_at);
      const openedDateStr = openedDate.toISOString().split('T')[0];
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      if (shiftDateFilter === 'today') {
        if (openedDateStr !== todayStr) return false;
      } else if (shiftDateFilter === 'yesterday') {
        const y = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        if (openedDateStr !== y) return false;
      } else if (shiftDateFilter === 'week') {
        const w = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        if (openedDateStr < w || openedDateStr > todayStr) return false;
      } else if (shiftDateFilter === 'month') {
        const m = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        if (openedDateStr < m || openedDateStr > todayStr) return false;
      } else if (shiftDateFilter === 'custom') {
        if (shiftCustomStart && openedDateStr < shiftCustomStart) return false;
        if (shiftCustomEnd && openedDateStr > shiftCustomEnd) return false;
      }
    }
    if (shiftSearchQuery.trim()) {
      const q = shiftSearchQuery.toLowerCase();
      return (
        String(s.id).includes(q) ||
        String(s.username || '').toLowerCase().includes(q) ||
        String(s.terminal_name || s.terminal_id || '').toLowerCase().includes(q) ||
        String(s.branch_name || s.branch_id || '').toLowerCase().includes(q)
      );
    }
    return true;
  }) || [];

  const totalTodayRevenue = overview.todaySales?.reduce((acc: number, s: any) => acc + Number(s.gross_revenue || 0), 0) || 0;
  const totalTodayOrders = overview.todaySales?.reduce((acc: number, s: any) => acc + Number(s.total_orders || 0), 0) || 0;

  // Filter terminal invoices in the Invoices tab
  const filteredInvoicesList = terminalInvoicesList.filter((inv: any) => {
    const s = invoicesSearchTerm.toLowerCase();
    if (!s) return true;
    return (
      String(inv.id).includes(s) ||
      (inv.cashier || '').toLowerCase().includes(s) ||
      (inv.payment_method || '').toLowerCase().includes(s) ||
      (inv.terminal_name || '').toLowerCase().includes(s) ||
      (inv.terminal_id || '').toLowerCase().includes(s)
    );
  });

  return (
    <div className="flex-1 flex flex-col h-full bg-[#FAFAFA] text-slate-800 overflow-hidden font-sans select-none">
      
      {/* ── TOP HEADER ── */}
      <div className="min-h-16 bg-white border-b border-gray-200/90 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white font-black shadow-md shadow-emerald-500/20">
            <Building2 size={22} />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-black tracking-tight text-slate-900 flex items-center gap-2">
              Nova FreshMart Backoffice
              <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                Multi-Branch &amp; Terminals
              </span>
            </h1>
            <p className="text-[11px] sm:text-xs text-gray-500 font-medium">
              Current Terminal: <span className="text-emerald-700 font-bold">{config.current_terminal_name || 'TERM-01'}</span> • Branch: <span className="text-blue-600 font-bold">{config.current_branch_name || 'Main Branch'}</span>
            </p>
          </div>
        </div>

        {/* Sync Status & Action */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gray-50 border border-gray-200 shadow-xs">
            {overview.online ? (
              <Wifi size={16} className="text-emerald-600 animate-pulse" />
            ) : (
              <WifiOff size={16} className="text-amber-500" />
            )}
            <div className="text-left">
              <p className="text-[10px] font-bold text-slate-800 flex items-center gap-1">
                {overview.online ? 'Online Cloud DB' : 'Offline (Local Sync Cache)'}
              </p>
              <p className="text-[9px] text-gray-500">
                {syncStatus?.pendingCount ? `${syncStatus.pendingCount} pending upload` : 'Fully Synchronized'}
              </p>
            </div>
          </div>

          <button
            onClick={handleManualSync}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs rounded-xl shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Sync Now</span>
          </button>
        </div>
      </div>

      {/* ── KPI METRICS STRIP ── */}
      <div className="p-5 sm:p-7 pb-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 shrink-0">
        <div className="bg-white border border-gray-200/90 rounded-2xl p-5 flex items-center gap-5 shadow-sm hover:border-gray-300 transition-all">
          <div className="h-14 w-14 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <DollarSign size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Today's Total Sales</p>
            <p className="text-3xl font-black text-slate-900">Rs. {totalTodayRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
            <p className="text-[10px] text-emerald-600 font-semibold">{totalTodayOrders} orders processed</p>
          </div>
        </div>

        <div className="bg-white border border-gray-200/90 rounded-2xl p-5 flex items-center gap-5 shadow-sm hover:border-gray-300 transition-all">
          <div className="h-14 w-14 rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center font-bold">
            <Building2 size={24} />
          </div>
          <div>
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Active Branches</p>
            <p className="text-3xl font-black text-slate-900">{overview.branches?.length || 0}</p>
            <p className="text-[10px] text-cyan-600 font-semibold">Stores connected</p>
          </div>
        </div>

        <div className="bg-white border border-gray-200/90 rounded-2xl p-5 flex items-center gap-5 shadow-sm hover:border-gray-300 transition-all">
          <div className="h-14 w-14 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
            <Laptop size={24} />
          </div>
          <div>
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Touch Terminals</p>
            <p className="text-3xl font-black text-slate-900">{overview.terminals?.length || 0}</p>
            <p className="text-[10px] text-purple-600 font-semibold">Touchscreen POS stations</p>
          </div>
        </div>

        <div className="bg-white border border-gray-200/90 rounded-2xl p-5 flex items-center gap-5 shadow-sm hover:border-gray-300 transition-all">
          <div className="h-14 w-14 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <Clock size={24} />
          </div>
          <div>
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Active Cashier Shifts</p>
            <p className="text-3xl font-black text-slate-900">
              {overview.shifts?.filter((s: any) => s.status === 'open' || s.status === 'OPEN' || !s.closed_at).length || 0}
            </p>
            <p className="text-[10px] text-amber-600 font-semibold">Logged-in cashiers</p>
          </div>
        </div>
      </div>

      {/* ── NAVIGATION TABS & BRANCH FILTER ── */}
      <div className="px-4 sm:px-6 py-2.5 flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-gray-200/80 bg-white shrink-0">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          {[
            { id: 'terminals', label: 'Terminals & Performance', icon: Laptop },
            { id: 'invoices', label: 'Terminal Invoices', icon: FileText },
            { id: 'shifts', label: 'Shift Logs & Cash Control', icon: Clock },
            { id: 'branches', label: 'Branches Setup', icon: Building2 },
            { id: 'logs', label: 'Audit Trail & Logins', icon: Activity },
          ].map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                  active 
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20 font-black' 
                    : 'bg-gray-100 text-gray-600 hover:text-slate-900 hover:bg-gray-200/80 font-bold'
                }`}
              >
                <Icon size={15} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Branch Filter dropdown */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <span className="text-xs font-bold text-gray-600">Filter Branch:</span>
          <select
            value={selectedBranchFilter}
            onChange={e => setSelectedBranchFilter(e.target.value)}
            className="bg-white border border-gray-200 text-slate-800 text-xs font-bold rounded-xl px-3 py-1.5 outline-none focus:border-emerald-500 shadow-xs cursor-pointer"
          >
            <option value="ALL">All Branches</option>
            {overview.branches?.map((b: any) => (
              <option key={b.id} value={b.id}>{b.name} ({b.code || b.id})</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── MAIN WORKSPACE ── */}
      <div className="flex-1 overflow-y-auto p-5 sm:p-7">
        
        {/* ════════ TAB 1: TERMINALS & LIVE MONITORING ════════ */}
        {activeTab === 'terminals' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
              <div>
                <h2 className="text-lg font-black text-slate-900">Branch Terminals</h2>
                <p className="text-xs text-gray-500 font-medium">Live monitoring of touchscreen POS stations, logged-in cashiers, and sessions</p>
              </div>
              <button
                onClick={() => {
                  setNewTerminal({ id: `TERM-${Date.now().toString(36).slice(-4).toUpperCase()}`, branch_id: overview.branches?.[0]?.id || 'BR-MAIN', name: '' });
                  setShowAddTerminal(true);
                }}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-md shadow-emerald-600/20 transition-all cursor-pointer shrink-0"
              >
                <Plus size={15} />
                <span>Add Terminal</span>
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
              {filteredTerminals.map((term: any) => {
                const isCurrent = config.current_terminal_id === term.id;
                const activeShift = overview.shifts?.find((s: any) => {
                  if (!s) return false;
                  const sTerm = (s.terminal_id || '').toLowerCase();
                  const tId = (term.id || '').toLowerCase();
                  const matchId = sTerm === tId || (sTerm.replace(/\D/g, '') && sTerm.replace(/\D/g, '') === tId.replace(/\D/g, ''));
                  const isOpen = (s.status || '').toLowerCase() === 'open' && !s.closed_at;
                  return matchId && isOpen;
                });
                const lastShift = overview.shifts?.find((s: any) => {
                  if (!s) return false;
                  const sTerm = (s.terminal_id || '').toLowerCase();
                  const tId = (term.id || '').toLowerCase();
                  const matchId = sTerm === tId || (sTerm.replace(/\D/g, '') && sTerm.replace(/\D/g, '') === tId.replace(/\D/g, ''));
                  const isClosed = (s.status || '').toLowerCase() === 'closed' || s.closed_at;
                  return matchId && isClosed;
                });
                
                return (
                  <div 
                    key={term.id}
                    className={`bg-white rounded-2xl p-6 border transition-all flex flex-col justify-between shadow-sm hover:shadow-md ${
                      isCurrent ? 'border-amber-400 ring-2 ring-amber-400/20 bg-amber-50/10' : 'border-gray-200/90 hover:border-gray-300'
                    }`}
                  >
                    <div>
                      {/* Top Header of Card */}
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-3">
                          <div className={`h-13 w-13 rounded-xl flex items-center justify-center font-bold ${
                            term.status === 'online' ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-400'
                          }`}>
                            <Laptop size={22} />
                          </div>
                          <div>
                            <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
                              {term.name}
                              {isCurrent && (
                                <span className="text-[9px] bg-amber-100 text-amber-800 font-black px-1.5 py-0.5 rounded border border-amber-300">
                                  THIS PC
                                </span>
                              )}
                            </h3>
                            <p className="text-[11px] text-cyan-700 font-semibold">{term.branch_name || term.branch_id}</p>
                          </div>
                        </div>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                          term.status === 'online' 
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                            : 'bg-gray-100 text-gray-500 border-gray-200'
                        }`}>
                          {term.status === 'online' ? 'ONLINE' : 'OFFLINE'}
                        </span>
                      </div>

                      {/* Cashier & Shift Telemetry Box */}
                      <div className="bg-gray-50/90 rounded-xl p-4 border border-gray-200/70 space-y-2.5 mb-4 text-sm">
                        <div className="flex justify-between text-gray-500 font-medium">
                          <span>Terminal ID:</span>
                          <span className="font-mono text-slate-800 font-bold">{term.id}</span>
                        </div>
                        
                        {/* WHO IS LOGGED IN RIGHT NOW */}
                        <div className="flex justify-between items-center text-gray-500 font-medium border-t border-gray-200/80 pt-2">
                          <span>Logged-in Cashier:</span>
                          {activeShift?.username ? (
                            <span className="font-black text-emerald-800 flex items-center gap-1.5 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                              <span>{activeShift.username}</span>
                            </span>
                          ) : (
                            <span className="font-semibold text-gray-400">None (Shift Closed)</span>
                          )}
                        </div>

                        {/* DAY SESSION DETAILS */}
                        <div className="flex justify-between items-center text-gray-500 font-medium">
                          <span>Session Status:</span>
                          <span className={`font-black text-[10px] px-2 py-0.5 rounded-md ${
                            activeShift 
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                              : 'bg-gray-200 text-gray-600'
                          }`}>
                            {activeShift ? 'SESSION OPEN' : 'SESSION CLOSED'}
                          </span>
                        </div>

                        {activeShift && (
                          <>
                            <div className="flex justify-between text-gray-500 font-medium">
                              <span>Session Started:</span>
                              <span className="font-semibold text-slate-700">
                                {parseSqliteUtc(activeShift.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <div className="flex justify-between text-gray-500 font-medium">
                              <span>Opening Float:</span>
                              <span className="font-mono font-bold text-slate-700">
                                Rs. {Number(activeShift.opening_cash || 0).toFixed(2)}
                              </span>
                            </div>
                            <div className="flex justify-between text-gray-500 font-medium border-t border-gray-200/80 pt-2">
                              <span className="font-bold text-slate-800">Live Shift Sales:</span>
                              <span className="font-black text-emerald-700 font-mono text-base">
                                Rs. {Number(activeShift.total_sales || 0).toLocaleString()} {activeShift.bill_count != null ? `(${activeShift.bill_count} bill${activeShift.bill_count === 1 ? '' : 's'})` : ''}
                              </span>
                            </div>
                            <div className="flex justify-between text-gray-500 font-medium">
                              <span className="text-gray-500">Expected Drawer:</span>
                              <span className="font-bold text-blue-700 font-mono text-xs">
                                Rs. {(Number(activeShift.opening_cash || 0) + Number(activeShift.total_sales || 0)).toLocaleString()}
                              </span>
                            </div>
                          </>
                        )}

                        {/* FULL DAY OVERALL PERFORMANCE ACROSS ALL SHIFTS */}
                        <div className="flex justify-between items-center text-gray-500 border-t border-gray-200/80 pt-2 text-[11px] font-medium">
                          <span className="text-gray-500">Full Day (All Shifts):</span>
                          <span className="font-bold text-slate-800 font-mono">
                            Rs. {Number(term.today_revenue != null ? term.today_revenue : (activeShift?.total_sales || 0)).toLocaleString()} ({term.today_orders || 0} bills)
                          </span>
                        </div>

                        {!activeShift && lastShift && (
                          <div className="flex justify-between text-gray-500 text-[11px] pt-1 font-medium">
                            <span>Last Cashier:</span>
                            <span className="text-slate-700 font-medium">{lastShift.username}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Card Actions */}
                    <div className="space-y-2 pt-1">
                      {/* PROMINENT BUTTON: VIEW INVOICES & DAY SESSION */}
                      <button
                        onClick={() => handleOpenTerminalDetails(term)}
                        className="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs rounded-xl shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <FileText size={15} />
                        <span>View Invoices &amp; Day Session</span>
                      </button>

                      <div className="flex items-center gap-2">
                        {!isCurrent ? (
                          <button
                            onClick={() => handleSetCurrentTerminal(term)}
                            className="flex-1 py-1.5 bg-white hover:bg-gray-50 text-gray-700 text-xs font-bold rounded-xl transition-all text-center border border-gray-200 shadow-xs cursor-pointer"
                          >
                            Use on this PC
                          </button>
                        ) : (
                          <div className="flex-1 py-1.5 bg-amber-50 text-amber-800 text-xs font-black rounded-xl text-center border border-amber-200">
                            Active on this PC
                          </div>
                        )}
                        
                        {isAdmin && (
                          <>
                            <button
                              onClick={() => setEditingTerminal({ ...term })}
                              title="Edit Terminal Name & Branch"
                              className="p-1.5 rounded-xl transition-all border cursor-pointer text-cyan-600 hover:text-cyan-700 hover:bg-cyan-50 border-gray-200"
                            >
                              <Edit3 size={15} />
                            </button>
                            <button
                              onClick={() => handleDeleteTerminal(term)}
                              title={isCurrent ? "Cannot delete currently active terminal" : "Delete Terminal (Admin Only)"}
                              disabled={isCurrent}
                              className={`p-1.5 rounded-xl transition-all border cursor-pointer ${
                                isCurrent 
                                  ? 'text-gray-300 border-gray-200 cursor-not-allowed opacity-40' 
                                  : 'text-red-500 hover:text-red-700 hover:bg-red-50 border-gray-200'
                              }`}
                            >
                              <Trash2 size={15} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ════════ TAB 2: TERMINAL INVOICES (LIVE AUDIT) ════════ */}
        {activeTab === 'invoices' && (
          <div className="space-y-4">
            
            {/* Header with Terminal Picker */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-gray-200/80 shadow-xs">
              <div>
                <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <FileText size={18} className="text-emerald-600" />
                  <span>Terminal Sales Invoices</span>
                </h2>
                <p className="text-xs text-gray-500 font-medium">Filter, inspect, and reprint invoices billed on any POS terminal</p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-600">Terminal:</span>
                  <select
                    value={selectedTerminalFilterForInvoices}
                    onChange={e => setSelectedTerminalFilterForInvoices(e.target.value)}
                    className="bg-white border border-gray-200 text-slate-800 text-xs font-bold rounded-xl px-3 py-1.5 outline-none focus:border-emerald-500 shadow-xs cursor-pointer"
                  >
                    <option value="ALL">All Terminals</option>
                    {overview.terminals?.map((t: any) => (
                      <option key={t.id} value={t.id}>{t.name} ({t.id})</option>
                    ))}
                  </select>
                </div>

                {/* Search */}
                <div className="relative w-64">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={invoicesSearchTerm}
                    onChange={e => setInvoicesSearchTerm(e.target.value)}
                    placeholder="Search Inv #, cashier, method..."
                    className="w-full pl-9 pr-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-medium text-slate-800 placeholder-gray-400 outline-none focus:border-emerald-500 shadow-xs"
                  />
                </div>

                <button
                  onClick={loadTerminalInvoices}
                  disabled={loadingInvoices}
                  className="p-2 bg-white hover:bg-gray-50 text-gray-600 rounded-xl border border-gray-200 shadow-xs cursor-pointer"
                  title="Refresh invoices"
                >
                  <RefreshCw size={14} className={loadingInvoices ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>

            {/* Invoices Table */}
            <div className="bg-white rounded-2xl border border-gray-200/80 overflow-hidden shadow-xs">
              <div className="p-3 bg-gray-50/80 border-b border-gray-200 flex items-center justify-between text-xs text-gray-500">
                <span className="font-bold text-slate-700">Showing {filteredInvoicesList.length} Invoices</span>
                <span className="font-mono font-bold text-emerald-700">
                  Total Value: Rs. {filteredInvoicesList.reduce((acc, i) => acc + (Number(i.total) || 0), 0).toLocaleString()}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 text-gray-500 font-bold uppercase tracking-wider border-b border-gray-200 text-xs">
                    <tr>
                      <th className="py-3 px-4">Invoice #</th>
                      <th className="py-3 px-4">Date &amp; Time</th>
                      <th className="py-3 px-4">Terminal</th>
                      <th className="py-3 px-4">Branch</th>
                      <th className="py-3 px-4">Cashier</th>
                      <th className="py-3 px-4">Payment Method</th>
                      <th className="py-3 px-4 text-right">Amount (Rs)</th>
                      <th className="py-3 px-4 text-center">Receipt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-slate-700">
                    {loadingInvoices ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-gray-400 font-bold">
                          <RefreshCw size={20} className="mx-auto mb-2 animate-spin text-emerald-600" />
                          Loading terminal invoices...
                        </td>
                      </tr>
                    ) : filteredInvoicesList.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-gray-400 font-bold">
                          No invoices found for this terminal/branch filter.
                        </td>
                      </tr>
                    ) : (
                      filteredInvoicesList.map((inv: any) => (
                        <tr key={inv.id} className="hover:bg-gray-50/80 transition-colors">
                          <td className="py-3 px-4 font-mono font-black text-emerald-700 whitespace-nowrap">
                            #{inv.id}
                          </td>
                          <td className="py-3 px-4 font-mono text-[11px] text-gray-500 whitespace-nowrap">
                            {formatSriLankaDateTime(inv.created_at)}
                          </td>
                          <td className="py-3 px-4 font-bold text-amber-800 whitespace-nowrap">
                            {inv.terminal_name || inv.terminal_id || 'TERM-01'}
                          </td>
                          <td className="py-3 px-4 text-cyan-700 whitespace-nowrap font-medium">
                            {inv.branch_name || inv.branch_id || 'BR-MAIN'}
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-900 whitespace-nowrap">
                            {inv.cashier || 'Cashier'}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded-md border border-gray-200 text-[10px] font-bold">
                              {inv.payment_method || 'Cash'}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono font-black text-right text-slate-900 whitespace-nowrap">
                            Rs. {Number(inv.total || 0).toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            <button
                              onClick={() => setSelectedInvoiceForReceipt(inv)}
                              className="px-2.5 py-1 bg-white hover:bg-emerald-50 text-emerald-700 rounded-lg text-[10px] font-bold border border-emerald-200 transition-colors cursor-pointer shadow-xs"
                            >
                              View Receipt
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* ════════ TAB 3: SHIFTS & CASH CONTROL ════════ */}
        {activeTab === 'shifts' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <h2 className="text-lg font-black text-slate-900">Terminal Shifts &amp; Cash Control</h2>
                <p className="text-xs text-gray-500">Review continuous day sessions, cashier handovers, drawer variance, and accountability</p>
              </div>

              {/* Sub-tab toggle */}
              <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl border border-gray-200/90 shadow-xs">
                <button
                  onClick={() => setShiftSubTab('sessions')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    shiftSubTab === 'sessions'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-gray-600 hover:text-slate-900'
                  }`}
                >
                  Terminal Day Sessions
                </button>
                <button
                  onClick={() => setShiftSubTab('handovers')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    shiftSubTab === 'handovers'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-gray-600 hover:text-slate-900'
                  }`}
                >
                  <ArrowLeftRight size={13} />
                  <span>Cashier Shift Handovers</span>
                  {handoversList.length > 0 && (
                    <span className="bg-emerald-100 text-emerald-800 text-[10px] px-1.5 py-0.2 rounded-full font-black">
                      {handoversList.length}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Sub-Tab 1: Terminal Day Sessions */}
            {shiftSubTab === 'sessions' ? (
              <div className="bg-white rounded-2xl border border-gray-200/90 overflow-hidden shadow-xs flex flex-col">
                {/* Filter and Search Bar for Shifts */}
                <div className="p-3.5 bg-gray-50/80 border-b border-gray-200/80 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[
                      { id: 'all', label: 'All History' },
                      { id: 'today', label: 'Today' },
                      { id: 'yesterday', label: 'Yesterday' },
                      { id: 'week', label: 'Last 7 Days' },
                      { id: 'month', label: 'This Month' },
                      { id: 'custom', label: 'Custom' },
                    ].map(p => (
                      <button
                        key={p.id}
                        onClick={() => setShiftDateFilter(p.id as any)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          shiftDateFilter === p.id 
                            ? 'bg-emerald-600 text-white shadow-xs' 
                            : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200 shadow-2xs'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}

                    {shiftDateFilter === 'custom' && (
                      <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-2 py-0.5 text-xs shadow-2xs">
                        <Calendar size={12} className="text-gray-400" />
                        <input
                          type="date"
                          value={shiftCustomStart}
                          onChange={e => setShiftCustomStart(e.target.value)}
                          className="bg-transparent text-slate-800 font-semibold outline-none text-[11px]"
                        />
                        <span className="text-gray-400 text-[10px]">to</span>
                        <input
                          type="date"
                          value={shiftCustomEnd}
                          onChange={e => setShiftCustomEnd(e.target.value)}
                          className="bg-transparent text-slate-800 font-semibold outline-none text-[11px]"
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search size={13} className="absolute left-2.5 top-2.5 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search shift, terminal, cashier..."
                        value={shiftSearchQuery}
                        onChange={e => setShiftSearchQuery(e.target.value)}
                        className="pl-7 pr-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-medium text-slate-800 placeholder-gray-400 outline-none w-48 focus:border-emerald-500 shadow-2xs"
                      />
                    </div>
                    <span className="text-xs font-bold bg-white border border-gray-200 px-2.5 py-1 rounded-full text-gray-600 shadow-2xs">
                      {filteredShifts.length} Records
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs whitespace-nowrap">
                    <thead className="bg-gray-50 text-gray-500 font-bold uppercase tracking-wider border-b border-gray-200 text-xs">
                      <tr>
                        <th className="p-4 pl-5 text-xs">Session ID / Date</th>
                        <th className="p-4">Branch</th>
                        <th className="p-4">Terminal</th>
                        <th className="p-4">Opening User</th>
                        <th className="p-4 text-right">Opening Cash</th>
                        <th className="p-4 text-right">Gross Sales</th>
                        <th className="p-4 text-right">Expected Cash</th>
                        <th className="p-4 text-right">Closing Cash</th>
                        <th className="p-4 text-right">Discrepancy</th>
                        <th className="p-4 text-center">Status</th>
                        <th className="p-4 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-slate-700 font-medium">
                      {filteredShifts.length === 0 ? (
                        <tr>
                          <td colSpan={11} className="p-8 text-center text-gray-400 font-medium">
                            No session records found matching filter criteria.
                          </td>
                        </tr>
                      ) : (
                        filteredShifts.map((s: any) => {
                          const isClosed = s.status === 'closed' || s.status === 'CLOSED' || s.closed_at;
                          const openCash = Number(s.opening_cash || 0);
                          const cashSales = Number(s.cash_sales != null ? s.cash_sales : (s.total_sales || 0));
                          const cashIn = Number(s.cash_in || 0);
                          const cashOut = Number(s.cash_out || 0);
                          const expectedCash = Number(s.expected_cash || 0) > 0 
                            ? Number(s.expected_cash) 
                            : Math.max(0, openCash + cashSales + cashIn - cashOut);
                          const actualCash = Number(s.actual_cash != null ? s.actual_cash : (s.closing_cash || 0));
                          const disc = isClosed ? (actualCash - expectedCash) : 0;
                          return (
                            <tr key={s.id} className="hover:bg-gray-50/80 transition-colors">
                              <td className="p-4 pl-5">
                                <p className="font-mono font-black text-slate-900 text-sm">#{s.id}</p>
                                <p className="text-[10px] text-gray-500">{parseSqliteUtc(s.opened_at).toLocaleString()}</p>
                              </td>
                              <td className="p-3.5 font-bold text-emerald-800">{s.branch_name || s.branch_id}</td>
                              <td className="p-3.5 font-bold text-slate-700">{s.terminal_name || s.terminal_id}</td>
                              <td className="p-4">
                                <span className="font-bold text-amber-700">{s.username || 'Cashier'}</span>
                              </td>
                              <td className="p-3.5 text-right font-mono font-semibold text-slate-800">
                                <div>Rs. {openCash.toFixed(2)}</div>
                                {(cashIn > 0 || cashOut > 0) && (
                                  <div className="text-[9px] text-gray-500">
                                    {cashIn > 0 && <span className="text-emerald-600 font-bold">+{cashIn} </span>}
                                    {cashOut > 0 && <span className="text-rose-600 font-bold">-{cashOut}</span>}
                                  </div>
                                )}
                              </td>
                              <td className="p-3.5 text-right font-mono font-black text-slate-900">
                                Rs. {Number(s.total_sales || 0).toFixed(2)}
                              </td>
                              <td className="p-3.5 text-right font-mono font-bold text-emerald-700">
                                Rs. {expectedCash.toFixed(2)}
                              </td>
                              <td className="p-3.5 text-right font-mono font-semibold text-slate-800">
                                {isClosed ? `Rs. ${actualCash.toFixed(2)}` : <span className="text-amber-600 font-bold text-[11px]">In Progress</span>}
                              </td>
                              <td className={`p-3.5 text-right font-mono font-black ${
                                !isClosed ? 'text-gray-400' : disc === 0 ? 'text-gray-400' : disc > 0 ? 'text-emerald-700' : 'text-rose-600'
                              }`}>
                                {!isClosed ? '—' : disc > 0 ? `+Rs. ${disc.toFixed(2)}` : disc < 0 ? `-Rs. ${Math.abs(disc).toFixed(2)}` : 'Rs. 0.00'}
                              </td>
                              <td className="p-4 text-center">
                                <span className={`text-[10px] font-black px-2.5 py-1 rounded-full border ${
                                  isClosed
                                    ? 'bg-gray-100 text-gray-600 border-gray-200'
                                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                }`}>
                                  {isClosed ? 'CLOSED' : 'OPEN'}
                                </span>
                              </td>
                              <td className="p-4 text-center">
                                <button
                                  onClick={() => handleOpenShiftDetails(s)}
                                  className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-200 rounded-lg text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1 shadow-2xs"
                                >
                                  <Eye size={12} /> View Details
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              /* Sub-Tab 2: Cashier Shift Handovers */
              <div className="bg-white rounded-2xl border border-gray-200/90 overflow-hidden shadow-xs">
                <div className="p-3 bg-gray-50/80 border-b border-gray-200 text-xs text-gray-600 flex items-center justify-between">
                  <span className="font-bold">Showing {handoversList.length} Cashier Shift Handovers</span>
                  <button
                    onClick={loadHandovers}
                    className="flex items-center gap-1 text-emerald-700 hover:text-emerald-800 font-bold cursor-pointer"
                  >
                    <RefreshCw size={12} className={loadingHandovers ? 'animate-spin' : ''} />
                    <span>Refresh</span>
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs whitespace-nowrap">
                    <thead className="bg-gray-50 text-gray-500 font-bold uppercase tracking-wider border-b border-gray-200 text-xs">
                      <tr>
                        <th className="p-4 pl-5">Handover # / Date</th>
                        <th className="p-4">Terminal / Branch</th>
                        <th className="p-4">Shift Cashier Flow</th>
                        <th className="p-4 text-center">Bills</th>
                        <th className="p-4 text-right">Shift Sales</th>
                        <th className="p-4 text-right">Expected Drawer</th>
                        <th className="p-4 text-right">Counted Cash</th>
                        <th className="p-4 text-right">Till Variance</th>
                        <th className="p-4 text-center">Slip</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-slate-700 font-medium">
                      {loadingHandovers ? (
                        <tr>
                          <td colSpan={9} className="p-8 text-center text-gray-400">
                            <RefreshCw size={18} className="animate-spin mx-auto mb-2 text-emerald-600" />
                            Loading shift handovers...
                          </td>
                        </tr>
                      ) : handoversList.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="p-8 text-center text-gray-400 font-medium">
                            No cashier shift handovers recorded yet. Shifts occur seamlessly within terminal day sessions.
                          </td>
                        </tr>
                      ) : (
                        handoversList.map((h: any) => {
                          const v = Number(h.cash_variance || 0);
                          return (
                            <tr key={h.id} className="hover:bg-gray-50/80 transition-colors">
                              <td className="p-4 pl-5">
                                <p className="font-mono font-black text-slate-900 text-sm">Handover #{h.id}</p>
                                <p className="text-[10px] text-gray-500">{parseSqliteUtc(h.handover_time).toLocaleString()}</p>
                              </td>
                              <td className="p-4">
                                <span className="font-bold text-amber-800 block">{h.terminal_name || h.terminal_id}</span>
                                <span className="text-[10px] text-emerald-700">{h.branch_name || h.branch_id}</span>
                              </td>
                              <td className="p-4">
                                <div className="flex items-center gap-1.5 font-bold">
                                  <span className="text-slate-700">{h.outgoing_cashier}</span>
                                  <ArrowRight size={12} className="text-emerald-600" />
                                  <span className="text-emerald-700">{h.incoming_cashier}</span>
                                </div>
                                {h.handover_notes && (
                                  <p className="text-[10px] text-gray-500 italic truncate max-w-xs mt-0.5">
                                    "{h.handover_notes}"
                                  </p>
                                )}
                              </td>
                              <td className="p-3.5 text-center font-mono font-bold text-slate-800">
                                {h.bills_count || 0}
                              </td>
                              <td className="p-3.5 text-right font-mono font-black text-slate-900">
                                Rs. {Number(h.total_sales || 0).toFixed(2)}
                              </td>
                              <td className="p-3.5 text-right font-mono font-semibold text-slate-700">
                                Rs. {Number(h.expected_drawer_cash || 0).toFixed(2)}
                              </td>
                              <td className="p-3.5 text-right font-mono font-black text-slate-900">
                                Rs. {Number(h.counted_cash || 0).toFixed(2)}
                              </td>
                              <td className={`p-3.5 text-right font-mono font-black ${
                                v === 0 ? 'text-gray-400' : v > 0 ? 'text-emerald-700' : 'text-rose-600'
                              }`}>
                                {v > 0 ? `+Rs. ${v.toFixed(2)}` : v < 0 ? `-Rs. ${Math.abs(v).toFixed(2)}` : 'Rs. 0.00'}
                              </td>
                              <td className="p-4 text-center">
                                <button
                                  onClick={() => setSelectedHandoverSlip(h)}
                                  className="px-2.5 py-1 bg-gray-100 hover:bg-emerald-600 hover:text-white text-gray-700 rounded-lg text-[10px] font-bold border border-gray-200 transition-colors cursor-pointer shadow-2xs"
                                >
                                  View Slip
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>
        )}

        {/* ════════ TAB 4: BRANCHES SETUP ════════ */}
        {activeTab === 'branches' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <h2 className="text-lg font-black text-slate-900">Store Branches</h2>
                <p className="text-xs text-gray-500">Create and manage your retail stores &amp; distribution locations</p>
              </div>
              <button
                onClick={() => {
                  setNewBranch({ name: '', code: `BR${(overview.branches?.length || 0) + 1}`, address: '', phone: '' });
                  setShowAddBranch(true);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
              >
                <Plus size={15} />
                <span>Create New Branch</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {overview.branches?.map((branch: any) => {
                const termCount = overview.terminals?.filter((t: any) => t.branch_id === branch.id).length || 0;
                return (
                  <div key={branch.id} className="bg-white rounded-2xl p-5 border border-gray-200/90 shadow-xs hover:border-emerald-300 transition-all">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold border border-emerald-100 shadow-2xs">
                          <Store size={24} />
                        </div>
                        <div>
                          <h3 className="font-black text-base text-slate-900">{branch.name}</h3>
                          <p className="text-xs text-gray-500 font-mono">Code: {branch.code || branch.id}</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                        ACTIVE
                      </span>
                    </div>

                    <div className="space-y-1.5 text-xs text-slate-600 mb-4 bg-gray-50 p-3 rounded-xl border border-gray-200/70">
                      <p className="flex items-center gap-2 text-slate-600">
                        <MapPin size={13} className="text-gray-400 shrink-0" />
                        <span className="truncate">{branch.address || 'No address provided'}</span>
                      </p>
                      <p className="flex items-center gap-2 text-slate-600">
                        <Phone size={13} className="text-gray-400 shrink-0" />
                        <span>{branch.phone || 'No phone provided'}</span>
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-center text-xs">
                      <div className="bg-white p-2.5 rounded-xl border border-gray-200/80 shadow-2xs">
                        <p className="text-[10px] text-gray-400 font-bold uppercase">Terminals</p>
                        <p className="text-base font-black text-slate-900">{termCount}</p>
                      </div>
                      <div className="bg-white p-2.5 rounded-xl border border-gray-200/80 shadow-2xs">
                        <p className="text-[10px] text-gray-400 font-bold uppercase">Branch ID</p>
                        <p className="text-xs font-mono font-bold text-emerald-800 truncate">{branch.id}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ════════ TAB 5: AUDIT TRAIL & LOGINS ════════ */}
        {activeTab === 'logs' && (
          <div className="space-y-4">
            <h2 className="text-lg font-black text-slate-900">Terminal Activity &amp; Audit Trail</h2>
            <div className="bg-white rounded-2xl border border-gray-200/90 p-8 text-center text-slate-600 shadow-xs">
              <Activity size={36} className="mx-auto mb-3 text-emerald-600/70" />
              <p className="font-bold text-slate-800 text-sm">Hardware audit trail is securely recorded locally and pushed to the Master Server Hub.</p>
              <p className="text-xs text-gray-500 mt-1">Review live cashier logins, drawer kicks, shift handovers, and terminal config updates.</p>
            </div>
          </div>
        )}

      </div>

      {/* ── MODAL: TERMINAL LIVE MONITOR & INVOICES INSPECTOR ── */}
      {selectedTerminalForModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[90vh] p-0 shadow-2xl border border-gray-200/90 flex flex-col overflow-hidden text-slate-800">
            
            {/* Modal Header */}
            <div className="flex justify-between items-center px-5 py-4 border-b border-gray-100 shrink-0 bg-gradient-to-r from-emerald-50/60 to-white">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold border border-emerald-200 shadow-sm">
                  <Laptop size={22} />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-xl font-black text-slate-900">{selectedTerminalForModal.name}</h3>
                    <span className="text-xs bg-gray-100 text-slate-700 font-mono font-bold px-2.5 py-1 rounded-lg border border-gray-200">
                      {selectedTerminalForModal.id}
                    </span>
                    <span className={`text-xs font-black px-2.5 py-1 rounded-lg border ${
                      selectedTerminalForModal.status === 'online'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-gray-100 text-gray-500 border-gray-200'
                    }`}>
                      {selectedTerminalForModal.status === 'online' ? '● ONLINE' : '○ OFFLINE'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Branch: <span className="text-emerald-700 font-bold">{selectedTerminalForModal.branch_name || selectedTerminalForModal.branch_id}</span>
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedTerminalForModal(null)}
                className="flex items-center gap-2 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700 font-bold text-sm rounded-xl border border-red-200 transition-all cursor-pointer shadow-sm"
              >
                <X size={18} />
                <span className="hidden sm:inline">Close</span>
              </button>
            </div>

            {/* WHO IS LOGGED IN RIGHT NOW BANNER */}
            <div className="mx-5 mt-4 p-4 rounded-2xl bg-gradient-to-r from-gray-50 via-emerald-50/30 to-gray-50 border border-gray-200 shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-sm ${
                  terminalDetails?.activeSession ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30' : 'bg-gray-200 text-gray-600'
                }`}>
                  {terminalDetails?.activeSession?.username 
                    ? terminalDetails.activeSession.username.charAt(0).toUpperCase() 
                    : (terminalDetails?.latestSessions?.[0]?.username ? terminalDetails.latestSessions[0].username.charAt(0).toUpperCase() : '—')}
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                    {terminalDetails?.activeSession ? 'Active Logged-In Cashier' : 'Recent Terminal Cashier'}
                  </p>
                  <p className="text-base font-black text-slate-900 flex items-center gap-2">
                    {terminalDetails?.activeSession ? (
                      <>
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        <span className="text-emerald-800">{terminalDetails.activeSession.username}</span>
                      </>
                    ) : (
                      <span className="text-slate-700 font-bold">
                        {terminalDetails?.latestSessions?.[0]?.username || 'No cashier logged in'} 
                        <span className="text-gray-400 font-normal text-xs ml-2">(Shift Closed)</span>
                      </span>
                    )}
                  </p>
                  {terminalDetails?.activeSession ? (
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Session started at <span className="font-mono text-slate-800 font-bold">{parseSqliteUtc(terminalDetails.activeSession.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                    </p>
                  ) : terminalDetails?.latestSessions?.[0]?.closed_at && (
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Last shift ended at <span className="font-mono text-slate-800 font-bold">{parseSqliteUtc(terminalDetails.latestSessions[0].closed_at).toLocaleString()}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Live Session Quick Counters */}
              {terminalDetails?.activeSession ? (
                <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
                  <div className="text-right">
                    <p className="text-[10px] text-gray-400 font-sans uppercase">Opening Float</p>
                    <p className="font-bold text-slate-900 text-sm">Rs. {Number(terminalDetails.activeSession.opening_cash || 0).toFixed(2)}</p>
                  </div>
                  <div className="text-right border-l border-gray-200 pl-3">
                    <p className="text-[10px] text-gray-400 font-sans uppercase">Gross Sales</p>
                    <p className="font-black text-slate-900 text-sm">
                      Rs. {Number(terminalDetails.activeSession.live_sales || terminalDetails.activeSession.total_sales || 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right border-l border-gray-200 pl-3">
                    <p className="text-[10px] text-emerald-600 font-sans uppercase">Cash</p>
                    <p className="font-black text-emerald-700 text-sm">Rs. {Number(terminalDetails.activeSession.cash_sales || 0).toLocaleString()}</p>
                  </div>
                  <div className="text-right border-l border-gray-200 pl-3">
                    <p className="text-[10px] text-amber-600 font-sans uppercase">Card</p>
                    <p className="font-black text-amber-700 text-sm">Rs. {Number(terminalDetails.activeSession.card_sales || 0).toLocaleString()}</p>
                  </div>
                  <div className="text-right border-l border-gray-200 pl-3">
                    <p className="text-[10px] text-purple-600 font-sans uppercase">Bank/QR</p>
                    <p className="font-black text-purple-700 text-sm">Rs. {Number(terminalDetails.activeSession.other_sales || 0).toLocaleString()}</p>
                  </div>
                  <div className="text-right border-l border-gray-200 pl-3">
                    <p className="text-[10px] text-gray-400 font-sans uppercase">Expected Till</p>
                    <p className="font-black text-emerald-700 text-sm">
                      Rs. {Number(terminalDetails.activeSession.expected_cash || ((Number(terminalDetails.activeSession.opening_cash || 0) + Number(terminalDetails.activeSession.live_sales || terminalDetails.activeSession.total_sales || 0)))).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right border-l border-gray-200 pl-3">
                    <p className="text-[10px] text-gray-400 font-sans uppercase">Bills</p>
                    <p className="font-bold text-slate-900 text-sm">{terminalDetails.activeSession.live_bills || 0}</p>
                  </div>
                </div>
              ) : (
                <div className="px-3.5 py-1.5 bg-gray-100 border border-gray-200 rounded-xl text-xs font-bold text-gray-600 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                  <span>Register Idle &bull; No Active Shift</span>
                </div>
              )}
            </div>

            {/* Sub-Tabs Selector */}
            <div className="mt-4 mx-5 flex gap-2 border-b border-gray-100 pb-3 shrink-0">
              <button
                onClick={() => setModalActiveSubTab('invoices')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  modalActiveSubTab === 'invoices' ? 'bg-emerald-600 text-white font-black shadow-xs' : 'bg-gray-100 text-gray-600 hover:text-slate-900'
                }`}
              >
                Terminal Invoices ({terminalDetails?.invoices?.length || 0})
              </button>
              <button
                onClick={() => setModalActiveSubTab('session')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  modalActiveSubTab === 'session' ? 'bg-emerald-600 text-white font-black shadow-xs' : 'bg-gray-100 text-gray-600 hover:text-slate-900'
                }`}
              >
                Active Day Session Details
              </button>
              <button
                onClick={() => setModalActiveSubTab('history')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  modalActiveSubTab === 'history' ? 'bg-emerald-600 text-white font-black shadow-xs' : 'bg-gray-100 text-gray-600 hover:text-slate-900'
                }`}
              >
                Past Shift History ({terminalDetails?.latestSessions?.length || 0})
              </button>
            </div>

            {/* Sub-Tab Content */}
            <div className="flex-1 overflow-y-auto mt-4 px-5">
              
              {/* SUBTAB 1: INVOICES BILLED ON THIS TERMINAL */}
              {modalActiveSubTab === 'invoices' && (
                <div className="space-y-3">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search invoices on this terminal..."
                      value={modalInvoiceSearch}
                      onChange={e => setModalInvoiceSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-emerald-500 shadow-2xs"
                    />
                  </div>

                  <div className="bg-white rounded-xl border border-gray-200/90 overflow-hidden shadow-2xs">
                    <table className="w-full text-left text-xs whitespace-nowrap">
                      <thead className="bg-gray-50 text-gray-500 font-bold uppercase tracking-wider text-[10px] border-b border-gray-200">
                        <tr>
                          <th className="py-2.5 px-3">Invoice #</th>
                          <th className="py-2.5 px-3">Date &amp; Time</th>
                          <th className="py-2.5 px-3">Cashier</th>
                          <th className="py-2.5 px-3">Payment</th>
                          <th className="py-2.5 px-3 text-right">Amount (Rs)</th>
                          <th className="py-2.5 px-3 text-center">Receipt</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 text-slate-700 font-medium">
                        {loadingDetails ? (
                          <tr><td colSpan={6} className="py-8 text-center text-gray-400">Loading terminal data...</td></tr>
                        ) : !terminalDetails?.invoices || terminalDetails.invoices.length === 0 ? (
                          <tr><td colSpan={6} className="py-8 text-center text-gray-400">No invoices recorded yet on this terminal.</td></tr>
                        ) : (
                          terminalDetails.invoices
                            .filter((inv: any) => {
                              const s = modalInvoiceSearch.toLowerCase();
                              if (!s) return true;
                              return String(inv.id).includes(s) || (inv.cashier || '').toLowerCase().includes(s) || (inv.payment_method || '').toLowerCase().includes(s);
                            })
                            .map((inv: any) => (
                              <tr key={inv.id} className="hover:bg-gray-50/80 transition-colors">
                                <td className="py-2.5 px-3 font-mono font-bold text-emerald-800">#{inv.id}</td>
                                <td className="py-2.5 px-3 font-mono text-[11px] text-gray-500">{formatSriLankaDateTime(inv.created_at)}</td>
                                <td className="py-2.5 px-3 font-bold text-slate-900">{inv.cashier || 'Cashier'}</td>
                                <td className="py-2.5 px-3">
                                  <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-[10px] font-bold border border-gray-200">
                                    {inv.payment_method}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono font-black text-slate-900">
                                  Rs. {Number(inv.total || 0).toFixed(2)}
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  <button
                                    onClick={() => setSelectedInvoiceForReceipt(inv)}
                                    className="px-2 py-1 bg-gray-100 hover:bg-emerald-600 hover:text-white text-gray-700 rounded text-[10px] font-bold border border-gray-200 transition-colors cursor-pointer shadow-2xs"
                                  >
                                    View
                                  </button>
                                </td>
                              </tr>
                            ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* SUBTAB 2: ACTIVE DAY SESSION BREAKDOWN */}
              {modalActiveSubTab === 'session' && (
                <div className="space-y-4">
                  {terminalDetails?.activeSession ? (
                    <>
                      <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                          <span className="text-xs font-black text-emerald-800">Shift #{terminalDetails.activeSession.id} Currently Active</span>
                          {terminalDetails.is_cloud_live && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                              <Wifi size={10} /> Cloud Live
                            </span>
                          )}
                        </div>
                        {currentUser?.role?.toLowerCase() === 'admin' && (
                          <button
                            onClick={async () => {
                              if (!confirm(`Force close / end shift for terminal "${selectedTerminalForModal?.name || selectedTerminalForModal?.id}"? This will close it across all devices and in the cloud database.`)) return;
                              try {
                                await window.db.invoke('force-reset-terminal-session', selectedTerminalForModal?.id);
                                await handleOpenTerminalDetails(selectedTerminalForModal);
                                alert('Shift successfully closed!');
                              } catch (e: any) {
                                alert('Error: ' + e.message);
                              }
                            }}
                            className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                            title="Force close this terminal shift"
                          >
                            <LogOut size={13} />
                            <span>Force Close / End Shift</span>
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                        <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-200/80 shadow-2xs">
                          <p className="text-[10px] font-bold text-gray-400 uppercase">Session ID</p>
                          <p className="text-base font-black text-slate-900 font-mono mt-0.5">#{terminalDetails.activeSession.id}</p>
                        </div>
                        <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-200/80 shadow-2xs">
                          <p className="text-[10px] font-bold text-gray-400 uppercase">Status</p>
                          <p className="text-sm font-black text-emerald-700 mt-0.5">ACTIVE OPEN</p>
                        </div>
                        <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-200/80 shadow-2xs">
                          <p className="text-[10px] font-bold text-gray-400 uppercase">Logged-in Cashier</p>
                          <p className="text-sm font-black text-amber-700 mt-0.5">{terminalDetails.activeSession.username}</p>
                        </div>
                        <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-200/80 shadow-2xs">
                          <p className="text-[10px] font-bold text-gray-400 uppercase">Drawer Opening Cash</p>
                          <p className="text-sm font-black text-slate-900 font-mono mt-0.5">Rs. {Number(terminalDetails.activeSession.opening_cash || 0).toFixed(2)}</p>
                        </div>
                        <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-200/80 shadow-2xs">
                          <p className="text-[10px] font-bold text-gray-400 uppercase">Current Gross Sales</p>
                          <p className="text-base font-black text-slate-900 font-mono mt-0.5">
                            Rs. {Number(terminalDetails.activeSession.live_sales || terminalDetails.activeSession.total_sales || 0).toLocaleString()}
                          </p>
                        </div>
                        <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-200/80 shadow-2xs">
                          <p className="text-[10px] font-bold text-gray-400 uppercase">Expected Drawer Cash</p>
                          <p className="text-base font-black text-emerald-700 font-mono mt-0.5">
                            Rs. {Number(terminalDetails.activeSession.expected_cash || ((Number(terminalDetails.activeSession.opening_cash || 0) + Number(terminalDetails.activeSession.live_sales || terminalDetails.activeSession.total_sales || 0)))).toLocaleString()}
                          </p>
                        </div>
                        <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-200/80 shadow-2xs">
                          <p className="text-[10px] font-bold text-gray-400 uppercase">Billed Invoices Count</p>
                          <p className="text-base font-black text-slate-900 font-mono mt-0.5">{terminalDetails.activeSession.live_bills || 0} Bills</p>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="p-8 text-center bg-gray-50 rounded-2xl border border-gray-200 text-gray-600">
                      <Clock size={36} className="mx-auto mb-3 text-gray-400" />
                      <p className="font-bold text-base text-slate-800">Register Closed &bull; Shift Ended</p>
                      <p className="text-xs text-gray-500 mt-1">This terminal currently has no open cashier register shift. Cashier can open a fresh session to start billing.</p>
                      {terminalDetails?.latestSessions?.[0] && (
                        <p className="text-xs text-slate-700 mt-3 pt-3 border-t border-gray-200">
                          Previous Shift by <strong className="text-emerald-700">{terminalDetails.latestSessions[0].username}</strong> closed at <span className="font-mono text-gray-500">{parseSqliteUtc(terminalDetails.latestSessions[0].closed_at || terminalDetails.latestSessions[0].opened_at).toLocaleString()}</span>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* SUBTAB 3: PAST SESSIONS HISTORY */}
              {modalActiveSubTab === 'history' && (
                <div className="bg-white rounded-xl border border-gray-200/90 overflow-hidden shadow-2xs overflow-x-auto">
                  <table className="w-full text-left text-xs" style={{minWidth:'800px'}}>
                    <thead className="bg-gray-50 text-gray-500 font-bold uppercase tracking-wider text-[10px] border-b border-gray-200">
                      <tr>
                        <th className="py-2.5 px-3">Session</th>
                        <th className="py-2.5 px-3">Opened At</th>
                        <th className="py-2.5 px-3">Cashier</th>
                        <th className="py-2.5 px-3 text-right">Opening Cash</th>
                        <th className="py-2.5 px-3 text-right">Gross Sales</th>
                        <th className="py-2.5 px-3 text-right">Expected Cash</th>
                        <th className="py-2.5 px-3 text-right">Closing Cash</th>
                        <th className="py-2.5 px-3 text-right">Discrepancy</th>
                        <th className="py-2.5 px-3 text-center">Status</th>
                        <th className="py-2.5 px-3 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-slate-700 font-medium">
                      {!terminalDetails?.latestSessions || terminalDetails.latestSessions.length === 0 ? (
                        <tr><td colSpan={10} className="py-8 text-center text-gray-400">No session history on this terminal.</td></tr>
                      ) : (
                        terminalDetails.latestSessions.map((sess: any) => {
                          const isClosed = sess.status === 'CLOSED' || sess.closed_at;
                          const expected = Number(sess.expected_cash || 0) || (Number(sess.opening_cash || 0) + Number(sess.cash_sales || 0) + Number(sess.cash_in || 0) - Number(sess.cash_out || 0) - Number(sess.total_refunds || 0));
                          const actual = Number(sess.actual_cash || sess.closing_cash || 0);
                          const isUncounted = Boolean(sess.is_uncounted || (isClosed && actual === 0 && !sess.is_audited && !(sess.notes && sess.notes.includes('Audit'))));
                          const disc = isClosed && !isUncounted ? (actual - expected) : 0;
                          return (
                            <tr 
                              key={sess.id} 
                              onClick={() => handleOpenPastShiftModal(sess)}
                              className="hover:bg-emerald-50/50 transition-colors cursor-pointer group"
                            >
                              <td className="py-2.5 px-3 font-mono font-bold text-slate-900">#{sess.id}</td>
                              <td className="py-2.5 px-3 font-mono text-[11px] text-gray-500">{formatSriLankaDateTime(sess.opened_at)}</td>
                              <td className="py-2.5 px-3 font-bold text-amber-700">{sess.username || 'Cashier'}</td>
                              <td className="py-2.5 px-3 text-right font-mono">Rs. {Number(sess.opening_cash || 0).toFixed(2)}</td>
                              <td className="py-2.5 px-3 text-right font-mono font-black text-slate-900">Rs. {Number(sess.total_sales || 0).toFixed(2)}</td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">Rs. {expected.toFixed(2)}</td>
                              <td className="py-2.5 px-3 text-right font-mono font-semibold">
                                {!isClosed ? (
                                  <span className="text-amber-600 font-bold text-[10px]">In Progress</span>
                                ) : isUncounted ? (
                                  <span className="text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded text-[10px] font-bold border border-amber-200">Uncounted</span>
                                ) : (
                                  `Rs. ${actual.toFixed(2)}`
                                )}
                              </td>
                              <td className={`py-2.5 px-3 text-right font-mono font-black ${
                                !isClosed || isUncounted ? 'text-gray-400' : Math.abs(disc) < 0.01 ? 'text-emerald-700' : disc > 0 ? 'text-amber-700' : 'text-rose-600'
                              }`}>
                                {!isClosed ? '—' : isUncounted ? <span className="text-gray-400 font-normal text-xs">Pending Count</span> : Math.abs(disc) < 0.01 ? 'Rs. 0.00' : disc > 0 ? `+Rs. ${disc.toFixed(2)}` : `-Rs. ${Math.abs(disc).toFixed(2)}`}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${
                                  isClosed ? 'bg-gray-100 text-gray-600 border-gray-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                }`}>
                                  {isClosed ? 'CLOSED' : 'OPEN'}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-center" onClick={e => e.stopPropagation()}>
                                <button
                                  onClick={() => handleOpenPastShiftModal(sess)}
                                  className="px-2.5 py-1 text-xs font-bold text-emerald-700 bg-emerald-50 group-hover:bg-emerald-600 group-hover:text-white rounded-lg flex items-center gap-1 mx-auto transition-colors cursor-pointer"
                                  title="Inspect Shift Details"
                                >
                                  <Eye size={12} /> View
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between shrink-0 bg-gray-50/60">
              <p className="text-xs text-gray-400 font-medium hidden sm:block">
                Viewing live data for <span className="font-bold text-slate-700">{selectedTerminalForModal.name}</span>
              </p>
              <button
                onClick={() => setSelectedTerminalForModal(null)}
                className="flex items-center gap-2 px-6 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold text-sm rounded-xl transition-colors cursor-pointer shadow-sm"
              >
                <X size={15} />
                Close Window
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ── MODAL: RECEIPT PREVIEW ── */}
      {selectedInvoiceForReceipt && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl text-slate-900 border border-slate-200">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-100">
              <h3 className="font-black text-sm text-slate-900">Receipt Snapshot</h3>
              <button onClick={() => setSelectedInvoiceForReceipt(null)} className="text-slate-400 hover:text-slate-600 font-bold p-1">
                ✕
              </button>
            </div>

            <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50 font-mono text-xs space-y-2">
              <div className="text-center font-bold pb-2 border-b border-slate-200">
                <p className="text-sm font-black text-slate-900">Nova FreshMart</p>
                <p className="text-[10px] text-slate-500">INV #{selectedInvoiceForReceipt.id}</p>
                <p className="text-[10px] text-slate-500">{formatSriLankaDateTime(selectedInvoiceForReceipt.created_at)}</p>
              </div>
              <div className="flex justify-between text-[11px] font-bold text-slate-700">
                <span>Terminal:</span>
                <span className="text-emerald-700 font-black">{selectedInvoiceForReceipt.terminal_id || 'TERM-01'}</span>
              </div>
              <div className="flex justify-between text-[11px] font-bold text-slate-700">
                <span>Branch:</span>
                <span>{selectedInvoiceForReceipt.branch_id || 'BR-MAIN'}</span>
              </div>
              <div className="flex justify-between text-[11px] font-bold text-slate-700">
                <span>Cashier:</span>
                <span className="text-slate-900">{selectedInvoiceForReceipt.cashier || 'Cashier'}</span>
              </div>
              <div className="flex justify-between text-[11px] font-bold text-slate-700">
                <span>Payment Method:</span>
                <span>{selectedInvoiceForReceipt.payment_method}</span>
              </div>
              <div className="border-t border-slate-200 pt-2 flex justify-between font-black text-sm text-emerald-800">
                <span>Total Amount:</span>
                <span>Rs. {Number(selectedInvoiceForReceipt.total || 0).toFixed(2)}</span>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setSelectedInvoiceForReceipt(null)}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold text-xs text-slate-700 cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: PAST SHIFT DETAILS INSPECTOR ── */}
      {selectedPastShiftForModal && (() => {
        const sess = selectedPastShiftForModal;
        const isClosed = sess.status === 'CLOSED' || sess.status === 'closed' || Boolean(sess.closed_at);
        
        // Sum Cash In and Cash Out from loaded transactions if available, otherwise from sess fields
        const txs = pastShiftDetailsData.transactions || [];
        const txCashIn = txs.filter((t: any) => (t.type || '').toUpperCase() === 'CASH_IN').reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0);
        const txCashOut = txs.filter((t: any) => (t.type || '').toUpperCase() === 'CASH_OUT' || (t.type || '').toUpperCase() === 'EXPENSE').reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0);

        const openCash = Number(sess.opening_cash || 0);
        const cashSales = Number(sess.cash_sales || 0);
        const cardSales = Number(sess.card_sales || 0);
        const bankSales = Number(sess.other_sales || 0);
        const grossSales = Number(sess.total_sales || (cashSales + cardSales + bankSales) || 0);
        const cashIn = txs.length > 0 ? txCashIn : Number(sess.cash_in || 0);
        const cashOut = txs.length > 0 ? txCashOut : Number(sess.cash_out || 0);
        const totalRefunds = Number(sess.total_refunds || 0);

        // Core Formula: Opening + Cash Sale + Cash In - Cash Out - Refunds = Expected Cash
        const calculatedExpected = openCash + cashSales + cashIn - cashOut - totalRefunds;
        const expected = Number(sess.expected_cash || 0) > 0 ? Number(sess.expected_cash) : calculatedExpected;

        const actual = Number(sess.actual_cash != null ? sess.actual_cash : (sess.closing_cash || 0));
        const isAudited = Boolean(sess.is_audited || (sess.notes && sess.notes.includes('Audit')));
        const isUncounted = isClosed && (actual === 0 || sess.actual_cash === null || sess.actual_cash === undefined) && !isAudited;

        const disc = isClosed && !isUncounted ? (actual - expected) : 0;
        const isBalanced = isClosed && !isUncounted && Math.abs(disc) < 0.01;
        const isShortage = isClosed && !isUncounted && disc < -0.01;
        const isExcess = isClosed && !isUncounted && disc > 0.01;

        const handlePrintPastShift = () => {
          const w = window.open('', '_blank', 'width=700,height=900');
          if (!w) return;
          w.document.write(`<!DOCTYPE html><html><head><title>Shift Session Report #${sess.id}</title><style>
            body{font-family:monospace;font-size:12px;margin:24px;color:#111}
            h1{font-size:16px;margin:0 0 4px}h2{font-size:13px;margin:16px 0 6px;border-bottom:1px solid #ccc;padding-bottom:4px}
            .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px}
            .box{border:1px solid #ddd;border-radius:6px;padding:10px}
            .label{font-size:10px;color:#666;text-transform:uppercase;font-weight:bold}
            .val{font-size:15px;font-weight:900;margin-top:2px}
            table{width:100%;border-collapse:collapse;margin-top:8px}
            th,td{text-align:left;padding:6px;border-bottom:1px solid #eee;font-size:11px}
            th{background:#f8f9fa}
            @media print{button{display:none}}
          </style></head><body>
          <h1>Nova FreshMart — Shift Session Report</h1>
          <p style="color:#555;font-size:11px">Shift #${sess.id} &bull; ${sess.terminal_name||sess.terminal_id} &bull; ${sess.branch_name||sess.branch_id} &bull; Cashier: ${sess.username||'Cashier'}</p>
          <p style="color:#555;font-size:11px">Opened: ${sess.opened_at||''} &bull; Closed: ${sess.closed_at||'In Progress'}</p>
          <h2>Cash Flow & Till Formula</h2>
          <div class="grid">
            <div class="box"><div class="label">Opening Float (+)</div><div class="val">Rs. ${openCash.toFixed(2)}</div></div>
            <div class="box"><div class="label">Cash Sales (+)</div><div class="val">Rs. ${cashSales.toFixed(2)}</div></div>
            <div class="box"><div class="label">Cash In / Float (+)</div><div class="val">Rs. ${cashIn.toFixed(2)}</div></div>
            <div class="box"><div class="label">Cash Out / Expenses (-)</div><div class="val">Rs. ${cashOut.toFixed(2)}</div></div>
            <div class="box"><div class="label">Refunds / Exchange (-)</div><div class="val">Rs. ${totalRefunds.toFixed(2)}</div></div>
            <div class="box" style="border-color:#16a34a"><div class="label">Expected Till Cash (=)</div><div class="val" style="color:#16a34a">Rs. ${expected.toFixed(2)}</div></div>
            <div class="box"><div class="label">Actual Counted</div><div class="val">${!isClosed ? 'In Progress' : isUncounted ? 'Uncounted (Pending Audit)' : 'Rs. ' + actual.toFixed(2)}</div></div>
            <div class="box" style="border-color:${isUncounted?'#f59e0b':isBalanced?'#16a34a':isExcess?'#d97706':'#dc2626'}"><div class="label">Till Discrepancy</div><div class="val" style="color:${isUncounted?'#f59e0b':isBalanced?'#16a34a':isExcess?'#d97706':'#dc2626'}">${!isClosed ? '—' : isUncounted ? 'Pending Count' : isBalanced ? 'Balanced (Rs. 0.00)' : isExcess ? '+Rs. ' + disc.toFixed(2) : '-Rs. ' + Math.abs(disc).toFixed(2)}</div></div>
          </div>
          <h2>Payment Tender Breakdown</h2>
          <div class="grid">
            <div class="box"><div class="label">Cash Sales</div><div class="val">Rs. ${cashSales.toFixed(2)}</div></div>
            <div class="box"><div class="label">Card Sales</div><div class="val">Rs. ${cardSales.toFixed(2)}</div></div>
            <div class="box"><div class="label">Bank/QR Sales</div><div class="val">Rs. ${bankSales.toFixed(2)}</div></div>
            <div class="box"><div class="label">Total Gross Sales</div><div class="val">Rs. ${grossSales.toFixed(2)}</div></div>
          </div>
          <br/><button onclick="window.print()" style="padding:8px 20px;background:#1e293b;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px">🖨 Print / Save as PDF</button>
          </body></html>`);
          w.document.close();
        };

        return (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[210] flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl text-slate-900 border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                <div>
                  <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
                    <Activity size={18} className="text-emerald-600" />
                    Shift Session #{sess.id} Details
                  </h3>
                  <p className="text-xs text-gray-500 font-medium mt-0.5">
                    Terminal: <strong className="text-slate-800">{sess.terminal_name || sess.terminal_id || 'TERM-01'}</strong> • Cashier: <strong className="text-amber-700">{sess.username || 'Cashier'}</strong>
                  </p>
                </div>
                <button 
                  onClick={() => setSelectedPastShiftForModal(null)} 
                  className="text-slate-400 hover:text-slate-600 font-bold p-1 cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Status Banner */}
              <div className={`p-3 rounded-2xl border flex items-center justify-between ${
                isClosed 
                  ? 'bg-gray-50 border-gray-200 text-slate-700' 
                  : 'bg-emerald-50 border-emerald-200 text-emerald-800'
              }`}>
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider block">
                    Session Status: <strong>{isClosed ? 'SHIFT CLOSED / ENDED' : 'LIVE ACTIVE SHIFT'}</strong>
                  </span>
                  {isUncounted && (
                    <span className="text-[11px] text-amber-700 font-semibold block mt-0.5">
                      ⚠ Shift auto-closed; physical cash was not counted at handover.
                    </span>
                  )}
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-black shrink-0 ${
                  isClosed ? 'bg-gray-200 text-slate-800' : 'bg-emerald-600 text-white'
                }`}>
                  {isClosed ? 'CLOSED' : 'ACTIVE'}
                </span>
              </div>

              {/* Timestamps */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <span className="text-[10px] font-bold text-gray-400 uppercase block">Opened At</span>
                  <span className="font-mono font-bold text-slate-800 mt-0.5 block">{formatSriLankaDateTime(sess.opened_at)}</span>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <span className="text-[10px] font-bold text-gray-400 uppercase block">Closed At</span>
                  <span className="font-mono font-bold text-slate-800 mt-0.5 block">{sess.closed_at ? formatSriLankaDateTime(sess.closed_at) : 'Currently In Progress'}</span>
                </div>
              </div>

              {/* Cash Flow & Till Math Formula Card */}
              <div className="bg-slate-900 text-white p-4 rounded-2xl shadow-sm space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                    <Coins size={13} />
                    Cash Flow & Till Math Breakdown
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    Open + CashSale + CashIn - CashOut = Expected
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/60">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Opening Float (+)</span>
                    <span className="font-mono font-bold text-slate-100 text-sm mt-0.5 block">Rs. {openCash.toFixed(2)}</span>
                  </div>
                  <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/60">
                    <span className="text-[10px] text-emerald-400 uppercase font-bold block">Cash Sales (+)</span>
                    <span className="font-mono font-bold text-emerald-400 text-sm mt-0.5 block">+Rs. {cashSales.toFixed(2)}</span>
                  </div>
                  <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/60">
                    <span className="text-[10px] text-teal-400 uppercase font-bold block">Cash In / Float (+)</span>
                    <span className="font-mono font-bold text-teal-400 text-sm mt-0.5 block">+Rs. {cashIn.toFixed(2)}</span>
                  </div>
                  <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/60">
                    <span className="text-[10px] text-rose-400 uppercase font-bold block">Cash Out / Drops (-)</span>
                    <span className="font-mono font-bold text-rose-400 text-sm mt-0.5 block">-Rs. {cashOut.toFixed(2)}</span>
                  </div>
                  <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/60">
                    <span className="text-[10px] text-amber-400 uppercase font-bold block">Refunds / Returns (-)</span>
                    <span className="font-mono font-bold text-amber-400 text-sm mt-0.5 block">-Rs. {totalRefunds.toFixed(2)}</span>
                  </div>
                  <div className="bg-emerald-950/70 p-2.5 rounded-xl border border-emerald-500/50">
                    <span className="text-[10px] text-emerald-300 uppercase font-black block">Expected Till (=)</span>
                    <span className="font-mono font-black text-emerald-300 text-sm mt-0.5 block">Rs. {expected.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Actual Counted & Till Variance */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-gray-500 uppercase">Actual Cash Counted</span>
                    {isClosed && (
                      <button
                        onClick={() => setShowAuditInput(!showAuditInput)}
                        className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 underline cursor-pointer"
                      >
                        {isUncounted ? '➕ Enter Count' : '✏ Edit Count'}
                      </button>
                    )}
                  </div>
                  <div className="mt-1">
                    {!isClosed ? (
                      <span className="text-amber-600 font-bold text-sm">Shift In Progress</span>
                    ) : isUncounted ? (
                      <div>
                        <span className="inline-block px-2.5 py-1 rounded-lg bg-amber-100 text-amber-800 text-xs font-black">
                          Uncounted (Auto-Closed)
                        </span>
                        <p className="text-[10px] text-gray-500 mt-1">Cashier left without entering drawer count.</p>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-black text-slate-900 text-base">
                          Rs. {actual.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                        {isAudited && (
                          <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                            Audited
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                  <span className="text-[10px] font-bold text-gray-500 uppercase block">Till Variance / Audit</span>
                  <div className="mt-1">
                    {!isClosed ? (
                      <span className="text-gray-400 font-bold text-sm">—</span>
                    ) : isUncounted ? (
                      <div>
                        <span className="inline-block px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 text-xs font-black">
                          Pending Count Audit
                        </span>
                        <p className="text-[10px] text-gray-400 mt-1">No shortage recorded until audited.</p>
                      </div>
                    ) : (
                      <div>
                        <span className={`font-mono font-black text-sm block ${
                          isBalanced ? 'text-emerald-700' : isExcess ? 'text-amber-700' : 'text-rose-600'
                        }`}>
                          {isBalanced ? 'Balanced (Rs. 0.00)' : isExcess ? `Excess: +Rs. ${disc.toFixed(2)}` : `Shortage: -Rs. ${Math.abs(disc).toFixed(2)}`}
                        </span>
                        {sess.notes && <p className="text-[10px] text-gray-400 mt-0.5 truncate">{sess.notes}</p>}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Inline Audit Form */}
              {showAuditInput && (
                <div className="p-4 bg-emerald-50/70 rounded-2xl border border-emerald-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-emerald-900 uppercase tracking-wide">Audit & Record Shift Cash Count</span>
                    <button onClick={() => setShowAuditInput(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer"><X size={14} /></button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[10px] font-bold text-gray-600 uppercase block mb-1">Counted Physical Cash (Rs.) *</label>
                      <input
                        type="number"
                        step="any"
                        value={auditCashValue}
                        onChange={(e) => setAuditCashValue(e.target.value)}
                        placeholder={`Expected: ${expected.toFixed(2)}`}
                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl font-mono font-bold text-sm text-slate-900 focus:outline-none focus:border-emerald-500"
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-600 uppercase block mb-1">Audit Notes / Reason (Optional)</label>
                      <input
                        type="text"
                        value={auditNotesValue}
                        onChange={(e) => setAuditNotesValue(e.target.value)}
                        placeholder="e.g. Drawer verified by Admin Divya"
                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      onClick={() => setShowAuditInput(false)}
                      className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-lg cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveAudit}
                      disabled={isAuditing}
                      className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                    >
                      {isAuditing ? <RefreshCw size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                      Save Count & Recalculate Variance
                    </button>
                  </div>
                </div>
              )}

              {/* Cash In & Cash Out Records Section */}
              <div className="bg-gray-50/80 p-3.5 rounded-2xl border border-gray-200/80 space-y-2 text-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-gray-600 uppercase tracking-wider flex items-center gap-1.5">
                    <Coins size={14} className="text-emerald-600" />
                    Cash In & Cash Out Records ({txs.length})
                  </span>
                  {pastShiftDetailsData.loading && <RefreshCw size={12} className="animate-spin text-gray-400" />}
                </div>
                {pastShiftDetailsData.loading ? (
                  <div className="py-3 text-center text-gray-400 text-xs">Loading cash records...</div>
                ) : txs.length === 0 ? (
                  <div className="py-2.5 px-3 bg-white rounded-xl border border-gray-200 text-gray-400 italic text-center">
                    No Cash In or Cash Out recorded during this shift.
                  </div>
                ) : (
                  <div className="max-h-36 overflow-y-auto space-y-1.5">
                    {txs.map((tx: any, idx: number) => {
                      const isTxIn = (tx.type || '').toUpperCase() === 'CASH_IN';
                      return (
                        <div key={tx.id || idx} className="flex justify-between items-center py-2 px-3 bg-white rounded-xl border border-gray-200 text-xs">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                              isTxIn ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                            }`}>
                              {isTxIn ? '+ Cash In' : '- Cash Out'}
                            </span>
                            <span className="text-slate-700 font-medium">{tx.notes || (isTxIn ? 'Cash Drop / In' : 'Petty Cash Expense')}</span>
                          </div>
                          <div className="text-right">
                            <span className={`font-mono font-bold ${isTxIn ? 'text-emerald-700' : 'text-rose-600'}`}>
                              {isTxIn ? '+' : '-'}Rs. {Number(tx.amount || 0).toFixed(2)}
                            </span>
                            <span className="block text-[9px] text-gray-400 font-mono">
                              {tx.created_at ? formatSriLankaDateTime(tx.created_at, { timeOnly: true }) : ''}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Tender Breakdown */}
              <div className="bg-gray-50/80 p-3.5 rounded-2xl border border-gray-200/80 space-y-2 text-xs">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Payment Method Breakdown</p>
                {[
                  { label: 'Cash Sales', value: cashSales, color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
                  { label: 'Card / POS Sales', value: cardSales, color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
                  { label: 'Bank Transfer / QR / Other', value: bankSales, color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200' },
                  { label: 'Total Gross Sales', value: grossSales, color: 'text-slate-900', bg: 'bg-slate-100', border: 'border-slate-300' },
                ].map(row => (
                  <div key={row.label} className={`flex justify-between items-center py-2 px-3 rounded-xl border ${row.bg} ${row.border} text-sm`}>
                    <span className="font-semibold text-slate-600">{row.label}</span>
                    <span className={`font-mono font-black ${row.color}`}>Rs. {row.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                ))}
              </div>

              {/* Modal Actions */}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => {
                    setSelectedPastShiftForModal(null);
                    setModalActiveSubTab('invoices');
                    setModalInvoiceSearch(String(sess.username || ''));
                  }}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <FileText size={14} /> Filter Shift Invoices
                </button>
                <button
                  onClick={handlePrintPastShift}
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-700 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  <Printer size={13} /> Print / PDF
                </button>
                <button
                  onClick={() => setSelectedPastShiftForModal(null)}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── MODAL: HANDOVER SLIP PREVIEW ── */}
      {selectedHandoverSlip && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl text-slate-900 border border-slate-200">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-100">
              <h3 className="font-black text-sm text-slate-900 flex items-center gap-1.5">
                <ArrowLeftRight size={16} className="text-emerald-600" />
                <span>Cashier Handover Slip #{selectedHandoverSlip.id}</span>
              </h3>
              <button onClick={() => setSelectedHandoverSlip(null)} className="text-slate-400 hover:text-slate-600 font-bold p-1 cursor-pointer">
                ✕
              </button>
            </div>

            <div className="border border-slate-200 rounded-2xl p-4 bg-[#FAFDFB] font-mono text-xs space-y-2.5">
              <div className="text-center font-bold pb-2 border-b border-slate-200 font-sans">
                <p className="text-sm font-black text-slate-900">Nova FreshMart</p>
                <p className="text-[10px] text-slate-500">Terminal Shift Handover Record</p>
                <p className="text-[10px] text-slate-500">{parseSqliteUtc(selectedHandoverSlip.handover_time).toLocaleString()}</p>
              </div>

              <div className="flex justify-between text-slate-600 font-sans">
                <span>Terminal / Branch:</span>
                <span className="font-bold text-slate-800">{selectedHandoverSlip.terminal_name || selectedHandoverSlip.terminal_id} ({selectedHandoverSlip.branch_name || selectedHandoverSlip.branch_id})</span>
              </div>
              <div className="flex justify-between text-slate-600 font-sans">
                <span>Outgoing Cashier:</span>
                <span className="font-bold text-slate-800">{selectedHandoverSlip.outgoing_cashier}</span>
              </div>
              <div className="flex justify-between text-slate-600 font-sans">
                <span>Incoming Cashier:</span>
                <span className="font-bold text-emerald-700">{selectedHandoverSlip.incoming_cashier}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2 text-slate-600 font-sans">
                <span>Shift Bills Count:</span>
                <span className="font-bold text-slate-800">{selectedHandoverSlip.bills_count || 0}</span>
              </div>
              <div className="flex justify-between text-slate-600 font-sans">
                <span>Shift Cash Sales:</span>
                <span className="font-bold text-slate-800">Rs. {Number(selectedHandoverSlip.cash_sales || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-600 font-sans">
                <span>Shift Total Revenue:</span>
                <span className="font-bold text-emerald-700">Rs. {Number(selectedHandoverSlip.total_sales || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2 text-slate-600 font-sans">
                <span>Opening Drawer Float:</span>
                <span className="font-bold text-slate-800">Rs. {Number(selectedHandoverSlip.opening_float || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-600 font-sans">
                <span>Expected Drawer Cash:</span>
                <span className="font-bold text-slate-800">Rs. {Number(selectedHandoverSlip.expected_drawer_cash || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-600 font-sans">
                <span>Physical Counted Cash:</span>
                <span className="font-bold text-slate-900 font-black">Rs. {Number(selectedHandoverSlip.counted_cash || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2 font-bold font-sans">
                <span>Cash Variance:</span>
                <span className={`${
                  Number(selectedHandoverSlip.cash_variance || 0) === 0 ? 'text-slate-600' :
                  Number(selectedHandoverSlip.cash_variance || 0) > 0 ? 'text-emerald-600' : 'text-rose-600'
                } font-black`}>
                  {Number(selectedHandoverSlip.cash_variance || 0) > 0 ? `+Rs. ${Number(selectedHandoverSlip.cash_variance).toFixed(2)} (Surplus)` :
                   Number(selectedHandoverSlip.cash_variance || 0) < 0 ? `-Rs. ${Math.abs(Number(selectedHandoverSlip.cash_variance)).toFixed(2)} (Shortage)` :
                   'Rs. 0.00 (Balanced)'}
                </span>
              </div>

              {selectedHandoverSlip.handover_notes && (
                <div className="bg-white p-2 rounded-xl border border-slate-200 text-[11px] text-slate-600 font-sans">
                  <span className="font-bold text-slate-400 block uppercase text-[9px]">Notes</span>
                  {selectedHandoverSlip.handover_notes}
                </div>
              )}
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setSelectedHandoverSlip(null)}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold text-xs text-slate-700 cursor-pointer"
              >
                Close Slip
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: CREATE BRANCH ── */}
      {showAddBranch && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <form onSubmit={handleCreateBranch} className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-200/90 space-y-4 text-slate-800">
            <h3 className="font-black text-lg text-slate-900">Create Store Branch</h3>
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Branch Name *</label>
              <input 
                type="text" 
                value={newBranch.name} 
                onChange={e => setNewBranch({ ...newBranch, name: e.target.value })}
                placeholder="e.g. City Mall Superstore" 
                className="w-full mt-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-slate-800 outline-none focus:border-emerald-500 shadow-2xs"
                required
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Branch Code</label>
              <input 
                type="text" 
                value={newBranch.code} 
                onChange={e => setNewBranch({ ...newBranch, code: e.target.value })}
                placeholder="e.g. BR02" 
                className="w-full mt-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-slate-800 outline-none focus:border-emerald-500 font-mono shadow-2xs"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Address</label>
              <input 
                type="text" 
                value={newBranch.address} 
                onChange={e => setNewBranch({ ...newBranch, address: e.target.value })}
                placeholder="e.g. 124 Main Street, Colombo" 
                className="w-full mt-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-slate-800 outline-none focus:border-emerald-500 shadow-2xs"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Phone Number</label>
              <input 
                type="text" 
                value={newBranch.phone} 
                onChange={e => setNewBranch({ ...newBranch, phone: e.target.value })}
                placeholder="e.g. 011-7654321" 
                className="w-full mt-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-slate-800 outline-none focus:border-emerald-500 shadow-2xs"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button 
                type="button" 
                onClick={() => setShowAddBranch(false)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer border border-gray-200 shadow-2xs"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-xs cursor-pointer"
              >
                Save Branch
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── MODAL: CREATE TERMINAL ── */}
      {showAddTerminal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <form onSubmit={handleCreateTerminal} className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-200/90 space-y-4 text-slate-800">
            <h3 className="font-black text-lg text-slate-900">Add New Touch POS Terminal</h3>
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Terminal Name *</label>
              <input 
                type="text" 
                value={newTerminal.name} 
                onChange={e => setNewTerminal({ ...newTerminal, name: e.target.value })}
                placeholder="e.g. Counter 02 (Touchscreen)" 
                className="w-full mt-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-slate-800 outline-none focus:border-emerald-500 shadow-2xs"
                required
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Branch Assignment *</label>
              <select
                value={newTerminal.branch_id}
                onChange={e => setNewTerminal({ ...newTerminal, branch_id: e.target.value })}
                className="w-full mt-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-slate-800 outline-none focus:border-emerald-500 cursor-pointer shadow-2xs"
                required
              >
                {overview.branches?.map((b: any) => (
                  <option key={b.id} value={b.id}>{b.name} ({b.id})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Terminal ID Code</label>
              <input 
                type="text" 
                value={newTerminal.id} 
                onChange={e => setNewTerminal({ ...newTerminal, id: e.target.value })}
                placeholder="e.g. TERM-02" 
                className="w-full mt-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-slate-800 outline-none focus:border-emerald-500 font-mono shadow-2xs"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button 
                type="button" 
                onClick={() => setShowAddTerminal(false)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer border border-gray-200 shadow-2xs"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-xs cursor-pointer"
              >
                Save Terminal
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Terminal Modal */}
      {editingTerminal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <form onSubmit={handleUpdateTerminal} className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-200/90 space-y-4 text-slate-800">
            <h3 className="font-black text-lg text-slate-900">Edit POS Terminal</h3>
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Terminal ID</label>
              <input 
                type="text" 
                disabled
                value={editingTerminal.id} 
                className="w-full bg-gray-100 border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-500 font-mono outline-none mt-1 cursor-not-allowed" 
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Terminal Name *</label>
              <input 
                type="text" 
                value={editingTerminal.name} 
                onChange={e => setEditingTerminal({ ...editingTerminal, name: e.target.value })}
                placeholder="e.g. Counter 02 (Touchscreen)" 
                required
                className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-emerald-500 mt-1 shadow-2xs" 
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Assigned Branch</label>
              <select
                value={editingTerminal.branch_id || 'BR-MAIN'}
                onChange={e => setEditingTerminal({ ...editingTerminal, branch_id: e.target.value })}
                className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-emerald-500 mt-1 shadow-2xs cursor-pointer"
              >
                {overview.branches.map((b: any) => (
                  <option key={b.id} value={b.id}>{b.name} ({b.id})</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button 
                type="button" 
                onClick={() => setEditingTerminal(null)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer border border-gray-200 shadow-2xs"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-xs cursor-pointer"
              >
                Update Terminal
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Shift Details Inspector Modal */}
      {selectedShiftForDetails && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl border border-gray-200/90 overflow-hidden text-slate-800">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-emerald-50/60 to-white shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 font-bold shadow-sm">
                  <Clock size={22} />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-black text-xl text-slate-900">Shift Details #{selectedShiftForDetails.id}</h3>
                    <span className={`text-xs font-black px-2.5 py-1 rounded-lg border ${
                      (selectedShiftForDetails.status || '').toLowerCase() === 'closed'
                        ? 'bg-gray-100 text-gray-600 border-gray-200'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    }`}>
                      {(selectedShiftForDetails.status || 'OPEN').toUpperCase()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Terminal: <span className="font-bold text-slate-700">{selectedShiftForDetails.terminal_name || selectedShiftForDetails.terminal_id}</span> &bull;
                    Branch: <span className="font-bold text-emerald-700">{selectedShiftForDetails.branch_name || selectedShiftForDetails.branch_id}</span> &bull;
                    Cashier: <span className="font-bold text-amber-700">{selectedShiftForDetails.username || 'Cashier'}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setSelectedShiftForDetails(null); setShiftDetailData(null); }}
                className="flex items-center gap-2 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700 font-bold text-sm rounded-xl border border-red-200 transition-all cursor-pointer shadow-sm"
              >
                <X size={18} />
                <span className="hidden sm:inline">Close</span>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {loadingShiftDetails ? (
                <div className="py-20 text-center text-gray-400 text-sm font-bold flex flex-col items-center gap-2">
                  <RefreshCw size={24} className="animate-spin text-emerald-600" />
                  <span>Loading shift financial breakdown &amp; invoices...</span>
                </div>
              ) : shiftDetailData ? (() => {
                const s = shiftDetailData.session || selectedShiftForDetails;
                const invs = shiftDetailData.invoices || [];
                const txs = shiftDetailData.transactions || [];
                
                const openCash = Number(s.opening_cash || 0);
                const actualCash = Number(s.actual_cash != null ? s.actual_cash : (s.closing_cash || 0));
                
                // Calculate tenders from invoices if available, else from session row
                let grossSales = 0;
                let cashSales = 0;
                let cardSales = 0;
                let bankSales = 0;
                let splitCount = 0;

                if (invs.length > 0) {
                  invs.forEach((inv: any) => {
                    const tot = Number(inv.total || inv.total_amount || 0);
                    const cp = Number(inv.cash_paid || 0);
                    const cdp = Number(inv.card_paid || 0);
                    const op = Number(inv.other_paid || 0);
                    const cr = Number(inv.change_returned || 0);
                    const pm = (inv.payment_method || '').toUpperCase();

                    grossSales += tot;
                    const multi = [cp > 0, cdp > 0, op > 0].filter(Boolean).length > 1;
                    if (pm === 'SPLIT' || multi) {
                      splitCount++;
                      if (cp > 0) cashSales += Math.max(0, cp - cr);
                      if (cdp > 0) cardSales += cdp;
                      if (op > 0) bankSales += op;
                    } else if (pm === 'CASH') {
                      cashSales += tot;
                    } else if (pm === 'CARD') {
                      cardSales += (cdp > 0 ? cdp : tot);
                    } else {
                      bankSales += (op > 0 ? op : tot);
                    }
                  });
                } else {
                  grossSales = Number(s.total_sales || 0);
                  cashSales = Number(s.cash_sales || 0);
                  cardSales = Number(s.card_sales || 0);
                  bankSales = Number(s.other_sales || 0);
                }

                // If txs has records, derive cashIn and cashOut from them for 100% precision
                let cashIn = Number(s.cash_in || 0);
                let cashOut = Number(s.cash_out || 0);
                if (txs.length > 0) {
                  cashIn = txs.reduce((acc: number, t: any) => (t.type || '').toUpperCase() === 'CASH_IN' ? acc + Number(t.amount || 0) : acc, 0);
                  cashOut = txs.reduce((acc: number, t: any) => (t.type || '').toUpperCase() !== 'CASH_IN' ? acc + Number(t.amount || 0) : acc, 0);
                }

                const isShiftClosed = (s.status || '').toLowerCase() === 'closed';
                const isShiftAudited = Boolean(s.is_audited || (s.notes && s.notes.includes('Audit')));
                const isShiftUncounted = isShiftClosed && actualCash === 0 && !isShiftAudited;
                const totalRefunds = Number(s.total_refunds || 0);

                const expectedCash = Number(s.expected_cash || 0) > 0 
                  ? Number(s.expected_cash) 
                  : Math.max(0, openCash + cashSales + cashIn - cashOut - totalRefunds);
                const diff = isShiftClosed && !isShiftUncounted ? (actualCash - expectedCash) : 0;

                return (
                  <>
                    {/* Metrics Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                      <div className="bg-gray-50 p-3 rounded-2xl border border-gray-200/80 shadow-2xs">
                        <p className="text-[10px] font-bold text-gray-400 uppercase">Opening Float (+)</p>
                        <p className="text-lg font-black text-slate-900 mt-1">Rs. {openCash.toFixed(2)}</p>
                      </div>
                      <div className="bg-gray-50 p-3 rounded-2xl border border-gray-200/80 shadow-2xs">
                        <p className="text-[10px] font-bold text-gray-400 uppercase">Gross Sales</p>
                        <p className="text-lg font-black text-slate-900 mt-1">Rs. {grossSales.toFixed(2)}</p>
                      </div>
                      <div className="bg-gray-50 p-3 rounded-2xl border border-gray-200/80 shadow-2xs">
                        <p className="text-[10px] font-bold text-gray-400 uppercase">Cash Collected (+)</p>
                        <p className="text-lg font-black text-emerald-700 mt-1">Rs. {cashSales.toFixed(2)}</p>
                      </div>
                      <div className="bg-gray-50 p-3 rounded-2xl border border-gray-200/80 shadow-2xs">
                        <p className="text-[10px] font-bold text-gray-400 uppercase">Card Sales</p>
                        <p className="text-lg font-black text-amber-800 mt-1">Rs. {cardSales.toFixed(2)}</p>
                      </div>
                      <div className="bg-gray-50 p-3 rounded-2xl border border-gray-200/80 shadow-2xs">
                        <p className="text-[10px] font-bold text-gray-400 uppercase">Bank Transfer / QR</p>
                        <p className="text-lg font-black text-purple-700 mt-1">Rs. {bankSales.toFixed(2)}</p>
                      </div>
                      <div className="bg-emerald-50/60 p-3 rounded-2xl border border-emerald-200/80 shadow-2xs">
                        <p className="text-[10px] font-bold text-emerald-700 uppercase">Cash In / Float (+)</p>
                        <p className="text-lg font-black text-emerald-700 mt-1">+Rs. {cashIn.toFixed(2)}</p>
                      </div>
                      <div className="bg-rose-50/60 p-3 rounded-2xl border border-rose-200/80 shadow-2xs">
                        <p className="text-[10px] font-bold text-rose-700 uppercase">Cash Out / Drops (-)</p>
                        <p className="text-lg font-black text-rose-700 mt-1">-Rs. {cashOut.toFixed(2)}</p>
                      </div>
                      <div className="bg-gray-50 p-3 rounded-2xl border border-gray-200/80 shadow-2xs">
                        <p className="text-[10px] font-bold text-gray-400 uppercase">Expected Till (=)</p>
                        <p className="text-lg font-black text-emerald-700 mt-1">Rs. {expectedCash.toFixed(2)}</p>
                      </div>
                      <div className="bg-gray-50 p-3 rounded-2xl border border-gray-200/80 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-bold text-gray-400 uppercase">Closing Count</p>
                          {isShiftClosed && (
                            <button
                              onClick={() => {
                                setAuditCashValue(actualCash > 0 ? String(actualCash) : '');
                                setAuditNotesValue('');
                                setShowAuditInput(!showAuditInput);
                              }}
                              className="text-[10px] font-bold text-emerald-700 hover:text-emerald-800 underline cursor-pointer"
                            >
                              {isShiftUncounted ? '➕ Audit' : '✏ Edit'}
                            </button>
                          )}
                        </div>
                        <p className="text-lg font-black text-slate-900 mt-0.5">
                          {!isShiftClosed ? 'In Progress' : isShiftUncounted ? (
                            <span className="text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-lg font-black">Uncounted</span>
                          ) : (
                            `Rs. ${actualCash.toFixed(2)}`
                          )}
                        </p>
                      </div>
                      <div className={`p-3 rounded-2xl border shadow-2xs ${
                        !isShiftClosed || isShiftUncounted
                          ? 'bg-slate-50 border-slate-200 text-slate-600'
                          : Math.abs(diff) < 0.01 
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
                          : diff > 0 
                          ? 'bg-amber-50 border-amber-200 text-amber-700' 
                          : 'bg-rose-50 border-rose-200 text-rose-700'
                      }`}>
                        <p className="text-[10px] font-bold uppercase">Cash Discrepancy</p>
                        <p className="text-lg font-black mt-0.5">
                          {!isShiftClosed ? '—' : isShiftUncounted ? (
                            <span className="text-xs font-bold text-gray-500">Pending Count Audit</span>
                          ) : Math.abs(diff) < 0.01 ? (
                            'Balanced'
                          ) : diff > 0 ? (
                            `+Rs. ${diff.toFixed(2)}`
                          ) : (
                            `-Rs. ${Math.abs(diff).toFixed(2)}`
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Inline Audit Form */}
                    {showAuditInput && (
                      <div className="p-4 bg-emerald-50/80 rounded-2xl border border-emerald-200 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-emerald-900 uppercase tracking-wide">Audit & Record Shift Cash Count</span>
                          <button onClick={() => setShowAuditInput(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer"><X size={14} /></button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div>
                            <label className="text-[10px] font-bold text-gray-600 uppercase block mb-1">Counted Physical Cash (Rs.) *</label>
                            <input
                              type="number"
                              step="any"
                              value={auditCashValue}
                              onChange={(e) => setAuditCashValue(e.target.value)}
                              placeholder={`Expected: ${expectedCash.toFixed(2)}`}
                              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl font-mono font-bold text-sm text-slate-900 focus:outline-none focus:border-emerald-500"
                              autoFocus
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-gray-600 uppercase block mb-1">Audit Notes / Verified By</label>
                            <input
                              type="text"
                              value={auditNotesValue}
                              onChange={(e) => setAuditNotesValue(e.target.value)}
                              placeholder="e.g. Drawer verified by Admin Divya"
                              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2 pt-1">
                          <button
                            onClick={() => setShowAuditInput(false)}
                            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-lg cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={async () => {
                              const num = parseFloat(auditCashValue);
                              if (isNaN(num) || num < 0) {
                                alert('Please enter a valid actual cash amount (0 or greater).');
                                return;
                              }
                              setIsAuditing(true);
                              try {
                                // @ts-ignore
                                const res = await window.db.invoke('audit-shift-actual-cash', {
                                  sessionId: s.id,
                                  shiftId: s.id,
                                  actualCash: num,
                                  notes: auditNotesValue.trim(),
                                  auditedBy: currentUser?.username || 'Admin'
                                });
                                if (res && res.success) {
                                  setShiftDetailData((prev: any) => ({
                                    ...prev,
                                    session: {
                                      ...(prev?.session || s),
                                      actual_cash: res.actual_cash,
                                      closing_cash: res.actual_cash,
                                      expected_cash: res.expected_cash,
                                      discrepancy: res.discrepancy,
                                      is_audited: true,
                                      notes: res.notes
                                    }
                                  }));
                                  setShowAuditInput(false);
                                  alert('✓ Shift audit saved successfully! Actual count and till discrepancy updated.');
                                }
                              } catch (err: any) {
                                alert('Failed to save audit: ' + (err.message || err));
                              } finally {
                                setIsAuditing(false);
                              }
                            }}
                            disabled={isAuditing}
                            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                          >
                            {isAuditing ? <RefreshCw size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                            Save Count & Recalculate Variance
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Cash Movements (Cash In / Out / Expenses) */}
                    <div className="bg-white rounded-2xl border border-gray-200/90 overflow-hidden shadow-2xs">
                      <div className="p-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                        <h4 className="font-bold text-xs text-slate-800 flex items-center gap-2">
                          <span>Cash Movements (Cash In / Cash Out)</span>
                          <span className="text-[11px] font-bold text-gray-500 bg-gray-200/70 px-2 py-0.5 rounded-full">{txs.length} entries</span>
                        </h4>
                        <div className="flex gap-2 text-[11px] font-bold">
                          {cashIn > 0 && (
                            <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                              +Rs. {cashIn.toFixed(2)} In
                            </span>
                          )}
                          {cashOut > 0 && (
                            <span className="text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
                              -Rs. {cashOut.toFixed(2)} Out
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="max-h-48 overflow-y-auto">
                        <table className="w-full text-left text-xs whitespace-nowrap">
                          <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] tracking-wider border-b border-gray-200 sticky top-0">
                            <tr>
                              <th className="p-2.5 pl-4">Type</th>
                              <th className="p-2.5">Time</th>
                              <th className="p-2.5">Notes / Purpose</th>
                              <th className="p-2.5 text-right pr-4">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 text-slate-700">
                            {txs.length === 0 ? (
                              <tr>
                                <td colSpan={4} className="p-4 text-center text-gray-400 font-medium">
                                  No cash movements (Cash In or Cash Out) recorded for this shift.
                                </td>
                              </tr>
                            ) : (
                              txs.map((t: any, idx: number) => {
                                const isPositive = (t.type || '').toUpperCase() === 'CASH_IN';
                                return (
                                  <tr key={t.id || idx} className="hover:bg-gray-50/80 transition-colors">
                                    <td className="p-2.5 pl-4 font-bold">
                                      <span className={`px-2 py-0.5 rounded-md text-[10px] uppercase font-black ${
                                        isPositive 
                                          ? 'bg-emerald-100 text-emerald-800' 
                                          : 'bg-rose-100 text-rose-800'
                                      }`}>
                                        {(t.type || 'MOVEMENT').replace('_', ' ')}
                                      </span>
                                    </td>
                                    <td className="p-2.5 text-gray-500">
                                      {formatSriLankaDateTime(t.created_at, { timeOnly: true })}
                                    </td>
                                    <td className="p-2.5 text-slate-800 font-medium">
                                      {t.notes || '—'}
                                    </td>
                                    <td className={`p-2.5 text-right pr-4 font-mono font-black ${
                                      isPositive ? 'text-emerald-700' : 'text-rose-700'
                                    }`}>
                                      {isPositive ? '+' : '-'}Rs. {Number(t.amount || 0).toFixed(2)}
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Invoices List */}
                    <div className="bg-white rounded-2xl border border-gray-200/90 overflow-hidden shadow-2xs">
                      <div className="p-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                        <h4 className="font-bold text-xs text-slate-800">Shift Invoices ({invs.length})</h4>
                        {splitCount > 0 && (
                          <span className="text-[11px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full">
                            {splitCount} Split Tender Bills
                          </span>
                        )}
                      </div>
                      <div className="max-h-64 overflow-y-auto">
                        <table className="w-full text-left text-xs whitespace-nowrap">
                          <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] tracking-wider border-b border-gray-200 sticky top-0">
                            <tr>
                              <th className="p-2.5 pl-4">Invoice #</th>
                              <th className="p-2.5">Time</th>
                              <th className="p-2.5">Payment Method</th>
                              <th className="p-2.5 text-right pr-4">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 text-slate-700">
                            {invs.length === 0 ? (
                              <tr>
                                <td colSpan={4} className="p-6 text-center text-gray-400 font-medium">
                                  No invoices found for this shift.
                                </td>
                              </tr>
                            ) : (
                              invs.map((inv: any) => (
                                <tr key={inv.id} className="hover:bg-gray-50/80 transition-colors">
                                  <td className="p-2.5 pl-4 font-mono font-bold text-emerald-800">INV-{String(inv.id).padStart(4, '0')}</td>
                                  <td className="p-2.5 text-gray-500">{formatSriLankaDateTime(inv.created_at, { timeOnly: true })}</td>
                                  <td className="p-2.5">
                                    <span className="font-semibold text-slate-800">{inv.payment_method || 'CASH'}</span>
                                    {((Number(inv.cash_paid || 0) > 0 && Number(inv.card_paid || 0) > 0) || Number(inv.other_paid || 0) > 0) && (
                                      <div className="text-[10px] text-gray-500 font-mono flex gap-1.5 mt-0.5">
                                        {Number(inv.cash_paid || 0) > 0 && <span className="text-emerald-700 font-bold">Cash: {Number(inv.cash_paid).toFixed(0)}</span>}
                                        {Number(inv.card_paid || 0) > 0 && <span className="text-amber-700 font-bold">Card: {Number(inv.card_paid).toFixed(0)}</span>}
                                        {Number(inv.other_paid || 0) > 0 && <span className="text-purple-700 font-bold">Bank: {Number(inv.other_paid).toFixed(0)}</span>}
                                      </div>
                                    )}
                                  </td>
                                  <td className="p-2.5 text-right pr-4 font-mono font-black text-slate-900">
                                    Rs. {Number(inv.total || inv.total_amount || 0).toFixed(2)}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                );
              })() : null}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/60 flex items-center justify-between shrink-0">
              <p className="text-xs text-gray-400 font-medium hidden sm:block">
                Shift #{selectedShiftForDetails.id} &bull; {selectedShiftForDetails.terminal_name || selectedShiftForDetails.terminal_id}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (!shiftDetailData) return;
                    const s = shiftDetailData.session || selectedShiftForDetails;
                    const invs = shiftDetailData.invoices || [];
                    const txs = shiftDetailData.transactions || [];
                    const openCash = Number(s.opening_cash || 0);
                    const grossSales = Number(s.total_sales || 0);
                    const cashSales = Number(s.cash_sales || 0);
                    const cardSales = Number(s.card_sales || 0);
                    const bankSales = Number(s.other_sales || 0);
                    let cashIn = Number(s.cash_in || 0);
                    let cashOut = Number(s.cash_out || 0);
                    if (txs.length > 0) {
                      cashIn = txs.reduce((acc: number, t: any) => (t.type || '').toUpperCase() === 'CASH_IN' ? acc + Number(t.amount || 0) : acc, 0);
                      cashOut = txs.reduce((acc: number, t: any) => (t.type || '').toUpperCase() !== 'CASH_IN' ? acc + Number(t.amount || 0) : acc, 0);
                    }
                    const expectedCash = Number(s.expected_cash || 0) || (openCash + cashSales + cashIn - cashOut);
                    const actualCash = Number(s.actual_cash ?? s.closing_cash ?? 0);
                    const isClosed = (s.status || '').toLowerCase() === 'closed';
                    const diff = isClosed ? (actualCash - expectedCash) : 0;
                    const w = window.open('', '_blank', 'width=700,height=900');
                    if (!w) return;
                    w.document.write(`<!DOCTYPE html><html><head><title>Session Report #${s.id}</title><style>
                      body{font-family:monospace;font-size:12px;margin:24px;color:#111}
                      h1{font-size:16px;margin:0 0 4px}h2{font-size:13px;margin:16px 0 6px;border-bottom:1px solid #ccc;padding-bottom:4px}
                      .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px}
                      .box{border:1px solid #ddd;border-radius:6px;padding:10px}
                      .label{font-size:10px;color:#666;text-transform:uppercase;font-weight:bold}
                      .val{font-size:15px;font-weight:900;margin-top:2px}
                      table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:16px}
                      th{background:#f5f5f5;padding:6px 8px;text-align:left;font-size:10px;text-transform:uppercase;border-bottom:1px solid #ddd}
                      td{padding:5px 8px;border-bottom:1px solid #f0f0f0}
                      .right{text-align:right}.total{font-weight:900;font-size:13px}
                      @media print{button{display:none}}
                    </style></head><body>
                    <h1>Nova FreshMart — Session Report</h1>
                    <p style="color:#555;font-size:11px">Shift #${s.id} &bull; ${s.terminal_name || s.terminal_id} &bull; ${s.branch_name || s.branch_id} &bull; Cashier: ${s.username || 'Cashier'}</p>
                    <p style="color:#555;font-size:11px">Opened: ${s.opened_at || ''} &bull; Closed: ${s.closed_at || 'In Progress'}</p>
                    <h2>Financial Summary</h2>
                    <div class="grid">
                      <div class="box"><div class="label">Opening Float</div><div class="val">Rs. ${openCash.toFixed(2)}</div></div>
                      <div class="box"><div class="label">Gross Sales</div><div class="val">Rs. ${grossSales.toFixed(2)}</div></div>
                      <div class="box"><div class="label">Cash Sales</div><div class="val">Rs. ${cashSales.toFixed(2)}</div></div>
                      <div class="box"><div class="label">Card Sales</div><div class="val">Rs. ${cardSales.toFixed(2)}</div></div>
                      <div class="box"><div class="label">Bank/QR Sales</div><div class="val">Rs. ${bankSales.toFixed(2)}</div></div>
                      <div class="box"><div class="label">Cash In (Till Add)</div><div class="val" style="color:#16a34a">+Rs. ${cashIn.toFixed(2)}</div></div>
                      <div class="box"><div class="label">Cash Out / Expenses</div><div class="val" style="color:#dc2626">-Rs. ${cashOut.toFixed(2)}</div></div>
                      <div class="box"><div class="label">Expected Till</div><div class="val">Rs. ${expectedCash.toFixed(2)}</div></div>
                      <div class="box"><div class="label">Closing Count</div><div class="val">${isClosed ? 'Rs. ' + actualCash.toFixed(2) : 'In Progress'}</div></div>
                      <div class="box" style="border-color:${Math.abs(diff)<0.01?'#16a34a':diff>0?'#d97706':'#dc2626'}"><div class="label">Discrepancy</div><div class="val" style="color:${Math.abs(diff)<0.01?'#16a34a':diff>0?'#d97706':'#dc2626'}">${!isClosed?'—':Math.abs(diff)<0.01?'Balanced':diff>0?'+Rs. '+diff.toFixed(2):'-Rs. '+Math.abs(diff).toFixed(2)}</div></div>
                    </div>
                    ${txs.length > 0 ? `
                    <h2>Cash Movements (${txs.length})</h2>
                    <table><thead><tr><th>Type</th><th>Time</th><th>Notes</th><th class="right">Amount (Rs)</th></tr></thead><tbody>
                    ${txs.map((t: any) => `<tr><td style="font-weight:bold;color:${(t.type||'').toUpperCase()==='CASH_IN'?'#16a34a':'#dc2626'}">${(t.type||'').replace('_',' ')}</td><td>${t.created_at||''}</td><td>${t.notes||'—'}</td><td class="right total">${(t.type||'').toUpperCase()==='CASH_IN'?'+':'-'}Rs. ${Number(t.amount||0).toFixed(2)}</td></tr>`).join('')}
                    </tbody></table>
                    ` : ''}
                    <h2>Invoices (${invs.length})</h2>
                    <table><thead><tr><th>Invoice #</th><th>Time</th><th>Payment</th><th class="right">Total (Rs)</th></tr></thead><tbody>
                    ${invs.map((inv: any) => `<tr><td>INV-${String(inv.id).padStart(4,'0')}</td><td>${inv.created_at||''}</td><td>${inv.payment_method||'CASH'}</td><td class="right total">Rs. ${Number(inv.total||inv.total_amount||0).toFixed(2)}</td></tr>`).join('')}
                    </tbody></table>
                    <br/><button onclick="window.print()" style="padding:8px 20px;background:#1e293b;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px">🖨 Print / Save as PDF</button>
                    </body></html>`);
                    w.document.close();
                  }}
                  className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl cursor-pointer transition-colors shadow-sm"
                >
                  <Printer size={15} />
                  Print / PDF
                </button>
                <button
                  onClick={() => { setSelectedShiftForDetails(null); setShiftDetailData(null); }}
                  className="flex items-center gap-2 px-6 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold text-sm rounded-xl cursor-pointer transition-colors shadow-sm"
                >
                  <X size={15} />
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
