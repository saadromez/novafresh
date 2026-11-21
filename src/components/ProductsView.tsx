import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  Package, Plus, Search, Layers, Briefcase, Trash2, X, Scale, 
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2 
} from 'lucide-react';
import { PRODUCT_UNITS, formatQuantityWithUnit } from '../utils/units';

const EMPTY_PRODUCT = {
  name: '', price: 0, wholesale_price: 0, cost_price: 0, stock: 0,
  barcode: '', item_code: '', low_stock_alert: 2,
  category_id: '', sub_category_id: '', brand_id: '', supplier_id: '',
  image_data: '', size: '', color: '', expiry_date: '', branch_id: 'ALL',
  unit: 'pc',
  allow_price_override: 1
}

export default function ProductsView({ products, loadProducts, currentUser }: any) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [showAdd, setShowAdd] = useState(false)
  const [showAddCat, setShowAddCat] = useState(false)
  const [showAddBrand, setShowAddBrand] = useState(false)
  const [activeTab, setActiveTab] = useState<'products' | 'categories' | 'brands'>('products')
  const [categories, setCategories] = useState<any[]>([])
  const [brands, setBrands] = useState<any[]>([])
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [branches, setBranches] = useState<any[]>([])
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>('ALL')
  const [newProduct, setNewProduct] = useState({ ...EMPTY_PRODUCT })
  const [editingProductId, setEditingProductId] = useState<number | null>(null)
  const [newCat, setNewCat] = useState({ name: '', parent_id: '' })
  const [newBrand, setNewBrand] = useState('')
  const [activeProduct, setActiveProduct] = useState<any>(null)

  const isAdmin = currentUser?.role?.toLowerCase() === 'admin';

  useEffect(() => { loadMeta() }, [])

  const loadMeta = async () => {
    // @ts-ignore
    setCategories(await window.db.getCategories() || [])
    // @ts-ignore
    setBrands(await window.db.invoke('get-brands') || [])
    // @ts-ignore
    setSuppliers(await window.db.getSuppliers() || [])
    // @ts-ignore
    if (window.db?.getBranches) {
      // @ts-ignore
      setBranches(await window.db.getBranches() || [])
    }
  }

  const handleDeleteProduct = async (id: number) => {
    if (!isAdmin) {
      alert('Security Restriction: Only System Administrators can delete records. Managers and other users are not authorized.');
      return;
    }
    if (!confirm('Delete this product?')) return;
    // @ts-ignore
    await window.db.invoke('delete-product', id);
    setActiveProduct(null);
    if (loadProducts) loadProducts();
  };

  const handleEditProduct = (p?: any) => {
    const target = (p && !p.nativeEvent) ? p : activeProduct
    if (!target) return
    setNewProduct({
      name: target.name, price: target.price, wholesale_price: (target.wholesale_price && Number(target.wholesale_price) !== Number(target.price)) ? target.wholesale_price : 0, cost_price: target.cost_price, stock: target.stock,
      barcode: target.barcode || '', item_code: target.item_code || '',
      low_stock_alert: (target.low_stock_alert !== undefined && target.low_stock_alert !== null) ? target.low_stock_alert : 2,
      category_id: target.category_id || '', sub_category_id: '',
      brand_id: target.brand_id || '', supplier_id: target.supplier_id || '',
      image_data: target.image_data || '', size: target.size || '',
      color: target.color || '', expiry_date: target.expiry_date || '',
      branch_id: target.branch_id || 'ALL',
      unit: (target.unit && !/^\d+$/.test(String(target.unit).trim())) ? target.unit : 'pc',
      allow_price_override: (target.allow_price_override !== 0 && target.allow_price_override !== false) ? 1 : 0
    })
    setEditingProductId(target.id)
    setShowAdd(true)
    setActiveProduct(null)
  }

  const [isSaving, setIsSaving] = useState(false)

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    try {
      const safeUnit = (newProduct.unit && !/^\d+$/.test(String(newProduct.unit).trim())) ? newProduct.unit : 'pc'
      const payload = {
        ...newProduct,
        wholesale_price: Number(newProduct.wholesale_price || 0),
        branch_id: newProduct.branch_id || 'ALL',
        category_id: Number(newProduct.sub_category_id || newProduct.category_id || 1),
        brand_id: newProduct.brand_id ? Number(newProduct.brand_id) : null,
        supplier_id: newProduct.supplier_id ? Number(newProduct.supplier_id) : null,
        unit: safeUnit,
        allow_price_override: Number(newProduct.allow_price_override) !== 0 ? 1 : 0
      }
      if (editingProductId) {
        // @ts-ignore
        await window.db.invoke('update-product', { ...payload, id: editingProductId })
      } else {
        // @ts-ignore
        await window.db.invoke('add-product', payload)
      }
      setShowAdd(false)
      setEditingProductId(null)
      setNewProduct({ ...EMPTY_PRODUCT })
      if (loadProducts) loadProducts()
    } catch (err: any) {
      alert('Error saving product: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSaving(false)
    }
  }

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    // @ts-ignore
    await window.db.invoke('add-category', { name: newCat.name, parent_id: newCat.parent_id ? Number(newCat.parent_id) : null })
    setNewCat({ name: '', parent_id: '' })
    setShowAddCat(false)
    loadMeta()
  }

  const handleAddBrand = async (e: React.FormEvent) => {
    e.preventDefault()
    // @ts-ignore
    await window.db.invoke('add-brand', newBrand)
    setNewBrand('')
    setShowAddBrand(false)
    loadMeta()
  }

  const deleteCategory = async (id: number) => {
    if (!isAdmin) {
      alert('Security Restriction: Only System Administrators can delete records. Managers and other users are not authorized.');
      return;
    }
    if (!confirm('Are you sure you want to delete this category?')) return;
    // @ts-ignore
    await window.db.invoke('delete-category', id);
    loadMeta();
  };

  const deleteBrand = async (id: number) => {
    if (!isAdmin) {
      alert('Security Restriction: Only System Administrators can delete records. Managers and other users are not authorized.');
      return;
    }
    if (!confirm('Are you sure you want to delete this brand?')) return;
    // @ts-ignore
    await window.db.invoke('delete-brand', id);
    loadMeta();
  };

  const filtered = useMemo(() => {
    const q = (search || '').toLowerCase().trim();
    return (products || []).filter((p: any) => {
      const matchesSearch = !q ||
        (p.name || '').toLowerCase().includes(q) ||
        (p.barcode || '').includes(q) ||
        (p.plu || '').includes(q) ||
        (p.item_code || '').toLowerCase().includes(q) ||
        (p.category_name || '').toLowerCase().includes(q);
      const matchesBranch = 
        selectedBranchFilter === 'ALL' || 
        !p.branch_id || 
        p.branch_id === 'ALL' || 
        p.branch_id === selectedBranchFilter;
      return matchesSearch && matchesBranch;
    });
  }, [products, search, selectedBranchFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [search, selectedBranchFilter, pageSize]);

  const parentCategories = useMemo(() => {
    const map = new Map<string, any>();
    for (const c of categories) {
      if (!c.parent_id && c.name) {
        const key = c.name.trim().toLowerCase();
        if (!map.has(key)) map.set(key, c);
      }
    }
    return Array.from(map.values());
  }, [categories]);
  const inp = 'w-full border border-gray-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-brand-primary/20 font-medium text-brand-dark bg-gray-50'

  return (
    <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-gray-200 h-full flex flex-col relative z-0 overflow-hidden">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-3 shrink-0">
        <div>
          <h2 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span>Product Master</span>
            <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
              {filtered.length.toLocaleString()} Items
            </span>
          </h2>
          <p className="text-xs text-slate-500 font-medium">Manage catalog, categories and brands</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 rounded-xl p-1 text-xs">
            <button onClick={() => setActiveTab('products')} className={`px-3 py-1.5 rounded-lg font-black transition-all ${activeTab === 'products' ? 'bg-white shadow-xs text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>Products</button>
            <button onClick={() => setActiveTab('categories')} className={`px-3 py-1.5 rounded-lg font-black transition-all ${activeTab === 'categories' ? 'bg-white shadow-xs text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>Categories</button>
            <button onClick={() => setActiveTab('brands')} className={`px-3 py-1.5 rounded-lg font-black transition-all ${activeTab === 'brands' ? 'bg-white shadow-xs text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>Brands</button>
          </div>
          {activeTab === 'products' && (
            <button onClick={() => { setEditingProductId(null); setNewProduct({ ...EMPTY_PRODUCT }); setShowAdd(true) }} className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white px-3.5 py-1.5 rounded-xl font-black text-xs flex items-center shadow-sm shadow-emerald-600/30 transition-all cursor-pointer">
              <Plus size={15} className="mr-1.5" /> New Product
            </button>
          )}
          {activeTab === 'categories' && (
            <button onClick={() => setShowAddCat(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-1.5 rounded-xl font-black text-xs flex items-center shadow-sm transition-all cursor-pointer">
              <Plus size={15} className="mr-1.5" /> New Category
            </button>
          )}
          {activeTab === 'brands' && (
            <button onClick={() => setShowAddBrand(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-1.5 rounded-xl font-black text-xs flex items-center shadow-sm transition-all cursor-pointer">
              <Plus size={15} className="mr-1.5" /> New Brand
            </button>
          )}
        </div>
      </div>

      {/* Add / Edit Product Modal */}
      {showAdd && createPortal((
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-brand-dark text-xl flex items-center">
                <Package size={24} className="mr-3 text-brand-primary"/>
                {editingProductId ? 'Edit Product' : 'New Product'}
              </h3>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-red-500"><X size={24}/></button>
            </div>

            <form onSubmit={handleAddProduct} className="space-y-6">
              {/* Image + Name */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Product Name *</label>
                  <input type="text" className={inp} value={newProduct.name} onChange={e => setNewProduct({...newProduct, name: e.target.value})} required autoFocus />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Product Image</label>
                  <div className="flex items-center gap-2">
                    {newProduct.image_data && <img src={newProduct.image_data} alt="" className="w-10 h-10 object-cover rounded-lg border border-gray-200 shrink-0" />}
                    <input type="file" accept="image/*" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-500 bg-gray-50" onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) { const r = new FileReader(); r.onloadend = () => setNewProduct({...newProduct, image_data: r.result as string}); r.readAsDataURL(file) }
                    }} />
                  </div>
                </div>
              </div>

              {/* Barcode / Item Code / Size / Color */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Barcode</label>
                  <div className="flex">
                    <input type="text" className="w-full border border-gray-200 rounded-l-xl px-3 py-3 outline-none font-medium text-brand-dark bg-gray-50 text-sm" value={newProduct.barcode} onChange={e => setNewProduct({...newProduct, barcode: e.target.value})} />
                    <button type="button" onClick={() => setNewProduct({...newProduct, barcode: '8' + Math.floor(Math.random()*100000000000)})} className="bg-gray-200 px-3 rounded-r-xl text-xs font-bold text-gray-600 hover:bg-gray-300">Gen</button>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Item Code</label>
                  <div className="flex">
                    <input type="text" className="w-full border border-gray-200 rounded-l-xl px-3 py-3 outline-none font-medium text-brand-dark bg-gray-50 text-sm" value={newProduct.item_code} onChange={e => setNewProduct({...newProduct, item_code: e.target.value})} />
                    <button type="button" onClick={() => setNewProduct({...newProduct, item_code: 'ITM-' + Math.floor(Math.random()*10000)})} className="bg-gray-200 px-3 rounded-r-xl text-xs font-bold text-gray-600 hover:bg-gray-300">Gen</button>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Size (Optional)</label>
                  <input type="text" placeholder="e.g. XL, 3-6M" className={inp} value={newProduct.size} onChange={e => setNewProduct({...newProduct, size: e.target.value})} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Color (Optional)</label>
                  <input type="text" placeholder="e.g. Red" className={inp} value={newProduct.color} onChange={e => setNewProduct({...newProduct, color: e.target.value})} />
                </div>
              </div>

              {/* Category / Sub / Brand / Supplier */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Category</label>
                  <select className={inp + ' bg-white'} value={newProduct.category_id} onChange={e => setNewProduct({...newProduct, category_id: e.target.value, sub_category_id: ''})}>
                    <option value="">None</option>
                    {parentCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Sub Category</label>
                  <select className={inp + ' bg-white disabled:opacity-50'} disabled={!newProduct.category_id} value={newProduct.sub_category_id} onChange={e => setNewProduct({...newProduct, sub_category_id: e.target.value})}>
                    <option value="">None</option>
                    {categories.filter(c => String(c.parent_id) === String(newProduct.category_id)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Brand</label>
                  <select className={inp + ' bg-white'} value={newProduct.brand_id} onChange={e => setNewProduct({...newProduct, brand_id: e.target.value})}>
                    <option value="">None</option>
                    {brands.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Supplier</label>
                  <select className={inp + ' bg-white'} value={newProduct.supplier_id} onChange={e => setNewProduct({...newProduct, supplier_id: e.target.value})}>
                    <option value="">None</option>
                    {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Pricing / Stock / Expiry */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 pt-4 border-t border-gray-100">
                <div>
                  <label className="text-xs font-semibold text-emerald-600 mb-1 block">Unit *</label>
                  <select className={inp + ' bg-white font-bold text-emerald-700 border-emerald-200'} value={newProduct.unit || 'pc'} onChange={e => setNewProduct({...newProduct, unit: e.target.value})}>
                    {PRODUCT_UNITS.map(u => (
                      <option key={u.value} value={u.value}>{u.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Cost Price (Rs)</label>
                  <input type="number" className={inp} value={newProduct.cost_price || ''} onChange={e => setNewProduct({...newProduct, cost_price: Number(e.target.value)})} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-brand-primary mb-1 block">Sale Price (Rs) *</label>
                  <input type="number" className="w-full border border-brand-primary/30 rounded-xl px-4 py-3 outline-none font-bold text-brand-primary bg-brand-primary/5" value={newProduct.price || ''} onChange={e => setNewProduct({...newProduct, price: Number(e.target.value)})} required />
                </div>
                <div>
                  <label className="text-xs font-semibold text-amber-500 mb-1 block">Wholesale (Rs)</label>
                  <input type="number" className="w-full border border-amber-300 rounded-xl px-4 py-3 outline-none font-bold text-amber-700 bg-amber-50/50" value={newProduct.wholesale_price || ''} onChange={e => setNewProduct({...newProduct, wholesale_price: Number(e.target.value)})} placeholder="Wholesale" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Stock *</label>
                  <input type="number" step="any" className={inp} value={newProduct.stock || ''} onChange={e => setNewProduct({...newProduct, stock: Number(e.target.value)})} required />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Branch</label>
                  <select className={inp + ' bg-white font-bold'} value={newProduct.branch_id || 'ALL'} onChange={e => setNewProduct({...newProduct, branch_id: e.target.value})}>
                    <option value="ALL">All Branches</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Low Alert</label>
                  <input type="number" min="0" className={inp} value={newProduct.low_stock_alert} onChange={e => setNewProduct({...newProduct, low_stock_alert: Number(e.target.value)})} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-amber-600 mb-1 block">Expiry Date</label>
                  <input type="date" className={inp + ' text-xs font-bold text-amber-800'} value={newProduct.expiry_date || ''} onChange={e => setNewProduct({...newProduct, expiry_date: e.target.value})} />
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center justify-between">
                <div className="pr-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-800">Allow Price Override in POS</span>
                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${newProduct.allow_price_override ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                      {newProduct.allow_price_override ? 'Enabled' : 'Disabled (Locked)'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    When enabled, cashiers can edit or override the price for this item at the POS terminal. If disabled, price changes are blocked.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={Number(newProduct.allow_price_override) !== 0}
                    onChange={(e) => setNewProduct({ ...newProduct, allow_price_override: e.target.checked ? 1 : 0 })}
                  />
                  <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <button type="button" onClick={() => setShowAdd(false)} disabled={isSaving} className="px-6 py-3 rounded-full font-bold text-gray-500 hover:bg-gray-100 disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={isSaving} className="bg-brand-primary text-white px-8 py-3 rounded-full font-bold hover:bg-brand-secondary shadow-lg shadow-brand-primary/30 flex items-center disabled:opacity-60">
                  {isSaving ? (
                    <>
                      <Loader2 size={16} className="animate-spin mr-2" />
                      Saving & Syncing Live...
                    </>
                  ) : (
                    'Save Product'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      ), document.body)}

      {/* Add Category Modal */}
      {showAddCat && createPortal((
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-brand-dark text-xl flex items-center"><Layers size={24} className="mr-3 text-brand-primary"/> Add Category</h3>
              <button onClick={() => setShowAddCat(false)} className="text-gray-400 hover:text-red-500"><X size={24}/></button>
            </div>
            <form onSubmit={handleAddCategory} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Category Name</label>
                <input type="text" className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-brand-primary bg-white text-lg font-bold" value={newCat.name} onChange={e => setNewCat({...newCat, name: e.target.value})} required autoFocus />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Parent Category (Optional)</label>
                <select className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-brand-primary bg-white text-lg font-bold" value={newCat.parent_id} onChange={e => setNewCat({...newCat, parent_id: e.target.value})}>
                  <option value="">None (Top Level)</option>
                  {parentCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <button type="submit" className="w-full mt-4 bg-brand-primary text-white py-4 rounded-xl font-bold text-lg hover:bg-brand-secondary shadow-lg shadow-brand-primary/30">Save Category</button>
            </form>
          </div>
        </div>
      ), document.body)}

      {/* Add Brand Modal */}
      {showAddBrand && createPortal((
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-brand-dark text-xl flex items-center"><Briefcase size={24} className="mr-3 text-brand-primary"/> Add Brand</h3>
              <button onClick={() => setShowAddBrand(false)} className="text-gray-400 hover:text-red-500"><X size={24}/></button>
            </div>
            <form onSubmit={handleAddBrand} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Brand Name</label>
                <input type="text" className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-brand-primary bg-white text-lg font-bold" value={newBrand} onChange={e => setNewBrand(e.target.value)} required autoFocus />
              </div>
              <button type="submit" className="w-full mt-4 bg-brand-primary text-white py-4 rounded-xl font-bold text-lg hover:bg-brand-secondary shadow-lg shadow-brand-primary/30">Save Brand</button>
            </form>
          </div>
        </div>
      ), document.body)}

      {/* Product Detail Modal */}
      {activeProduct && createPortal((
        <div className="fixed inset-0 bg-black/60 z-[90] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl flex flex-col overflow-hidden">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center bg-gray-50">
              <div>
                <h3 className="font-black text-2xl text-brand-dark">{activeProduct.name}</h3>
                <p className="text-sm text-gray-500 font-mono mt-1">
                  {activeProduct.item_code && <span>Code: {activeProduct.item_code} | </span>}
                  {activeProduct.barcode && <span>Barcode: {activeProduct.barcode}</span>}
                </p>
              </div>
              <div className="flex items-center space-x-3">
                {(currentUser?.role === 'Admin' || currentUser?.role === 'Manager') && (
                  <button onClick={handleEditProduct} className="text-gray-500 hover:text-brand-primary bg-white px-4 py-2 rounded-xl border border-gray-200 font-bold text-sm shadow-sm">Edit</button>
                )}
                {isAdmin && (
                  <button onClick={() => handleDeleteProduct(activeProduct.id)} className="text-gray-500 hover:text-red-500 bg-white px-4 py-2 rounded-xl border border-gray-200 font-bold text-sm shadow-sm">Delete</button>
                )}
                <button onClick={() => setActiveProduct(null)} className="text-gray-400 hover:text-red-500 bg-white p-2 rounded-full border border-gray-200"><X size={20}/></button>
              </div>
            </div>
            <div className="p-6 grid grid-cols-2 sm:grid-cols-5 gap-4">
              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                <p className="text-xs font-bold text-gray-400 uppercase">Sale Price</p>
                <p className="text-xl font-black text-brand-primary">Rs. {activeProduct.price}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                <p className="text-xs font-bold text-gray-400 uppercase">Unit</p>
                <p className="text-xl font-black text-slate-800 uppercase">{activeProduct.unit || 'pc'}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                <p className="text-xs font-bold text-gray-400 uppercase">Cost</p>
                <p className="text-xl font-black text-gray-600">Rs. {activeProduct.cost_price}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                <p className="text-xs font-bold text-gray-400 uppercase">Stock</p>
                <p className="text-xl font-black text-emerald-600">{formatQuantityWithUnit(activeProduct.stock, activeProduct.unit || 'pc')}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                <p className="text-xs font-bold text-gray-400 uppercase">Category</p>
                <p className="text-lg font-bold text-brand-dark">{activeProduct.category_name || 'N/A'}</p>
              </div>
              {activeProduct.size && (
                <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                  <p className="text-xs font-bold text-gray-400 uppercase">Size</p>
                  <p className="text-lg font-bold text-brand-dark">{activeProduct.size}</p>
                </div>
              )}
              {activeProduct.color && (
                <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                  <p className="text-xs font-bold text-gray-400 uppercase">Color</p>
                  <p className="text-lg font-bold text-brand-dark">{activeProduct.color}</p>
                </div>
              )}
              {activeProduct.expiry_date && (
                <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100">
                  <p className="text-xs font-bold text-amber-500 uppercase">Expiry Date</p>
                  <p className="text-lg font-bold text-amber-700">{activeProduct.expiry_date}</p>
                </div>
              )}
              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                <p className="text-xs font-bold text-gray-400 uppercase">POS Price Edit</p>
                <p className={`text-sm font-black mt-1 ${activeProduct.allow_price_override !== 0 && activeProduct.allow_price_override !== false ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {activeProduct.allow_price_override !== 0 && activeProduct.allow_price_override !== false ? '✓ Allowed' : '🔒 Locked'}
                </p>
              </div>
              {activeProduct.image_data && (
                <div className="col-span-2 sm:col-span-5">
                  <img src={activeProduct.image_data} alt={activeProduct.name} className="h-32 object-contain rounded-xl border border-gray-100" />
                </div>
              )}
            </div>
          </div>
        </div>
      ), document.body)}

      {activeTab === 'products' && (
        <>
          <div className="flex items-center gap-2.5 mb-3 shrink-0">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                type="text" 
                placeholder="Search by name, barcode, PLU or item code..." 
                className="w-full pl-10 pr-8 py-2 bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 text-xs font-semibold transition-all" 
                value={search} 
                onChange={e => setSearch(e.target.value)} 
              />
              {search && (
                <button 
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                >
                  ✕
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[11px] font-bold text-slate-500 whitespace-nowrap">Branch:</span>
              <select
                value={selectedBranchFilter}
                onChange={e => setSelectedBranchFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500/20 cursor-pointer"
              >
                <option value="ALL">All Branches</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-auto border border-slate-200 rounded-xl bg-white shadow-2xs">
            <table className="w-full text-left border-collapse table-auto">
              <thead className="bg-slate-50 sticky top-0 shadow-2xs z-10 select-none">
                <tr className="border-b border-slate-200 text-[11px] font-black uppercase text-slate-500 tracking-wider">
                  <th className="px-3 py-2.5 w-[32%] min-w-[200px]">Product Name</th>
                  <th className="px-3 py-2.5 w-[16%] min-w-[120px]">Code / Barcode</th>
                  <th className="px-3 py-2.5 w-[15%] min-w-[110px]">Category</th>
                  <th className="px-3 py-2.5 w-[9%] min-w-[70px] text-right">Cost</th>
                  <th className="px-3 py-2.5 w-[10%] min-w-[80px] text-right">Price</th>
                  <th className="px-2 py-2.5 w-[6%] min-w-[50px] text-center">Unit</th>
                  <th className="px-3 py-2.5 w-[8%] min-w-[65px] text-right">Stock</th>
                  {(currentUser?.role === 'Admin' || currentUser?.role === 'Manager') && (
                    <th className="px-2 py-2.5 w-[6%] min-w-[60px] text-center">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {paginated.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-400 font-semibold">
                      No matching products found.
                    </td>
                  </tr>
                ) : (
                  paginated.map((p: any) => (
                    <tr key={p.id} onClick={() => setActiveProduct(p)} className="hover:bg-emerald-50/40 cursor-pointer transition-colors group">
                      <td className="px-3 py-2 font-black text-slate-900">
                        <div className="flex items-center gap-2">
                          {p.image_data ? (
                            <img src={p.image_data} alt="" className="w-7 h-7 object-cover rounded-md border border-slate-200 shrink-0" />
                          ) : (
                            <Package size={15} className="text-emerald-600/50 group-hover:text-emerald-700 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <div className="truncate font-black text-slate-900 text-xs leading-tight">
                              {p.name}
                            </div>
                            <div className="flex items-center gap-1 mt-0.5">
                              {p.is_scale_item ? (
                                <span className="inline-flex items-center gap-0.5 text-[9px] font-black bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded">
                                  <Scale size={9} /> Scale (PLU {p.plu || p.barcode})
                                </span>
                              ) : null}
                              {p.size && <span className="text-[9px] bg-slate-100 text-slate-600 px-1 rounded font-bold">{p.size}</span>}
                              {p.color && <span className="text-[9px] bg-slate-100 text-slate-600 px-1 rounded font-bold">{p.color}</span>}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px]">
                        <div className="font-bold text-slate-700">{p.item_code || '-'}</div>
                        <div className="text-slate-400 text-[10px] tracking-tight">{p.barcode || '-'}</div>
                      </td>
                      <td className="px-3 py-2 text-slate-600 font-semibold truncate text-[11px]">
                        {p.category_name || '-'}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-slate-500 font-mono text-xs">
                        Rs. {Number(p.cost_price || 0).toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right font-black text-slate-900 font-mono text-xs">
                        Rs. {Number(p.price || 0).toFixed(2)}
                      </td>
                      <td className="px-2 py-2 text-center">
                        <span className="text-[10px] font-black bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200 uppercase">
                          {p.unit || 'pc'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className={`font-black font-mono text-xs ${p.stock <= ((p.low_stock_alert !== undefined && p.low_stock_alert !== null) ? p.low_stock_alert : 2) ? 'text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200' : 'text-emerald-700'}`}>
                          {formatQuantityWithUnit(p.stock, p.unit || 'pc')}
                        </span>
                      </td>
                      {(currentUser?.role === 'Admin' || currentUser?.role === 'Manager') && (
                        <td className="px-2 py-2 text-center" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1">
                            <button 
                              onClick={() => handleEditProduct(p)} 
                              title="Edit Product"
                              className="text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 p-1 rounded-md transition-colors cursor-pointer"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </button>
                            {isAdmin && (
                              <button 
                                onClick={() => handleDeleteProduct(p.id)} 
                                title="Delete Product (Admin Only)" 
                                className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-1 rounded-md transition-colors cursor-pointer"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 shrink-0 text-xs select-none">
            <div className="text-slate-500 font-semibold text-[11px]">
              Showing <span className="font-black text-slate-800">{filtered.length === 0 ? 0 : (page - 1) * pageSize + 1}</span> to <span className="font-black text-slate-800">{Math.min(page * pageSize, filtered.length)}</span> of <span className="font-black text-slate-800">{filtered.length.toLocaleString()}</span> products
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
                <span>Rows:</span>
                <select
                  value={pageSize}
                  onChange={e => setPageSize(Number(e.target.value))}
                  className="bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg px-2 py-1 text-xs font-black text-slate-800 outline-none cursor-pointer"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={250}>250</option>
                </select>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage(1)}
                  className="p-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed text-slate-700 cursor-pointer"
                  title="First Page"
                >
                  <ChevronsLeft size={14} />
                </button>
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage(prev => Math.max(1, prev - 1))}
                  className="px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed font-bold text-slate-700 flex items-center gap-0.5 cursor-pointer text-[11px]"
                  title="Previous Page"
                >
                  <ChevronLeft size={14} />
                  <span>Prev</span>
                </button>

                <span className="px-2 font-black text-slate-800 text-xs">
                  {page} / {totalPages}
                </span>

                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
                  className="px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed font-bold text-slate-700 flex items-center gap-0.5 cursor-pointer text-[11px]"
                  title="Next Page"
                >
                  <span>Next</span>
                  <ChevronRight size={14} />
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage(totalPages)}
                  className="p-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed text-slate-700 cursor-pointer"
                  title="Last Page"
                >
                  <ChevronsRight size={14} />
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {activeTab === 'categories' && (
        <div className="flex-1 border border-gray-100 rounded-2xl overflow-y-auto bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 sticky top-0 shadow-sm z-10">
              <tr>
                <th className="p-4 font-bold text-gray-500 border-b border-gray-100">Category Name</th>
                <th className="p-4 font-bold text-gray-500 border-b border-gray-100">Level</th>
                <th className="p-4 font-bold text-gray-500 border-b border-gray-100 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {categories.map((c: any) => (
                <tr key={c.id} className="hover:bg-gray-50/50">
                  <td className="p-4 font-bold text-brand-dark flex items-center">
                    {c.parent_id ? <span className="text-gray-300 mr-4">↳</span> : <Layers size={16} className="text-brand-primary opacity-50 mr-3" />}
                    {c.name}
                  </td>
                  <td className="p-4 text-gray-500 text-xs uppercase font-bold">{c.parent_id ? 'Sub-Category' : 'Parent'}</td>
                  <td className="p-4 text-right">
                    {isAdmin && (
                      <button onClick={() => deleteCategory(c.id)} title="Delete Category (Admin Only)" className="text-gray-400 hover:text-red-500"><Trash2 size={16}/></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'brands' && (
        <div className="flex-1 border border-gray-100 rounded-2xl overflow-y-auto bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 sticky top-0 shadow-sm z-10">
              <tr>
                <th className="p-4 font-bold text-gray-500 border-b border-gray-100">Brand Name</th>
                <th className="p-4 font-bold text-gray-500 border-b border-gray-100 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {brands.map((b: any) => (
                <tr key={b.id} className="hover:bg-gray-50/50">
                  <td className="p-4 font-bold text-brand-dark flex items-center">
                    <Briefcase size={16} className="text-brand-primary opacity-50 mr-3" />
                    {b.name}
                  </td>
                  <td className="p-4 text-right">
                    {isAdmin && (
                      <button onClick={() => deleteBrand(b.id)} title="Delete Brand (Admin Only)" className="text-gray-400 hover:text-red-500"><Trash2 size={16}/></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
