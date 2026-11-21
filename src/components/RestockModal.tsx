import React, { useState, useEffect } from 'react'
import SearchableSelect from './SearchableSelect'

export default function RestockModal({ supplier, products, onClose, onComplete }: any) {
  const [items, setItems] = useState<any[]>([])
  const [branches, setBranches] = useState<any[]>([])
  const [selectedBranch, setSelectedBranch] = useState<string>('BR-MAIN')
  const [selectedProduct, setSelectedProduct] = useState<string | number>('')
  const [qty, setQty] = useState<string | number>('')
  const [freeQty, setFreeQty] = useState<string | number>('')
  const [unitCost, setUnitCost] = useState<string | number>('')
  const [salePrice, setSalePrice] = useState<string | number>('')
  const [wholesalePrice, setWholesalePrice] = useState<string | number>('')
  const [expiryDate, setExpiryDate] = useState('')

  useEffect(() => {
    // @ts-ignore
    if (window.db?.getBranches) {
      // @ts-ignore
      window.db.getBranches().then((b: any) => {
        setBranches(b || []);
        if (b && b.length > 0) setSelectedBranch(b[0].id);
      });
    }
  }, []);

  const flattenedProducts = React.useMemo(() => {
    return products.flatMap((p: any) => {
      if (p.has_variants && p.variants?.length > 0) {
        return p.variants.map((v: any) => ({
          id: `v-${v.id}`,
          productId: p.id,
          variantId: v.id,
          barcode: v.barcode || p.barcode,
          name: `${p.name} - ${v.size} ${v.color || ''}`,
          cost_price: v.cost_price,
          price: v.price,
          wholesale_price: (v.wholesale_price && Number(v.wholesale_price) !== Number(v.price)) ? v.wholesale_price : 0
        }));
      }
      return [{
        id: p.id,
        productId: p.id,
        variantId: null,
        barcode: p.barcode,
        name: p.name,
        cost_price: p.cost_price,
        price: p.price,
        wholesale_price: (p.wholesale_price && Number(p.wholesale_price) !== Number(p.price)) ? p.wholesale_price : 0
      }];
    });
  }, [products]);

  useEffect(() => {
    const prod = flattenedProducts.find((p: any) => p.id === selectedProduct)
    if (prod) {
      setUnitCost(prod.cost_price || 0)
      setSalePrice(prod.price || 0)
      setWholesalePrice((prod.wholesale_price && Number(prod.wholesale_price) !== Number(prod.price)) ? prod.wholesale_price : 0)
    }
  }, [selectedProduct, flattenedProducts])

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault()
    const prod = flattenedProducts.find((p: any) => p.id === selectedProduct)
    if (!prod) return
    setItems([...items, {
      productId: prod.productId,
      variantId: prod.variantId,
      name: prod.name,
      qtyReceived: Number(qty) || 0,
      freeQty: Number(freeQty) || 0,
      unitCost: Number(unitCost) || 0,
      newSalePrice: Number(salePrice) || 0,
      newWholesalePrice: Number(wholesalePrice) || 0,
      expiryDate: expiryDate
    }])
    setSelectedProduct('')
    setQty(1)
    setFreeQty(0)
    setUnitCost(0)
    setSalePrice(0)
    setWholesalePrice(0)
    setExpiryDate('')
  }

  const handleProcess = async () => {
    let finalItems = [...items]
    // If user filled in the product fields but didn't click "Add to GRN", auto-include it!
    if (finalItems.length === 0 && selectedProduct) {
      const prod = flattenedProducts.find((p: any) => p.id === selectedProduct)
      if (prod && Number(qty) > 0) {
        finalItems = [{
          productId: prod.productId,
          variantId: prod.variantId,
          name: prod.name,
          qtyReceived: Number(qty) || 0,
          freeQty: Number(freeQty) || 0,
          unitCost: Number(unitCost) || 0,
          newSalePrice: Number(salePrice) || 0,
          newWholesalePrice: Number(wholesalePrice) || 0,
          expiryDate: expiryDate
        }]
      }
    }

    if (finalItems.length === 0) return alert('Please select a product and enter quantity to restock.')
    const totalCost = finalItems.reduce((sum, item) => sum + (item.qtyReceived * item.unitCost), 0)
    try {
      // @ts-ignore
      await window.db.invoke('process-grn', {
        poId: null,
        supplierId: supplier?.id || null, 
        branchId: selectedBranch,
        totalCost,
        items: finalItems,
        status: 'APPROVED',
        receivedBy: 'Supervisor/Admin',
        approvedBy: 'Supervisor/Admin'
      })
      onComplete()
    } catch (e: any) {
      console.error(e)
      alert('Failed to process GRN: ' + e.message)
    }
  }

  return (
    <div className="fixed inset-0 bg-brand-dark/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col h-[85vh]">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <h2 className="text-xl font-bold text-brand-dark">Direct Restock (GRN)</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-red-500 font-bold">X</button>
        </div>
        
        <div className="p-6 flex flex-col flex-1 overflow-y-auto space-y-6">
          <div className="bg-brand-primary/10 p-4 rounded-xl flex justify-between items-center flex-wrap gap-3">
            <div>
              <div className="text-sm font-bold text-brand-dark">Supplier</div>
              <div className="text-brand-primary font-medium">{supplier?.name || 'Internal / Direct'}</div>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Receiving Branch</label>
              <select 
                className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-800 outline-none shadow-2xs"
                value={selectedBranch}
                onChange={e => setSelectedBranch(e.target.value)}
              >
                {branches.map(b => (
                  <option key={b.id} value={b.id}>🏢 {b.name}</option>
                ))}
              </select>
            </div>
            <div className="text-right">
              <div className="text-sm font-bold text-brand-dark">Total GRN Value</div>
              <div className="text-xl font-black text-brand-primary">
                Rs. {items.reduce((sum, item) => sum + (item.qtyReceived * item.unitCost), 0).toLocaleString()}
              </div>
            </div>
          </div>

          <form onSubmit={handleAddItem} className="grid grid-cols-6 gap-3 bg-gray-50 p-4 rounded-xl border border-gray-100">
            <div className="col-span-6 md:col-span-2">
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Product</label>
              <SearchableSelect 
                items={flattenedProducts} 
                value={selectedProduct} 
                placeholder="Search Product..."
                onChange={(id: any) => setSelectedProduct(id)} 
              />
            </div>
            <div className="col-span-3 md:col-span-1">
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Qty</label>
              <input type="number" min="1" className="w-full border border-gray-200 rounded-lg px-3 py-2 outline-none text-sm" value={qty} onChange={e => setQty(e.target.value)} required />
            </div>
            <div className="col-span-3 md:col-span-1">
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Free Qty</label>
              <input type="number" min="0" className="w-full border border-gray-200 rounded-lg px-3 py-2 outline-none text-sm" value={freeQty} onChange={e => setFreeQty(e.target.value)} />
            </div>
            <div className="col-span-2 md:col-span-1">
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Cost (Rs)</label>
              <input type="number" step="0.01" className="w-full border border-gray-200 rounded-lg px-3 py-2 outline-none text-sm" value={unitCost} onChange={e => setUnitCost(e.target.value)} required />
            </div>
            <div className="col-span-2 md:col-span-1">
              <label className="text-xs font-semibold text-emerald-700 mb-1 block">Retail (Rs)</label>
              <input type="number" step="0.01" className="w-full border border-emerald-300 rounded-lg px-3 py-2 outline-none text-sm bg-emerald-50/40 text-emerald-800 font-bold" value={salePrice} onChange={e => setSalePrice(e.target.value)} required />
            </div>
            <div className="col-span-2 md:col-span-1">
              <label className="text-xs font-semibold text-amber-600 mb-1 block">Wholesale (Rs)</label>
              <input type="number" step="0.01" className="w-full border border-amber-300 rounded-lg px-3 py-2 outline-none text-sm bg-amber-50/40 text-amber-800 font-bold" value={wholesalePrice} onChange={e => setWholesalePrice(e.target.value)} required />
            </div>
            <div className="col-span-3 md:col-span-1">
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Expiry Date</label>
              <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 outline-none text-sm bg-gray-50" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} />
            </div>
            <div className="col-span-6 mt-2">
              <button type="submit" className="w-full bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg py-2.5 text-sm font-bold transition-colors shadow-md shadow-emerald-700/20">Add to GRN</button>
            </div>
          </form>

          <div className="flex-1 overflow-x-auto border border-gray-100 rounded-xl">
            <table className="w-full text-left">
              <thead className="bg-gray-50">
                <tr className="text-gray-400 text-xs font-semibold uppercase tracking-wider border-b border-gray-100">
                  <th className="p-3">Product</th>
                  <th className="p-3 text-center">Qty</th>
                  <th className="p-3 text-center">Free</th>
                  <th className="p-3 text-right">Cost</th>
                  <th className="p-3 text-right">Retail (Rs)</th>
                  <th className="p-3 text-right">Wholesale (Rs)</th>
                  <th className="p-3 text-right">Subtotal</th>
                  <th className="p-3 text-center"></th>
                </tr>
              </thead>
              <tbody className="text-sm font-medium text-brand-dark">
                {items.map((it, idx) => (
                  <tr key={idx} className="border-b border-gray-50">
                    <td className="p-3 font-semibold">{it.name}</td>
                    <td className="p-3 text-center bg-gray-50 font-bold">{it.qtyReceived}</td>
                    <td className="p-3 text-center text-emerald-600">{it.freeQty}</td>
                    <td className="p-3 text-right text-gray-600">Rs. {Number(it.unitCost).toFixed(2)}</td>
                    <td className="p-3 text-right text-emerald-700 font-bold">Rs. {Number(it.newSalePrice).toFixed(2)}</td>
                    <td className="p-3 text-right text-amber-700 font-bold">Rs. {Number(it.newWholesalePrice).toFixed(2)}</td>
                    <td className="p-3 text-right font-black">Rs. {(it.qtyReceived * it.unitCost).toFixed(2)}</td>
                    <td className="p-3 text-center">
                      <button onClick={() => setItems(items.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600">✕</button>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-gray-400">No items added to GRN yet.</td></tr>}
              </tbody>
            </table>
          </div>

        </div>
        
        <div className="p-6 border-t border-gray-100 flex justify-end space-x-3 bg-gray-50">
          <button onClick={onClose} className="px-6 py-2 rounded-full font-bold text-gray-500 hover:bg-gray-200 transition-colors">Cancel</button>
          <button onClick={handleProcess} className="bg-brand-primary text-white px-8 py-2 rounded-full font-bold hover:bg-brand-secondary transition-colors shadow-lg">Confirm & Restock</button>
        </div>
      </div>
    </div>
  )
}
