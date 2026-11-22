import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';

import CheckoutModal from './CheckoutModal';
import CustomerModal from './CustomerModal';
import { Invoice } from './Invoice';
import OpenSessionModal from './OpenSessionModal';
import RefundView from './RefundView';
import SalesHistoryView from './SalesHistoryView';
import WeighedItemModal from './WeighedItemModal';
import { useCartStore } from '../store/cartStore';
import { isAgentRunning, printReceiptViaAgent, openCashDrawerViaAgent } from '../lib/printAgent';
import { isWeighedOrVolumeUnit, formatQuantityWithUnit } from '../utils/units';
import { getSriLankaNowString, formatSriLankaDateTime, formatReceiptDate } from '../utils/dateUtils';
import { 
  Search, Trash2, Plus, Minus, CreditCard, Banknote, ShoppingBag, 
  Package, Sparkles, X, Wallet, Pause, Play, User, ArrowLeftRight, 
  DoorOpen, Percent, Ticket, BarChart2, Printer, CheckCircle, 
  AlertCircle, AlertTriangle, Eye, EyeOff, Layers, RotateCcw, 
  Wifi, WifiOff, RefreshCw, ShoppingCart, Tag, Scale, LayoutDashboard, 
  Check, ArrowRight, Lock, Unlock, Key, ShieldCheck, CheckCircle2, Clock, ArrowUpRight,
  LayoutGrid, Grid2X2, List, CornerDownLeft, LogOut, FileText
} from 'lucide-react';

