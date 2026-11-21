import React, { useState, useEffect } from 'react';
import { Search, RotateCcw, ArrowLeftRight, Package, Plus, Minus, X, CheckCircle, Lock } from 'lucide-react';
import { getSriLankaNowString, formatSriLankaDateTime, formatReceiptDate } from '../utils/dateUtils';

export default function RefundView({ currentUser, onSendToCart, onClose }: any) {
  const [search, setSearch] = useState('');
  const [invoice, setInvoice] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]); // original items
  const [returnItems, setReturnItems] = useState<Record<number, {qty: number; condition: 'restock' | 'damage'}>>({});
  
  const [mode, setMode] = useState<'refund'|'exchange'>('refund');
  const [exchangeCart, setExchangeCart] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [productSearch, setProductSearch] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Supervisor PIN authorization for Cashiers
  const isPrivileged = currentUser?.role === 'Admin' || 
                       currentUser?.role === 'Manager' || 
                       (currentUser?.permissions && currentUser.permissions.includes('Refunds'));
  const [showSupervisorModal, setShowSupervisorModal] = useState(!isPrivileged);
  const [supervisorPin, setSupervisorPin] = useState('');
  const [supervisorError, setSupervisorError] = useState('');
  const [authorizedSupervisor, setAuthorizedSupervisor] = useState<string>('');
  const [pendingAction, setPendingAction] = useState<'execute' | 'sendToCart' | null>(null);

  // Fetch products for exchange mode
  useEffect(() => {
    // @ts-ignore
    window.db.getProducts().then(setProducts).catch(console.error);
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!search) return;
    setLoading(true);
    setError('');
    setInvoice(null);
    setItems([]);
    setReturnItems({});
    setExchangeCart([]);
    setMode('refund');

    try {
      // @ts-ignore
      const invoker = window.ipcRenderer?.invoke || window.db?.invoke;
      const res = await invoker('get-invoice-by-id', search.replace(/^0+/, ''));
      if (res) {
        if (res.is_refunded) {
          setError('This invoice has already been refunded or exchanged.');
          setLoading(false);
          return;
        }
        setInvoice(res);
        const invItems = JSON.parse(res.items || '[]');
        setItems(invItems);
        // Initialize return items to 0
        const initialRet: any = {};
        invItems.forEach((i: any, idx: number) => {
          initialRet[idx] = { qty: 0, condition: 'restock' };
        });
        setReturnItems(initialRet);
      } else {
        setError('Invoice not found');
      }
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  const updateReturnQty = (idx: number, qty: number, max: number) => {
    setReturnItems(prev => ({
      ...prev,
      [idx]: { condition: prev[idx]?.condition || 'restock', qty: Math.max(0, Math.min(qty, max)) }
    }));
  };

  const updateReturnCondition = (idx: number, condition: 'restock' | 'damage') => {
    setReturnItems(prev => ({
      ...prev,
      [idx]: { ...(prev[idx] || { qty: 0 }), condition }
    }));
  };

  const addExchangeItem = (prod: any) => {
    setExchangeCart(prev => {
      const existing = prev.find(i => i.id === prod.id);
      if (existing) {
        if (existing.qty >= prod.stock) {
          alert("Cannot add more. Only " + prod.stock + " in stock.");
          return prev;
        }
        return prev.map(i => i.id === prod.id ? { ...i, qty: i.qty + 1 } : i);
      }
      if (prod.stock < 1) {
        alert('Item out of stock.');
        return prev;
      }
      return [...prev, { ...prod, qty: 1 }];
    });
    setProductSearch('');
  };

  const updateExchangeQty = (id: number, delta: number) => {
    setExchangeCart(prev => prev.map(i => {
      if (i.id === id) {
        const newQty = Math.max(1, Math.min(i.qty + delta, i.stock));
        return { ...i, qty: newQty };
      }
      return i;
    }));
  };

  const removeExchangeItem = (id: number) => {
    setExchangeCart(prev => prev.filter(i => i.id !== id));
  };

  const refundTotal = items.reduce((sum, item, idx) => {
    const qty = returnItems[idx]?.qty || 0;
    return sum + (qty * (item.price - (item.discount / item.quantity))); // approximate per-item discount
  }, 0);

  const exchangeTotal = exchangeCart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const difference = exchangeTotal - refundTotal;
  const hasReturns = refundTotal > 0;

  const handleProcess = async () => {
    if (!hasReturns) return alert('Select items to return');
    if (mode === 'exchange' && exchangeCart.length === 0) return alert('Select items for exchange');
    
    // Check if Cashier requires supervisor authorization
    if (!isPrivileged && !authorizedSupervisor) {
      setPendingAction('execute');
      setSupervisorPin('');
      setSupervisorError('');
      setShowSupervisorModal(true);
      return;
    }

    await executeProcess();
  };

  const handleSendToCart = () => {
    const toSend: any[] = [];
    items.forEach((item, idx) => {
      const ret = returnItems[idx];
      const qty = ret?.qty || 0;
      const isDamaged = ret?.condition === 'damage';
      if (qty > 0) {
        toSend.push({
          id: item.id || item.product_id,
          name: item.name,
          price: item.price,
          qty,
          variantId: item.variantId,
          unit: item.unit,
          is_damaged: isDamaged,
          return_condition: isDamaged ? 'damage' : 'restock'
        });
      }
    });
    if (toSend.length === 0) return alert('Select at least one item to return');

    if (!isPrivileged && !authorizedSupervisor) {
      setPendingAction('sendToCart');
      setSupervisorPin('');
      setSupervisorError('');
      setShowSupervisorModal(true);
      return;
    }

    if (onSendToCart) {
      onSendToCart(toSend, invoice.id);
    }
  };

  const handleVerifySupervisor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supervisorPin) {
      setSupervisorError('Please enter a supervisor PIN.');
      return;
    }
    setSupervisorError('');
    try {
      // @ts-ignore
      const invoker = window.ipcRenderer?.invoke || window.db?.invoke;
      const res = await invoker('verify-pin', { pin: supervisorPin });
      if (res?.success && res.user) {
        const role = (res.user.role || '').toLowerCase();
        const perms = typeof res.user.permissions === 'string' ? JSON.parse(res.user.permissions) : (res.user.permissions || []);
        if (role === 'admin' || role === 'manager' || role === 'supervisor' || perms.includes('Refunds')) {
          setAuthorizedSupervisor(`${res.user.username} (${res.user.role})`);
          setShowSupervisorModal(false);

          if (pendingAction === 'execute') {
            setPendingAction(null);
            await executeProcess();
          } else if (pendingAction === 'sendToCart') {
            setPendingAction(null);
            const toSend: any[] = [];
            items.forEach((item, idx) => {
              const ret = returnItems[idx];
              const qty = ret?.qty || 0;
              const isDamaged = ret?.condition === 'damage';
              if (qty > 0) {
                toSend.push({
                  id: item.id || item.product_id,
                  name: item.name,
                  price: item.price,
                  qty,
                  variantId: item.variantId,
                  unit: item.unit,
                  is_damaged: isDamaged,
                  return_condition: isDamaged ? 'damage' : 'restock'
                });
              }
            });
            if (onSendToCart && toSend.length > 0) {
              onSendToCart(toSend, invoice.id);
            }
          }
        } else {
          setSupervisorError(`User "${res.user.username}" (${res.user.role}) does not have manager/admin authorization rights.`);
        }
      } else {
        setSupervisorError(res?.error || 'Invalid supervisor PIN.');
      }
    } catch (err: any) {
      setSupervisorError(err?.message || 'Verification failed.');
    }
  };

  const executeProcess = async () => {
    const combinedItems: any[] = [];
    
    // 1. Add returned items as negative quantities
    items.forEach((item, idx) => {
      const ret = returnItems[idx];
      const qty = ret?.qty || 0;
      const isDamaged = ret?.condition === 'damage';
      if (qty > 0) {
        combinedItems.push({
          id: item.id || item.product_id,
          name: "[RET-" + invoice.id + (isDamaged ? " DAMAGED]" : "]") + " " + (item.name || 'Item'),
          price: item.price,
          quantity: -qty, // negative for refund
          variantId: item.variantId,
          is_return: true,
          is_damaged: isDamaged,
          return_condition: isDamaged ? 'damage' : 'restock'
        });
      }
    });

    // 2. Add exchange items as positive quantities
    if (mode === 'exchange') {
      exchangeCart.forEach(item => {
        combinedItems.push({
          id: item.id,
          name: item.name,
          price: item.price,
          quantity: item.qty,
          variantId: item.variantId
        });
      });
    }

    try {
      setLoading(true);
      // @ts-ignore
      const st = await window.db.getSyncStatus().catch(() => null);
      const tid = st?.config?.current_terminal_id;
      // @ts-ignore
      const session = await window.db.getActiveSession(tid);
      if (!session || (session.terminal_id && tid && session.terminal_id !== tid)) {
        alert(`Please open a cash register session on this terminal (${st?.config?.current_terminal_name || tid || 'Terminal'}) first!`);
        setLoading(false);
        return;
      }

      // Checkout the combined cart
      // @ts-ignore
      const invoiceId = await window.db.checkout({
        total: difference,
        discount: 0,
        method: 'Cash',
        items: combinedItems,
        sessionId: session.id,
        customerId: invoice.customer_id,
        saleType: mode.toUpperCase(),
        parentInvoiceId: invoice.id,
        markRefundedId: invoice.id // explicitly marks original as refunded
      });

      const prefix = mode === 'exchange' ? 'EXC' : 'REF';
      const nowSriLanka = getSriLankaNowString();
      const finalReceipt = {
        storeName: "Nova FreshMart",
        invoiceNo: prefix + "-" + String(invoiceId).padStart(4, '0'),
        date: nowSriLanka,
        items: combinedItems,
        total: difference,
        subtotal: difference,
        method: 'Cash',
        saleType: mode.toUpperCase(),
        sale_type: mode.toUpperCase(),
        parent_invoice_id: invoice.id,
        parent_invoice_no: invoice.invoice_no || `INV-${invoice.id}`
      };

      if (confirm('Transaction successful! Do you want to print the receipt?')) {
        const payload = {
          invoiceNo: finalReceipt.invoiceNo,
          method: 'Cash',
          createdAt: formatReceiptDate(nowSriLanka),
          date: formatReceiptDate(nowSriLanka),
          subtotal: finalReceipt.subtotal,
          discount: 0,
          total: finalReceipt.total,
          change: 0,
          saleType: finalReceipt.saleType,
          sale_type: finalReceipt.sale_type,
          parent_invoice_id: finalReceipt.parent_invoice_id,
          parent_invoice_no: finalReceipt.parent_invoice_no,
          items: finalReceipt.items.map((i: any) => ({ 
            name: i.name, 
            quantity: i.quantity, 
            price: i.price, 
            total: i.quantity * i.price,
            is_return: i.quantity < 0 || i.is_return
          }))
        };
        window.dispatchEvent(new CustomEvent('print-receipt', { detail: payload }));
      }

      // Reset
      setInvoice(null);
      setItems([]);
      setReturnItems({});
      setExchangeCart([]);
      setSearch('');
      if (onClose) onClose();
    } catch (e: any) {
      alert(e.message);
    }
    setLoading(false);
  };

  const filteredProducts = productSearch 
    ? products.filter(p => (p.name || '').toLowerCase().includes(productSearch.toLowerCase()) || p.item_code?.includes(productSearch))
    : [];

  return (
    <div className="p-6 max-w-6xl mx-auto flex gap-6 h-full">
      <div className="w-2/3 flex flex-col space-y-6">
        <div>
          <h2 className="text-2xl font-black text-brand-dark mb-1">Refund & Exchange</h2>
          <p className="text-gray-500 text-sm font-medium mb-6">Process refunds, exchanges, and return items to inventory.</p>
          
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Scan barcode or enter invoice number (e.g. 37)" className="w-full bg-white border border-gray-200 rounded-xl py-3 pl-12 pr-4 font-bold outline-none focus:border-brand-primary" autoFocus />
            </div>
            <button type="submit" disabled={loading} className="bg-brand-dark text-white px-8 rounded-xl font-bold hover:bg-gray-800 disabled:opacity-50">Search</button>
          </form>
          {error && <p className="text-red-500 text-sm mt-2 font-bold">{error}</p>}
        </div>

        {invoice && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col min-h-0">
            <div className="p-4 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-brand-dark">Original Sale: INV-{invoice.id}</h3>
                <p className="text-xs text-gray-500 font-medium">{formatSriLankaDateTime(invoice.created_at)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Total</p>
                <p className="font-black text-brand-primary">Rs. {invoice.total.toLocaleString()}</p>
              </div>
            </div>
            
            <div className="flex-1 overflow-auto p-4">
              <div className="flex justify-between items-center mb-4">
                <h4 className="font-bold text-gray-700">Step 1: Select items to return</h4>
                <div className="flex gap-2">
                  <button onClick={() => {
                    const all: any = {}; items.forEach((i, idx) => all[idx] = { qty: i.quantity, condition: 'restock' }); setReturnItems(all);
                  }} className="text-xs font-bold text-brand-primary bg-brand-primary/10 px-3 py-1.5 rounded-lg hover:bg-brand-primary/20">Select All</button>
                  <button onClick={() => {
                    const none: any = {}; items.forEach((_, idx) => none[idx] = { qty: 0, condition: 'restock' }); setReturnItems(none);
                  }} className="text-xs font-bold text-gray-500 bg-gray-100 px-3 py-1.5 rounded-lg hover:bg-gray-200">Clear</button>
                </div>
              </div>
              
              <div className="space-y-3">
                {items.map((item, idx) => {
                  const ret = returnItems[idx]?.qty || 0;
                  const cond = returnItems[idx]?.condition || 'restock';
                  return (
                    <div key={idx} className={"p-3 rounded-xl border transition-all " + (ret > 0 ? "border-brand-primary bg-brand-primary/5 shadow-xs" : "border-gray-100 bg-white")}>
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="font-bold text-brand-dark">{item.name}</p>
                          <p className="text-xs text-gray-500 font-medium">Bought: {item.quantity} × Rs. {item.price.toLocaleString()}</p>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-[10px] text-gray-400 font-bold uppercase">Refund Value</p>
                            <p className="font-black text-brand-dark">Rs. {(ret * item.price).toLocaleString()}</p>
                          </div>
                          <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-lg">
                            <button onClick={() => updateReturnQty(idx, ret - 1, item.quantity)} className="w-8 h-8 flex items-center justify-center bg-white rounded shadow-sm font-bold hover:text-red-500">-</button>
                            <span className="w-8 text-center font-black">{ret}</span>
                            <button onClick={() => updateReturnQty(idx, ret + 1, item.quantity)} className="w-8 h-8 flex items-center justify-center bg-white rounded shadow-sm font-bold hover:text-brand-primary">+</button>
                          </div>
                        </div>
                      </div>

                      {ret > 0 && (
                        <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-gray-200/60">
                          <span className="text-[11px] font-bold text-gray-500">Return Action:</span>
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => updateReturnCondition(idx, 'restock')}
                              className={"px-2.5 py-1 rounded-lg text-xs font-black transition-all flex items-center gap-1 " + (cond === 'restock' ? "bg-emerald-600 text-white shadow-xs" : "bg-gray-100 text-gray-600 hover:bg-gray-200")}
                            >
                              ✓ Return to Stock
                            </button>
                            <button
                              type="button"
                              onClick={() => updateReturnCondition(idx, 'damage')}
                              className={"px-2.5 py-1 rounded-lg text-xs font-black transition-all flex items-center gap-1 " + (cond === 'damage' ? "bg-rose-600 text-white shadow-xs" : "bg-gray-100 text-gray-600 hover:bg-gray-200")}
                            >
                              ⚠ Return as Damaged / Waste
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {invoice && (
        <div className="w-1/3 flex flex-col space-y-4">
          <div className="flex gap-2 bg-gray-100 p-1 rounded-xl">
            <button onClick={() => setMode('refund')} className={"flex-1 py-2.5 flex justify-center items-center gap-2 text-sm font-bold rounded-lg transition-all " + (mode === 'refund' ? "bg-white shadow text-red-500" : "text-gray-500 hover:bg-gray-200")}><RotateCcw size={16}/> Refund Only</button>
            <button onClick={() => setMode('exchange')} className={"flex-1 py-2.5 flex justify-center items-center gap-2 text-sm font-bold rounded-lg transition-all " + (mode === 'exchange' ? "bg-white shadow text-amber-500" : "text-gray-500 hover:bg-gray-200")}><ArrowLeftRight size={16}/> Exchange Items</button>
          </div>

          {mode === 'exchange' && (
            <div className="flex-1 bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col min-h-0">
              <div className="p-4 border-b border-gray-100">
                <h4 className="font-bold text-gray-700 mb-3">Step 2: Add new items</h4>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16}/>
                  <input type="text" value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder="Search products..." className="w-full bg-gray-50 border border-gray-200 rounded-lg py-2 pl-9 pr-3 text-sm font-medium outline-none focus:border-amber-400"/>
                  
                  {productSearch && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto z-50">
                      {filteredProducts.map(p => (
                        <div key={p.id} onClick={() => addExchangeItem(p)} className="p-3 hover:bg-amber-50 cursor-pointer border-b border-gray-50 last:border-0">
                          <p className="font-bold text-sm text-brand-dark">{p.name}</p>
                          <div className="flex justify-between text-xs text-gray-500 font-medium"><span>Rs. {p.price.toLocaleString()}</span><span>Stock: {p.stock}</span></div>
                        </div>
                      ))}
                      {filteredProducts.length === 0 && <div className="p-4 text-center text-gray-500 text-sm">No products found</div>}
                    </div>
                  )}
                </div>
              </div>
              
              <div className="flex-1 overflow-auto p-4 space-y-2">
                {exchangeCart.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-gray-400">
                    <Package size={32} className="mb-2 opacity-50"/>
                    <p className="text-sm font-medium">Search to add items for exchange</p>
                  </div>
                ) : (
                  exchangeCart.map(item => (
                    <div key={item.id} className="flex items-center justify-between p-2 rounded-lg border border-amber-100 bg-amber-50/30">
                      <div className="flex-1 min-w-0 pr-2">
                        <p className="font-bold text-xs text-brand-dark truncate">{item.name}</p>
                        <p className="text-[10px] text-gray-500 font-medium">Rs. {item.price.toLocaleString()}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center bg-white border border-gray-200 rounded px-1">
                          <button onClick={() => updateExchangeQty(item.id, -1)} className="p-1 hover:text-red-500"><Minus size={10}/></button>
                          <span className="w-4 text-center text-xs font-bold">{item.qty}</span>
                          <button onClick={() => updateExchangeQty(item.id, 1)} className="p-1 hover:text-green-500"><Plus size={10}/></button>
                        </div>
                        <button onClick={() => removeExchangeItem(item.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"><X size={14}/></button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          <div className="bg-brand-dark rounded-2xl p-6 text-white shadow-xl mt-auto shrink-0">
            <div className="space-y-2 mb-4 text-sm font-medium text-gray-300">
              <div className="flex justify-between"><span>Returned Value:</span><span className="text-red-400 font-bold">- Rs. {refundTotal.toLocaleString()}</span></div>
              {mode === 'exchange' && <div className="flex justify-between"><span>New Items Value:</span><span className="text-green-400 font-bold">+ Rs. {exchangeTotal.toLocaleString()}</span></div>}
            </div>
            <div className="border-t border-gray-700 pt-4 mb-6">
              <div className="flex justify-between items-end">
                <span className="text-gray-400 font-bold uppercase tracking-widest text-xs">
                  {difference > 0 ? 'Customer Pays' : (difference < 0 ? 'Refund Amount' : 'Even Exchange')}
                </span>
                <span className={"text-3xl font-black " + (difference > 0 ? "text-amber-400" : (difference < 0 ? "text-red-400" : "text-white"))}>
                  Rs. {Math.abs(difference).toLocaleString()}
                </span>
              </div>
            </div>
            {authorizedSupervisor && (
              <div className="mb-3 text-center">
                <span className="text-[11px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-700/50 px-3 py-1 rounded-full">
                  Authorized by: {authorizedSupervisor}
                </span>
              </div>
            )}
            <button onClick={handleProcess} disabled={loading || !hasReturns || (mode==='exchange' && exchangeCart.length===0)} className="w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 bg-brand-primary hover:bg-brand-secondary text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer">
              {loading ? 'Processing...' : <><CheckCircle size={20}/> {mode === 'refund' ? 'Complete Refund Now' : 'Process Exchange Now'}</>}
            </button>
            {onSendToCart && hasReturns && (
              <button 
                type="button" 
                onClick={handleSendToCart} 
                className="w-full mt-2.5 py-3 rounded-xl font-black flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 transition-all cursor-pointer text-xs shadow-md"
              >
                <ArrowLeftRight size={16} /> Load into POS Cart (Exchange at Register)
              </button>
            )}
          </div>
        </div>
      )}

      {/* Supervisor PIN Modal */}
      {showSupervisorModal && (
        <div className="fixed inset-0 bg-brand-dark/60 backdrop-blur-xs z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-amber-200 animate-in fade-in zoom-in-95 duration-150 text-center">
            <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto mb-3 shadow-xs">
              <Lock size={28} />
            </div>
            <h3 className="font-black text-slate-900 text-lg">Supervisor Approval</h3>
            <p className="text-xs text-slate-500 font-medium mt-1 mb-4">
              Cashiers require Manager or Admin authorization to process returns & exchanges.
            </p>

            {supervisorError && (
              <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs font-bold mb-3">
                {supervisorError}
              </div>
            )}

            <form onSubmit={handleVerifySupervisor} className="space-y-3">
              <input
                type="password"
                placeholder="Enter Supervisor PIN"
                className="w-full text-center text-xl tracking-[0.3em] font-mono font-black py-2.5 px-4 border-2 border-slate-200 rounded-xl outline-none focus:border-emerald-600"
                value={supervisorPin}
                onChange={e => setSupervisorPin(e.target.value)}
                autoFocus
                required
              />

              {/* Mini Keypad */}
              <div className="grid grid-cols-3 gap-1.5 pt-1">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setSupervisorPin(p => p + n)}
                    className="py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-black rounded-lg text-sm"
                  >
                    {n}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setSupervisorPin('')}
                  className="py-2.5 bg-red-50 hover:bg-red-100 text-red-600 font-bold rounded-lg text-xs"
                >
                  C
                </button>
                <button
                  type="button"
                  onClick={() => setSupervisorPin(p => p + '0')}
                  className="py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-black rounded-lg text-sm"
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={() => setSupervisorPin(p => p.slice(0, -1))}
                  className="py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs"
                >
                  ⌫
                </button>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowSupervisorModal(false);
                    setPendingAction(null);
                    if (!authorizedSupervisor) {
                      if (onClose) onClose();
                      else window.dispatchEvent(new CustomEvent('navigate', { detail: 'pos' }));
                    }
                  }}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-md shadow-emerald-600/30"
                >
                  Approve Refund
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
