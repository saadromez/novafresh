import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Calendar, DollarSign, Search, Banknote, Pencil, X } from 'lucide-react';

const CATEGORIES = ['General', 'Utilities', 'Rent', 'Salaries', 'Supplies', 'Maintenance', 'Marketing', 'Other'];
const EMPTY = { amount: '', category: 'General', description: '' };

export default function ExpensesView({ currentUser }: any) {
  const [expenses, setExpenses] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState(EMPTY);
  const [search, setSearch] = useState('');

  const load = async () => {
    // @ts-ignore
    const data = await window.db.invoke('get-expenses', {});
    setExpenses(data || []);
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => { setEditing(null); setForm({ ...EMPTY }); setShowModal(true); };
  const openEdit = (ex: any) => {
    setEditing(ex);
    setForm({ amount: String(ex.amount), category: ex.category, description: ex.description || '' });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (Number(form.amount) <= 0) return alert('Enter a valid amount');
    if (editing) {
      // @ts-ignore
      await window.db.invoke('update-expense', { id: editing.id, amount: Number(form.amount), category: form.category, description: form.description });
    } else {
      // @ts-ignore
      await window.db.invoke('add-expense', { amount: Number(form.amount), category: form.category, description: form.description, created_by: currentUser?.username || 'Admin' });
    }
    setShowModal(false);
    load();
  };

  const isAdmin = currentUser?.role?.toLowerCase() === 'admin';

  const handleDelete = async (id: number) => {
    if (!isAdmin) {
      alert('Security Restriction: Only System Administrators can delete records. Managers and other users are not authorized.');
      return;
    }
    if (!confirm('Delete this expense?')) return;
    // @ts-ignore
    await window.db.invoke('delete-expense', id);
    load();
  };

  const filtered = expenses.filter(ex =>
    ex.description?.toLowerCase().includes(search.toLowerCase()) ||
    ex.category?.toLowerCase().includes(search.toLowerCase())
  );

  const total = filtered.reduce((a, b) => a + b.amount, 0);
  const canEdit = currentUser?.role === 'Admin' || currentUser?.role === 'Manager';

  return (
    <div className="bg-[#FAFAFA] p-6 h-full flex flex-col">
      <div className="flex justify-between items-center mb-4 shrink-0">
        <div>
          <h2 className="text-2xl font-black text-brand-dark tracking-tight">Expense Management</h2>
          <p className="text-xs font-medium text-gray-500 mt-1">Track and manage all operational expenses.</p>
        </div>
        <button onClick={openAdd} className="bg-brand-primary text-white px-5 py-2.5 rounded-full font-bold flex items-center hover:bg-opacity-90 transition-colors shadow-md shadow-brand-primary/30 text-sm">
          <Plus size={16} className="mr-2" /> Record Expense
        </button>
      </div>

      <div className="flex gap-3 mb-4 shrink-0">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input type="text" placeholder="Search by category or description..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-full text-sm focus:border-brand-primary outline-none bg-white" />
        </div>
        <div className="bg-red-50 text-red-600 px-5 py-2 rounded-full font-bold flex items-center border border-red-100 text-sm">
          <Banknote size={16} className="mr-2" /> Total: Rs. {total.toLocaleString()}
        </div>
      </div>

      <div className="flex-1 bg-white rounded-2xl border border-gray-200 overflow-hidden flex flex-col shadow-sm">
        <div className="grid grid-cols-[1fr_1fr_2fr_1fr_80px] px-5 py-3 border-b border-gray-100 bg-gray-50 shrink-0">
          {['Date', 'Category', 'Description', 'Amount', ''].map((h, i) => (
            <div key={i} className={`text-[10px] font-bold text-gray-400 uppercase tracking-widest ${i === 3 ? 'text-right' : ''}`}>{h}</div>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-16 text-gray-400">
              <DollarSign size={40} className="mb-3 opacity-20" />
              <p className="font-bold">No expenses recorded yet.</p>
            </div>
          ) : filtered.map(ex => (
            <div key={ex.id} className="grid grid-cols-[1fr_1fr_2fr_1fr_80px] items-center px-5 py-3 hover:bg-gray-50 transition-colors group">
              <div className="text-xs text-gray-500 flex items-center">
                <Calendar size={12} className="mr-1.5 text-gray-300" />
                {new Date(ex.date).toLocaleDateString()}
              </div>
              <div>
                <span className="text-[10px] font-bold px-2 py-1 bg-brand-primary/10 text-brand-primary rounded-md uppercase tracking-wider">
                  {ex.category}
                </span>
              </div>
              <div className="text-sm text-gray-600 font-medium truncate pr-4">{ex.description || '-'}</div>
              <div className="text-sm font-black text-red-500 text-right">Rs. {ex.amount.toLocaleString()}</div>
              <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {canEdit && (
                  <button onClick={() => openEdit(ex)} className="p-1.5 text-gray-400 hover:text-brand-primary bg-white rounded-lg border border-gray-100 shadow-sm transition-colors">
                    <Pencil size={13} />
                  </button>
                )}
                {isAdmin && (
                  <button onClick={() => handleDelete(ex.id)} title="Delete Expense (Admin Only)" className="p-1.5 text-gray-400 hover:text-red-500 bg-white rounded-lg border border-gray-100 shadow-sm transition-colors">
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex justify-between items-center">
              <h2 className="text-lg font-black text-brand-dark flex items-center">
                <DollarSign size={20} className="mr-2 text-brand-primary" />
                {editing ? 'Edit Expense' : 'Record Expense'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-red-500 p-1 rounded-lg hover:bg-red-50 transition-colors">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Amount (Rs.)</label>
                <input type="number" step="0.01" className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-brand-primary font-black text-xl text-brand-dark" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} required autoFocus />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Category</label>
                <select className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-brand-primary font-bold text-brand-dark bg-white" value={form.category} onChange={e => setForm({...form, category: e.target.value})}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Description</label>
                <input type="text" className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-brand-primary font-medium text-brand-dark" value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="e.g. Paid electricity bill" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-3 rounded-xl font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors">Cancel</button>
                <button type="submit" className="flex-1 py-3 rounded-xl font-bold text-white bg-brand-primary hover:bg-opacity-90 transition-colors shadow-lg shadow-brand-primary/30">
                  {editing ? 'Save Changes' : 'Save Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
