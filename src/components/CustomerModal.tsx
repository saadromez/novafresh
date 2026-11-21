import React, { useState, useEffect } from 'react';
import { Search, User, UserPlus, X } from 'lucide-react';

export default function CustomerModal({ onSelect, onClose }: any) {
  const [customers, setCustomers] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [newCust, setNewCust] = useState({ name: '', phone: '' })

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    // @ts-ignore
    setCustomers(await window.db.getCustomers() || [])
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    // @ts-ignore
    await window.db.addCustomer(newCust)
    setShowAdd(false)
    load()
  }

  const filtered = customers.filter(c => (c.name || '').toLowerCase().includes(search.toLowerCase()) || (c.phone || '').includes(search))

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[80vh] overflow-hidden">
        <div className="p-6 border-b border-gray-200 flex justify-between items-center bg-gray-50">
          <h2 className="text-xl font-bold text-brand-dark">Link Customer to Ticket</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-red-500"><X size={24}/></button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto">
          {!showAdd ? (
            <>
              <div className="flex space-x-3 mb-6">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input type="text" placeholder="Search by name or phone..." className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-200 focus:border-brand-primary outline-none text-sm bg-gray-50" value={search} onChange={e => setSearch(e.target.value)} autoFocus />
                </div>
                <button onClick={() => setShowAdd(true)} className="bg-brand-primary text-white px-5 rounded-xl font-bold flex items-center hover:bg-brand-secondary transition-colors">
                  <UserPlus size={18} className="mr-2" /> New
                </button>
              </div>

              <div className="space-y-2">
                {filtered.map(c => (
                  <div key={c.id} onClick={() => onSelect(c)} className="p-4 border border-gray-200 rounded-2xl flex items-center justify-between cursor-pointer hover:border-brand-primary hover:shadow-sm transition-all bg-white group">
                    <div className="flex items-center">
                      <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center mr-4 group-hover:bg-brand-primary/10 group-hover:text-brand-primary">
                        <User size={18} />
                      </div>
                      <div>
                        <p className="font-bold text-brand-dark flex items-center gap-2">
                          <span>{c.name}</span>
                          {(c.points > 0 || c.points === 0) && (
                            <span className="text-[10px] font-black text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300">
                              {c.points ?? 0} pts
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-gray-500">{c.phone || 'No phone'}</p>
                      </div>
                    </div>
                    <button className="text-sm font-bold text-brand-primary opacity-0 group-hover:opacity-100 transition-opacity">Select</button>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="max-w-md mx-auto">
              <h3 className="font-bold text-brand-dark mb-4 text-center">Register New Customer</h3>
              <form onSubmit={handleAdd} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">Full Name</label>
                  <input type="text" className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-brand-primary bg-gray-50" value={newCust.name} onChange={e => setNewCust({...newCust, name: e.target.value})} required autoFocus />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">Phone Number</label>
                  <input type="text" className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-brand-primary bg-gray-50" value={newCust.phone} onChange={e => setNewCust({...newCust, phone: e.target.value})} required />
                </div>
                <div className="flex space-x-3 pt-2">
                  <button type="button" onClick={() => setShowAdd(false)} className="flex-1 py-3 rounded-xl font-bold text-gray-500 bg-gray-100">Cancel</button>
                  <button type="submit" className="flex-1 py-3 rounded-xl font-bold text-white bg-brand-primary">Save Customer</button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}