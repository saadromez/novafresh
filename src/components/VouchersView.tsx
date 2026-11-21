import React, { useState, useEffect } from 'react';
import { Tag, Plus, CheckCircle, XCircle, Search, AlertTriangle, Trash2 } from 'lucide-react';

export default function VouchersView({ currentUser }: any) {
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState('FIXED');
  const [expiry, setExpiry] = useState('');
  const [selectedCats, setSelectedCats] = useState<number[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    // @ts-ignore
    const v = await window.db.invoke('get-vouchers-full');
    // @ts-ignore
    const c = await window.db.getCategories();
    setVouchers(v || []);
    setCategories(c || []);
  };

  const [editingVoucherId, setEditingVoucherId] = useState<number | null>(null);

  const handleEditVoucher = (v: any) => {
    setName(v.name || '');
    setCode(v.code);
    setAmount(v.amount.toString());
    setType(v.type || 'FIXED');
    setExpiry(v.expiry_date ? new Date(v.expiry_date).toISOString().split('T')[0] : '');
    setSelectedCats(v.restrictions.filter((r:any) => r.type === 'CATEGORY').map((r:any) => r.target_id));
    setEditingVoucherId(v.id);
    setShowModal(true);
  }

  const isAdmin = currentUser?.role?.toLowerCase() === 'admin';

  const handleDeleteVoucher = async (id: number) => {
    if (!isAdmin) {
      alert('Security Restriction: Only System Administrators can delete records. Managers and other users are not authorized.');
      return;
    }
    if (!confirm('Are you sure you want to delete this voucher?')) return;
    // @ts-ignore
    await window.db.invoke('delete-voucher', id);
    loadData();
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || !amount) return;

    const payload = {
      name,
      code: code.toUpperCase(),
      amount: Number(amount),
      type,
      expiry_date: expiry || null,
      restrictions: selectedCats.map(cid => ({ type: 'CATEGORY', target_id: cid }))
    };

    if (editingVoucherId) {
      // @ts-ignore
      await window.db.invoke('update-voucher-full', { ...payload, id: editingVoucherId });
    } else {
      // @ts-ignore
      await window.db.invoke('create-voucher-full', payload);
    }
    setShowModal(false);
    setEditingVoucherId(null);
    setName('');
      setCode('');
    setAmount('');
    setSelectedCats([]);
    setExpiry('');
    loadData();
  };

  const toggleCat = (id: number) => {
    if (selectedCats.includes(id)) setSelectedCats(selectedCats.filter(c => c !== id));
    else setSelectedCats([...selectedCats, id]);
  };

  const toggleStatus = async (id: number, currentStatus: string) => {
    const newStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    // @ts-ignore
    await window.db.invoke('update-voucher-status', { id, status: newStatus });
    loadData();
  };

  const totalIssued = vouchers.reduce((acc, v) => acc + v.amount, 0);
  const totalClaimed = vouchers.reduce((acc, v) => acc + (v.claimed_amount || 0), 0);
  const totalOutstanding = totalIssued - totalClaimed;

  return (
    <div className="bg-[#FAFAFA] p-6 h-full flex flex-col">
      <div className="flex justify-between items-center mb-6 shrink-0">
        <div>
          <h2 className="text-2xl font-black text-brand-dark tracking-tight">Gift Cards & Vouchers</h2>
          <p className="text-xs font-medium text-gray-500 mt-1">Manage issued vouchers, track claims, and set restrictions.</p>
        </div>
        <button onClick={() => setShowModal(true)} className="px-5 py-2.5 bg-brand-primary text-white text-sm font-bold rounded-xl shadow-lg shadow-brand-primary/20 hover:scale-105 transition-transform flex items-center">
          <Plus size={16} className="mr-2" /> Issue Voucher
        </button>
      </div>

      <div className="grid grid-cols-3 gap-6 shrink-0 mb-6">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-center">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Total Value Issued</p>
          <p className="text-2xl font-black text-brand-dark">Rs. {totalIssued.toLocaleString()}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-center relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10"><CheckCircle size={60} className="text-brand-secondary" /></div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Total Claimed</p>
          <p className="text-2xl font-black text-brand-secondary">Rs. {totalClaimed.toLocaleString()}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-center relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10"><AlertTriangle size={60} className="text-brand-primary" /></div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Outstanding Liability</p>
          <p className="text-2xl font-black text-brand-primary">Rs. {totalOutstanding.toLocaleString()}</p>
        </div>
      </div>

      <div className="flex-1 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
        <div className="px-5 py-3 border-b border-gray-50 bg-gray-50/50 flex justify-between items-center shrink-0">
          <div className="text-xs font-bold text-gray-400 uppercase tracking-widest w-1/4">Voucher Code</div>
          <div className="text-xs font-bold text-gray-400 uppercase tracking-widest w-1/4">Value & Claimed</div>
          <div className="text-xs font-bold text-gray-400 uppercase tracking-widest w-1/4">Restrictions</div>
          <div className="text-xs font-bold text-gray-400 uppercase tracking-widest w-1/4 text-right">Status</div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {vouchers.map(v => (
            <div key={v.id} className="flex items-center px-3 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors group">
              <div className="w-1/4">
                <p className="font-black text-sm text-brand-dark">{v.code}</p>
                {v.name && <p className="text-xs text-gray-500 font-medium">{v.name}</p>}
              </div>
              <div className="w-1/4">
                <p className="text-sm font-bold text-brand-dark">Rs. {v.amount.toLocaleString()} <span className="text-[10px] font-bold text-gray-400 bg-gray-200 px-1.5 py-0.5 rounded">{v.type}</span></p>
                <p className="text-xs font-semibold text-brand-secondary mt-0.5">Claimed: Rs. {(v.claimed_amount || 0).toLocaleString()}</p>
              </div>
              <div className="w-1/4 flex flex-wrap gap-1">
                {v.restrictions.length === 0 ? (
                  <span className="text-[10px] font-bold text-gray-400">None (Store-wide)</span>
                ) : (
                  v.restrictions.map((r: any) => (
                    <span key={r.id} className="text-[9px] font-bold bg-brand-primary/10 text-brand-primary px-2 py-0.5 rounded-full">
                      {r.type}: {categories.find(c => c.id === r.target_id)?.name || r.target_id}
                    </span>
                  ))
                )}
              </div>
              <div className="w-1/4 flex items-center justify-end space-x-2">
                <button onClick={() => toggleStatus(v.id, v.status)} className={`text-[10px] font-bold px-3 py-1 rounded-full ${v.status === 'ACTIVE' ? 'bg-brand-secondary/10 text-brand-secondary hover:bg-brand-secondary/20' : v.status === 'CLAIMED' ? 'bg-gray-100 text-gray-400' : 'bg-red-50 text-red-500 hover:bg-red-100'} transition-colors`}>
                  {v.status}
                </button>
                <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100">
                  {(currentUser?.role === 'Admin' || currentUser?.role === 'Manager') && (
                    <button onClick={() => handleEditVoucher(v)} className="p-1.5 text-gray-400 hover:text-brand-primary bg-white rounded-md border border-gray-100 shadow-sm transition-all hover:bg-brand-primary/5">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                  )}
                  {isAdmin && (
                    <button onClick={() => handleDeleteVoucher(v.id)} title="Delete Voucher (Admin Only)" className="p-1.5 text-gray-400 hover:text-red-500 bg-white rounded-md border border-gray-100 shadow-sm transition-all hover:bg-red-50">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {vouchers.length === 0 && (
            <div className="p-8 text-center text-sm font-medium text-gray-400">No vouchers issued yet.</div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
            <h3 className="text-lg font-black text-brand-dark mb-6">Issue New Voucher</h3>
            <form onSubmit={handleSave}>
              <div className="mb-4">
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Voucher Name</label>
                <input type="text" className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-brand-primary text-sm font-bold text-brand-dark bg-gray-50" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Summer Promo" />
              </div>
              <div className="mb-4">
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Voucher Code</label>
                <input type="text" className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-brand-primary text-sm font-bold text-brand-dark bg-gray-50 uppercase" value={code} onChange={e => setCode(e.target.value)} required placeholder="e.g. SUMMER50" />
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Type</label>
                  <select className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none text-sm font-bold text-brand-dark bg-gray-50 focus:border-brand-primary" value={type} onChange={e => setType(e.target.value)}>
                    <option value="FIXED">Fixed Amount</option>
                    <option value="PERCENTAGE">Percentage (%)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Value</label>
                  <input type="number" className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-brand-primary text-sm font-bold text-brand-dark bg-gray-50" value={amount} onChange={e => setAmount(e.target.value)} required placeholder="0.00" />
                </div>
              </div>
              
              <div className="mb-4">
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Category Restrictions (Optional)</label>
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 border border-gray-100 rounded-xl bg-gray-50/50">
                  {categories.map(c => (
                    <button type="button" key={c.id} onClick={() => toggleCat(c.id)} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border ${selectedCats.includes(c.id) ? 'bg-brand-primary text-white border-brand-primary' : 'bg-white text-gray-500 border-gray-200 hover:border-brand-primary/50'}`}>
                      {c.name}
                    </button>
                  ))}
                  {categories.length === 0 && <span className="text-[10px] text-gray-400 p-2">No categories available</span>}
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Expiry Date (Optional)</label>
                <input type="date" className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-brand-primary text-sm font-medium text-brand-dark bg-white" value={expiry} onChange={e => setExpiry(e.target.value)} />
              </div>

              <div className="flex space-x-3">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-3 rounded-xl font-bold text-sm text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors">Cancel</button>
                <button type="submit" className="flex-1 px-4 py-3 rounded-xl font-bold text-sm text-white bg-brand-primary shadow-lg shadow-brand-primary/30 hover:scale-105 transition-transform">Issue Voucher</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