function ActionButton({ icon, label, sub, color, onClick, disabled, active }: any) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center justify-center rounded-xl border p-2 transition-all active:scale-[0.96] shadow-2xs select-none ${
        disabled
          ? 'opacity-40 cursor-not-allowed border-gray-100 bg-gray-50'
          : active
          ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
          : 'border-emerald-100 bg-white hover:border-emerald-500 hover:bg-emerald-50/60 hover:shadow-xs'
      }`}
    >
      <div style={{ color: active ? 'white' : color }} className="mb-0.5">{icon}</div>
      <span className={`text-[10px] font-black leading-tight ${active ? 'text-white' : 'text-slate-800'}`}>{label}</span>
      {sub && <span className={`text-[8px] font-bold ${active ? 'text-white/80' : 'text-slate-400'}`}>{sub}</span>}
    </button>
  );
}

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

export default function POS({ currentUser, onUserChange, onExitToBackoffice, onNavigate, onLogout }: any) {
  const [activeCashier, setActiveCashier] = useState<any>(currentUser || { username: 'Cashier', role: 'Cashier' });
  useEffect(() => {
    if (currentUser) {
      setActiveCashier(currentUser);
      if (currentUser.terminalConfig) {
        setTerminalConfig(currentUser.terminalConfig);
      }
      loadInitialData();
    }
  }, [currentUser]);

  // Restrict Back Office access: Only Admin, Manager, or users with backoffice permissions
  const canAccessBackoffice = useMemo(() => {
    const user = activeCashier || currentUser;
    if (!user) return false;
    const role = (user.role || '').toLowerCase();
    if (role === 'admin' || role === 'manager') return true;
    const perms: string[] = Array.isArray(user.permissions) ? user.permissions : [];
    const backofficePerms = ['Reports', 'Inventory', 'Settings', 'Users', 'Suppliers', 'GRN', 'Branches', 'Backup Hub', 'Dashboard', 'View Invoices', 'Refunds', 'Customers'];
    return perms.some(p => backofficePerms.includes(p));
  }, [activeCashier, currentUser]);

  // Authorization check for Price Override (Admin, Manager, Supervisor, or Price Override permission)
  const isAuthorizedForPriceChange = (user: any): boolean => {
    if (!user) return false;
    const role = (user.role || '').toLowerCase();
    if (['admin', 'manager', 'supervisor'].includes(role)) return true;
    let perms: string[] = [];
    if (Array.isArray(user.permissions)) perms = user.permissions;
    else if (typeof user.permissions === 'string') {
      try { perms = JSON.parse(user.permissions); } catch { perms = user.permissions.split(','); }
    }
    const lowerPerms = perms.map((p: string) => (p || '').toLowerCase());
    return lowerPerms.some((p: string) => ['price override', 'price_override', 'priceoverride', 'admin', 'manager', 'supervisor', 'all'].includes(p));
  };

  // Lock Screen State (Fast PIN Unlock for rest/breaks)
  const [isLocked, setIsLocked] = useState(false);
  const [lockPin, setLockPin] = useState('');
  const [lockError, setLockError] = useState('');
  const [lockTime, setLockTime] = useState<Date | null>(null);
  const [showAdminOverride, setShowAdminOverride] = useState(false);
  const [adminOverrideUser, setAdminOverrideUser] = useState('');
  const [adminOverridePin, setAdminOverridePin] = useState('');

  // Shift Handover State (Continuous Supermarket Day Session)
  const [showShiftHandover, setShowShiftHandover] = useState(false);
  const [shiftSummary, setShiftSummary] = useState<any>(null);
  const [loadingShiftSummary, setLoadingShiftSummary] = useState(false);
  const [handoverCountedCash, setHandoverCountedCash] = useState<string>('');
  const [handoverNotes, setHandoverNotes] = useState<string>('');
  const [incomingCashierUsername, setIncomingCashierUsername] = useState<string>('');
  const [incomingCashierPin, setIncomingCashierPin] = useState<string>('');
  const [incomingCashierError, setIncomingCashierError] = useState<string>('');
  const [systemUsersList, setSystemUsersList] = useState<any[]>([]);
  const [handoverSuccessSlip, setHandoverSuccessSlip] = useState<any | null>(null);

  // Back Office Authorization Modal for restricted terminals/cashiers
  const [showBackofficeAuthModal, setShowBackofficeAuthModal] = useState<boolean>(false);
  const [backofficeAuthPin, setBackofficeAuthPin] = useState<string>('');
  const [backofficeAuthError, setBackofficeAuthError] = useState<string>('');
  const [isAuthorizingBackoffice, setIsAuthorizingBackoffice] = useState<boolean>(false);

  const handleBackofficeAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBackofficeAuthError('');
    if (!backofficeAuthPin.trim()) return;

    setIsAuthorizingBackoffice(true);
    try {
      // @ts-ignore
      const res = await window.db.verifyPin({ pin: backofficeAuthPin });
      const isAdminOrManager = res?.success && (res.user?.role === 'Admin' || res.user?.role === 'Manager' || (res.user?.username || '').toLowerCase() === 'admin');
      if (isAdminOrManager) {
        setShowBackofficeAuthModal(false);
        setBackofficeAuthPin('');
        if (onExitToBackoffice) onExitToBackoffice();
        else if (onNavigate) onNavigate('dashboard');
      } else {
        setBackofficeAuthError('Access Denied: Only Manager or Admin PIN can authorize Back Office access on this terminal.');
      }
    } catch (err: any) {
      setBackofficeAuthError('Verification error: ' + err.message);
    } finally {
      setIsAuthorizingBackoffice(false);
    }
  };

  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<{id: number, name: string}[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [search, setSearch] = useState('');
  const [pricingType, setPricingType] = useState<'retail' | 'wholesale'>('retail');

  // Real Wholesale Price Checker: Only products with a positive wholesale price distinct from retail price have wholesale
  const hasRealWholesalePrice = (p: any): boolean => {
    if (!p) return false;
    const ws = Number(p.wholesale_price);
    const rt = Number(p.price);
    return !isNaN(ws) && ws > 0 && ws !== rt;
  };

  const getActiveProductPrice = (prod: any, mode: 'retail' | 'wholesale'): number => {
    if (!prod) return 0;
    if (mode === 'wholesale' && hasRealWholesalePrice(prod)) {
      return Number(prod.wholesale_price);
    }
    return Number(prod.price || 0);
  };
  const [posViewMode, setPosViewMode] = useState<'cards' | 'compact' | 'list'>(() => {
    try {
      return (localStorage.getItem('pos_view_mode') as any) || 'cards';
    } catch {
      return 'cards';
    }
  });

  // Smart Product Lookup Popup state
  const [showLookupModal, setShowLookupModal] = useState(false);
  const [lookupQuery, setLookupQuery] = useState('');
  const [lookupSelectedIndex, setLookupSelectedIndex] = useState(0);
  const lookupInputRef = useRef<HTMLInputElement>(null);

  // Manual Quantity Prompt Modal
  const [quantityModalProduct, setQuantityModalProduct] = useState<any | null>(null);
  const [quantityModalCartItem, setQuantityModalCartItem] = useState<any | null>(null);
  const [quantityInputVal, setQuantityInputVal] = useState('1');
  const [quantityPriceOverride, setQuantityPriceOverride] = useState('');
  const quantityInputRef = useRef<HTMLInputElement>(null);

  // Cart-Level Price Override Modal
  const [showPriceOverrideModal, setShowPriceOverrideModal] = useState(false);
  const [priceOverrideItems, setPriceOverrideItems] = useState<{ cartId: string; name: string; unit: string; originalPrice: number; newPrice: string; quantity: number }[]>([]);

  // Item-Level Discount Modal
  const [discountModalItem, setDiscountModalItem] = useState<any | null>(null);
  const [itemDiscountType, setItemDiscountType] = useState<'percent' | 'fixed'>('percent');
  const [itemDiscountVal, setItemDiscountVal] = useState('');
  const itemDiscountInputRef = useRef<HTMLInputElement>(null);

  // Whole-Cart Bill Discount Modal
  const [showBillDiscountModal, setShowBillDiscountModal] = useState(false);
  const [billDiscountType, setBillDiscountType] = useState<'percent' | 'fixed'>('percent');
  const [billDiscountVal, setBillDiscountVal] = useState('');
  const billDiscountInputRef = useRef<HTMLInputElement>(null);

  // Promotions Engine
  const [promotions, setPromotions] = useState<any[]>([]);
  const [showPromotionsModal, setShowPromotionsModal] = useState(false);

  // Loyalty Redemption Modal
  const [showLoyaltyModal, setShowLoyaltyModal] = useState(false);
  const [loyaltyRedeemInput, setLoyaltyRedeemInput] = useState('');

  // Shortcuts Help Guide Modal
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);

  // Modals & Popups
  const [variantModalProduct, setVariantModalProduct] = useState<any | null>(null);
  const [weighedModalProduct, setWeighedModalProduct] = useState<any | null>(null);
  const [editingCartItem, setEditingCartItem] = useState<any | null>(null);
  const [showHeldBills, setShowHeldBills] = useState(false);
  const [heldBills, setHeldBills] = useState<any[]>([]);
  const [showCustomer, setShowCustomer] = useState(false);
  const [activeCustomer, setActiveCustomer] = useState<any>(null);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [showInvoicesModal, setShowInvoicesModal] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [globalDiscount, setGlobalDiscount] = useState<number>(0);
  const [showVoucherModal, setShowVoucherModal] = useState(false);
  const [voucherCode, setVoucherCode] = useState('');
  const [voucherModalError, setVoucherModalError] = useState('');
  const [voucherModalResult, setVoucherModalResult] = useState<any>(null);
  const [isVoucherValidating, setIsVoucherValidating] = useState(false);
  const [appliedVoucher, setAppliedVoucher] = useState<any>(null);

  // Custom / Open Item Modal State
  const [showCustomItemModal, setShowCustomItemModal] = useState(false);
  const [customItemForm, setCustomItemForm] = useState({
    name: '',
    quantity: 1,
    unit: 'pc',
    price: '',
    notes: ''
  });

  // Post-checkout receipt modal
  const [receiptData, setReceiptData] = useState<any>(null);
  const [printStatus, setPrintStatus] = useState<'idle' | 'printing' | 'success' | 'error'>('idle');
  const [printError, setPrintError] = useState<string>('');
  const [agentOnline, setAgentOnline] = useState<boolean>(false);
  const [showInvoicePreview, setShowInvoicePreview] = useState<boolean>(false);
  const receiptDataRef = useRef<any>(null);
  receiptDataRef.current = receiptData;

  const [activeSession, setActiveSession] = useState<any>(null);
  const [showOpenSessionModal, setShowOpenSessionModal] = useState<boolean>(false);

  // Sync & Terminal metadata
  const [syncStatus, setSyncStatus] = useState<any>({ online: true });
  const [syncing, setSyncing] = useState(false);
  const [terminalConfig, setTerminalConfig] = useState<any>(() => {
    return currentUser?.terminalConfig || {
      current_terminal_id: 'TERM-01',
      current_terminal_name: 'Touch Terminal 01',
      current_branch_id: 'BR-MAIN',
      current_branch_name: 'Main FreshMart Branch'
    };
  });

  const [settings, setSettings] = useState<any>({
    storeName: 'Nova FreshMart',
    tagline: 'Fresh Quality Daily'
  });

  const isAdmin = useMemo(() => {
    const role = (activeCashier?.role || currentUser?.role || '').toLowerCase();
    return role === 'admin';
  }, [activeCashier, currentUser]);

  // Live Running Clock in Header
  const [liveClock, setLiveClock] = useState(() => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  const [liveDate, setLiveDate] = useState(() => new Date().toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }));

  useEffect(() => {
    const timer = setInterval(() => {
      const d = new Date();
      setLiveClock(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setLiveDate(d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleRequestOpenDrawer = async () => {
    playBeep(2400, 0.1);
    const kickRes: any = await openCashDrawerViaAgent(settings.printerName);
    if (!kickRes?.ok) {
      alert('Drawer kick error: ' + (kickRes?.error || 'Agent unreachable'));
    }
  };

  const cart = useCartStore();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scanBufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);
  const isCheckingOutRef = useRef<boolean>(false);

  // Sound feedback
  const playBeep = (freq = 1760, duration = 0.08) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {}
  };

  const focusSearch = () => {
    setTimeout(() => {
      if (searchInputRef.current && document.activeElement !== searchInputRef.current) {
        searchInputRef.current.focus();
        searchInputRef.current.select();
      }
    }, 40);
  };

  useEffect(() => {
    loadInitialData();
    loadSyncAndTerminal();
    loadHeldBills();

    const syncInterval = setInterval(() => {
      loadSyncAndTerminal();
    }, 30000);

    const handleSyncCompleted = () => {
      loadSyncAndTerminal();
      // @ts-ignore
      if (window.db?.invoke) {
        // @ts-ignore
        window.db.invoke('get-promotions-advanced').then((promoList: any) => {
          if (Array.isArray(promoList)) setPromotions(promoList);
        }).catch(() => {});
      }
      // @ts-ignore
      if (window.db?.invoke) {
        // @ts-ignore
        window.db.invoke('get-products-advanced').then((p: any) => {
          if (Array.isArray(p) && p.length > 0) setProducts(p);
        }).catch(() => {
          // @ts-ignore
          if (window.db?.getProducts) {
            // @ts-ignore
            window.db.getProducts().then((p: any) => {
              if (Array.isArray(p) && p.length > 0) setProducts(p);
            }).catch(() => {});
          }
        });
      } else if (window.db?.getProducts) {
        // @ts-ignore
        window.db.getProducts().then((p: any) => {
          if (Array.isArray(p) && p.length > 0) setProducts(p);
        }).catch(() => {});
      }
      // @ts-ignore
      if (window.db?.getCategories) {
        // @ts-ignore
        window.db.getCategories().then((cats: any) => {
          if (Array.isArray(cats) && cats.length > 0) setCategories(cats);
        }).catch(() => {});
      }
    };

    // @ts-ignore
    window.ipcRenderer?.on('sync-completed', handleSyncCompleted);
    // @ts-ignore
    window.ipcRenderer?.on('sync-data-updated', handleSyncCompleted);
    // @ts-ignore
    window.ipcRenderer?.on('products-updated', handleSyncCompleted);

    const handleWindowFocus = () => {
      handleSyncCompleted();
    };
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      clearInterval(syncInterval);
      window.removeEventListener('focus', handleWindowFocus);
      // @ts-ignore
      window.ipcRenderer?.off('sync-completed', handleSyncCompleted);
      // @ts-ignore
      window.ipcRenderer?.off('sync-data-updated', handleSyncCompleted);
      // @ts-ignore
      window.ipcRenderer?.off('products-updated', handleSyncCompleted);
    };
  }, []);

  const loadInitialData = async () => {
    // @ts-ignore
    if (!window.db) return;
    try {
      // @ts-ignore
      let prods: any[] = [];
      // @ts-ignore
      if (window.db?.invoke) {
        try {
          // @ts-ignore
          prods = await window.db.invoke('get-products-advanced');
        } catch (_) {}
      }
      if (!Array.isArray(prods) || prods.length === 0) {
        // @ts-ignore
        if (window.db?.getProducts) {
          // @ts-ignore
          prods = await window.db.getProducts().catch((err: any) => {
            console.error('getProducts failed:', err);
            return [];
          });
        }
      }
      if (Array.isArray(prods) && prods.length > 0) {
        setProducts(prods);
      } else if (Array.isArray(prods)) {
        setProducts(prods);
      }

      // @ts-ignore
      const cats = await window.db.getCategories().catch((err: any) => {
        console.error('getCategories failed:', err);
        return [];
      });
      if (Array.isArray(cats)) setCategories(cats);

      // @ts-ignore
      const sess = await window.db.getActiveSession(terminalConfig.current_terminal_id).catch((err: any) => {
        console.error('getActiveSession failed:', err);
        return null;
      });
      const isSessOpen = sess && (sess.status === 'OPEN' || sess.status === 'open');
      if (isSessOpen) {
        setActiveSession(sess);
      } else {
        setActiveSession(null);
      }

      // @ts-ignore
      const sets = await window.db.invoke('get-settings').catch((err: any) => {
        console.error('get-settings failed:', err);
        return {};
      });
      if (sets && typeof sets === 'object') setSettings(sets);

      // Load active promotions engine campaigns
      try {
        // @ts-ignore
        const promoList = await window.db.invoke('get-promotions-advanced');
        if (Array.isArray(promoList)) setPromotions(promoList);
      } catch (err) {
        console.warn('Failed to load promotions:', err);
      }

      const agentUp = await isAgentRunning();
      setAgentOnline(agentUp);
    } catch (e) {
      console.error('Failed to load POS data:', e);
    }
  };

  const loadSyncAndTerminal = async () => {
    // @ts-ignore
    if (!window.db) return;
    try {
      // @ts-ignore
      const st = await window.db.getSyncStatus();
      setSyncStatus(st);
      if (st?.config) {
        setTerminalConfig(st.config);
        const tid = st.config.current_terminal_id;
        // @ts-ignore
        const sess = await window.db.getActiveSession(tid).catch(() => null);
        if (sess && (sess.status === 'OPEN' || sess.status === 'open')) {
          setActiveSession(sess);
        }
      }

      // Periodically refresh active promotions so newly synced campaigns apply automatically
      // @ts-ignore
      const promoList = await window.db.invoke('get-promotions-advanced').catch(() => []);
      if (Array.isArray(promoList)) {
        setPromotions(promoList);
      }
    } catch (e) {
      console.warn('Sync status fetch failed:', e);
    }
  };

  const loadHeldBills = async () => {
    // @ts-ignore
    if (!window.db?.getHeldBills) return;
    try {
      // @ts-ignore
      const bills = await window.db.getHeldBills();
      setHeldBills(bills || []);
    } catch (e) {
      console.warn('Failed to load held bills:', e);
    }
  };

  const handleManualSync = async () => {
    setSyncing(true);
    // @ts-ignore
    if (window.db?.triggerSync) {
      try {
        // @ts-ignore
        await window.db.triggerSync();
        playBeep(2200, 0.1);
        await loadInitialData();
        await loadSyncAndTerminal();
      } catch (err) {
        console.warn('Sync failed:', err);
      }
    }
    setSyncing(false);
  };

  // Lock Screen Trigger
  const handleLockScreen = () => {
    setLockPin('');
    setLockError('');
    setLockTime(new Date());
    setShowAdminOverride(false);
    setIsLocked(true);
    playBeep(1200, 0.08);
  };

  // PIN Unlock Execution
  const handleUnlockWithPin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!lockPin.trim()) return;
    setLockError('');
    try {
      // @ts-ignore
      const res = await window.db.verifyPin({ 
        username: activeCashier?.username, 
        pin: lockPin 
      });
      if (res && res.success) {
        playBeep(2400, 0.1);
        setIsLocked(false);
        setLockPin('');
      } else {
        playBeep(350, 0.2);
        setLockError(res?.error || 'Incorrect PIN. Please try again.');
      }
    } catch (err: any) {
      setLockError('Verification failed: ' + err.message);
    }
  };

  // Admin / Supervisor Override Unlock
  const handleAdminOverrideUnlock = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!adminOverrideUser || !adminOverridePin) return;
    setLockError('');
    try {
      // @ts-ignore
      const res = await window.db.verifyPin({
        username: adminOverrideUser,
        pin: adminOverridePin
      });
      if (res && res.success && (res.user.role === 'Admin' || res.user.role === 'Manager')) {
        playBeep(2600, 0.12);
        setIsLocked(false);
        setLockPin('');
        setShowAdminOverride(false);
      } else {
        setLockError('Manager override denied: User is not Admin or Manager.');
      }
    } catch (err: any) {
      setLockError('Override error: ' + err.message);
    }
  };

  // Shift Handover Initiation
  const handleOpenShiftHandover = async () => {
    setLoadingShiftSummary(true);
    setShowShiftHandover(true);
    setIncomingCashierError('');
    setHandoverCountedCash('');
    setHandoverNotes('');
    setIncomingCashierPin('');
    setIncomingCashierUsername('');
    setHandoverSuccessSlip(null);

    try {
      // Fetch users for incoming cashier dropdown
      // @ts-ignore
      if (window.db?.getUsers) {
        // @ts-ignore
        const uList = await window.db.getUsers();
        setSystemUsersList((uList || []).filter((u: any) => u.username !== activeCashier?.username));
      }
      // Fetch shift summary
      // @ts-ignore
      if (window.db?.getCashierShiftSummary && activeSession?.id) {
        // @ts-ignore
        const sum = await window.db.getCashierShiftSummary({
          sessionId: activeSession.id,
          cashier: activeCashier?.username || 'Cashier',
          terminalId: terminalConfig.current_terminal_id
        });
        setShiftSummary(sum);
      } else {
        setShiftSummary({
          sessionId: activeSession?.id || 1,
          cashier: activeCashier?.username || 'Cashier',
          shiftStartTime: activeSession?.opened_at || new Date().toISOString(),
          openingFloat: activeSession?.opening_cash || 0,
          billsCount: 0,
          totalSales: 0,
          cashSales: 0,
          cardSales: 0,
          otherSales: 0,
          expectedDrawerCash: activeSession?.opening_cash || 0
        });
      }
    } catch (err) {
      console.error('Failed to load shift summary:', err);
    } finally {
      setLoadingShiftSummary(false);
    }
  };

  // Terminal Session Opening Handler
  const handleOpenSessionOnTerminal = async (openingCash: number) => {
    try {
      // @ts-ignore
      await window.db.invoke('open-session', {
        openingCash,
        username: activeCashier?.username || currentUser?.username || 'Cashier',
        terminalId: terminalConfig.current_terminal_id
      });
      setShowOpenSessionModal(false);
      // @ts-ignore
      const sess = await window.db.getActiveSession(terminalConfig.current_terminal_id);
      setActiveSession(sess);
      alert(`✓ Day Session opened successfully on ${terminalConfig.current_terminal_name || terminalConfig.current_terminal_id} with float Rs. ${openingCash.toLocaleString()}!`);
    } catch (err: any) {
      alert('Failed to open session: ' + (err.message || err));
    }
  };

  // Shift Handover Submission
  const handleCompleteShiftHandover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!incomingCashierUsername) {
      setIncomingCashierError('Please select the incoming cashier.');
      return;
    }
    if (!incomingCashierPin) {
      setIncomingCashierError('Incoming cashier PIN is required.');
      return;
    }

    setIncomingCashierError('');
    try {
      // @ts-ignore
      const authRes = await window.db.verifyPin({
        username: incomingCashierUsername,
        pin: incomingCashierPin
      });

      if (!authRes || !authRes.success) {
        setIncomingCashierError('Invalid PIN for ' + incomingCashierUsername);
        return;
      }

      const counted = Number(handoverCountedCash || 0);
      const expected = Number(shiftSummary?.expectedDrawerCash || 0);
      const variance = counted - expected;

      const handoverData = {
        sessionId: activeSession?.id || 1,
        branchId: terminalConfig.current_branch_id,
        terminalId: terminalConfig.current_terminal_id,
        outgoingCashier: activeCashier?.username || 'Cashier',
        incomingCashier: incomingCashierUsername,
        shiftStartedAt: shiftSummary?.shiftStartTime,
        billsCount: shiftSummary?.billsCount || 0,
        cashSales: shiftSummary?.cashSales || 0,
        cardSales: shiftSummary?.cardSales || 0,
        otherSales: shiftSummary?.otherSales || 0,
        totalSales: shiftSummary?.totalSales || 0,
        openingFloat: shiftSummary?.openingFloat || 0,
        expectedDrawerCash: expected,
        countedCash: counted,
        cashVariance: variance,
        handoverNotes: handoverNotes.trim()
      };

      // @ts-ignore
      const saveRes = await window.db.recordShiftHandover(handoverData);

      const slip = {
        id: saveRes.id,
        ...handoverData,
        handoverTime: new Date().toLocaleString()
      };

      setHandoverSuccessSlip(slip);
      playBeep(2400, 0.15);

      const newUser = authRes.user;
      setActiveCashier(newUser);
      if (onUserChange) onUserChange(newUser);
      if (isLocked) setIsLocked(false);
    } catch (err: any) {
      setIncomingCashierError('Handover failed: ' + err.message);
    }
  };

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 0. Sale Completed Receipt Modal: Enter prints and continues, Esc exits/skips
      if (receiptDataRef.current) {
        if (e.key === 'Enter') {
          e.preventDefault();
          executePrint(receiptDataRef.current);
          setReceiptData(null);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setReceiptData(null);
          return;
        }
      }

      if (isLocked) {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleUnlockWithPin();
        }
        return;
      }

      // Universal Escape handler to close any active modal
      if (e.key === 'Escape') {
        e.preventDefault();
        if (showLookupModal) { setShowLookupModal(false); return; }
        if (quantityModalProduct || quantityModalCartItem) { 
          setQuantityModalProduct(null); 
          setQuantityModalCartItem(null); 
          return; 
        }
        if (showCheckout) { setShowCheckout(false); return; }
        if (showBillDiscountModal) { setShowBillDiscountModal(false); return; }
        if (discountModalItem) { setDiscountModalItem(null); return; }
        if (showPromotionsModal) { setShowPromotionsModal(false); return; }
        if (showLoyaltyModal) { setShowLoyaltyModal(false); return; }
        if (showCustomer) { setShowCustomer(false); return; }
        if (showHeldBills) { setShowHeldBills(false); return; }
        if (showCustomItemModal) { setShowCustomItemModal(false); return; }
        if (showShortcutsHelp) { setShowShortcutsHelp(false); return; }
        if (showVoucherModal) { setShowVoucherModal(false); return; }
        if (showRefundModal) { setShowRefundModal(false); return; }
        if (showInvoicesModal) { setShowInvoicesModal(false); return; }
        if (showPriceOverrideModal) { setShowPriceOverrideModal(false); return; }
        return;
      }

      // Global POS Shortcuts
      if (e.key === 'F1' || (e.ctrlKey && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        setShowLookupModal(true);
        setLookupQuery('');
        setLookupSelectedIndex(0);
      } else if (e.key === 'F2') {
        e.preventDefault();
        // F2: Edit Quantity of last cart item
        if (cart.items.length > 0) {
          const lastItem = cart.items[cart.items.length - 1];
          setQuantityModalCartItem(lastItem);
          setQuantityModalProduct(null);
          setQuantityInputVal(String(lastItem.quantity));
          setQuantityPriceOverride(String(lastItem.price));
        } else {
          setShowLookupModal(true);
        }
      } else if (e.key === 'F3') {
        e.preventDefault();
        // F3: Item-level discount on last cart item
        if (cart.items.length > 0) {
          const lastItem = cart.items[cart.items.length - 1];
          setDiscountModalItem(lastItem);
          setItemDiscountType(lastItem.discountType || 'percent');
          setItemDiscountVal(lastItem.discountPercent ? String(lastItem.discountPercent) : (lastItem.discount ? String(lastItem.discount) : ''));
        } else {
          alert('Add an item to the cart first to apply item discount.');
        }
      } else if (e.key === 'F4') {
        e.preventDefault();
        // F4: Whole-cart Bill Discount
        if (cart.items.length > 0) {
          setShowBillDiscountModal(true);
          setBillDiscountType(cart.billDiscount.type);
          setBillDiscountVal(cart.billDiscount.value ? String(cart.billDiscount.value) : '');
        } else {
          alert('Add items to the cart first to apply bill discount.');
        }
      } else if (e.key === 'F5') {
        e.preventDefault();
        // F5: Promotions Engine
        handleOpenPromotionsModal();
      } else if (e.key === 'F6' && !e.shiftKey) {
        e.preventDefault();
        // F6: Customer & Loyalty Points
        if (activeCustomer && (activeCustomer.points || 0) > 0) {
          setShowLoyaltyModal(true);
        } else {
          setShowCustomer(true);
        }
      } else if (e.key === 'Insert' || (e.altKey && (e.key === 'c' || e.key === 'C')) || (e.shiftKey && e.key === 'F6')) {
        // Insert / Alt+C / Shift+F6: Open Custom Item Modal
        e.preventDefault();
        setCustomItemForm({ name: '', quantity: 1, unit: 'pc', price: '', notes: '' });
        setShowCustomItemModal(true);
      } else if (e.key === 'F7') {
        e.preventDefault();
        // F7: Hold current bill
        handleHoldBill(false);
      } else if (e.key === 'F8') {
        e.preventDefault();
        // F8: Recall held bills
        loadHeldBills();
        setShowHeldBills(true);
      } else if (e.key === 'F9' || e.code === 'Space') {
        const activeTag = document.activeElement?.tagName;
        if (e.code === 'Space' && (activeTag === 'INPUT' || activeTag === 'TEXTAREA')) {
          return;
        }
        e.preventDefault();
        // F9 / Space: Checkout Modal
        if (cart.items.length === 0) {
          alert('Cart is empty. Please add items first.');
          return;
        }
        if (!activeSession) {
          alert(`Cannot process bill: Cash register session is CLOSED for this terminal (${terminalConfig.current_terminal_name || terminalConfig.current_terminal_id}). Please open a session first!`);
          setShowOpenSessionModal(true);
          return;
        }
        setShowCheckout(true);
      } else if (e.key === 'F10') {
        e.preventDefault();
        // F10: Fast Exact Cash Checkout
        handleFastCashCheckout();
      } else if (e.key === 'F11' || e.key === 'Delete') {
        const activeTag = document.activeElement?.tagName;
        if (e.key === 'Delete' && (activeTag === 'INPUT' || activeTag === 'TEXTAREA')) {
          return;
        }
        e.preventDefault();
        // F11: Clear Cart / Void
        if (cart.items.length > 0 && confirm('Void / Clear all items from cart?')) {
          cart.clearCart();
        }
      } else if (e.key === 'F12') {
        e.preventDefault();
        // F12: Shift Handover
        handleOpenShiftHandover();
      } else if (e.ctrlKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        handleLockScreen();
      } else if (e.ctrlKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        handleRequestOpenDrawer();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'i' || e.key === 'I')) {
        e.preventDefault();
        setShowInvoicesModal(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    cart.items, settings, isLocked, lockPin, activeCashier,
    showLookupModal, quantityModalProduct, quantityModalCartItem, showCheckout,
    showBillDiscountModal, discountModalItem, showPromotionsModal, showLoyaltyModal,
    showCustomer, showHeldBills, showCustomItemModal, showShortcutsHelp,
    showVoucherModal, showRefundModal
  ]);

  // Helper to match barcodes flexibly (handles scale codes '001', '1', PLU, item_code, SKU, EAN-13, and IDs)
  const findProductByBarcodeOrCode = (code: string) => {
    if (!code) return null;
    const clean = code.trim().toLowerCase();
    const cleanNoLeading = clean.replace(/^0+/, '');
    const cleanPadded3 = cleanNoLeading.padStart(3, '0');

    return products.find(p => {
      const pBc = (p.barcode || '').trim().toLowerCase();
      const pPlu = (p.plu || '').trim().toLowerCase();
      const pItemCode = ((p as any).item_code || (p as any).code || '').trim().toLowerCase();
      const pSku = ((p as any).sku || '').trim().toLowerCase();
      const pId = String(p.id);

      return (
        pBc === clean ||
        pBc === cleanNoLeading ||
        pBc === cleanPadded3 ||
        pPlu === clean ||
        pPlu === cleanNoLeading ||
        pItemCode === clean ||
        pItemCode === cleanNoLeading ||
        pSku === clean ||
        pSku === cleanNoLeading ||
        pId === clean
      );
    });
  };

  const handleSetPosViewMode = (mode: 'cards' | 'compact' | 'list') => {
    setPosViewMode(mode);
    try {
      localStorage.setItem('pos_view_mode', mode);
    } catch {}
  };

  useEffect(() => {
    if (showLookupModal) {
      setTimeout(() => {
        lookupInputRef.current?.focus();
        lookupInputRef.current?.select();
      }, 50);
    }
  }, [showLookupModal]);

  // Smart Product Lookup matching across Name, Barcode, PLU, and Item Code
  const smartLookupResults = useMemo(() => {
    const q = lookupQuery.toLowerCase().trim();
    if (!q) {
      return products.slice(0, 40);
    }
    const tokens = q.split(/\s+/).filter(Boolean);

    const matches = products.map(p => {
      let score = 0;
      const name = (p.name || '').toLowerCase();
      const barcode = (p.barcode || '').toLowerCase();
      const plu = p.plu ? String(p.plu).toLowerCase() : '';
      const code = (p.item_code || '').toLowerCase();

      // Exact barcode match
      if (barcode === q) score += 120;
      else if (barcode.startsWith(q)) score += 60;
      else if (barcode.includes(q)) score += 25;

      // Exact PLU match or leading zeroes match (e.g. 034 vs 34)
      if (plu && (plu === q || plu === q.replace(/^0+/, '') || ('000' + plu).endsWith(q))) score += 110;
      else if (plu && plu.includes(q)) score += 35;

      // Exact item code match
      if (code === q) score += 90;
      else if (code.includes(q)) score += 30;

      // Token / name matching
      const allTokensMatch = tokens.every(t => name.includes(t));
      if (allTokensMatch) {
        score += 50;
        if (name.startsWith(q)) score += 30;
      }

      return { product: p, score };
    });

    return matches
      .filter(m => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 50)
      .map(m => m.product);
  }, [products, lookupQuery]);

  // Barcode hardware scanner buffer - GLOBAL: works anywhere on the POS screen without tapping the search bar!
  useEffect(() => {
    const handleBarcodeInput = (e: KeyboardEvent) => {
      // Suppress if system is locked or critical modal requiring isolated numerical input is open
      if (isLocked || showShiftHandover || receiptDataRef.current) {
        return;
      }

      const activeEl = document.activeElement as HTMLElement | null;
      const isSearchInput = activeEl === searchInputRef.current;
      const isOtherInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') && !isSearchInput;

      // If user is focused on a specific popup dialog input (quantity dialog, discount dialog, custom item, etc.)
      if (isOtherInput && (quantityModalProduct || quantityModalCartItem || discountModalItem || showBillDiscountModal || showCustomItemModal)) {
        return;
      }

      const currentTime = Date.now();
      // Hardware scanners type rapidly: threshold of 150ms accommodates USB and wireless scanners
      if (currentTime - lastKeyTimeRef.current > 150) {
        scanBufferRef.current = '';
      }
      lastKeyTimeRef.current = currentTime;

      if (e.key === 'Enter') {
        const candidate = (scanBufferRef.current || (isSearchInput ? search : '')).trim();
        if (candidate.length >= 1) {
          const match = findProductByBarcodeOrCode(candidate);
          if (match) {
            e.preventDefault();
            e.stopPropagation();
            scanBufferRef.current = '';
            if (isSearchInput) setSearch('');
            handleAddToCart(match, true, 1); // true = scanned by hardware scanner (auto adds 1 to cart without quantity prompt)
            playBeep(2000, 0.08);
            return;
          }
        }
        scanBufferRef.current = '';
      } else if (e.key && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        scanBufferRef.current += e.key;
      }
    };

    window.addEventListener('keydown', handleBarcodeInput, true);
    return () => window.removeEventListener('keydown', handleBarcodeInput, true);
  }, [products, pricingType, isLocked, showShiftHandover, quantityModalProduct, quantityModalCartItem, discountModalItem, showBillDiscountModal, showCustomItemModal, search]);

  // Focus effect for manual quantity dialog
  useEffect(() => {
    if (quantityModalProduct || quantityModalCartItem) {
      setTimeout(() => {
        quantityInputRef.current?.focus();
        quantityInputRef.current?.select();
      }, 50);
    }
  }, [quantityModalProduct, quantityModalCartItem]);

  // Focus effect for item discount dialog
  useEffect(() => {
    if (discountModalItem) {
      setTimeout(() => {
        itemDiscountInputRef.current?.focus();
        itemDiscountInputRef.current?.select();
      }, 50);
    }
  }, [discountModalItem]);

  // Focus effect for whole bill discount dialog
  useEffect(() => {
    if (showBillDiscountModal) {
      setTimeout(() => {
        billDiscountInputRef.current?.focus();
        billDiscountInputRef.current?.select();
      }, 50);
    }
  }, [showBillDiscountModal]);

  const handleAddToCart = (product: any, isScanned: boolean = false, quantity: number = 1, customPrice?: number) => {
    // Expiry check & warning
    if (product.expiry_date) {
      const expTime = new Date(product.expiry_date).getTime();
      const nowTime = new Date().setHours(0, 0, 0, 0);
      if (!isNaN(expTime) && expTime < nowTime) {
        if (!confirm(`⚠️ EXPIRED PRODUCT ALERT:\n\n"${product.name}" expired on ${product.expiry_date}.\n\nDo you want to proceed and add this item anyway?`)) {
          return;
        }
      }
    }

    const price = customPrice !== undefined && Number(customPrice) >= 0 
      ? Number(customPrice) 
      : getActiveProductPrice(product, pricingType);

    if (product.has_variants) {
      setVariantModalProduct(product);
      return;
    }
    const isScaleOrWeighed = Boolean(product.is_scale_item) || isWeighedOrVolumeUnit(product.unit);
    if (product.stock <= 0 && !isScaleOrWeighed) {
      if (!confirm(`Item "${product.name}" is out of stock. Add to cart anyway?`)) return;
    }
    if (isScaleOrWeighed) {
      setEditingCartItem(null);
      setWeighedModalProduct({ ...product, price });
      playBeep(1600, 0.05);
      return;
    }

    const isAlwaysPrompt = settings?.always_prompt_quantity_modal === true || settings?.always_prompt_quantity_modal === 'true';

    // IF NOT SCANNED OR ALWAYS PROMPT ENABLED: Always prompt for quantity & price!
    if (!isScanned || isAlwaysPrompt) {
      setQuantityModalCartItem(null);
      setQuantityModalProduct({ ...product, price });
      setQuantityInputVal('1');
      setQuantityPriceOverride(String(price));
      return;
    }

    // Scanned by barcode scanner: immediately add exact quantity
    cart.addItem({ ...product, price }, null, Number(quantity) || 1);
    playBeep(1800, 0.06);
  };

  const handleConfirmQuantityModal = () => {
    const qty = Number(quantityInputVal);
    if (!qty || qty <= 0) return;

    const targetItem = quantityModalCartItem || quantityModalProduct;
    const isOverrideAllowed = targetItem?.allow_price_override !== 0 && targetItem?.allow_price_override !== false;

    const basePrice = quantityModalCartItem 
      ? Number(quantityModalCartItem.price) 
      : Number(quantityModalProduct?.price || 0);

    const enteredPrice = (isOverrideAllowed && quantityPriceOverride.trim() !== '') ? Number(quantityPriceOverride) : basePrice;

    if (isNaN(enteredPrice) || enteredPrice < 0) {
      alert('Please enter a valid price.');
      return;
    }

    const finalPrice = isOverrideAllowed ? enteredPrice : basePrice;
    const priceChanged = isOverrideAllowed && Math.abs(finalPrice - basePrice) > 0.001;

    if (quantityModalCartItem) {
      cart.updateQuantity(quantityModalCartItem.cartId, qty);
      if (priceChanged) {
        cart.updatePrice(quantityModalCartItem.cartId, finalPrice);
      }
      setQuantityModalCartItem(null);
      playBeep(2000, 0.08);
    } else if (quantityModalProduct) {
      cart.addItem({ ...quantityModalProduct, price: finalPrice }, null, qty);
      setQuantityModalProduct(null);
      playBeep(2000, 0.08);
    }
  };

  const handleOpenPriceOverrideModal = () => {
    if (cart.items.length === 0) {
      alert('Basket is empty. Add items to basket before overriding prices.');
      return;
    }
    setPriceOverrideItems(
      cart.items.map(item => ({
        cartId: item.cartId,
        name: item.name,
        unit: item.unit || 'pc',
        originalPrice: Number(item.price),
        newPrice: String(item.price),
        quantity: item.quantity,
        allow_price_override: item.allow_price_override
      }))
    );
    setShowPriceOverrideModal(true);
  };

  const handleApplyPriceOverrideChanges = () => {
    let changeCount = 0;
    for (const item of priceOverrideItems) {
      if ((item as any).allow_price_override === 0 || (item as any).allow_price_override === false) {
        continue;
      }
      const parsedNew = Number(item.newPrice);
      if (!isNaN(parsedNew) && parsedNew >= 0 && Math.abs(parsedNew - item.originalPrice) > 0.001) {
        cart.updatePrice(item.cartId, parsedNew);
        changeCount++;
      }
    }
    setShowPriceOverrideModal(false);
    playBeep(2200, 0.1);
    if (changeCount > 0) {
      alert(`Successfully updated price for ${changeCount} cart item(s).`);
    }
  };

  const handleWeighedConfirm = (quantity: number, unit: string, customPrice?: number) => {
    if (editingCartItem) {
      cart.updateQuantity(editingCartItem.cartId, quantity);
      if (customPrice !== undefined && Number(customPrice) >= 0) {
        cart.updatePrice(editingCartItem.cartId, Number(customPrice));
      }
      setEditingCartItem(null);
    } else if (weighedModalProduct) {
      const finalPrice = (customPrice !== undefined && Number(customPrice) >= 0) ? Number(customPrice) : weighedModalProduct.price;
      cart.addItem({ ...weighedModalProduct, price: finalPrice }, null, quantity);
      setWeighedModalProduct(null);
    }
    playBeep(2000, 0.08);
  };

  const handleTogglePricingType = (newType: 'retail' | 'wholesale') => {
    setPricingType(newType);
    playBeep(1400, 0.04);
    if (cart.items.length > 0) {
      cart.items.forEach(item => {
        if (item.is_custom || item.is_return) return;
        const prod = products.find(p => p.id === item.id);
        if (prod) {
          const targetPrice = getActiveProductPrice(prod, newType);
          cart.updatePrice(item.cartId, targetPrice);
        }
      });
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && search.trim()) {
      e.preventDefault();
      const match = findProductByBarcodeOrCode(search.trim()) || (filteredProducts.length === 1 ? filteredProducts[0] : null);
      if (match) {
        handleAddToCart(match, true); // true = scanned/typed barcode
        setSearch('');
        playBeep(2000, 0.08);
      } else {
        playBeep(400, 0.2);
      }
    }
  };

  const handleOpenPromotionsModal = async () => {
    try {
      // @ts-ignore
      const promoList = await window.db.invoke('get-promotions-advanced');
      if (Array.isArray(promoList)) setPromotions(promoList);
    } catch (_) {}
    setShowPromotionsModal(true);
  };

  // Active Promotions Computation (matching current local date YYYY-MM-DD)
  const activePromotions = useMemo(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const today = `${year}-${month}-${day}`;

    return promotions.filter((p: any) => {
      if (p.status && p.status.toUpperCase() !== 'ACTIVE') return false;
      const sDate = p.start_date ? String(p.start_date).split(/[T ]/)[0] : null;
      const eDate = p.end_date ? String(p.end_date).split(/[T ]/)[0] : null;
      if (sDate && sDate > today) return false;
      if (eDate && eDate < today) return false;
      return true;
    });
  }, [promotions]);

  // Fast lookup map for displaying promo tags on product cards: productId -> promo, barcode -> promo, or storewide
  const productPromoMap = useMemo(() => {
    const map = new Map<string, any>();
    for (const promo of activePromotions) {
      if (promo.items && promo.items.length > 0) {
        for (const item of promo.items) {
          if (item.product_id != null) map.set(`id:${item.product_id}`, promo);
          if (item.barcode) map.set(`barcode:${item.barcode}`, promo);
        }
      } else {
        if (!map.has('storewide')) {
          map.set('storewide', promo);
        }
      }
    }
    return map;
  }, [activePromotions]);

  // Automatic Promotion Engine Evaluator:
  // Dynamically matches qualified items in basket and applies promotion discounts
  useEffect(() => {
    cart.applyAutoPromotions(activePromotions);
  }, [cart.items, activePromotions]);

  const eligiblePromotions = useMemo(() => {
    if (cart.items.length === 0) return [];
    return activePromotions.filter((promo: any) => {
      if (promo.items && promo.items.length > 0) {
        return promo.items.some((pi: any) => {
          const inCart = cart.items.find(ci => Number(ci.id) === Number(pi.product_id) || (pi.barcode && ci.barcode && pi.barcode === ci.barcode));
          return inCart && Math.abs(inCart.quantity) >= (pi.required_qty || 1);
        });
      }
      return true;
    });
  }, [activePromotions, cart.items]);

  const handleApplyPromotion = (promo: any) => {
    if (promo.items && promo.items.length > 0) {
      let appliedAny = false;
      promo.items.forEach((pi: any) => {
        const inCart = cart.items.find(ci => Number(ci.id) === Number(pi.product_id) || (pi.barcode && ci.barcode && pi.barcode === ci.barcode));
        if (inCart && Math.abs(inCart.quantity) >= (pi.required_qty || 1)) {
          if (promo.discount_type === 'PERCENT') {
            cart.applyItemDiscount(inCart.cartId, 'percent', promo.discount_value, promo.name, true);
          } else {
            cart.applyItemDiscount(inCart.cartId, 'fixed', promo.discount_value, promo.name, true);
          }
          appliedAny = true;
        }
      });
      if (appliedAny) {
        cart.setActivePromoTitle(promo.name);
        playBeep(2400, 0.12);
      } else {
        alert(`To qualify for "${promo.name}", add the required targeted items to the cart.`);
      }
    } else {
      if (promo.discount_type === 'PERCENT') {
        cart.setBillDiscount('percent', promo.discount_value);
      } else {
        cart.setBillDiscount('fixed', promo.discount_value);
      }
      cart.setActivePromoTitle(promo.name);
      playBeep(2400, 0.12);
    }
    setShowPromotionsModal(false);
  };

  const handleApplyBillDiscount = () => {
    const val = Number(billDiscountVal);
    if (val > 0) {
      cart.setBillDiscount(billDiscountType, val);
      playBeep(2200, 0.08);
    }
    setShowBillDiscountModal(false);
  };

  const handleApplyItemDiscount = () => {
    if (!discountModalItem) return;
    const val = Number(itemDiscountVal);
    if (val > 0) {
      cart.applyItemDiscount(discountModalItem.cartId, itemDiscountType, val);
      playBeep(2200, 0.08);
    }
    setDiscountModalItem(null);
  };

  const handleFastCashCheckout = async () => {
    if (isCheckingOutRef.current) return;
    if (cart.items.length === 0) {
      alert('Cart is empty. Please add items first.');
      return;
    }
    const currentSubtotal = cart.getSubtotal();
    const currentDiscount = cart.getDiscountTotal();
    const currentTotal = Math.max(0, currentSubtotal - currentDiscount);

    await handleCheckout({
      method: 'Cash',
      split: { cash: currentTotal, card: 0, bank: 0, credit: 0, voucher: 0 },
      change: 0,
      claimedPoints: cart.redeemedLoyaltyPoints || 0,
      pointsDiscount: cart.loyaltyDiscountAmount || 0
    });
  };

  const handleHoldBill = async (withKot = false) => {
    if (cart.items.length === 0) {
      alert('Cart is empty. Add items before holding a bill.');
      return;
    }
    // @ts-ignore
    if (window.db?.holdBill) {
      try {
        const payload = {
          items: cart.items,
          customerId: activeCustomer?.id || null,
          customerName: activeCustomer?.name || 'Walk-in',
          orderType: 'retail',
          tableNo: null,
          withKot
        };
        // @ts-ignore
        await window.db.holdBill(payload);
        cart.clearCart();
        playBeep(1500, 0.1);
        await loadHeldBills();
        alert('Bill held successfully!');
      } catch (e: any) {
        alert('Failed to hold bill: ' + e.message);
      }
    }
  };

  const handleRestoreHeldBill = async (bill: any) => {
    try {
      if (cart.items.length > 0) {
        if (!window.confirm('Active cart is not empty. Replacing it with this held bill will overwrite current cart. Continue?')) {
          return;
        }
      }

      const raw = bill.cart_data || bill.items_json;
      let items: any[] = [];
      if (typeof raw === 'string') {
        try { items = JSON.parse(raw); } catch { items = []; }
      } else if (Array.isArray(raw)) {
        items = raw;
      }

      if (!Array.isArray(items) || items.length === 0) {
        alert('This held bill has no items.');
        return;
      }

      // 1. Immediately close the modal so UI never hangs or freezes
      setShowHeldBills(false);

      // 2. Atomically restore all cart items in a single state update (blazing fast, zero lag)
      cart.restoreCart(
        items,
        bill.customer_id || null,
        bill.customer_name || 'Walk-in',
        bill.bill_discount || { type: 'fixed', value: 0 }
      );

      // 3. Restore customer info
      if (bill.customer_id) {
        setActiveCustomer({ id: bill.customer_id, name: bill.customer_name || 'Customer' });
      } else if (bill.customer_name && bill.customer_name !== 'Walk-in') {
        setActiveCustomer({ id: 0, name: bill.customer_name });
      } else {
        setActiveCustomer(null);
      }

      // 4. Safely delete the held bill from storage
      // @ts-ignore
      if (window.db?.deleteHeldBill) {
        try {
          // @ts-ignore
          await window.db.deleteHeldBill(bill.id);
          await loadHeldBills();
        } catch (delErr) {
          console.warn('Could not auto-delete held bill after restore:', delErr);
        }
      }

      playBeep(1800, 0.08);
    } catch (e: any) {
      console.error('handleRestoreHeldBill error:', e);
      alert('Could not restore bill: ' + (e?.message || 'Invalid bill format'));
      setShowHeldBills(false);
    }
  };

  // Discount & Voucher Handlers
  const applyGlobalDiscount = () => {
    if (globalDiscount > 0 && cart.items.length > 0) {
      const discountPerItem = globalDiscount / cart.items.length;
      cart.items.forEach(i => cart.applyDiscount(i.cartId, discountPerItem));
      playBeep(1800, 0.06);
    }
    setShowDiscountModal(false);
  };

  const handleValidateVoucherInModal = async () => {
    const code = voucherCode.trim();
    if (!code) return;
    if (cart.items.length === 0) {
      setVoucherModalError('Please add items to cart before applying a voucher');
      return;
    }
    setIsVoucherValidating(true);
    setVoucherModalError('');
    setVoucherModalResult(null);

    try {
      // @ts-ignore
      const res = await window.db.invoke('validate-voucher', { 
        code, 
        cartItems: cart.items.map((i: any) => ({ ...i, qty: i.quantity })) 
      });
      setIsVoucherValidating(false);

      if (!res.valid) {
        setVoucherModalError(res.message || 'Invalid voucher');
      } else {
        setVoucherModalResult(res);
      }
    } catch (e: any) {
      setIsVoucherValidating(false);
      setVoucherModalError(e.message || 'Failed to validate voucher');
    }
  };

  const handleConfirmApplyVoucher = (isOverride = false) => {
    if (!voucherModalResult) return;
    setAppliedVoucher({
      ...voucherModalResult,
      isOverride
    });
    setShowVoucherModal(false);
    setVoucherCode('');
    setVoucherModalResult(null);
    setVoucherModalError('');
    playBeep(2000, 0.08);
  };

  const handleRemoveAppliedVoucher = () => {
    setAppliedVoucher(null);
  };

  // Receipt Print Execution
  const executePrint = async (data: any) => {
    if (!data) return;
    setPrintStatus('printing');
    setPrintError('');

    const payload = {
      invoiceNo: String(data.invoiceNo),
      storeName: settings.storeName || 'Nova FreshMart',
      storeAddress: settings.tagline || '',
      storePhone: settings.phone || '',
      customerName: data.customer?.name || (typeof data.customer === 'string' ? data.customer : 'Walk-in'),
      customerPhone: data.customer?.phone || '',
      cashier: activeCashier?.username || currentUser?.username || 'Cashier',
      paymentMethod: data.method || 'Cash',
      reference: '',
      createdAt: formatReceiptDate(data.date || data.createdAt || new Date()),
      subtotal: Number(data.subtotal || 0),
      discount: Number(data.discount || 0),
      tax: 0,
      total: Number(data.total || 0),
      paid: data.method === 'Cash' ? Number(data.total || 0) + Number(data.change || 0) : Number(data.total || 0),
      cashGiven: data.method === 'Cash' ? Number(data.total || 0) + Number(data.change || 0) : 0,
      change: Number(data.change || 0),
      balance: 0,
      headerText: '',
      footerText: settings.footerMsg || 'Thank you for shopping at Nova FreshMart!',
      logoUrl: settings.invoiceLogo || '',
      barcodeData: String(data.invoiceNo),
      saleType: data.saleType || 'sale',
      items: (data.items || []).map((i: any) => ({
        name: i.name || 'Item',
        qty: Number(i.quantity || 1),
        price: Number(i.price || 0),
        discount: Number(i.discount || 0),
        lineTotal: Number(i.total || (i.price * i.quantity) || 0)
      }))
    };

    // 1. Try C# Print Agent (localhost:7777)
    try {
      const isUp = await isAgentRunning();
      setAgentOnline(isUp);
      if (isUp) {
        const res = await printReceiptViaAgent(payload);
        if (res.ok) {
          setPrintStatus('success');
          return;
        } else {
          setPrintError(res.error || 'Print agent error');
        }
      }
    } catch (e: any) {
      setPrintError(e.message || 'Print agent connection failed');
    }

    // 2. Fallback to system / browser print
    try {
      window.print();
      setPrintStatus('success');
    } catch (e: any) {
      setPrintStatus('error');
      setPrintError(e.message || 'System print failed');
    }
  };

  // Main Checkout Completion
  const handleCheckout = async (checkoutData: any) => {
    if (isCheckingOutRef.current) {
      console.warn('[handleCheckout] Prevented duplicate checkout submission');
      return;
    }
    if (cart.items.length === 0) return alert('Cart is empty. Please add items first.');
    isCheckingOutRef.current = true;
    try {
      const method = typeof checkoutData === 'string' ? checkoutData : checkoutData.method;
      const split = typeof checkoutData === 'object' ? checkoutData.split : null;
      const change = typeof checkoutData === 'object' ? checkoutData.change : 0;
      
      // @ts-ignore
      const session = await window.db.getActiveSession(terminalConfig.current_terminal_id);
      if (!session || (session.terminal_id && session.terminal_id !== terminalConfig.current_terminal_id)) {
        setActiveSession(null);
        alert(`Cannot bill: Cash register session is CLOSED for this terminal (${terminalConfig.current_terminal_name || terminalConfig.current_terminal_id}). Please open a session first!`);
        setShowOpenSessionModal(true);
        return;
      }
      if (method === 'Credit' && !activeCustomer) {
        alert('You must select a customer for a Credit sale!');
        setShowCustomer(true);
        return;
      }
      // Snapshot cart state before any asynchronous calls or state mutations
      const itemsSnapshot = cart.items.map(i => ({ ...i }));
      const itemsSubtotal = cart.getSubtotal();
      const itemsDiscount = cart.getDiscountTotal();
      const allNeg = itemsSnapshot.every(i => i.quantity < 0);
      const someNeg = itemsSnapshot.some(i => i.quantity < 0);
      const saleType = allNeg ? 'refund' : (someNeg ? 'exchange' : 'sale');

      let total = cartTotal;
      if ((!total || total === 0) && itemsSubtotal > 0 && saleType !== 'refund') {
        total = Math.max(0, itemsSubtotal - itemsDiscount);
      } else if (saleType === 'refund' && itemsSubtotal < 0) {
        total = itemsSubtotal;
      }

      // @ts-ignore
      const invoiceId = await window.db.checkout({
        items: itemsSnapshot,
        subtotal: itemsSubtotal,
        total,
        discount: itemsDiscount,
        method,
        sessionId: session.id,
        customerId: activeCustomer?.id || null,
        customerName: activeCustomer?.name || 'Walk-in',
        saleType,
        parentInvoiceId: (cart as any).parentInvoiceId,
        claimedPoints: checkoutData?.claimedPoints || activeCustomer?.claimed_points_this_tx || 0,
        pricingType,
        orderType: 'retail',
        cashPaid: split ? split.cash : (method === 'Cash' ? total + change : 0),
        cardPaid: split ? split.card : (method === 'Card' ? total : 0),
        otherPaid: split ? (split.bank || split.credit || split.voucher) : (method !== 'Cash' && method !== 'Card' ? total : 0),
        changeReturned: change,
        balanceDue: 0,
        cashier: activeCashier?.username || currentUser?.username || 'Cashier'
      });

      playBeep(2400, 0.15);

      const receipt: any = {
        invoiceNo: String(invoiceId).padStart(5, '0'),
        storeName: settings.storeName || 'Nova FreshMart',
        storeAddress: settings.tagline || '',
        storePhone: settings.phone || '',
        customerName: activeCustomer?.name || 'Walk-in Customer',
        customerPhone: activeCustomer?.phone || '',
        customer: activeCustomer,
        cashier: activeCashier?.username || currentUser?.username || 'Cashier',
        terminal_id: terminalConfig.current_terminal_id || 'TERM-01',
        terminal_name: terminalConfig.current_terminal_name || 'Touch Terminal 01',
        branch_name: terminalConfig.current_branch_name || 'Main Branch',
        paymentMethod: method,
        method,
        createdAt: getSriLankaNowString(),
        date: getSriLankaNowString(),
        subtotal: itemsSubtotal,
        discount: itemsDiscount,
        tax: 0,
        total,
        paid: method === 'Cash' ? total + change : total,
        change,
        balance: 0,
        split,
        saleType,
        sale_type: saleType,
        parent_invoice_id: (cart as any).parentInvoiceId,
        parentInvoiceId: (cart as any).parentInvoiceId,
        claimedPoints: checkoutData?.claimedPoints || 0,
        pointsDiscount: checkoutData?.pointsDiscount || 0,
        earnedPoints: total > 0 && settings.loyalty_enabled !== false ? Math.floor((total / 100) * (Number(settings.loyalty_points_per_100) || 1)) : 0,
        customerNewPoints: activeCustomer ? Math.max(0, (activeCustomer.points || 0) + (total > 0 && settings.loyalty_enabled !== false ? Math.floor((total / 100) * (Number(settings.loyalty_points_per_100) || 1)) : 0) - (checkoutData?.claimedPoints || 0)) : 0,
        items: itemsSnapshot.map(i => ({
          name: i.name,
          quantity: i.quantity,
          unit: i.unit || 'pc',
          formattedQty: formatQuantityWithUnit(i.quantity, i.unit),
          unitPrice: i.price,
          price: i.price,
          total: i.price * i.quantity,
          discount: i.discount || 0
        }))
      };

      // Open drawer if cash
      if (settings.autoOpenDrawer !== false && (method === 'Cash' || (split && split.cash > 0))) {
        openCashDrawerViaAgent(settings.printerName).catch(() => {});
      }

      // Claim voucher if used
      const voucherIdToClaim = checkoutData?.voucherId || appliedVoucher?.voucherId;
      const voucherAmountToClaim = checkoutData?.voucherAmount || (split?.voucher) || appliedVoucher?.applicableValue || appliedVoucher?.remainingValue;
      const isVoucherOverride = checkoutData?.isVoucherOverride || appliedVoucher?.isOverride || false;

      if (voucherIdToClaim && (voucherAmountToClaim > 0 || isVoucherOverride)) {
        try {
          // @ts-ignore
          await window.db.invoke('claim-voucher', { 
            voucherId: voucherIdToClaim, 
            amount: voucherAmountToClaim,
            forceFullClaim: isVoucherOverride
          });
        } catch (voucherErr) {
          console.error('Failed to claim voucher:', voucherErr);
        }
      }

      cart.clearCart();
      setAppliedVoucher(null);
      setShowCheckout(false);
      setActiveCustomer(null);
      setReceiptData(receipt);
      loadInitialData();
    } catch (err: any) {
      alert('Checkout error: ' + err.message);
    } finally {
      isCheckingOutRef.current = false;
    }
  };

  const filteredProducts = useMemo(() => {
    const s = search.toLowerCase().trim();
    if (s) {
      return products.filter(p => {
        const matchesName = (p.name || '').toLowerCase().includes(s);
        const matchesBarcode = (p.barcode || '').toLowerCase().includes(s);
        const matchesPlu = p.plu ? String(p.plu).toLowerCase().includes(s) : false;
        const matchesCode = p.item_code ? String(p.item_code).toLowerCase().includes(s) : false;
        return matchesName || matchesBarcode || matchesPlu || matchesCode;
      });
    }
    return products.filter(p => {
      return activeCategory === 'All' || p.category === activeCategory || p.category_name === activeCategory;
    });
  }, [products, search, activeCategory]);

  const cartTotal = appliedVoucher 
    ? Math.max(0, cart.getTotal() - (appliedVoucher.remainingValue || 0)) 
    : cart.getTotal();

  return (
    <div className="flex flex-col h-full w-full bg-[#F4F9F5] text-slate-800 font-sans select-none overflow-hidden">
      
      {/* ── TOP HEADER / ACTION BAR (FRESH SUPERMARKET GREEN THEME) ── */}
      <div className="h-16 bg-white border-b border-emerald-100 px-4 flex items-center justify-between shrink-0 shadow-xs z-30">
        
        {/* Left: Brand / Terminal / Branch Metadata */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white font-black shadow-md shadow-emerald-600/20">
            <ShoppingCart size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-black tracking-wide text-slate-900">Nova FreshMart</span>
              <span className="text-[9px] bg-emerald-100 text-emerald-800 font-black px-2 py-0.5 rounded-full border border-emerald-300">
                POS TERMINAL
              </span>
            </div>
            <p className="text-[10px] text-slate-500 flex items-center gap-1.5 font-medium">
              <span className="font-semibold text-slate-700">{terminalConfig.current_branch_name || 'Main Branch'}</span>
              <span>•</span>
              <span className="text-emerald-700 font-bold">{terminalConfig.current_terminal_name || 'TERM-01'}</span>
              <span>•</span>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('open-change-pin'))}
                className="text-slate-600 font-semibold hover:text-emerald-700 flex items-center gap-1 cursor-pointer transition-colors"
                title="Change My Security PIN"
              >
                <span>{activeCashier?.username || currentUser?.username || 'Cashier'}</span>
                <Key size={10} className="text-slate-400 hover:text-emerald-600" />
              </button>
            </p>
          </div>
        </div>

        {/* Center: Live Cloud Online Sync Status, Live Clock, & Register Session Status */}
        <div className="flex items-center gap-3">
          {/* Live System Clock & Date */}
          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl border border-emerald-200 bg-white text-slate-700 text-xs shadow-xs">
            <Clock size={13} className="text-emerald-600 animate-pulse" />
            <span className="text-[11px] text-slate-500 font-medium">{liveDate}</span>
            <span className="font-mono font-black text-slate-900 tracking-wider text-xs">{liveClock}</span>
          </div>

          {/* Terminal Register Session Status */}
          {activeSession ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-900 text-xs font-bold shadow-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Register Open #{activeSession.id}</span>
              <button
                type="button"
                onClick={() => onNavigate ? onNavigate('day_sale') : null}
                className="ml-1 text-[10px] text-emerald-700 hover:text-emerald-950 underline font-extrabold cursor-pointer"
                title="Manage or close session from Day Sale"
              >
                Close / Day End
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-rose-300 bg-rose-50 text-rose-900 text-xs font-black shadow-xs">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
              <span>Register CLOSED</span>
              <button
                type="button"
                onClick={() => setShowOpenSessionModal(true)}
                className="ml-1 px-2.5 py-0.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[10px] font-black shadow-xs cursor-pointer transition-all active:scale-95"
              >
                Open Session
              </button>
            </div>
          )}

          <div 
            onClick={handleManualSync}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
              syncStatus?.online 
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 shadow-xs' 
                : 'bg-amber-50 text-amber-800 border-amber-300'
            }`}
            title="Click to trigger Cloud sync"
          >
            {syncStatus?.online ? (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>🟢 Cloud Online</span>
              </>
            ) : (
              <>
                <WifiOff size={13} className="text-amber-600" />
                <span>🟠 Offline Mode (Local SQLite)</span>
              </>
            )}
            <RefreshCw size={12} className={`ml-1 text-slate-400 ${syncing ? 'animate-spin' : ''}`} />
          </div>
        </div>

        {/* Right: Quick Actions & PROMINENT BACK OFFICE BUTTON */}
        <div className="flex items-center gap-2">

          {/* Quick Lock (F10) */}
          <button
            type="button"
            onClick={handleLockScreen}
            className="flex items-center gap-1.5 px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold text-xs rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer"
            title="Lock terminal screen for quick rest or break (F10)"
          >
            <Lock size={15} className="text-amber-700" />
            <span>Lock (F10)</span>
          </button>

          {/* Shift Handover (F8) */}
          <button
            type="button"
            onClick={handleOpenShiftHandover}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold text-xs rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer"
            title="Hand over terminal shift to next incoming cashier (F8)"
          >
            <ArrowLeftRight size={15} className="text-emerald-700" />
            <span>Shift Handover (F8)</span>
          </button>

          {/* Past Sales Invoices & Reprints */}
          <button
            type="button"
            onClick={() => setShowInvoicesModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 font-bold text-xs rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer"
            title="View past sales invoices and reprint receipts (Ctrl+I, PIN required for cashiers)"
          >
            <FileText size={15} className="text-blue-600" />
            <span>Invoices (Ctrl+I)</span>
          </button>
          
          {/* PROMINENT BACK OFFICE BUTTON */}
          <button
            type="button"
            onClick={() => {
              if (canAccessBackoffice) {
                if (onExitToBackoffice) onExitToBackoffice();
                else if (onNavigate) onNavigate('dashboard');
              } else {
                setBackofficeAuthPin('');
                setBackofficeAuthError('');
                setShowBackofficeAuthModal(true);
              }
            }}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 active:scale-95 text-white font-black text-xs rounded-xl shadow-md border border-slate-700 transition-all cursor-pointer"
            title="Go to Back Office (Requires Manager/Admin PIN for cashiers)"
          >
            <LayoutDashboard size={16} className="text-emerald-400" />
            <span>Back Office</span>
          </button>

          {/* CASHIER LOGOUT BUTTON */}
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="flex items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 font-bold text-xs rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer"
              title="Sign out of POS terminal"
            >
              <LogOut size={15} className="text-rose-600" />
              <span>Logout</span>
            </button>
          )}
        </div>

      </div>

      {/* ── MAIN WORKSPACE (3-COLUMN: 1. CATALOG | 2. CART IN MIDDLE | 3. ACTION PANEL & CHECKOUT ON RIGHT) ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ════════ COLUMN 1: PRODUCT CATALOG & SEARCH (LEFT) ════════ */}
        <div className="flex-1 flex flex-col p-3 overflow-hidden bg-[#F4F9F5] min-w-0">
          
          {/* Search Bar, Lookup Popup Trigger, View Mode Switcher & Custom Item */}
          <div className="mb-2.5 flex items-center gap-2 shrink-0">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-emerald-700/60" size={17} />
              <input
                ref={searchInputRef}
                id="search-input"
                type="text"
                placeholder="Search products or scan barcode (F1)..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                className="w-full pl-10 pr-20 py-2 bg-white border border-emerald-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 shadow-2xs transition-all"
              />
              {search && (
                <button 
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Smart Lookup Popup Trigger */}
            <button
              type="button"
              onClick={() => {
                setShowLookupModal(true);
                setLookupQuery('');
                setLookupSelectedIndex(0);
              }}
              className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-emerald-50 active:scale-95 text-emerald-800 border border-emerald-300 font-black text-xs rounded-xl shadow-2xs transition-all cursor-pointer shrink-0"
              title="Open Smart Item Lookup (F1 / Ctrl+K)"
            >
              <Search size={14} className="text-emerald-600" />
              <span>Lookup (F1)</span>
            </button>

            {/* View Mode Switcher */}
            <div className="flex items-center bg-white border border-emerald-200 rounded-xl p-0.5 shadow-2xs shrink-0">
              <button
                type="button"
                onClick={() => handleSetPosViewMode('cards')}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  posViewMode === 'cards' 
                    ? 'bg-emerald-600 text-white shadow-2xs' 
                    : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
                }`}
                title="Standard Cards"
              >
                <LayoutGrid size={15} />
              </button>
              <button
                type="button"
                onClick={() => handleSetPosViewMode('compact')}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  posViewMode === 'compact' 
                    ? 'bg-emerald-600 text-white shadow-2xs' 
                    : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
                }`}
                title="Smaller / Compact Cards"
              >
                <Grid2X2 size={15} />
              </button>
              <button
                type="button"
                onClick={() => handleSetPosViewMode('list')}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  posViewMode === 'list' 
                    ? 'bg-emerald-600 text-white shadow-2xs' 
                    : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
                }`}
                title="Table / List View"
              >
                <List size={15} />
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setCustomItemForm({ name: '', quantity: 1, unit: 'pc', price: '', notes: '' });
                setShowCustomItemModal(true);
              }}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs rounded-xl shadow-xs transition-all cursor-pointer shrink-0"
              title="Add custom / open item (Insert / Alt+C / Shift+F6)"
            >
              <Sparkles size={14} className="text-emerald-200" />
              <span>+ Custom (Ins / Alt+C)</span>
            </button>
          </div>

          {/* Category Tabs */}
          <div className="flex gap-1.5 overflow-x-auto pb-1.5 mb-1.5 shrink-0 scrollbar-none">
            <button
              type="button"
              onClick={() => { setActiveCategory('All'); playBeep(1400, 0.04); }}
              className={`px-3 py-1 rounded-xl text-xs font-black shrink-0 transition-all cursor-pointer ${
                activeCategory === 'All'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-emerald-50 border border-emerald-100'
              }`}
            >
              All Items ({products.length})
            </button>
            {categories.map(cat => (
              <button
                type="button"
                key={cat.id}
                onClick={() => { setActiveCategory(cat.name); playBeep(1400, 0.04); }}
                className={`px-3 py-1 rounded-xl text-xs font-black shrink-0 transition-all cursor-pointer ${
                  activeCategory === cat.name
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-emerald-50 border border-emerald-100'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Product Items Display (3 View Modes: Standard Cards, Compact Cards, Table List) */}
          <div className="flex-1 overflow-y-auto pr-1">
            {filteredProducts.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-center p-8 bg-white/60 rounded-2xl border border-dashed border-emerald-200">
                <Package size={40} className="text-emerald-400 mb-2" />
                <p className="text-sm font-black text-slate-700">No products found in "{activeCategory}"</p>
                <p className="text-xs text-slate-500 mt-1">Try selecting another category or resetting filters</p>
                <button
                  type="button"
                  onClick={() => { setActiveCategory('All'); setSearch(''); }}
                  className="mt-3 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
                >
                  Show All Products ({products.length})
                </button>
              </div>
            ) : posViewMode === 'cards' ? (
              /* ── 1. STANDARD TOUCH CARDS ── */
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5">
                {filteredProducts.map(prod => {
                  const hasWsPrice = hasRealWholesalePrice(prod);
                  const isWholesaleActive = pricingType === 'wholesale';
                  const activePrice = getActiveProductPrice(prod, pricingType);
                  const promoForProd = productPromoMap.get(`id:${prod.id}`) || 
                                       (prod.barcode && productPromoMap.get(`barcode:${prod.barcode}`)) || 
                                       productPromoMap.get('storewide');
                  return (
                    <button
                      type="button"
                      key={prod.id}
                      onClick={() => handleAddToCart(prod)}
                      className={`group bg-white active:scale-[0.98] border rounded-2xl p-2.5 flex flex-col justify-between text-left transition-all shadow-2xs hover:shadow-sm relative overflow-hidden cursor-pointer ${
                        promoForProd
                          ? 'border-rose-300 hover:border-rose-400 hover:bg-rose-50/20'
                          : isWholesaleActive && hasWsPrice
                          ? 'border-amber-200 hover:border-amber-400 hover:bg-amber-50/30'
                          : 'border-emerald-100 hover:border-emerald-400 hover:bg-emerald-50/40'
                      }`}
                    >
                      <div className="h-24 w-full bg-emerald-50/40 rounded-xl mb-1.5 flex items-center justify-center overflow-hidden relative border border-emerald-100/60">
                        {prod.image_data || prod.image_url ? (
                          <img src={prod.image_data || prod.image_url} alt={prod.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                        ) : (
                          <div className="text-emerald-700/40 group-hover:text-emerald-600 transition-colors">
                            {prod.is_scale_item ? <Scale size={32} /> : <Package size={32} />}
                          </div>
                        )}
                        {prod.stock <= 5 && prod.stock > 0 && (
                          <span className="absolute top-1 right-1 text-[8px] font-black bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.2 rounded shadow-2xs">
                            Low: {prod.stock}
                          </span>
                        )}
                        {prod.is_scale_item && (
                          <span className="absolute top-1 left-1 text-[8px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 px-1.5 py-0.2 rounded shadow-2xs flex items-center gap-0.5">
                            <Scale size={9} /> PLU {prod.plu || prod.barcode}
                          </span>
                        )}
                        {promoForProd && (
                          <span className="absolute bottom-1 left-1 text-[8.5px] font-black bg-rose-600 text-white px-1.5 py-0.5 rounded-md shadow-xs flex items-center gap-0.5 z-10 tracking-tight">
                            🏷️ {promoForProd.discount_type === 'PERCENT' ? `${promoForProd.discount_value}% OFF` : `Rs ${promoForProd.discount_value} OFF`}
                          </span>
                        )}
                      </div>

                      <div className="mb-1.5">
                        <h4 className="text-xs font-black text-slate-900 line-clamp-2 leading-tight group-hover:text-emerald-800 transition-colors">
                          {prod.name}
                        </h4>
                        <p className="text-[10px] text-slate-500 mt-0.5 flex items-center justify-between font-mono">
                          <span>{prod.barcode || `PLU: #${prod.plu || prod.id}`}</span>
                          {isWholesaleActive && (
                            hasWsPrice ? (
                              <span className="text-[9px] font-black text-amber-800 bg-amber-100 px-1.5 py-0.2 rounded border border-amber-300">WHOLESALE</span>
                            ) : (
                              <span className="text-[8px] font-medium text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded">Retail Only</span>
                            )
                          )}
                        </p>
                      </div>

                      <div className="w-full mt-auto">
                        <div className={`font-black text-xs px-2.5 py-1.5 rounded-xl text-center shadow-sm transition-all flex items-center justify-center gap-1 font-mono text-white ${
                          isWholesaleActive && hasWsPrice
                            ? 'bg-amber-500 group-hover:bg-amber-600 shadow-amber-500/25'
                            : isWholesaleActive
                            ? 'bg-slate-700 group-hover:bg-slate-800'
                            : 'bg-emerald-600 group-hover:bg-emerald-700 shadow-emerald-600/20'
                        }`}>
                          {isWholesaleActive && hasWsPrice ? (
                            <>
                              <span className="text-[8px] font-black bg-black/25 px-1 py-0.2 rounded mr-0.5 tracking-wider">WS</span>
                              <span>Rs {activePrice.toFixed(2)}</span>
                              <span className="text-[9px] line-through text-amber-100/70 ml-1 font-normal">Rs {Number(prod.price).toFixed(2)}</span>
                            </>
                          ) : (
                            <>
                              {isWholesaleActive && (
                                <span className="text-[8px] font-medium bg-white/20 px-1 py-0.2 rounded mr-0.5">Retail</span>
                              )}
                              <span>Rs {activePrice.toFixed(2)}</span>
                            </>
                          )}
                          {prod.unit && prod.unit !== 'pc' && (
                            <span className="text-[9px] text-white/80 font-extrabold uppercase font-sans">/{prod.unit}</span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : posViewMode === 'compact' ? (
              /* ── 2. COMPACT / SMALLER CARDS ── */
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2">
                {filteredProducts.map(prod => {
                  const hasWsPrice = hasRealWholesalePrice(prod);
                  const isWholesaleActive = pricingType === 'wholesale';
                  const activePrice = getActiveProductPrice(prod, pricingType);
                  const promoForProd = productPromoMap.get(`id:${prod.id}`) || 
                                       (prod.barcode && productPromoMap.get(`barcode:${prod.barcode}`)) || 
                                       productPromoMap.get('storewide');
                  return (
                    <button
                      type="button"
                      key={prod.id}
                      onClick={() => handleAddToCart(prod)}
                      className={`group bg-white active:scale-[0.98] border rounded-xl p-2 flex flex-col justify-between text-left transition-all shadow-2xs hover:shadow-xs relative cursor-pointer ${
                        promoForProd
                          ? 'border-rose-300 hover:border-rose-400 hover:bg-rose-50/30'
                          : isWholesaleActive && hasWsPrice
                          ? 'border-amber-200 hover:border-amber-400 hover:bg-amber-50/40'
                          : 'border-emerald-100 hover:border-emerald-400 hover:bg-emerald-50/50'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <div className="w-8 h-8 rounded-lg bg-emerald-50/70 border border-emerald-100 flex items-center justify-center shrink-0 overflow-hidden">
                          {prod.image_data || prod.image_url ? (
                            <img src={prod.image_data || prod.image_url} alt="" className="w-full h-full object-cover" />
                          ) : prod.is_scale_item ? (
                            <Scale size={15} className="text-emerald-700" />
                          ) : (
                            <Package size={15} className="text-emerald-600/60 group-hover:text-emerald-700" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h5 className="text-[11px] font-black text-slate-900 leading-snug line-clamp-2 group-hover:text-emerald-800">
                            {prod.name}
                          </h5>
                          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                            {prod.is_scale_item ? (
                              <span className="text-[8px] font-black bg-emerald-100 text-emerald-800 px-1 rounded flex items-center gap-0.5">
                                <Scale size={7} /> PLU {prod.plu || prod.barcode}
                              </span>
                            ) : (
                              <span className="text-[9px] text-slate-400 font-mono truncate">{prod.barcode || `#${prod.id}`}</span>
                            )}
                            {promoForProd && (
                              <span className="text-[8px] font-black bg-rose-100 text-rose-800 border border-rose-300 px-1 rounded flex items-center gap-0.5">
                                🏷️ {promoForProd.discount_type === 'PERCENT' ? `${promoForProd.discount_value}% OFF` : `Rs ${promoForProd.discount_value} OFF`}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="mt-2 flex items-center justify-between pt-1 border-t border-slate-100">
                        <span className="text-[9px] font-bold text-slate-400">
                          Stock: <span className={prod.stock <= 5 ? 'text-rose-600 font-black' : 'text-slate-600'}>{formatQuantityWithUnit(prod.stock, prod.unit || 'pc')}</span>
                        </span>
                        {isWholesaleActive && hasWsPrice ? (
                          <span className="text-xs font-black text-amber-900 bg-amber-100 px-2 py-0.5 rounded-lg border border-amber-300 font-mono flex items-center gap-1 shadow-2xs">
                            <span className="text-[8px] font-black bg-amber-600 text-white px-0.5 rounded">WS</span>
                            Rs. {activePrice.toFixed(2)}
                          </span>
                        ) : isWholesaleActive ? (
                          <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200 font-mono flex items-center gap-1">
                            <span className="text-[8px] text-slate-400 font-medium">Retail</span>
                            Rs. {activePrice.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-xs font-black text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200 font-mono">
                            Rs. {activePrice.toFixed(2)}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              /* ── 3. TABLE / LIST VIEW ── */
              <div className="border border-emerald-200 rounded-2xl bg-white overflow-hidden shadow-2xs">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-emerald-50/80 sticky top-0 border-b border-emerald-200 text-slate-600 font-black text-[10px] uppercase tracking-wider select-none z-10">
                    <tr>
                      <th className="px-3 py-2 w-[38%]">Item Name</th>
                      <th className="px-3 py-2 w-[18%]">Barcode / PLU</th>
                      <th className="px-3 py-2 w-[16%]">Category</th>
                      <th className="px-3 py-2 w-[12%] text-right">Stock</th>
                      <th className="px-3 py-2 w-[16%] text-right">
                        {pricingType === 'wholesale' ? 'Price (Wholesale / Retail)' : 'Price (Retail)'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredProducts.map(prod => {
                      const hasWsPrice = hasRealWholesalePrice(prod);
                      const isWholesaleActive = pricingType === 'wholesale';
                      const activePrice = getActiveProductPrice(prod, pricingType);
                      const promoForProd = productPromoMap.get(`id:${prod.id}`) || 
                                           (prod.barcode && productPromoMap.get(`barcode:${prod.barcode}`)) || 
                                           productPromoMap.get('storewide');
                      return (
                        <tr
                          key={prod.id}
                          onClick={() => handleAddToCart(prod)}
                          className={`hover:bg-emerald-50/60 active:bg-emerald-100/50 cursor-pointer transition-colors group ${
                            promoForProd ? 'bg-rose-50/30' : ''
                          }`}
                        >
                          <td className="px-3 py-1.5 font-black text-slate-900">
                            <div className="flex items-center gap-2">
                              {prod.is_scale_item ? (
                                <span className="text-emerald-700 bg-emerald-100 p-1 rounded-md shrink-0">
                                  <Scale size={11} />
                                </span>
                              ) : (
                                <Package size={13} className="text-slate-400 group-hover:text-emerald-600 shrink-0" />
                              )}
                              <span className="truncate">{prod.name}</span>
                              {prod.is_scale_item && (
                                <span className="text-[8px] font-black bg-emerald-100 text-emerald-800 px-1 py-0.2 rounded shrink-0">
                                  PLU {prod.plu || prod.barcode}
                                </span>
                              )}
                              {promoForProd && (
                                <span className="text-[8.5px] font-black bg-rose-100 text-rose-800 border border-rose-300 px-1.5 py-0.2 rounded shrink-0">
                                  🏷️ {promoForProd.discount_type === 'PERCENT' ? `${promoForProd.discount_value}% OFF` : `Rs ${promoForProd.discount_value} OFF`}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-1.5 font-mono text-[10px] text-slate-500">
                            {prod.barcode || (prod.plu ? `PLU: ${prod.plu}` : `#${prod.id}`)}
                          </td>
                          <td className="px-3 py-1.5 text-slate-500 text-[11px] truncate">
                            {prod.category_name || prod.category || '-'}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono text-[11px]">
                            <span className={prod.stock <= 5 ? 'text-rose-600 font-black' : 'text-slate-600 font-bold'}>
                              {formatQuantityWithUnit(prod.stock, prod.unit || 'pc')}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            {isWholesaleActive && hasWsPrice ? (
                              <div className="flex items-center justify-end gap-1.5 text-amber-700 font-mono font-black text-xs">
                                <span className="text-[8px] font-black bg-amber-100 text-amber-800 border border-amber-200 px-1 rounded">WS</span>
                                <span>Rs. {activePrice.toFixed(2)}</span>
                                <span className="text-[9px] line-through text-slate-400 font-normal">Rs. {Number(prod.price).toFixed(2)}</span>
                              </div>
                            ) : isWholesaleActive ? (
                              <span className="font-bold text-slate-600 font-mono text-xs">
                                Rs. {activePrice.toFixed(2)} <span className="text-[9px] text-slate-400 font-normal">(Retail)</span>
                              </span>
                            ) : (
                              <span className="font-black text-emerald-800 font-mono text-xs bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                                Rs. {activePrice.toFixed(2)}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* ════════ COLUMN 2: CART / CURRENT BASKET (MIDDLE) ════════ */}
        <div className="w-[360px] xl:w-[410px] flex flex-col border-x border-emerald-100 bg-white shrink-0 overflow-hidden shadow-xs">
          
          {/* Cart Header */}
          <div className="p-3 bg-emerald-50/70 border-b border-emerald-100 space-y-2 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold shadow-xs">
                  <ShoppingCart size={15} />
                </div>
                <div>
                  <h3 className="text-xs font-black text-slate-900">Current Basket</h3>
                  <p className="text-[9px] text-emerald-800 font-bold uppercase tracking-wider">
                    {cart.items.length} {cart.items.length === 1 ? 'Item' : 'Items'} in basket
                  </p>
                </div>
              </div>

              {/* Retail / Wholesale Segmented Switch */}
              <div className="flex items-center bg-white p-0.5 rounded-xl border border-emerald-200 shadow-2xs">
                <button
                  type="button"
                  onClick={() => handleTogglePricingType('retail')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                    pricingType === 'retail' 
                      ? 'bg-emerald-600 text-white shadow-xs' 
                      : 'text-slate-600 hover:text-emerald-700'
                  }`}
                >
                  Retail
                </button>
                <button
                  type="button"
                  onClick={() => handleTogglePricingType('wholesale')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                    pricingType === 'wholesale' 
                      ? 'bg-amber-500 text-white shadow-xs' 
                      : 'text-slate-600 hover:text-amber-700'
                  }`}
                >
                  Wholesale
                </button>
              </div>
            </div>

            {/* Customer Pill / Selector */}
            <div className="flex items-center justify-between bg-white px-3 py-1.5 rounded-xl border border-emerald-200 text-xs shadow-2xs">
              <div 
                className="flex items-center gap-2 cursor-pointer flex-1 min-w-0"
                onClick={() => setShowCustomer(true)}
              >
                <User size={14} className="text-emerald-700 shrink-0" />
                <span className="font-bold text-slate-800 truncate">
                  {activeCustomer ? activeCustomer.name : 'Walk-in Customer'}
                </span>
                {activeCustomer?.points > 0 && (
                  <span className="text-[10px] font-black text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-md shrink-0 flex items-center gap-1">
                    ⭐ {activeCustomer.points} pts (Rs. {(activeCustomer.points * (Number(settings?.loyalty_point_value_rs) || 1)).toFixed(0)})
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                {activeCustomer?.points > 0 && (
                  <button 
                    type="button" 
                    onClick={() => {
                      const pointVal = Number(settings?.loyalty_point_value_rs) || 1;
                      const maxPts = Math.min(activeCustomer.points, Math.ceil(cartTotal / pointVal));
                      setLoyaltyRedeemInput(String(maxPts));
                      setShowLoyaltyModal(true);
                    }} 
                    className="text-[10px] font-black text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-md cursor-pointer transition-colors shadow-2xs"
                    title="Redeem Customer Loyalty Points (F6)"
                  >
                    Redeem (F6)
                  </button>
                )}
                <button 
                  type="button" 
                  onClick={() => setShowCustomer(true)} 
                  className="text-[10px] font-black text-emerald-700 hover:underline cursor-pointer"
                >
                  Change (F6)
                </button>
              </div>
            </div>
          </div>

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5 bg-[#FAFDFB]">
            {cart.items.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 p-6">
                <ShoppingBag size={48} className="mb-2 text-emerald-600/30" />
                <p className="text-xs font-bold text-slate-600">Your basket is empty</p>
                <p className="text-[10px] text-slate-400 mt-1">Tap items from catalog or scan a barcode</p>
              </div>
            ) : (
              cart.items.map(item => (
                <div 
                  key={item.cartId}
                  className={`rounded-2xl p-2.5 flex flex-col justify-between shadow-xs transition-all ${
                    item.quantity < 0 
                      ? 'bg-rose-50/90 border-2 border-rose-200' 
                      : 'bg-white border border-emerald-100 hover:border-emerald-300'
                  }`}
                >
                  <div className="flex justify-between items-start mb-1.5">
                    <div 
                      className="flex-1 pr-2 cursor-pointer"
                      onClick={() => {
                        if (isWeighedOrVolumeUnit(item.unit)) {
                          setWeighedModalProduct(null);
                          setEditingCartItem(item);
                        }
                      }}
                    >
                      <h4 className="text-xs font-black text-slate-900 line-clamp-1 hover:text-emerald-700 transition-colors flex items-center gap-1.5">
                        <span className="truncate">{item.name}</span>
                        {item.quantity < 0 && (
                          <span className="text-[9px] bg-rose-600 text-white font-black px-1.5 py-0.2 rounded shrink-0">
                            RETURN
                          </span>
                        )}
                        {item.is_custom && item.quantity > 0 && (
                          <span className="text-[9px] bg-purple-100 text-purple-800 font-extrabold px-1.5 py-0.2 rounded border border-purple-300 flex items-center gap-0.5 shrink-0">
                            <Sparkles size={9} /> Custom
                          </span>
                        )}
                        {item.expiry_date && (() => {
                          const expTime = new Date(item.expiry_date).getTime();
                          const nowTime = new Date().setHours(0, 0, 0, 0);
                          const daysLeft = Math.ceil((expTime - nowTime) / (1000 * 60 * 60 * 24));
                          if (daysLeft <= 0) {
                            return (
                              <span className="text-[9px] bg-red-100 text-red-800 font-black px-1.5 py-0.2 rounded border border-red-300 shrink-0">
                                EXPIRED ({item.expiry_date})
                              </span>
                            );
                          } else if (daysLeft <= 30) {
                            return (
                              <span className="text-[9px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.2 rounded border border-amber-300 shrink-0">
                                Exp: {daysLeft}d ({item.expiry_date})
                              </span>
                            );
                          }
                          return null;
                        })()}
                      </h4>
                      {item.custom_notes && (
                        <p className="text-[9px] text-purple-700 italic truncate mt-0.5 font-medium">
                          Note: {item.custom_notes}
                        </p>
                      )}
                      <p className="text-[10px] text-slate-500 font-medium flex items-center gap-1.5 mt-0.5">
                        <span className={item.quantity < 0 ? "text-rose-700 font-bold" : "text-emerald-700 font-bold"}>
                          Rs {Number(item.price).toFixed(2)}
                        </span>
                        <span>/</span>
                        <span className="uppercase">{item.unit || 'pc'}</span>
                        {pricingType === 'wholesale' && (
                          <span className="text-[8px] bg-amber-100 text-amber-900 font-extrabold px-1 rounded border border-amber-300">WS</span>
                        )}
                      </p>
                    </div>

                    {/* Delete Item */}
                    <button 
                      onClick={() => cart.removeItem(item.cartId)}
                      className="text-slate-400 hover:text-rose-600 p-1 transition-colors cursor-pointer"
                      title="Remove item"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {/* Quantity Controls & Line Total */}
                  <div className="flex items-center justify-between pt-1 border-t border-emerald-50">
                    <div className="flex items-center gap-1.5">
                      <div className="flex items-center bg-emerald-50 rounded-xl border border-emerald-200 overflow-hidden">
                        <button 
                          onClick={() => {
                            const step = isWeighedOrVolumeUnit(item.unit) ? 0.1 : 1;
                            const newQ = Number((item.quantity - step).toFixed(3));
                            if (newQ > 0) cart.updateQuantity(item.cartId, newQ);
                          }}
                          className="px-2.5 py-1 text-emerald-800 hover:bg-emerald-100 font-bold text-xs cursor-pointer"
                        >
                          -
                        </button>
                        <button
                          onClick={() => {
                            if (isWeighedOrVolumeUnit(item.unit)) {
                              setWeighedModalProduct(null);
                              setEditingCartItem(item);
                            } else {
                              setQuantityModalProduct(null);
                              setQuantityModalCartItem(item);
                              setQuantityInputVal(String(item.quantity));
                              setQuantityPriceOverride(String(item.price));
                            }
                          }}
                          className="px-2.5 py-1 text-xs font-black text-emerald-900 min-w-10 text-center hover:bg-emerald-100 rounded transition-colors cursor-pointer"
                          title="Click to edit quantity/weight"
                        >
                          {formatQuantityWithUnit(item.quantity, item.unit)}
                        </button>
                        <button 
                          onClick={() => {
                            const step = isWeighedOrVolumeUnit(item.unit) ? 0.1 : 1;
                            const newQ = Number((item.quantity + step).toFixed(3));
                            cart.updateQuantity(item.cartId, newQ);
                          }}
                          className="px-2.5 py-1 text-emerald-800 hover:bg-emerald-100 font-bold text-xs cursor-pointer"
                        >
                          +
                        </button>
                      </div>

                      {/* Line Item Discount Button */}
                      <button
                        type="button"
                        onClick={() => {
                          setDiscountModalItem(item);
                          setItemDiscountType(item.discountType || 'percent');
                          setItemDiscountVal(item.discountPercent ? String(item.discountPercent) : (item.discount ? String(item.discount) : ''));
                        }}
                        className={`px-2 py-1 rounded-xl text-[10px] font-black border transition-all cursor-pointer flex items-center gap-1 ${
                          item.isPromoDiscount
                            ? 'bg-emerald-100 text-emerald-900 border-emerald-300 shadow-2xs'
                            : item.discount > 0 
                              ? 'bg-purple-100 text-purple-900 border-purple-300 shadow-2xs' 
                              : 'bg-white text-slate-500 border-emerald-200 hover:border-purple-400 hover:text-purple-700'
                        }`}
                        title={item.isPromoDiscount ? `Promotion: ${item.promoName || 'Promo'} (-${item.discountPercent}%)` : "Apply Item Discount (F3)"}
                      >
                        {item.isPromoDiscount ? <Tag size={10} className="text-emerald-700" /> : <Percent size={10} />}
                        <span>
                          {item.isPromoDiscount
                            ? `🏷️ ${item.promoName || 'Promo'} -${item.discountPercent}% (-${Number(item.discount).toFixed(2)})`
                            : item.discount > 0 
                              ? `-${Number(item.discount).toFixed(2)} (${item.discountPercent || ''}%)` 
                              : 'Disc (F3)'}
                        </span>
                      </button>
                    </div>

                    <div className="text-right">
                      {item.discount > 0 && (
                        <span className="block text-[10px] line-through text-slate-400 font-mono">
                          Rs {Math.abs(item.price * item.quantity).toFixed(2)}
                        </span>
                      )}
                      <span className={`text-sm font-black font-mono ${item.quantity < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                        {item.quantity < 0 ? '-' : ''}Rs {Math.max(0, Math.abs(item.price * item.quantity) - (item.discount || 0)).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Cart Footer Info */}
          <div className="p-2.5 bg-emerald-50/50 border-t border-emerald-100 flex items-center justify-between text-xs text-slate-600 shrink-0">
            <span className="font-bold">{cart.items.length} items ({cart.items.reduce((acc, i) => acc + (Number(i.quantity) || 0), 0).toFixed(1)} units)</span>
            {cart.items.length > 0 && (
              <button 
                onClick={() => {
                  if (confirm('Clear all items from basket?')) cart.clearCart();
                }}
                className="text-[11px] font-bold text-rose-600 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Trash2 size={12} /> Clear Basket
              </button>
            )}
          </div>
        </div>

        {/* ════════ COLUMN 3: ACTION PANEL & CHECKOUT (RIGHT) ════════ */}
        <div className="w-[300px] xl:w-[340px] flex flex-col bg-white shrink-0 overflow-hidden shadow-lg border-l border-emerald-100">
          
          {/* Action Buttons Header */}
          <div className="p-3 bg-emerald-50/70 border-b border-emerald-100 flex items-center justify-between shrink-0">
            <div>
              <h3 className="text-xs font-black text-slate-900">POS Actions</h3>
              <p className="text-[10px] text-slate-500 font-medium">Quick function shortcuts</p>
            </div>
            <button
              type="button"
              onClick={() => setShowShortcutsHelp(true)}
              className="text-[10px] font-black text-emerald-800 bg-white hover:bg-emerald-100 border border-emerald-300 px-2 py-1 rounded-lg cursor-pointer transition-colors shadow-2xs flex items-center gap-1"
              title="Keyboard Shortcuts Cheat Sheet"
            >
              <span>Shortcuts [?]</span>
            </button>
          </div>

          {/* Action Buttons Grid (3 columns x 4 rows) */}
          <div className="p-3 bg-[#FAFDFB] border-b border-emerald-100 shrink-0">
            <div className="grid grid-cols-3 gap-1.5">
              <ActionButton 
                icon={<User size={15} />} 
                label="Customer" 
                sub="F6" 
                color="#059669" 
                onClick={() => setShowCustomer(true)} 
              />
              <ActionButton 
                icon={<Percent size={15} />} 
                label="Bill Disc" 
                sub="F4 (%/Rs)" 
                color="#7C3AED" 
                active={cart.billDiscount.value > 0}
                onClick={() => {
                  setBillDiscountType(cart.billDiscount.type);
                  setBillDiscountVal(cart.billDiscount.value ? String(cart.billDiscount.value) : '');
                  setShowBillDiscountModal(true);
                }} 
              />
              <ActionButton 
                icon={<Key size={15} />} 
                label="Price Override" 
                sub="Edit Cart Prices" 
                color="#2563EB" 
                onClick={handleOpenPriceOverrideModal} 
              />
              <ActionButton 
                icon={<Tag size={15} />} 
                label="Promos" 
                sub={eligiblePromotions.length > 0 ? `${eligiblePromotions.length} Qual!` : activePromotions.length > 0 ? `${activePromotions.length} Deals` : "F5 Deals"} 
                color="#0D9488" 
                active={eligiblePromotions.length > 0 || !!cart.activePromoTitle || activePromotions.length > 0}
                onClick={handleOpenPromotionsModal} 
              />
              <ActionButton 
                icon={<Pause size={15} />} 
                label="Hold" 
                sub="F7" 
                color="#D97706" 
                onClick={() => handleHoldBill(false)} 
              />
              <ActionButton 
                icon={<Play size={15} />} 
                label="Retrieve" 
                sub={heldBills.length > 0 ? `${heldBills.length} held` : "F8"} 
                color="#0284C7" 
                active={heldBills.length > 0}
                onClick={() => { loadHeldBills(); setShowHeldBills(true); }} 
              />
              <ActionButton 
                icon={<Ticket size={15} />} 
                label="Voucher" 
                sub={appliedVoucher ? appliedVoucher.code : "Gift Card"} 
                color="#E11D48" 
                active={!!appliedVoucher}
                onClick={() => {
                  setVoucherModalError('');
                  setVoucherModalResult(null);
                  setVoucherCode(appliedVoucher?.code || '');
                  setShowVoucherModal(true);
                }} 
              />
              <ActionButton 
                icon={<ArrowLeftRight size={15} />} 
                label="Return/Exch" 
                sub="Refund" 
                color="#DC2626" 
                onClick={() => setShowRefundModal(true)} 
              />
              <ActionButton 
                icon={<Sparkles size={15} />} 
                label="Custom" 
                sub="Ins/Alt+C" 
                color="#10B981" 
                onClick={() => {
                  setCustomItemForm({ name: '', quantity: 1, unit: 'pc', price: '', notes: '' });
                  setShowCustomItemModal(true);
                }} 
              />
              <ActionButton 
                icon={<DoorOpen size={15} />} 
                label="Drawer" 
                sub="Ctrl+D" 
                color="#0D9488" 
                onClick={handleRequestOpenDrawer} 
              />
              <ActionButton 
                icon={<Lock size={15} />} 
                label="Lock POS" 
                sub="Ctrl+L" 
                color="#D97706" 
                onClick={handleLockScreen} 
              />
              <ActionButton 
                icon={<ArrowLeftRight size={15} />} 
                label="Handover" 
                sub="F12 Shift" 
                color="#059669" 
                onClick={handleOpenShiftHandover} 
              />
              <ActionButton 
                icon={<Trash2 size={15} />} 
                label="Void Cart" 
                sub="F11 / Del" 
                color="#EF4444" 
                onClick={() => {
                  if (cart.items.length > 0 && confirm('Void / Clear all items from cart?')) {
                    cart.clearCart();
                  }
                }} 
              />
            </div>
          </div>

          {/* Spacer */}
          <div className="flex-1 bg-[#FAFDFB]"></div>

          {/* Cart Totals & Dual Checkout Buttons */}
          <div className="p-3 bg-white border-t border-emerald-100 space-y-2.5 shadow-md shrink-0">
            <div className="space-y-1 text-xs">
              <div className="flex justify-between text-slate-500 font-medium">
                <span>Subtotal</span>
                <span className="font-mono text-slate-800 font-bold">Rs {cart.getSubtotal().toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
              </div>

              {/* Line items discount total */}
              {cart.items.some(i => (i.discount || 0) > 0) && (
                <div className="flex justify-between text-purple-700 font-bold">
                  <span>Item Discounts</span>
                  <span className="font-mono">- Rs {cart.items.reduce((s, i) => s + (Number(i.discount) || 0), 0).toFixed(2)}</span>
                </div>
              )}

              {/* Bill-level discount */}
              {cart.billDiscount.value > 0 && (
                <div className="flex justify-between items-center text-rose-600 font-bold">
                  <span className="flex items-center gap-1">
                    <span>Bill Discount ({cart.billDiscount.type === 'percent' ? `${cart.billDiscount.value}%` : `Rs.${cart.billDiscount.value}`})</span>
                    <button 
                      onClick={() => cart.clearBillDiscount()}
                      className="text-slate-400 hover:text-rose-600 cursor-pointer text-[10px]"
                      title="Remove bill discount"
                    >
                      ×
                    </button>
                  </span>
                  <span className="font-mono">- Rs {cart.getBillDiscountAmount().toFixed(2)}</span>
                </div>
              )}

              {/* Loyalty Points Redeemed */}
              {cart.loyaltyDiscountAmount > 0 && (
                <div className="flex justify-between items-center text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
                  <span className="flex items-center gap-1">
                    <span>⭐ Points ({cart.redeemedLoyaltyPoints} pts)</span>
                    <button 
                      onClick={() => cart.clearLoyaltyRedemption()}
                      className="text-slate-400 hover:text-rose-600 cursor-pointer text-[10px]"
                      title="Cancel points redemption"
                    >
                      ×
                    </button>
                  </span>
                  <span className="font-mono">- Rs {cart.loyaltyDiscountAmount.toFixed(2)}</span>
                </div>
              )}

              {/* Active Promotion Badge */}
              {cart.activePromoTitle && (
                <div className="flex justify-between items-center bg-teal-50 px-2 py-0.5 rounded-lg border border-teal-200 text-teal-900 font-bold text-[11px]">
                  <span>🎉 Promo: {cart.activePromoTitle}</span>
                  <button 
                    onClick={() => cart.clearPromoDiscounts()}
                    className="text-slate-400 hover:text-rose-600 cursor-pointer text-[10px]"
                    title="Remove applied promotion"
                  >
                    ×
                  </button>
                </div>
              )}

              {/* Applied Voucher */}
              {appliedVoucher && (
                <div className="flex justify-between items-center bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200 text-xs">
                  <span className="font-bold text-emerald-900">Voucher: {appliedVoucher.code}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-black text-emerald-700 font-mono">- Rs {Number(appliedVoucher.remainingValue || 0).toFixed(2)}</span>
                    <button onClick={handleRemoveAppliedVoucher} className="text-slate-400 hover:text-red-500 font-bold cursor-pointer">×</button>
                  </div>
                </div>
              )}
            </div>

            {/* Total Due Banner */}
            {(() => {
              const isAllRefund = cart.items.length > 0 && cart.items.every(i => i.quantity < 0);
              const isExchange = cart.items.some(i => i.quantity < 0) && !isAllRefund;

              return (
                <div className={`text-white p-3 rounded-2xl flex flex-col justify-between shadow-md transition-all ${
                  isAllRefund 
                    ? 'bg-gradient-to-r from-rose-700 to-red-600 shadow-rose-700/20' 
                    : isExchange 
                    ? 'bg-gradient-to-r from-amber-600 to-teal-700 shadow-teal-700/20' 
                    : 'bg-gradient-to-r from-emerald-700 to-teal-700 shadow-emerald-700/20'
                }`}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[10px] font-bold text-white/90 uppercase tracking-widest flex items-center gap-1">
                      {isAllRefund ? '↩️ Refund to Customer' : isExchange ? '🔄 Exchange Balance' : `Total Due (${pricingType})`}
                    </span>
                    <span className="text-[11px] font-bold text-white/80">
                      {cart.items.length} Items
                    </span>
                  </div>
                  <p className="text-2xl font-black font-mono tracking-tight">
                    {cartTotal < 0 ? '-' : ''}Rs {Math.abs(cartTotal).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              );
            })()}

            {/* Dual Checkout Action Buttons: Exact Cash (F10) & Full Checkout (F9 / Space) */}
            {(() => {
              const isAllRefund = cart.items.length > 0 && cart.items.every(i => i.quantity < 0);
              const isExchange = cart.items.some(i => i.quantity < 0) && !isAllRefund;

              return (
                <div className="flex gap-2">
                  {!isAllRefund && !isExchange && (
                    <button
                      type="button"
                      onClick={handleFastCashCheckout}
                      disabled={cart.items.length === 0}
                      className="flex-1 py-3.5 px-3 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-md bg-amber-500 hover:bg-amber-600 active:scale-[0.98] disabled:opacity-40 text-white cursor-pointer transition-all"
                      title="Instant Exact Cash Payment (F10)"
                    >
                      <Banknote size={18} />
                      <span>Cash (F10)</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      if (cart.items.length === 0) {
                        alert('Cart is empty. Please add items first.');
                        return;
                      }
                      if (!activeSession) {
                        alert(`Cannot process bill: Cash register session is CLOSED for this terminal (${terminalConfig.current_terminal_name || terminalConfig.current_terminal_id}). Please open a session first!`);
                        setShowOpenSessionModal(true);
                        return;
                      }
                      setShowCheckout(true);
                    }}
                    disabled={cart.items.length === 0}
                    className={`flex-2 py-3.5 px-3 rounded-2xl font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition-all ${
                      cart.items.length === 0
                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed border border-gray-300'
                        : isAllRefund
                        ? 'bg-rose-600 hover:bg-rose-700 active:scale-[0.98] text-white shadow-rose-600/30 cursor-pointer'
                        : isExchange
                        ? 'bg-teal-600 hover:bg-teal-700 active:scale-[0.98] text-white shadow-teal-600/30 cursor-pointer'
                        : 'bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white shadow-emerald-600/30 cursor-pointer'
                    }`}
                  >
                    {isAllRefund ? (
                      <>
                        <RotateCcw size={18} />
                        <span>Refund (F9)</span>
                      </>
                    ) : isExchange ? (
                      <>
                        <ArrowLeftRight size={18} />
                        <span>Exchange (F9)</span>
                      </>
                    ) : (
                      <>
                        <CreditCard size={18} />
                        <span>Pay (F9 / Space)</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })()}
          </div>

        </div>

      </div>

      {/* ── MODAL: OPEN SESSION (START REGISTER SHIFT) ── */}
      {showOpenSessionModal && (
        <OpenSessionModal 
          onOpenSession={handleOpenSessionOnTerminal} 
          onClose={() => setShowOpenSessionModal(false)} 
        />
      )}

      {/* ── MODAL: CHECKOUT (PAYMENT SELECTION & COMPLETION) ── */}
      {showCheckout && (
        <CheckoutModal 
          total={cartTotal} 
          cartItems={cart.items} 
          customer={activeCustomer} 
          initialVoucher={appliedVoucher}
          settings={settings}
          onComplete={handleCheckout} 
          onCancel={() => setShowCheckout(false)} 
        />
      )}

      {/* ── MODAL: HELD BILLS ── */}
      {showHeldBills && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setShowHeldBills(false)}>
          <div className="bg-white border border-gray-200 rounded-3xl w-full max-w-lg p-6 shadow-2xl flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Layers size={18} className="text-emerald-600" />
                <span>Held Transactions ({heldBills.length})</span>
              </h3>
              <button onClick={() => setShowHeldBills(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2">
              {heldBills.length === 0 ? (
                <p className="text-center text-slate-400 py-8 text-xs font-bold">No held bills found</p>
              ) : (
                heldBills.map(bill => {
                  let items: any[] = [];
                  try {
                    const raw = bill.cart_data || bill.items_json;
                    items = typeof raw === 'string' ? JSON.parse(raw) : (raw || []);
                  } catch (_) {
                    items = [];
                  }
                  const billTotal = Number(bill.total) || items.reduce((sum: number, it: any) => sum + (Number(it.price || 0) * Number(it.quantity || 1)), 0);
                  return (
                    <div key={bill.id} className="bg-gray-50 p-3 rounded-2xl border border-gray-200 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-black text-slate-900">Hold #{bill.id} • {bill.customer_name || 'Walk-in'}</p>
                        <p className="text-[11px] font-bold text-emerald-700">{items.length} item{items.length === 1 ? '' : 's'} • Rs. {billTotal.toFixed(2)}</p>
                        <p className="text-[10px] text-slate-400">{formatSriLankaDateTime(bill.created_at)}</p>
                      </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleRestoreHeldBill(bill)}
                        className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs"
                      >
                        Retrieve
                      </button>
                      <button
                        onClick={async () => {
                          if (window.confirm(`Discard Hold #${bill.id}?`)) {
                            // @ts-ignore
                            if (window.db?.deleteHeldBill) {
                              // @ts-ignore
                              await window.db.deleteHeldBill(bill.id);
                              await loadHeldBills();
                            }
                          }
                        }}
                        className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50"
                        title="Discard this held bill"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                  );
                })
              )}
            </div>

            {heldBills.length > 0 && (
              <div className="pt-3 border-t border-slate-100 flex justify-between items-center shrink-0">
                <span className="text-[11px] text-slate-400 font-bold">{heldBills.length} held order{heldBills.length === 1 ? '' : 's'}</span>
                <button
                  type="button"
                  onClick={async () => {
                    if (window.confirm('Are you sure you want to discard ALL held bills?')) {
                      // @ts-ignore
                      if (window.db?.clearAllHeldBills) {
                        // @ts-ignore
                        await window.db.clearAllHeldBills();
                      } else if (window.db?.deleteHeldBill) {
                        for (const b of heldBills) {
                          // @ts-ignore
                          await window.db.deleteHeldBill(b.id);
                        }
                      }
                      await loadHeldBills();
                    }
                  }}
                  className="text-xs text-rose-600 hover:text-rose-800 font-bold flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Trash2 size={13} />
                  <span>Discard All</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════ MANUAL QUANTITY PROMPT MODAL ════════ */}
      {(quantityModalProduct || quantityModalCartItem) && createPortal(
        <div 
          className="fixed inset-0 z-[99999] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => {
            setQuantityModalProduct(null);
            setQuantityModalCartItem(null);
          }}
        >
          <div 
            className="bg-white border border-slate-200 rounded-3xl w-full max-w-sm shadow-2xl p-6 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex justify-between items-start pb-3 border-b border-slate-100">
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                  {quantityModalCartItem ? 'Edit Cart Item Quantity' : 'Enter Quantity'}
                </span>
                <h3 className="text-base font-black text-slate-900 mt-1 truncate">
                  {quantityModalCartItem?.name || quantityModalProduct?.name}
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  Price: <strong className="text-slate-800">Rs. {Number(quantityModalCartItem?.price || quantityModalProduct?.price || 0).toFixed(2)}</strong> / {quantityModalCartItem?.unit || quantityModalProduct?.unit || 'pc'}
                  {quantityModalProduct && Number(quantityModalProduct.stock) > 0 && (
                    <span className="ml-2 text-slate-400">• Stock: {quantityModalProduct.stock}</span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setQuantityModalProduct(null);
                  setQuantityModalCartItem(null);
                }}
                className="p-1.5 text-slate-400 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-full cursor-pointer ml-2"
              >
                <X size={18} />
              </button>
            </div>

            {/* Input & Calculator */}
            <div className="py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Quantity ({quantityModalCartItem?.unit || quantityModalProduct?.unit || 'pc'})
                  </label>
                  <input
                    ref={quantityInputRef}
                    type="number"
                    step="any"
                    min="0.001"
                    value={quantityInputVal}
                    onChange={e => setQuantityInputVal(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleConfirmQuantityModal();
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        setQuantityModalProduct(null);
                        setQuantityModalCartItem(null);
                      }
                    }}
                    className="w-full px-3 py-2 border-2 border-emerald-500 rounded-2xl font-black text-xl text-slate-900 text-center outline-none focus:ring-4 focus:ring-emerald-500/20 shadow-xs"
                    autoFocus
                  />
                </div>
                {(() => {
                  const targetProd = quantityModalCartItem || quantityModalProduct;
                  const isOverrideAllowed = targetProd?.allow_price_override !== 0 && targetProd?.allow_price_override !== false;
                  const isPriceChanged = isOverrideAllowed && Math.abs(Number(quantityPriceOverride || 0) - Number(quantityModalCartItem?.price || quantityModalProduct?.price || 0)) > 0.001;

                  return (
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center justify-between">
                        <span>Unit Price (Rs.)</span>
                        {isOverrideAllowed ? (
                          <span className="text-[10px] text-slate-400">Std: {Number(quantityModalCartItem?.price || quantityModalProduct?.price || 0).toFixed(2)}</span>
                        ) : (
                          <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">🔒 Price Locked</span>
                        )}
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        disabled={!isOverrideAllowed}
                        value={isOverrideAllowed ? quantityPriceOverride : Number(quantityModalCartItem?.price || quantityModalProduct?.price || 0).toFixed(2)}
                        onChange={e => isOverrideAllowed && setQuantityPriceOverride(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleConfirmQuantityModal();
                          }
                        }}
                        className={`w-full px-3 py-2 border-2 rounded-2xl font-black text-xl text-center outline-none transition-colors shadow-xs ${
                          !isOverrideAllowed
                            ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed select-none'
                            : isPriceChanged
                              ? 'border-amber-500 bg-amber-50/40 text-amber-900'
                              : 'border-slate-300 text-slate-900 focus:border-emerald-500'
                        }`}
                      />
                      {!isOverrideAllowed && (
                        <p className="text-[10px] font-semibold text-slate-400 text-center mt-1">
                          Price locked by store management
                        </p>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Price Override Indicator */}
              {(() => {
                const targetProd = quantityModalCartItem || quantityModalProduct;
                const isOverrideAllowed = targetProd?.allow_price_override !== 0 && targetProd?.allow_price_override !== false;
                if (!isOverrideAllowed) return null;
                return Math.abs(Number(quantityPriceOverride || 0) - Number(quantityModalCartItem?.price || quantityModalProduct?.price || 0)) > 0.001 ? (
                  <div className="px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-xs text-amber-800 animate-in fade-in duration-150">
                    <span className="font-bold flex items-center gap-1">
                      <Tag size={12} /> Price Override Active
                    </span>
                    <span className="font-mono font-black text-amber-900">Rs. {Number(quantityPriceOverride || 0).toFixed(2)}</span>
                  </div>
                ) : null;
              })()}

              {/* Quick Preset Buttons */}
              <div className="grid grid-cols-4 gap-1.5">
                {[1, 2, 3, 5, 6, 10, 12, 24].map(preset => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setQuantityInputVal(String(preset));
                      quantityInputRef.current?.focus();
                    }}
                    className="py-1.5 bg-slate-100 hover:bg-emerald-100 hover:text-emerald-800 text-slate-700 rounded-xl font-bold text-xs transition-colors cursor-pointer"
                  >
                    +{preset}
                  </button>
                ))}
              </div>

              {/* Touch Numpad */}
              <div className="grid grid-cols-3 gap-1.5 pt-1">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '.'].map(btn => (
                  <button
                    key={btn}
                    type="button"
                    onClick={() => {
                      if (btn === 'C') {
                        setQuantityInputVal('');
                      } else if (btn === '.') {
                        if (!quantityInputVal.includes('.')) {
                          setQuantityInputVal(prev => (prev || '0') + '.');
                        }
                      } else {
                        setQuantityInputVal(prev => (prev === '0' || prev === '1' ? btn : prev + btn));
                      }
                      quantityInputRef.current?.focus();
                    }}
                    className="py-2 bg-slate-50 hover:bg-slate-200 active:scale-95 text-slate-800 font-bold text-sm rounded-xl transition-all cursor-pointer"
                  >
                    {btn}
                  </button>
                ))}
              </div>

              {/* Line Total preview */}
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex justify-between items-center text-xs">
                <span className="font-bold text-emerald-900">Calculated Line Total:</span>
                <span className="font-black text-sm text-emerald-800 font-mono">
                  Rs. {(
                    (Number(quantityInputVal) || 0) * 
                    (Number(quantityPriceOverride) >= 0 ? Number(quantityPriceOverride) : Number(quantityModalCartItem?.price || quantityModalProduct?.price || 0))
                  ).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setQuantityModalProduct(null);
                  setQuantityModalCartItem(null);
                }}
                className="flex-1 py-2.5 rounded-2xl font-bold text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmQuantityModal}
                disabled={!quantityInputVal || Number(quantityInputVal) <= 0}
                className="flex-2 py-2.5 rounded-2xl font-black text-xs text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:opacity-40 transition-all shadow-md shadow-emerald-600/20 cursor-pointer"
              >
                {quantityModalCartItem ? 'Update (Enter)' : 'Add to Basket (Enter)'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ════════ ITEM DISCOUNT MODAL ════════ */}
      {discountModalItem && createPortal(
        <div 
          className="fixed inset-0 z-[99999] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setDiscountModalItem(null)}
        >
          <div 
            className="bg-white border border-slate-200 rounded-3xl w-full max-w-sm shadow-2xl p-6 flex flex-col animate-in fade-in zoom-in-95 duration-150"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-start pb-3 border-b border-slate-100">
              <div>
                <span className="text-[10px] font-black uppercase text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md">
                  Item Line Discount (F3)
                </span>
                <h3 className="text-base font-black text-slate-900 mt-1 truncate max-w-[240px]">
                  {discountModalItem.name}
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  {discountModalItem.quantity} × Rs. {Number(discountModalItem.price).toFixed(2)} = Rs. {(discountModalItem.quantity * discountModalItem.price).toFixed(2)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDiscountModalItem(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-full cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="py-4 space-y-3">
              {/* Toggle: Percentage vs Fixed */}
              <div className="flex p-1 bg-slate-100 rounded-2xl">
                <button
                  type="button"
                  onClick={() => setItemDiscountType('percent')}
                  className={`flex-1 py-1.5 rounded-xl font-black text-xs transition-all ${
                    itemDiscountType === 'percent' ? 'bg-white text-purple-700 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Percentage (%)
                </button>
                <button
                  type="button"
                  onClick={() => setItemDiscountType('fixed')}
                  className={`flex-1 py-1.5 rounded-xl font-black text-xs transition-all ${
                    itemDiscountType === 'fixed' ? 'bg-white text-purple-700 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Fixed Amount (Rs.)
                </button>
              </div>

              {/* Input */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  {itemDiscountType === 'percent' ? 'Discount Percentage (%)' : 'Discount Amount (Rs.)'}
                </label>
                <input
                  ref={itemDiscountInputRef}
                  type="number"
                  step="any"
                  min="0"
                  max={itemDiscountType === 'percent' ? 100 : (discountModalItem.price * discountModalItem.quantity)}
                  placeholder={itemDiscountType === 'percent' ? 'e.g. 10' : 'e.g. 50'}
                  value={itemDiscountVal}
                  onChange={e => setItemDiscountVal(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleApplyItemDiscount();
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      setDiscountModalItem(null);
                    }
                  }}
                  className="w-full px-4 py-2.5 border-2 border-purple-500 rounded-2xl font-black text-xl text-slate-900 text-center outline-none focus:ring-4 focus:ring-purple-500/20"
                  autoFocus
                />
              </div>

              {/* Presets */}
              {itemDiscountType === 'percent' ? (
                <div className="grid grid-cols-5 gap-1.5">
                  {[5, 10, 15, 20, 50].map(pct => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setItemDiscountVal(String(pct))}
                      className="py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-800 rounded-xl font-bold text-xs transition-colors cursor-pointer"
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-1.5">
                  {[10, 20, 50, 100].map(amt => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setItemDiscountVal(String(amt))}
                      className="py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-800 rounded-xl font-bold text-xs transition-colors cursor-pointer"
                    >
                      Rs.{amt}
                    </button>
                  ))}
                </div>
              )}

              {/* Live Preview */}
              {(() => {
                const gross = discountModalItem.price * discountModalItem.quantity;
                const val = Number(itemDiscountVal) || 0;
                const disc = itemDiscountType === 'percent' ? (gross * val) / 100 : Math.min(gross, val);
                const net = Math.max(0, gross - disc);
                return (
                  <div className="p-3 bg-purple-50/70 border border-purple-200 rounded-2xl flex justify-between items-center text-xs">
                    <div>
                      <span className="text-purple-800 font-bold block">Discount: -Rs. {disc.toFixed(2)}</span>
                      <span className="text-[10px] text-slate-500">Gross: Rs. {gross.toFixed(2)}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-500 block">New Line Total</span>
                      <span className="font-black text-purple-950 font-mono text-sm">Rs. {net.toFixed(2)}</span>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-100">
              {discountModalItem.discount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    cart.removeItemDiscount(discountModalItem.cartId);
                    setDiscountModalItem(null);
                  }}
                  className="px-3 py-2.5 rounded-2xl font-bold text-xs text-rose-600 bg-rose-50 hover:bg-rose-100 transition-colors cursor-pointer"
                >
                  Remove
                </button>
              )}
              <button
                type="button"
                onClick={() => setDiscountModalItem(null)}
                className="flex-1 py-2.5 rounded-2xl font-bold text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyItemDiscount}
                className="flex-1 py-2.5 rounded-2xl font-black text-xs text-white bg-purple-600 hover:bg-purple-700 active:scale-95 transition-all shadow-md shadow-purple-600/20 cursor-pointer"
              >
                Apply Discount
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ════════ CART ITEMS PRICE OVERRIDE MODAL ════════ */}
      {showPriceOverrideModal && createPortal(
        <div 
          className="fixed inset-0 z-[99999] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowPriceOverrideModal(false)}
        >
          <div 
            className="bg-white border border-slate-200 rounded-3xl w-full max-w-xl shadow-2xl p-6 flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150 overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex justify-between items-start pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                  <Tag size={22} />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">
                    Cart Adjustment
                  </span>
                  <h3 className="text-base font-black text-slate-900 mt-0.5">
                    Cart Items Price Override
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPriceOverrideModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-full cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Direct Edit Prices of Cart Items */}
            <div className="flex-1 flex flex-col overflow-hidden py-3 space-y-3">
              <p className="text-xs text-slate-500 font-medium">
                Change unit prices for any product in the current cart. Modifications apply immediately upon clicking Apply.
              </p>

              <div className="flex-1 overflow-y-auto space-y-2 pr-1 divide-y divide-slate-100">
                {priceOverrideItems.map((item, idx) => {
                  const parsedNew = Number(item.newPrice);
                  const isAllowed = (item as any).allow_price_override !== 0 && (item as any).allow_price_override !== false;
                  const isChanged = isAllowed && !isNaN(parsedNew) && Math.abs(parsedNew - item.originalPrice) > 0.001;
                  return (
                    <div key={item.cartId} className="pt-2 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <h4 className="text-xs font-black text-slate-800 truncate">{item.name}</h4>
                          {!isAllowed && (
                            <span className="text-[9px] font-black uppercase text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.2 rounded shrink-0">
                              🔒 Locked
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-500 font-medium">
                          Qty: <strong className="text-slate-700">{item.quantity} {item.unit}</strong> • Default: Rs. {item.originalPrice.toFixed(2)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-bold text-slate-500">Rs.</span>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          disabled={!isAllowed}
                          value={item.newPrice}
                          onChange={e => {
                            if (!isAllowed) return;
                            const val = e.target.value;
                            setPriceOverrideItems(prev => prev.map((pi, i) => i === idx ? { ...pi, newPrice: val } : pi));
                          }}
                          className={`w-28 px-3 py-1.5 border-2 rounded-xl text-center font-black font-mono text-sm outline-none transition-colors ${
                            !isAllowed
                              ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed select-none'
                              : isChanged 
                                ? 'border-amber-500 bg-amber-50/50 text-amber-900 focus:ring-2 focus:ring-amber-500/20' 
                                : 'border-slate-200 bg-slate-50 text-slate-900 focus:bg-white focus:border-blue-500'
                          }`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer Actions */}
              <div className="pt-3 border-t border-slate-100 flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowPriceOverrideModal(false)}
                  className="flex-1 py-2.5 rounded-2xl font-bold text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApplyPriceOverrideChanges}
                  className="flex-2 py-2.5 rounded-2xl font-black text-xs text-white bg-blue-600 hover:bg-blue-700 active:scale-95 transition-all shadow-md shadow-blue-600/20 cursor-pointer"
                >
                  Apply New Prices (Enter)
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ════════ WHOLE-CART BILL DISCOUNT MODAL ════════ */}
      {showBillDiscountModal && createPortal(
        <div 
          className="fixed inset-0 z-[99999] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowBillDiscountModal(false)}
        >
          <div 
            className="bg-white border border-slate-200 rounded-3xl w-full max-w-sm shadow-2xl p-6 flex flex-col animate-in fade-in zoom-in-95 duration-150"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-start pb-3 border-b border-slate-100">
              <div>
                <span className="text-[10px] font-black uppercase text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                  Whole Cart Bill Discount (F4)
                </span>
                <h3 className="text-base font-black text-slate-900 mt-1">
                  Apply Bill Discount
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  Subtotal: <strong className="text-slate-800">Rs. {cart.getSubtotal().toFixed(2)}</strong> ({cart.items.length} items)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowBillDiscountModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-full cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="py-4 space-y-3">
              {/* Toggle: Percentage vs Fixed */}
              <div className="flex p-1 bg-slate-100 rounded-2xl">
                <button
                  type="button"
                  onClick={() => setBillDiscountType('percent')}
                  className={`flex-1 py-1.5 rounded-xl font-black text-xs transition-all ${
                    billDiscountType === 'percent' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Percentage (%)
                </button>
                <button
                  type="button"
                  onClick={() => setBillDiscountType('fixed')}
                  className={`flex-1 py-1.5 rounded-xl font-black text-xs transition-all ${
                    billDiscountType === 'fixed' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Fixed Amount (Rs.)
                </button>
              </div>

              {/* Input */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  {billDiscountType === 'percent' ? 'Discount Percentage (%)' : 'Discount Amount (Rs.)'}
                </label>
                <input
                  ref={billDiscountInputRef}
                  type="number"
                  step="any"
                  min="0"
                  max={billDiscountType === 'percent' ? 100 : cart.getSubtotal()}
                  placeholder={billDiscountType === 'percent' ? 'e.g. 5' : 'e.g. 100'}
                  value={billDiscountVal}
                  onChange={e => setBillDiscountVal(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleApplyBillDiscount();
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      setShowBillDiscountModal(false);
                    }
                  }}
                  className="w-full px-4 py-2.5 border-2 border-emerald-500 rounded-2xl font-black text-xl text-slate-900 text-center outline-none focus:ring-4 focus:ring-emerald-500/20"
                  autoFocus
                />
              </div>

              {/* Presets */}
              {billDiscountType === 'percent' ? (
                <div className="grid grid-cols-5 gap-1.5">
                  {[2, 5, 10, 15, 20].map(pct => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setBillDiscountVal(String(pct))}
                      className="py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl font-bold text-xs transition-colors cursor-pointer"
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-1.5">
                  {[50, 100, 200, 500].map(amt => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setBillDiscountVal(String(amt))}
                      className="py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl font-bold text-xs transition-colors cursor-pointer"
                    >
                      Rs.{amt}
                    </button>
                  ))}
                </div>
              )}

              {/* Live Preview */}
              {(() => {
                const sub = cart.getSubtotal();
                const val = Number(billDiscountVal) || 0;
                const disc = billDiscountType === 'percent' ? (sub * Math.min(100, val)) / 100 : Math.min(sub, val);
                const net = Math.max(0, sub - disc);
                return (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex justify-between items-center text-xs">
                    <div>
                      <span className="text-emerald-900 font-bold block">Bill Discount: -Rs. {disc.toFixed(2)}</span>
                      <span className="text-[10px] text-slate-500">Subtotal: Rs. {sub.toFixed(2)}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-500 block">Net Payable</span>
                      <span className="font-black text-emerald-950 font-mono text-sm">Rs. {net.toFixed(2)}</span>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-100">
              {cart.billDiscount.value > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    cart.clearBillDiscount();
                    setBillDiscountVal('');
                    setShowBillDiscountModal(false);
                  }}
                  className="px-3 py-2.5 rounded-2xl font-bold text-xs text-rose-600 bg-rose-50 hover:bg-rose-100 transition-colors cursor-pointer"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowBillDiscountModal(false)}
                className="flex-1 py-2.5 rounded-2xl font-bold text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyBillDiscount}
                className="flex-1 py-2.5 rounded-2xl font-black text-xs text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 transition-all shadow-md shadow-emerald-600/20 cursor-pointer"
              >
                Apply to Bill
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ════════ REDEEM LOYALTY POINTS MODAL ════════ */}
      {showLoyaltyModal && createPortal(
        <div 
          className="fixed inset-0 z-[99999] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowLoyaltyModal(false)}
        >
          <div 
            className="bg-white border border-slate-200 rounded-3xl w-full max-w-md shadow-2xl p-6 flex flex-col animate-in fade-in zoom-in-95 duration-150"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-start pb-3 border-b border-slate-100">
              <div>
                <span className="text-[10px] font-black uppercase text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md">
                  Customer Loyalty Program (F6)
                </span>
                <h3 className="text-base font-black text-slate-900 mt-1">
                  Redeem Loyalty Points
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  Customer: <strong className="text-slate-800">{activeCustomer?.name || 'Customer'}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowLoyaltyModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-full cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="py-4 space-y-3">
              {(() => {
                const pointRate = Number(settings?.loyalty_point_value_rs) > 0 ? Number(settings.loyalty_point_value_rs) : 1.0;
                const totalPoints = Number(activeCustomer?.points) || 0;
                const cartTotalDue = cart.getSubtotal() - (cart.items.reduce((s, i) => s + (Number(i.discount) || 0), 0) + cart.getBillDiscountAmount());
                const maxPointsByBill = Math.ceil(cartTotalDue / pointRate);
                const maxRedeemable = Math.max(0, Math.min(totalPoints, maxPointsByBill));
                const numInput = Number(loyaltyRedeemInput) || 0;
                const disc = numInput * pointRate;

                return (
                  <>
                    <div className="p-3.5 bg-gradient-to-tr from-amber-50 to-orange-50 border border-amber-200 rounded-2xl flex justify-between items-center">
                      <div>
                        <span className="text-[10px] font-black text-amber-800 uppercase tracking-wider block">Available Balance</span>
                        <span className="text-2xl font-black text-amber-950">{totalPoints} Points</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] font-bold text-amber-700 block">Cash Value</span>
                        <span className="text-sm font-black text-amber-900 font-mono">Rs. {(totalPoints * pointRate).toFixed(2)}</span>
                        <span className="text-[10px] text-amber-600 block">(1 pt = Rs. {pointRate})</span>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-[11px] font-bold text-slate-600">Points to Redeem</label>
                        <span className="text-[11px] text-slate-400">Max for this bill: {maxRedeemable} pts</span>
                      </div>
                      <input
                        type="number"
                        min="0"
                        max={maxRedeemable}
                        value={loyaltyRedeemInput}
                        onChange={e => {
                          const val = Math.max(0, Math.min(Number(e.target.value) || 0, maxRedeemable));
                          setLoyaltyRedeemInput(val ? String(val) : '');
                        }}
                        placeholder={`Enter points (up to ${maxRedeemable})`}
                        className="w-full px-4 py-2.5 border-2 border-amber-500 rounded-2xl font-black text-xl text-slate-900 text-center outline-none focus:ring-4 focus:ring-amber-500/20"
                        autoFocus
                      />
                    </div>

                    <div className="grid grid-cols-4 gap-2">
                      {[25, 50, 100, maxRedeemable].map((pts, i) => (
                        <button
                          key={i}
                          type="button"
                          disabled={pts <= 0 || pts > maxRedeemable}
                          onClick={() => setLoyaltyRedeemInput(String(pts))}
                          className="py-1.5 bg-amber-50 hover:bg-amber-100 disabled:opacity-30 text-amber-900 rounded-xl font-bold text-xs transition-colors cursor-pointer"
                        >
                          {i === 3 ? 'Redeem All' : `${pts} pts`}
                        </button>
                      ))}
                    </div>

                    {numInput > 0 && (
                      <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex justify-between items-center text-xs">
                        <div>
                          <span className="font-bold text-emerald-900 block">✓ {numInput} Points Applied</span>
                          <span className="text-[10px] text-slate-500">Remaining Balance: {totalPoints - numInput} pts</span>
                        </div>
                        <span className="font-black text-emerald-800 font-mono text-sm">
                          -Rs. {disc.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-100">
              {cart.redeemedLoyaltyPoints > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    cart.clearLoyaltyRedemption();
                    setLoyaltyRedeemInput('');
                    setShowLoyaltyModal(false);
                  }}
                  className="px-3 py-2.5 rounded-2xl font-bold text-xs text-rose-600 bg-rose-50 hover:bg-rose-100 transition-colors cursor-pointer"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowLoyaltyModal(false)}
                className="flex-1 py-2.5 rounded-2xl font-bold text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const pointRate = Number(settings?.loyalty_point_value_rs) > 0 ? Number(settings.loyalty_point_value_rs) : 1.0;
                  const pts = Number(loyaltyRedeemInput) || 0;
                  if (pts > 0) {
                    cart.setLoyaltyRedemption(pts, pts * pointRate);
                    playBeep(2400, 0.1);
                  }
                  setShowLoyaltyModal(false);
                }}
                disabled={!loyaltyRedeemInput || Number(loyaltyRedeemInput) <= 0}
                className="flex-1 py-2.5 rounded-2xl font-black text-xs text-white bg-amber-600 hover:bg-amber-700 active:scale-95 disabled:opacity-40 transition-all shadow-md shadow-amber-600/20 cursor-pointer"
              >
                Apply Points Discount
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ════════ ACTIVE PROMOTIONS ENGINE MODAL ════════ */}
      {showPromotionsModal && createPortal(
        <div 
          className="fixed inset-0 z-[99999] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowPromotionsModal(false)}
        >
          <div 
            className="bg-white border border-slate-200 rounded-3xl w-full max-w-2xl shadow-2xl p-6 flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-start pb-3 border-b border-slate-100">
              <div>
                <span className="text-[10px] font-black uppercase text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md flex items-center gap-1 w-max">
                  <Tag size={12} /> Active Store Promotions (F5)
                </span>
                <h3 className="text-base font-black text-slate-900 mt-1">
                  Promotions &amp; Special Deals
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  Active promotional campaigns automatically matched to items in your cart.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPromotionsModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-full cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-3">
              {activePromotions.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <Tag size={36} className="mx-auto mb-2 opacity-30" />
                  <p className="font-bold text-sm text-slate-700">No active promotions currently configured</p>
                  <p className="text-xs text-slate-400 mt-0.5">Campaigns can be created in Back Office &gt; Promotions.</p>
                </div>
              ) : (
                activePromotions.map((promo: any) => {
                  const isQualified = eligiblePromotions.some(ep => ep.id === promo.id);
                  const isApplied = (cart.activePromoTitle && cart.activePromoTitle.includes(promo.name)) || cart.items.some(i => i.isPromoDiscount && i.promoName === promo.name);

                  return (
                    <div 
                      key={promo.id}
                      className={`p-4 rounded-2xl border transition-all ${
                        isApplied
                          ? 'bg-emerald-50/80 border-emerald-400 shadow-xs'
                          : isQualified
                          ? 'bg-teal-50/60 border-teal-300'
                          : 'bg-slate-50/80 border-slate-200'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-black text-sm text-slate-900">{promo.name}</h4>
                            {isApplied && (
                              <span className="text-[10px] font-black bg-emerald-600 text-white px-2 py-0.5 rounded-full">
                                ✓ Applied to Basket
                              </span>
                            )}
                            {!isApplied && isQualified && (
                              <span className="text-[10px] font-black bg-teal-600 text-white px-2 py-0.5 rounded-full animate-pulse">
                                🎉 Qualified in Cart!
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-600 mt-1 flex items-center gap-2">
                            <span className="font-bold text-emerald-700 bg-emerald-100/60 px-2 py-0.5 rounded">
                              {promo.discount_type === 'PERCENT' ? `${promo.discount_value}% OFF` : `Rs. ${promo.discount_value} OFF`}
                            </span>
                            {promo.start_date && promo.end_date && (
                              <span className="text-slate-400 text-[11px]">
                                Valid: {new Date(promo.start_date).toLocaleDateString()} - {new Date(promo.end_date).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            if (isApplied) {
                              cart.clearPromoDiscounts();
                            } else {
                              handleApplyPromotion(promo);
                            }
                          }}
                          className={`px-3.5 py-1.5 rounded-xl font-black text-xs transition-all cursor-pointer ${
                            isApplied
                              ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 shadow-2xs'
                              : isQualified
                              ? 'bg-teal-600 hover:bg-teal-700 text-white shadow-xs'
                              : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                          }`}
                        >
                          {isApplied ? 'Remove Deal' : isQualified ? 'Apply Deal' : 'Add Items to Qualify'}
                        </button>
                      </div>

                      {promo.items && promo.items.length > 0 ? (
                        <div className="mt-2.5 pt-2 border-t border-slate-200/60">
                          <span className="text-[10px] font-bold text-slate-500 uppercase">Target Products:</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {promo.items.map((pi: any, idx: number) => {
                              const inCart = cart.items.find(ci => Number(ci.id) === Number(pi.product_id) || (pi.barcode && ci.barcode && pi.barcode === ci.barcode));
                              return (
                                <span 
                                  key={idx}
                                  className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                                    inCart 
                                      ? 'bg-emerald-100 text-emerald-900 border-emerald-300' 
                                      : 'bg-white text-slate-600 border-slate-200'
                                  }`}
                                >
                                  {inCart ? '✓ ' : ''}{pi.product_name || `Product #${pi.product_id}`} {pi.required_qty > 1 ? `(Min ${pi.required_qty})` : ''}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2.5 pt-2 border-t border-slate-200/60">
                          <span className="text-[10px] font-black text-teal-800 bg-teal-100/70 border border-teal-300 px-2 py-0.5 rounded-md inline-flex items-center gap-1">
                            🌐 Storewide Promotion — Applies to entire basket
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-slate-100">
              <span className="text-xs text-slate-400">
                Tip: Press <strong className="text-slate-700">F5</strong> in POS to check deals anytime.
              </span>
              <button
                type="button"
                onClick={() => setShowPromotionsModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold text-xs text-slate-700 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ════════ KEYBOARD SHORTCUTS CHEAT SHEET MODAL ════════ */}
      {showShortcutsHelp && createPortal(
        <div 
          className="fixed inset-0 z-[99999] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowShortcutsHelp(false)}
        >
          <div 
            className="bg-white border border-slate-200 rounded-3xl w-full max-w-lg shadow-2xl p-6 flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <span>⌨️ Supermarket POS Keyboard Shortcuts</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowShortcutsHelp(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-full cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="py-4 space-y-2 overflow-y-auto text-xs">
              {[
                { key: 'F1', desc: 'Smart Product Lookup & Search (Name, Barcode, PLU, Item Code)' },
                { key: 'F2', desc: 'Edit Quantity (Adjust quantity of last item in basket)' },
                { key: 'F3', desc: 'Item-Level Discount (% or Rs on selected product)' },
                { key: 'F4', desc: 'Whole-Cart Bill Discount (% or Rs on entire sale)' },
                { key: 'F5', desc: 'Active Promotions Engine (View and apply special deals)' },
                { key: 'F6', desc: 'Customer Selection & Loyalty Points Redemption' },
                { key: 'Insert / Alt+C', desc: 'Add Custom / Open Item (Unbarcoded produce, custom price)' },
                { key: 'F7', desc: 'Hold Current Bill (Suspend cart to serve another customer)' },
                { key: 'F8', desc: 'Recall Held Bills (Restore suspended cart)' },
                { key: 'F9 / Space', desc: 'Checkout & Payment Split (Cards, Cash, Vouchers, Points)' },
                { key: 'F10', desc: 'Fast Exact Cash Checkout (Instant 1-key cash settlement)' },
                { key: 'F11 / Del', desc: 'Void / Clear Current Cart' },
                { key: 'F12', desc: 'Cashier Shift Handover & Drawer Count' },
                { key: 'Ctrl + L', desc: 'Lock Register / PIN Lock Screen' },
                { key: 'Ctrl + D', desc: 'Kick / Pop Open Physical Cash Drawer' },
                { key: 'Ctrl + I', desc: 'Past Sales Invoices & Receipts (Supervisor PIN)' },
                { key: 'Esc', desc: 'Close any active popup modal' },
              ].map((s, idx) => (
                <div key={idx} className="flex items-center justify-between py-2 px-3 rounded-xl bg-slate-50 border border-slate-100">
                  <kbd className="px-2 py-1 bg-white border border-slate-300 rounded-lg font-mono font-black text-slate-800 shadow-2xs">
                    {s.key}
                  </kbd>
                  <span className="text-slate-700 font-medium text-right flex-1 ml-4">
                    {s.desc}
                  </span>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setShowShortcutsHelp(false)}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs cursor-pointer shadow-xs"
              >
                Got it
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── MODAL: VOUCHER / GIFT CARD ── */}
      {showVoucherModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setShowVoucherModal(false)}>
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl p-6 overflow-hidden flex flex-col border border-gray-100" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-2">
                <Ticket className="text-emerald-600" size={22} />
                <h3 className="font-bold text-xl text-slate-900">Apply Voucher</h3>
              </div>
              <button onClick={() => setShowVoucherModal(false)} className="text-gray-400 hover:text-red-500"><X size={20}/></button>
            </div>
            <p className="text-xs text-gray-500 mb-4">Enter voucher code to validate against cart value.</p>
            
            <div className="flex gap-2 mb-3">
              <input 
                id="voucher-input"
                type="text" 
                placeholder="e.g. NOVA100" 
                value={voucherCode} 
                onChange={e => {
                  setVoucherCode(e.target.value.toUpperCase());
                  setVoucherModalError('');
                  setVoucherModalResult(null);
                }} 
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleValidateVoucherInModal();
                  }
                }}
                className="flex-1 px-4 py-3 rounded-xl border border-gray-200 focus:border-emerald-600 outline-none font-black text-base uppercase" 
                autoFocus 
              />
              <button 
                type="button"
                onClick={handleValidateVoucherInModal} 
                disabled={isVoucherValidating || !voucherCode.trim()}
                className="px-5 py-3 rounded-xl font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-all disabled:opacity-40 text-xs shadow-md shadow-emerald-600/20"
              >
                {isVoucherValidating ? 'Checking...' : 'Check'}
              </button>
            </div>

            {voucherModalError && (
              <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-xl text-xs mb-3 font-semibold">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <span>{voucherModalError}</span>
              </div>
            )}

            {voucherModalResult && (
              <div className="space-y-3 mb-4">
                <div className="bg-emerald-50 border border-emerald-200 p-3.5 rounded-xl">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <CheckCircle size={15} className="text-emerald-600" />
                        <span className="font-black text-sm text-emerald-900">{voucherModalResult.voucher.code}</span>
                      </div>
                      <p className="text-[11px] text-emerald-700 mt-0.5">{voucherModalResult.voucher.note || 'Gift Card / Discount Voucher'}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-base font-black text-emerald-900">Rs. {voucherModalResult.remainingValue.toLocaleString()}</span>
                      <p className="text-[10px] text-emerald-600 font-bold uppercase">{voucherModalResult.voucher.type}</p>
                    </div>
                  </div>
                </div>

                {!voucherModalResult.isCartSufficient && (
                  <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-xl text-amber-900 space-y-2">
                    <p className="font-bold text-xs">Cart Total is Below Voucher Value</p>
                    <p className="text-[11px] text-amber-800">
                      Current Cart: <strong>Rs. {voucherModalResult.cartTotal.toLocaleString()}</strong>.
                    </p>
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setShowVoucherModal(false)}
                        className="flex-1 py-2 px-3 rounded-lg text-xs font-bold bg-white border border-amber-300 text-amber-800 hover:bg-amber-100"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleConfirmApplyVoucher(true)}
                        className="flex-1 py-2 px-3 rounded-lg text-xs font-bold bg-amber-600 text-white hover:bg-amber-700"
                      >
                        Override & Apply
                      </button>
                    </div>
                  </div>
                )}

                {voucherModalResult.isCartSufficient && (
                  <div className="bg-blue-50 border border-blue-200 p-3 rounded-xl text-xs text-blue-900 flex justify-between items-center">
                    <span>Cart is sufficient ✓</span>
                    <button
                      type="button"
                      onClick={() => handleConfirmApplyVoucher(false)}
                      className="py-2 px-4 rounded-lg font-bold bg-emerald-600 text-white hover:bg-emerald-700 text-xs shadow-xs"
                    >
                      Apply Voucher
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── CUSTOMER MODAL ── */}
      {showCustomer && (
        <CustomerModal
          onSelect={(cust: any) => {
            setActiveCustomer(cust);
            setShowCustomer(false);
            playBeep(1600, 0.05);
          }}
          onClose={() => setShowCustomer(false)}
        />
      )}

      {/* ── CUSTOM / OPEN ITEM ENTRY MODAL ── */}
      {showCustomItemModal && (
        <div className="fixed inset-0 bg-slate-950/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white text-slate-900 rounded-3xl w-full max-w-md p-6 shadow-2xl relative border border-emerald-100">
            
            <div className="flex items-center justify-between pb-3 border-b border-emerald-100 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                  <Sparkles size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">Add Custom / Open Item</h3>
                  <p className="text-[10px] text-slate-500 font-medium">Billed as regular product on receipt</p>
                </div>
              </div>
              <button 
                onClick={() => setShowCustomItemModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const priceNum = parseFloat(customItemForm.price);
                const qtyNum = parseFloat(String(customItemForm.quantity));
                if (!customItemForm.name.trim()) {
                  alert('Please enter an item name');
                  return;
                }
                if (isNaN(priceNum) || priceNum < 0) {
                  alert('Please enter a valid price');
                  return;
                }
                if (isNaN(qtyNum) || qtyNum <= 0) {
                  alert('Please enter a valid quantity greater than 0');
                  return;
                }

                cart.addCustomItem({
                  name: customItemForm.name.trim(),
                  quantity: qtyNum,
                  unit: customItemForm.unit || 'pc',
                  price: priceNum,
                  notes: customItemForm.notes.trim()
                });
                playBeep(2200, 0.08);
                setShowCustomItemModal(false);
              }}
              className="space-y-3.5"
            >
              {/* Item Name */}
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1">
                  Item Name / Description <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Seasonal Exotic Produce, Packaging Hamper"
                  value={customItemForm.name}
                  onChange={e => setCustomItemForm({ ...customItemForm, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-emerald-600 focus:bg-white"
                  autoFocus
                  required
                />
              </div>

              {/* Qty & Unit */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1">
                    Quantity <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0.001"
                    placeholder="1"
                    value={customItemForm.quantity}
                    onChange={e => setCustomItemForm({ ...customItemForm, quantity: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-emerald-600 focus:bg-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1">
                    Unit
                  </label>
                  <select
                    value={customItemForm.unit}
                    onChange={e => setCustomItemForm({ ...customItemForm, unit: e.target.value })}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-emerald-600 focus:bg-white cursor-pointer"
                  >
                    <option value="pc">Piece (pc)</option>
                    <option value="kg">Kilogram (kg)</option>
                    <option value="g">Gram (g)</option>
                    <option value="pack">Pack</option>
                    <option value="box">Box</option>
                    <option value="bundle">Bundle</option>
                    <option value="l">Litre (l)</option>
                    <option value="ml">Millilitre (ml)</option>
                  </select>
                </div>
              </div>

              {/* Unit Price */}
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1">
                  Unit Price (Rs.) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">Rs</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={customItemForm.price}
                    onChange={e => setCustomItemForm({ ...customItemForm, price: e.target.value })}
                    className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 outline-none focus:border-emerald-600 focus:bg-white"
                    required
                  />
                </div>
              </div>

              {/* Live Line Total Calculation Banner */}
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100 flex items-center justify-between text-xs">
                <span className="font-bold text-emerald-800">Line Total:</span>
                <span className="text-sm font-black font-mono text-emerald-900">
                  Rs. {((parseFloat(customItemForm.price) || 0) * (parseFloat(String(customItemForm.quantity)) || 0)).toFixed(2)}
                </span>
              </div>

              {/* Reason / Notes */}
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1">
                  Cashier Notes / Reason <span className="text-slate-400 font-normal">(Logged for Audit)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Scuffed barcode, custom basket packaging"
                  value={customItemForm.notes}
                  onChange={e => setCustomItemForm({ ...customItemForm, notes: e.target.value })}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 outline-none focus:border-emerald-600 focus:bg-white"
                />
              </div>

              {/* Buttons */}
              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCustomItemModal(false)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold text-xs text-slate-600 transition-colors cursor-pointer"
                >
                  Cancel (Esc)
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl font-black text-xs shadow-md shadow-emerald-600/30 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Plus size={14} />
                  <span>Add to Basket</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── REFUND & EXCHANGE MODAL ── */}
      {showRefundModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white text-slate-900 rounded-3xl w-full max-w-5xl p-6 shadow-2xl relative max-h-[92vh] overflow-y-auto">
            <button 
              onClick={() => setShowRefundModal(false)} 
              className="absolute top-5 right-5 text-gray-400 hover:text-red-500 p-2 z-10 cursor-pointer"
              title="Close"
            >
              <X size={20} />
            </button>
            <RefundView 
              currentUser={currentUser} 
              onClose={() => setShowRefundModal(false)}
              onSendToCart={(returnedItems: any[], invId: number) => {
                returnedItems.forEach(item => {
                  cart.addReturnItem({
                    id: item.id,
                    name: item.name,
                    price: item.price,
                    quantity: item.qty,
                    variantId: item.variantId,
                    unit: item.unit,
                    originalInvoiceId: invId,
                    is_damaged: item.is_damaged,
                    return_condition: item.return_condition
                  });
                });
                cart.setParentInvoiceId(invId);
                setShowRefundModal(false);
              }}
            />
          </div>
        </div>
      )}

      {/* ── SALES INVOICES & PAST RECEIPTS MODAL ── */}
      {showInvoicesModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white text-slate-900 rounded-3xl w-full max-w-6xl p-6 shadow-2xl relative h-[90vh] flex flex-col overflow-hidden">
            <button 
              onClick={() => setShowInvoicesModal(false)} 
              className="absolute top-5 right-5 text-gray-400 hover:text-red-500 p-2 z-10 cursor-pointer"
              title="Close (Esc)"
            >
              <X size={20} />
            </button>
            <div className="flex-1 overflow-hidden">
              <SalesHistoryView 
                currentUser={currentUser} 
                onClose={() => setShowInvoicesModal(false)} 
              />
            </div>
          </div>
        </div>
      )}

      {/* ── WEIGHED / VOLUME ITEM ENTRY MODAL ── */}
      {(weighedModalProduct || editingCartItem) && (
        <WeighedItemModal
          product={weighedModalProduct || editingCartItem}
          existingQuantity={editingCartItem ? editingCartItem.quantity : undefined}
          isEditing={Boolean(editingCartItem)}
          onConfirm={handleWeighedConfirm}
          onClose={() => {
            setWeighedModalProduct(null);
            setEditingCartItem(null);
          }}
        />
      )}

      {/* ── POST-CHECKOUT PRINT CONFIRMATION MODAL ── */}
      {receiptData && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm print:hidden">
          <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col w-full max-w-md max-h-[92vh] overflow-y-auto border border-gray-100">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center space-x-2">
                <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                  <CheckCircle size={22} />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-lg leading-tight">
                    {receiptData.saleType === 'refund' 
                      ? 'Refund Processed ✓' 
                      : receiptData.saleType === 'exchange'
                      ? 'Exchange Completed! ✓'
                      : 'Sale Completed! ✓'}
                  </h3>
                  <p className="text-xs text-gray-400 font-mono">Invoice #{receiptData.invoiceNo}</p>
                </div>
              </div>
              <button onClick={() => setReceiptData(null)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 cursor-pointer">
                <X size={20}/>
              </button>
            </div>

            {/* Summary Card */}
            <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 text-xs space-y-2 mb-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-500 font-medium">
                  {receiptData.saleType === 'refund' ? 'Refund Given' : receiptData.saleType === 'exchange' ? 'Net Exchange Total' : 'Total Amount'}
                </span>
                <span className={`text-base font-black ${receiptData.saleType === 'refund' ? 'text-rose-600' : 'text-slate-900'}`}>
                  {receiptData.total < 0 ? '-' : ''}Rs {Math.abs(Number(receiptData.total || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500 font-medium">Payment Method</span>
                <span className="font-bold text-slate-800">{receiptData.method}</span>
              </div>
              {receiptData.method === 'Cash' && receiptData.change > 0 && (
                <div className="flex justify-between items-center text-emerald-600 font-bold">
                  <span>Change to Return</span>
                  <span>Rs {Number(receiptData.change || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              )}
              {receiptData.customer && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 font-medium">Customer</span>
                  <span className="font-bold text-slate-800">{receiptData.customer.name}</span>
                </div>
              )}
              {receiptData.claimedPoints > 0 && (
                <div className="flex justify-between items-center text-amber-700 font-bold bg-amber-50 px-2 py-1 rounded-lg border border-amber-200">
                  <span>Points Redeemed</span>
                  <span>-{receiptData.claimedPoints} pts (-Rs {Number(receiptData.pointsDiscount || 0).toFixed(2)})</span>
                </div>
              )}
              {receiptData.earnedPoints > 0 && (
                <div className="flex justify-between items-center text-emerald-700 font-bold bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">
                  <span>Points Earned</span>
                  <span>+{receiptData.earnedPoints} pts</span>
                </div>
              )}
              {receiptData.customer && (
                <div className="flex justify-between items-center text-purple-700 font-black">
                  <span>New Points Balance</span>
                  <span>{receiptData.customerNewPoints} pts</span>
                </div>
              )}
              <div className="flex justify-between items-center border-t border-gray-200/60 pt-2 mt-2">
                <span className="text-gray-500 font-medium">Printer Status</span>
                <span className={`font-semibold flex items-center gap-1 ${agentOnline ? 'text-emerald-600' : 'text-blue-600'}`}>
                  {agentOnline ? <><CheckCircle size={12}/> ESC/POS Agent (Port 7777)</> : 'System / Browser Print'}
                </span>
              </div>
            </div>

            {printStatus === 'printing' && (
              <div className="flex items-center justify-center space-x-2 text-blue-600 bg-blue-50 py-2.5 px-3 rounded-xl font-medium text-xs mb-3 animate-pulse">
                <Printer size={15} />
                <span>Printing receipt...</span>
              </div>
            )}
            {printStatus === 'success' && (
              <div className="flex items-center justify-center space-x-2 text-emerald-600 bg-emerald-50 py-2.5 px-3 rounded-xl font-medium text-xs mb-3">
                <CheckCircle size={15} />
                <span>Receipt printed successfully! ✓</span>
              </div>
            )}
            {printStatus === 'error' && (
              <div className="flex items-center justify-center space-x-2 text-rose-600 bg-rose-50 py-2.5 px-3 rounded-xl font-medium text-xs mb-3">
                <AlertCircle size={15} />
                <span>{printError || 'Print failed'}</span>
              </div>
            )}

            <div className="flex gap-3 mt-2">
              <button
                type="button"
                onClick={async () => {
                  await executePrint(receiptData);
                  setReceiptData(null);
                }}
                disabled={printStatus === 'printing'}
                className="flex-1 py-3 px-4 rounded-xl font-black bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 hover:bg-emerald-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 text-xs cursor-pointer"
              >
                <Printer size={16} />
                <span>{printStatus === 'printing' ? 'Printing...' : 'Print Receipt (Enter)'}</span>
              </button>
              <button
                type="button"
                onClick={() => setReceiptData(null)}
                className="py-3 px-5 rounded-xl font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 active:scale-[0.98] transition-all text-xs cursor-pointer"
              >
                Skip (Esc)
              </button>
            </div>

            {/* Preview Toggle */}
            <button
              onClick={() => setShowInvoicePreview(!showInvoicePreview)}
              className="mt-4 text-xs font-semibold text-gray-400 hover:text-gray-600 flex items-center justify-center gap-1.5 transition-colors"
            >
              {showInvoicePreview ? <><EyeOff size={14}/> Hide Preview</> : <><Eye size={14}/> View Invoice Preview</>}
            </button>

            {showInvoicePreview && (
              <div className="mt-4 border border-gray-100 rounded-2xl p-3 bg-gray-50 flex justify-center max-h-64 overflow-y-auto">
                <div className="w-80 shadow-md bg-white">
                  <Invoice sale={receiptData} items={receiptData.items} settings={settings} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {receiptData && createPortal(
        <div className="print-only" id="hidden-receipt-container">
          <Invoice 
            sale={{ 
              id: receiptData.invoiceNo, 
              invoice_no: receiptData.invoiceNo, 
              created_at: receiptData.createdAt || receiptData.date || new Date(), 
              total: receiptData.total, 
              subtotal: receiptData.subtotal, 
              discount: receiptData.discount || 0,
              split: receiptData.split 
            }} 
            items={receiptData.items} 
            paymentMethod={receiptData.method} 
            amountPaid={receiptData.paid} 
            settings={settings}
          />
        </div>,
        document.body
      )}

      {/* ════════ FULL-SCREEN CASHIER LOCK SCREEN (QUICK PIN UNLOCK) ════════ */}
      {isLocked && createPortal(
        <div className="fixed inset-0 z-[99999] bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4 select-none">
          <div className="bg-white border border-emerald-500/30 rounded-3xl w-full max-w-md p-6 shadow-2xl flex flex-col items-center animate-in fade-in zoom-in-95 duration-200">
            
            {/* Terminal & Branch Header */}
            <div className="w-full flex items-center justify-between pb-3 border-b border-gray-100 mb-4 text-xs">
              <div className="flex items-center gap-1.5 text-slate-500">
                <ShieldCheck size={16} className="text-emerald-600" />
                <span className="font-bold text-slate-700">{terminalConfig.current_branch_name || 'Main Branch'}</span>
              </div>
              <span className="font-mono font-bold bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200">
                {terminalConfig.current_terminal_name || 'TERM-01'}
              </span>
            </div>

            {/* Lock Status & Cashier Avatar */}
            <div className="flex flex-col items-center text-center mb-5">
              <div className="relative mb-2">
                <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white text-3xl font-black shadow-lg shadow-emerald-600/30">
                  {(activeCashier?.username || 'C').charAt(0).toUpperCase()}
                </div>
                <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-amber-500 border-2 border-white flex items-center justify-center text-white shadow-xs">
                  <Lock size={13} />
                </div>
              </div>

              <h2 className="text-xl font-black text-slate-900 tracking-tight">
                {activeCashier?.username || 'Cashier'}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded-md">
                  {activeCashier?.role || 'Cashier'}
                </span>
                <span className="text-[11px] text-amber-600 font-bold flex items-center gap-1">
                  <Clock size={12} />
                  Locked at {lockTime ? lockTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Now'}
                </span>
              </div>

              <p className="text-xs text-slate-500 mt-2 max-w-xs">
                Screen is locked for rest/break. Active cart ({cart.items.length} items, Rs. {cart.getTotal().toFixed(2)}) is safely preserved.
              </p>
            </div>

            {/* Error Message */}
            {lockError && (
              <div className="w-full mb-3 p-2.5 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs font-bold flex items-center gap-2 animate-shake">
                <AlertCircle size={15} className="shrink-0" />
                <span>{lockError}</span>
              </div>
            )}

            {/* Unlock PIN Input or Admin Override */}
            {!showAdminOverride ? (
              <form onSubmit={handleUnlockWithPin} className="w-full space-y-4">
                <div className="relative">
                  <input
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoFocus
                    placeholder="Enter PIN to Unlock"
                    value={lockPin}
                    onChange={e => {
                      setLockPin(e.target.value);
                      if (lockError) setLockError('');
                    }}
                    className="w-full text-center text-2xl font-black tracking-widest px-4 py-3 bg-gray-50 border-2 border-gray-200 focus:border-emerald-600 focus:bg-white rounded-2xl outline-none transition-all"
                  />
                </div>

                {/* Touch PIN Keypad */}
                <div className="grid grid-cols-3 gap-2">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => {
                        setLockPin(prev => prev + num);
                        if (lockError) setLockError('');
                      }}
                      className="py-3 bg-gray-100 hover:bg-emerald-50 active:bg-emerald-100 hover:text-emerald-800 rounded-xl font-black text-lg text-slate-800 transition-all cursor-pointer select-none"
                    >
                      {num}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setLockPin('')}
                    className="py-3 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl font-bold text-xs uppercase transition-all cursor-pointer"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLockPin(prev => prev + '0');
                      if (lockError) setLockError('');
                    }}
                    className="py-3 bg-gray-100 hover:bg-emerald-50 active:bg-emerald-100 hover:text-emerald-800 rounded-xl font-black text-lg text-slate-800 transition-all cursor-pointer select-none"
                  >
                    0
                  </button>
                  <button
                    type="button"
                    onClick={() => setLockPin(prev => prev.slice(0, -1))}
                    className="py-3 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl font-bold text-xs uppercase transition-all cursor-pointer"
                  >
                    Del
                  </button>
                </div>

                {/* Primary Unlock Button */}
                <button
                  type="submit"
                  disabled={!lockPin}
                  className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-40 text-white rounded-2xl font-black text-sm shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <Unlock size={18} />
                  <span>Unlock &amp; Resume Checkout</span>
                </button>
              </form>
            ) : (
              /* Admin/Manager Override Form */
              <form onSubmit={handleAdminOverrideUnlock} className="w-full space-y-3">
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 font-semibold mb-2">
                  <ShieldCheck size={16} className="inline mr-1 text-amber-600" />
                  Manager / Supervisor PIN override to unlock this terminal.
                </div>
                <div>
                  <label className="text-[11px] font-black uppercase text-slate-500 mb-1 block">Supervisor Username</label>
                  <input
                    type="text"
                    value={adminOverrideUser}
                    onChange={e => setAdminOverrideUser(e.target.value)}
                    placeholder="e.g. Admin or Manager"
                    autoFocus
                    className="w-full px-3 py-2.5 border rounded-xl font-bold text-sm outline-none focus:border-emerald-600"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-black uppercase text-slate-500 mb-1 block">Supervisor PIN / Password</label>
                  <input
                    type="password"
                    value={adminOverridePin}
                    onChange={e => setAdminOverridePin(e.target.value)}
                    placeholder="Enter Supervisor PIN"
                    className="w-full px-3 py-2.5 border rounded-xl font-bold text-sm outline-none focus:border-emerald-600"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAdminOverride(false)}
                    className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-slate-700 rounded-xl font-bold text-xs"
                  >
                    Back to Cashier PIN
                  </button>
                  <button
                    type="submit"
                    disabled={!adminOverrideUser || !adminOverridePin}
                    className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-black text-xs shadow-md shadow-amber-600/20"
                  >
                    Authorize Unlock
                  </button>
                </div>
              </form>
            )}

            {/* Bottom Actions: Switch Cashier / Supervisor Override */}
            <div className="w-full pt-4 mt-3 border-t border-gray-100 flex items-center justify-between text-xs font-bold">
              <button
                type="button"
                onClick={() => {
                  handleOpenShiftHandover();
                }}
                className="text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
              >
                <ArrowLeftRight size={13} />
                <span>Shift Handover / Switch User</span>
              </button>

              {!showAdminOverride ? (
                <button
                  type="button"
                  onClick={() => setShowAdminOverride(true)}
                  className="text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  Manager Override
                </button>
              ) : null}
            </div>

          </div>
        </div>,
        document.body
      )}

      {/* ════════ SHIFT HANDOVER MODAL (SUPERMARKET DAY SESSION CONTINUITY) ════════ */}
      {showShiftHandover && (
        <div className="fixed inset-0 z-[99998] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-gray-200 rounded-3xl w-full max-w-2xl p-6 shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
            
            {/* Header */}
            <div className="flex justify-between items-center pb-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white font-black shadow-md shadow-emerald-600/20">
                  <ArrowLeftRight size={20} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Cashier Shift Handover</h3>
                  <p className="text-xs text-slate-500">
                    Terminal <span className="font-bold text-slate-700">{terminalConfig.current_terminal_name || 'TERM-01'}</span> • Day Session #{activeSession?.id || 1}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowShiftHandover(false)}
                className="p-2 text-slate-400 hover:text-slate-700 bg-gray-50 hover:bg-gray-100 rounded-full transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* If Handover Just Completed: Show Slip */}
            {handoverSuccessSlip ? (
              <div className="py-6 flex flex-col items-center text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-1">
                  <CheckCircle2 size={36} />
                </div>
                <h4 className="text-xl font-black text-slate-900">Shift Handover Completed!</h4>
                <p className="text-xs text-slate-600 max-w-md">
                  Cashier <strong className="text-emerald-700">{handoverSuccessSlip.outgoingCashier}</strong> successfully handed over drawer to <strong className="text-emerald-700">{handoverSuccessSlip.incomingCashier}</strong>. The terminal's Day Session remains active.
                </p>

                {/* Handover Slip Summary Card */}
                <div className="w-full bg-[#FAFDFB] border border-emerald-200 rounded-2xl p-5 text-left text-xs space-y-2.5 font-mono">
                  <div className="flex justify-between border-b pb-2 text-slate-500 font-sans font-bold">
                    <span>HANDOVER SLIP #{handoverSuccessSlip.id}</span>
                    <span>{handoverSuccessSlip.handoverTime}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-sans">Terminal:</span>
                    <span className="font-bold text-slate-800">{handoverSuccessSlip.terminalId} ({terminalConfig.current_branch_name})</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-sans">Outgoing Cashier:</span>
                    <span className="font-bold text-slate-800">{handoverSuccessSlip.outgoingCashier}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-sans">Incoming Cashier:</span>
                    <span className="font-bold text-emerald-700">{handoverSuccessSlip.incomingCashier}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2">
                    <span className="text-slate-500 font-sans">Shift Bills:</span>
                    <span className="font-bold text-slate-800">{handoverSuccessSlip.billsCount} bills</span>
                  </div>
                  {isAdmin && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-sans">Shift Cash Sales:</span>
                        <span className="font-bold text-slate-800">Rs. {Number(handoverSuccessSlip.cashSales).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-sans">Shift Total Revenue:</span>
                        <span className="font-bold text-slate-800">Rs. {Number(handoverSuccessSlip.totalSales).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between border-t pt-2">
                        <span className="text-slate-500 font-sans">Expected Drawer Cash:</span>
                        <span className="font-bold text-slate-800">Rs. {Number(handoverSuccessSlip.expectedDrawerCash).toFixed(2)}</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-sans">Physical Counted Cash:</span>
                    <span className="font-bold text-emerald-800 font-black">Rs. {Number(handoverSuccessSlip.countedCash).toFixed(2)}</span>
                  </div>
                  {isAdmin && (
                    <div className="flex justify-between font-bold border-t pt-2">
                      <span className="text-slate-700 font-sans">Cash Variance:</span>
                      <span className={`${handoverSuccessSlip.cashVariance === 0 ? 'text-slate-600' : handoverSuccessSlip.cashVariance > 0 ? 'text-emerald-600' : 'text-rose-600'} font-black`}>
                        {handoverSuccessSlip.cashVariance > 0 ? `+Rs. ${Number(handoverSuccessSlip.cashVariance).toFixed(2)} (Surplus)` : handoverSuccessSlip.cashVariance < 0 ? `-Rs. ${Math.abs(handoverSuccessSlip.cashVariance).toFixed(2)} (Shortage)` : 'Rs. 0.00 (Balanced)'}
                      </span>
                    </div>
                  )}
                </div>

                <div className="w-full flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowShiftHandover(false);
                      setHandoverSuccessSlip(null);
                    }}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm rounded-xl shadow-md transition-all cursor-pointer"
                  >
                    Start Billing as {handoverSuccessSlip.incomingCashier}
                  </button>
                </div>
              </div>
            ) : (
              /* Handover Form */
              <form onSubmit={handleCompleteShiftHandover} className="py-4 space-y-4">
                
                {/* Architecture banner */}
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 text-xs text-emerald-900 flex items-start gap-2.5">
                  <ShieldCheck size={18} className="shrink-0 text-emerald-600 mt-0.5" />
                  <div>
                    <strong className="block font-black text-emerald-950">Supermarket Continuous Day Session</strong>
                    <span>
                      The Day Session on <strong>{terminalConfig.current_terminal_name || 'TERM-01'}</strong> stays open so daily sales and receipt sequences continue uninterrupted. All new invoices will automatically be stamped with the incoming cashier's name.
                    </span>
                  </div>
                </div>

                {/* Card 1: Outgoing Cashier Performance */}
                <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-3">
                  <div className="flex justify-between items-center pb-2 border-b border-gray-200">
                    <span className="text-xs font-black uppercase text-slate-500">Outgoing Cashier Shift Summary</span>
                    <span className="text-xs font-black text-slate-800 bg-white px-2 py-0.5 rounded-md border border-gray-200">
                      Cashier: {activeCashier?.username || 'Cashier'}
                    </span>
                  </div>

                  {loadingShiftSummary ? (
                    <div className="py-6 text-center text-xs text-slate-400 font-bold">
                      <RefreshCw size={16} className="animate-spin mx-auto mb-1 text-emerald-600" />
                      Calculating shift performance...
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {isAdmin ? (
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                          <div className="bg-white p-2.5 rounded-xl border border-gray-100">
                            <span className="text-[10px] text-slate-400 block font-bold uppercase">Bills Processed</span>
                            <span className="text-base font-black text-slate-800">{shiftSummary?.billsCount || 0}</span>
                          </div>
                          <div className="bg-white p-2.5 rounded-xl border border-gray-100">
                            <span className="text-[10px] text-slate-400 block font-bold uppercase">Opening Float</span>
                            <span className="text-base font-black text-slate-700">Rs. {Number(shiftSummary?.openingFloat || 0).toLocaleString()}</span>
                          </div>
                          <div className="bg-white p-2.5 rounded-xl border border-gray-100">
                            <span className="text-[10px] text-slate-400 block font-bold uppercase">Shift Cash Sales</span>
                            <span className="text-base font-black text-emerald-600">Rs. {Number(shiftSummary?.cashSales || 0).toLocaleString()}</span>
                          </div>
                          <div className="bg-white p-2.5 rounded-xl border border-gray-100">
                            <span className="text-[10px] text-slate-400 block font-bold uppercase">Cash In / Out</span>
                            <span className="text-xs font-black text-slate-700 block mt-1">
                              +{Number(shiftSummary?.cashIn || 0).toLocaleString()} / -{Number(shiftSummary?.cashOut || 0).toLocaleString()}
                            </span>
                          </div>
                          <div className="bg-emerald-50/70 p-2.5 rounded-xl border border-emerald-200">
                            <span className="text-[10px] text-emerald-800 block font-black uppercase">Expected Drawer</span>
                            <span className="text-base font-black text-emerald-800">Rs. {Number(shiftSummary?.expectedDrawerCash || 0).toLocaleString()}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-gray-200">
                          <div>
                            <span className="text-[10px] text-slate-400 block font-bold uppercase">Shift Activity</span>
                            <span className="text-sm font-black text-slate-800">{shiftSummary?.billsCount || 0} Bills Completed</span>
                          </div>
                          <span className="text-xs font-bold text-slate-500 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
                            Blind Shift Handover
                          </span>
                        </div>
                      )}
                      {isAdmin && (
                        <p className="text-[10px] text-slate-500 font-medium">
                          Calculation: Float ({Number(shiftSummary?.openingFloat || 0).toLocaleString()}) + Cash Sales ({Number(shiftSummary?.cashSales || 0).toLocaleString()}) + Cash In ({Number(shiftSummary?.cashIn || 0).toLocaleString()}) - Cash Out ({Number(shiftSummary?.cashOut || 0).toLocaleString()}) = Expected Rs. {Number(shiftSummary?.expectedDrawerCash || 0).toLocaleString()}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Card 2: Counted Drawer Cash & Variance */}
                <div className="bg-[#FAFDFB] border border-emerald-200 rounded-2xl p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-black uppercase text-slate-700">
                      Physical Cash Drawer Count (Rs.)
                    </label>
                    <span className="text-[11px] text-slate-400">
                      {isAdmin ? 'Count all physical currency in till' : 'Blind Drop: Count and enter all physical currency in till'}
                    </span>
                  </div>

                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-slate-400">Rs.</span>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      required
                      placeholder="0.00"
                      value={handoverCountedCash}
                      onChange={e => setHandoverCountedCash(e.target.value)}
                      className="w-full pl-12 pr-4 py-3 border-2 border-emerald-300 focus:border-emerald-600 rounded-2xl font-black text-xl text-slate-900 outline-none bg-white transition-all"
                    />
                  </div>

                  {/* Dynamic Variance Badge - Visible ONLY to Admin */}
                  {isAdmin && handoverCountedCash !== '' && (
                    <div className="flex items-center justify-between text-xs font-bold pt-1">
                      <span className="text-slate-500">Calculated Till Variance:</span>
                      {(() => {
                        const variance = Number(handoverCountedCash || 0) - Number(shiftSummary?.expectedDrawerCash || 0);
                        if (variance === 0) {
                          return <span className="text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 font-black">✅ Perfect Match (Rs. 0.00)</span>;
                        } else if (variance > 0) {
                          return <span className="text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 font-black">ℹ️ Cash Surplus: +Rs. {variance.toFixed(2)}</span>;
                        } else {
                          return <span className="text-rose-600 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200 font-black">⚠️ Cash Shortage: -Rs. {Math.abs(variance).toFixed(2)}</span>;
                        }
                      })()}
                    </div>
                  )}

                  {/* Handover Notes */}
                  <div>
                    <label className="text-[11px] font-black uppercase text-slate-400 mb-1 block">Handover Notes / Safe Drop (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Rs. 20,000 transferred to safe drop; drawer float Rs. 5,000 preserved"
                      value={handoverNotes}
                      onChange={e => setHandoverNotes(e.target.value)}
                      className="w-full px-3 py-2 border rounded-xl text-xs font-medium outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                {/* Card 3: Incoming Cashier Verification */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                    <span className="text-xs font-black uppercase text-slate-700">Incoming Cashier Verification</span>
                    <span className="text-[11px] text-slate-400">Next shift operator signs in</span>
                  </div>

                  {incomingCashierError && (
                    <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-600 rounded-xl text-xs font-bold flex items-center gap-2">
                      <AlertCircle size={15} className="shrink-0" />
                      <span>{incomingCashierError}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-black uppercase text-slate-500 mb-1 block">Select Incoming Cashier</label>
                      <select
                        value={incomingCashierUsername}
                        onChange={e => {
                          setIncomingCashierUsername(e.target.value);
                          setIncomingCashierError('');
                        }}
                        className="w-full px-3 py-2.5 border rounded-xl font-bold text-xs bg-white outline-none focus:border-emerald-600"
                        required
                      >
                        <option value="">-- Choose Cashier --</option>
                        {systemUsersList.map((u: any) => (
                          <option key={u.id} value={u.username}>
                            {u.username} ({u.role || 'Cashier'})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-black uppercase text-slate-500 mb-1 block">Incoming Cashier PIN</label>
                      <input
                        type="password"
                        placeholder="Enter your PIN to verify"
                        value={incomingCashierPin}
                        onChange={e => {
                          setIncomingCashierPin(e.target.value);
                          setIncomingCashierError('');
                        }}
                        className="w-full px-3 py-2.5 border rounded-xl font-bold text-xs bg-white outline-none focus:border-emerald-600"
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* Modal Buttons */}
                <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setShowShiftHandover(false)}
                    className="px-5 py-2.5 rounded-xl font-bold text-xs text-slate-600 hover:bg-gray-100 border border-gray-200 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!handoverCountedCash || !incomingCashierUsername || !incomingCashierPin}
                    className="px-6 py-2.5 rounded-xl font-black text-xs text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:opacity-40 shadow-md shadow-emerald-600/30 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Check size={16} />
                    <span>Complete Handover &amp; Switch Cashier</span>
                  </button>
                </div>

              </form>
            )}

          </div>
        </div>
      )}

      {/* ════════ SMART PRODUCT LOOKUP MODAL (F1 / POPUP) ════════ */}
      {showLookupModal && createPortal(
        <div 
          className="fixed inset-0 z-[99999] bg-slate-950/60 backdrop-blur-sm flex items-start justify-center pt-12 px-4 pb-8"
          onClick={() => setShowLookupModal(false)}
        >
          <div 
            className="bg-white border border-slate-200 rounded-3xl w-full max-w-4xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[85vh]"
            onClick={e => e.stopPropagation()}
          >
            {/* Search Header */}
            <div className="p-4 bg-slate-50 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-emerald-600/20">
                  <Search size={20} />
                </div>
                <div className="flex-1 relative">
                  <input
                    ref={lookupInputRef}
                    type="text"
                    value={lookupQuery}
                    onChange={e => {
                      setLookupQuery(e.target.value);
                      setLookupSelectedIndex(0);
                    }}
                    onKeyDown={e => {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setLookupSelectedIndex(prev => (prev + 1 < smartLookupResults.length ? prev + 1 : prev));
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setLookupSelectedIndex(prev => (prev - 1 >= 0 ? prev - 1 : 0));
                      } else if (e.key === 'Enter') {
                        e.preventDefault();
                        if (smartLookupResults[lookupSelectedIndex]) {
                          const chosen = smartLookupResults[lookupSelectedIndex];
                          setShowLookupModal(false);
                          handleAddToCart(chosen);
                        }
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        setShowLookupModal(false);
                      }
                    }}
                    placeholder="Search by product name, barcode, PLU code, or item code..."
                    className="w-full pl-3 pr-10 py-3 bg-white border-2 border-emerald-500 rounded-2xl font-bold text-sm text-slate-800 placeholder-slate-400 outline-none shadow-sm focus:ring-4 focus:ring-emerald-500/10"
                  />
                  {lookupQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setLookupQuery('');
                        setLookupSelectedIndex(0);
                        lookupInputRef.current?.focus();
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setShowLookupModal(false)}
                  className="p-2.5 text-slate-400 hover:text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-2xl transition-colors cursor-pointer"
                  title="Close (Esc)"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Quick instructions & stats */}
              <div className="flex items-center justify-between mt-2.5 px-1 text-xs text-slate-500 font-medium">
                <div className="flex items-center gap-3">
                  <span>Results: <strong className="text-slate-800 font-bold">{smartLookupResults.length}</strong> items</span>
                  <span className="hidden sm:inline">•</span>
                  <span className="hidden sm:inline">Use <kbd className="px-1.5 py-0.5 bg-white border border-slate-300 rounded text-[10px] font-mono text-slate-700 shadow-xs">↑</kbd> <kbd className="px-1.5 py-0.5 bg-white border border-slate-300 rounded text-[10px] font-mono text-slate-700 shadow-xs">↓</kbd> to navigate</span>
                  <span className="hidden sm:inline">•</span>
                  <span className="hidden sm:inline">Press <kbd className="px-1.5 py-0.5 bg-white border border-slate-300 rounded text-[10px] font-mono text-slate-700 shadow-xs">ENTER</kbd> to add</span>
                </div>
                <div>
                  <kbd className="px-1.5 py-0.5 bg-white border border-slate-300 rounded text-[10px] font-mono text-slate-700 shadow-xs">ESC</kbd> to close
                </div>
              </div>
            </div>

            {/* Results Table / List */}
            <div className="flex-1 overflow-y-auto max-h-[60vh] divide-y divide-slate-100">
              {smartLookupResults.length === 0 ? (
                <div className="py-16 text-center text-slate-400">
                  <Search size={36} className="mx-auto mb-2 opacity-30" />
                  <p className="font-bold text-sm text-slate-600">No matching products found</p>
                  <p className="text-xs text-slate-400 mt-0.5">Try searching with a partial name, barcode, or PLU number</p>
                </div>
              ) : (
                smartLookupResults.map((p, idx) => {
                  const isSelected = idx === lookupSelectedIndex;
                  const isScale = Boolean(p.is_scale_item) || isWeighedOrVolumeUnit(p.unit);
                  const hasWsPrice = hasRealWholesalePrice(p);
                  const isWholesaleActive = pricingType === 'wholesale';
                  const activePrice = getActiveProductPrice(p, pricingType);

                  return (
                    <div
                      key={p.id}
                      onClick={() => {
                        setShowLookupModal(false);
                        handleAddToCart(p);
                      }}
                      onMouseEnter={() => setLookupSelectedIndex(idx)}
                      className={`px-4 py-3 flex items-center justify-between gap-4 cursor-pointer transition-colors ${
                        isSelected ? 'bg-emerald-50/80 border-l-4 border-l-emerald-600' : 'hover:bg-slate-50'
                      }`}
                    >
                      {/* Left: Product Info */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                          isSelected ? 'bg-emerald-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {isScale ? '⚖️' : (p.category_name?.[0] || 'P')}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-black text-sm text-slate-900 truncate">
                              {p.name}
                            </span>
                            {isScale && (
                              <span className="bg-amber-100 text-amber-800 text-[10px] font-black px-1.5 py-0.5 rounded uppercase shrink-0">
                                Scale / {p.unit || 'KG'}
                              </span>
                            )}
                            {p.has_variants ? (
                              <span className="bg-purple-100 text-purple-700 text-[10px] font-black px-1.5 py-0.5 rounded shrink-0">
                                Variants
                              </span>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                            {p.barcode && (
                              <span className="font-mono text-slate-600">
                                🔲 {p.barcode}
                              </span>
                            )}
                            {p.plu ? (
                              <span className="font-bold text-emerald-700 bg-emerald-50 px-1 rounded">
                                PLU: {p.plu}
                              </span>
                            ) : null}
                            {p.item_code && (
                              <span className="text-slate-400">
                                Code: {p.item_code}
                              </span>
                            )}
                            {p.category_name && (
                              <span className="text-slate-400 hidden sm:inline">
                                • {p.category_name}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Price & Stock */}
                      <div className="flex items-center gap-4 text-right shrink-0">
                        <div>
                          {isWholesaleActive && hasWsPrice ? (
                            <div className="font-black text-sm text-amber-700 flex items-center justify-end gap-1.5">
                              <span className="text-[8px] bg-amber-100 text-amber-800 border border-amber-200 px-1 rounded font-bold">WS</span>
                              <span>Rs. {activePrice.toFixed(2)}</span>
                              <span className="text-[10px] line-through text-slate-400 font-normal">Rs. {Number(p.price).toFixed(2)}</span>
                              {isScale && <span className="text-[10px] font-medium text-slate-400"> /{p.unit || 'kg'}</span>}
                            </div>
                          ) : isWholesaleActive ? (
                            <div className="font-bold text-sm text-slate-700 flex items-center justify-end gap-1">
                              <span className="text-[9px] text-slate-400 font-normal">(Retail)</span>
                              <span>Rs. {activePrice.toFixed(2)}</span>
                              {isScale && <span className="text-[10px] font-medium text-slate-400"> /{p.unit || 'kg'}</span>}
                            </div>
                          ) : (
                            <div className="font-black text-sm text-emerald-700">
                              Rs. {activePrice.toFixed(2)}
                              {isScale && <span className="text-[10px] font-medium text-slate-400"> /{p.unit || 'kg'}</span>}
                            </div>
                          )}
                          <div className="text-[11px] text-slate-400">
                            {isScale ? (
                              <span className="text-slate-500 font-medium">Weighed</span>
                            ) : (
                              <span className={Number(p.stock) <= 0 ? 'text-rose-500 font-bold' : 'text-slate-500'}>
                                Stock: {Number(p.stock || 0).toFixed(0)}
                              </span>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          className={`px-3 py-1.5 rounded-xl font-black text-xs transition-all ${
                            isSelected 
                              ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/30' 
                              : 'bg-slate-100 text-slate-700 hover:bg-emerald-600 hover:text-white'
                          }`}
                        >
                          Add +
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-between items-center text-xs text-slate-500">
              <span className="text-slate-400">
                Tip: Press <strong className="text-slate-700">F1</strong> anywhere in POS to open this Smart Search instantly.
              </span>
              <button
                type="button"
                onClick={() => setShowLookupModal(false)}
                className="px-4 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl font-bold text-slate-700 cursor-pointer text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {/* Back Office Authorization Modal for restricted cashiers */}
      {showBackofficeAuthModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="px-6 py-4 bg-slate-900 text-white flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Lock size={18} className="text-emerald-400" />
                <h3 className="font-black text-sm">Manager Authorization</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowBackofficeAuthModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleBackofficeAuthSubmit} className="p-6 space-y-4">
              <div className="text-center">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-2 border border-emerald-100">
                  <LayoutDashboard size={24} />
                </div>
                <h4 className="font-black text-slate-800 text-base">Exit POS to Back Office</h4>
                <p className="text-xs text-slate-500 mt-1">
                  Cashiers are restricted from leaving billing mode. Enter Manager or Admin PIN to access the Back Office.
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider mb-1.5">
                  Manager / Admin PIN
                </label>
                <input
                  type="password"
                  value={backofficeAuthPin}
                  onChange={e => setBackofficeAuthPin(e.target.value)}
                  placeholder="Enter Manager PIN"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-center text-lg font-black tracking-widest text-slate-900 outline-none focus:border-emerald-600"
                  autoFocus
                  required
                />
              </div>

              {backofficeAuthError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold flex items-center gap-2">
                  <AlertCircle size={15} className="shrink-0" />
                  <span>{backofficeAuthError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowBackofficeAuthModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAuthorizingBackoffice}
                  className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isAuthorizingBackoffice ? 'Verifying...' : 'Authorize & Open'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


    </div>
  );
}
