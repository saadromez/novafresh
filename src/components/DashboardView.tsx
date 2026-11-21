import React, { useState, useEffect } from 'react';
import { 
  Package, TrendingUp, TrendingDown, DollarSign, AlertTriangle, 
  BarChart2, Users, Activity, Wallet, Monitor, Building2, 
  CheckCircle2, Clock, Shield, ArrowUpRight, ShoppingBag, Trash2, Plus, X, Printer
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { startOfDay, endOfDay, startOfWeek, startOfMonth } from 'date-fns';
import ExpiryPrintModal, { type ExpiryAlertItem } from './ExpiryPrintModal';

const formatQty = (n: number | string | undefined | null) => {
  const num = Number(n || 0);
  if (Number.isInteger(num)) return num.toString();
  return parseFloat(num.toFixed(3)).toString();
};

export default function DashboardView({ currentUser }: { currentUser: any }) {
  const [data, setData] = useState<any>(null);
  const [dateRange, setDateRange] = useState('today');
  const [isLoading, setIsLoading] = useState(true);
  const [showAddTerminalModal, setShowAddTerminalModal] = useState(false);
  const [showExpiryPrintModal, setShowExpiryPrintModal] = useState(false);
  const [newTerminal, setNewTerminal] = useState({ id: '', branch_id: 'BR-MAIN', name: '' });
  const [branchesList, setBranchesList] = useState<any[]>([]);

  useEffect(() => {
    loadDashboardData(false);
    const interval = setInterval(() => {
      loadDashboardData(true);
    }, 15000);
    return () => clearInterval(interval);
  }, [dateRange, currentUser]);

  const loadDashboardData = async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    const now = new Date();
    const formatLocalYMD = (d: Date) => {
      const yr = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, '0');
      const da = String(d.getDate()).padStart(2, '0');
      return `${yr}-${mo}-${da}`;
    };

    let startStr = formatLocalYMD(now);
    let endStr = formatLocalYMD(now);

    if (dateRange === 'today') {
      startStr = formatLocalYMD(now);
      endStr = formatLocalYMD(now);
    } else if (dateRange === 'week') {
      startStr = formatLocalYMD(startOfWeek(now));
      endStr = formatLocalYMD(now);
    } else if (dateRange === 'month') {
      startStr = formatLocalYMD(startOfMonth(now));
      endStr = formatLocalYMD(now);
    }

    try {
      // Fetch analytical data in parallel
      const [invRes, allProducts, productsAdv, allUsers, branches, terminals, sessions, syncStatus, backofficeOverview] = await Promise.all([
        // @ts-ignore
        window.ipcRenderer.invoke('get-analytics-by-date', { 
          startDate: `${startStr} 00:00:00`, 
          endDate: `${endStr} 23:59:59` 
        }),
        // @ts-ignore
        window.ipcRenderer.invoke('get-products').catch(() => []),
        // @ts-ignore
        window.ipcRenderer.invoke('get-products-advanced').catch(() => []),
        // @ts-ignore
        window.ipcRenderer.invoke('get-users').catch(() => []),
        // @ts-ignore
        window.db?.getBranches ? window.db.getBranches().catch(() => []) : Promise.resolve([]),
        // @ts-ignore
        window.db?.getTerminals ? window.db.getTerminals().catch(() => []) : Promise.resolve([]),
        // @ts-ignore
        window.db?.getAllSessions ? window.db.getAllSessions().catch(() => []) : Promise.resolve([]),
        // @ts-ignore
        window.db?.getSyncStatus ? window.db.getSyncStatus().catch(() => ({ isOnline: false })) : Promise.resolve({ isOnline: false }),
        // @ts-ignore
        window.db?.getBackofficeOverview ? window.db.getBackofficeOverview().catch(() => null) : Promise.resolve(null)
      ]);

      // Calculate 3-month (90 days) Expiry Alerts
      const todayDate = new Date();
      todayDate.setHours(0, 0, 0, 0);
      const cutoff90Days = new Date(todayDate.getTime() + 90 * 24 * 60 * 60 * 1000);
      cutoff90Days.setHours(23, 59, 59, 999);

      const expiryAlertList: ExpiryAlertItem[] = [];
      const productSource = (productsAdv && productsAdv.length > 0) ? productsAdv : (allProducts || []);

      for (const p of productSource) {
        // 1. Check main product expiry_date
        if (p.expiry_date) {
          const exp = new Date(p.expiry_date);
          if (!isNaN(exp.getTime()) && exp <= cutoff90Days) {
            exp.setHours(0, 0, 0, 0);
            const days = Math.ceil((exp.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
            expiryAlertList.push({
              id: `p-${p.id}`,
              productId: p.id,
              name: p.name,
              code: p.barcode || p.plu || p.item_code || '-',
              type: 'Product',
              detail: 'Main Product Stock',
              stock: Number(p.stock) || 0,
              unit: p.unit || 'pc',
              expiryDate: p.expiry_date,
              daysLeft: days
            });
          }
        }

        // 2. Check variants expiry_date
        for (const v of (p.variants || [])) {
          if (v.expiry_date) {
            const exp = new Date(v.expiry_date);
            if (!isNaN(exp.getTime()) && exp <= cutoff90Days) {
              exp.setHours(0, 0, 0, 0);
              const days = Math.ceil((exp.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
              expiryAlertList.push({
                id: `v-${v.id}`,
                productId: p.id,
                name: p.name,
                code: v.barcode || v.sku || p.barcode || '-',
                type: 'Variant',
                detail: [v.size, v.color].filter(Boolean).join(' / ') || v.sku || `Variant #${v.id}`,
                stock: Number(v.stock) || 0,
                unit: p.unit || 'pc',
                expiryDate: v.expiry_date,
                daysLeft: days
              });
            }
          }
        }

        // 3. Check batches expiry_date
        for (const b of (p.batches || [])) {
          if (b.expiry_date) {
            const exp = new Date(b.expiry_date);
            if (!isNaN(exp.getTime()) && exp <= cutoff90Days) {
              exp.setHours(0, 0, 0, 0);
              const days = Math.ceil((exp.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
              expiryAlertList.push({
                id: `b-${b.id}`,
                productId: p.id,
                name: p.name,
                code: p.barcode || p.plu || p.item_code || '-',
                type: 'Batch',
                detail: `Batch: ${b.batch_no}`,
                stock: Number(b.stock || b.quantity) || 0,
                unit: p.unit || 'pc',
                expiryDate: b.expiry_date,
                daysLeft: days
              });
            }
          }
        }
      }

      expiryAlertList.sort((a, b) => a.daysLeft - b.daysLeft);

      const invoices = (invRes && invRes.invoices) || [];
      const totalSales = invoices.reduce((a: number, b: any) => a + (Number(b.total) || 0), 0);
      
      let itemsSold = 0;
      let costOfGoodsSold = 0;
      const soldProductMap: Record<string, { id: any; name: string; qty: number }> = {};
      const soldProductIds = new Set<number>();
      const paymentBreakdown = { Cash: 0, Card: 0, Bank: 0, Credit: 0, Split: 0 };
      
      invoices.forEach((inv: any) => {
        // Payment Breakdown
        if (inv.split_payment) {
          paymentBreakdown.Split += Number(inv.total) || 0;
        } else {
          const method = inv.payment_method || 'Cash';
          // @ts-ignore
          paymentBreakdown[method] = (paymentBreakdown[method] || 0) + (Number(inv.total) || 0);
        }

        let items = [];
        try { 
          items = typeof inv.items === 'string' ? JSON.parse(inv.items) : (inv.items || []); 
        } catch (e) {
          items = [];
        }
        
        items.forEach((item: any) => {
          const qty = Number(item.quantity || item.qty || 1);
          itemsSold += qty;
          
          // Calculate COGS
          const prod = (allProducts || []).find((p: any) => p.id === item.id);
          if (prod) {
            costOfGoodsSold += (Number(prod.cost_price) || 0) * qty;
            soldProductIds.add(Number(prod.id));
          } else if (item.id && Number(item.id) > 0) {
            soldProductIds.add(Number(item.id));
          }

          // Use item name from invoice or catalog (fallback to 'Custom Item')
          const displayName = (item.name || prod?.name || item.title || '').trim() || 'Custom Item';
          const key = (item.id && Number(item.id) > 0)
            ? `prod_${item.id}`
            : `custom_${displayName.toLowerCase()}`;

          if (!soldProductMap[key]) {
            soldProductMap[key] = {
              id: item.id || key,
              name: displayName,
              qty: 0
            };
          }
          soldProductMap[key].qty += qty;
        });
      });

      const grossProfit = totalSales - costOfGoodsSold;
      const inventoryValue = (allProducts || []).reduce((acc: number, p: any) => acc + ((Number(p.stock) || 0) * (Number(p.cost_price) || 0)), 0);
      const retailValue = (allProducts || []).reduce((acc: number, p: any) => acc + ((Number(p.stock) || 0) * (Number(p.price) || 0)), 0);
      const remainingItems = (allProducts || []).reduce((acc: number, p: any) => acc + (Number(p.stock) || 0), 0);
      const lowStock = (allProducts || []).filter((p: any) => (Number(p.stock) || 0) <= (p.low_stock_alert !== undefined && p.low_stock_alert !== null ? Number(p.low_stock_alert) : 2));
      
      const productSales = Object.values(soldProductMap);
      productSales.sort((a, b) => b.qty - a.qty);
      const fastMoving = productSales.slice(0, 5);
      const nonMoving = (allProducts || []).filter((p: any) => !soldProductIds.has(Number(p.id)) && (Number(p.stock) || 0) > 0).slice(0, 5);

      const isAdmin = currentUser?.role?.toLowerCase() === 'admin';
      const isManager = currentUser?.role?.toLowerCase() === 'manager';
      const userPerms: string[] = Array.isArray(currentUser?.permissions) ? currentUser.permissions : [];
      const canSeeFinancialSecrets = isAdmin || isManager || userPerms.includes('Reports');

      // Merge shifts from backoffice overview and local sessions
      const allShifts: any[] = [
        ...(backofficeOverview?.shifts || []),
        ...(Array.isArray(sessions) ? sessions : [])
      ];

      // Aggregate all known users from staff accounts, active/past shifts, and billed invoices
      const userMap = new Map<string, any>();
      (allUsers || []).forEach((u: any) => {
        if (u?.username) userMap.set(u.username.toLowerCase(), { ...u });
      });

      // Include cashiers from backoffice shifts
      (allShifts || []).forEach((s: any) => {
        const name = (s.cashier_name || s.username || '').trim();
        if (name && !userMap.has(name.toLowerCase())) {
          userMap.set(name.toLowerCase(), {
            id: `emp_${name}`,
            username: name,
            role: 'Cashier',
            branch_id: s.branch_id || 'BR-MAIN',
            allowed_terminals: s.terminal_id || 'ALL'
          });
        }
      });

      // Include cashiers from invoices
      (invoices || []).forEach((inv: any) => {
        const name = (inv.cashier || '').trim();
        if (name && !userMap.has(name.toLowerCase())) {
          userMap.set(name.toLowerCase(), {
            id: `emp_${name}`,
            username: name,
            role: 'Cashier',
            branch_id: inv.branch_id || 'BR-MAIN',
            allowed_terminals: inv.terminal_id || 'ALL'
          });
        }
      });

      const combinedUsers = Array.from(userMap.values());
      // Sort: Admin first, then active cashiers by sales
      combinedUsers.sort((a, b) => {
        if (a.role === 'Admin' && b.role !== 'Admin') return -1;
        if (b.role === 'Admin' && a.role !== 'Admin') return 1;
        return a.username.localeCompare(b.username);
      });

      // Cashier and non-management user data isolation
      const visibleUsers = canSeeFinancialSecrets
        ? combinedUsers
        : combinedUsers.filter((u: any) => u.username?.toLowerCase() === (currentUser?.username || '').toLowerCase());

      // If user cannot see financial secrets, only calculate user's own invoices
      const visibleInvoices = canSeeFinancialSecrets
        ? invoices
        : invoices.filter((inv: any) => (inv.cashier || '').toLowerCase() === (currentUser?.username || '').toLowerCase());

      const userTotalSales = visibleInvoices.reduce((a: number, b: any) => a + (Number(b.total) || 0), 0);
      let userItemsSold = 0;
      visibleInvoices.forEach((inv: any) => {
        let itms = [];
        try { itms = typeof inv.items === 'string' ? JSON.parse(inv.items) : (inv.items || []); } catch(e) {}
        itms.forEach((i: any) => { userItemsSold += Number(i.quantity || i.qty || 1); });
      });

      // Real Cashier / User Performance Aggregation
      const userPerformance = visibleUsers.map((u: any) => {
        // Match cashier invoices by username
        const uInvs = invoices.filter((inv: any) => {
          if (!inv.cashier) return u.role === 'Admin' && combinedUsers.length === 1;
          return inv.cashier.toLowerCase() === u.username.toLowerCase();
        });

        const uSales = uInvs.reduce((sum: number, inv: any) => sum + (Number(inv.total) || 0), 0);
        const uBillsCount = uInvs.length;
        
        let uItems = 0;
        uInvs.forEach((inv: any) => {
          let itms = [];
          try { itms = typeof inv.items === 'string' ? JSON.parse(inv.items) : (inv.items || []); } catch(e) {}
          itms.forEach((i: any) => { uItems += Number(i.quantity || i.qty || 1); });
        });

        const avgTicket = uBillsCount > 0 ? uSales / uBillsCount : 0;
        const sharePct = totalSales > 0 ? (uSales / totalSales) * 100 : 0;

        return {
          id: u.id,
          username: u.username,
          role: u.role,
          branch_id: u.branch_id || 'ALL',
          allowed_terminals: u.allowed_terminals || 'ALL',
          sales: uSales,
          billsCount: uBillsCount,
          itemsSold: uItems,
          avgTicket,
          sharePct: Math.round(sharePct)
        };
      });

      // Real Terminal Performance Aggregation - Use backoffice live terminals if available
      const rawTerminalList = (backofficeOverview?.terminals && backofficeOverview.terminals.length > 0)
        ? backofficeOverview.terminals
        : (terminals && terminals.length > 0)
          ? terminals
          : [{ id: 'TERM-01', name: 'Touch Terminal 01', branch_id: 'BR-MAIN', status: 'online' }];

      const terminalPerformance = rawTerminalList.map((term: any) => {
        const tInvs = invoices.filter((inv: any) => {
          const tId = (inv.terminal_id || '').toLowerCase();
          const targetId = (term.id || '').toLowerCase();
          if (!tId) return targetId === 'term-01';
          return tId === targetId || (tId.replace(/\D/g, '') && tId.replace(/\D/g, '') === targetId.replace(/\D/g, ''));
        });

        const computedSales = tInvs.reduce((sum: number, inv: any) => sum + (Number(inv.total) || 0), 0);
        const computedBills = tInvs.length;

        const tSales = (dateRange === 'today' && term.today_revenue != null && computedBills === 0 && term.today_orders > 0)
          ? Number(term.today_revenue)
          : computedSales;
        const tBillsCount = (dateRange === 'today' && term.today_orders != null && computedBills === 0 && term.today_orders > 0)
          ? Number(term.today_orders)
          : computedBills;

        const avgBill = tBillsCount > 0 ? tSales / tBillsCount : 0;
        const sharePct = totalSales > 0 ? (tSales / totalSales) * 100 : 0;

        // Check active session for this terminal (checks both local sessions & remote shifts)
        const activeSession = allShifts.find((s: any) => {
          if (!s) return false;
          const sTerm = (s.terminal_id || '').toLowerCase();
          const tId = (term.id || '').toLowerCase();
          const matchId = sTerm === tId || (sTerm.replace(/\D/g, '') && sTerm.replace(/\D/g, '') === tId.replace(/\D/g, ''));
          const isOpen = (s.status || '').toLowerCase() === 'open' && !s.closed_at;
          return matchId && isOpen;
        });

        return {
          id: term.id,
          name: term.name,
          branch_id: term.branch_id,
          status: term.status || 'offline',
          is_current: term.is_current,
          last_active: term.last_active || term.last_active_at,
          hasOpenShift: !!activeSession,
          currentCashier: activeSession?.username || term.current_user || 'Idle',
          sales: tSales,
          billsCount: tBillsCount,
          avgBill,
          sharePct: Math.round(sharePct)
        };
      });

      setData({
        totalSales: canSeeFinancialSecrets ? totalSales : userTotalSales,
        grossProfit: canSeeFinancialSecrets ? grossProfit : 0,
        costOfGoodsSold: canSeeFinancialSecrets ? costOfGoodsSold : 0,
        itemsSold: canSeeFinancialSecrets ? itemsSold : userItemsSold,
        billsCount: canSeeFinancialSecrets ? invoices.length : visibleInvoices.length,
        inventoryValue: canSeeFinancialSecrets ? inventoryValue : 0,
        retailValue: canSeeFinancialSecrets ? retailValue : 0,
        remainingItems,
        lowStock: canSeeFinancialSecrets ? lowStock : [],
        fastMoving,
        nonMoving,
        productsCount: (allProducts || []).length,
        userPerformance,
        terminalPerformance: canSeeFinancialSecrets ? terminalPerformance : [],
        branchesCount: (branches && branches.length > 0) ? branches.length : 1,
        terminalsCount: rawTerminalList.length,
        usersCount: visibleUsers.length,
        syncStatus,
        isAdmin,
        isManager,
        canSeeFinancialSecrets,
        paymentBreakdown,
        expiryAlerts: expiryAlertList
      });
      setBranchesList(branches || []);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenAddTerminal = () => {
    const count = data?.terminalPerformance?.length || 1;
    const nextNum = count + 1;
    const idPad = nextNum < 10 ? `0${nextNum}` : `${nextNum}`;
    setNewTerminal({
      id: `TERM-${idPad}`,
      name: `Touch Terminal ${idPad}`,
      branch_id: branchesList?.[0]?.id || 'BR-MAIN'
    });
    setShowAddTerminalModal(true);
  };

  const handleCreateTerminal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTerminal.name.trim()) return alert('Please enter terminal name');
    if (!newTerminal.branch_id) return alert('Please select a branch');

    try {
      // @ts-ignore
      if (window.db?.createTerminal) {
        // @ts-ignore
        await window.db.createTerminal(newTerminal);
        setShowAddTerminalModal(false);
        await loadDashboardData();
      }
    } catch (err: any) {
      alert('Failed to register terminal: ' + err.message);
    }
  };

  const handleDeleteTerminal = async (termId: string, termName: string) => {
    try {
      // @ts-ignore
      if (window.db?.getTerminalConfig) {
        // @ts-ignore
        const cfg = await window.db.getTerminalConfig();
        if (cfg && cfg.current_terminal_id === termId) {
          alert(`Cannot delete terminal "${termName}" (${termId}) because it is actively used by THIS PC. Switch this machine to another terminal first.`);
          return;
        }
      }

      if (!confirm(`Are you sure you want to permanently delete POS terminal "${termName}" (${termId})?`)) return;

      // @ts-ignore
      if (window.db?.deleteTerminal) {
        // @ts-ignore
        await window.db.deleteTerminal(termId);
        await loadDashboardData();
      }
    } catch (err: any) {
      alert('Failed to delete terminal: ' + err.message);
    }
  };

  if (isLoading || !data) {
    return (
      <div className="h-full flex flex-col items-center justify-center font-bold text-gray-500 gap-3">
        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm font-black text-brand-dark animate-pulse">Loading Live Terminal & Store Metrics...</p>
      </div>
    );
  }

  const COLORS = ['#008B44', '#10B981', '#34D399', '#F97316', '#3B82F6', '#8B5CF6'];

  const salesPieData = (data?.fastMoving && data.fastMoving.length > 0)
    ? data.fastMoving.map((item: any) => ({ name: item.name, value: item.qty }))
    : [{ name: 'No Sales Yet', value: 1, isDummy: true }];

  const activeUserPerf = (data?.userPerformance || []).filter((u: any) => Number(u?.sales || 0) > 0);
  const userPieData = activeUserPerf.length > 0
    ? activeUserPerf.map((u: any) => ({ name: u.username || 'User', value: Number(u.sales) }))
    : [{ name: 'No Sales Recorded', value: 1, isDummy: true }];

  return (
    <div className="bg-[#F8FAF9] min-h-full flex flex-col p-6 overflow-y-auto space-y-6">
      
      {/* Header & Date Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 bg-white p-5 rounded-3xl border border-gray-100 shadow-sm">
        <div>
          <h2 className="text-2xl font-black text-brand-dark tracking-tight flex items-center gap-2">
            <span className="p-2 rounded-xl bg-emerald-100 text-emerald-800">
              {data.isAdmin ? <Shield size={20} /> : <Users size={20} />}
            </span>
            {data.isAdmin ? 'Executive Admin Dashboard' : 'Cashier Shift Performance'}
          </h2>
          <p className="text-xs font-semibold text-gray-500 mt-1">
            Real-time terminal telemetry, cashier performance, and inventory health.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-gray-100 p-1.5 rounded-2xl border border-gray-200 self-start sm:self-auto">
          <button 
            onClick={() => setDateRange('today')} 
            className={`px-4 py-2 text-xs font-black rounded-xl transition-all ${
              dateRange === 'today' ? 'bg-white text-emerald-800 shadow-sm' : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            Today
          </button>
          <button 
            onClick={() => setDateRange('week')} 
            className={`px-4 py-2 text-xs font-black rounded-xl transition-all ${
              dateRange === 'week' ? 'bg-white text-emerald-800 shadow-sm' : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            This Week
          </button>
          <button 
            onClick={() => setDateRange('month')} 
            className={`px-4 py-2 text-xs font-black rounded-xl transition-all ${
              dateRange === 'month' ? 'bg-white text-emerald-800 shadow-sm' : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            This Month
          </button>
        </div>
      </div>

      {/* HARDWARE, TERMINALS & NETWORK OVERVIEW STRIP (FOR ADMINS & MANAGERS) */}
      {data.canSeeFinancialSecrets && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Terminals Count Card */}
          <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
              <Monitor size={24} />
            </div>
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">POS Terminals</p>
              <h4 className="text-2xl font-black text-brand-dark">{data.terminalsCount} Machines</h4>
              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full inline-block mt-0.5">
                🟢 Live Telemetry Ready
              </span>
            </div>
          </div>

          {/* Branches / Devices Card */}
          <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
              <Building2 size={24} />
            </div>
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Branches & Stores</p>
              <h4 className="text-2xl font-black text-brand-dark">{data.branchesCount} Location{data.branchesCount > 1 ? 's' : ''}</h4>
              <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full inline-block mt-0.5">
                Multi-Branch Architecture
              </span>
            </div>
          </div>

          {/* Registered Users & Cashiers */}
          <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-700 flex items-center justify-center shrink-0">
              <Users size={24} />
            </div>
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Registered Staff</p>
              <h4 className="text-2xl font-black text-brand-dark">{data.usersCount} Staff Accounts</h4>
              <span className="text-[10px] font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full inline-block mt-0.5">
                Role & Hardware Protected
              </span>
            </div>
          </div>

          {/* Cloud & Local DB Health */}
          <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-3">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
              data.syncStatus?.isOnline ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
            }`}>
              <Activity size={24} />
            </div>
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Cloud Sync State</p>
              <h4 className="text-lg font-black text-brand-dark">
                {(data.syncStatus?.online || data.syncStatus?.isOnline) ? 'Cloud Online' : 'Local Engine'}
              </h4>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-block mt-0.5 ${
                (data.syncStatus?.online || data.syncStatus?.isOnline) ? 'text-emerald-700 bg-emerald-50' : 'text-amber-700 bg-amber-50'
              }`}>
                {(data.syncStatus?.online || data.syncStatus?.isOnline) ? '🟢 Cloud Sync Active' : '🟠 Local SQLite (Offline Resilient)'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* CORE FINANCIAL METRICS (SALES, PROFIT, COGS, ALERTS) */}
      {data.canSeeFinancialSecrets ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-[#008B44] to-[#0A5C36] p-5 rounded-3xl shadow-lg shadow-emerald-900/10 text-white flex flex-col justify-between">
            <p className="text-[11px] font-bold text-white/80 uppercase tracking-widest mb-1 flex items-center">
              <DollarSign size={13} className="mr-1"/> Gross Revenue ({dateRange})
            </p>
            <p className="text-3xl font-black mb-2">Rs. {data.totalSales.toLocaleString()}</p>
            <div className="flex items-center justify-between text-xs font-semibold text-white/90 bg-white/10 px-3 py-1.5 rounded-xl">
              <span>{data.billsCount} bills billed</span>
              <span>{formatQty(data.itemsSold)} items</span>
            </div>
          </div>
          
          <div className="bg-white border border-emerald-100 p-5 rounded-3xl shadow-sm flex flex-col justify-between">
            <p className="text-[11px] font-bold text-emerald-600 uppercase tracking-widest mb-1 flex items-center">
              <TrendingUp size={13} className="mr-1"/> Estimated Gross Margin
            </p>
            <p className="text-3xl font-black text-emerald-700 mb-2">Rs. {data.grossProfit.toLocaleString()}</p>
            <p className="text-xs font-semibold text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-xl w-fit">
              Sales minus Cost of Inventory
            </p>
          </div>

          <div className="bg-white border border-gray-100 p-5 rounded-3xl shadow-sm flex flex-col justify-between">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1 flex items-center">
              <Activity size={13} className="mr-1"/> Cost of Goods Sold (COGS)
            </p>
            <p className="text-3xl font-black text-brand-dark mb-2">Rs. {data.costOfGoodsSold.toLocaleString()}</p>
            <p className="text-xs font-semibold text-gray-500 bg-gray-100 px-3 py-1.5 rounded-xl w-fit">
              Purchase cost of billed goods
            </p>
          </div>

          <div className="bg-white border border-gray-100 p-5 rounded-3xl shadow-sm flex flex-col justify-between">
            <p className="text-[11px] font-bold text-red-500 uppercase tracking-widest mb-1 flex items-center">
              <AlertTriangle size={13} className="mr-1"/> Low Stock Warnings
            </p>
            <p className="text-3xl font-black text-red-600 mb-2">{data.lowStock.length} SKUs</p>
            <p className="text-xs font-semibold text-red-600 bg-red-50 px-3 py-1.5 rounded-xl w-fit">
              Below re-order threshold
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-[#008B44] to-[#0A5C36] p-5 rounded-3xl shadow-lg shadow-emerald-900/10 text-white flex flex-col justify-between">
            <p className="text-[11px] font-bold text-white/80 uppercase tracking-widest mb-1 flex items-center">
              <DollarSign size={13} className="mr-1"/> My Billed Revenue ({dateRange})
            </p>
            <p className="text-3xl font-black mb-2">Rs. {data.totalSales.toLocaleString()}</p>
            <div className="flex items-center justify-between text-xs font-semibold text-white/90 bg-white/10 px-3 py-1.5 rounded-xl">
              <span>{data.billsCount} bills completed</span>
              <span>{formatQty(data.itemsSold)} items</span>
            </div>
          </div>

          <div className="bg-white border border-emerald-100 p-5 rounded-3xl shadow-sm flex flex-col justify-between">
            <p className="text-[11px] font-bold text-emerald-600 uppercase tracking-widest mb-1 flex items-center">
              <CheckCircle2 size={13} className="mr-1"/> Invoices Billed
            </p>
            <p className="text-3xl font-black text-emerald-800 mb-2">{data.billsCount} Bills</p>
            <p className="text-xs font-semibold text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-xl w-fit">
              Successfully processed
            </p>
          </div>

          <div className="bg-white border border-gray-100 p-5 rounded-3xl shadow-sm flex flex-col justify-between">
            <p className="text-[11px] font-bold text-blue-600 uppercase tracking-widest mb-1 flex items-center">
              <ShoppingBag size={13} className="mr-1"/> Quantity Sold
            </p>
            <p className="text-3xl font-black text-blue-900 mb-2">{formatQty(data.itemsSold)} Items</p>
            <p className="text-xs font-semibold text-blue-800 bg-blue-50 px-3 py-1.5 rounded-xl w-fit">
              Supermarket merchandise
            </p>
          </div>

          <div className="bg-white border border-gray-100 p-5 rounded-3xl shadow-sm flex flex-col justify-between">
            <p className="text-[11px] font-bold text-purple-600 uppercase tracking-widest mb-1 flex items-center">
              <TrendingUp size={13} className="mr-1"/> Cashier Avg Ticket
            </p>
            <p className="text-3xl font-black text-purple-900 mb-2">
              Rs. {data.billsCount > 0 ? Math.round(data.totalSales / data.billsCount).toLocaleString() : 0}
            </p>
            <p className="text-xs font-semibold text-purple-800 bg-purple-50 px-3 py-1.5 rounded-xl w-fit">
              Average bill size
            </p>
          </div>
        </div>
      )}

      {/* INVENTORY EXPIRY WARNING & AUDIT SECTION (PRIOR 3 MONTHS / 90 DAYS ALERT) */}
      <div className={`rounded-3xl p-6 shadow-sm border transition-all ${
        (data.expiryAlerts || []).length > 0 
          ? 'bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-white border-amber-300' 
          : 'bg-white border-gray-100'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
              (data.expiryAlerts || []).length > 0 
                ? 'bg-amber-100 text-amber-700 animate-pulse' 
                : 'bg-emerald-50 text-emerald-600'
            }`}>
              <AlertTriangle size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-brand-dark">
                  Product Expiry Early-Warning Alert
                </h3>
                <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                  Prior 3 Months (90-Day Warning)
                </span>
              </div>
              <p className="text-xs font-medium text-gray-500 mt-0.5">
                {(data.expiryAlerts || []).length > 0 
                  ? `Identified ${data.expiryAlerts.length} item(s) expiring within 90 days or already expired.`
                  : 'All inventory items are currently fresh (> 90 days remaining to expiration).'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-start sm:self-auto">
            {(data.expiryAlerts || []).length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setShowExpiryPrintModal(true)}
                  className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-xs px-4 py-2.5 rounded-xl shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
                  title="Print Expiry Audit Report"
                >
                  <Printer size={16} />
                  <span>Print Expiry Report</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowExpiryPrintModal(true)}
                  className="flex items-center gap-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-xs px-3.5 py-2.5 rounded-xl transition-colors cursor-pointer"
                >
                  <span>View All ({data.expiryAlerts.length})</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* If alerts exist, show summary cards & quick preview table */}
        {(data.expiryAlerts || []).length > 0 ? (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white/90 p-3.5 rounded-2xl border border-amber-200 shadow-xs">
                <p className="text-[10px] font-black uppercase text-gray-400">Total Expiring SKUs</p>
                <p className="text-2xl font-black text-slate-800">{data.expiryAlerts.length}</p>
                <p className="text-[11px] font-bold text-gray-500 mt-0.5">Prior 3-month window</p>
              </div>
              <div className="bg-red-50 p-3.5 rounded-2xl border border-red-200 shadow-xs">
                <p className="text-[10px] font-black uppercase text-red-600">Already Expired</p>
                <p className="text-2xl font-black text-red-700">
                  {data.expiryAlerts.filter((a: any) => a.daysLeft <= 0).length} SKUs
                </p>
                <p className="text-[11px] font-bold text-red-600 mt-0.5">Immediate action</p>
              </div>
              <div className="bg-orange-50 p-3.5 rounded-2xl border border-orange-200 shadow-xs">
                <p className="text-[10px] font-black uppercase text-orange-700">Urgent (&lt; 30 Days)</p>
                <p className="text-2xl font-black text-orange-800">
                  {data.expiryAlerts.filter((a: any) => a.daysLeft > 0 && a.daysLeft <= 30).length} SKUs
                </p>
                <p className="text-[11px] font-bold text-orange-700 mt-0.5">Priority clearance</p>
              </div>
              <div className="bg-amber-50 p-3.5 rounded-2xl border border-amber-200 shadow-xs">
                <p className="text-[10px] font-black uppercase text-amber-700">Total Units at Risk</p>
                <p className="text-2xl font-black text-amber-900">
                  {data.expiryAlerts.reduce((acc: number, item: any) => acc + (Number(item.stock) || 0), 0)} Units
                </p>
                <p className="text-[11px] font-bold text-amber-700 mt-0.5">Physical count</p>
              </div>
            </div>

            {/* Quick table preview (top 5 urgent items) */}
            <div className="bg-white rounded-2xl border border-amber-200 overflow-hidden shadow-xs">
              <div className="px-4 py-2.5 bg-amber-50/70 border-b border-amber-100 flex items-center justify-between text-xs font-bold text-amber-900">
                <span>Top Urgent Expiring Items</span>
                <span className="text-[11px] font-medium text-amber-700">Sorted by earliest expiry date</span>
              </div>
              <div className="divide-y divide-gray-100">
                {data.expiryAlerts.slice(0, 5).map((item: any) => (
                  <div key={item.id} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-amber-50/30 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-xs font-black ${
                        item.daysLeft <= 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'
                      }`}>
                        <Package size={15} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-black text-slate-800 truncate">{item.name}</p>
                        <p className="text-[11px] text-gray-500 font-mono">
                          {item.code ? `Code: ${item.code}` : ''} {item.detail !== 'Main Product Stock' ? `• ${item.detail}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0 justify-between sm:justify-end">
                      <div className="text-right">
                        <span className="text-xs font-black text-slate-900">{item.stock} {item.unit}</span>
                        <p className="text-[10px] text-gray-400">Available Qty</p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-bold text-slate-700">{item.expiryDate}</span>
                        <p className="text-[10px] text-gray-400">Exp. Date</p>
                      </div>
                      <div>
                        {item.daysLeft <= 0 ? (
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-black bg-red-100 text-red-700 border border-red-200">
                            Expired {Math.abs(item.daysLeft)}d ago
                          </span>
                        ) : item.daysLeft <= 30 ? (
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-black bg-orange-100 text-orange-800 border border-orange-200">
                            {item.daysLeft}d left
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                            {item.daysLeft}d left
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 px-4 py-3 rounded-2xl border border-emerald-100">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            <span>Inventory Quality Verified: No items found within the 90-day (3-month) expiration threshold. All stock is safe and in date.</span>
          </div>
        )}
      </div>

      {/* ADMIN-ONLY: LIVE TERMINAL PERFORMANCE BREAKDOWN */}
      {data.isAdmin && (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-emerald-100 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-4">
            <div>
              <h3 className="text-lg font-black text-brand-dark flex items-center gap-2">
                <Monitor className="text-brand-primary" size={20} />
                POS Terminal Hardware Performance & Status
              </h3>
              <p className="text-xs font-medium text-gray-400 mt-0.5">
                Live billing volume, active cashier, and average transaction value per terminal.
              </p>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-auto">
              {(() => {
                const onlineCount = data.terminalPerformance.filter((t: any) => t.status === 'online').length;
                const totalCount = data.terminalPerformance.length;
                return (
                  <span className={`text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5 border ${
                    onlineCount > 0 ? 'text-emerald-800 bg-emerald-50 border-emerald-200' : 'text-slate-600 bg-slate-100 border-slate-200'
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${onlineCount > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></span>
                    {onlineCount} of {totalCount} Terminal{totalCount > 1 ? 's' : ''} Online
                  </span>
                );
              })()}
              <button
                onClick={handleOpenAddTerminal}
                className="flex items-center gap-1.5 bg-brand-primary hover:bg-brand-secondary text-white font-black text-xs px-3.5 py-1.5 rounded-xl shadow-sm transition-all"
              >
                <Plus size={15} /> Add Terminal
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-[#F8FAF9] text-gray-500 text-xs font-bold uppercase tracking-wider border-b border-gray-100">
                <tr>
                  <th className="px-5 py-3.5">Terminal Hardware</th>
                  <th className="px-5 py-3.5 text-center">Hardware Status</th>
                  <th className="px-5 py-3.5">Branch</th>
                  <th className="px-5 py-3.5">Shift Status</th>
                  <th className="px-5 py-3.5">Active Cashier</th>
                  <th className="px-5 py-3.5 text-right">Bills Billed</th>
                  <th className="px-5 py-3.5 text-right">Avg Bill Size</th>
                  <th className="px-5 py-3.5 text-right">Revenue ({dateRange})</th>
                  <th className="px-5 py-3.5 text-right">Sales Share</th>
                  <th className="px-5 py-3.5 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {data.terminalPerformance.map((term: any) => (
                  <tr key={term.id} className="hover:bg-gray-50/70 transition-colors">
                    <td className="px-5 py-4">
                      <div className="font-black text-brand-dark flex items-center gap-2">
                        <span className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs relative ${
                          term.status === 'online' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                        }`}>
                          <Monitor size={15} />
                          <span className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                            term.status === 'online' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                          }`} />
                        </span>
                        <div>
                          <p className="leading-tight flex items-center gap-1.5">
                            {term.name}
                            {term.is_current && (
                              <span className="text-[9px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded border border-amber-300">THIS PC</span>
                            )}
                          </p>
                          <p className="text-[10px] font-mono text-gray-400">{term.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className={`text-xs font-black px-3 py-1.5 rounded-full inline-flex items-center gap-1.5 border shadow-xs ${
                        term.status === 'online'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}>
                        <span className={`w-2 h-2 rounded-full ${term.status === 'online' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></span>
                        {term.status === 'online' ? 'ONLINE' : 'OFFLINE'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg">
                        {term.branch_id || 'BR-MAIN'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`text-xs font-bold px-3 py-1 rounded-full inline-flex items-center gap-1.5 ${
                        term.hasOpenShift
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        <span className={`w-2 h-2 rounded-full ${term.hasOpenShift ? 'bg-emerald-600 animate-pulse' : 'bg-gray-400'}`}></span>
                        {term.hasOpenShift ? 'Shift Active' : 'Shift Closed'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                        <Users size={13} className="text-gray-400" />
                        {term.currentCashier}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right font-black text-gray-700">
                      {term.billsCount}
                    </td>
                    <td className="px-5 py-4 text-right font-bold text-gray-600 text-xs">
                      Rs. {Math.round(term.avgBill).toLocaleString()}
                    </td>
                    <td className="px-5 py-4 text-right font-black text-emerald-700 text-base">
                      Rs. {term.sales.toLocaleString()}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 bg-gray-100 rounded-full h-2 overflow-hidden">
                          <div 
                            className="bg-brand-primary h-full rounded-full transition-all duration-500"
                            style={{ width: `${term.sharePct}%` }}
                          ></div>
                        </div>
                        <span className="text-xs font-black text-gray-700 w-8 text-right">{term.sharePct}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <button
                        onClick={() => handleDeleteTerminal(term.id, term.name)}
                        className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-xl transition-colors inline-flex items-center justify-center"
                        title="Delete Terminal"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CASHIER & USER PERFORMANCE SECTION */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-4">
          <div>
            <h3 className="text-lg font-black text-brand-dark flex items-center gap-2">
              <Users className="text-brand-primary" size={20} />
              {data.isAdmin ? 'Staff & Cashier Performance Audit' : 'My Billing Performance'}
            </h3>
            <p className="text-xs font-medium text-gray-400 mt-0.5">
              Verified invoice totals, bill volume, and allowed terminal authorization per user.
            </p>
          </div>
          <span className="text-xs font-bold text-slate-700 bg-slate-100 px-3 py-1.5 rounded-full self-start sm:self-auto">
            {data.userPerformance.length} Account{data.userPerformance.length > 1 ? 's' : ''} Tracked
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[#F8FAF9] text-gray-500 text-xs font-bold uppercase tracking-wider border-b border-gray-100">
              <tr>
                <th className="px-5 py-3.5">Staff / Cashier</th>
                <th className="px-5 py-3.5">Role</th>
                <th className="px-5 py-3.5">Branch Assigned</th>
                <th className="px-5 py-3.5">Allowed Terminal</th>
                <th className="px-5 py-3.5 text-right">Bills Processed</th>
                <th className="px-5 py-3.5 text-right">Items Sold</th>
                <th className="px-5 py-3.5 text-right">Avg Ticket</th>
                <th className="px-5 py-3.5 text-right">Total Billed ({dateRange})</th>
                {data.isAdmin && <th className="px-5 py-3.5 text-right">Store Share</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {data.userPerformance.map((u: any) => (
                <tr key={u.id || u.username} className="hover:bg-gray-50/70 transition-colors">
                  <td className="px-5 py-4">
                    <div className="font-black text-brand-dark flex items-center gap-2">
                      <span className="w-8 h-8 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center font-black text-xs">
                        {u.username.substring(0, 2).toUpperCase()}
                      </span>
                      {u.username}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                      u.role === 'Admin' ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg">
                      {u.branch_id === 'ALL' ? 'ALL Branches' : u.branch_id}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${
                      u.allowed_terminals === 'ALL'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-indigo-50 text-indigo-700'
                    }`}>
                      {u.allowed_terminals === 'ALL' ? 'ALL Terminals' : u.allowed_terminals}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right font-black text-gray-700">
                    {u.billsCount} bills
                  </td>
                  <td className="px-5 py-4 text-right font-bold text-gray-600">
                    {formatQty(u.itemsSold)}
                  </td>
                  <td className="px-5 py-4 text-right font-bold text-gray-600 text-xs">
                    Rs. {Math.round(u.avgTicket).toLocaleString()}
                  </td>
                  <td className="px-5 py-4 text-right font-black text-emerald-700 text-base">
                    Rs. {u.sales.toLocaleString()}
                  </td>
                  {data.isAdmin && (
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 bg-gray-100 rounded-full h-2 overflow-hidden">
                          <div 
                            className="bg-purple-600 h-full rounded-full transition-all duration-500"
                            style={{ width: `${u.sharePct}%` }}
                          ></div>
                        </div>
                        <span className="text-xs font-black text-gray-700 w-8 text-right">{u.sharePct}%</span>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* CHARTS & REVENUE INSIGHTS (PAYMENTS & TOP MOVING PRODUCTS) */}
      <div className={`grid grid-cols-1 ${data.canSeeFinancialSecrets ? 'lg:grid-cols-3' : 'lg:grid-cols-2'} gap-6`}>
        
        {/* Payment Methods Breakdown */}
        <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="font-black text-brand-dark mb-1 text-sm flex items-center gap-2">
              <Wallet size={18} className="text-blue-500" />
              Payment Methods Breakdown ({dateRange})
            </h3>
            <p className="text-xs text-gray-400 font-medium mb-4">Cash vs electronic payments</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
              <p className="text-xs font-bold text-emerald-600 uppercase">Cash</p>
              <p className="text-lg font-black text-emerald-800">Rs. {(data.paymentBreakdown?.Cash || 0).toLocaleString()}</p>
            </div>
            <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100">
              <p className="text-xs font-bold text-blue-600 uppercase">Card</p>
              <p className="text-lg font-black text-blue-800">Rs. {(data.paymentBreakdown?.Card || 0).toLocaleString()}</p>
            </div>
            <div className="bg-purple-50 p-4 rounded-2xl border border-purple-100">
              <p className="text-xs font-bold text-purple-600 uppercase">Bank Transfer</p>
              <p className="text-lg font-black text-purple-800">Rs. {(data.paymentBreakdown?.Bank || 0).toLocaleString()}</p>
            </div>
            <div className="bg-orange-50 p-4 rounded-2xl border border-orange-100">
              <p className="text-xs font-bold text-orange-600 uppercase">Split / Credit</p>
              <p className="text-lg font-black text-orange-800">Rs. {((data.paymentBreakdown?.Split || 0) + (data.paymentBreakdown?.Credit || 0)).toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* User Sales Contribution Pie (ADMIN & MANAGEMENT ONLY) */}
        {data.canSeeFinancialSecrets && (
          <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm flex flex-col">
            <h3 className="font-black text-brand-dark mb-1 text-sm flex items-center gap-2">
              <Users size={18} className="text-brand-primary" />
              Revenue Share by Staff
            </h3>
            <p className="text-xs text-gray-400 font-medium mb-2">Contribution percentage</p>
            
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie 
                    data={userPieData} 
                    cx="50%" 
                    cy="50%" 
                    innerRadius={55} 
                    outerRadius={75} 
                    paddingAngle={5} 
                    dataKey="value"
                  >
                    {userPieData.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={entry?.isDummy ? '#e5e7eb' : COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  {Boolean(userPieData?.[0] && !userPieData[0]?.isDummy) && (
                    <RechartsTooltip 
                      formatter={(val: number) => 'Rs. ' + val.toLocaleString()} 
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} 
                    />
                  )}
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', fontWeight: 'bold' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Top Moving Supermarket Products */}
        <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm flex flex-col">
          <h3 className="font-black text-brand-dark mb-1 text-sm flex items-center gap-2">
            <TrendingUp size={18} className="text-emerald-500" />
            Fast-Moving Supermarket Items
          </h3>
          <p className="text-xs text-gray-400 font-medium mb-3">Highest velocity inventory</p>

          <div className="space-y-2.5 overflow-y-auto max-h-56">
            {data.fastMoving.map((item: any, idx: number) => (
              <div key={item.id || item.name || idx} className="flex justify-between items-center p-3 rounded-2xl bg-gray-50 border border-gray-100">
                <span className="font-bold text-xs text-brand-dark truncate max-w-[180px]">{item.name}</span>
                <span className="text-xs font-black text-emerald-800 bg-emerald-100 px-3 py-1 rounded-full shrink-0">
                  {item.qty} units
                </span>
              </div>
            ))}
            {data.fastMoving.length === 0 && (
              <p className="text-xs font-semibold text-gray-400 py-6 text-center">No sales registered for this period.</p>
            )}
          </div>
        </div>

      </div>

      {/* ADD POS TERMINAL MODAL */}
      {showAddTerminalModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-100">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                  <Monitor size={20} />
                </div>
                <div>
                  <h3 className="font-black text-lg text-brand-dark">Register POS Terminal</h3>
                  <p className="text-xs text-gray-500">Configure new checkout counter station</p>
                </div>
              </div>
              <button 
                onClick={() => setShowAddTerminalModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-xl hover:bg-gray-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateTerminal} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Terminal ID *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. TERM-02, TERM-POS3"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 font-mono text-sm outline-none focus:border-brand-primary"
                  value={newTerminal.id}
                  onChange={e => setNewTerminal({ ...newTerminal, id: e.target.value.toUpperCase() })}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Terminal Friendly Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Touch Terminal 02, Express Billing Counter"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 font-bold text-sm outline-none focus:border-brand-primary"
                  value={newTerminal.name}
                  onChange={e => setNewTerminal({ ...newTerminal, name: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Assigned Store Branch *</label>
                <select
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 font-bold text-sm outline-none bg-white focus:border-brand-primary"
                  value={newTerminal.branch_id}
                  onChange={e => setNewTerminal({ ...newTerminal, branch_id: e.target.value })}
                >
                  {branchesList.map(b => (
                    <option key={b.id} value={b.id}>{b.name} ({b.id})</option>
                  ))}
                  {branchesList.length === 0 && (
                    <option value="BR-MAIN">Main FreshMart Branch (BR-MAIN)</option>
                  )}
                </select>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  className="flex-1 bg-brand-primary hover:bg-brand-secondary text-white font-black py-2.5 px-4 rounded-xl shadow-md transition-all text-xs"
                >
                  Create Terminal
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddTerminalModal(false)}
                  className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-all text-xs"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PRODUCT EXPIRY AUDIT & PRINT MODAL */}
      <ExpiryPrintModal
        isOpen={showExpiryPrintModal}
        onClose={() => setShowExpiryPrintModal(false)}
        alerts={data?.expiryAlerts || []}
        currentUser={currentUser}
        branchName={branchesList?.[0]?.name || 'Main FreshMart Branch'}
      />

    </div>
  );
}
