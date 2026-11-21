import React, { useState, useEffect } from 'react';
import { CreditCard, AlertTriangle, UserPlus, DollarSign, CheckCircle } from 'lucide-react';

export default function CreditMgmtView({ currentUser }: any) {
  const [accounts, setAccounts] = useState<any[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [newAccount, setNewAccount] = useState({ customer_id: '', credit_limit: 0 })
  const [showSettle, setShowSettle] = useState<any>(null)
  const [settleAmount, setSettleAmount] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    // @ts-ignore
    const accts = await window.db.invoke('get-credit-accounts')
    // @ts-ignore
    const custs = await window.db.getCustomers()
    setAccounts(accts || [])
    setCustomers(custs || [])
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newAccount.customer_id) return alert('Select customer')
    try {
      // @ts-ignore
      await window.db.invoke('create-credit-account', { customer_id: Number(newAccount.customer_id), credit_limit: Number(newAccount.credit_limit) })
      setShowAdd(false)
      loadData()
    } catch (e: any) {
      alert(e.message)
    }
  }

  const handleSettle = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!settleAmount || Number(settleAmount) <= 0) return
    // @ts-ignore
    await window.db.invoke('settle-credit', { account_id: showSettle.id, amount: Number(settleAmount), notes: 'Manual Settlement' })
    setShowSettle(null)
    setSettleAmount('')
    loadData()
  }

  const totalReceivables = accounts.reduce((a, b) => a + b.balance, 0)
  const riskyAccounts = accounts.filter(a => a.balance >= a.credit_limit * 0.9)

  return (
    <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 h-full flex flex-col">
      <div className="flex justify-between items-center mb-6 shrink-0">
        <div>
          <h2 className="text-xl font-bold text-brand-dark">Credit & Receivables</h2>
          <p className="text-sm text-gray-500">Track outstanding customer balances and settle debts.</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="bg-brand-primary text-white px-5 py-2.5 rounded-full font-bold flex items-center hover:bg-brand-secondary transition-colors">
          <UserPlus size={18} className="mr-2" /> New Credit Account
        </button>
      </div>

      <div className="grid grid-cols-4 gap-6 mb-6 shrink-0">
        <div className="col-span-1 p-6 bg-red-50 border border-red-100 rounded-3xl">
          <p className="text-red-700 font-bold text-xs uppercase tracking-wider mb-2">Total Receivables</p>
          <p className="text-3xl font-black text-red-900">Rs. {totalReceivables.toLocaleString()}</p>
        </div>
        <div className="col-span-3 p-6 bg-gray-50 border border-gray-200 rounded-3xl flex items-center justify-between">
          <div>
            <h3 className="font-bold text-brand-dark mb-1 flex items-center"><AlertTriangle size={16} className={`mr-2 ${riskyAccounts.length > 0 ? 'text-red-500' : 'text-amber-500'}`}/> Credit Risk Warning</h3>
            <p className="text-sm text-gray-500">
              {riskyAccounts.length > 0 ? `You have ${riskyAccounts.length} accounts near or over their credit limit.` : 'You currently have no risky accounts.'}
            </p>
          </div>
        </div>
      </div>

      {showAdd && (
        <div className="mb-6 p-6 bg-gray-50 border border-gray-200 rounded-2xl shrink-0">
          <h3 className="font-bold text-brand-dark mb-4 text-sm">Create Credit Account</h3>
          <form onSubmit={handleCreate} className="grid grid-cols-3 gap-4">
            <div className="col-span-1">
              <label className="block text-xs font-bold text-gray-600 mb-1">Customer</label>
              <select className="w-full border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-brand-primary bg-white" value={newAccount.customer_id} onChange={e => setNewAccount({...newAccount, customer_id: e.target.value})} required>
                <option value="">Select...</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>)}
              </select>
            </div>
            <div className="col-span-1">
              <label className="block text-xs font-bold text-gray-600 mb-1">Credit Limit (Rs)</label>
              <input type="number" className="w-full border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-brand-primary bg-white" value={newAccount.credit_limit || ''} onChange={e => setNewAccount({...newAccount, credit_limit: Number(e.target.value)})} required />
            </div>
            <div className="col-span-1 flex items-end justify-end space-x-2">
              <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-xl font-bold text-gray-500 bg-white border border-gray-200">Cancel</button>
              <button type="submit" className="px-4 py-2 rounded-xl font-bold text-white bg-brand-primary">Create Account</button>
            </div>
          </form>
        </div>
      )}

      {showSettle && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
            <h3 className="text-xl font-bold text-brand-dark mb-2">Settle Balance</h3>
            <p className="text-sm text-gray-500 mb-6">Receive payment for {showSettle.customer_name}. Outstanding: Rs. {showSettle.balance}</p>
            <form onSubmit={handleSettle}>
              <div className="mb-6">
                <label className="block text-sm font-bold text-gray-700 mb-2">Amount Received (Rs.)</label>
                <input type="number" className="w-full border-2 border-brand-primary/20 rounded-xl px-4 py-3 outline-none focus:border-brand-primary text-xl font-black text-brand-dark bg-gray-50" value={settleAmount} onChange={e => setSettleAmount(e.target.value)} required autoFocus />
              </div>
              <div className="flex space-x-3">
                <button type="button" onClick={() => setShowSettle(null)} className="flex-1 px-4 py-3 rounded-xl font-bold text-gray-500 bg-gray-100">Cancel</button>
                <button type="submit" className="flex-1 px-4 py-3 rounded-xl font-bold text-white bg-emerald-600 shadow-lg shadow-emerald-600/30">Confirm Settlement</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto border border-gray-100 rounded-2xl bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 sticky top-0 shadow-sm z-10">
            <tr>
              <th className="p-4 font-bold text-gray-500 border-b border-gray-100">Customer Name</th>
              <th className="p-4 font-bold text-gray-500 border-b border-gray-100">Contact</th>
              <th className="p-4 font-bold text-gray-500 border-b border-gray-100">Credit Limit</th>
              <th className="p-4 font-bold text-gray-500 border-b border-gray-100 text-right">Outstanding Balance</th>
              <th className="p-4 font-bold text-gray-500 border-b border-gray-100 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {accounts.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-12">
                  <CreditCard size={48} className="mx-auto mb-3 opacity-20 text-gray-400" />
                  <p className="font-medium text-gray-500">No active credit accounts found.</p>
                </td>
              </tr>
            ) : (
              accounts.map((a: any) => (
                <tr key={a.id} className="hover:bg-gray-50/50">
                  <td className="p-4 font-bold text-brand-dark">{a.customer_name}</td>
                  <td className="p-4 text-gray-500">{a.phone}</td>
                  <td className="p-4 text-gray-500 font-medium">Rs. {a.credit_limit}</td>
                  <td className="p-4 text-right">
                    <span className={`font-black text-lg ${a.balance >= a.credit_limit * 0.9 ? 'text-red-600' : 'text-brand-dark'}`}>Rs. {a.balance.toLocaleString()}</span>
                  </td>
                  <td className="p-4 text-right">
                    <button onClick={() => setShowSettle(a)} disabled={a.balance <= 0} className="px-4 py-1.5 bg-brand-primary/10 text-brand-primary font-bold rounded-lg hover:bg-brand-primary hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                      Settle
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}