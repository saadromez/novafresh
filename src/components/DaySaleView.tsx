import React, { useState, useEffect } from 'react';
import { printReceiptViaAgent, isAgentRunning } from '../lib/printAgent';
import { 
  Wallet, LogOut, FileText, Clock, ArrowDownRight, ArrowUpRight, Plus, 
  CheckCircle, Trash2, Printer, Eye, X, AlertCircle, TrendingUp, Calendar,
  Search, RefreshCw, CreditCard, ArrowRightLeft, DollarSign, Coins
} from 'lucide-react';
import { formatSriLankaDateTime, formatReceiptDate } from '../utils/dateUtils';

const parseSqliteUtc = (dStr: any): Date => {
  if (!dStr) return new Date();
  if (dStr instanceof Date) return dStr;
  const s = String(dStr).trim();
  const match = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    const hour = Number(match[4] || 0);
    const minute = Number(match[5] || 0);
    const second = Number(match[6] || 0);
    return new Date(year, month, day, hour, minute, second);
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? new Date() : d;
};

export default function DaySaleView({ session, invoices = [], loadSession, loadInvoices, currentUser, initialTab = 'current' }: any) {
  const role = (currentUser?.role || '').toLowerCase();
  const isAdmin = role === 'admin' || role === 'manager' || role === 'supervisor';
  const [activeSession, setActiveSession] = useState<any>(session);
  const [openingCash, setOpeningCash] = useState('');
  const [closingCash, setClosingCash] = useState('');
  const [transactions, setTransactions] = useState<any[]>([]);
  const [showTxModal, setShowTxModal] = useState(false);
  const [newTx, setNewTx] = useState({ type: 'CASH_IN', amount: '', notes: '' });
  const [tab, setTab] = useState<'current' | 'history' | 'movements'>(initialTab || 'current');
  const [oldSessions, setOldSessions] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({});
  const [terminalsList, setTerminalsList] = useState<any[]>([]);
  const [historyTerminalFilter, setHistoryTerminalFilter] = useState<string>('ALL');

  // All Cash In / Out Movements Tab State
  const [allMovements, setAllMovements] = useState<any[]>([]);
  const [loadingMovements, setLoadingMovements] = useState<boolean>(false);
  const [movementTypeFilter, setMovementTypeFilter] = useState<'ALL' | 'CASH_IN' | 'CASH_OUT'>('ALL');
  const [movementSearch, setMovementSearch] = useState<string>('');

  const loadAllMovements = async () => {
    setLoadingMovements(true);
    try {
      // @ts-ignore
      const res = await window.db.invoke('get-session-transactions', 'ALL');
      setAllMovements(res || []);
    } catch (err) {
      console.warn('Failed to load all movements:', err);
    } finally {
      setLoadingMovements(false);
    }
  };

  const handleDeleteSessionTx = async (txId: any) => {
    if (currentUser?.role?.toLowerCase() !== 'admin') {
      alert('Security Restriction: Only System Administrators can delete cash movement records.');
      return;
    }
    if (!confirm('Are you sure you want to delete this cash movement transaction? Session totals will be automatically recalculated.')) return;
    try {
      // @ts-ignore
      await window.db.invoke('delete-session-transaction', txId);
      await loadAllMovements();
      if (activeSession) {
        await loadTransactions();
        await refreshActiveSession();
      }
      alert('Cash movement transaction deleted successfully.');
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  useEffect(() => {
    if (initialTab) {
      setTab(initialTab);
    }
  }, [initialTab]);

  // History filtering & search state
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'yesterday' | 'week' | 'month' | 'custom'>('all');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [historySearchQuery, setHistorySearchQuery] = useState<string>('');
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);

  // View & Reprint Session Modal State
  const [viewingSession, setViewingSession] = useState<any>(null);
  const [sessionDetailData, setSessionDetailData] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState<boolean>(false);
  const [reprintingId, setReprintingId] = useState<number | null>(null);
  const [activeModalTab, setActiveModalTab] = useState<'summary' | 'invoices' | 'movements' | 'items'>('summary');

  // Synchronize activeSession with prop session
  useEffect(() => {
    setActiveSession(session);
  }, [session]);

  const refreshActiveSession = async () => {
    try {
      // @ts-ignore
      const st = await window.db.getSyncStatus().catch(() => null);
      const tid = st?.config?.current_terminal_id;
      // @ts-ignore
      const s = await window.db.getActiveSession(tid);
      setActiveSession(s || null);
      if (loadSession) await loadSession();
      if (loadInvoices) await loadInvoices();
    } catch (_) {
      setActiveSession(null);
    }
  };

  useEffect(() => {
    if (loadInvoices) loadInvoices();
    if (loadSession) loadSession();
    refreshActiveSession();
  }, []);

  useEffect(() => {
    // @ts-ignore
    if (window.db?.getTerminals) {
      // @ts-ignore
      window.db.getTerminals().then((t: any) => setTerminalsList(t || [])).catch(() => {});
    }
  }, []);

  useEffect(() => {
    // @ts-ignore
    if (window.db) {
      // @ts-ignore
      window.db.invoke('get-settings').then((s: any) => setSettings(s || {})).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (activeSession) {
      loadTransactions();
    } else {
      setTransactions([]);
    }
  }, [activeSession]);

  useEffect(() => {
    if (tab === 'history') {
      loadOldSessions();
    } else if (tab === 'movements') {
      loadAllMovements();
    }
  }, [tab, dateFilter, customStartDate, customEndDate, historyTerminalFilter]);

  const loadOldSessions = async (preset = dateFilter, start = customStartDate, end = customEndDate, terminal = historyTerminalFilter) => {
    setIsLoadingHistory(true);
    try {
      let filterStart = '';
      let filterEnd = '';
      const now = new Date();

      if (preset === 'today') {
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        filterStart = todayStr;
        filterEnd = todayStr;
      } else if (preset === 'yesterday') {
        const y = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const yStr = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
        filterStart = yStr;
        filterEnd = yStr;
      } else if (preset === 'week') {
        const w = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        filterStart = `${w.getFullYear()}-${String(w.getMonth() + 1).padStart(2, '0')}-${String(w.getDate()).padStart(2, '0')}`;
        filterEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      } else if (preset === 'month') {
        filterStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        filterEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      } else if (preset === 'custom') {
        filterStart = start;
        filterEnd = end;
      }

      // @ts-ignore
      const all = await window.db.invoke('get-all-sessions', {
        startDate: filterStart || undefined,
        endDate: filterEnd || undefined,
        terminalId: terminal !== 'ALL' ? terminal : undefined,
        limit: 300
      });

      const closed = (all || []).filter((s: any) => (s.status || '').toUpperCase() === 'CLOSED' || !!s.closed_at);
      setOldSessions(closed);
    } catch (err) {
      console.error('Failed to load old sessions:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleDeleteSession = async (id: number) => {
    if (currentUser?.role?.toLowerCase() !== 'admin') {
      alert('Security Restriction: Only System Administrators can delete records. Managers and other users are not authorized.');
      return;
    }
    if (!confirm(`Delete Session #${id}? This cannot be undone.`)) return;
    // @ts-ignore
    await window.db.invoke('delete-session', id);
    loadOldSessions();
  };

  const loadTransactions = async () => {
    if (!activeSession) return;
    // @ts-ignore
    const tx = await window.db.invoke('get-session-transactions', activeSession.id);
    setTransactions(tx || []);
  };

  const handleOpen = async () => {
    const cashVal = openingCash === '' ? 0 : Number(openingCash);
    if (isNaN(cashVal) || cashVal < 0) {
      alert('Please enter a valid opening cash float (0 or greater).');
      return;
    }
    try {
      // @ts-ignore
      await window.db.invoke('open-session', { openingCash: cashVal, username: currentUser?.username || 'Cashier' });
      setOpeningCash('');
      await refreshActiveSession();
      alert(`✓ Day Session opened successfully with float Rs. ${cashVal.toLocaleString()}!`);
    } catch (e: any) {
      alert(e.message || 'Failed to open session');
    }
  };

  const handleForceResetSession = async () => {
    if (currentUser?.role?.toLowerCase() !== 'admin') {
      alert('Security Restriction: Only System Administrators can force reset a terminal session.');
      return;
    }
    if (!confirm('Force close/reset any stuck session on this terminal? This will mark all sessions as CLOSED so you can immediately open a fresh Day Session.')) return;
    try {
      // @ts-ignore
      await window.db.invoke('force-reset-terminal-session');
      setActiveSession(null);
      await refreshActiveSession();
      loadOldSessions();
      alert('Terminal session successfully reset! You can now open a fresh Day Session.');
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const handleTx = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSession) return;
    // @ts-ignore
    await window.db.invoke('add-session-transaction', {
      session_id: activeSession.id,
      shift_id: activeSession.remote_id || undefined,
      terminal_id: activeSession.terminal_id || undefined,
      type: newTx.type,
      amount: Number(newTx.amount),
      notes: newTx.notes
    });
    setShowTxModal(false);
    setNewTx({ type: 'CASH_IN', amount: '', notes: '' });
    await loadTransactions();
    await refreshActiveSession();
  };

  // Helper to calculate statistics for any session
  const calculateSessionStats = (s: any, invList: any[] = [], txList: any[] = []) => {
    const openCash = Number(s?.opening_cash || 0);
    const actualCash = Number(s?.actual_cash != null ? s.actual_cash : (s?.closing_cash != null ? s.closing_cash : 0));

    let grossSales = invList.filter((i: any) => Number(i.total || i.total_amount) > 0).reduce((a, b) => a + Number(b.total || b.total_amount), 0);
    let totalRefunds = Math.abs(invList.filter((i: any) => Number(i.total || i.total_amount) < 0).reduce((a, b) => a + Number(b.total || b.total_amount), 0));
    let netSales = grossSales - totalRefunds;

    // Accurate tender breakdown including split payments and bank transfers
    let cashSales = 0;
    let cardSales = 0;
    let bankSales = 0;
    let creditSales = 0;
    let splitCount = 0;
    let splitSalesTotal = 0;

    invList.forEach((i: any) => {
      const pm = (i.payment_method || '').toUpperCase();
      const tot = Number(i.total || i.total_amount || 0);
      const cashPaid = Number(i.cash_paid || 0);
      const cardPaid = Number(i.card_paid || 0);
      const otherPaid = Number(i.other_paid || 0);
      const changeRet = Number(i.change_returned || 0);

      const hasMultiTenders = [cashPaid > 0, cardPaid > 0, otherPaid > 0].filter(Boolean).length > 1;
      const isSplit = pm === 'SPLIT' || hasMultiTenders;

      if (isSplit) {
        splitCount++;
        splitSalesTotal += tot;
        if (cashPaid > 0) cashSales += Math.max(0, cashPaid - changeRet);
        if (cardPaid > 0) cardSales += cardPaid;
        if (otherPaid > 0) bankSales += otherPaid;
      } else if (pm === 'CASH') {
        cashSales += tot;
      } else if (pm === 'CARD') {
        cardSales += (cardPaid > 0 ? cardPaid : tot);
      } else if (pm === 'BANK' || pm === 'TRANSFER' || pm === 'QR') {
        bankSales += (otherPaid > 0 ? otherPaid : tot);
      } else if (pm === 'CREDIT') {
        creditSales += tot;
      } else {
        // Fallback for custom or partial methods
        if (cashPaid > 0) cashSales += Math.max(0, cashPaid - changeRet);
        if (cardPaid > 0) cardSales += cardPaid;
        if (otherPaid > 0) bankSales += otherPaid;
        if (cashPaid === 0 && cardPaid === 0 && otherPaid === 0) {
          bankSales += tot;
        }
      }
    });

    const cashRefunds = Math.abs(invList.filter((i: any) => (i.payment_method || '').toUpperCase() === 'CASH' && Number(i.total || i.total_amount) < 0).reduce((a, b) => a + Number(b.total || b.total_amount), 0));

    // Fallback to session row's saved financial records if invoices are not loaded or unlinked
    if (invList.length === 0 && s) {
      if (Number(s.total_sales || 0) > 0 || Number(s.cash_sales || 0) > 0 || Number(s.card_sales || 0) > 0) {
        netSales = Number(s.total_sales || 0);
        totalRefunds = Number(s.total_refunds || 0);
        grossSales = netSales + totalRefunds;
        cashSales = Number(s.cash_sales || 0);
        cardSales = Number(s.card_sales || 0);
        bankSales = Number(s.other_sales || 0);
      }
    }

    const otherSales = bankSales + creditSales;

    const cashIn = txList.length > 0 
      ? txList.filter((t: any) => t.type === 'CASH_IN').reduce((a, b) => a + Number(b.amount || 0), 0)
      : Number(s?.cash_in || 0);
    const cashOut = txList.length > 0 
      ? txList.filter((t: any) => t.type === 'CASH_OUT' || t.type === 'EXPENSE').reduce((a, b) => a + Number(b.amount || 0), 0)
      : Number(s?.cash_out || 0);

    const isClosed = (s?.status || '').toUpperCase() === 'CLOSED' || s?.closed_at != null;
    const computedExpected = openCash + cashSales + cashIn - cashOut;
    const expectedTill = (isClosed && Number(s?.expected_cash || 0) > 0)
      ? Number(s.expected_cash)
      : computedExpected;
    const diff = isClosed
      ? (actualCash - expectedTill)
      : (actualCash > 0 ? actualCash - expectedTill : 0);

    // Item breakdown
    const productMap: Record<string, { name: string; qty: number; revenue: number }> = {};
    invList.forEach((inv: any) => {
      try {
        const items = JSON.parse(inv.items || '[]');
        items.forEach((item: any) => {
          const key = item.name || item.product_name || 'Item';
          const qty = Number(item.quantity || item.qty || 1);
          const lineTotal = Number(item.total || (Number(item.price || 0) * qty) || 0);
          if (!productMap[key]) {
            productMap[key] = { name: key, qty: 0, revenue: 0 };
          }
          productMap[key].qty += qty;
          productMap[key].revenue += lineTotal;
        });
      } catch (e) {}
    });
    const productSummary = Object.values(productMap).sort((a, b) => b.revenue - a.revenue);

    return {
      openingCash: openCash,
      actualCash,
      grossSales,
      totalRefunds,
      netSales,
      cashSales,
      cashRefunds,
      cardSales,
      bankSales,
      creditSales,
      otherSales,
      splitCount,
      splitSalesTotal,
      cashIn,
      cashOut,
      expectedTill,
      diff,
      productSummary
    };
  };

  // Current session stats
  const todaySales = activeSession ? invoices.filter((i: any) => {
    const sId = String(activeSession.id || '').trim();
    const numMatch = sId.match(/(\d+)$/);
    const numId = numMatch ? Number(numMatch[1]) : Number(sId);
    return i.session_id === activeSession.id || i.session_id === numId || String(i.session_id) === sId;
  }) : [];
  const currentStats = calculateSessionStats(activeSession, todaySales, transactions);

  // Print Day End / Z-Report via Agent (with HTML fallback)
  const printDayEndReport = async (s: any, invList: any[] = [], txList: any[] = [], precomputedStats?: any) => {
    const stats = precomputedStats || calculateSessionStats(s, invList, txList);
    const openedStr = formatSriLankaDateTime(s.opened_at);
    const closedStr = s.closed_at ? formatSriLankaDateTime(s.closed_at) : 'Currently Active';
    const diffText = stats.diff === 0 ? 'Balanced' : stats.diff < 0 ? `Shortage: -Rs. ${Math.abs(stats.diff).toFixed(2)}` : `Excess: +Rs. ${stats.diff.toFixed(2)}`;
    const billsCount = invList.length > 0 ? invList.length : (s?.bills_count || 0);

    // Prepare payload for C# Print Agent
    const payload = isAdmin ? {
      invoiceNo: `REPORT-SHIFT-${s.id}`,
      storeName: settings.storeName || 'DAY-END REPORT',
      storeAddress: `${settings.tagline || ''}\nSession #${s.id} | Opened: ${openedStr}`,
      storePhone: `Closed: ${closedStr}`,
      customerName: `Cashier: ${currentUser?.username || 'Cashier'}`,
      paymentMethod: `Status: ${diffText}`,
      createdAt: formatReceiptDate(new Date()),
      subtotal: stats.grossSales,
      discount: stats.totalRefunds,
      tax: 0,
      total: stats.actualCash,
      paid: stats.expectedTill,
      change: Math.max(0, stats.diff),
      balance: Math.max(0, -stats.diff),
      headerText: '',
      footerText: `Expected Till: Rs. ${stats.expectedTill.toFixed(2)}\nActual Counted: Rs. ${stats.actualCash.toFixed(2)}\nDifference: Rs. ${(stats.diff >= 0 ? '+' : '') + stats.diff.toFixed(2)} (${diffText})\n\nCashier Sign: __________________\nManager Sign: __________________`,
      saleType: 'sale',
      items: [
        { name: 'Opening Cash Float', qty: 1, price: stats.openingCash, lineTotal: stats.openingCash },
        { name: `Cash Sales (${invList.length > 0 ? invList.filter((i: any) => (i.payment_method || '').toUpperCase() === 'CASH').length : (s?.bills_count || '')} bills)`, qty: 1, price: stats.cashSales, lineTotal: stats.cashSales },
        { name: `Card Sales (${invList.length > 0 ? invList.filter((i: any) => (i.payment_method || '').toUpperCase() === 'CARD').length : ''} bills)`, qty: 1, price: stats.cardSales, lineTotal: stats.cardSales },
        ...(stats.bankSales > 0 ? [{ name: `Bank / QR Sales (${invList.filter((i: any) => (i.payment_method || '').toUpperCase().includes('BANK') || (i.payment_method || '').toUpperCase().includes('QR')).length} bills)`, qty: 1, price: stats.bankSales, lineTotal: stats.bankSales }] : []),
        ...(stats.splitSalesTotal > 0 ? [{ name: `Split Tender Bills (${stats.splitCount} bills)`, qty: 1, price: stats.splitSalesTotal, lineTotal: stats.splitSalesTotal }] : []),
        ...(stats.creditSales > 0 ? [{ name: 'Credit Sales', qty: 1, price: stats.creditSales, lineTotal: stats.creditSales }] : []),
        { name: 'Cash In (Float drops)', qty: 1, price: stats.cashIn, lineTotal: stats.cashIn },
        { name: 'Expenses / Cash Drops', qty: 1, price: -stats.cashOut, lineTotal: -stats.cashOut },
        ...(stats.productSummary.slice(0, 10).map((p: any) => ({
          name: `[Item] ${p.name}`,
          qty: p.qty,
          price: p.qty > 0 ? p.revenue / p.qty : 0,
          lineTotal: p.revenue
        })))
      ]
    } : {
      invoiceNo: `TILL-CLOSE-SESS-${s.id}`,
      storeName: settings.storeName || 'Nova FreshMart',
      storeAddress: `${settings.tagline || ''}\nSession #${s.id} | Opened: ${openedStr}`,
      storePhone: `Closed: ${closedStr}`,
      customerName: `Cashier: ${currentUser?.username || 'Cashier'}`,
      paymentMethod: 'Blind Count Submitted',
      createdAt: formatReceiptDate(new Date()),
      subtotal: stats.actualCash,
      discount: 0,
      tax: 0,
      total: stats.actualCash,
      paid: stats.actualCash,
      change: 0,
      balance: 0,
      headerText: '*** CASHIER SHIFT CLOSE (BLIND COUNT) ***',
      footerText: `Counted Physical Drawer Cash: Rs. ${stats.actualCash.toFixed(2)}\nTotal Bills Processed: ${billsCount}\n\nNotice: Blind count submitted for management audit and reconciliation.\n\nCashier Sign: __________________\nManager Sign: __________________`,
      saleType: 'sale',
      items: [
        { name: 'Physical Cash Counted', qty: 1, price: stats.actualCash, lineTotal: stats.actualCash }
      ]
    };

    const isUp = await isAgentRunning();
    if (isUp) {
      const res = await printReceiptViaAgent(payload as any);
      if (res.ok) {
        alert(`Day-End Report for Session #${s.id} printed via Print Agent!`);
        return true;
      }
    }

    // Browser HTML printing fallback
    const html = isAdmin ? `<!DOCTYPE html><html><head><title>Day-End Report #${s.id}</title><style>
      body { font-family: monospace; font-size: 12px; width: 300px; margin: 0 auto; padding: 10px; color: #000; }
      .center { text-align: center; }
      .row { display: flex; justify-content: space-between; margin: 4px 0; }
      .bold { font-weight: bold; }
      .dash { border-top: 1px dashed #000; margin: 6px 0; }
      .equal { border-top: 2px solid #000; margin: 6px 0; }
      @media print { @page { margin: 0; size: 80mm auto; } body { padding: 4mm; } }
    </style></head><body>
      <div class="center">
        <h2>${settings.storeName || 'Nova FreshMart'}</h2>
        <p>${settings.tagline || ''}</p>
        <h3 style="margin: 8px 0;">DAY-END Z-REPORT</h3>
        <p>Session #${s.id}</p>
        <p>Opened: ${openedStr}</p>
        <p>Closed: ${closedStr}</p>
      </div>
      <div class="dash"></div>
      <div class="row"><span>Opening Cash:</span><span>Rs. ${stats.openingCash.toFixed(2)}</span></div>
      <div class="row"><span>Gross Sales:</span><span>Rs. ${stats.grossSales.toFixed(2)}</span></div>
      <div class="row"><span>Refunds:</span><span>-Rs. ${stats.totalRefunds.toFixed(2)}</span></div>
      <div class="row bold"><span>Net Sales:</span><span>Rs. ${stats.netSales.toFixed(2)}</span></div>
      <div class="dash"></div>
      <div class="row"><span>Cash Sales:</span><span>Rs. ${stats.cashSales.toFixed(2)}</span></div>
      <div class="row"><span>Card Sales:</span><span>Rs. ${stats.cardSales.toFixed(2)}</span></div>
      ${stats.bankSales > 0 ? `<div class="row"><span>Bank / QR Sales:</span><span>Rs. ${stats.bankSales.toFixed(2)}</span></div>` : ''}
      ${stats.creditSales > 0 ? `<div class="row"><span>Credit Sales:</span><span>Rs. ${stats.creditSales.toFixed(2)}</span></div>` : ''}
      ${stats.splitSalesTotal > 0 ? `<div class="row"><span>Split Bills (${stats.splitCount}):</span><span>Rs. ${stats.splitSalesTotal.toFixed(2)}</span></div>` : ''}
      <div class="row"><span>Cash In:</span><span>+Rs. ${stats.cashIn.toFixed(2)}</span></div>
      <div class="row"><span>Cash Out / Expenses:</span><span>-Rs. ${stats.cashOut.toFixed(2)}</span></div>
      <div class="equal"></div>
      <div class="row bold" style="font-size: 14px;"><span>Expected Cash:</span><span>Rs. ${stats.expectedTill.toFixed(2)}</span></div>
      <div class="row bold" style="font-size: 14px;"><span>Actual Cash:</span><span>Rs. ${stats.actualCash.toFixed(2)}</span></div>
      <div class="row bold"><span>Difference:</span><span>${stats.diff >= 0 ? '+' : ''}Rs. ${stats.diff.toFixed(2)} (${diffText})</span></div>
      <div class="dash"></div>
      <div class="center" style="margin-top: 15px;"><p>Transactions: ${billsCount} | Items Sold: ${stats.productSummary.reduce((acc, p) => acc + p.qty, 0)}</p></div>
      <div style="margin-top: 30px;">
        <p>Cashier Signature: ____________________</p>
        <br/>
        <p>Manager Signature: ____________________</p>
      </div>
      <div class="center" style="margin-top: 20px; font-size: 10px;">Nova FreshMart Retail POS System</div>
      <script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); }</script>
    </body></html>` : `<!DOCTYPE html><html><head><title>Cashier Shift Close #${s.id}</title><style>
      body { font-family: monospace; font-size: 12px; width: 300px; margin: 0 auto; padding: 10px; color: #000; }
      .center { text-align: center; }
      .row { display: flex; justify-content: space-between; margin: 4px 0; }
      .bold { font-weight: bold; }
      .dash { border-top: 1px dashed #000; margin: 6px 0; }
      .equal { border-top: 2px solid #000; margin: 6px 0; }
      @media print { @page { margin: 0; size: 80mm auto; } body { padding: 4mm; } }
    </style></head><body>
      <div class="center">
        <h2>${settings.storeName || 'Nova FreshMart'}</h2>
        <p>${settings.tagline || ''}</p>
        <h3 style="margin: 8px 0;">CASHIER SHIFT CLOSE (BLIND COUNT)</h3>
        <p>Session #${s.id}</p>
        <p>Cashier: ${currentUser?.username || 'Cashier'}</p>
        <p>Opened: ${openedStr}</p>
        <p>Closed: ${closedStr}</p>
      </div>
      <div class="dash"></div>
      <div class="row bold" style="font-size: 14px;"><span>Counted Physical Cash:</span><span>Rs. ${stats.actualCash.toFixed(2)}</span></div>
      <div class="row"><span>Total Bills Processed:</span><span>${billsCount}</span></div>
      <div class="dash"></div>
      <p style="font-size: 10px; color: #555; text-align: center; margin-top: 10px;">Notice: Blind count submitted for management audit and reconciliation.</p>
      <div style="margin-top: 30px;">
        <p>Cashier Signature: ____________________</p>
        <br/>
        <p>Manager Signature: ____________________</p>
      </div>
      <div class="center" style="margin-top: 20px; font-size: 10px;">Nova FreshMart Retail POS System</div>
      <script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); }</script>
    </body></html>`;
    const w = window.open('', '_blank', 'width=400,height=700');
    if (w) { w.document.write(html); w.document.close(); }
    return true;
  };

  const handleClose = async () => {
    if (!activeSession) return;
    if (closingCash === '' || closingCash === null || closingCash === undefined) {
      alert('Please enter actual physical cash counted in drawer to close register.');
      return;
    }
    const cashVal = Number(closingCash);
    if (isNaN(cashVal) || cashVal < 0) {
      alert('Please enter a valid actual cash amount (0 or greater).');
      return;
    }

    const sessionToClose = {
      ...activeSession,
      actual_cash: cashVal,
      closing_cash: cashVal
    };

    const statsToPrint = calculateSessionStats(sessionToClose, todaySales, transactions);

    try {
      await printDayEndReport(sessionToClose, todaySales, transactions, statsToPrint);
    } catch (e) {
      console.error('Print error', e);
    }

    try {
      // @ts-ignore
      await window.db.closeSession({
        sessionId: activeSession.id,
        expectedCash: statsToPrint.expectedTill,
        actualCash: cashVal,
        totalSales: statsToPrint.netSales,
        cashSales: statsToPrint.cashSales,
        cardSales: statsToPrint.cardSales,
        otherSales: statsToPrint.bankSales + statsToPrint.creditSales,
        cashIn: statsToPrint.cashIn,
        cashOut: statsToPrint.cashOut
      });
      const closedId = activeSession.id;
      setActiveSession(null);
      setClosingCash('');
      if (loadSession) await loadSession();
      await refreshActiveSession();
      loadOldSessions();
      alert(`✓ Day Session #${closedId} closed successfully! You can now open a new session.`);
    } catch (err: any) {
      alert('Failed to close session: ' + (err.message || err));
    }
  };

  const handleViewSession = async (s: any) => {
    setViewingSession(s);
    setLoadingDetails(true);
    setActiveModalTab('summary');
    try {
      // @ts-ignore
      const details = await window.db.invoke('get-session-details', s.id);
      setSessionDetailData(details || { session: s, transactions: [], invoices: [] });
    } catch (e) {
      console.error('Failed to load session details:', e);
      setSessionDetailData({ session: s, transactions: [], invoices: [] });
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleReprintSession = async (s: any) => {
    setReprintingId(s.id);
    try {
      // @ts-ignore
      const details = await window.db.invoke('get-session-details', s.id);
      const invList = details?.invoices || [];
      const txList = details?.transactions || [];
      const sess = details?.session ? { ...s, ...details.session } : s;
      await printDayEndReport(sess, invList, txList);
    } catch (e: any) {
      alert('Failed to reprint: ' + e.message);
    } finally {
      setReprintingId(null);
    }
  };

  const filteredMovements = allMovements.filter((tx: any) => {
    const isTxIn = (tx.type || '').toUpperCase() === 'CASH_IN';
    if (movementTypeFilter === 'CASH_IN' && !isTxIn) return false;
    if (movementTypeFilter === 'CASH_OUT' && isTxIn) return false;
    if (movementSearch.trim()) {
      const q = movementSearch.toLowerCase();
      const match =
        String(tx.id || '').includes(q) ||
        String(tx.session_id || '').includes(q) ||
        String(tx.shift_id || '').toLowerCase().includes(q) ||
        String(tx.notes || '').toLowerCase().includes(q) ||
        String(tx.cashier || '').toLowerCase().includes(q) ||
        String(tx.terminal_id || '').toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  const totalCashIn = allMovements
    .filter((tx: any) => (tx.type || '').toUpperCase() === 'CASH_IN')
    .reduce((sum: number, tx: any) => sum + Number(tx.amount || 0), 0);
  const totalCashOut = allMovements
    .filter((tx: any) => (tx.type || '').toUpperCase() !== 'CASH_IN')
    .reduce((sum: number, tx: any) => sum + Number(tx.amount || 0), 0);
  const netMovement = totalCashIn - totalCashOut;

  return (
    <div className="bg-[#FAFAFA] p-3 sm:p-5 w-full min-h-full flex flex-col pb-16">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 shrink-0">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-brand-dark tracking-tight">Day Sale & Petty Cash</h2>
          <p className="text-xs font-medium text-gray-500 mt-0.5">Manage till opening, cash drops, petty cash, and Z-Reads.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {activeSession && tab === 'current' && (
            <>
              <button 
                onClick={() => setShowTxModal(true)} 
                className="px-3.5 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-xs sm:text-sm font-bold flex items-center hover:bg-gray-50 transition-colors shadow-xs cursor-pointer"
              >
                <Plus size={14} className="mr-1.5" /> Petty Cash / Expenses
              </button>
              <div className="px-3.5 py-2 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs sm:text-sm font-bold flex items-center shadow-xs">
                <div className="w-2 h-2 rounded-full bg-emerald-500 mr-2 animate-pulse"></div>
                Session #{activeSession.id} Active ({formatSriLankaDateTime(activeSession.opened_at, { timeOnly: true, showSeconds: false })})
              </div>
              <button 
                onClick={() => {
                  const el = document.getElementById('close-register-card');
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
                className="px-3.5 py-2 bg-slate-900 hover:bg-black text-white rounded-xl text-xs sm:text-sm font-black flex items-center shadow-xs cursor-pointer transition-all"
                title="Jump directly to Drawer Cash count & Day-End report"
              >
                <LogOut size={14} className="mr-1.5 text-emerald-400" /> End Day (Z-Read)
              </button>
            </>
          )}
          {!activeSession && tab === 'current' && (
            <div className="px-3.5 py-2 bg-amber-50 text-amber-800 border border-amber-200 rounded-xl text-xs sm:text-sm font-bold flex items-center shadow-xs">
              <span className="w-2 h-2 rounded-full bg-amber-500 mr-2"></span>
              Register Closed &bull; Ready to Open
            </div>
          )}
          {currentUser?.role?.toLowerCase() === 'admin' && (
            <button
              onClick={handleForceResetSession}
              className="px-3 py-2 bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 rounded-xl text-xs font-bold transition-colors shadow-xs flex items-center cursor-pointer"
              title="If a session gets stuck, force reset it to CLOSED in local & cloud database"
            >
              Force Reset Session
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-2 mb-4 shrink-0">
        <button onClick={() => setTab('current')} className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-colors cursor-pointer ${tab === 'current' ? 'bg-brand-primary text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>Current Session</button>
        <button onClick={() => setTab('history')} className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-colors cursor-pointer ${tab === 'history' ? 'bg-brand-primary text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>Session History</button>
        <button onClick={() => { setTab('movements'); loadAllMovements(); }} className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-colors flex items-center gap-1.5 cursor-pointer ${tab === 'movements' ? 'bg-brand-primary text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
          <Coins size={14} />
          <span>Cash In &amp; Out Records</span>
        </button>
      </div>

      {tab === 'history' ? (
        <div className="flex-1 bg-white border border-gray-200 rounded-2xl overflow-hidden flex flex-col shadow-sm">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex flex-col gap-3 shrink-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-brand-dark">Past Day Sessions</h3>
                <p className="text-xs text-gray-400">View detailed breakdown, split/bank audit, and reprint Z-Reports for previous shifts per terminal.</p>
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={() => loadOldSessions()}
                  disabled={isLoadingHistory}
                  className="px-3 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-xl text-xs font-bold flex items-center hover:bg-gray-100 transition-colors cursor-pointer"
                  title="Refresh Session History"
                >
                  <RefreshCw size={13} className={`mr-1.5 ${isLoadingHistory ? 'animate-spin' : ''}`} /> Refresh
                </button>
                <span className="text-xs font-bold bg-white border border-gray-200 px-3 py-1 rounded-full text-gray-600">
                  {oldSessions
                    .filter(s => historyTerminalFilter === 'ALL' || (s.terminal_id || 'TERM-01') === historyTerminalFilter)
                    .filter(s => {
                      if (!historySearchQuery.trim()) return true;
                      const q = historySearchQuery.toLowerCase();
                      return (
                        String(s.id).includes(q) ||
                        String(s.remote_id || '').toLowerCase().includes(q) ||
                        String(s.username || '').toLowerCase().includes(q) ||
                        String(s.terminal_id || '').toLowerCase().includes(q) ||
                        String(s.opened_at || '').toLowerCase().includes(q)
                      );
                    }).length} Sessions
                </span>
              </div>
            </div>

            {/* Date filter presets & terminal selection */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-gray-200/70">
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { id: 'all', label: 'All Time' },
                  { id: 'today', label: 'Today' },
                  { id: 'yesterday', label: 'Yesterday' },
                  { id: 'week', label: 'Last 7 Days' },
                  { id: 'month', label: 'This Month' },
                  { id: 'custom', label: 'Custom Range' },
                ].map(p => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setDateFilter(p.id as any);
                      loadOldSessions(p.id as any, customStartDate, customEndDate, historyTerminalFilter);
                    }}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      dateFilter === p.id 
                        ? 'bg-brand-primary text-white shadow-xs' 
                        : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {dateFilter === 'custom' && (
                  <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-xl px-2 py-1">
                    <Calendar size={13} className="text-gray-400" />
                    <input
                      type="date"
                      value={customStartDate}
                      onChange={e => setCustomStartDate(e.target.value)}
                      className="text-xs font-bold text-gray-700 outline-none bg-transparent"
                    />
                    <span className="text-xs text-gray-400">to</span>
                    <input
                      type="date"
                      value={customEndDate}
                      onChange={e => setCustomEndDate(e.target.value)}
                      className="text-xs font-bold text-gray-700 outline-none bg-transparent"
                    />
                    <button
                      onClick={() => loadOldSessions('custom', customStartDate, customEndDate, historyTerminalFilter)}
                      className="px-2 py-0.5 bg-brand-primary text-white rounded text-[10px] font-bold cursor-pointer"
                    >
                      Apply
                    </button>
                  </div>
                )}

                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-gray-500">Terminal:</span>
                  <select
                    value={historyTerminalFilter}
                    onChange={e => {
                      setHistoryTerminalFilter(e.target.value);
                      loadOldSessions(dateFilter, customStartDate, customEndDate, e.target.value);
                    }}
                    className="bg-white border border-gray-200 rounded-xl px-3 py-1.5 font-bold text-xs text-slate-800 outline-none cursor-pointer"
                  >
                    <option value="ALL">All Terminals</option>
                    {terminalsList.map(t => (
                      <option key={t.id} value={t.id}>{t.name} ({t.id})</option>
                    ))}
                  </select>
                </div>

                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-2.5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search #, cashier..."
                    value={historySearchQuery}
                    onChange={e => setHistorySearchQuery(e.target.value)}
                    className="pl-7 pr-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-medium text-slate-800 placeholder-gray-400 outline-none w-36 sm:w-44 focus:border-brand-primary"
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-bold">Session #</th>
                  <th className="px-4 py-3 font-bold">Terminal</th>
                  <th className="px-4 py-3 font-bold">Cashier</th>
                  <th className="px-4 py-3 font-bold">Opened</th>
                  <th className="px-4 py-3 font-bold">Closed</th>
                  <th className="px-4 py-3 font-bold text-right">Opening Float</th>
                  <th className="px-4 py-3 font-bold text-right text-emerald-600">Cash In (+)</th>
                  <th className="px-4 py-3 font-bold text-right text-rose-600">Cash Out (-)</th>
                  {isAdmin && <th className="px-4 py-3 font-bold text-right">Expected</th>}
                  <th className="px-4 py-3 font-bold text-right">Actual Count</th>
                  {isAdmin && <th className="px-4 py-3 font-bold text-center">Difference</th>}
                  <th className="px-4 py-3 font-bold text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {oldSessions
                  .filter(s => historyTerminalFilter === 'ALL' || (s.terminal_id || 'TERM-01') === historyTerminalFilter)
                  .filter(s => {
                    if (!historySearchQuery.trim()) return true;
                    const q = historySearchQuery.toLowerCase();
                    return (
                      String(s.id).includes(q) ||
                      String(s.remote_id || '').toLowerCase().includes(q) ||
                      String(s.username || '').toLowerCase().includes(q) ||
                      String(s.terminal_id || '').toLowerCase().includes(q) ||
                      String(s.opened_at || '').toLowerCase().includes(q)
                    );
                  })
                  .map((s: any) => {
                  const expected = Number(s.expected_cash || 0) > 0 
                    ? Number(s.expected_cash) 
                    : (Number(s.opening_cash || 0) + Number(s.cash_sales || 0) + Number(s.cash_in || 0) - Number(s.cash_out || 0));
                  const actualVal = s.actual_cash != null ? Number(s.actual_cash) : (s.closing_cash != null ? Number(s.closing_cash) : null);
                  const hasActual = actualVal != null;
                  const actual = actualVal ?? 0;
                  const diff = hasActual ? (actual - expected) : 0;
                  const isBalanced = hasActual && Math.abs(diff) < 0.01;
                  const isShortage = hasActual && diff < -0.01;

                  return (
                    <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-bold text-brand-dark font-mono">#{s.id}</td>
                      <td className="px-4 py-3">
                        <span className="bg-amber-50 text-amber-900 border border-amber-200 font-mono font-bold px-2 py-0.5 rounded text-[10px]">
                          {s.terminal_id || 'TERM-01'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-bold text-slate-800">
                        {s.username || 'Cashier'}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs font-mono">{formatSriLankaDateTime(s.opened_at)}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs font-mono">{s.closed_at ? formatSriLankaDateTime(s.closed_at) : '-'}</td>
                      <td className="px-4 py-3 text-right font-medium">Rs. {(s.opening_cash || 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-600 font-mono">
                        {Number(s.cash_in || 0) > 0 ? `+Rs. ${Number(s.cash_in).toLocaleString()}` : '-'}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-rose-600 font-mono">
                        {Number(s.cash_out || 0) > 0 ? `-Rs. ${Number(s.cash_out).toLocaleString()}` : '-'}
                      </td>
                      {isAdmin && <td className="px-4 py-3 text-right font-medium">{s.expected_cash != null ? `Rs. ${Number(s.expected_cash).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}</td>}
                      <td className="px-4 py-3 text-right font-bold text-brand-dark">
                        {hasActual ? `Rs. ${actual.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                            Uncounted
                          </span>
                        )}
                      </td>
                      {isAdmin && (
                      <td className="px-4 py-3 text-center">
                        {hasActual ? (
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            isBalanced ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                            isShortage ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                            'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}>
                            {isBalanced ? 'Balanced' : (diff > 0 ? `+Rs. ${diff.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `-Rs. ${Math.abs(diff).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)}
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                            Pending Audit
                          </span>
                        )}
                      </td>
                      )}
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center space-x-1.5">
                          <button
                            onClick={() => handleViewSession(s)}
                            className="flex items-center px-2.5 py-1 text-xs font-bold text-brand-primary bg-brand-primary/10 hover:bg-brand-primary hover:text-white rounded-lg transition-colors"
                            title="View Full Details"
                          >
                            <Eye size={13} className="mr-1" /> View
                          </button>
                          <button
                            onClick={() => handleReprintSession(s)}
                            disabled={reprintingId === s.id}
                            className="flex items-center px-2.5 py-1 text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
                            title="Reprint Day-End Report"
                          >
                            <Printer size={13} className="mr-1" /> {reprintingId === s.id ? 'Printing...' : 'Reprint'}
                          </button>
                          {currentUser?.role?.toLowerCase() === 'admin' && (
                            <button
                              onClick={() => handleDeleteSession(s.id)}
                              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              title="Delete Session (Admin Only)"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {oldSessions.length === 0 && (
                  <tr>
                    <td colSpan={isAdmin ? 12 : 10} className="px-4 py-12 text-center text-gray-400">
                      No closed sessions found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : tab === 'movements' ? (
        <div className="flex-1 bg-white border border-gray-200 rounded-2xl overflow-hidden flex flex-col shadow-sm">
          {/* Header Bar */}
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex flex-col gap-3 shrink-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-brand-dark flex items-center gap-2">
                  <Coins className="text-brand-primary" size={18} />
                  <span>Cash In &amp; Cash Out Records (Petty Cash &amp; Drawer Drops)</span>
                </h3>
                <p className="text-xs text-gray-400">
                  Full store-wide ledger of petty cash top-ups, vendor payouts, drawer drops, and expenses.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {activeSession && (
                  <button
                    onClick={() => setShowTxModal(true)}
                    className="px-3.5 py-1.5 bg-brand-primary text-white rounded-xl text-xs font-bold flex items-center hover:bg-brand-primary/90 transition-all shadow-xs cursor-pointer"
                  >
                    <Plus size={14} className="mr-1" /> Add Cash Movement
                  </button>
                )}
                <button
                  onClick={() => loadAllMovements()}
                  disabled={loadingMovements}
                  className="px-3 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-xl text-xs font-bold flex items-center hover:bg-gray-100 transition-colors cursor-pointer"
                  title="Refresh Cash Movements"
                >
                  <RefreshCw size={13} className={`mr-1.5 ${loadingMovements ? 'animate-spin' : ''}`} /> Refresh
                </button>
                <span className="text-xs font-bold bg-white border border-gray-200 px-3 py-1 rounded-full text-gray-600">
                  {filteredMovements.length} Records
                </span>
              </div>
            </div>

            {/* Metrics cards row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-gray-200/70">
              <div className="bg-white border border-emerald-200/60 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">Total Cash In (+)</p>
                  <p className="text-lg font-black text-emerald-700 font-mono">Rs. {totalCashIn.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <ArrowDownRight size={20} />
                </div>
              </div>

              <div className="bg-white border border-rose-200/60 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-rose-600">Total Cash Out (-)</p>
                  <p className="text-lg font-black text-rose-700 font-mono">Rs. {totalCashOut.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
                <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                  <ArrowUpRight size={20} />
                </div>
              </div>

              <div className="bg-white border border-blue-200/60 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-blue-600">Net Movement</p>
                  <p className={`text-lg font-black font-mono ${netMovement >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {netMovement >= 0 ? '+' : ''}Rs. {netMovement.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Coins size={20} />
                </div>
              </div>
            </div>

            {/* Filters & Search */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-1.5">
                {(['ALL', 'CASH_IN', 'CASH_OUT'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setMovementTypeFilter(t)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      movementTypeFilter === t
                        ? 'bg-brand-primary text-white shadow-xs'
                        : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {t === 'ALL' ? 'All Movements' : t === 'CASH_IN' ? 'Cash In (+)' : 'Cash Out (-)'}
                  </button>
                ))}
              </div>

              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-2.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search reason, #session, terminal..."
                  value={movementSearch}
                  onChange={e => setMovementSearch(e.target.value)}
                  className="pl-7 pr-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-medium text-slate-800 placeholder-gray-400 outline-none w-56 sm:w-64 focus:border-brand-primary"
                />
              </div>
            </div>
          </div>

          {/* Movements Table */}
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-bold">Date &amp; Time</th>
                  <th className="px-4 py-3 font-bold">Type</th>
                  <th className="px-4 py-3 font-bold text-right">Amount</th>
                  <th className="px-4 py-3 font-bold">Session / Shift Ref</th>
                  <th className="px-4 py-3 font-bold">Terminal</th>
                  <th className="px-4 py-3 font-bold">Reason / Notes</th>
                  {isAdmin && <th className="px-4 py-3 font-bold text-center">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {filteredMovements.map((m: any, idx: number) => {
                  const isCashIn = m.type === 'CASH_IN';
                  const amt = Number(m.amount || 0);
                  return (
                    <tr key={m.id || idx} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-600 font-mono">
                        {formatSriLankaDateTime(m.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                          isCashIn
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}>
                          {isCashIn ? (
                            <><ArrowDownRight size={12} className="mr-1" /> Cash In</>
                          ) : (
                            <><ArrowUpRight size={12} className="mr-1" /> Cash Out</>
                          )}
                        </span>
                      </td>
                      <td className={`px-4 py-3 text-right font-black font-mono text-sm ${
                        isCashIn ? 'text-emerald-600' : 'text-rose-600'
                      }`}>
                        {isCashIn ? '+' : '-'}Rs. {amt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-700 font-mono">
                        {m.shift_id ? (
                          <span className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded border border-slate-200 font-bold">
                            {m.shift_id}
                          </span>
                        ) : m.session_id ? (
                          <span className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded border border-slate-200 font-bold">
                            #{m.session_id}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="bg-amber-50 text-amber-900 border border-amber-200 font-mono font-bold px-2 py-0.5 rounded text-[10px]">
                          {m.terminal_id || 'TERM-01'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700 max-w-xs truncate" title={m.notes || ''}>
                        {m.notes || <span className="text-gray-400 italic">No notes provided</span>}
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => handleDeleteSessionTx(m.id || m.remote_id)}
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                            title="Delete Record (Admin Only)"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {filteredMovements.length === 0 && (
                  <tr>
                    <td colSpan={isAdmin ? 7 : 6} className="px-4 py-12 text-center text-gray-400">
                      No cash movement records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : !activeSession ? (
        <div className="flex-1 flex items-center justify-center py-8">
          <div className="max-w-md w-full bg-white p-6 sm:p-8 rounded-3xl border border-gray-200 text-center shadow-xl shadow-brand-primary/5">
            <div className="w-16 h-16 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-emerald-600">
              <Wallet size={32} />
            </div>
            <h3 className="text-xl font-black text-brand-dark mb-1">Open Day Session</h3>
            <p className="text-gray-500 mb-6 text-xs font-medium">Enter the opening cash float in drawer to begin selling for this shift.</p>

            <div className="text-left mb-6">
              <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-2">Opening Cash Float (Rs.)</label>
              <input 
                type="number" 
                step="any"
                className="w-full border-2 border-emerald-200 rounded-2xl px-4 py-3 outline-none focus:border-brand-primary focus:ring-4 focus:ring-brand-primary/10 text-xl font-black text-brand-dark bg-white transition-all" 
                value={openingCash} 
                onChange={e => setOpeningCash(e.target.value)} 
                placeholder="0.00" 
                autoFocus 
              />
              <p className="text-[11px] text-gray-400 mt-1.5 font-medium">Leave as 0.00 if starting with empty till drawer.</p>
            </div>
            <button 
              onClick={handleOpen} 
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3.5 rounded-2xl font-black text-sm transition-all shadow-lg shadow-emerald-600/25 active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2"
            >
              <CheckCircle size={18} />
              <span>Open Session & Start Register</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-3 min-h-0">
          {/* Top Metric Bar: 5 compact cards showing all tender channels (Admin Only) */}
          {isAdmin ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 shrink-0">
              <div className="p-2.5 sm:p-3 bg-white border border-gray-100 rounded-xl shadow-xs">
                <p className="text-gray-400 font-bold text-[9px] uppercase tracking-wider mb-0.5">Net Sales</p>
                <p className="text-base sm:text-lg font-black text-emerald-600">Rs. {currentStats.netSales.toLocaleString()}</p>
                <p className="text-[9px] text-gray-400 font-medium">Billed: Rs. {currentStats.grossSales.toLocaleString()}</p>
              </div>
              <div className="p-2.5 sm:p-3 bg-white border border-gray-100 rounded-xl shadow-xs">
                <p className="text-gray-400 font-bold text-[9px] uppercase tracking-wider mb-0.5">Cash Collected</p>
                <p className="text-base sm:text-lg font-black text-brand-dark">Rs. {currentStats.cashSales.toLocaleString()}</p>
                <p className="text-[9px] text-gray-400 font-medium">Physical Till Cash</p>
              </div>
              <div className="p-2.5 sm:p-3 bg-white border border-gray-100 rounded-xl shadow-xs">
                <p className="text-gray-400 font-bold text-[9px] uppercase tracking-wider mb-0.5">Card Sales</p>
                <p className="text-base sm:text-lg font-black text-brand-primary">Rs. {currentStats.cardSales.toLocaleString()}</p>
                <p className="text-[9px] text-gray-400 font-medium">POS Terminal / Card</p>
              </div>
              <div className="p-2.5 sm:p-3 bg-white border border-gray-100 rounded-xl shadow-xs">
                <p className="text-gray-400 font-bold text-[9px] uppercase tracking-wider mb-0.5">Bank Transfer / QR</p>
                <p className="text-base sm:text-lg font-black text-blue-600">Rs. {currentStats.bankSales.toLocaleString()}</p>
                <p className="text-[9px] text-gray-400 font-medium">{currentStats.splitSalesTotal > 0 ? `Splits: Rs. ${currentStats.splitSalesTotal.toLocaleString()}` : 'Online Bank / QR'}</p>
              </div>
              <div className="p-2.5 sm:p-3 bg-white border border-gray-100 rounded-xl shadow-xs col-span-2 sm:col-span-1">
                <p className="text-gray-400 font-bold text-[9px] uppercase tracking-wider mb-0.5">Petty Cash &amp; Drops</p>
                <p className="text-base sm:text-lg font-black text-rose-600">- Rs. {currentStats.cashOut.toLocaleString()}</p>
                <p className="text-[9px] text-gray-400 font-medium">In: +Rs. {currentStats.cashIn.toLocaleString()} | Ref: -Rs. {currentStats.totalRefunds.toLocaleString()}</p>
              </div>
            </div>
          ) : (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between shadow-xs shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-black">
                  <CheckCircle size={18} />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-800">Blind Register Close Mode (Shift #{activeSession.id})</p>
                  <p className="text-[10px] text-slate-500">Sales channels (Cash, Card, Bank) and drawer expected balances are protected and only visible to authorized Admin accounts.</p>
                </div>
              </div>
              <span className="text-[10px] font-black px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg uppercase tracking-wider">
                Audited Blind Till
              </span>
            </div>
          )}

          {/* Main 2-Column Responsive Layout */}
          <div className="flex-1 flex flex-col lg:flex-row gap-3 min-h-0">
            {/* Left Column: Z-Read Register Closing Card */}
            <div className="w-full lg:w-1/2 flex flex-col shrink-0">
              <div id="close-register-card" className="bg-white p-3.5 sm:p-4 rounded-2xl border-2 border-slate-200/90 shadow-sm flex flex-col gap-2.5 relative">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm sm:text-base font-black text-brand-dark flex items-center">
                    <CheckCircle size={16} className="mr-1.5 text-emerald-600" /> End of Day (Z-Read)
                  </h3>
                  <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">Shift #{activeSession.id}</span>
                </div>

                {isAdmin ? (
                  <div className="bg-emerald-50/80 p-2.5 sm:p-3 rounded-xl border border-emerald-200/80 flex items-center justify-between gap-2">
                    <div>
                      <span className="font-bold text-xs text-slate-900 block">Expected Cash in Drawer</span>
                      <span className="text-[9px] text-slate-500 font-medium">
                        Float ({currentStats.openingCash.toLocaleString()}) + Cash ({currentStats.cashSales.toLocaleString()}) + In ({currentStats.cashIn.toLocaleString()}) - Out ({currentStats.cashOut.toLocaleString()})
                      </span>
                    </div>
                    <span className="text-lg sm:text-xl font-black text-emerald-700 shrink-0">Rs. {currentStats.expectedTill.toLocaleString()}</span>
                  </div>
                ) : (
                  <div className="bg-slate-50 p-2.5 sm:p-3 rounded-xl border border-slate-200 flex items-center justify-between gap-2">
                    <div>
                      <span className="font-bold text-xs text-slate-700 block">Blind Till Close</span>
                      <span className="text-[10px] text-slate-400 font-medium">Please perform a physical count of drawer cash and enter below.</span>
                    </div>
                    <span className="text-[10px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">Cashier Count</span>
                  </div>
                )}

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[11px] font-black text-slate-700 uppercase tracking-wide">
                      Actual Cash Counted in Drawer (Rs.) *
                    </label>
                    {isAdmin && closingCash !== '' && !isNaN(Number(closingCash)) && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                        Math.abs(Number(closingCash) - currentStats.expectedTill) < 0.01 
                          ? 'bg-emerald-100 text-emerald-800' 
                          : Number(closingCash) > currentStats.expectedTill 
                          ? 'bg-amber-100 text-amber-800' 
                          : 'bg-rose-100 text-rose-800'
                      }`}>
                        {Math.abs(Number(closingCash) - currentStats.expectedTill) < 0.01 
                          ? '✓ Balanced' 
                          : Number(closingCash) > currentStats.expectedTill 
                          ? `+Rs. ${(Number(closingCash) - currentStats.expectedTill).toFixed(2)} Excess` 
                          : `-Rs. ${(currentStats.expectedTill - Number(closingCash)).toFixed(2)} Shortage`}
                      </span>
                    )}
                  </div>
                  <input 
                    type="number" 
                    step="any"
                    className="w-full border-2 border-slate-300 rounded-xl px-3 py-2 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/10 text-base sm:text-lg font-black text-slate-900 bg-white transition-all shadow-inner" 
                    value={closingCash} 
                    onChange={e => setClosingCash(e.target.value)} 
                    placeholder="Enter physical cash amount counted" 
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">Physical cash count required to print Z-Report and close register.</p>
                </div>

                <button 
                  id="close-register-btn"
                  onClick={handleClose} 
                  className="w-full bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white py-2.5 sm:py-3 rounded-xl font-black text-xs sm:text-sm transition-all shadow-md shadow-emerald-600/25 active:scale-[0.99] flex items-center justify-center cursor-pointer"
                >
                  <LogOut size={16} className="mr-1.5" /> Close Register &amp; Print Z-Read
                </button>
              </div>
            </div>

          {/* Right Column: Live Session Activity */}
          <div className="w-full lg:w-1/2 bg-white border border-gray-100 rounded-2xl shadow-sm flex flex-col min-h-[350px] lg:min-h-0 flex-1 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 flex justify-between items-center shrink-0 bg-gray-50/70">
              <h3 className="font-bold text-brand-dark text-xs sm:text-sm flex items-center">
                <FileText size={16} className="mr-2 text-emerald-600" />
                Current Shift Transactions
              </h3>
              <span className="text-xs text-gray-500 font-bold">
                {todaySales.length} Sales | {transactions.length} Movements
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2 max-h-[450px] lg:max-h-none">
              {todaySales.map((inv: any) => (
                <div key={`inv-${inv.id}`} className="p-2.5 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors flex justify-between items-center group">
                  <div>
                    <span className="font-bold text-xs text-brand-dark">INV-{String(inv.id).padStart(4, '0')}</span>
                    <p className="text-[9px] text-gray-400 flex items-center mt-0.5"><Clock size={10} className="mr-1" /> {formatSriLankaDateTime(inv.created_at, { timeOnly: true })}</p>
                  </div>
                  <div className="flex items-center space-x-3 text-right">
                    <div>
                      {isAdmin ? (
                        <div className="font-black text-brand-dark text-xs">Rs. {inv.total.toLocaleString()}</div>
                      ) : (
                        <div className="font-bold text-slate-500 text-xs">Billed</div>
                      )}
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${inv.payment_method === 'Cash' ? 'bg-brand-secondary/10 text-brand-secondary' : 'bg-brand-dark/10 text-brand-dark'}`}>{inv.payment_method}</span>
                    </div>
                    {currentUser?.role?.toLowerCase() === 'admin' && (
                      <button onClick={async () => {
                        if (currentUser?.role?.toLowerCase() !== 'admin') {
                          alert('Security Restriction: Only System Administrators can delete records.');
                          return;
                        }
                        if (!confirm('Are you sure you want to delete this invoice?')) return;
                        // @ts-ignore
                        await window.db.invoke('delete-invoice', { id: inv.id, restoreStock: false });
                        if (loadInvoices) loadInvoices();
                        if (loadSession) loadSession();
                      }} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 bg-white p-1.5 rounded-lg border border-gray-100 shadow-sm transition-all" title="Delete Invoice (Admin Only)">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {transactions.map((t: any) => (
                <div key={`tx-${t.id}`} className="p-2.5 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors flex justify-between items-center group">
                  <div>
                    <span className="font-bold text-xs text-brand-dark flex items-center">
                      {t.type === 'CASH_IN' ? <ArrowUpRight size={14} className="text-brand-secondary mr-1.5" /> : <ArrowDownRight size={14} className="text-[#D43460] mr-1.5" />}
                      {t.type.replace('_', ' ')}
                    </span>
                    <p className="text-[9px] text-gray-400 flex items-center mt-0.5"><Clock size={10} className="mr-1" /> {formatSriLankaDateTime(t.created_at, { timeOnly: true })} - {t.notes}</p>
                  </div>
                  <div className="flex items-center space-x-3 text-right">
                    <div className="font-black text-brand-dark text-xs">
                      {t.type === 'CASH_IN' ? '+' : '-'} Rs. {t.amount.toLocaleString()}
                    </div>
                    {currentUser?.role?.toLowerCase() === 'admin' && (
                      <button onClick={async () => {
                        if (currentUser?.role?.toLowerCase() !== 'admin') {
                          alert('Security Restriction: Only System Administrators can delete records.');
                          return;
                        }
                        if (!confirm('Are you sure you want to delete this transaction?')) return;
                        // @ts-ignore
                        await window.db.invoke('delete-session-transaction', t.id);
                        await loadTransactions();
                        await refreshActiveSession();
                      }} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 bg-white p-1.5 rounded-lg border border-gray-100 shadow-sm transition-all" title="Delete Transaction (Admin Only)">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {todaySales.length === 0 && transactions.length === 0 && (
                <div className="h-full flex items-center justify-center text-sm font-medium text-gray-400">
                  No transactions in this session yet.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      )}

      {/* ── Viewing Past Session Detail Modal ── */}
      {viewingSession && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/70">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-brand-primary/10 text-brand-primary flex items-center justify-center">
                  <FileText size={20} />
                </div>
                <div>
                  <h3 className="font-black text-lg text-brand-dark">Session #{viewingSession.id} Details</h3>
                  <p className="text-xs text-gray-400">
                    Opened: {formatSriLankaDateTime(viewingSession.opened_at)} &nbsp;|&nbsp; Closed: {viewingSession.closed_at ? formatSriLankaDateTime(viewingSession.closed_at) : 'Open'}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => handleReprintSession(viewingSession)}
                  disabled={reprintingId === viewingSession.id}
                  className="px-4 py-2 bg-brand-primary text-white rounded-xl text-xs font-bold flex items-center hover:bg-brand-secondary transition-all shadow-md shadow-brand-primary/20 disabled:opacity-50"
                >
                  <Printer size={14} className="mr-1.5" />
                  {reprintingId === viewingSession.id ? 'Printing...' : 'Reprint Day-End (Z-Read)'}
                </button>
                <button
                  onClick={() => { setViewingSession(null); setSessionDetailData(null); }}
                  className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {loadingDetails ? (
              <div className="py-20 text-center text-sm font-bold text-gray-400">
                Loading session details...
              </div>
            ) : sessionDetailData ? (() => {
              const invs = sessionDetailData.invoices || [];
              const txs = sessionDetailData.transactions || [];
              const stats = calculateSessionStats(sessionDetailData.session, invs, txs);
              const isBalanced = Math.abs(stats.diff) < 0.01;
              const isShortage = stats.diff < -0.01;

              return (
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                      <p className="text-[10px] font-bold text-gray-400 uppercase">Opening Float</p>
                      <p className="text-lg font-black text-brand-dark mt-1">Rs. {stats.openingCash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                      <p className="text-[10px] font-bold text-gray-400 uppercase">Net Sales</p>
                      <p className="text-lg font-black text-emerald-600 mt-1">Rs. {stats.netSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                      <p className="text-[10px] font-bold text-gray-400 uppercase">Cash Sales</p>
                      <p className="text-lg font-black text-brand-secondary mt-1">Rs. {stats.cashSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                      <p className="text-[10px] font-bold text-gray-400 uppercase">Card Sales</p>
                      <p className="text-lg font-black text-brand-primary mt-1">Rs. {stats.cardSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                      <p className="text-[10px] font-bold text-gray-400 uppercase">Bank Transfer / QR</p>
                      <p className="text-lg font-black text-blue-600 mt-1">Rs. {(stats.bankSales || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                      <p className="text-[10px] font-bold text-gray-400 uppercase">Split Payments</p>
                      <p className="text-lg font-black text-purple-600 mt-1">
                        {stats.splitCount > 0 ? `${stats.splitCount} bills (Rs. ${stats.splitSalesTotal.toLocaleString()})` : '0 bills'}
                      </p>
                    </div>
                  </div>

                  {/* Mathematical Reconciliation Audit Bar */}
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 px-4 text-xs font-medium text-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-slate-900">Total Net Sales Audit:</span>
                      <span>Cash (Rs. {stats.cashSales.toLocaleString(undefined, { minimumFractionDigits: 2 })})</span>
                      <span>+</span>
                      <span>Card (Rs. {stats.cardSales.toLocaleString(undefined, { minimumFractionDigits: 2 })})</span>
                      {Number(stats.bankSales || 0) > 0 && (
                        <>
                          <span>+</span>
                          <span>Bank/QR (Rs. {Number(stats.bankSales).toLocaleString(undefined, { minimumFractionDigits: 2 })})</span>
                        </>
                      )}
                      {Number(stats.creditSales || 0) > 0 && (
                        <>
                          <span>+</span>
                          <span>Credit (Rs. {Number(stats.creditSales).toLocaleString(undefined, { minimumFractionDigits: 2 })})</span>
                        </>
                      )}
                      <span>=</span>
                      <strong className="text-emerald-700 font-black">Rs. {stats.netSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-600 text-[11px]">
                      <span>Drawer Cash:</span>
                      <span>Float ({stats.openingCash.toLocaleString()}) + Cash ({stats.cashSales.toLocaleString()}) =</span>
                      <strong className="text-slate-900 font-bold">Rs. {stats.expectedTill.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                      <p className="text-[10px] font-bold text-gray-400 uppercase">Petty Cash In / Out</p>
                      <p className="text-base font-bold text-gray-700 mt-1">
                        +Rs. {stats.cashIn.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} &nbsp;/&nbsp; -Rs. {stats.cashOut.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                      <p className="text-[10px] font-bold text-gray-400 uppercase">Expected Till</p>
                      <p className="text-xl font-black text-brand-dark mt-1">{isAdmin ? `Rs. ${stats.expectedTill.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '— (Admin Only)'}</p>
                    </div>
                    <div className={`p-4 rounded-2xl border ${
                      !isAdmin ? 'bg-slate-50 border-slate-200' :
                      isBalanced ? 'bg-emerald-50 border-emerald-200' :
                      isShortage ? 'bg-rose-50 border-rose-200' :
                      'bg-amber-50 border-amber-200'
                    }`}>
                      <p className="text-[10px] font-bold text-gray-500 uppercase">{isAdmin ? 'Actual Counted & Variance' : 'Actual Counted Cash'}</p>
                      <div className="flex items-baseline justify-between mt-1">
                        <span className="text-xl font-black text-gray-900">Rs. {stats.actualCash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        {isAdmin && (
                          <span className={`text-xs font-black ${
                            isBalanced ? 'text-emerald-700' :
                            isShortage ? 'text-rose-700' : 'text-amber-700'
                          }`}>
                            {isBalanced ? 'Balanced' : (stats.diff > 0 ? `+Rs. ${stats.diff.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `-Rs. ${Math.abs(stats.diff).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Alert if Shift Totals exist but Invoices were deleted/cleared */}
                  {stats.netSales > 0 && invs.length === 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3 text-amber-900 text-xs">
                      <AlertCircle size={20} className="shrink-0 text-amber-600" />
                      <div>
                        <p className="font-bold text-amber-900">Shift Totals Preserved from Register Close</p>
                        <p className="text-[11px] text-amber-700 mt-0.5 leading-relaxed">
                          The financial totals for this closed shift were permanently audited and recorded upon register close (Rs. {stats.netSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}). However, the individual invoices for this past shift were subsequently deleted or reset from the sales history.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Sub-Navigation Tabs */}
                  <div className="border-b border-gray-200 flex gap-4">
                    <button
                      onClick={() => setActiveModalTab('summary')}
                      className={`pb-2.5 text-xs font-bold border-b-2 transition-all ${activeModalTab === 'summary' ? 'border-brand-primary text-brand-primary' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                    >
                      Top Items Sold ({stats.productSummary.length})
                    </button>
                    <button
                      onClick={() => setActiveModalTab('invoices')}
                      className={`pb-2.5 text-xs font-bold border-b-2 transition-all ${activeModalTab === 'invoices' ? 'border-brand-primary text-brand-primary' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                    >
                      Invoices List ({invs.length})
                    </button>
                    <button
                      onClick={() => setActiveModalTab('movements')}
                      className={`pb-2.5 text-xs font-bold border-b-2 transition-all ${activeModalTab === 'movements' ? 'border-brand-primary text-brand-primary' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                    >
                      Cash Movements ({txs.length})
                    </button>
                  </div>

                  {/* Tab 1: Top Items Sold */}
                  {activeModalTab === 'summary' && (
                    <div className="border border-gray-100 rounded-2xl overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-gray-50 font-bold text-gray-500 uppercase border-b border-gray-100">
                          <tr>
                            <th className="px-4 py-2.5">Item Name</th>
                            <th className="px-4 py-2.5 text-right">Units Sold</th>
                            <th className="px-4 py-2.5 text-right">Total Revenue</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {stats.productSummary.map((item, idx) => (
                            <tr key={idx} className="hover:bg-gray-50">
                              <td className="px-4 py-2 font-bold text-gray-800">{item.name}</td>
                              <td className="px-4 py-2 text-right font-medium text-gray-600">{item.qty}</td>
                              <td className="px-4 py-2 text-right font-bold text-brand-dark">Rs. {item.revenue.toLocaleString()}</td>
                            </tr>
                          ))}
                          {stats.productSummary.length === 0 && (
                            <tr>
                              <td colSpan={3} className="py-8 text-center text-gray-400">
                                {stats.netSales > 0 ? 'Individual sold item line-records for this shift were reset or deleted from billing history.' : 'No items sold in this shift.'}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Tab 2: Invoices List */}
                  {activeModalTab === 'invoices' && (
                    <div className="border border-gray-100 rounded-2xl overflow-hidden max-h-72 overflow-y-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-gray-50 font-bold text-gray-500 uppercase border-b border-gray-100 sticky top-0">
                          <tr>
                            <th className="px-4 py-2.5">Invoice #</th>
                            <th className="px-4 py-2.5">Time</th>
                            <th className="px-4 py-2.5">Type</th>
                            <th className="px-4 py-2.5">Payment</th>
                            <th className="px-4 py-2.5 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {invs.map((inv: any) => (
                            <tr key={inv.id} className="hover:bg-gray-50">
                              <td className="px-4 py-2 font-bold text-brand-dark">INV-{String(inv.id).padStart(4, '0')}</td>
                              <td className="px-4 py-2 text-gray-500">{formatSriLankaDateTime(inv.created_at, { timeOnly: true })}</td>
                              <td className="px-4 py-2">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${Number(inv.total) < 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                  {Number(inv.total) < 0 ? 'Refund' : 'Sale'}
                                </span>
                              </td>
                              <td className="px-4 py-2 font-medium text-gray-600">
                                <div className="font-bold text-slate-800">{inv.payment_method || 'CASH'}</div>
                                {((Number(inv.cash_paid || 0) > 0 && Number(inv.card_paid || 0) > 0) || Number(inv.other_paid || 0) > 0) && (
                                  <div className="text-[10px] text-gray-500 font-mono flex flex-wrap gap-1 mt-0.5">
                                    {Number(inv.cash_paid || 0) > 0 && <span className="bg-emerald-50 text-emerald-800 px-1 rounded">Cash Rs. {Number(inv.cash_paid).toLocaleString()}</span>}
                                    {Number(inv.card_paid || 0) > 0 && <span className="bg-blue-50 text-blue-800 px-1 rounded">Card Rs. {Number(inv.card_paid).toLocaleString()}</span>}
                                    {Number(inv.other_paid || 0) > 0 && <span className="bg-purple-50 text-purple-800 px-1 rounded">Bank Rs. {Number(inv.other_paid).toLocaleString()}</span>}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-2 text-right font-bold text-brand-dark">Rs. {Number(inv.total).toLocaleString()}</td>
                            </tr>
                          ))}
                          {invs.length === 0 && (
                            <tr>
                              <td colSpan={5} className="py-8 text-center text-gray-400">
                                {stats.netSales > 0 ? 'Individual invoice records for this shift were reset or deleted from billing history.' : 'No invoices generated in this session.'}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Tab 3: Cash Movements */}
                  {activeModalTab === 'movements' && (
                    <div className="border border-gray-100 rounded-2xl overflow-hidden max-h-72 overflow-y-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-gray-50 font-bold text-gray-500 uppercase border-b border-gray-100 sticky top-0">
                          <tr>
                            <th className="px-4 py-2.5">Type</th>
                            <th className="px-4 py-2.5">Time</th>
                            <th className="px-4 py-2.5">Notes</th>
                            <th className="px-4 py-2.5 text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {txs.map((t: any) => (
                            <tr key={t.id} className="hover:bg-gray-50">
                              <td className="px-4 py-2 font-bold flex items-center">
                                {t.type === 'CASH_IN' ? <ArrowUpRight size={13} className="text-emerald-500 mr-1" /> : <ArrowDownRight size={13} className="text-rose-500 mr-1" />}
                                {t.type.replace('_', ' ')}
                              </td>
                              <td className="px-4 py-2 text-gray-500">{formatSriLankaDateTime(t.created_at, { timeOnly: true })}</td>
                              <td className="px-4 py-2 text-gray-600 font-medium">{t.notes || '-'}</td>
                              <td className={`px-4 py-2 text-right font-bold ${t.type === 'CASH_IN' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {t.type === 'CASH_IN' ? '+' : '-'} Rs. {Number(t.amount).toLocaleString()}
                              </td>
                            </tr>
                          ))}
                          {txs.length === 0 && (
                            <tr><td colSpan={4} className="py-8 text-center text-gray-400">No cash movements recorded.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })() : null}
          </div>
        </div>
      )}

      {/* Till Transaction Modal */}
      {showTxModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl">
            <h3 className="text-lg font-black text-brand-dark mb-6">Record Till Transaction</h3>
            <form onSubmit={handleTx}>
              <div className="mb-4">
                <label className="block text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2">Type</label>
                <select className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none font-semibold text-sm text-brand-dark bg-gray-50 focus:border-brand-primary" value={newTx.type} onChange={e => setNewTx({ ...newTx, type: e.target.value })}>
                  <option value="CASH_IN">Cash In (Add float/change)</option>
                  <option value="CASH_OUT">Cash Drop / Withdrawal</option>
                  <option value="EXPENSE">Expense (Petty Cash)</option>
                </select>
              </div>
              <div className="mb-4">
                <label className="block text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2">Amount (Rs.)</label>
                <input type="number" className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 text-lg font-black text-brand-dark bg-white transition-all" value={newTx.amount} onChange={e => setNewTx({ ...newTx, amount: e.target.value })} required autoFocus />
              </div>
              <div className="mb-6">
                <label className="block text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2">Reference / Notes</label>
                <input type="text" className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-brand-primary text-sm font-medium text-brand-dark bg-white" value={newTx.notes} onChange={e => setNewTx({ ...newTx, notes: e.target.value })} required placeholder="E.g., Bought tea/milk..." />
              </div>
              <div className="flex space-x-3">
                <button type="button" onClick={() => setShowTxModal(false)} className="flex-1 px-4 py-3 rounded-xl font-bold text-sm text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors">Cancel</button>
                <button type="submit" className="flex-1 px-4 py-3 rounded-xl font-bold text-sm text-white bg-brand-primary shadow-lg shadow-brand-primary/30 hover:bg-opacity-90 transition-all">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}