import React, { useEffect, useState } from 'react'
import TitleBar from './components/TitleBar'
import UsersView from './components/UsersView'
import StaffView from './components/StaffView'
import VouchersView from './components/VouchersView'
import RefundView from './components/RefundView'
import LoginSplash from './components/LoginSplash'
import POS from './components/POS'
import RestockModal from './components/RestockModal'
import DayEndModal from './components/DayEndModal'
import OpenSessionModal from './components/OpenSessionModal'
import PurchasingView from './components/PurchasingView'
import InventoryLedgerView from './components/InventoryLedgerView'
import ProductsView from './components/ProductsView'
import DaySaleView from './components/DaySaleView'
import SalesHistoryView from './components/SalesHistoryView'
import SuppliersView from './components/SuppliersView'
import CreditMgmtView from './components/CreditMgmtView'
import ReportsView from './components/ReportsView'
import AnalyticsView from './components/AnalyticsView'
import DashboardView from './components/DashboardView'
import SettingsView from './components/SettingsView'
import PromotionsView from './components/PromotionsView'
import ExpensesView from './components/ExpensesView'
import ExpiryAlertsView from './components/ExpiryAlertsView'
import BranchTerminalBackoffice from './components/BranchTerminalBackoffice'
import MasterServerBackupView from './components/MasterServerBackupView'
import CustomItemsAuditView from './components/CustomItemsAuditView'
import { openCashDrawerViaAgent } from './lib/printAgent'
import novaLogo from './assets/nova-freshmart-logo.png'
import { 
  LayoutDashboard, ShoppingCart, Users, Package, 
  Tag, FileText, AlertTriangle, ChevronDown, ChevronUp, Plus, 
  Settings, HelpCircle, LogOut, Search, Bell, Mail, ArrowUpRight,
  BarChart2, Wallet, CreditCard, DollarSign, X, Trash2, Key, RotateCcw, Building2,
  Sparkles, Server, HardDrive
} from 'lucide-react'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [currentView, setCurrentView] = useState<string>('dashboard')
  const [deviceMode, setDeviceMode] = useState<'pos' | 'server'>('pos')
  const [terminalConfig, setTerminalConfig] = useState<any>({})
  const [products, setProducts] = useState([])
  const [session, setSession] = useState<any>(null)
  const [suppliers, setSuppliers] = useState([])
  const [pos, setPOs] = useState([])
  const [promotions, setPromotions] = useState([])
  const [invoices, setInvoices] = useState([])
  const [customers, setCustomers] = useState([])
  const [batches, setBatches] = useState([])
  
  // Modals & Inputs
  const [openingCashInput, setOpeningCashInput] = useState('0')
  const [closingCashInput, setClosingCashInput] = useState('0')
  const [variantStockInputs, setVariantStockInputs] = useState<Record<number, string>>({})

  // Matrix State
  const [expandedProduct, setExpandedProduct] = useState<number | null>(null)
  const [productVariants, setProductVariants] = useState<any[]>([])
  const [newVariant, setNewVariant] = useState({ name: '', stock: 0, barcode: '' })

  const [newProduct, setNewProduct] = useState({ name: '', price: 0, cost_price: 0, stock: 0, barcode: '', item_code: '', low_stock_alert: 5, supplier_id: 0, attributes: { brand: '', ageGroup: '', gender: '' } })
  const [showAddProductModal, setShowAddProductModal] = useState(false)
  const [newSupplier, setNewSupplier] = useState({ name: '', contact: '' })
  const [showGRNModal, setShowGRNModal] = useState<any>(null)
  const [showDayEndModal, setShowDayEndModal] = useState(false)
  const [newPromo, setNewPromo] = useState({ name: '', type: 'PERCENTAGE', value: 0 })
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', barcode: '' })
  const [newBatch, setNewBatch] = useState({ productId: 0, batchNo: '', expiryDate: '', quantity: 0 })

  // Load device mode on mount
  useEffect(() => {
    // @ts-ignore
    window.db?.getDeviceMode?.().then((m: string) => {
      if (m === 'server') setDeviceMode('server');
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+D or Cmd+D to open cash drawer anywhere
      if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        openCashDrawerViaAgent().catch(() => {});
        return;
      }

      // Don't trigger if user is typing in an input field
      const tag = document.activeElement?.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.key === '/') {
        e.preventDefault();
        setCurrentView('pos');
      }
    };
    const handleNav = (e: any) => setCurrentView(e.detail);
    const handleOpenPin = () => {
      setPinChangeMsg(null);
      setCurrentPinInput('');
      setNewPinInput('');
      setConfirmPinInput('');
      setShowChangePinModal(true);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('navigate', handleNav);
    window.addEventListener('open-change-pin', handleOpenPin);

    // Refresh all state when background sync finishes
    const syncHandler = () => {
      loadProducts();
      loadInvoices();
      loadPromotions();
      loadCustomers();
      loadSuppliers();
      loadPOs();
      loadSession();
    };
    // @ts-ignore
    if (window.ipcRenderer?.on) {
      // @ts-ignore
      window.ipcRenderer.on('sync-completed', syncHandler);
      // @ts-ignore
      window.ipcRenderer.on('sync-data-updated', syncHandler);
      // @ts-ignore
      window.ipcRenderer.on('products-updated', syncHandler);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('navigate', handleNav);
      window.removeEventListener('open-change-pin', handleOpenPin);
      // @ts-ignore
      if (window.ipcRenderer?.off) {
        // @ts-ignore
        window.ipcRenderer.off('sync-completed', syncHandler);
        // @ts-ignore
        window.ipcRenderer.off('sync-data-updated', syncHandler);
        // @ts-ignore
        window.ipcRenderer.off('products-updated', syncHandler);
      }
    }
  }, []);

  useEffect(() => {
    loadSession()
    if (currentView === 'dashboard') {
      loadProducts()
      loadInvoices()
    } else if (currentView === 'products') {
      loadProducts()
    } else if (currentView === 'inventory_ledger') {
      loadProducts()
    } else if (currentView === 'purchasing') {
      loadSuppliers()
      loadPOs()
    } else if (currentView === 'promotions') {
      loadProducts()
      loadPromotions()
    } else if (currentView === 'reports') {
      loadInvoices()
    } else if (currentView === 'customers') {
      loadCustomers()
    } else if (currentView === 'expiry') {
      loadBatches()
      loadProducts()
    }
  }, [currentView])

  const isAdmin = currentUser?.role?.toLowerCase() === 'admin';
  const isManager = currentUser?.role?.toLowerCase() === 'manager';
  const userPerms: string[] = React.useMemo(() => {
    const raw = currentUser?.permissions;
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {
        return raw.split(',').map((s: string) => s.trim()).filter(Boolean);
      }
    }
    return [];
  }, [currentUser?.permissions]);

  // Granular Permission Gates
  const canAccessProducts = isAdmin || isManager || userPerms.includes('Inventory');
  const canAccessCustomItems = isAdmin || isManager || userPerms.includes('Custom Items');
  const canAccessLedger = isAdmin || isManager || userPerms.includes('Inventory');
  const canAccessPurchasing = isAdmin || isManager || userPerms.includes('Inventory') || userPerms.includes('GRN');
  const canAccessExpiry = isAdmin || isManager || userPerms.includes('Inventory');
  const canAccessSuppliers = isAdmin || isManager || userPerms.includes('Inventory') || userPerms.includes('Suppliers');

  // Point of Sale Core Views: Invoices & Refunds are visible to all users (Cashiers are protected by Supervisor PIN inside the views)
  const canAccessInvoices = true;
  const canAccessRefunds = true;

  const canAccessCustomers = isAdmin || isManager || userPerms.includes('Customers');
  const canAccessCredit = isAdmin || isManager || userPerms.includes('Customers');
  const canAccessVouchers = isAdmin || isManager || userPerms.includes('Settings') || userPerms.includes('Vouchers');
  const canAccessPromotions = isAdmin || isManager || userPerms.includes('Settings') || userPerms.includes('Promotions');

  const canAccessBranches = isAdmin || isManager || userPerms.includes('Settings') || userPerms.includes('Branches');
  const canAccessBackupHub = isAdmin || isManager || userPerms.includes('Settings') || userPerms.includes('Backup Hub');

  const canAccessReports = isAdmin || isManager || userPerms.includes('Reports');
  const canAccessAnalytics = isAdmin || isManager || userPerms.includes('Reports');
  const canAccessExpenses = isAdmin || isManager || userPerms.includes('Reports') || userPerms.includes('Expenses');

  const canAccessStaff = isAdmin || isManager || userPerms.includes('Users');
  const canAccessUsers = isAdmin || userPerms.includes('Users');
  const canAccessSettings = isAdmin || isManager || userPerms.includes('Settings');

  const showInventorySection = canAccessProducts || canAccessCustomItems || canAccessLedger || canAccessPurchasing || canAccessExpiry || canAccessSuppliers;
  const showCustomersSection = canAccessCustomers || canAccessCredit || canAccessVouchers || canAccessPromotions;
  const showCloudSection = canAccessBranches || canAccessBackupHub;
  const showFinanceSection = canAccessReports || canAccessAnalytics || canAccessExpenses;
  const showAdminSection = canAccessStaff || canAccessUsers || canAccessSettings;

  useEffect(() => {
    if (!isAuthenticated) return;
    if (currentView === 'products' && !canAccessProducts) setCurrentView('pos');
    if (currentView === 'custom_items' && !canAccessCustomItems) setCurrentView('pos');
    if (currentView === 'sales_history' && !canAccessInvoices) setCurrentView('pos');
    if (currentView === 'customers' && !canAccessCustomers) setCurrentView('pos');
    if (currentView === 'credit' && !canAccessCredit) setCurrentView('pos');
    if (currentView === 'purchasing' && !canAccessPurchasing) setCurrentView('pos');
    if (currentView === 'inventory_ledger' && !canAccessLedger) setCurrentView('pos');
    if (currentView === 'expiry' && !canAccessExpiry) setCurrentView('pos');
    if (currentView === 'refunds' && !canAccessRefunds) setCurrentView('pos');
    if (currentView === 'reports' && !canAccessReports) setCurrentView('pos');
    if (currentView === 'analytics' && !canAccessAnalytics) setCurrentView('pos');
    if (currentView === 'expenses' && !canAccessExpenses) setCurrentView('pos');
    if (currentView === 'settings' && !canAccessSettings) setCurrentView('pos');
    if (currentView === 'users' && !canAccessUsers) setCurrentView('pos');
    if (currentView === 'staff' && !canAccessStaff) setCurrentView('pos');
    if (currentView === 'vouchers' && !canAccessVouchers) setCurrentView('pos');
    if (currentView === 'promotions' && !canAccessPromotions) setCurrentView('pos');
    if (currentView === 'suppliers' && !canAccessSuppliers) setCurrentView('pos');
    if (currentView === 'branches' && !canAccessBranches) setCurrentView('pos');
    if (currentView === 'server_backup' && !canAccessBackupHub) setCurrentView('pos');
  }, [currentView, currentUser, isAuthenticated]);

  const loadBatches = async () => {
    // @ts-ignore
    setBatches(await window.db.getBatches())
  }

  const handleAddBatch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newBatch.productId) return alert('Select a product')
    // @ts-ignore
    await window.db.addBatch({ ...newBatch, productId: Number(newBatch.productId), quantity: Number(newBatch.quantity) })
    setNewBatch({ productId: 0, batchNo: '', expiryDate: '', quantity: 0 })
    loadBatches()
  }

  const loadCustomers = async () => {
    // @ts-ignore
    setCustomers(await window.db.getCustomers())
  }

  const [editingCustomerId, setEditingCustomerId] = useState<number | null>(null)
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false)

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (editingCustomerId) {
      // @ts-ignore
      await window.db.invoke('update-customer', { ...newCustomer, id: editingCustomerId })
    } else {
      // @ts-ignore
      await window.db.addCustomer(newCustomer)
    }
    setEditingCustomerId(null)
    setNewCustomer({ name: '', phone: '', barcode: '' })
    loadCustomers()
  }

  const handleEditCustomer = (c: any) => {
    setNewCustomer({ name: c.name, phone: c.phone, barcode: c.barcode || '' })
    setEditingCustomerId(c.id)
  }

  const handleDeleteCustomer = async (id: number) => {
    if (currentUser?.role !== 'Admin') {
      alert('Security Restriction: Only System Administrators can delete records. Managers and Cashiers are not authorized.');
      return;
    }
    if (!confirm('Are you sure you want to delete this customer?')) return;
    // @ts-ignore
    await window.db.invoke('delete-customer', id);
    loadCustomers();
  };

  const [showOpenSessionModal, setShowOpenSessionModal] = useState(false)
  const [showChangePinModal, setShowChangePinModal] = useState(false)
  const [currentPinInput, setCurrentPinInput] = useState('')
  const [newPinInput, setNewPinInput] = useState('')
  const [confirmPinInput, setConfirmPinInput] = useState('')
  const [pinChangeMsg, setPinChangeMsg] = useState<{ type: 'error' | 'success', text: string } | null>(null)
  const [pinChanging, setPinChanging] = useState(false)

  const handleChangeMyPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinChangeMsg(null);
    if (!currentPinInput) {
      setPinChangeMsg({ type: 'error', text: 'Please enter your current PIN.' });
      return;
    }
    if (!newPinInput || newPinInput.length < 3) {
      setPinChangeMsg({ type: 'error', text: 'New PIN must be at least 3 digits or characters.' });
      return;
    }
    if (newPinInput !== confirmPinInput) {
      setPinChangeMsg({ type: 'error', text: 'New PIN and Confirm PIN do not match.' });
      return;
    }

    setPinChanging(true);
    try {
      // @ts-ignore
      const res = await window.db.changeOwnPin({
        userId: currentUser?.id,
        currentPin: currentPinInput,
        newPin: newPinInput
      });
      if (res?.success) {
        setPinChangeMsg({ type: 'success', text: res.message || 'PIN updated successfully!' });
        setTimeout(() => {
          setShowChangePinModal(false);
          setCurrentPinInput('');
          setNewPinInput('');
          setConfirmPinInput('');
          setPinChangeMsg(null);
        }, 1200);
      } else {
        setPinChangeMsg({ type: 'error', text: res?.error || 'Failed to change PIN.' });
      }
    } catch (err: any) {
      setPinChangeMsg({ type: 'error', text: err?.message || 'Error changing PIN.' });
    } finally {
      setPinChanging(false);
    }
  };

  const handleOpenSession = async (openingCash: number) => {
    try {
      // @ts-ignore
      await window.db.invoke('open-session', { openingCash, username: currentUser?.username || 'Cashier' });
      setShowOpenSessionModal(false);
      loadSession();
    } catch(e: any) {
      alert(e.message || 'Failed to open session');
    }
  }

  const loadInvoices = async () => {
    try {
      // @ts-ignore
      const invs = await window.db.getInvoices();
      setInvoices(Array.isArray(invs) ? invs : []);
    } catch (_) {}
  }

  const loadPromotions = async () => {
    // @ts-ignore
    setPromotions(await window.db.getPromotions())
  }

  const handleAddPromotion = async (e: React.FormEvent) => {
    e.preventDefault()
    // @ts-ignore
    await window.db.addPromotion(newPromo)
    setNewPromo({ name: '', type: 'PERCENTAGE', value: 0 })
    loadPromotions()
  }

  const loadProducts = async () => {
    try {
      // @ts-ignore
      const res = await window.db.invoke('get-products-advanced');
      if (Array.isArray(res) && res.length > 0) {
        setProducts(res);
      } else {
        // @ts-ignore
        const fallback = await window.db.getProducts();
        setProducts(Array.isArray(fallback) ? fallback : (res || []));
      }
    } catch (e) {
      console.warn('Failed to load products:', e);
      try {
        // @ts-ignore
        const fallback = await window.db.getProducts();
        setProducts(Array.isArray(fallback) ? fallback : []);
      } catch (_) {}
    }
  }

  const loadSession = async () => {
    try {
      // @ts-ignore
      const st = await window.db.getSyncStatus().catch(() => null);
      const tid = st?.config?.current_terminal_id;
      // @ts-ignore
      const s = await window.db.getActiveSession(tid);
      if (st?.config) setTerminalConfig(st.config);
      if (s && (!s.terminal_id || !tid || s.terminal_id === tid)) {
        setSession(s);
      } else {
        setSession(null);
      }
    } catch (e) {
      setSession(null);
    }
  }

  const loadSuppliers = async () => {
    // @ts-ignore
    setSuppliers(await window.db.getSuppliers())
  }

  const loadPOs = async () => {
    // @ts-ignore
    setPOs(await window.db.getPOs())
  }



  const handleCloseSessionWithCash = async (actualCash: number) => {
    const sessionInvoices = invoices.filter((i: any) => i.session_id === session.id);
    const cashSales = sessionInvoices.filter((i: any) => (i.payment_method || '').toUpperCase() === 'CASH').reduce((sum: number, i: any) => sum + Number(i.total || 0), 0);
    const cardSales = sessionInvoices.filter((i: any) => (i.payment_method || '').toUpperCase() === 'CARD').reduce((sum: number, i: any) => sum + Number(i.total || 0), 0);
    const otherSales = sessionInvoices.filter((i: any) => !['CASH','CARD'].includes((i.payment_method || '').toUpperCase())).reduce((sum: number, i: any) => sum + Number(i.total || 0), 0);
    const totalSales = cashSales + cardSales + otherSales;
    let cashIn = 0, cashOut = 0;
    try {
      // @ts-ignore
      const txs = await window.db.invoke('get-session-transactions', session.id);
      cashIn = (txs || []).filter((t: any) => t.type === 'CASH_IN').reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
      cashOut = (txs || []).filter((t: any) => t.type === 'CASH_OUT' || t.type === 'EXPENSE').reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
    } catch (_) {}
    const expectedCash = Number(session.opening_cash || 0) + cashSales + cashIn - cashOut;
    // @ts-ignore
    await window.db.closeSession({
      sessionId: session.id,
      expectedCash,
      actualCash,
      totalSales,
      cashSales,
      cardSales,
      otherSales,
      cashIn,
      cashOut
    });
    setSession(null);
    setClosingCashInput('0');
    loadSession();
  }

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault()
    // Clean empty attributes
    const cleanAttrs = Object.fromEntries(Object.entries(newProduct.attributes).filter(([_, v]) => v !== ''))
    
    // @ts-ignore
    await window.db.addProduct({
      ...newProduct, 
      category_id: 1, 
      attributes: Object.keys(cleanAttrs).length > 0 ? cleanAttrs : null 
    })
    setNewProduct({ name: '', price: 0, cost_price: 0, stock: 0, barcode: '', item_code: '', low_stock_alert: 5, supplier_id: 0, attributes: { brand: '', ageGroup: '', gender: '' } })
    setShowAddProductModal(false)
    loadProducts()
  }

  const handleAddSupplier = async (e: React.FormEvent) => {
    e.preventDefault()
    // @ts-ignore
    await window.db.addSupplier(newSupplier)
    setNewSupplier({ name: '', contact: '' })
    loadSuppliers()
  }

  const handleCreatePO = async (supplierId: number) => {
    // @ts-ignore
    await window.db.createPO(supplierId)
    loadPOs()
  }

  const toggleExpandProduct = async (productId: number) => {
    if (expandedProduct === productId) {
      setExpandedProduct(null)
    } else {
      setExpandedProduct(productId)
      // @ts-ignore
      const variants = await window.db.getVariants(productId)
      setProductVariants(variants)
      const inputs: any = {}
      variants.forEach((v: any) => inputs[v.id] = String(v.stock))
      setVariantStockInputs(inputs)
    }
  }

  const handleAddVariant = async (e: React.FormEvent, productId: number) => {
    e.preventDefault()
    // @ts-ignore
    await window.db.addVariant({ productId, name: newVariant.name, stock: newVariant.stock, barcode: newVariant.barcode })
    setNewVariant({ name: '', stock: 0, barcode: '' })
    // @ts-ignore
    const variants = await window.db.getVariants(productId)
    setProductVariants(variants)
    loadProducts() 
  }

  const handleUpdateVariantStock = async (variantId: number, productId: number, oldStock: number) => {
    const newStock = Number(variantStockInputs[variantId] || oldStock)
    // @ts-ignore
    await window.db.updateVariantStock({ id: variantId, productId, newStock, oldStock })
    // @ts-ignore
    const variants = await window.db.getVariants(productId)
    setProductVariants(variants)
    const inputs = {...variantStockInputs}
    variants.forEach((v: any) => inputs[v.id] = String(v.stock))
    setVariantStockInputs(inputs)
    loadProducts()
  }

  if (!isAuthenticated) {
    return (
      <div className="h-screen flex flex-col pt-8 relative bg-brand-bg">
        <TitleBar />
        <LoginSplash deviceMode={deviceMode} onLoginSuccess={(u) => { 
          setCurrentUser(u); 
          setIsAuthenticated(true);
          const role = (u?.role || '').toLowerCase();
          const perms: string[] = Array.isArray(u?.permissions) ? u.permissions : [];
          const hasBackoffice = (role === 'admin' || role === 'manager') || perms.some((p: string) => ['Reports', 'Inventory', 'Settings', 'Users', 'Suppliers', 'GRN', 'Branches', 'Backup Hub', 'Dashboard', 'View Invoices', 'Refunds', 'Customers'].includes(p));
          // Server mode always lands on backup hub
          if (deviceMode === 'server') {
            setCurrentView('server_backup');
          } else if (role === 'cashier' || !hasBackoffice) {
            setCurrentView('pos');
          } else {
            setCurrentView('dashboard');
          }
        }} />
      </div>
    );
  }

  const NavSection = ({ label }: { label: string }) => (
    <div className="pt-3 pb-1 px-3">
      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
        {label}
      </p>
    </div>
  )

  const NavItem = ({ icon: Icon, label, id, badge }: any) => {
    const active = currentView === id
    return (
      <button 
        onClick={() => setCurrentView(id)}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all duration-150 cursor-pointer ${
          active 
            ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/30' 
            : 'text-slate-600 hover:bg-emerald-50 hover:text-emerald-800'
        }`}
      >
        <div className="flex items-center min-w-0">
          <Icon size={16} className={`mr-2.5 shrink-0 ${active ? 'text-white' : 'text-slate-400'}`} />
          <span className="truncate">{label}</span>
        </div>
        {badge && (
          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md ${
            active ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'
          }`}>
            {badge}
          </span>
        )}
      </button>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50 font-sans text-slate-900 pt-8 relative overflow-hidden">
      <TitleBar />

      {/* POS Terminal Screen (Kept alive in DOM to eliminate 2-second reload delay and preserve active cashier cart) */}
      <div 
        className="flex-1 flex flex-col overflow-hidden bg-brand-bg w-full"
        style={{ display: currentView === 'pos' ? 'flex' : 'none' }}
      >
        <POS 
          currentUser={currentUser} 
          onUserChange={(u: any) => setCurrentUser(u)}
          onExitToBackoffice={() => setCurrentView('dashboard')}
          onNavigate={(v: string) => setCurrentView(v)}
          onLogout={() => { setIsAuthenticated(false); setCurrentUser(null); }}
        />
      </div>

      {/* Back Office Screen */}
      <div 
        className="flex-1 flex overflow-hidden w-full relative"
        style={{ display: currentView !== 'pos' ? 'flex' : 'none' }}
      >
        {/* Sidebar */}
        <aside className="flex h-full w-64 flex-col border-r border-slate-200 bg-white transition-all duration-300 lg:static z-10 shrink-0">
        
        {/* Sidebar header with logo */}
        <div
          className="relative shrink-0 flex flex-col items-center border-b border-slate-200 px-4 py-5 gap-0 overflow-hidden"
          style={{ background: 'linear-gradient(160deg, #092015 0%, #112A1D 60%, #173827 100%)' }}
        >
          <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(16,185,129,0.25) 0%, transparent 70%)' }} />
          <div className="relative flex w-full items-center justify-between">
            <div className="flex items-center gap-3">
              <div style={{
                width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                background: 'rgba(255,255,255,0.07)', border: '1.5px solid rgba(255,255,255,0.14)',
                boxShadow: '0 0 18px rgba(0,139,68,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <img src={novaLogo} alt="logo" style={{ width: 34, height: 34, objectFit: 'contain', borderRadius: '50%' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold leading-tight" style={{ color: '#FCD34D', letterSpacing: '0.04em' }}>Nova FreshMart</p>
                <p className="text-[10px] font-medium tracking-widest uppercase" style={{ color: 'rgba(110,231,183,0.85)' }}>Back Office Manager</p>
              </div>
            </div>
          </div>
          <div className="mt-3 w-full h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(252,211,77,0.35), transparent)' }} />
        </div>

        {/* Back to POS button — hidden in server mode */}
        {deviceMode !== 'server' && (
        <div className="shrink-0 p-3 pb-2">
          <button 
            onClick={() => setCurrentView('pos')} 
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 px-4 py-3 text-sm font-black text-white transition-all transform hover:scale-[1.02] shadow-md shadow-emerald-600/30 cursor-pointer"
          >
            <ShoppingCart size={18} />
            <span>Launch POS Terminal</span>
          </button>
        </div>
        )}
        {deviceMode === 'server' && (
          <div className="shrink-0 px-3 pt-3 pb-1">
            <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">
              <Server size={14} className="text-amber-400 shrink-0" />
              <div>
                <p className="text-[10px] font-black text-amber-300 uppercase tracking-wider">Server & Backup Mode</p>
                <p className="text-[9px] text-amber-400/70 font-medium">TERM-W80J · SVR02</p>
              </div>
            </div>
          </div>
        )}

        <nav className="flex-1 min-h-0 overflow-y-auto space-y-0.5 p-3 pt-0">
          
          {/* SECTION 1: POINT OF SALE */}
          <NavSection label="Point of Sale" />
          <NavItem icon={LayoutDashboard} label="Dashboard" id="dashboard" />
          <NavItem icon={ShoppingCart} label="POS Sales Screen" id="pos" badge="POS" />
          <NavItem icon={Wallet} label="Day Sale & Shifts" id="day_sale" />
          {canAccessInvoices && <NavItem icon={FileText} label="Sales Invoices" id="sales_history" />}
          {canAccessRefunds && <NavItem icon={RotateCcw} label="Refunds & Returns" id="refunds" />}

          {/* SECTION 2: INVENTORY & PROCUREMENT */}
          {showInventorySection && (
            <>
              <NavSection label="Inventory & Stock" />
              {canAccessProducts && <NavItem icon={Package} label="Product Catalog" id="products" />}
              {canAccessCustomItems && <NavItem icon={Sparkles} label="Custom Billed Items" id="custom_items" />}
              {canAccessLedger && <NavItem icon={BarChart2} label="Inventory Ledger" id="inventory_ledger" />}
              {canAccessPurchasing && <NavItem icon={Package} label="Purchasing & GRN" id="purchasing" />}
              {canAccessExpiry && <NavItem icon={AlertTriangle} label="Expiry Tracking" id="expiry" />}
              {canAccessSuppliers && <NavItem icon={Users} label="Suppliers" id="suppliers" />}
            </>
          )}

          {/* SECTION 3: CUSTOMERS & SALES */}
          {showCustomersSection && (
            <>
              <NavSection label="Customers & Credit" />
              {canAccessCustomers && <NavItem icon={Users} label="Customers & Loyalty" id="customers" />}
              {canAccessCredit && <NavItem icon={CreditCard} label="Credit Accounts" id="credit" />}
              {canAccessVouchers && <NavItem icon={Tag} label="Vouchers & Gifts" id="vouchers" />}
              {canAccessPromotions && <NavItem icon={Tag} label="Promotions & Offers" id="promotions" />}
            </>
          )}

          {/* SECTION 4: MULTI-BRANCH & CLOUD */}
          {showCloudSection && (
            <>
              <NavSection label="Multi-Branch & Cloud" />
              {canAccessBranches && <NavItem icon={Building2} label="Branches & Terminals" id="branches" badge="Live" />}
              {canAccessBackupHub && <NavItem icon={Server} label="Master Server & Backups" id="server_backup" badge="Hub" />}
            </>
          )}

          {/* SECTION 5: FINANCIALS & REPORTS */}
          {showFinanceSection && (
            <>
              <NavSection label="Finance & Reports" />
              {canAccessReports && <NavItem icon={FileText} label="Sales Reports" id="reports" />}
              {canAccessAnalytics && <NavItem icon={BarChart2} label="Store Analytics" id="analytics" />}
              {canAccessExpenses && <NavItem icon={DollarSign} label="Store Expenses" id="expenses" />}
            </>
          )}

          {/* SECTION 6: ADMINISTRATION */}
          {showAdminSection && (
            <>
              <NavSection label="Administration" />
              {canAccessStaff && <NavItem icon={Users} label="Staff & Employees" id="staff" />}
              {canAccessUsers && <NavItem icon={Key} label="Login Accounts" id="users" />}
              {canAccessSettings && <NavItem icon={Settings} label="System Settings" id="settings" />}
            </>
          )}

        </nav>

        <div className="shrink-0 border-t border-slate-200 p-3">
          <div className="mb-2 flex items-center justify-between gap-2 px-2 bg-slate-50 p-2 rounded-xl border border-slate-100">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-black text-white shadow-xs">
                {(currentUser?.username||'A').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-black text-slate-900 leading-tight">{currentUser?.username||'Admin'}</p>
                <p className="text-[10px] font-bold text-emerald-700 capitalize leading-tight">{currentUser?.role||'User'}</p>
              </div>
            </div>
            <button
              onClick={() => {
                setPinChangeMsg(null);
                setCurrentPinInput('');
                setNewPinInput('');
                setConfirmPinInput('');
                setShowChangePinModal(true);
              }}
              className="p-1.5 text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer shrink-0"
              title="Change My Security PIN"
            >
              <Key size={15} />
            </button>
          </div>
          {session && (
            <button onClick={() => setCurrentView('day_sale')} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-brand-dark transition-colors hover:bg-gray-100 mb-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span>Day End</span>
            </button>
          )}
          {!session && (
            <button onClick={() => setShowOpenSessionModal(true)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-emerald-600 transition-colors hover:bg-emerald-50 mb-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span>Open Session</span>
            </button>
          )}
          <button onClick={() => { setIsAuthenticated(false); setCurrentUser(null); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50">
            <LogOut size={18} />
            <span>Logout</span>
          </button>
          {/* Device Mode Toggle — only visible on SVR02 (TERM-W80J) */}
          {(deviceMode === 'server' || terminalConfig?.current_terminal_id === 'TERM-W80J') && (
            <button
              onClick={async () => {
                const next = deviceMode === 'server' ? 'pos' : 'server';
                // @ts-ignore
                await window.db?.setDeviceMode?.(next);
                setDeviceMode(next as any);
                if (next === 'server') setCurrentView('server_backup');
              }}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition-colors mt-1 ${
                deviceMode === 'server'
                  ? 'text-amber-700 hover:bg-amber-50'
                  : 'text-slate-400 hover:bg-slate-50'
              }`}
            >
              <Server size={14} />
              <span>{deviceMode === 'server' ? 'Exit Server Mode' : 'Enable Server Mode'}</span>
            </button>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden flex flex-col">
        {/* Top Header */}
        

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto pb-8 flex flex-col min-h-0">

          {currentView === 'dashboard' && <DashboardView currentUser={currentUser} />}

          {currentView === 'customers' && (
              <div className="m-6 flex flex-col h-full">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-black text-brand-dark">Customers</h2>
                    <p className="text-sm text-gray-500 mt-0.5">Manage your customer database & loyalty points</p>
                  </div>
                  <button onClick={() => { setNewCustomer({ name: '', phone: '', barcode: '' }); setEditingCustomerId(null); setShowAddCustomerModal(true); }} className="bg-brand-primary text-white px-5 py-2.5 rounded-full font-bold flex items-center hover:bg-brand-secondary transition-colors shadow-md text-sm">
                    <Plus size={18} className="mr-2" /> Add Customer
                  </button>
                </div>

                {/* Customer Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {customers.map((c: any) => (
                    <div key={c.id} className="p-5 bg-white border border-gray-100 rounded-2xl hover:border-brand-primary/30 hover:shadow-md transition-all flex flex-col group">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center">
                          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-brand-primary to-brand-secondary text-white flex items-center justify-center font-black text-lg mr-3 shadow-sm">{(c.name || 'U').charAt(0).toUpperCase()}</div>
                          <div>
                            <div className="font-bold text-brand-dark text-base">{c.name || 'Unknown'}</div>
                            <div className="text-sm text-gray-400 font-medium">{c.phone}</div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <div className="opacity-0 group-hover:opacity-100 flex items-center space-x-1 transition-opacity">
                            {(currentUser?.role === 'Admin' || currentUser?.role === 'Manager') && (
                              <button onClick={() => { handleEditCustomer(c); setShowAddCustomerModal(true); }} className="p-1.5 text-gray-400 hover:text-brand-primary bg-gray-50 rounded-lg border border-gray-100 transition-all">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                              </button>
                            )}
                            {currentUser?.role === 'Admin' && (
                              <button onClick={() => handleDeleteCustomer(c.id)} title="Delete customer (Admin Only)" className="p-1.5 text-gray-400 hover:text-red-500 bg-gray-50 rounded-lg border border-gray-100 transition-all">
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="mt-auto pt-3 border-t border-gray-50 flex items-center justify-between">
                        <span className="text-xs text-gray-400 font-medium">Loyalty Points</span>
                        <span className="text-sm font-black text-brand-primary bg-brand-accent/20 px-3 py-1 rounded-full">{c.points ?? 0} Pts</span>
                      </div>
                    </div>
                  ))}
                  {customers.length === 0 && (
                    <div className="col-span-3 text-center py-20 text-gray-400">
                      <Users size={48} className="mx-auto mb-3 opacity-30" />
                      <p className="font-bold text-lg">No customers yet</p>
                      <p className="text-sm">Click "Add Customer" to get started.</p>
                    </div>
                  )}
                </div>

                {/* Add / Edit Customer Modal */}
                {showAddCustomerModal && (
                  <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl">
                      <div className="flex justify-between items-center mb-6">
                        <h3 className="font-bold text-brand-dark text-xl">{editingCustomerId ? 'Edit Customer' : 'New Customer'}</h3>
                        <button onClick={() => setShowAddCustomerModal(false)} className="text-gray-400 hover:text-red-500 bg-gray-100 p-2 rounded-full"><X size={18}/></button>
                      </div>
                      <form onSubmit={(e) => { handleAddCustomer(e); setShowAddCustomerModal(false); }} className="space-y-4">
                        <div>
                          <label className="block text-sm font-bold text-gray-700 mb-1.5">Customer Name</label>
                          <input type="text" placeholder="e.g. John Smith" className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-brand-primary font-medium" value={newCustomer.name} onChange={e => setNewCustomer({...newCustomer, name: e.target.value})} required autoFocus />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1.5">Phone Number</label>
                            <input type="text" placeholder="e.g. 0300-1234567" className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-brand-primary font-medium" value={newCustomer.phone} onChange={e => setNewCustomer({...newCustomer, phone: e.target.value})} required />
                          </div>
                          <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1.5">Loyalty Card Barcode</label>
                            <input type="text" placeholder="Scan or enter code" className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-brand-primary font-medium" value={newCustomer.barcode} onChange={e => setNewCustomer({...newCustomer, barcode: e.target.value})} />
                          </div>
                        </div>
                        <div className="flex space-x-3 pt-2">
                          <button type="button" onClick={() => setShowAddCustomerModal(false)} className="flex-1 px-4 py-3 rounded-xl font-bold text-gray-500 bg-gray-100 hover:bg-gray-200">Cancel</button>
                          <button type="submit" className="flex-1 px-4 py-3 rounded-xl font-bold text-white bg-brand-primary hover:bg-brand-secondary shadow-lg shadow-brand-primary/30">{editingCustomerId ? 'Save Changes' : 'Add Customer'}</button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}
              </div>
            )
          }

          {currentView === 'purchasing' && canAccessPurchasing && (
            <PurchasingView suppliers={suppliers} products={products} loadProducts={loadProducts} loadSuppliers={loadSuppliers} handleAddSupplier={handleAddSupplier} newSupplier={newSupplier} setNewSupplier={setNewSupplier} currentUser={currentUser} onDirectRestock={() => setShowGRNModal({ id: null, name: 'Direct Restock' })} />
          )}

          {currentView === 'expiry' && canAccessExpiry && <ExpiryAlertsView currentUser={currentUser} />}

          {currentView === 'settings' && canAccessSettings && <SettingsView />}
          {currentView === 'refunds' && canAccessRefunds && <RefundView currentUser={currentUser} />}
          {currentView === 'users' && canAccessUsers && <UsersView currentUser={currentUser} />}
          {currentView === 'staff' && canAccessStaff && <StaffView currentUser={currentUser} />}
          {currentView === 'vouchers' && canAccessVouchers && <VouchersView currentUser={currentUser} />}
          {currentView === 'analytics' && canAccessAnalytics && <AnalyticsView />}
          {currentView === 'reports' && canAccessReports && <ReportsView invoices={invoices} products={products} currentUser={currentUser} loadInvoices={loadInvoices} />}
          {currentView === 'expenses' && canAccessExpenses && <ExpensesView currentUser={currentUser} />}
          {currentView === 'promotions' && canAccessPromotions && <PromotionsView products={products} currentUser={currentUser} />}
          {currentView === 'suppliers' && canAccessSuppliers && <SuppliersView currentUser={currentUser} suppliers={suppliers} loadSuppliers={loadSuppliers} />}
          {currentView === 'credit' && canAccessCredit && <CreditMgmtView currentUser={currentUser} />}
          {currentView === 'inventory_ledger' && canAccessLedger && <InventoryLedgerView products={products} onRestock={() => setShowGRNModal({ id: null, name: 'Direct Restock' })} currentUser={currentUser} loadProducts={loadProducts} />}
          {currentView === 'day_sale' && <DaySaleView session={session} invoices={invoices} loadSession={loadSession} loadInvoices={loadInvoices} currentUser={currentUser} />}
          {currentView === 'sales_history' && canAccessInvoices && <SalesHistoryView currentUser={currentUser} />}
          {currentView === 'branches' && canAccessBranches && <BranchTerminalBackoffice currentUser={currentUser} />}
          {currentView === 'server_backup' && canAccessBackupHub && <MasterServerBackupView currentUser={currentUser} />}
          {currentView === 'custom_items' && canAccessCustomItems && <CustomItemsAuditView currentUser={currentUser} />}
          {currentView === 'products' && canAccessProducts && <ProductsView products={products} loadProducts={loadProducts} currentUser={currentUser} />}

        </div>

        {/* MODALS */}
        {showAddProductModal && (
          <div className="fixed inset-0 bg-brand-dark/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col h-[90vh]">
              <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <h2 className="text-xl font-bold text-brand-dark">Create New Product</h2>
                <button onClick={() => setShowAddProductModal(false)} className="text-gray-400 hover:text-red-500 font-bold"><X size={24} /></button>
              </div>
              <form onSubmit={handleAddProduct} className="p-6 flex flex-col flex-1 overflow-y-auto space-y-8">
                <div>
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Core Details</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="col-span-2">
                      <label className="text-xs font-semibold text-gray-500 mb-1 block">Product Name *</label>
                      <input type="text" className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 font-medium text-brand-dark bg-gray-50" value={newProduct.name} onChange={e => setNewProduct({...newProduct, name: e.target.value})} required />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 mb-1 block">Item Code</label>
                      <div className="flex">
                        <input type="text" className="w-full border border-gray-200 rounded-l-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 font-medium text-brand-dark bg-gray-50" value={newProduct.item_code} onChange={e => setNewProduct({...newProduct, item_code: e.target.value})} />
                        <button type="button" onClick={() => setNewProduct({...newProduct, item_code: 'ITM-' + Math.floor(Math.random()*10000)})} className="bg-gray-200 px-3 rounded-r-xl text-xs font-bold text-gray-600 hover:bg-gray-300">Gen</button>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 mb-1 block">Barcode</label>
                      <div className="flex">
                        <input type="text" className="w-full border border-gray-200 rounded-l-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 font-medium text-brand-dark bg-gray-50" value={newProduct.barcode} onChange={e => setNewProduct({...newProduct, barcode: e.target.value})} />
                        <button type="button" onClick={() => setNewProduct({...newProduct, barcode: '8' + Math.floor(Math.random()*100000000000)})} className="bg-gray-200 px-3 rounded-r-xl text-xs font-bold text-gray-600 hover:bg-gray-300">Gen</button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-6 border-t border-gray-100">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Pricing &amp; Inventory</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-gray-500 mb-1 block">Cost Price (Rs)</label>
                      <input type="number" className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 font-medium text-brand-dark bg-gray-50" value={newProduct.cost_price || ''} onChange={e => setNewProduct({...newProduct, cost_price: Number(e.target.value)})} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-brand-primary mb-1 block">Sale Price (Rs) *</label>
                      <input type="number" className="w-full border border-brand-primary/30 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 font-bold text-brand-primary bg-brand-primary/5" value={newProduct.price || ''} onChange={e => setNewProduct({...newProduct, price: Number(e.target.value)})} required />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 mb-1 block">Opening Stock *</label>
                      <input type="number" className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 font-medium text-brand-dark bg-gray-50" value={newProduct.stock || ''} onChange={e => setNewProduct({...newProduct, stock: Number(e.target.value)})} required />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 mb-1 block">Low Stock Alert</label>
                      <input type="number" className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 font-medium text-brand-dark bg-gray-50" value={newProduct.low_stock_alert} onChange={e => setNewProduct({...newProduct, low_stock_alert: Number(e.target.value)})} />
                    </div>
                  </div>
                </div>

                <div className="pt-6 border-t border-gray-100">
                  <h3 className="text-xs font-bold text-brand-primary uppercase tracking-wider mb-4">Baby Attributes</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-gray-500 mb-1 block">Brand</label>
                      <input type="text" className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 font-medium text-brand-dark bg-white" placeholder="e.g. Huggies" value={newProduct.attributes.brand} onChange={e => setNewProduct({...newProduct, attributes: {...newProduct.attributes, brand: e.target.value}})} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 mb-1 block">Age Group</label>
                      <select className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 font-medium text-brand-dark bg-white" value={newProduct.attributes.ageGroup} onChange={e => setNewProduct({...newProduct, attributes: {...newProduct.attributes, ageGroup: e.target.value}})}>
                        <option value="">Any Age</option>
                        <option value="Newborn">Newborn</option>
                        <option value="0-3M">0-3 Months</option>
                        <option value="3-6M">3-6 Months</option>
                        <option value="6-12M">6-12 Months</option>
                        <option value="1-2Y">1-2 Years</option>
                        <option value="Toddler">Toddler</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 mb-1 block">Gender</label>
                      <select className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 font-medium text-brand-dark bg-white" value={newProduct.attributes.gender} onChange={e => setNewProduct({...newProduct, attributes: {...newProduct.attributes, gender: e.target.value}})}>
                        <option value="">Any</option>
                        <option value="Boy">Boy</option>
                        <option value="Girl">Girl</option>
                        <option value="Unisex">Unisex</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="pt-6 border-t border-gray-100 flex justify-end space-x-3 shrink-0 mb-4">
                  <button type="button" onClick={() => setShowAddProductModal(false)} className="px-6 py-3 rounded-full font-bold text-gray-500 hover:bg-gray-100 transition-colors">Cancel</button>
                  <button type="submit" className="bg-brand-primary text-white px-8 py-3 rounded-full font-bold hover:bg-brand-secondary transition-colors shadow-lg shadow-brand-primary/30">Save Product</button>
                </div>
              </form>
            </div>
          </div>
        )}
        {showGRNModal && <RestockModal supplier={showGRNModal} products={products} onClose={() => setShowGRNModal(null)} onComplete={() => { setShowGRNModal(null); loadProducts(); }} />}
        {showOpenSessionModal && <OpenSessionModal onOpenSession={handleOpenSession} onClose={() => setShowOpenSessionModal(false)} />}

        {/* Change Security PIN Modal */}
        {showChangePinModal && (
          <div className="fixed inset-0 bg-brand-dark/60 backdrop-blur-xs z-[200] flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-emerald-100 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
                    <Key size={18} />
                  </div>
                  <div>
                    <h3 className="font-black text-brand-dark text-base">Change Security PIN</h3>
                    <p className="text-[11px] text-gray-500 font-medium">Logged in as {currentUser?.username || 'User'}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowChangePinModal(false)}
                  className="text-gray-400 hover:text-gray-600 p-1.5 rounded-xl hover:bg-gray-100"
                >
                  <X size={18} />
                </button>
              </div>

              {pinChangeMsg && (
                <div className={`p-3 rounded-xl text-xs font-bold mb-4 flex items-center gap-2 ${
                  pinChangeMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
                }`}>
                  <span>{pinChangeMsg.text}</span>
                </div>
              )}

              <form onSubmit={handleChangeMyPin} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Current PIN / Password</label>
                  <input
                    type="password"
                    placeholder="Enter current PIN"
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 outline-none font-bold text-sm focus:border-brand-primary"
                    value={currentPinInput}
                    onChange={e => setCurrentPinInput(e.target.value)}
                    required
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">New PIN (min 3 digits)</label>
                  <input
                    type="password"
                    placeholder="Enter new PIN"
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 outline-none font-bold text-sm focus:border-brand-primary"
                    value={newPinInput}
                    onChange={e => setNewPinInput(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Confirm New PIN</label>
                  <input
                    type="password"
                    placeholder="Re-enter new PIN"
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 outline-none font-bold text-sm focus:border-brand-primary"
                    value={confirmPinInput}
                    onChange={e => setConfirmPinInput(e.target.value)}
                    required
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowChangePinModal(false)}
                    className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={pinChanging}
                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-md shadow-emerald-600/30 disabled:opacity-50"
                  >
                    {pinChanging ? 'Updating...' : 'Update PIN'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
      </div>
    </div>
  )
}

export default App
