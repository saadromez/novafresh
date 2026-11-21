import React, { useState, useEffect } from 'react';
import { 
  Settings, Save, Printer, Monitor, ShieldCheck, Database, CheckCircle, AlertCircle, 
  DoorOpen, Play, RefreshCw, Award, Coins, Trash2, AlertTriangle, RotateCcw, 
  Lock, CloudLightning, Layers, Users, Truck, Ticket, FileText, Check, X, ShieldAlert,
  Download, ArrowDownCircle, PackageCheck
} from 'lucide-react';
import { syncAgentPrinter, getAgentPrinters, isAgentRunning, openCashDrawerViaAgent } from '../lib/printAgent';

export default function SettingsView() {
  const [settings, setSettings] = useState<any>({
    storeName: 'Nova FreshMart',
    tagline: 'Main FreshMart Store',
    phone: '045 2286041',
    printer: '80mm',
    printerName: '',
    escposEnabled: 'true',
    autoOpenDrawer: true,
    always_prompt_quantity_modal: false,
    taxRate: 0,
    taxInclusive: false,
    loyalty_enabled: true,
    loyalty_points_per_100: 1,
    loyalty_point_value_rs: 1.0,
    loyalty_min_redeem_points: 10
  });
  const [availablePrinters, setAvailablePrinters] = useState<string[]>([]);
  const [agentOnline, setAgentOnline] = useState<boolean>(false);
  const [startingAgent, setStartingAgent] = useState<boolean>(false);
  const [drawerTestStatus, setDrawerTestStatus] = useState<string>('');

  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'none' | 'error'>('idle');
  const [updateVersion, setUpdateVersion] = useState<string>('');
  const [updatePercent, setUpdatePercent] = useState<number>(0);
  const [updateError, setUpdateError] = useState<string>('');

  // Modular Database Maintenance & Reset State
  const [dbCounts, setDbCounts] = useState<any>({});
  const [loadingCounts, setLoadingCounts] = useState<boolean>(false);
  const [resetModal, setResetModal] = useState<{ open: boolean; section: string; title: string; count: any; desc: string; danger?: boolean } | null>(null);
  const [resetPin, setResetPin] = useState<string>('');
  const [resetReason, setResetReason] = useState<string>('');
  const [resetting, setResetting] = useState<boolean>(false);

  useEffect(() => {
    loadSettings();
    loadDbCounts();

    const handler = () => { loadDbCounts(); };
    const onUpdateAvailable = (_: any, info: any) => { setUpdateStatus('available'); setUpdateVersion(info?.version || ''); };
    const onUpdateProgress = (_: any, info: any) => { setUpdateStatus('downloading'); setUpdatePercent(Math.round(info?.percent || 0)); };
    const onUpdateDownloaded = (_: any, info: any) => { setUpdateStatus('ready'); setUpdateVersion(info?.version || ''); };
    const onUpdateNone = () => { setUpdateStatus('none'); };
    const onUpdateError = (_: any, info: any) => {
      const rawMsg = String(info?.message || '');
      const isNotFound =
        rawMsg.includes('404') ||
        rawMsg.toLowerCase().includes('github') ||
        rawMsg.toLowerCase().includes('no published version') ||
        rawMsg.toLowerCase().includes('releases.atom') ||
        rawMsg.toLowerCase().includes('cannot find latest');

      if (isNotFound) {
        setUpdateStatus('none');
        setUpdateError('');
      } else {
        setUpdateStatus('error');
        setUpdateError('Unable to check for updates. Please check your internet connection.');
      }
    };
    // @ts-ignore
    if (window.ipcRenderer?.on) {
      // @ts-ignore
      window.ipcRenderer.on('database-section-reset', handler);
      // @ts-ignore
      window.ipcRenderer.on('sync-data-updated', handler);
      // @ts-ignore
      window.ipcRenderer.on('update-available', onUpdateAvailable);
      // @ts-ignore
      window.ipcRenderer.on('update-download-progress', onUpdateProgress);
      // @ts-ignore
      window.ipcRenderer.on('update-downloaded', onUpdateDownloaded);
      // @ts-ignore
      window.ipcRenderer.on('update-not-available', onUpdateNone);
      // @ts-ignore
      window.ipcRenderer.on('update-error', onUpdateError);
    }
    return () => {
      // @ts-ignore
      if (window.ipcRenderer?.off) {
        // @ts-ignore
        window.ipcRenderer.off('database-section-reset', handler);
        // @ts-ignore
        window.ipcRenderer.off('sync-data-updated', handler);
        // @ts-ignore
        window.ipcRenderer.off('update-available', onUpdateAvailable);
        // @ts-ignore
        window.ipcRenderer.off('update-download-progress', onUpdateProgress);
        // @ts-ignore
        window.ipcRenderer.off('update-downloaded', onUpdateDownloaded);
        // @ts-ignore
        window.ipcRenderer.off('update-not-available', onUpdateNone);
        // @ts-ignore
        window.ipcRenderer.off('update-error', onUpdateError);
      }
    };
  }, []);

  const loadSettings = async () => {
    // Check print agent status and printers
    const isUp = await isAgentRunning();
    setAgentOnline(isUp);
    let detectedPrinters: string[] = [];

    if (isUp) {
      const agentData = await getAgentPrinters();
      if (agentData && agentData.printers) {
        detectedPrinters = agentData.printers;
      }
    }

    // @ts-ignore
    if (window.db) {
      try {
        // @ts-ignore
        const sysPrinters = await window.db.invoke('get-printers');
        if (Array.isArray(sysPrinters)) {
          const names = sysPrinters.map((p: any) => p.name);
          detectedPrinters = Array.from(new Set([...detectedPrinters, ...names]));
        }
      } catch (e) {}
    }

    setAvailablePrinters(detectedPrinters);

    // @ts-ignore
    const saved = await window.db.invoke('get-settings');
    if (saved && Object.keys(saved).length > 0) {
      setSettings((prev: any) => ({ ...prev, ...saved }));
    } else if (detectedPrinters.length > 0) {
      // Default printer if none set
      setSettings((prev: any) => ({ ...prev, printerName: prev.printerName || detectedPrinters[0] }));
    }
  };

  const handleSave = async () => {
    // @ts-ignore
    await window.db.invoke('save-settings', settings);
    localStorage.setItem('escpos_enabled', settings.escposEnabled ?? 'true');

    try {
      await syncAgentPrinter(
        settings.printerName || '',
        80,
        settings.footerMsg || '',
        settings.receiptLanguage === 'si' ? 'Sinhala' : 'English'
      );
    } catch (_) {}

    alert('Settings saved successfully!');
  };

  const handleStartAgent = async () => {
    setStartingAgent(true);
    // @ts-ignore
    if (window.db && typeof window.db.invoke === 'function') {
      try {
        // @ts-ignore
        await window.db.invoke('launch-print-agent');
      } catch (err) {}
    }
    // Poll for up to 5 seconds
    for (let i = 0; i < 6; i++) {
      await new Promise(r => setTimeout(r, 800));
      const up = await isAgentRunning();
      if (up) {
        setAgentOnline(true);
        const agentData = await getAgentPrinters();
        if (agentData?.printers) {
          setAvailablePrinters(prev => Array.from(new Set([...prev, ...agentData.printers])));
        }
        setStartingAgent(false);
        return;
      }
    }
    setStartingAgent(false);
    alert('Print Agent could not be reached. Ensure LunaPOSPrintAgent.exe is present in the application folder and not blocked by Windows Defender.');
  };

  const handleTestDrawer = async () => {
    setDrawerTestStatus('Sending kick signal to drawer...');
    const res = await openCashDrawerViaAgent(settings.printerName);
    if (res.ok) {
      setDrawerTestStatus(`✓ Drawer kick sent to "${res.printer || settings.printerName || 'Receipt Printer'}"!`);
      setTimeout(() => setDrawerTestStatus(''), 4000);
    } else {
      setDrawerTestStatus(`❌ ${res.error || 'Failed'}`);
      alert(`Could not open cash drawer: ${res.error}\n\nPlease check:\n1. Print Agent is Online (green status above).\n2. Receipt printer is turned ON and connected.\n3. Cash drawer's RJ11 cable is plugged into the printer's DK port.`);
    }
  };

  const loadDbCounts = async () => {
    setLoadingCounts(true);
    try {
      // @ts-ignore
      if (window.db?.invoke) {
        // @ts-ignore
        const counts = await window.db.invoke('get-database-section-counts');
        setDbCounts(counts || {});
      }
    } catch (e) {
      console.warn('Could not load db section counts:', e);
    } finally {
      setLoadingCounts(false);
    }
  };

  const handleConfirmReset = async () => {
    if (!resetModal) return;
    if (!resetPin.trim()) {
      alert('Please enter Admin PIN to authorize database wipe.');
      return;
    }

    const pinTrim = resetPin.trim();
    setResetting(true);
    try {
      // @ts-ignore
      const res = await window.db.invoke('reset-database-section', {
        section: resetModal.section,
        pin: pinTrim,
        adminUsername: 'Admin',
        reason: resetReason || 'Manual Section Reset'
      });

      if (res && res.success) {
        alert(res.message);
        setResetModal(null);
        setResetPin('');
        setResetReason('');
        await loadDbCounts();
      } else {
        alert(res?.error || 'Database reset failed.');
      }
    } catch (err: any) {
      alert('Reset error: ' + (err.message || String(err)));
    } finally {
      setResetting(false);
    }
  };

  const handleExportBackup = async () => {
    try {
      // @ts-ignore
      const res = await window.db.invoke('take-database-snapshot');
      if (res && res.success) {
        alert(`Database snapshot created successfully!\n\nLocation:\n${res.filePath}`);
      } else {
        alert('Could not export snapshot: ' + (res?.error || 'Unknown error'));
      }
    } catch (e: any) {
      alert('Export snapshot error: ' + e.message);
    }
  };

  const resetSections = [
    {
      id: 'sales_invoices',
      title: 'Sales & Invoices',
      desc: 'Wipes all customer bills, custom invoices, held bills, and billing records.',
      count: dbCounts.sales_invoices ?? 0,
      unit: 'invoices',
      color: 'rose'
    },
    {
      id: 'sessions_shifts',
      title: 'Day Sessions & Shifts',
      desc: 'Wipes terminal day sessions, cashier handovers, till drop records, and shift history.',
      count: dbCounts.sessions_shifts ?? 0,
      unit: 'sessions',
      color: 'amber'
    },
    {
      id: 'inventory_ledger',
      title: 'Stock Movement Ledger',
      desc: 'Wipes inventory stock in/out audit history (keeps current product stock levels intact).',
      count: dbCounts.inventory_ledger ?? 0,
      unit: 'audit records',
      color: 'blue'
    },
    {
      id: 'customers_credit',
      title: 'Customers & Credit Accounts',
      desc: 'Wipes customer registry, credit accounts, credit payments, and customer balance ledgers.',
      count: dbCounts.customers_credit ?? 0,
      unit: 'customers',
      color: 'purple'
    },
    {
      id: 'suppliers_purchases',
      title: 'Suppliers & Purchases (GRN)',
      desc: 'Wipes supplier list, Purchase Orders, Goods Received Notes (GRN), and payment history.',
      count: dbCounts.suppliers_purchases ?? 0,
      unit: 'suppliers',
      color: 'indigo'
    },
    {
      id: 'vouchers_promotions',
      title: 'Vouchers & Promotions',
      desc: 'Wipes gift vouchers, discount vouchers, and promotional pricing campaigns.',
      count: dbCounts.vouchers_promotions ?? 0,
      unit: 'vouchers',
      color: 'teal'
    },
    {
      id: 'all_transactional',
      title: 'All Transactional Data (Fresh Operations)',
      desc: 'Wipes all sales, day sessions, handovers, held bills, and stock ledger. Keeps products and customers.',
      count: (dbCounts.sales_invoices || 0) + (dbCounts.sessions_shifts || 0),
      unit: 'total records',
      color: 'red',
      danger: true
    },
    {
      id: 'full_factory_reset',
      title: 'Full Factory Reset (Clean Slate)',
      desc: 'Completely wipes transactions, shifts, ledger, customers, suppliers, and vouchers across all devices.',
      count: 'Full Wipe',
      unit: 'all tables',
      color: 'red',
      danger: true
    }
  ];

  return (
    <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 h-full flex flex-col overflow-auto">
      <div className="flex justify-between items-center mb-8 shrink-0">
        <div>
          <h2 className="text-xl font-bold text-brand-dark">System Configuration</h2>
          <p className="text-sm text-gray-500">Manage hardware peripherals, receipt formats, and tax rules.</p>
        </div>
        <button onClick={handleSave} className="bg-brand-primary text-white px-6 py-3 rounded-full font-bold flex items-center hover:bg-brand-secondary transition-colors shadow-sm">
          <Save size={18} className="mr-2" /> Save Configuration
        </button>
      </div>

      <div className="grid grid-cols-2 gap-8">
        
        <div className="space-y-6">
          <div className="p-6 border border-gray-200 rounded-2xl">
            <h3 className="font-bold text-brand-dark text-lg mb-4 flex items-center"><Monitor size={20} className="mr-2 text-brand-primary"/> Store Profile</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Store Name</label>
                <input type="text" className="w-full border border-gray-200 rounded-xl px-4 py-2 outline-none bg-gray-50 focus:bg-white focus:border-brand-primary transition-colors" value={settings.storeName || ''} onChange={e => setSettings({...settings, storeName: e.target.value})} />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Address / Tagline</label>
                <input type="text" className="w-full border border-gray-200 rounded-xl px-4 py-2 outline-none bg-gray-50 focus:bg-white focus:border-brand-primary transition-colors" value={settings.tagline || ''} onChange={e => setSettings({...settings, tagline: e.target.value})} />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Store Contact Number / Hotline</label>
                <input type="text" className="w-full border border-gray-200 rounded-xl px-4 py-2 outline-none bg-gray-50 focus:bg-white focus:border-brand-primary transition-colors" placeholder="e.g. 045 2286041 / 077 1234567" value={settings.phone || ''} onChange={e => setSettings({...settings, phone: e.target.value})} />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Default POS Layout</label>
                <select className="w-full border border-gray-200 rounded-xl px-4 py-2 outline-none bg-gray-50" value={settings.posLayout || 'grid'} onChange={e => setSettings({...settings, posLayout: e.target.value})}>
                  <option value="grid">Grid (Images)</option>
                  <option value="list">List (Compact Rows)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Receipt Language</label>
                <select className="w-full border border-gray-200 rounded-xl px-4 py-2 outline-none bg-gray-50 mb-3" value={settings.receiptLanguage || 'en'} onChange={e => setSettings({...settings, receiptLanguage: e.target.value})}>
                  <option value="en">English (Default)</option>
                  <option value="si">Sinhala (සිංහල)</option>
                </select>
                <label className="flex items-center space-x-2 cursor-pointer mt-4">
                  <input type="checkbox" className="w-5 h-5 accent-brand-primary" checked={settings.escposEnabled === 'true'} onChange={e => setSettings({...settings, escposEnabled: e.target.checked ? 'true' : 'false'})} />
                  <span className="text-sm font-bold text-gray-700">Use C# ESC/POS Agent (localhost:7777)</span>
                </label>
                <label className="flex items-start space-x-2 cursor-pointer mt-4 pt-3 border-t border-gray-100">
                  <input 
                    type="checkbox" 
                    className="w-5 h-5 accent-brand-primary rounded mt-0.5" 
                    checked={settings.always_prompt_quantity_modal === true || settings.always_prompt_quantity_modal === 'true'} 
                    onChange={async e => {
                      const newVal = e.target.checked;
                      setSettings((prev: any) => ({ ...prev, always_prompt_quantity_modal: newVal }));
                      // @ts-ignore
                      if (window.db?.invoke) {
                        try {
                          // @ts-ignore
                          await window.db.invoke('save-settings', { always_prompt_quantity_modal: newVal });
                        } catch (err) {
                          console.error('Failed to auto-save prompt modal setting:', err);
                        }
                      }
                    }} 
                  />
                  <div>
                    <span className="text-sm font-bold text-gray-800">Prompt Quantity &amp; Price Modal on Scan / Search</span>
                    <p className="text-[11px] text-gray-500 leading-tight mt-0.5">
                      When scanning barcodes, searching by name/code, or selecting items (pcs, boxes, packs, etc.), open an Add-to-Cart dialog to enter quantity and price override.
                    </p>
                  </div>
                </label>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Invoice Logo</label>
                <div className="flex items-center space-x-4">
                  {settings.invoiceLogo && (
                    <img src={settings.invoiceLogo} alt="Invoice Logo" className="w-16 h-16 object-contain border border-gray-200 rounded-lg p-1" />
                  )}
                  <input type="file" accept="image/*" className="text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-brand-primary/10 file:text-brand-primary hover:file:bg-brand-primary/20" 
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onloadend = () => setSettings({...settings, invoiceLogo: reader.result});
                        reader.readAsDataURL(file);
                      }
                    }} 
                  />
                </div>
                <p className="text-[10px] text-gray-400 mt-1">Recommended size: 200x200px or similar aspect ratio. Transparent PNG works best.</p>
                </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Invoice Footer Message</label>
                <textarea 
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 text-sm font-medium h-20" 
                  value={settings.footerMsg || ''} 
                  onChange={e => setSettings({...settings, footerMsg: e.target.value})} 
                  placeholder="e.g. Thank you for shopping with us!" 
                />
              </div>
            </div>
          </div>
          <div className="p-6 border border-gray-200 rounded-2xl bg-white shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-brand-dark text-lg flex items-center"><Printer size={20} className="mr-2 text-brand-primary"/> Peripherals</h3>
              {agentOnline ? (
                <div className="flex items-center gap-2">
                  <span className="flex items-center text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                    <CheckCircle size={14} className="mr-1 text-emerald-500" /> Print Agent Online (7777)
                  </span>
                  <button onClick={loadSettings} title="Refresh connection" className="p-1 rounded-full hover:bg-gray-100 text-gray-500">
                    <RefreshCw size={14} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="flex items-center text-xs font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                    <AlertCircle size={14} className="mr-1 text-amber-500" /> Agent Offline
                  </span>
                  <button 
                    onClick={handleStartAgent} 
                    disabled={startingAgent}
                    className="flex items-center gap-1 text-xs bg-brand-primary text-white font-bold px-3 py-1 rounded-full hover:bg-brand-secondary transition-colors disabled:opacity-50"
                  >
                    <Play size={12} /> {startingAgent ? 'Starting...' : 'Start Agent'}
                  </button>
                </div>
              )}
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Receipt Printer</label>
                <div className="flex gap-2">
                  <select className="flex-1 border border-gray-200 rounded-xl px-4 py-2 outline-none bg-gray-50 text-sm font-medium" value={settings.printerName || ''} onChange={e => setSettings({...settings, printerName: e.target.value})}>
                    <option value="">Prompt standard print window</option>
                    {availablePrinters.map(name => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>
                <p className="text-[10px] text-gray-400 mt-1">Select your thermal receipt printer (e.g. POS-80) for silent 1-click printing.</p>
              </div>

              <div className="pt-2 border-t border-gray-100 space-y-3">
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input type="checkbox" className="w-5 h-5 text-brand-primary rounded" checked={settings.autoOpenDrawer !== false} onChange={e => setSettings({...settings, autoOpenDrawer: e.target.checked})} />
                  <span className="font-bold text-gray-700 text-sm">Auto-open Cash Drawer on Cash Sale</span>
                </label>

                <div className="flex items-center gap-3 pt-1">
                  <button 
                    type="button" 
                    onClick={handleTestDrawer}
                    className="px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
                  >
                    <DoorOpen size={16} /> Test Cash Drawer (Open Now)
                  </button>
                  {drawerTestStatus && (
                    <span className="text-xs font-bold text-gray-700 animate-fade-in">{drawerTestStatus}</span>
                  )}
                </div>
                <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-3 text-[11px] text-blue-900 leading-relaxed">
                  <p className="font-bold mb-0.5">ℹ️ Cash Drawer Connection Note:</p>
                  <span>Cash drawers connect via telephone-style RJ11 cable directly into the back of your thermal receipt printer (marked <strong>DK</strong> or <strong>Drawer</strong>). Ensure the printer is ON and selected above.</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="p-6 border border-gray-200 rounded-2xl">
            <h3 className="font-bold text-brand-dark text-lg mb-4 flex items-center"><ShieldCheck size={20} className="mr-2 text-brand-primary"/> Tax & Compliance</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Default Tax Rate (%)</label>
                <input type="number" className="w-full border border-gray-200 rounded-xl px-4 py-2 outline-none bg-gray-50" value={settings.taxRate} onChange={e => setSettings({...settings, taxRate: Number(e.target.value)})} />
              </div>
              <label className="flex items-center space-x-3 cursor-pointer">
                <input type="checkbox" className="w-5 h-5 text-brand-primary rounded" checked={settings.taxInclusive} onChange={e => setSettings({...settings, taxInclusive: e.target.checked})} />
                <span className="font-bold text-gray-700 text-sm">Prices include Tax (Tax Inclusive)</span>
              </label>
            </div>
          </div>

          <div className="p-6 border border-emerald-100 rounded-2xl bg-gradient-to-br from-white to-emerald-50/20 shadow-xs">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-brand-dark text-lg flex items-center">
                <Award size={20} className="mr-2 text-emerald-600"/> Customer Loyalty & Reward Points
              </h3>
              <label className="flex items-center space-x-2 cursor-pointer bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                <input 
                  type="checkbox" 
                  className="w-4 h-4 accent-emerald-600 rounded" 
                  checked={settings.loyalty_enabled !== false && settings.loyalty_enabled !== 'false'} 
                  onChange={e => setSettings({...settings, loyalty_enabled: e.target.checked})} 
                />
                <span className="text-xs font-bold text-emerald-800">Active</span>
              </label>
            </div>

            <p className="text-xs text-gray-500 mb-4 leading-relaxed">
              Configure how loyalty points are awarded when customers make purchases, and their redemption value as cash discounts at checkout.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Points Earned per Rs. 100 Spent
                </label>
                <div className="relative">
                  <input 
                    type="number" 
                    step="0.1" 
                    min="0"
                    placeholder="1"
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 outline-none bg-white font-black text-slate-800 focus:border-emerald-600 transition-colors" 
                    value={settings.loyalty_points_per_100 ?? 1} 
                    onChange={e => setSettings({...settings, loyalty_points_per_100: Number(e.target.value)})} 
                  />
                  <span className="absolute right-4 top-2.5 text-xs font-bold text-gray-400">Points / Rs. 100</span>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  Example: Set to <strong>1</strong> means spending Rs. 100 earns <strong>1 point</strong>. Spending Rs. 500 earns <strong>5 points</strong>.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Value of 1 Point in Rupees (Rs.)
                </label>
                <div className="relative">
                  <input 
                    type="number" 
                    step="0.05" 
                    min="0.01"
                    placeholder="1.00"
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 outline-none bg-white font-black text-slate-800 focus:border-emerald-600 transition-colors" 
                    value={settings.loyalty_point_value_rs ?? 1.0} 
                    onChange={e => setSettings({...settings, loyalty_point_value_rs: Number(e.target.value)})} 
                  />
                  <span className="absolute right-4 top-2.5 text-xs font-bold text-gray-400">Rs. / Point</span>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  Example: Set to <strong>1.00</strong> means <strong>1 Point = Rs. 1.00</strong> discount. Redeeming 50 points gives a Rs. 50 discount at checkout.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Minimum Points Required to Redeem
                </label>
                <div className="relative">
                  <input 
                    type="number" 
                    step="1" 
                    min="1"
                    placeholder="10"
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 outline-none bg-white font-black text-slate-800 focus:border-emerald-600 transition-colors" 
                    value={settings.loyalty_min_redeem_points ?? 10} 
                    onChange={e => setSettings({...settings, loyalty_min_redeem_points: Number(e.target.value)})} 
                  />
                  <span className="absolute right-4 top-2.5 text-xs font-bold text-gray-400">Points Min</span>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  Customer must have at least this balance before points redemption can be applied at checkout.
                </p>
              </div>
            </div>
          </div>

          <div className="p-6 border border-gray-200 rounded-2xl">
            <h3 className="font-bold text-brand-dark text-lg mb-4 flex items-center">
              <Database size={20} className="mr-2 text-brand-primary" /> Database Backup & Local Storage
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Take an immediate full snapshot of your local SQLite database before performing maintenance.
            </p>
            <button
              onClick={handleExportBackup}
              className="w-full border-2 border-brand-primary text-brand-primary py-3 rounded-xl font-bold hover:bg-brand-primary/10 transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <Database size={16} />
              <span>Export Instant Database Snapshot (.db)</span>
            </button>
          </div>
        </div>

      </div>

      {/* ── SOFTWARE UPDATE ── */}
      <div className="mt-8 border-t border-gray-200 pt-8 max-w-6xl">
        <div className="p-6 border border-gray-200 rounded-2xl bg-white shadow-sm">
          <h3 className="font-bold text-brand-dark text-lg mb-1 flex items-center gap-2">
            <ArrowDownCircle size={20} className="text-brand-primary" /> Software Update
          </h3>
          <p className="text-xs text-gray-500 mb-5">Check for the latest version of Nova FreshMart POS and install updates.</p>

          <div className="flex items-center gap-4 flex-wrap">
            {/* Check / status button */}
            {(updateStatus === 'idle' || updateStatus === 'none' || updateStatus === 'checking' || updateStatus === 'error') ? (
              <button
                onClick={async () => {
                  setUpdateStatus('checking');
                  setUpdateVersion('');
                  setUpdateError('');
                  // @ts-ignore
                  await window.db?.checkForUpdates?.().catch(() => {});
                  setTimeout(() => setUpdateStatus((s: any) => s === 'checking' ? 'none' : s), 12000);
                }}
                className="flex items-center gap-2 px-5 py-2.5 bg-brand-primary hover:bg-brand-secondary text-white font-bold text-sm rounded-xl transition-colors shadow-sm"
              >
                <RefreshCw size={15} className={updateStatus === 'checking' ? 'animate-spin' : ''} />
                {updateStatus === 'checking' ? 'Checking...' : 'Check for Updates'}
              </button>
            ) : null}

            {updateStatus === 'none' && (
              <div className="flex items-center gap-2 text-sm font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-4 py-2.5 rounded-xl">
                <PackageCheck size={16} /> No update available — you're on the latest version.
              </div>
            )}

            {updateStatus === 'error' && (
              <div className="flex items-center gap-2 text-sm font-bold text-amber-700 bg-amber-50 border border-amber-200 px-4 py-2.5 rounded-xl">
                <AlertCircle size={16} /> {updateError || 'Unable to check for updates. Please check your internet connection.'}
              </div>
            )}

            {updateStatus === 'available' && (
              <div className="flex items-center gap-3 text-sm font-bold text-blue-700 bg-blue-50 border border-blue-200 px-4 py-2.5 rounded-xl">
                <Download size={16} />
                Update v{updateVersion} available — downloading automatically...
              </div>
            )}

            {updateStatus === 'downloading' && (
              <div className="flex flex-col gap-1.5 min-w-[260px]">
                <div className="flex justify-between text-xs font-bold text-blue-700">
                  <span>Downloading update v{updateVersion}...</span>
                  <span>{updatePercent}%</span>
                </div>
                <div className="w-full bg-blue-100 rounded-full h-2">
                  <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${updatePercent}%` }} />
                </div>
              </div>
            )}

            {updateStatus === 'ready' && (
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2 text-sm font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-4 py-2.5 rounded-xl">
                  <CheckCircle size={16} /> v{updateVersion} downloaded — ready to install.
                </div>
                <button
                  onClick={() => {
                    // @ts-ignore
                    window.db?.installUpdateNow?.();
                  }}
                  className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl transition-colors shadow-sm"
                >
                  <ArrowDownCircle size={15} /> Restart & Install Now
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── MODULAR DATABASE MAINTENANCE & CLOUD RESET ── */}
      <div className="mt-8 border-t border-gray-200 pt-8 max-w-6xl">
        <div className="bg-white border-2 border-slate-200 rounded-3xl p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-2 bg-rose-50 text-rose-600 rounded-xl">
                  <ShieldAlert size={22} />
                </span>
                <h3 className="text-xl font-black text-brand-dark tracking-tight">
                  Modular Database Maintenance &amp; Cloud Reset
                </h3>
              </div>
              <p className="text-xs text-gray-500 mt-1 max-w-2xl leading-relaxed">
                Safely wipe individual sections of the database (or perform complete factory resets). 
                Wiping data here removes records from <strong>both this local device AND the cloud database simultaneously</strong>. 
                Reset events are automatically broadcast so other branch terminals will purge their local records on next sync, 
                <strong>guaranteeing that deleted data never resurrects or reappears on any device</strong>.
              </p>
            </div>

            <button
              onClick={loadDbCounts}
              disabled={loadingCounts}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
            >
              <RefreshCw size={14} className={loadingCounts ? 'animate-spin' : ''} />
              <span>Refresh Record Counts</span>
            </button>
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {resetSections.map((sec) => {
              const isDanger = sec.danger;
              return (
                <div
                  key={sec.id}
                  className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
                    isDanger 
                      ? 'bg-rose-50/40 border-rose-200 hover:border-rose-400' 
                      : 'bg-gray-50/50 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <h4 className={`text-sm font-black ${isDanger ? 'text-rose-950' : 'text-slate-800'}`}>
                        {sec.title}
                      </h4>
                      <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                        isDanger 
                          ? 'bg-rose-100 text-rose-800 border border-rose-200' 
                          : 'bg-white text-slate-700 border border-gray-200'
                      }`}>
                        {typeof sec.count === 'number' ? `${sec.count.toLocaleString()} ${sec.unit}` : sec.count}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 leading-relaxed mb-4">
                      {sec.desc}
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      setResetModal({
                        open: true,
                        section: sec.id,
                        title: sec.title,
                        count: sec.count,
                        desc: sec.desc,
                        danger: sec.danger
                      });
                      setResetPin('');
                      setResetReason('');
                    }}
                    className={`w-full py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      isDanger
                        ? 'bg-rose-600 hover:bg-rose-700 active:scale-95 text-white shadow-sm shadow-rose-600/30'
                        : 'bg-white hover:bg-rose-50 text-rose-600 hover:text-rose-700 border border-rose-200 hover:border-rose-300'
                    }`}
                  >
                    <Trash2 size={13} />
                    <span>Reset {sec.title.split('&')[0].trim()}</span>
                  </button>
                </div>
              );
            })}
          </div>

          <div className="mt-5 p-3.5 bg-amber-50/70 border border-amber-200 rounded-2xl flex items-start gap-3 text-xs text-amber-900">
            <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong>Admin Safety Protection:</strong> A pre-reset automated database snapshot is always created before any wipe. 
              Only authorized System Administrators with PIN access can initiate section resets. Resets are final and propagate across all networked POS terminals.
            </p>
          </div>
        </div>
      </div>

      {/* ── RESET CONFIRMATION MODAL ── */}
      {resetModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-rose-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-rose-600 mb-4">
              <div className="p-3 bg-rose-100 rounded-2xl">
                <AlertTriangle size={28} />
              </div>
              <div>
                <h4 className="font-black text-lg text-slate-900">
                  Confirm Section Reset
                </h4>
                <p className="text-xs font-semibold text-rose-600">
                  {resetModal.title}
                </p>
              </div>
            </div>

            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-xs text-rose-950 space-y-2 mb-4 leading-relaxed">
              <p className="font-bold">⚠️ Warning: Permanent Bi-Directional Wipe</p>
              <p>
                This action will permanently delete all records in <strong>{resetModal.title}</strong> from:
              </p>
              <ul className="list-disc pl-5 space-y-1 font-medium text-[11px]">
                <li>Local offline SQLite database on this terminal</li>
                <li>Remote MariaDB central cloud database</li>
                <li>All other branch terminals via automated reset broadcast</li>
              </ul>
              <p className="text-[10px] text-rose-800 italic pt-1">
                Data will not resurrect or return on subsequent sync cycles.
              </p>
            </div>

            <div className="space-y-3 mb-6">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Enter Admin PIN to Authorize
                </label>
                <div className="relative">
                  <input
                    type="password"
                    autoFocus
                    placeholder="Enter Admin PIN"
                    value={resetPin}
                    onChange={(e) => setResetPin(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono font-bold text-slate-900 outline-none focus:border-rose-600 focus:bg-white"
                  />
                  <Lock size={15} className="absolute left-3 top-3 text-slate-400" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Reason for Reset (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. End of trial, test cleanup, audit reset"
                  value={resetReason}
                  onChange={(e) => setResetReason(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 outline-none focus:border-rose-600 focus:bg-white"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setResetModal(null)}
                disabled={resetting}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReset}
                disabled={resetting}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs rounded-xl shadow-md shadow-rose-600/30 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {resetting ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>Wiping...</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={14} />
                    <span>Authorize &amp; Wipe</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}