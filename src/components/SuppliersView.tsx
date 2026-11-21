import React, { useState, useEffect } from 'react';
import { Users, Plus, Phone, Mail, MapPin, Receipt, CheckCircle, Clock, X, AlertTriangle, ArrowRight } from 'lucide-react';

export default function SuppliersView({ suppliers, currentUser, loadSuppliers }: any) {
  const [showAdd, setShowAdd] = useState(false)
  const [newSupplier, setNewSupplier] = useState({ name: '', contact: '', email: '', address: '', opening_balance: 0 })
  const [editingSupplierId, setEditingSupplierId] = useState<number | null>(null)
  const [activeSupplier, setActiveSupplier] = useState<any>(null)
  const [ledger, setLedger] = useState<any[]>([])
  
  const [showPay, setShowPay] = useState(false)
  const [payData, setPayData] = useState({ method: 'CASH', amount: '', reference_no: '', cheque_date: '' })

  useEffect(() => {
    if (activeSupplier) loadLedger()
  }, [activeSupplier])

  const loadLedger = async () => {
    if (!activeSupplier) return;
    // @ts-ignore
    const data = await window.db.invoke('get-supplier-ledger', activeSupplier.id)
    setLedger(data || [])
  }

  const isAdmin = currentUser?.role?.toLowerCase() === 'admin';

  const handleDeleteSupplier = async (id: number) => {
    if (!isAdmin) {
      alert('Security Restriction: Only System Administrators can delete records. Managers and other users are not authorized.');
      return;
    }
    if (!confirm('Are you sure you want to delete this supplier? Associated records might be affected.')) return;
    // @ts-ignore
    await window.db.invoke('delete-supplier', id);
    if (loadSuppliers) loadSuppliers();
    if (activeSupplier?.id === id) setActiveSupplier(null);
  };

  const handleEditSupplier = (s: any) => {
    setNewSupplier({ name: s.name, contact: s.contact, email: s.email, address: s.address, opening_balance: s.opening_balance })
    setEditingSupplierId(s.id)
    setShowAdd(true)
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editingSupplierId) {
        // @ts-ignore
        await window.db.invoke('update-supplier', { ...newSupplier, id: editingSupplierId })
      } else {
        // @ts-ignore
        if (window.db?.invoke) {
          await window.db.invoke('add-supplier', newSupplier)
        } else {
          await window.db.addSupplier(newSupplier)
        }
      }
      setShowAdd(false)
      setEditingSupplierId(null)
      setNewSupplier({ name: '', contact: '', email: '', address: '', opening_balance: 0 })
      if (loadSuppliers) loadSuppliers()
    } catch (err: any) {
      console.error('Failed to save supplier:', err);
      alert('Failed to save supplier: ' + (err.message || String(err)));
    }
  }

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!payData.amount) return;
    // @ts-ignore
    await window.db.invoke('add-supplier-payment', { 
      supplier_id: activeSupplier.id, 
      method: payData.method, 
      amount: Number(payData.amount), 
      reference_no: payData.reference_no, 
      cheque_date: payData.method === 'CHEQUE' ? payData.cheque_date : null 
    })
    setShowPay(false)
    setPayData({ method: 'CASH', amount: '', reference_no: '', cheque_date: '' })
    loadLedger()
  }

  const updateCheque = async (id: number, status: string) => {
    // @ts-ignore
    await window.db.invoke('update-cheque-status', { payment_id: id, status })
    loadLedger()
  }

  // Calculate Running Balance for active supplier
  let runningBalance = activeSupplier?.opening_balance || 0;
  const ledgerWithBalance = ledger.map(l => {
    if (l.type === 'PURCHASE_ORDER') runningBalance += l.amount;
    else if (l.type.startsWith('PAYMENT') && l.status !== 'BOUNCED') runningBalance -= l.amount;
    return { ...l, balance: runningBalance }
  }).reverse()

  const pendingCheques = ledger.filter(l => l.type === 'PAYMENT_CHEQUE' && l.status === 'PENDING')

  return (
    <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 h-full flex flex-col">
      <div className="flex justify-between items-center mb-6 shrink-0">
        <div>
          <h2 className="text-xl font-bold text-brand-dark">Supplier Payables CRM</h2>
          <p className="text-sm text-gray-500">Manage vendors, ledger balances, and cheque payments.</p>
        </div>
        {!activeSupplier ? (
          <button onClick={() => setShowAdd(true)} className="bg-brand-primary text-white px-5 py-2.5 rounded-full font-bold flex items-center hover:bg-brand-secondary transition-colors">
            <Plus size={18} className="mr-2" /> Add Supplier
          </button>
        ) : (
          <button onClick={() => setActiveSupplier(null)} className="bg-gray-100 text-gray-600 px-5 py-2.5 rounded-full font-bold flex items-center hover:bg-gray-200 transition-colors">
            Back to Directory
          </button>
        )}
      </div>

      {!activeSupplier ? (
        <>
          {showAdd && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-3xl max-w-2xl w-full p-8 shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-brand-dark text-xl flex items-center"><Users size={24} className="mr-3 text-brand-primary"/> {editingSupplierId ? 'Edit Supplier' : 'Add New Supplier'}</h3>
                <button onClick={() => { setShowAdd(false); setEditingSupplierId(null); }} className="text-gray-400 hover:text-red-500"><X size={24}/></button>
              </div>
              <form onSubmit={handleAdd} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Supplier Name</label>
                    <input type="text" className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-brand-primary bg-white text-lg font-bold" value={newSupplier.name} onChange={e => setNewSupplier({...newSupplier, name: e.target.value})} required autoFocus />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Phone / Contact</label>
                    <input type="text" className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-brand-primary bg-white text-lg font-bold" value={newSupplier.contact} onChange={e => setNewSupplier({...newSupplier, contact: e.target.value})} required />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Email</label>
                    <input type="email" className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-brand-primary bg-gray-50" value={newSupplier.email} onChange={e => setNewSupplier({...newSupplier, email: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Opening Balance (Owed)</label>
                    <input type="number" className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-brand-primary bg-gray-50" value={newSupplier.opening_balance} onChange={e => setNewSupplier({...newSupplier, opening_balance: Number(e.target.value)})} />
                  </div>
                </div>
                <button type="submit" className="w-full mt-4 bg-brand-primary text-white py-4 rounded-xl font-bold text-lg hover:bg-brand-secondary transition-colors shadow-lg shadow-brand-primary/30">Save Supplier</button>
              </form>
            </div>
          </div>
        )}

          <div className="grid grid-cols-3 gap-6 flex-1 overflow-y-auto content-start">
            {suppliers.map((s: any) => (
              <div key={s.id} onClick={() => setActiveSupplier(s)} className="p-6 bg-white border border-gray-200 rounded-2xl shadow-sm hover:border-brand-primary cursor-pointer transition-all hover:shadow-md flex flex-col group">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 rounded-full bg-brand-primary/10 flex items-center justify-center text-brand-primary group-hover:bg-brand-primary group-hover:text-white transition-colors">
                    <Users size={24} />
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="opacity-0 group-hover:opacity-100 flex items-center space-x-1" onClick={e => e.stopPropagation()}>
                      {(currentUser?.role === 'Admin' || currentUser?.role === 'Manager') && (
                        <button onClick={() => handleEditSupplier(s)} className="p-1.5 text-gray-400 hover:text-brand-primary bg-white rounded-md border border-gray-100 hover:border-brand-primary transition-all">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </button>
                      )}
                      {isAdmin && (
                        <button onClick={() => handleDeleteSupplier(s.id)} title="Delete Supplier (Admin Only)" className="p-1.5 text-gray-400 hover:text-red-500 bg-white rounded-md border border-gray-100 hover:border-red-500 transition-all">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      )}
                    </div>
                    <span className="px-2.5 py-1 bg-gray-100 text-gray-500 rounded-md text-xs font-bold">V-{String(s.id).padStart(3, '0')}</span>
                  </div>
                </div>
                <h3 className="font-bold text-lg text-brand-dark mb-1">{s.name}</h3>
                
                <div className="space-y-2 mt-4 flex-1">
                  <div className="flex items-center text-sm text-gray-600">
                    <Phone size={14} className="mr-2 text-gray-400" /> {s.contact || 'No phone'}
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    <Mail size={14} className="mr-2 text-gray-400" /> {s.email || 'No email'}
                  </div>
                </div>
                <div className="mt-6 pt-4 border-t border-gray-100 flex justify-between items-center text-brand-primary font-bold text-sm">
                  View Ledger & Payments <ArrowRight size={16} />
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="flex-1 flex gap-8 min-h-0">
          
          {/* Supplier Info & Pay */}
          <div className="w-1/3 flex flex-col space-y-6">
            <div className="p-6 bg-gray-50 border border-gray-200 rounded-3xl">
              <div className="flex items-center mb-4">
                <div className="w-12 h-12 bg-white border border-gray-200 rounded-xl flex items-center justify-center mr-4 shadow-sm">
                  <Users size={24} className="text-brand-primary" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-brand-dark leading-tight">{activeSupplier.name}</h3>
                  <p className="text-sm text-gray-500">V-{String(activeSupplier.id).padStart(3, '0')}</p>
                </div>
              </div>
              
              <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm text-center mb-6">
                <p className="text-gray-500 font-bold text-xs uppercase tracking-wider mb-1">Total Outstanding</p>
                <p className={`text-3xl font-black ${runningBalance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  Rs. {runningBalance.toLocaleString()}
                </p>
              </div>

              <button onClick={() => setShowPay(true)} className="w-full bg-brand-primary text-white py-4 rounded-2xl font-bold text-lg hover:bg-brand-secondary transition-colors shadow-lg shadow-brand-primary/30 flex items-center justify-center">
                <Receipt size={20} className="mr-2"/> Make Payment
              </button>
            </div>

            {pendingCheques.length > 0 && (
              <div className="flex-1 bg-amber-50 border border-amber-200 rounded-3xl p-6 overflow-y-auto">
                <h3 className="font-bold text-amber-900 mb-4 flex items-center">
                  <AlertTriangle size={18} className="mr-2" /> Pending Cheques
                </h3>
                <div className="space-y-3">
                  {pendingCheques.map(c => (
                    <div key={c.id} className="bg-white p-4 rounded-xl border border-amber-200 shadow-sm">
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-bold text-brand-dark">Rs. {c.amount.toLocaleString()}</span>
                        <span className="text-xs font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded">Dated: {new Date(c.ref).toLocaleDateString()}</span>
                      </div>
                      <p className="text-xs text-gray-500 mb-3">Ref: {c.ref}</p>
                      <div className="flex space-x-2">
                        <button onClick={() => updateCheque(c.id, 'CLEARED')} className="flex-1 bg-emerald-500 text-white text-xs font-bold py-2 rounded-lg hover:bg-emerald-600">Mark Cleared</button>
                        <button onClick={() => updateCheque(c.id, 'BOUNCED')} className="flex-1 bg-red-500 text-white text-xs font-bold py-2 rounded-lg hover:bg-red-600">Bounced</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Ledger Table */}
          <div className="flex-1 flex flex-col bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-sm">
            <div className="px-6 py-5 border-b border-gray-200 bg-gray-50 flex justify-between items-center shrink-0">
              <h3 className="font-bold text-brand-dark text-base flex items-center">
                <Clock size={18} className="mr-2 text-gray-400" /> Account Ledger
              </h3>
            </div>
            <div className="flex-1 overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-white sticky top-0 shadow-sm z-10">
                  <tr>
                    <th className="p-4 font-bold text-gray-500 border-b border-gray-100">Date</th>
                    <th className="p-4 font-bold text-gray-500 border-b border-gray-100">Transaction</th>
                    <th className="p-4 font-bold text-gray-500 border-b border-gray-100 text-right">Debit (Owed)</th>
                    <th className="p-4 font-bold text-gray-500 border-b border-gray-100 text-right">Credit (Paid)</th>
                    <th className="p-4 font-bold text-gray-500 border-b border-gray-100 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {ledgerWithBalance.map((l: any, i: number) => (
                    <tr key={i} className="hover:bg-gray-50/50">
                      <td className="p-4 text-gray-500 text-xs">{new Date(l.date).toLocaleString()}</td>
                      <td className="p-4">
                        <span className="font-bold text-brand-dark block">
                          {l.type === 'PURCHASE_ORDER' ? 'Purchase Order' : l.type.replace('PAYMENT_', 'Payment: ')}
                        </span>
                        <span className="text-xs text-gray-400">Ref: {l.ref || '-'} {l.status !== 'CLEARED' && l.status !== 'APPROVED' ? `(${l.status})` : ''}</span>
                      </td>
                      <td className="p-4 text-right font-medium text-red-500">
                        {l.type === 'PURCHASE_ORDER' ? `Rs. ${l.amount.toLocaleString()}` : '-'}
                      </td>
                      <td className="p-4 text-right font-medium text-emerald-600">
                        {l.type.startsWith('PAYMENT') ? `Rs. ${l.amount.toLocaleString()}` : '-'}
                      </td>
                      <td className="p-4 text-right font-black text-brand-dark">
                        Rs. {l.balance.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50/50">
                    <td colSpan={4} className="p-4 text-right font-bold text-gray-500">Opening Balance</td>
                    <td className="p-4 text-right font-black text-brand-dark">Rs. {activeSupplier.opening_balance?.toLocaleString() || 0}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {showPay && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-brand-dark">Make Payment</h3>
              <button onClick={() => setShowPay(false)} className="text-gray-400 hover:text-red-500"><X size={24}/></button>
            </div>
            <form onSubmit={handlePay}>
              <div className="mb-4">
                <label className="block text-sm font-bold text-gray-700 mb-2">Payment Method</label>
                <select className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none font-bold bg-gray-50 focus:border-brand-primary" value={payData.method} onChange={e => setPayData({...payData, method: e.target.value})}>
                  <option value="CASH">Cash</option>
                  <option value="BANK">Bank Transfer</option>
                  <option value="CHEQUE">Cheque</option>
                </select>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-bold text-gray-700 mb-2">Amount (Rs.)</label>
                <input type="number" className="w-full border-2 border-brand-primary/20 rounded-xl px-4 py-3 outline-none focus:border-brand-primary text-xl font-black bg-gray-50" value={payData.amount} onChange={e => setPayData({...payData, amount: e.target.value})} required autoFocus />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-bold text-gray-700 mb-2">Reference No. (Bank Ref / Cheque No)</label>
                <input type="text" className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-brand-primary bg-gray-50" value={payData.reference_no} onChange={e => setPayData({...payData, reference_no: e.target.value})} required={payData.method !== 'CASH'} />
              </div>
              {payData.method === 'CHEQUE' && (
                <div className="mb-6">
                  <label className="block text-sm font-bold text-gray-700 mb-2">Cheque Post-Date</label>
                  <input type="date" className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-brand-primary bg-gray-50" value={payData.cheque_date} onChange={e => setPayData({...payData, cheque_date: e.target.value})} required />
                </div>
              )}
              <button type="submit" className="w-full mt-2 bg-brand-primary text-white py-4 rounded-xl font-bold text-lg hover:bg-brand-secondary transition-colors shadow-lg shadow-brand-primary/30">
                Confirm Payment
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}