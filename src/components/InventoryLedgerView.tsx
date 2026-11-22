import React, { useState, useEffect } from 'react'
import { FileText, ArrowDown, ArrowUp, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react'
import { formatSriLankaDateTime } from '../utils/dateUtils'

export default function InventoryLedgerView({ products, loadProducts, onRestock, currentUser }: any) {
  const isAdmin = currentUser?.role?.toLowerCase() === 'admin';
  const [selectedProduct, setSelectedProduct] = useState<number | null>(null)
  const [ledger, setLedger] = useState<any[]>([])
  const [isRefreshing, setIsRefreshing] = useState(false)
  
  const [adjType, setAdjType] = useState('ADJUSTMENT')
  const [adjQty, setAdjQty] = useState(0)
  const [adjReason, setAdjReason] = useState('')

  useEffect(() => {
    loadLedger()

    const handleSync = () => {
      loadLedger()
      if (typeof loadProducts === 'function') loadProducts()
    }

    // @ts-ignore
    window.ipcRenderer?.on('sync-data-updated', handleSync)
    // @ts-ignore
    window.ipcRenderer?.on('products-updated', handleSync)
    // @ts-ignore
    window.ipcRenderer?.on('sync-completed', handleSync)
    window.addEventListener('focus', handleSync)

    return () => {
      // @ts-ignore
      window.ipcRenderer?.off('sync-data-updated', handleSync)
      // @ts-ignore
      window.ipcRenderer?.off('products-updated', handleSync)
      // @ts-ignore
      window.ipcRenderer?.off('sync-completed', handleSync)
      window.removeEventListener('focus', handleSync)
    }
  }, [selectedProduct])

  const loadLedger = async () => {
    // @ts-ignore
    const data = await window.ipcRenderer.invoke('get-inventory-ledger', selectedProduct)
    setLedger(data || [])
  }

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      // @ts-ignore
      await window.ipcRenderer.invoke('trigger-sync', true)
      await loadLedger()
      if (typeof loadProducts === 'function') await loadProducts()
    } catch (_) {}
    setIsRefreshing(false)
  }

  const handleAdjustment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedProduct) return alert('Select a product first')
    if (adjQty === 0) return alert('Quantity cannot be 0')
    
    // @ts-ignore
    await window.ipcRenderer.invoke('adjust-stock', {
      productId: selectedProduct,
      type: adjType,
      qty: Number(adjQty),
      reason: adjReason,
      user: 'Admin Manager'
    })
    
    setAdjQty(0)
    setAdjReason('')
    loadLedger()
    loadProducts()
  }

  const getTypeColor = (type: string) => {
    switch(type) {
      case 'GRN': return 'text-emerald-600 bg-emerald-50 border-emerald-200'
      case 'SALE': return 'text-blue-600 bg-blue-50 border-blue-200'
      case 'RETURN': return 'text-amber-600 bg-amber-50 border-amber-200'
      case 'DAMAGE': return 'text-red-600 bg-red-50 border-red-200'
      case 'ADJUSTMENT': return 'text-purple-600 bg-purple-50 border-purple-200'
      default: return 'text-gray-600 bg-gray-50 border-gray-200'
    }
  }


  return (
    <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 h-full flex flex-col">
      <div className="flex justify-between items-center mb-6 shrink-0">
        <div>
          <h2 className="text-xl font-bold text-brand-dark">Inventory Ledger & Restock</h2>
          <p className="text-sm text-gray-500">Track all movements, process direct restocks, and update pricing.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            title="Force pull latest ledger and catalog from cloud"
            className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-60 font-bold text-xs rounded-xl transition-all cursor-pointer border border-slate-200"
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin text-emerald-600' : ''} />
            <span>{isRefreshing ? 'Refreshing...' : 'Force Cloud Refresh'}</span>
          </button>
          <button onClick={onRestock} className="bg-emerald-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-emerald-700 shadow-lg shadow-emerald-600/30 flex items-center transition-all hover:-translate-y-0.5 cursor-pointer">
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
            Direct Restock (GRN)
          </button>
        </div>
      </div>

      <div className="flex space-x-6 flex-1 min-h-0">
        
        { /* Left: Product Selection & Adjustment Form */ }
        <div className="w-1/3 flex flex-col space-y-6">
          
          <div className="bg-gray-50 p-5 rounded-2xl border border-gray-200">
            <h3 className="font-bold text-brand-dark mb-3 text-sm">Select Product</h3>
            <select 
              className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-brand-primary bg-white font-medium"
              value={selectedProduct || ''}
              onChange={(e) => setSelectedProduct(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">All Products</option>
              {products.map((p:any) => <option key={p.id} value={p.id}>{p.name} (Stock: {p.stock})</option>)}
            </select>
            
            {selectedProduct && (
              <div className="mt-4 p-4 bg-white rounded-xl border border-gray-100 shadow-sm flex justify-between items-center">
                <span className="text-gray-500 font-medium">Current Stock</span>
                <span className="text-2xl font-black text-brand-dark">{products.find((p:any)=>p.id===selectedProduct)?.stock || 0}</span>
              </div>
            )}
          </div>

          <div className={`p5 rounded-2xl border transition-all ${selectedProduct ? 'bg-white border-gray-200 shadow-sm' : 'bg-gray-50 border-gray-100 opacity-50 pointer-events-none'}`}>
            <h3 className="font-bold text-brand-dark mb-4 text-sm flex items-center">
              <AlertCircle size={16} className="mr-2 text-brand-primary" />
              Manual Stock Adjustment
            </h3>
            <form onSubmit={handleAdjustment} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Adjustment Type</label>
                <select 
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-brand-primary bg-gray-50 text-sm"
                  value={adjType}
                  onChange={(e) => setAdjType(e.target.value)}
                >
                  <option value="ADJUSTMENT">General Adjustment (+/-)</option>
                  <option value="DAMAGE">Damaged / Expired (-)</option>
                  <option value="RETURN">Manual Return (+)</option>
                </select>
              </div>
              <div className="flex space-x-3">
                <div className="flex-1">
                  <label className="block text-xs font-bold text-gray-600 mb-1">Quantity</label>
                  <input 
                    type="number"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-brand-primary bg-gray-50 font-mono"
                    value={adjQty || ''}
                    onChange={(e) => setAdjQty(Number(e.target.value))}
                    placeholder="+/- 0"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="bloci/text-xs font-bold text-gray-600 mb-1">Reason / Reference</label>
                <input 
                  type="text"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-brand-primary bg-gray-50 text-sm"
                  value={adjReason}
                  onChange={(e) => setAdjReason(e.target.value)}
                  placeholder="E.g., Warehouse recount, Damaged in transit"
                  required
                />
              </div>
              <button type="submit" className="w-full bg-brand-primary text-white py-3 rounded-xl font-bold hover:bg-brand-secondary transition-colors text-sm shadow-sm">
                Commit Adjustment
              </button>
            </form>
          </div>

        </div>

        { /* Right: Ledger Table */ }
        <div className="flex-1 border border-gray-200 rounded-2xl overflow-hidden flex flex-col bg-white">
          <div className="px-5 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center shrink-0">
            <h3 className="font-bold text-brand-dark text-sm flex items-center">
              <FileText size={16} className="mr-2 text-gray-400" />
              Stock Movement History
            </h3>
            <span className="text-xs text-gray-500 font-medium">Immutable Double-Entry Ledger</span>
          </div>
          
          <div className="flex-1 overflow-y-auto p-0">
            <table className="w-full text-left text-sm">
              <thead className="bg-white sticky top-0 shadow-sm">
                <tr>
                  <th className="p-4 font-bold text-gray-500 border-b border-gray-100">Date</th>
                  {!selectedProduct && <th className="p-4 font-bold text-gray-500 border-b border-gray-100">Product</th>}
                  <th className="p-4 font-bold text-gray-500 border-b border-gray-100">Transaction</th>
                  <th className="p-4 font-bold text-gray-500 border-b border-gray-100">Reason / Ref</th>
                  <th className="p-4 font-bold text-gray-500 border-b border-gray-100 text-right">Change</th>
                  <th className="p-4 font-bold text-gray-500 border-b border-gray-100 text-right">Balance</th>
                  <th className="p-4 font-bold text-gray-500 border-b border-gray-100 text-right">User</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {ledger.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-gray-400 font-medium">
                      No ledger entries found.
                    </td>
                  </tr>
                ) : (
                  ledger.map((entry, idx) => (
                    <tr key={idx} className="hover:bg-gray-50/50 group">
                      <td className="p-4 text-gray-600 whitespace-nowrap font-mono text-xs">{formatSriLankaDateTime(entry.created_at)}</td>
                      {!selectedProduct && <td className="p-4 font-bold text-brand-dark">{entry.product_name}</td>}
                      <td className="p-4">
                        <span className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black tracking-wider uppercase border ${getTypeColor(entry.transaction_type)}`}>
                          {entry.transaction_type}
                        </span>
                      </td>
                      <td className="p-4 text-gray-600 font-medium max-w-[200px] truncate">{entry.notes || '-'}</td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end font-bold">
                          {entry.qty_change > 0 ? (
                            <span className="text-emerald-600 flex items-center"><ArrowUp size={14} className="mr-1"/>{entry.qty_change}</span>
                          ) : (
                            <span className="text-red-500 flex items-center"><ArrowDown size={14} className="mr-1"/>{Math.abs(entry.qty_change)}</span>
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-right font-black text-brand-dark text-base">{entry.balance_after}</td>
                      <td className="p-4 text-right text-gray-400 text-xs font-bold flex items-center justify-end space-x-2">
                        <span>{entry.created_by}</span>
                        {isAdmin && (
                          <button onClick={async () => {
                            if (!isAdmin) {
                              alert('Security Restriction: Only System Administrators can delete records. Managers and other users are not authorized.');
                              return;
                            }
                            if (!confirm('Are you sure you want to delete this ledger entry? Product stock will NOT be automatically reverted. Please make a manual adjustment instead if you want to fix stock.')) return;
                            // @ts-ignore
                            await window.ipcRenderer.invoke('delete-ledger', entry.id);
                            loadLedger();
                          }} className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 bg-red-50 p-1.5 rounded-lg border border-red-100 shadow-sm transition-all" title="Delete Ledger Entry (Admin Only)">
                             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )
                }
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  )
}
