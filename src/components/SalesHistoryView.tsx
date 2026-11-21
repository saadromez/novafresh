import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Search, Printer, Trash2, Calendar, Filter, Lock, Shield, ArrowLeft, Key, X, RefreshCw, Building2, Edit3, Save, Plus, Minus, ShoppingBag } from 'lucide-react';
import { Invoice } from './Invoice';
import { isAgentRunning, printReceiptViaAgent } from '../lib/printAgent';
import { formatSriLankaDateTime, formatReceiptDate } from '../utils/dateUtils';

export default function SalesHistoryView({ currentUser, onClose }: any) {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [period, setPeriod] = useState('week');
  const [searchTerm, setSearchTerm] = useState('');
  const [branches, setBranches] = useState<any[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('ALL');
  const [terminals, setTerminals] = useState<any[]>([]);
  const [selectedTerminal, setSelectedTerminal] = useState<string>('ALL');
  const [productsCatalog, setProductsCatalog] = useState<any[]>([]);
  
  const [receiptData, setReceiptData] = useState<any>(null);

  // Edit Invoice State (Admin / Manager)
  const [editingInvoice, setEditingInvoice] = useState<any>(null);
  const [editItems, setEditItems] = useState<any[]>([]);
  const [productSearch, setProductSearch] = useState<string>('');
  const [showProductDropdown, setShowProductDropdown] = useState<boolean>(false);
  const [editForm, setEditForm] = useState({
    payment_method: 'Cash',
    customer_name: '',
    customer_phone: '',
    cashier: '',
    discount: 0,
    total: 0
  });
  const [editSaving, setEditSaving] = useState(false);

  // Supervisor PIN Gate for Cashiers
  const userRole = (currentUser?.role || '').toLowerCase();
  const isAdmin = userRole === 'admin' || userRole === 'manager';
  const isPrivileged = isAdmin || (currentUser?.permissions && currentUser.permissions.includes('View Invoices'));
  const [authorizedBySupervisor, setAuthorizedBySupervisor] = useState(false);
  const [authorizerName, setAuthorizerName] = useState<string>('');
  const [supervisorPin, setSupervisorPin] = useState('');
  const [supervisorError, setSupervisorError] = useState('');
  const [supervisorLoading, setSupervisorLoading] = useState(false);

  const getInvoker = () => {
    // @ts-ignore
    return window.ipcRenderer?.invoke || window.db?.invoke || window.ipcRenderer?.sendSync;
  };

  const handleVerifySupervisor = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!supervisorPin) {
      setSupervisorError('Please enter a supervisor PIN.');
      return;
    }
    setSupervisorLoading(true);
    setSupervisorError('');
    try {
      const invoker = getInvoker();
      const res = await invoker('verify-pin', { pin: supervisorPin });
      if (res?.success && res.user) {
        const role = (res.user.role || '').toLowerCase();
        const perms = typeof res.user.permissions === 'string' ? JSON.parse(res.user.permissions) : (res.user.permissions || []);
        if (role === 'admin' || role === 'manager' || role === 'supervisor' || perms.includes('View Invoices')) {
          setAuthorizedBySupervisor(true);
          setAuthorizerName(`${res.user.username} (${res.user.role})`);
        } else {
          setSupervisorError(`User "${res.user.username}" (${res.user.role}) does not have manager/admin authorization rights.`);
        }
      } else {
        setSupervisorError(res?.error || 'Invalid PIN entered.');
      }
    } catch (err: any) {
      setSupervisorError(err?.message || 'Verification failed.');
    } finally {
      setSupervisorLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
    loadBranches();
    loadTerminals();
    loadProductsCatalog();

    const handler = () => {
      loadHistory();
    };
    // @ts-ignore
    if (window.ipcRenderer?.on) {
      // @ts-ignore
      window.ipcRenderer.on('invoice-updated', handler);
      // @ts-ignore
      window.ipcRenderer.on('invoice-deleted', handler);
      // @ts-ignore
      window.ipcRenderer.on('database-section-reset', handler);
      // @ts-ignore
      window.ipcRenderer.on('sync-data-updated', handler);
    }
    return () => {
      // @ts-ignore
      if (window.ipcRenderer?.off) {
        // @ts-ignore
        window.ipcRenderer.off('invoice-updated', handler);
        // @ts-ignore
        window.ipcRenderer.off('invoice-deleted', handler);
        // @ts-ignore
        window.ipcRenderer.off('database-section-reset', handler);
        // @ts-ignore
        window.ipcRenderer.off('sync-data-updated', handler);
      }
    };
  }, []);

  useEffect(() => {
    loadHistory();
  }, [period, selectedBranch, selectedTerminal]);

  const loadBranches = async () => {
    try {
      // @ts-ignore
      if (window.db?.getBranches) {
        // @ts-ignore
        const b = await window.db.getBranches();
        setBranches(b || []);
      }
    } catch (_) {}
  };

  const loadTerminals = async () => {
    try {
      // @ts-ignore
      if (window.db?.getTerminals) {
        // @ts-ignore
        const t = await window.db.getTerminals();
        setTerminals(t || []);
      }
    } catch (_) {}
  };

  const loadProductsCatalog = async () => {
    try {
      const invoker = getInvoker();
      // @ts-ignore
      const prods = await (window.db?.getProducts ? window.db.getProducts() : invoker('get-products'));
      if (Array.isArray(prods)) setProductsCatalog(prods);
    } catch (_) {}
  };

  const loadSettings = async () => {
    try {
      const invoker = getInvoker();
      const res = await invoker('get-settings');
      setSettings(res || {});
    } catch (_) {}
  };

  const handleSyncRefresh = async () => {
    setSyncing(true);
    try {
      // @ts-ignore
      if (window.db?.syncNow) {
        // @ts-ignore
        await window.db.syncNow();
      }
      await loadBranches();
      await loadTerminals();
      await loadHistory();
    } catch (e) {
      console.warn('Sync failed:', e);
    } finally {
      setSyncing(false);
    }
  };

  const loadHistory = async () => {
    setLoading(true);
    const toLocalYMD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    let start = new Date();
    let end = new Date();
    start.setHours(0,0,0,0);
    end.setHours(23,59,59,999);
    
    let isAllPeriod = false;
    if (period === 'yesterday') {
      start.setDate(start.getDate() - 1);
      end.setDate(end.getDate() - 1);
    } else if (period === '3days') {
      start.setDate(start.getDate() - 2);
    } else if (period === 'week') {
      start.setDate(start.getDate() - 7);
    } else if (period === 'month') {
      start.setDate(1);
    } else if (period === 'all') {
      isAllPeriod = true;
    }

    try {
      const invoker = getInvoker();
      const payload: any = {
        branchId: selectedBranch,
        terminalId: selectedTerminal
      };
      if (isAllPeriod) {
        payload.startDate = 'ALL';
      } else {
        payload.startDate = `${toLocalYMD(start)} 00:00:00`;
        payload.endDate = `${toLocalYMD(end)} 23:59:59`;
      }

      const res = await invoker('get-analytics-by-date', payload);
      let list = res?.invoices || [];
      if (list.length === 0 && (isAllPeriod || (period === 'all' || period === 'week'))) {
        // Fallback to getInvoices if analytics returned empty
        // @ts-ignore
        const fallback = await (window.db?.getInvoices ? window.db.getInvoices() : invoker('get-invoices'));
        if (Array.isArray(fallback) && fallback.length > 0) {
          list = fallback;
        }
      }
      setInvoices(list);
    } catch (_) {}
    setLoading(false);
  };

  const handleDelete = async (id: number) => {
    if (!isAdmin) {
      alert('Security Restriction: Only System Administrators and Managers can permanently delete or void invoices.');
      return;
    }
    if (!confirm('Permanently delete this invoice across all devices and cloud? This cannot be undone.')) return;
    const restoreStock = confirm('Restore items back to inventory?\n\nOK = Restore stock\nCancel = Do not restore (damage/loss)');
    try {
      const invoker = getInvoker();
      await invoker('delete-invoice', { id, restoreStock });
      await loadHistory();
    } catch (e: any) {
      alert('Error deleting invoice: ' + (e?.message || e));
    }
  };

  const handleOpenEdit = (inv: any) => {
    let parsed: any[] = [];
    try {
      parsed = typeof inv.items === 'string' ? JSON.parse(inv.items || '[]') : (inv.items || []);
    } catch (_) {}

    const mappedItems = parsed.map((it: any, idx: number) => ({
      _uid: `${idx}_${Date.now()}_${Math.random()}`,
      id: Number(it.id || it.product_id || 0),
      name: it.name || it.product_name || 'Item',
      variantId: it.variantId || it.variant_id || null,
      price: Number(it.price || it.unit_price || 0),
      quantity: Number(it.quantity || it.qty || 1),
      discount: Number(it.discount || 0),
      unit: it.unit || 'pc'
    }));

    setEditingInvoice(inv);
    setEditItems(mappedItems);
    setProductSearch('');
    setShowProductDropdown(false);
    setEditForm({
      payment_method: inv.payment_method || 'Cash',
      customer_name: inv.customer_name || '',
      customer_phone: inv.customer_phone || '',
      cashier: inv.cashier || 'Cashier',
      discount: Number(inv.discount || 0),
      total: Number(inv.total || 0)
    });
  };

  const handleUpdateItemQty = (uid: string, delta: number) => {
    setEditItems(prev => prev.map(item => {
      if (item._uid === uid) {
        const newQty = Math.max(1, Number(item.quantity || 1) + delta);
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  const handleUpdateItemField = (uid: string, field: string, val: any) => {
    setEditItems(prev => prev.map(item => {
      if (item._uid === uid) {
        return { ...item, [field]: val };
      }
      return item;
    }));
  };

  const handleRemoveItem = (uid: string) => {
    setEditItems(prev => prev.filter(item => item._uid !== uid));
  };

  const handleAddProductToEdit = (prod: any) => {
    const newItem = {
      _uid: `add_${Date.now()}_${Math.random()}`,
      id: prod.id,
      name: prod.name,
      variantId: null,
      price: Number(prod.price || prod.retail_price || 0),
      quantity: 1,
      discount: 0,
      unit: prod.unit || 'pc'
    };
    setEditItems(prev => [...prev, newItem]);
    setProductSearch('');
    setShowProductDropdown(false);
  };

  const handleAddCustomItem = () => {
    const newItem = {
      _uid: `custom_${Date.now()}_${Math.random()}`,
      id: 0,
      name: 'Custom Billed Item',
      variantId: null,
      price: 100,
      quantity: 1,
      discount: 0,
      unit: 'pc'
    };
    setEditItems(prev => [...prev, newItem]);
  };

  const editItemsSubtotal = editItems.reduce((acc, it) => acc + (Number(it.price || 0) * Number(it.quantity || 0)), 0);
  const editItemsDiscounts = editItems.reduce((acc, it) => acc + Number(it.discount || 0), 0);
  const editNetTotal = Math.max(0, editItemsSubtotal - editItemsDiscounts - Number(editForm.discount || 0));

  const handleSaveEdit = async (e: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editingInvoice) return;
    if (editItems.length === 0) {
      if (!confirm('This invoice has no items. Save empty invoice?')) return;
    }
    setEditSaving(true);
    try {
      const invoker = getInvoker();
      const res = await invoker('update-invoice', {
        id: editingInvoice.id,
        items: editItems.map(it => ({
          id: it.id,
          product_id: it.id,
          name: it.name,
          variantId: it.variantId,
          price: Number(it.price || 0),
          quantity: Number(it.quantity || 0),
          discount: Number(it.discount || 0),
          unit: it.unit || 'pc',
          total: (Number(it.price || 0) * Number(it.quantity || 0)) - Number(it.discount || 0)
        })),
        payment_method: editForm.payment_method,
        customer_name: editForm.customer_name,
        customer_phone: editForm.customer_phone,
        cashier: editForm.cashier,
        subtotal: editItemsSubtotal,
        discount: editItemsDiscounts + Number(editForm.discount || 0),
        total: editNetTotal
      });
      if (res?.success) {
        alert('Invoice updated successfully across all terminals and inventory adjusted!');
        setEditingInvoice(null);
        await loadHistory();
      } else {
        alert(res?.error || 'Failed to update invoice');
      }
    } catch (err: any) {
      alert('Error updating invoice: ' + (err?.message || err));
    } finally {
      setEditSaving(false);
    }
  };

  const handlePrint = (inv: any) => {
    let items = [];
    try {
      items = typeof inv.items === 'string' ? JSON.parse(inv.items || '[]') : (inv.items || []);
    } catch (e) {}
    
    setReceiptData({
      invoiceNo: inv.invoice_no || inv.remote_id || `INV-${inv.id}`,
      total: inv.total,
      subtotal: inv.subtotal || (inv.total + (inv.discount || 0)),
      discount: inv.discount || 0,
      method: inv.payment_method,
      payment_method: inv.payment_method,
      change: inv.change_returned || 0,
      items,
      createdAt: inv.created_at,
      date: inv.created_at,
      sale_type: inv.sale_type,
      saleType: inv.sale_type,
      parent_invoice_id: inv.parent_invoice_id,
      parent_invoice_no: inv.parent_invoice_id ? `INV-${inv.parent_invoice_id}` : null,
      branch: inv.branch_name || inv.branch_id || 'Main Branch',
      terminal: inv.terminal_name || inv.terminal_id || 'Terminal 1',
      cashier: inv.cashier || 'Cashier'
    });
  };

  const cleanSearch = searchTerm.replace(/^(INV-?|0+)/i, '').toLowerCase();
  const filtered = invoices.filter(inv => {
    const matchesSearch = 
      (inv.id && inv.id.toString().includes(cleanSearch)) || 
      (inv.invoice_no && inv.invoice_no.toLowerCase().includes(cleanSearch)) ||
      (inv.remote_id && inv.remote_id.toLowerCase().includes(cleanSearch)) ||
      (inv.payment_method || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (inv.cashier || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (inv.terminal_id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (inv.terminal_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (inv.branch_id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (inv.branch_name || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesTerminal = selectedTerminal === 'ALL' || String(inv.terminal_id || 'TERM-01').trim().toLowerCase() === selectedTerminal.trim().toLowerCase();
    const matchesBranch = selectedBranch === 'ALL' || String(inv.branch_id || 'BR-MAIN').trim().toLowerCase() === selectedBranch.trim().toLowerCase();
    return matchesSearch && matchesTerminal && matchesBranch;
  });

  const handleRefund = (id: number) => {
    window.dispatchEvent(new CustomEvent('navigate', { detail: 'refunds' }));
  };

  // Restrict cashiers from viewing invoices without Supervisor/Manager/Admin PIN
  if (!isPrivileged && !authorizedBySupervisor) {
    return (
      <div className="h-full flex items-center justify-center p-6 bg-slate-50">
        <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-emerald-100 flex flex-col items-center text-center animate-in fade-in zoom-in-95 duration-150">
          <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mb-4 shadow-sm">
            <Lock size={32} />
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Supervisor Authorization</h2>
          <p className="text-xs font-medium text-slate-500 mt-2 mb-6">
            Cashier account <span className="font-bold text-slate-800 underline">{currentUser?.username || 'Cashier'}</span> is restricted from viewing past sales history. Please enter a Manager or Admin PIN to authorize access.
          </p>

          {supervisorError && (
            <div className="w-full p-3 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs font-bold mb-4">
              {supervisorError}
            </div>
          )}

          <form onSubmit={handleVerifySupervisor} className="w-full space-y-4">
            <div className="relative">
              <input
                type="password"
                placeholder="Enter Supervisor PIN"
                value={supervisorPin}
                onChange={e => setSupervisorPin(e.target.value)}
                className="w-full text-center text-2xl tracking-[0.4em] font-mono font-black py-3 px-4 border-2 border-slate-200 rounded-2xl outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10"
                autoFocus
              />
            </div>

            {/* Quick Numeric Keypad */}
            <div className="grid grid-cols-3 gap-2 pt-2">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setSupervisorPin(prev => prev + num)}
                  className="py-3 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 font-black text-lg rounded-xl transition-all"
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setSupervisorPin('')}
                className="py-3 bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs rounded-xl"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setSupervisorPin(prev => prev + '0')}
                className="py-3 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 font-black text-lg rounded-xl transition-all"
              >
                0
              </button>
              <button
                type="button"
                onClick={() => setSupervisorPin(prev => prev.slice(0, -1))}
                className="py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
              >
                ⌫ Del
              </button>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  if (onClose) onClose();
                  else window.dispatchEvent(new CustomEvent('navigate', { detail: 'pos' }));
                }}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
              >
                Return to POS
              </button>
              <button
                type="submit"
                disabled={supervisorLoading || !supervisorPin}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-lg shadow-emerald-600/30 disabled:opacity-50"
              >
                {supervisorLoading ? 'Verifying...' : 'Authorize View'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#FAFAFA] p-6 h-full flex flex-col relative">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 shrink-0">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-black text-brand-dark tracking-tight">Sales History</h2>
            {authorizerName && (
              <span className="bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full text-xs font-bold border border-emerald-200">
                Authorized by: {authorizerName}
              </span>
            )}
          </div>
          <p className="text-xs font-medium text-gray-500 mt-1">View, reprint, or filter invoices by terminal & cashier.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          {/* Branch Filter Selector */}
          <select 
            className="bg-white border border-gray-200 rounded-xl px-3 py-2 font-bold text-xs outline-none focus:border-brand-primary cursor-pointer shadow-xs text-slate-800" 
            value={selectedBranch} 
            onChange={(e) => {
              setSelectedBranch(e.target.value);
              setSelectedTerminal('ALL');
            }}
          >
            <option value="ALL">🏢 All Branches</option>
            {branches.map(b => (
              <option key={b.id} value={b.id}>{b.name} ({b.id})</option>
            ))}
          </select>

          {/* Terminal Filter Selector */}
          <select 
            className="bg-white border border-gray-200 rounded-xl px-3 py-2 font-bold text-xs outline-none focus:border-brand-primary cursor-pointer shadow-xs text-slate-800" 
            value={selectedTerminal} 
            onChange={(e) => setSelectedTerminal(e.target.value)}
          >
            <option value="ALL">💻 All Terminals</option>
            {terminals
              .filter(t => selectedBranch === 'ALL' || !t.branch_id || t.branch_id === selectedBranch)
              .map(t => (
                <option key={t.id} value={t.id}>{t.name} ({t.id})</option>
              ))}
          </select>

          <button
            type="button"
            onClick={handleSyncRefresh}
            disabled={syncing}
            className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 px-3 py-2 rounded-xl font-bold text-xs cursor-pointer flex items-center gap-1.5 transition-all shadow-2xs disabled:opacity-50"
            title="Fetch live cross-branch invoices from cloud"
          >
            <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
            <span>{syncing ? 'Syncing...' : 'Sync Cloud'}</span>
          </button>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input type="text" placeholder="Search INV, branch, cashier..." className="pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold w-52 outline-none focus:border-brand-primary" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>

          <select className="bg-white border border-gray-200 rounded-xl px-3 py-2 font-bold text-xs outline-none cursor-pointer text-slate-800" value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="3days">Last 3 Days</option>
            <option value="week">Last 7 Days</option>
            <option value="month">This Month</option>
            <option value="all">All Time</option>
          </select>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3.5 py-2 rounded-xl font-bold text-xs cursor-pointer flex items-center gap-1.5 transition-all shadow-2xs border border-slate-200"
              title="Close Invoices"
            >
              <X size={15} />
              <span>Close</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 bg-white border border-gray-200 rounded-2xl overflow-hidden flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-gray-50 text-gray-500 font-bold border-b border-gray-200 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3.5">Invoice No</th>
                <th className="px-5 py-3.5">Date & Time</th>
                <th className="px-5 py-3.5">Branch</th>
                <th className="px-5 py-3.5">Terminal</th>
                <th className="px-5 py-3.5">Cashier</th>
                <th className="px-5 py-3.5">Method</th>
                <th className="px-5 py-3.5 text-right">Total (Rs)</th>
                <th className="px-5 py-3.5 text-center">Status / Type</th>
                <th className="px-5 py-3.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-xs">
              {filtered.map(inv => (
                <tr key={inv.id || inv.remote_id} className="hover:bg-brand-primary/5 transition-colors">
                  <td className="px-5 py-3.5 font-bold text-brand-dark font-mono">
                    {inv.invoice_no || `${inv.sale_type === 'REFUND' ? 'REF' : (inv.sale_type === 'EXCHANGE' ? 'EXC' : 'INV')}-${inv.id}`}
                  </td>
                  <td className="px-5 py-3.5 font-mono text-[11px] text-gray-500">{formatSriLankaDateTime(inv.created_at)}</td>
                  <td className="px-5 py-3.5">
                    <span className="bg-blue-50 text-blue-900 border border-blue-200 font-mono font-bold px-2 py-0.5 rounded text-[10px]">
                      {inv.branch_name || inv.branch_id || 'BR-MAIN'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="bg-amber-50 text-amber-900 border border-amber-200 font-mono font-bold px-2 py-0.5 rounded text-[10px]">
                      {inv.terminal_name || inv.terminal_id || 'TERM-01'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 font-bold text-slate-800">
                    {inv.cashier || 'Cashier'}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="bg-gray-100 text-gray-600 px-2.5 py-0.5 rounded-full text-[11px] font-bold">{inv.payment_method}</span>
                  </td>
                  <td className="px-5 py-3.5 font-black text-right font-mono text-slate-900">Rs. {(inv.total || 0).toLocaleString()}</td>
                  <td className="px-5 py-3.5 text-center">
                    {inv.sale_type === 'REFUND' || Number(inv.total) < 0 ? (
                      <div className="flex flex-col items-center">
                        <span className="bg-rose-100 text-rose-700 border border-rose-200 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider">Refund</span>
                        {inv.parent_invoice_id && <span className="text-[9px] text-gray-400 font-bold mt-0.5">For INV-{inv.parent_invoice_id}</span>}
                      </div>
                    ) : inv.sale_type === 'EXCHANGE' ? (
                      <div className="flex flex-col items-center">
                        <span className="bg-amber-100 text-amber-800 border border-amber-200 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider">Exchange</span>
                        {inv.parent_invoice_id && <span className="text-[9px] text-gray-400 font-bold mt-0.5">For INV-{inv.parent_invoice_id}</span>}
                      </div>
                    ) : (
                      <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider">Sale</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex justify-center gap-2">
                      <button onClick={() => handlePrint(inv)} title="View / Print" className="p-1.5 text-gray-400 hover:text-brand-primary hover:bg-brand-primary/10 rounded-xl transition-colors cursor-pointer"><Printer size={15} /></button>
                      <button onClick={() => handleRefund(inv.id)} title="Refund / Exchange" className="p-1.5 text-gray-400 hover:text-amber-500 hover:bg-amber-50 rounded-xl transition-colors cursor-pointer">
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
                      </button>
                      {isAdmin && (
                        <button onClick={() => handleOpenEdit(inv)} title="Edit Invoice Details" className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors cursor-pointer"><Edit3 size={15} /></button>
                      )}
                      {isAdmin && (
                        <button onClick={() => handleDelete(inv.id)} title="Delete Invoice (Admin Only)" className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"><Trash2 size={15} /></button>
                      )}
                    </div>
                    </td>
                  </tr>
                ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-gray-400 font-medium">No sales found for this period.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {receiptData && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm print:hidden">
          <div className="bg-white rounded-3xl p-8 shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-brand-dark text-xl">Print Receipt</h3>
              <button onClick={() => setReceiptData(null)} className="text-gray-400 hover:text-red-500"><Trash2 size={24} className="opacity-0 hidden" /><span className="text-xl leading-none">&times;</span></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <Invoice 
                sale={{ 
                  id: receiptData.invoiceNo, 
                  invoice_no: receiptData.invoiceNo, 
                  created_at: receiptData.createdAt, 
                  total: receiptData.total, 
                  subtotal: receiptData.subtotal, 
                  discount: receiptData.discount,
                  branch: receiptData.branch,
                  terminal: receiptData.terminal,
                  cashier: receiptData.cashier
                }} 
                items={receiptData.items} 
                paymentMethod={receiptData.method} 
                amountPaid={receiptData.total} 
                settings={settings}
              />
            </div>
            <div className="mt-6 flex gap-3 shrink-0 border-t border-gray-100 pt-6">
              <button onClick={() => setReceiptData(null)} className="flex-1 py-3 rounded-xl font-bold bg-gray-100 text-gray-500 hover:bg-gray-200">Close</button>
              <button onClick={async () => {
                const isUp = await isAgentRunning();
                if (isUp) {
                  const payload = {
                    saleType: receiptData.sale_type?.toLowerCase() || 'sale', 
                    invoiceNo: receiptData.invoiceNo,
                    storeName: settings.storeName || 'Nova FreshMart',
                    storeAddress: settings.tagline || '',
                    storePhone: settings.phone || '',
                    customerName: receiptData.customer?.name || 'Walk-in',
                    cashier: currentUser?.username || 'Admin',
                    paymentMethod: receiptData.method || 'Cash',
                    createdAt: formatReceiptDate(receiptData.createdAt || receiptData.date || new Date()),
                    subtotal: Number(receiptData.subtotal || 0),
                    discount: Number(receiptData.discount || 0),
                    tax: 0,
                    total: Number(receiptData.total || 0),
                    paid: receiptData.method === 'Cash' ? Number(receiptData.total || 0) + Number(receiptData.change || 0) : Number(receiptData.total || 0),
                    change: Number(receiptData.change || 0),
                    balance: 0, 
                    footerText: settings.footerMsg || 'Thank you for shopping with us!',
                    logoUrl: settings.invoiceLogo,
                    barcodeData: receiptData.invoiceNo,
                    items: (receiptData.items || []).map((i: any) => ({
                      name: (i.product_name || i.name || 'Item') + (i.size ? ' (' + i.size + ')' : ''),
                      qty: Number(i.quantity || 1),
                      price: Number(i.price || 0),
                      lineTotal: Number(i.total || (i.price * i.quantity) || 0)
                    }))
                  };
                  const res = await printReceiptViaAgent(payload);
                  if (res.ok) {
                    alert('Receipt reprinted via C# Print Agent!');
                    setReceiptData(null);
                    return;
                  }
                }

                const html = document.getElementById('hidden-receipt-container')?.innerHTML || '';
                const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]')).map(el => el.outerHTML).join('\n');
                // @ts-ignore
                if (settings.printerName && window.ipcRenderer && html) {
                  // @ts-ignore
                  window.ipcRenderer.invoke('print-invoice', { printerName: settings.printerName, html, styles }).catch(()=>window.print());
                } else { window.print(); }
              }} className="flex-1 py-3 rounded-xl font-bold bg-brand-primary text-white shadow-lg shadow-brand-primary/30 hover:bg-brand-secondary">
                Print
              </button>
            </div>
          </div>
        </div>
      )}

      {receiptData && createPortal(
        <div className="print-only" id="hidden-receipt-container">
          <Invoice 
            sale={{ 
              id: receiptData.invoiceNo, 
              invoice_no: receiptData.invoiceNo, 
              created_at: receiptData.createdAt, 
              total: receiptData.total, 
              subtotal: receiptData.subtotal, 
              discount: receiptData.discount
            }} 
            items={receiptData.items} 
            paymentMethod={receiptData.method} 
            amountPaid={receiptData.total} 
            settings={settings}
          />
        </div>,
        document.body
      )}
      {/* Full Supermarket Edit Invoice Modal */}
      {editingInvoice && (
        <div className="fixed inset-0 bg-black/60 z-[110] flex items-center justify-center p-3 sm:p-5 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-4xl w-full p-5 sm:p-6 shadow-2xl border border-blue-100 flex flex-col my-auto max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex justify-between items-center pb-4 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  <Edit3 size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-black text-slate-900 text-lg">Edit Invoice</h3>
                    <span className="bg-blue-100 text-blue-800 font-mono font-bold px-2 py-0.5 rounded text-xs">
                      {editingInvoice.invoice_no || `INV-${editingInvoice.id}`}
                    </span>
                    {editingInvoice.sale_type && (
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                        editingInvoice.sale_type === 'REFUND' ? 'bg-red-100 text-red-700' :
                        editingInvoice.sale_type === 'EXCHANGE' ? 'bg-amber-100 text-amber-800' :
                        'bg-emerald-100 text-emerald-800'
                      }`}>
                        {editingInvoice.sale_type}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 font-medium">
                    Branch: <span className="font-bold text-gray-700">{editingInvoice.branch_name || editingInvoice.branch_id || 'Main'}</span> • 
                    Terminal: <span className="font-bold text-gray-700">{editingInvoice.terminal_name || editingInvoice.terminal_id || 'TERM-01'}</span> • 
                    Time: <span className="font-bold text-gray-700">{formatSriLankaDateTime(editingInvoice.created_at)}</span>
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setEditingInvoice(null)} 
                className="w-8 h-8 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 flex items-center justify-center cursor-pointer transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Content Body (Scrollable) */}
            <div className="flex-1 overflow-y-auto py-4 space-y-4 text-xs pr-1">
              
              {/* Add Product Search & Custom Item bar */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
                <div className="flex flex-col sm:flex-row gap-2 relative">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                    <input
                      type="text"
                      placeholder="Search product to add (by name, code, barcode)..."
                      value={productSearch}
                      onChange={e => {
                        setProductSearch(e.target.value);
                        setShowProductDropdown(true);
                      }}
                      onFocus={() => setShowProductDropdown(true)}
                      className="w-full bg-white border border-gray-200 rounded-xl py-2 pl-9 pr-4 text-xs font-medium text-slate-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                    
                    {/* Autocomplete Dropdown */}
                    {showProductDropdown && productSearch.trim().length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-52 overflow-y-auto z-50 divide-y divide-gray-100">
                        {productsCatalog
                          .filter(p => 
                            (p.name || '').toLowerCase().includes(productSearch.toLowerCase()) || 
                            (p.barcode || '').toLowerCase().includes(productSearch.toLowerCase()) ||
                            (p.item_code || '').toLowerCase().includes(productSearch.toLowerCase())
                          )
                          .slice(0, 10)
                          .map(p => (
                            <div 
                              key={p.id}
                              onClick={() => handleAddProductToEdit(p)}
                              className="p-2.5 hover:bg-blue-50/80 cursor-pointer flex justify-between items-center transition-colors"
                            >
                              <div>
                                <p className="font-bold text-slate-800 text-xs">{p.name}</p>
                                <p className="text-[10px] text-gray-400 font-mono">Barcode: {p.barcode || p.item_code || 'N/A'} • Stock: {p.stock || 0} {p.unit || 'pc'}</p>
                              </div>
                              <div className="text-right">
                                <span className="font-black text-blue-600 font-mono text-xs">Rs. {Number(p.price || 0).toFixed(2)}</span>
                                <span className="block text-[9px] text-emerald-600 font-bold">+ Add to Bill</span>
                              </div>
                            </div>
                          ))}
                        {productsCatalog.filter(p => (p.name || '').toLowerCase().includes(productSearch.toLowerCase())).length === 0 && (
                          <div className="p-3 text-center text-gray-400">No matching product found in catalog.</div>
                        )}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleAddCustomItem}
                    className="px-3 py-2 bg-white border border-gray-300 hover:border-blue-400 text-slate-700 rounded-xl font-bold flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer"
                  >
                    <Plus size={14} className="text-blue-600" />
                    <span>Add Custom Item</span>
                  </button>
                </div>
              </div>

              {/* Items Table */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-xs">
                <div className="bg-slate-100/80 px-4 py-2 border-b border-slate-200 flex justify-between items-center font-bold text-slate-700 text-[11px]">
                  <span>INVOICE ITEMS ({editItems.length})</span>
                  <span>Adjust Quantities, Prices, or Remove Items</span>
                </div>
                <div className="max-h-60 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-gray-400 font-bold text-[10px] uppercase bg-slate-50/50">
                        <th className="py-2 px-3">Item Description</th>
                        <th className="py-2 px-3 w-28">Price (Rs.)</th>
                        <th className="py-2 px-3 w-32 text-center">Qty</th>
                        <th className="py-2 px-3 w-24">Discount</th>
                        <th className="py-2 px-3 w-28 text-right">Total (Rs.)</th>
                        <th className="py-2 px-3 w-10 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {editItems.map((item) => {
                        const lineTotal = (Number(item.price || 0) * Number(item.quantity || 0)) - Number(item.discount || 0);
                        return (
                          <tr key={item._uid} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-2 px-3 font-bold text-slate-800">
                              <input
                                type="text"
                                value={item.name}
                                onChange={e => handleUpdateItemField(item._uid, 'name', e.target.value)}
                                className="w-full bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 font-bold text-slate-800 outline-none"
                              />
                            </td>
                            <td className="py-2 px-3">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={item.price}
                                onChange={e => handleUpdateItemField(item._uid, 'price', parseFloat(e.target.value) || 0)}
                                className="w-24 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 font-mono font-bold text-slate-800 outline-none focus:border-blue-500"
                              />
                            </td>
                            <td className="py-2 px-3">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleUpdateItemQty(item._uid, -1)}
                                  className="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center justify-center font-bold cursor-pointer transition-colors"
                                >
                                  -
                                </button>
                                <input
                                  type="number"
                                  step="any"
                                  value={item.quantity}
                                  onChange={e => handleUpdateItemField(item._uid, 'quantity', parseFloat(e.target.value) || 0)}
                                  className="w-14 text-center bg-gray-50 border border-gray-200 rounded-lg py-1 font-mono font-bold text-slate-900 outline-none focus:border-blue-500"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleUpdateItemQty(item._uid, 1)}
                                  className="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center justify-center font-bold cursor-pointer transition-colors"
                                >
                                  +
                                </button>
                              </div>
                            </td>
                            <td className="py-2 px-3">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={item.discount || 0}
                                onChange={e => handleUpdateItemField(item._uid, 'discount', parseFloat(e.target.value) || 0)}
                                className="w-20 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 font-mono font-medium text-slate-800 outline-none focus:border-blue-500"
                              />
                            </td>
                            <td className={`py-2 px-3 text-right font-mono font-black ${lineTotal < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                              Rs. {lineTotal.toFixed(2)}
                            </td>
                            <td className="py-2 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(item._uid)}
                                title="Remove Item"
                                className="p-1 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {editItems.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-6 text-center text-gray-400 font-medium">
                            No items in this bill. Use the search bar above to add products.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Customer, Cashier & Payment Metadata */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-gray-50/70 p-3.5 rounded-2xl border border-gray-200">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Customer Name</label>
                  <input
                    type="text"
                    placeholder="Walk-in Customer"
                    value={editForm.customer_name}
                    onChange={e => setEditForm({ ...editForm, customer_name: e.target.value })}
                    className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 font-medium text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Customer Phone</label>
                  <input
                    type="text"
                    placeholder="077xxxxxxx"
                    value={editForm.customer_phone}
                    onChange={e => setEditForm({ ...editForm, customer_phone: e.target.value })}
                    className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 font-medium text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Cashier</label>
                  <input
                    type="text"
                    value={editForm.cashier}
                    onChange={e => setEditForm({ ...editForm, cashier: e.target.value })}
                    className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Payment Method</label>
                  <select
                    value={editForm.payment_method}
                    onChange={e => setEditForm({ ...editForm, payment_method: e.target.value })}
                    className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Cash">Cash</option>
                    <option value="Card">Card</option>
                    <option value="Credit">Credit</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Split">Split</option>
                  </select>
                </div>
              </div>

              {/* Financial Summary & Auto-Calculated Totals */}
              <div className="bg-blue-50/50 border border-blue-200/80 rounded-2xl p-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 items-center">
                  <div>
                    <span className="text-gray-500 block text-[10px] uppercase font-bold">Items Subtotal</span>
                    <span className="font-mono font-bold text-slate-800 text-sm">Rs. {editItemsSubtotal.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[10px] uppercase font-bold">Line Discounts</span>
                    <span className="font-mono font-bold text-rose-600 text-sm">- Rs. {editItemsDiscounts.toFixed(2)}</span>
                  </div>
                  <div>
                    <label className="text-gray-500 block text-[10px] uppercase font-bold mb-1">Extra Discount (Rs.)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editForm.discount}
                      onChange={e => setEditForm({ ...editForm, discount: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-white border border-gray-300 rounded-lg px-2.5 py-1 font-mono font-bold text-slate-800 outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="text-right">
                    <span className="text-blue-900 block text-[10px] uppercase font-black">Net Total Bill</span>
                    <span className="font-mono font-black text-blue-700 text-lg">Rs. {editNetTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-xl text-[11px] text-emerald-900 font-medium">
                ✓ Inventory stock for all items will be automatically updated (restored or deducted) upon saving. Changes synchronize to cloud and all terminals.
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="flex gap-3 pt-3 border-t border-gray-100 shrink-0">
              <button
                type="button"
                onClick={() => setEditingInvoice(null)}
                className="flex-1 py-2.5 rounded-xl font-bold bg-gray-100 text-gray-600 hover:bg-gray-200 cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={editSaving}
                className="flex-1 py-2.5 rounded-xl font-bold bg-blue-600 text-white shadow-lg shadow-blue-600/25 hover:bg-blue-700 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 transition-all"
              >
                <Save size={15} />
                {editSaving ? 'Saving Changes & Adjusting Stock...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
