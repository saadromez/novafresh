import React, { useState, useEffect } from 'react';
import { Tag, Plus, Calendar, Percent, X, Package, RefreshCw } from 'lucide-react';
import SearchableSelect from './SearchableSelect';

export default function PromotionsView({ products, currentUser }: any) {
  const [promotions, setPromotions] = useState<any[]>([])
  const [internalProducts, setInternalProducts] = useState<any[]>(products || [])
  const [showAdd, setShowAdd] = useState(false)
  const [newPromo, setNewPromo] = useState({ name: '', start_date: '', end_date: '', discount_type: 'PERCENT', discount_value: '' })
  const [selectedItems, setSelectedItems] = useState<any[]>([])

  const parseDateInput = (d: any) => {
    if (!d) return '';
    const s = String(d).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const dt = new Date(s);
    if (!isNaN(dt.getTime())) {
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, '0');
      const day = String(dt.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
    return s.split('T')[0];
  };

  useEffect(() => {
    loadPromotions()
    // Listen for cloud sync completion to live-refresh campaigns
    const handleSync = () => loadPromotions();
    // @ts-ignore
    window.ipcRenderer?.on('sync-completed', handleSync);
    return () => {
      // @ts-ignore
      window.ipcRenderer?.off('sync-completed', handleSync);
    };
  }, [])

  useEffect(() => {
    if (Array.isArray(products) && products.length > 0) {
      setInternalProducts(products);
    } else {
      // @ts-ignore
      window.db?.invoke?.('get-products-advanced')?.then((prods: any) => {
        if (Array.isArray(prods) && prods.length > 0) setInternalProducts(prods);
      }).catch(() => {});
    }
  }, [products]);

  const [loading, setLoading] = useState(true)

  const loadPromotions = async () => {
    setLoading(true)
    try {
      // @ts-ignore
      let data = await window.db.invoke('get-promotions-advanced', true)
      if (Array.isArray(data) && data.length > 0) {
        setPromotions(data)
      } else {
        // Fallback check
        // @ts-ignore
        const legacy = await window.db.invoke('get-promotions').catch(() => [])
        if (Array.isArray(legacy) && legacy.length > 0) {
          setPromotions(legacy)
        } else if (Array.isArray(data)) {
          setPromotions(data)
        }
      }
    } catch (err) {
      console.error('Failed to load promotions:', err)
      try {
        // @ts-ignore
        const legacy = await window.db.invoke('get-promotions').catch(() => [])
        if (Array.isArray(legacy)) setPromotions(legacy)
      } catch (_) {}
    } finally {
      setLoading(false)
    }
  }

  const handleAddItem = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (!e.target.value) return;
    const prodId = Number(e.target.value);
    if (selectedItems.find(i => i.product_id === prodId)) return;
    
    const product = (internalProducts || []).find((p: any) => p.id === prodId)
    if (!product) return;
    setSelectedItems([...selectedItems, { product_id: prodId, name: product.name, barcode: product.barcode || '', required_qty: 1 }])
    e.target.value = ''
  }

  const updateItemQty = (id: number, qty: number) => {
    setSelectedItems(selectedItems.map(i => i.product_id === id ? { ...i, required_qty: Math.max(1, qty) } : i))
  }
  
  const removeItem = (id: number) => {
    setSelectedItems(selectedItems.filter(i => i.product_id !== id))
  }

  const [editingPromoId, setEditingPromoId] = useState<number | null>(null)

  const handleEditPromo = (promo: any) => {
    setNewPromo({
      name: promo.name,
      start_date: parseDateInput(promo.start_date),
      end_date: parseDateInput(promo.end_date),
      discount_type: promo.discount_type || 'PERCENT',
      discount_value: String(promo.discount_value || '')
    })
    setSelectedItems(promo.items || [])
    setEditingPromoId(promo.id)
    setShowAdd(true)
  }

  const [isActivating, setIsActivating] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isActivating) return;
    setIsActivating(true);

    try {
      const payload = {
        name: newPromo.name.trim(),
        start_date: newPromo.start_date,
        end_date: newPromo.end_date,
        discount_type: newPromo.discount_type || 'PERCENT',
        discount_value: Number(newPromo.discount_value) || 0,
        items: selectedItems
      };

      if (editingPromoId) {
        // @ts-ignore
        const res = await window.db.invoke('update-promotion-advanced', {
          ...payload,
          id: editingPromoId
        });
        if (res && res.error) {
          alert('Failed to update promotion: ' + res.error);
          return;
        }
      } else {
        // @ts-ignore
        const res = await window.db.invoke('add-promotion-advanced', payload);
        if (res && res.error) {
          alert('Failed to create promotion: ' + res.error);
          return;
        }
      }

      setShowAdd(false);
      setEditingPromoId(null);
      setNewPromo({ name: '', start_date: '', end_date: '', discount_type: 'PERCENT', discount_value: '' });
      setSelectedItems([]);
      await loadPromotions();
    } catch (err: any) {
      console.error('Error activating promotion campaign:', err);
      alert('Could not activate campaign: ' + (err?.message || err));
    } finally {
      setIsActivating(false);
    }
  };

  const isAdmin = currentUser?.role?.toLowerCase() === 'admin';

  const deletePromo = async (id: number) => {
    if (!isAdmin) {
      alert('Security Restriction: Only System Administrators can delete records. Managers and other users are not authorized.');
      return;
    }
    if (!confirm('Are you sure you want to delete this promotion?')) return;
    // @ts-ignore
    await window.db.invoke('delete-promotion', id);
    loadPromotions();
  };

  const togglePromoStatus = async (id: number, currentStatus: string) => {
    const newStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    // @ts-ignore
    await window.db.invoke('update-promotion-status', { id, status: newStatus });
    loadPromotions();
  }

  return (
    <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 h-full flex flex-col relative z-0">
      <div className="flex justify-between items-center mb-6 shrink-0">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-brand-dark">Promotions Engine</h2>
            {!loading && (
              <span className="text-xs font-black bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full border border-emerald-300">
                {promotions.length} {promotions.length === 1 ? 'Campaign' : 'Campaigns'}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500">Manage date-based discounts, combos, and targeted marketing campaigns.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            type="button"
            onClick={loadPromotions} 
            className="p-2.5 rounded-full border border-gray-200 hover:bg-gray-50 text-gray-600 transition-colors cursor-pointer"
            title="Refresh Promotions"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin text-brand-primary' : ''} />
          </button>
          <button 
            type="button"
            onClick={() => {
              setEditingPromoId(null);
              setSelectedItems([]);
              setNewPromo({ name: '', start_date: '', end_date: '', discount_type: 'PERCENT', discount_value: '' });
              setShowAdd(true);
            }} 
            className="bg-brand-primary text-white px-5 py-2.5 rounded-full font-bold flex items-center hover:bg-brand-secondary transition-colors cursor-pointer shadow-sm"
          >
            <Plus size={18} className="mr-2" /> New Campaign
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-12 text-gray-400">
          <RefreshCw size={36} className="animate-spin text-brand-primary mb-3" />
          <p className="font-bold text-base text-gray-700">Loading Promotion Campaigns...</p>
          <p className="text-xs text-gray-400 mt-1">Retrieving active deals and marketing campaigns.</p>
        </div>
      ) : promotions.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-12 bg-gray-50/60 rounded-3xl border-2 border-dashed border-gray-200">
          <div className="w-16 h-16 rounded-2xl bg-brand-primary/10 flex items-center justify-center text-brand-primary mb-4">
            <Tag size={32} />
          </div>
          <h3 className="text-lg font-black text-brand-dark mb-1">No Promotion Campaigns Configured</h3>
          <p className="text-sm text-gray-500 max-w-md mb-6">
            Create a promotional campaign to offer discounts on specific products or storewide deals across all POS terminals.
          </p>
          <button 
            type="button" 
            onClick={() => {
              setEditingPromoId(null);
              setSelectedItems([]);
              setNewPromo({ name: '', start_date: '', end_date: '', discount_type: 'PERCENT', discount_value: '' });
              setShowAdd(true);
            }} 
            className="bg-brand-primary hover:bg-brand-secondary text-white font-bold px-6 py-3 rounded-full flex items-center gap-2 shadow-sm transition-all cursor-pointer"
          >
            <Plus size={18} /> Create Your First Campaign
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto pb-6">
          {promotions.map((promo: any) => (
            <div key={promo.id} className="p-6 border border-brand-accent/30 rounded-3xl bg-brand-primary/5 relative overflow-hidden flex flex-col group">
              <div className="absolute top-0 right-0 p-4 opacity-10"><Tag size={64}/></div>
              
              <div className="flex justify-between items-start mb-4 relative z-10">
                <div className="flex flex-col">
                   <h3 className="font-bold text-xl text-brand-dark max-w-full">{promo.name}</h3>
                   <button onClick={() => togglePromoStatus(promo.id, promo.status)} className={`mt-1 text-[10px] font-bold px-2 py-0.5 rounded w-max ${promo.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-500'}`}>
                     {promo.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE'}
                   </button>
                 </div>
                {(currentUser?.role === 'Admin' || currentUser?.role === 'Manager') && (
                  <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => handleEditPromo(promo)} className="text-gray-400 hover:text-brand-primary bg-white p-2 rounded-lg border border-gray-100 shadow-sm transition-all hover:bg-brand-primary/5">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                    {isAdmin && (
                      <button onClick={() => deletePromo(promo.id)} title="Delete Promotion (Admin Only)" className="text-red-400 hover:text-red-600 bg-white p-2 rounded-lg border border-gray-100 shadow-sm transition-all hover:bg-red-50">
                        <X size={16} />
                      </button>
                    )}
                  </div>
                )}
              </div>
              
              <div className="space-y-3 flex-1 relative z-10">
                <div className="flex items-center text-sm font-bold text-brand-primary">
                  <Percent size={16} className="mr-2" /> 
                  {promo.discount_type === 'PERCENT' ? `${promo.discount_value}% OFF` : `Rs. ${promo.discount_value} OFF`}
                </div>
                <div className="flex items-center text-sm text-gray-600">
                  <Calendar size={16} className="mr-2 opacity-50" /> 
                  {promo.start_date ? String(promo.start_date).split(/[T ]/)[0] : 'Always'} - {promo.end_date ? String(promo.end_date).split(/[T ]/)[0] : 'Ongoing'}
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-brand-accent/20 relative z-10">
                <p className="text-xs font-bold text-gray-500 uppercase mb-2">
                  {promo.items && promo.items.length > 0 ? `Targeted Items (${promo.items.length})` : 'Storewide (All Products)'}
                </p>
                {promo.items && promo.items.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {promo.items.map((i: any, idx: number) => (
                      <span key={i.id || idx} className="text-[10px] font-bold bg-white text-brand-dark px-2 py-1 rounded-md shadow-sm border border-gray-100">
                        {i.required_qty > 1 ? `${i.required_qty}x ` : ''}{i.product_name || `Product #${i.product_id}`}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-1 rounded-md border border-emerald-200">
                    Storewide Bill Discount (Applies to all items)
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl max-w-4xl w-full p-8 shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center mb-6 shrink-0">
              <h3 className="font-bold text-brand-dark text-xl flex items-center"><Tag size={24} className="mr-3 text-brand-primary"/> Create Promotion Campaign</h3>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-red-500"><X size={24}/></button>
            </div>
            
            <form onSubmit={handleAdd} className="flex flex-col flex-1 min-h-0 overflow-y-auto pr-2">
              <div className="grid grid-cols-2 gap-6 mb-6">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Campaign Name</label>
                  <input type="text" className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-brand-primary bg-white text-lg font-bold" value={newPromo.name} onChange={e => setNewPromo({...newPromo, name: e.target.value})} required autoFocus placeholder="e.g., Summer Sale 2024" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Start Date</label>
                    <input type="date" className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-brand-primary bg-white font-bold" value={newPromo.start_date} onChange={e => setNewPromo({...newPromo, start_date: e.target.value})} required />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">End Date</label>
                    <input type="date" className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-brand-primary bg-white font-bold" value={newPromo.end_date} onChange={e => setNewPromo({...newPromo, end_date: e.target.value})} required />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Discount Type</label>
                  <select className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-brand-primary bg-white font-bold" value={newPromo.discount_type} onChange={e => setNewPromo({...newPromo, discount_type: e.target.value})}>
                    <option value="PERCENT">Percentage (%)</option>
                    <option value="FLAT">Flat Amount (Rs.)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Discount Value</label>
                  <input type="number" className="w-full border-2 border-brand-primary/30 rounded-xl px-4 py-3 outline-none focus:border-brand-primary bg-emerald-50 text-emerald-900 font-black text-xl" value={newPromo.discount_value} onChange={e => setNewPromo({...newPromo, discount_value: e.target.value})} required placeholder="e.g., 15" />
                </div>
              </div>

              <div className="flex-1 bg-gray-50 border border-gray-200 rounded-2xl p-6 mb-6">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h4 className="font-bold text-brand-dark">Target Items & Triggers (Optional)</h4>
                    <p className="text-xs text-gray-400">Leave empty to apply as a Storewide Discount to all customer bills!</p>
                  </div>
                  <div className="w-64">
                    <SearchableSelect 
                      items={internalProducts} 
                      value={""} 
                      placeholder="+ Add Product to Campaign"
                      onChange={(val: any) => handleAddItem({ target: { value: val } } as any)} 
                    />
                  </div>
                </div>
                
                {selectedItems.length === 0 ? (
                  <div className="text-center py-6 text-emerald-700 bg-emerald-50/60 rounded-xl border border-emerald-200">
                    <Package size={28} className="mx-auto mb-1.5 text-emerald-600" />
                    <p className="font-bold text-sm">Storewide Campaign Active</p>
                    <p className="text-xs text-emerald-600/80 mt-0.5">No individual items selected. This discount will automatically apply across all sales!</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedItems.map(item => (
                      <div key={item.product_id} className="flex items-center justify-between bg-white p-3 rounded-xl border border-gray-200 shadow-sm">
                        <span className="font-bold text-brand-dark flex-1">{item.name}</span>
                        <div className="flex items-center space-x-3">
                          <label className="text-xs font-bold text-gray-500">Min. Qty Trigger:</label>
                          <input type="number" min="1" className="w-20 border border-gray-200 rounded-lg px-2 py-1 outline-none text-center font-bold" value={item.required_qty} onChange={e => updateItemQty(item.product_id, Number(e.target.value))} />
                          <button type="button" onClick={() => removeItem(item.product_id)} className="text-gray-400 hover:text-red-500 p-1"><X size={16}/></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end space-x-3 shrink-0">
                <button type="button" onClick={() => setShowAdd(false)} className="px-6 py-3 rounded-xl font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 cursor-pointer">Cancel</button>
                <button 
                  type="submit" 
                  disabled={isActivating}
                  className="px-6 py-3 rounded-xl font-bold text-white bg-brand-primary hover:bg-brand-secondary shadow-lg shadow-brand-primary/30 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isActivating ? (
                    <>
                      <RefreshCw size={18} className="animate-spin" /> Activating...
                    </>
                  ) : (
                    'Activate Campaign'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}