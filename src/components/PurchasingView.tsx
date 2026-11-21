import React, { useState, useEffect } from 'react'
import { Package, Plus, X, Search, Check, Clock, AlertCircle, FileText, Eye, ShieldCheck, CheckCircle2, XCircle } from 'lucide-react'
import SearchableSelect from './SearchableSelect'

export default function PurchasingView({ suppliers, products, loadProducts, loadSuppliers, handleAddSupplier, newSupplier, setNewSupplier, currentUser, onDirectRestock }: any) {
  const [pos, setPos] = useState<any[]>([])
  const [suggestions, setSuggestions] = useState<any>({products: [], variants: []})
  const [showPOModal, setShowPOModal] = useState(false)
  const [showGRNModal, setShowGRNModal] = useState<any>(null)
  const [grnItems, setGrnItems] = useState<any[]>([])
  const [invoiceNo, setInvoiceNo] = useState('')
  const [viewPOItems, setViewPOItems] = useState<any>(null)
  const [poItemsList, setPoItemsList] = useState<any[]>([])
  const [viewGRNItems, setViewGRNItems] = useState<any>(null)
  const [grnItemsList, setGrnItemsList] = useState<any[]>([])
  const [tab, setTab] = useState<'po'|'approvals'|'grn'>('po')
  const [grns, setGrns] = useState<any[]>([])

  const [newPO, setNewPO] = useState({ supplier_id: '', expected_delivery_date: '' })
  const [poItems, setPoItems] = useState<{product_id: number, qty_ordered: number, unit_cost: number}[]>([])
  
  const userPerms: string[] = Array.isArray(currentUser?.permissions) 
    ? currentUser.permissions 
    : (typeof currentUser?.permissions === 'string' ? JSON.parse(currentUser.permissions || '[]') : []);
  const isAdmin = currentUser?.role?.toLowerCase() === 'admin' || 
                  currentUser?.role?.toLowerCase() === 'manager' ||
                  currentUser?.role?.toLowerCase() === 'supervisor' ||
                  userPerms.includes('GRN') ||
                  userPerms.includes('Inventory');
  const currentUserRole: string = currentUser?.role || 'User';
  const currentUserName: string = currentUser?.name || currentUser?.username || 'Admin';

  useEffect(() => {
    loadPOs()
    loadGRNs()

    const onSync = () => {
      loadPOs()
      loadGRNs()
      if (loadProducts) loadProducts()
    }

    // @ts-ignore
    if (window.ipcRenderer?.on) {
      // @ts-ignore
      window.ipcRenderer.on('sync-completed', onSync)
      // @ts-ignore
      window.ipcRenderer.on('sync-data-updated', onSync)
      // @ts-ignore
      window.ipcRenderer.on('products-updated', onSync)
    }

    return () => {
      // @ts-ignore
      if (window.ipcRenderer?.off) {
        // @ts-ignore
        window.ipcRenderer.off('sync-completed', onSync)
        // @ts-ignore
        window.ipcRenderer.off('sync-data-updated', onSync)
        // @ts-ignore
        window.ipcRenderer.off('products-updated', onSync)
      }
    }
  }, [])

  const loadPOs = async () => {
    // @ts-ignore
    const data = await window.db.getPOs() || []
    setPos(data)
    // @ts-ignore
    const sugg = await window.db.invoke('get-reorder-suggestions')
    setSuggestions(sugg || {products: [], variants: []})
  }

  const loadGRNs = async () => {
    // @ts-ignore
    const data = await window.db.invoke('get-grns') || []
    setGrns(data)
  }

  const handleViewPO = async (po: any) => {
    // @ts-ignore
    const items = await window.db.invoke('get-po-items', po.id)
    setPoItemsList(items || [])
    setViewPOItems(po)
  }

  const handleViewGRN = async (grn: any) => {
    // @ts-ignore
    const items = await window.db.invoke('get-grn-items', grn.id)
    setGrnItemsList(items || [])
    setViewGRNItems(grn)
  }

  const handleDeletePO = async (id: number) => {
    if (!isAdmin) {
      alert('Security Restriction: Only System Administrators can delete records.');
      return;
    }
    if (!confirm('Delete this Purchase Order? This cannot be undone.')) return;
    // @ts-ignore
    await window.db.invoke('delete-po', id);
    loadPOs();
  };

  const handleDeleteGRN = async (id: number) => {
    if (!isAdmin) {
      alert('Security Restriction: Only System Administrators can delete records.');
      return;
    }
    if (!confirm('Delete this GRN record? This cannot be undone.')) return;
    // @ts-ignore
    await window.db.invoke('delete-grn', id);
    loadGRNs();
  };

  const handleCreatePO = async (e: React.FormEvent, submitForApproval: boolean = false) => {
    e.preventDefault()
    if (!newPO.supplier_id) return alert('Select Supplier')
    if (poItems.length === 0) return alert('Add at least one item')
    
    const initialStatus = submitForApproval ? 'PENDING APPROVAL' : (isAdmin ? 'APPROVED' : 'DRAFT');
    const approvedBy = initialStatus === 'APPROVED' ? currentUserName : null;

    // @ts-ignore
    await window.db.createPO({
      supplier_id: Number(newPO.supplier_id),
      expected_delivery_date: newPO.expected_delivery_date,
      created_by: currentUserName,
      approved_by: approvedBy,
      status: initialStatus,
      items: poItems
    })
    setShowPOModal(false)
    setPoItems([])
    setNewPO({ supplier_id: '', expected_delivery_date: '' })
    loadPOs()
  }

  const handleApprovePO = async (id: number) => {
    if (!isAdmin) {
      return alert('Permission Denied: Only Admin, Store Manager, or authorized personnel can approve Purchase Orders.');
    }
    if (!confirm(`Are you sure you want to approve Purchase Order PO-${String(id).padStart(4, '0')}?`)) {
      return;
    }
    try {
      // @ts-ignore
      await window.db.invoke('update-po-status', {
        id,
        status: 'APPROVED',
        approvedBy: currentUserName
      });
      alert(`✓ Purchase Order PO-${String(id).padStart(4, '0')} approved!`);
      await loadPOs();
      if (viewPOItems && viewPOItems.id === id) {
        setViewPOItems(null);
      }
    } catch (err: any) {
      alert('Error approving PO: ' + (err?.message || err));
    }
  };

  const handleRejectPO = async (id: number) => {
    if (!isAdmin) {
      return alert('Permission Denied: Only Admin or Store Manager can reject Purchase Orders.');
    }
    const reason = prompt('Please enter the reason for rejecting this PO:');
    if (reason === null) return;
    try {
      // @ts-ignore
      await window.db.invoke('update-po-status', {
        id,
        status: 'REJECTED',
        approvedBy: null,
        rejectionReason: reason || 'Rejected by Admin'
      });
      alert(`PO-${String(id).padStart(4, '0')} has been marked as REJECTED.`);
      await loadPOs();
      if (viewPOItems && viewPOItems.id === id) {
        setViewPOItems(null);
      }
    } catch (err: any) {
      alert('Error rejecting PO: ' + (err?.message || err));
    }
  };

  const handleSubmitPOForApproval = async (id: number) => {
    // @ts-ignore
    await window.db.invoke('update-po-status', {
      id,
      status: 'PENDING APPROVAL'
    });
    loadPOs();
  };

  const handleReceiveGRN = async (po: any) => {
    // @ts-ignore
    const items = await window.db.invoke('get-po-items', po.id)
    setGrnItems(items.map((i: any) => ({
      ...i, 
      qtyReceived: i.qty_ordered || 0, 
      freeQty: 0, 
      actualUnitCost: i.unit_cost, 
      newSalePrice: i.price || 0,
      newWholesalePrice: (i.wholesale_price && Number(i.wholesale_price) !== Number(i.price)) ? i.wholesale_price : 0
    })))
    setInvoiceNo(po.supplier_invoice_no || '')
    setShowGRNModal(po)
  }

  const submitGRN = async (asApproved: boolean = true) => {
    const totalCost = grnItems.reduce((acc, i) => acc + ((Number(i.qtyReceived) || 0) * (Number(i.actualUnitCost) || 0)), 0);
    
    const formattedItems = grnItems.map(i => {
      const qtyReceived = Number(i.qtyReceived) || 0;
      const freeQty = Number(i.freeQty) || 0;
      const totalQty = qtyReceived + freeQty;
      const rawCost = Number(i.actualUnitCost) || 0;
      const effectiveCost = totalQty > 0 && qtyReceived > 0 
        ? Number(((qtyReceived * rawCost) / totalQty).toFixed(2)) 
        : rawCost;

      return {
        productId: i.product_id,
        qtyReceived,
        freeQty,
        unitCost: rawCost,
        effectiveCost,
        newSalePrice: Number(i.newSalePrice) || 0,
        newWholesalePrice: Number(i.newWholesalePrice) || 0,
        totalQty
      };
    });

    const finalStatus = asApproved ? 'APPROVED' : 'PENDING_APPROVAL';

    try {
      // @ts-ignore
      const res = await window.db.invoke('process-grn', { 
        poId: showGRNModal.id, 
        supplierId: showGRNModal.supplier_id, 
        totalCost, 
        items: formattedItems,
        invoiceNo: invoiceNo.trim(),
        receivedBy: currentUserName,
        approvedBy: asApproved ? currentUserName : null,
        status: finalStatus
      });
      alert(asApproved 
        ? '✓ GRN processed and approved! Stock and inventory ledger have been updated.'
        : '✓ GRN submitted for Admin Approval! It is now waiting in the Approvals Queue.');
      setShowGRNModal(null);
      setInvoiceNo('');
      await loadPOs();
      await loadGRNs();
      await loadProducts();
    } catch (err: any) {
      alert('Failed to process GRN: ' + (err?.message || err));
    }
  };

  const handleApproveGRN = async (grnId: number) => {
    if (!isAdmin) {
      return alert('Permission Denied: Only Admin, Store Manager, or authorized personnel can approve GRNs and update stock.');
    }
    if (!confirm(`Are you sure you want to approve GRN-${String(grnId).padStart(4, '0')} and update warehouse stock?`)) {
      return;
    }
    try {
      // @ts-ignore
      const res = await window.db.invoke('approve-grn', {
        grnId,
        approvedBy: currentUserName
      });
      if (res && res.error) {
        alert('Failed to approve GRN: ' + res.error);
        return;
      }
      alert(`✓ GRN-${String(grnId).padStart(4, '0')} approved successfully! Stock and inventory ledger have been updated.`);
      await loadGRNs();
      await loadPOs();
      await loadProducts();
      if (viewGRNItems && viewGRNItems.id === grnId) {
        setViewGRNItems(null);
      }
    } catch (err: any) {
      console.error('Error approving GRN:', err);
      alert('Error approving GRN: ' + (err?.message || err));
    }
  };

  const handleRejectGRN = async (grnId: number) => {
    if (!isAdmin) {
      return alert('Permission Denied: Only Admin or Store Manager can reject GRNs.');
    }
    const reason = prompt('Please enter the reason for rejecting this GRN:');
    if (reason === null) return;
    try {
      // @ts-ignore
      await window.db.invoke('reject-grn', {
        grnId,
        rejectionReason: reason || 'Rejected by Admin',
        rejectedBy: currentUserName
      });
      alert(`GRN-${String(grnId).padStart(4, '0')} has been marked as REJECTED.`);
      await loadGRNs();
      if (viewGRNItems && viewGRNItems.id === grnId) {
        setViewGRNItems(null);
      }
    } catch (err: any) {
      alert('Error rejecting GRN: ' + (err?.message || err));
    }
  };

  const getStatusBadge = (status: string) => {
    const s = (status || '').toUpperCase();
    switch(s) {
      case 'DRAFT':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">DRAFT</span>;
      case 'PENDING APPROVAL':
      case 'PENDING_APPROVAL':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1 inline-flex shadow-2xs animate-pulse">
            <Clock size={12} className="text-amber-700" /> PENDING APPROVAL
          </span>
        );
      case 'APPROVED':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-900 border border-emerald-300 flex items-center gap-1 inline-flex">
            <Check size={12} className="text-emerald-700" /> APPROVED
          </span>
        );
      case 'RECEIVED':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-black bg-teal-100 text-teal-900 border border-teal-300 flex items-center gap-1 inline-flex">
            <Package size={12} className="text-teal-700" /> RECEIVED & STOCKED
          </span>
        );
      case 'REJECTED':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-black bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1 inline-flex">
            <X size={12} className="text-rose-600" /> REJECTED
          </span>
        );
      default:
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700">{status}</span>;
    }
  }

  // Pending Approvals Queue calculation
  const pendingPOs = pos.filter((p: any) => p.status === 'PENDING APPROVAL' || p.status === 'PENDING_APPROVAL');
  const pendingGRNs = grns.filter((g: any) => g.status === 'PENDING_APPROVAL' || g.status === 'PENDING');
  const totalPendingCount = pendingPOs.length + pendingGRNs.length;

  return (
    <div className="bg-white p-7 rounded-3xl shadow-sm border border-slate-100 h-full flex flex-col">
      {/* Top Header */}
      <div className="flex justify-between items-center mb-6 shrink-0 flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <Package className="text-emerald-600" size={26} />
            <span>Purchasing & Approval Hub</span>
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Manage Purchase Orders, Multi-Level Approvals & Goods Received Notes (GRN) with exact supermarket scaling units
          </p>
        </div>
        <div className="flex items-center gap-3">
          {onDirectRestock && (
            <button 
              onClick={onDirectRestock}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-2xl font-black text-xs flex items-center gap-2 shadow-md shadow-indigo-600/20 transition-all cursor-pointer active:scale-95"
            >
              <Package size={16} />
              <span>Direct Restock (GRN)</span>
            </button>
          )}
          <button 
            onClick={() => setShowPOModal(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-2xl font-black text-xs flex items-center gap-2 shadow-md shadow-emerald-600/20 transition-all cursor-pointer active:scale-95"
          >
            <Plus size={16} />
            <span>Draft New PO</span>
          </button>
        </div>
      </div>

      {/* Supplier Management Quick Bar */}
      <div className="mb-5 shrink-0 bg-slate-50/80 p-3 rounded-2xl border border-slate-200/80">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-black text-slate-700 text-xs uppercase tracking-wider">Quick Supplier Registration</h3>
          <span className="text-[11px] font-bold text-slate-400">{suppliers.length} active supplier(s)</span>
        </div>
        <form onSubmit={handleAddSupplier} className="flex gap-2">
          <input 
            type="text" 
            placeholder="Supplier Business Name (e.g. Ceylon Agro Distributors)" 
            className="bg-white px-4 py-2 flex-1 font-bold outline-none text-xs rounded-xl border border-slate-200 focus:border-emerald-600" 
            value={newSupplier.name} 
            onChange={e => setNewSupplier({...newSupplier, name: e.target.value})} 
            required 
          />
          <input 
            type="text" 
            placeholder="Contact Number / Phone" 
            className="bg-white px-4 py-2 w-64 font-bold outline-none text-xs rounded-xl border border-slate-200 focus:border-emerald-600" 
            value={newSupplier.contact} 
            onChange={e => setNewSupplier({...newSupplier, contact: e.target.value})} 
          />
          <button 
            type="submit" 
            className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2 rounded-xl font-black text-xs transition-all cursor-pointer"
          >
            Add Supplier
          </button>
        </form>
      </div>

      {/* Navigation Tabs with Approval Count Badge */}
      <div className="flex gap-2 mb-4 shrink-0 border-b border-slate-100 pb-3">
        <button 
          onClick={() => setTab('po')} 
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${
            tab === 'po' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <FileText size={15} />
          <span>Purchase Orders</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${tab === 'po' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}`}>
            {pos.length}
          </span>
        </button>

        <button 
          onClick={() => setTab('approvals')} 
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${
            tab === 'approvals' ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          <ShieldCheck size={16} />
          <span>Approvals Queue</span>
          {totalPendingCount > 0 ? (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${tab === 'approvals' ? 'bg-white text-amber-900' : 'bg-amber-500 text-white animate-pulse'}`}>
              {totalPendingCount} PENDING
            </span>
          ) : (
            <span className="text-[10px] font-bold text-slate-400">0</span>
          )}
        </button>

        <button 
          onClick={() => { setTab('grn'); loadGRNs(); }} 
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${
            tab === 'grn' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Package size={15} />
          <span>GRN Records</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${tab === 'grn' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}`}>
            {grns.length}
          </span>
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-auto">
        {/* ── TAB 1: APPROVALS QUEUE (The Dedicated Admin Approval Section) ── */}
        {tab === 'approvals' && (
          <div className="space-y-6">
            {totalPendingCount === 0 ? (
              <div className="py-16 text-center bg-slate-50 rounded-3xl border border-slate-200/80">
                <CheckCircle2 size={54} className="mx-auto mb-3 text-emerald-500 opacity-80" />
                <h4 className="font-black text-slate-800 text-base">All Approvals Up to Date!</h4>
                <p className="text-xs text-slate-500 mt-1">There are currently no purchase orders or GRN stock receipts waiting for admin authorization.</p>
              </div>
            ) : null}

            {/* Sub-section: Purchase Orders Requiring Approval */}
            {pendingPOs.length > 0 && (
              <div className="border border-amber-200 rounded-3xl overflow-hidden bg-amber-50/20">
                <div className="px-6 py-4 bg-amber-500/10 border-b border-amber-200 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Clock size={18} className="text-amber-700" />
                    <h3 className="font-black text-sm text-amber-900">Purchase Orders Awaiting Admin Approval</h3>
                  </div>
                  <span className="text-xs font-black text-amber-800 bg-amber-200/80 px-2.5 py-1 rounded-full">
                    {pendingPOs.length} PO(s) Pending
                  </span>
                </div>
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-amber-100 bg-white/60">
                      <th className="py-3 px-4 font-black text-slate-600 text-xs">PO #</th>
                      <th className="py-3 px-4 font-black text-slate-600 text-xs">Supplier</th>
                      <th className="py-3 px-4 font-black text-slate-600 text-xs">Expected Date</th>
                      <th className="py-3 px-4 font-black text-slate-600 text-xs">Created By</th>
                      <th className="py-3 px-4 font-black text-slate-600 text-xs text-right">Approval Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-100/60 bg-white">
                    {pendingPOs.map((p: any) => (
                      <tr key={p.id} className="hover:bg-amber-50/40">
                        <td className="py-4 px-4 font-mono font-black text-slate-900">PO-{String(p.id).padStart(4, '0')}</td>
                        <td className="py-4 px-4 font-bold text-slate-800">{p.supplier_name || 'Direct Supplier'}</td>
                        <td className="py-4 px-4 text-xs font-bold text-slate-600">{p.expected_delivery_date || 'Immediate'}</td>
                        <td className="py-4 px-4 text-xs font-semibold text-slate-600">{p.created_by || 'Staff'}</td>
                        <td className="py-4 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleViewPO(p)}
                              className="text-xs font-bold bg-slate-100 text-slate-700 px-3 py-1.5 rounded-xl hover:bg-slate-200 transition-all cursor-pointer flex items-center gap-1"
                            >
                              <Eye size={13} /> Review Items
                            </button>
                            {isAdmin && (
                              <>
                                <button
                                  onClick={() => handleApprovePO(p.id)}
                                  className="text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-1.5 rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1"
                                >
                                  <Check size={14} /> Approve Order
                                </button>
                                <button
                                  onClick={() => handleRejectPO(p.id)}
                                  className="text-xs font-bold bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white px-3 py-1.5 rounded-xl border border-rose-200 transition-all cursor-pointer"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Sub-section: GRN Stock Receipts Requiring Approval */}
            {pendingGRNs.length > 0 && (
              <div className="border border-blue-200 rounded-3xl overflow-hidden bg-blue-50/20">
                <div className="px-6 py-4 bg-blue-500/10 border-b border-blue-200 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Package size={18} className="text-blue-700" />
                    <h3 className="font-black text-sm text-blue-900">GRN Stock Receipts Awaiting Admin Authorization</h3>
                  </div>
                  <span className="text-xs font-black text-blue-800 bg-blue-200/80 px-2.5 py-1 rounded-full">
                    {pendingGRNs.length} GRN(s) Pending
                  </span>
                </div>
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-blue-100 bg-white/60">
                      <th className="py-3 px-4 font-black text-slate-600 text-xs">GRN #</th>
                      <th className="py-3 px-4 font-black text-slate-600 text-xs">PO #</th>
                      <th className="py-3 px-4 font-black text-slate-600 text-xs">Supplier / Invoice</th>
                      <th className="py-3 px-4 font-black text-slate-600 text-xs">Received By</th>
                      <th className="py-3 px-4 font-black text-slate-600 text-xs text-right">Total Value</th>
                      <th className="py-3 px-4 font-black text-slate-600 text-xs text-right">Approval Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-blue-100/60 bg-white">
                    {pendingGRNs.map((g: any) => (
                      <tr key={g.id} className="hover:bg-blue-50/40">
                        <td className="py-4 px-4 font-mono font-black text-slate-900">GRN-{String(g.id).padStart(4, '0')}</td>
                        <td className="py-4 px-4 text-xs font-bold text-slate-600">{g.po_id ? `PO-${String(g.po_id).padStart(4, '0')}` : 'Direct GRN'}</td>
                        <td className="py-4 px-4 text-xs font-bold text-slate-800">
                          <div>{g.supplier_name || 'Supplier'}</div>
                          {g.supplier_invoice_no && <div className="text-[10px] text-slate-400">Inv: {g.supplier_invoice_no}</div>}
                        </td>
                        <td className="py-4 px-4 text-xs font-semibold text-slate-600">{g.received_by || 'Storekeeper'}</td>
                        <td className="py-4 px-4 text-right font-black text-slate-900">Rs. {(g.display_total || g.total_cost || 0).toLocaleString()}</td>
                        <td className="py-4 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleViewGRN(g)}
                              className="text-xs font-bold bg-slate-100 text-slate-700 px-3 py-1.5 rounded-xl hover:bg-slate-200 transition-all cursor-pointer flex items-center gap-1"
                            >
                              <Eye size={13} /> View Items
                            </button>
                            {isAdmin && (
                              <>
                                <button
                                  onClick={() => handleApproveGRN(g.id)}
                                  className="text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-1.5 rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1"
                                >
                                  <Check size={14} /> Approve & Update Stock
                                </button>
                                <button
                                  onClick={() => handleRejectGRN(g.id)}
                                  className="text-xs font-bold bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white px-3 py-1.5 rounded-xl border border-rose-200 transition-all cursor-pointer"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── TAB 2: GRN RECORDS ── */}
        {tab === 'grn' && (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b-2 border-slate-100">
                <th className="py-3 px-4 font-black text-slate-500 text-xs">GRN #</th>
                <th className="py-3 px-4 font-black text-slate-500 text-xs">PO #</th>
                <th className="py-3 px-4 font-black text-slate-500 text-xs">Supplier & Invoice</th>
                <th className="py-3 px-4 font-black text-slate-500 text-xs">Received At</th>
                <th className="py-3 px-4 font-black text-slate-500 text-xs">Status</th>
                <th className="py-3 px-4 font-black text-slate-500 text-xs text-right">Total Cost</th>
                <th className="py-3 px-4 font-black text-slate-500 text-xs text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {grns.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-400"><Package size={48} className="mx-auto mb-3 opacity-20" />No GRN records found.</td></tr>
              ) : grns.map((g: any) => (
                <tr key={g.id} className="border-b border-slate-100/60 hover:bg-slate-50/60 transition-colors">
                  <td className="py-4 px-4 font-mono font-black text-slate-900">GRN-{String(g.id).padStart(4, '0')}</td>
                  <td className="py-4 px-4 font-bold text-xs text-slate-600">{g.po_id ? `PO-${String(g.po_id).padStart(4,'0')}` : 'Direct'}</td>
                  <td className="py-4 px-4 font-bold text-xs text-slate-800">
                    <div>{g.supplier_name || '-'}</div>
                    {g.supplier_invoice_no && <div className="text-[10px] text-slate-400">Inv: {g.supplier_invoice_no}</div>}
                  </td>
                  <td className="py-4 px-4 text-xs text-slate-600">{new Date(g.received_at || g.created_at || Date.now()).toLocaleDateString()}</td>
                  <td className="py-4 px-4">
                    {getStatusBadge(g.status || 'APPROVED')}
                    {g.approved_by && <div className="text-[10px] text-emerald-700 font-bold mt-0.5">By: {g.approved_by}</div>}
                  </td>
                  <td className="py-4 px-4 text-right font-black text-slate-900">Rs. {(g.display_total || g.total_cost || g.total_amount || 0).toLocaleString()}</td>
                  <td className="py-4 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleViewGRN(g)}
                        className="text-xs font-bold bg-slate-100 text-slate-700 px-3 py-1.5 rounded-xl hover:bg-slate-200 transition-all cursor-pointer flex items-center gap-1"
                      >
                        <Eye size={13} /> View
                      </button>
                      {g.status === 'PENDING_APPROVAL' && isAdmin && (
                        <button
                          onClick={() => handleApproveGRN(g.id)}
                          className="text-xs font-black bg-emerald-600 text-white px-3 py-1.5 rounded-xl hover:bg-emerald-700 shadow-xs transition-all cursor-pointer"
                        >
                          Approve
                        </button>
                      )}
                      {isAdmin && (
                        <button 
                          onClick={() => handleDeleteGRN(g.id)} 
                          className="text-xs font-bold bg-rose-50 text-rose-600 px-3 py-1.5 rounded-xl hover:bg-rose-600 hover:text-white transition-all cursor-pointer"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* ── TAB 3: PURCHASE ORDERS ── */}
        {tab === 'po' && (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b-2 border-slate-100">
                <th className="py-3 px-4 font-black text-slate-500 text-xs">PO #</th>
                <th className="py-3 px-4 font-black text-slate-500 text-xs">Supplier</th>
                <th className="py-3 px-4 font-black text-slate-500 text-xs">Expected Date</th>
                <th className="py-3 px-4 font-black text-slate-500 text-xs">Status & Sign-off</th>
                <th className="py-3 px-4 font-black text-slate-500 text-xs text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pos.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-slate-400">
                    <Package size={48} className="mx-auto mb-3 opacity-20" />
                    No Purchase Orders found. Click "+ Draft New PO" to create one.
                  </td>
                </tr>
              ) : (
                pos.map((p: any) => (
                  <tr key={p.id} className="border-b border-slate-100/60 hover:bg-slate-50/60 transition-colors">
                    <td className="py-4 px-4 font-mono font-black text-slate-900">PO-{String(p.id).padStart(4, '0')}</td>
                    <td className="py-4 px-4 font-bold text-xs text-slate-800">{p.supplier_name || suppliers.find((s:any)=>s.id === p.supplier_id)?.name || 'Direct Supplier'}</td>
                    <td className="py-4 px-4 text-xs font-bold text-slate-600">{p.expected_delivery_date || 'N/A'}</td>
                    <td className="py-4 px-4">
                      <div className="flex flex-col gap-1 items-start">
                        {getStatusBadge(p.status)}
                        {p.approved_by && (p.status === 'APPROVED' || p.status === 'RECEIVED') && (
                          <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            ✓ Approved by: {p.approved_by}
                          </span>
                        )}
                        {p.created_by && (
                          <span className="text-[10px] text-slate-400 font-medium">
                            Drafted by: {p.created_by}
                          </span>
                        )}
                        {p.rejection_reason && (
                          <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                            Reason: {p.rejection_reason}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleViewPO(p)}
                          className="text-xs font-bold bg-slate-100 text-slate-700 px-3 py-1.5 rounded-xl hover:bg-slate-200 transition-all cursor-pointer flex items-center gap-1"
                        >
                          <Eye size={13} /> View
                        </button>

                        {/* Explicit Contextual Actions instead of confusing Advance button */}
                        {p.status === 'DRAFT' && (
                          <>
                            <button
                              onClick={() => handleSubmitPOForApproval(p.id)}
                              className="text-xs font-black bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-xl shadow-xs transition-all cursor-pointer"
                              title="Submit this PO to Manager/Admin for sign-off"
                            >
                              Submit for Approval 📤
                            </button>
                            {isAdmin && (
                              <button
                                onClick={() => handleApprovePO(p.id)}
                                className="text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-xl shadow-xs transition-all cursor-pointer"
                                title="Directly approve this PO"
                              >
                                ✓ Approve
                              </button>
                            )}
                          </>
                        )}

                        {(p.status === 'PENDING APPROVAL' || p.status === 'PENDING_APPROVAL') && (
                          <>
                            {isAdmin ? (
                              <>
                                <button
                                  onClick={() => handleApprovePO(p.id)}
                                  className="text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1"
                                >
                                  <Check size={14} /> Approve Order
                                </button>
                                <button
                                  onClick={() => handleRejectPO(p.id)}
                                  className="text-xs font-bold bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white px-3 py-1.5 rounded-xl border border-rose-200 transition-all cursor-pointer"
                                >
                                  Reject
                                </button>
                              </>
                            ) : (
                              <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-xl border border-amber-200">
                                ⏳ In Review
                              </span>
                            )}
                          </>
                        )}

                        {p.status === 'APPROVED' && (
                          <button
                            onClick={() => handleReceiveGRN(p)}
                            className="text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-1.5 rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1"
                          >
                            <Package size={14} /> Receive GRN
                          </button>
                        )}

                        {p.status === 'RECEIVED' && (
                          <span className="text-xs font-bold text-teal-800 bg-teal-50 px-2.5 py-1 rounded-xl border border-teal-200">
                            ✓ Stocked
                          </span>
                        )}

                        {isAdmin && (
                          <button
                            onClick={() => handleDeletePO(p.id)}
                            className="text-xs font-bold bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white px-3 py-1.5 rounded-xl border border-rose-200 transition-all cursor-pointer"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* ── MODAL: VIEW PO ITEMS WITH SUPERMARKET SCALING UNITS ── */}
      {viewPOItems && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-7 max-w-3xl w-full shadow-2xl max-h-[85vh] flex flex-col border border-slate-100 animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-start mb-5 shrink-0 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
                  <FileText className="text-emerald-600" size={22} />
                  <span>PO-{String(viewPOItems.id).padStart(4,'0')} Item Breakdown</span>
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-1">
                  Supplier: <strong>{viewPOItems.supplier_name || 'Direct'}</strong> &bull; Status: {getStatusBadge(viewPOItems.status)}
                </p>
                {viewPOItems.approved_by && (
                  <p className="text-xs font-bold text-emerald-700 mt-1 flex items-center gap-1">
                    <Check size={14} /> Authorized & Approved by: {viewPOItems.approved_by}
                  </p>
                )}
                {viewPOItems.rejection_reason && (
                  <p className="text-xs font-bold text-rose-600 mt-1">
                    Rejection note: {viewPOItems.rejection_reason}
                  </p>
                )}
              </div>
              <button onClick={() => setViewPOItems(null)} className="text-slate-400 hover:text-slate-700 p-1 rounded-xl cursor-pointer"><X size={20}/></button>
            </div>

            <div className="flex-1 overflow-auto border border-slate-200 rounded-2xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 sticky top-0 border-b border-slate-200">
                  <tr>
                    <th className="p-3 font-black text-slate-600">Product / Item</th>
                    <th className="p-3 font-black text-slate-600 text-right">Ordered Quantity</th>
                    <th className="p-3 font-black text-slate-600 text-right">Unit Cost</th>
                    <th className="p-3 font-black text-slate-600 text-right">Line Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {poItemsList.map((item: any) => (
                    <tr key={item.id} className="hover:bg-slate-50/50">
                      <td className="p-3 font-bold text-slate-900">
                        <div>{item.name}</div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase">{item.unit || 'pc'} {item.is_scale_item ? '• Scale Weight Item' : ''}</div>
                      </td>
                      <td className="p-3 text-right font-black text-slate-900">
                        {item.qty_ordered} <span className="text-[10px] font-bold text-emerald-700 uppercase bg-emerald-50 px-1.5 py-0.5 rounded">{item.unit || 'pc'}</span>
                      </td>
                      <td className="p-3 text-right font-bold text-slate-700">Rs. {Number(item.unit_cost).toLocaleString()}</td>
                      <td className="p-3 text-right font-black text-emerald-700">Rs. {(item.qty_ordered * item.unit_cost).toLocaleString()}</td>
                    </tr>
                  ))}
                  {poItemsList.length === 0 && (
                    <tr><td colSpan={4} className="p-6 text-center text-slate-400 font-medium">No items on this purchase order.</td></tr>
                  )}
                </tbody>
                {poItemsList.length > 0 && (
                  <tfoot className="bg-slate-50 font-black border-t border-slate-200">
                    <tr>
                      <td colSpan={3} className="p-3 text-right text-slate-600 uppercase tracking-wider text-[11px]">Total PO Value:</td>
                      <td className="p-3 text-right text-base text-slate-900">
                        Rs. {poItemsList.reduce((a:number, i:any) => a + (i.qty_ordered * i.unit_cost), 0).toLocaleString()}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            <div className="mt-5 flex justify-between items-center shrink-0 pt-3 border-t border-slate-100">
              <div className="flex items-center gap-2">
                {(viewPOItems.status === 'PENDING APPROVAL' || viewPOItems.status === 'PENDING_APPROVAL') && isAdmin && (
                  <button
                    onClick={() => {
                      handleApprovePO(viewPOItems.id);
                      setViewPOItems(null);
                    }}
                    className="px-5 py-2.5 rounded-xl font-black text-xs text-white bg-emerald-600 hover:bg-emerald-700 transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                  >
                    <Check size={16} /> Approve PO Now
                  </button>
                )}
                {viewPOItems.status === 'APPROVED' && (
                  <button 
                    onClick={() => { setViewPOItems(null); handleReceiveGRN(viewPOItems); }} 
                    className="px-5 py-2.5 rounded-xl font-black text-xs text-white bg-emerald-600 hover:bg-emerald-700 transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                  >
                    <Package size={16} /> Receive GRN
                  </button>
                )}
              </div>
              <button 
                onClick={() => setViewPOItems(null)} 
                className="px-5 py-2.5 rounded-xl font-bold text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: VIEW GRN ITEMS BREAKDOWN ── */}
      {viewGRNItems && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-7 max-w-3xl w-full shadow-2xl max-h-[85vh] flex flex-col border border-slate-100 animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-start mb-5 shrink-0 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
                  <Package className="text-emerald-600" size={22} />
                  <span>GRN-{String(viewGRNItems.id).padStart(4,'0')} Received Stock Breakdown</span>
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-1">
                  Supplier: <strong>{viewGRNItems.supplier_name || 'Direct'}</strong> &bull; Invoice: <strong>{viewGRNItems.supplier_invoice_no || 'None'}</strong> &bull; Status: {getStatusBadge(viewGRNItems.status)}
                </p>
                {viewGRNItems.received_by && (
                  <p className="text-xs font-semibold text-slate-600 mt-0.5">
                    Received by: <strong>{viewGRNItems.received_by}</strong> {viewGRNItems.approved_by ? `• Authorized by: ${viewGRNItems.approved_by}` : ''}
                  </p>
                )}
              </div>
              <button onClick={() => setViewGRNItems(null)} className="text-slate-400 hover:text-slate-700 p-1 rounded-xl cursor-pointer"><X size={20}/></button>
            </div>

            <div className="flex-1 overflow-auto border border-slate-200 rounded-2xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 sticky top-0 border-b border-slate-200">
                  <tr>
                    <th className="p-3 font-black text-slate-600">Product</th>
                    <th className="p-3 font-black text-slate-600 text-right">Actual Received</th>
                    <th className="p-3 font-black text-slate-600 text-right">Free Bonus</th>
                    <th className="p-3 font-black text-slate-600 text-right">Unit Cost</th>
                    <th className="p-3 font-black text-indigo-700 text-right">Effective Cost</th>
                    <th className="p-3 font-black text-slate-600 text-right">Line Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {grnItemsList.map((item: any, idx: number) => {
                    const rec = Number(item.qty_received) || 0;
                    const free = Number(item.free_qty) || 0;
                    const tot = rec + free;
                    const rawC = Number(item.unit_cost) || 0;
                    const effC = tot > 0 && rec > 0 ? (rec * rawC) / tot : (Number(item.effective_cost) || rawC);

                    return (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="p-3 font-bold text-slate-900">
                          <div>{item.product_name || `Product #${item.product_id}`}</div>
                          <div className="text-[10px] text-slate-400 font-bold uppercase">{item.unit || 'pc'} {item.is_scale_item ? '• Scale Item' : ''}</div>
                        </td>
                        <td className="p-3 text-right font-black text-slate-900">
                          {item.qty_received} <span className="text-[10px] font-bold text-emerald-700 uppercase bg-emerald-50 px-1.5 py-0.5 rounded">{item.unit || 'pc'}</span>
                        </td>
                        <td className="p-3 text-right font-bold text-blue-600">
                          {item.free_qty || 0} <span className="text-[10px] font-bold uppercase">{item.unit || 'pc'}</span>
                        </td>
                        <td className="p-3 text-right font-bold text-slate-700">Rs. {rawC.toLocaleString()}</td>
                        <td className="p-3 text-right font-mono font-bold text-indigo-900">
                          Rs. {effC.toFixed(2)}
                          {free > 0 && <span className="block text-[9px] text-emerald-600 font-semibold">(Bonus Discount)</span>}
                        </td>
                        <td className="p-3 text-right font-black text-emerald-700">Rs. {(rec * rawC).toLocaleString()}</td>
                      </tr>
                    );
                  })}
                  {grnItemsList.length === 0 && (
                    <tr><td colSpan={6} className="p-6 text-center text-slate-400 font-medium">No item lines on this GRN.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-5 flex justify-between items-center shrink-0 pt-3 border-t border-slate-100">
              <div className="font-black text-slate-900 text-sm">
                Total Value: <span className="text-emerald-700 ml-1">Rs. {(viewGRNItems.display_total || viewGRNItems.total_cost || 0).toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-2">
                {viewGRNItems.status === 'PENDING_APPROVAL' && isAdmin && (
                  <button
                    onClick={() => {
                      handleApproveGRN(viewGRNItems.id);
                      setViewGRNItems(null);
                    }}
                    className="px-5 py-2.5 rounded-xl font-black text-xs text-white bg-emerald-600 hover:bg-emerald-700 transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                  >
                    <Check size={16} /> Approve & Update Stock
                  </button>
                )}
                <button 
                  onClick={() => setViewGRNItems(null)} 
                  className="px-5 py-2.5 rounded-xl font-bold text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: DRAFT NEW PURCHASE ORDER ── */}
      {showPOModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-7 max-w-4xl w-full shadow-2xl h-[85vh] flex flex-col border border-slate-100 animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-center mb-5 shrink-0 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-2xl font-black text-slate-900">Create Purchase Order</h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">Draft supplier order with scaling quantities and units</p>
              </div>
              <button onClick={() => setShowPOModal(false)} className="text-slate-400 hover:text-slate-700 p-1 rounded-xl cursor-pointer"><X size={20}/></button>
            </div>

            <form onSubmit={(e) => handleCreatePO(e, false)} className="flex flex-col flex-1 overflow-hidden">
              <div className="grid grid-cols-2 gap-4 mb-4 shrink-0">
                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5">Supplier</label>
                  <select 
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:border-emerald-600 bg-slate-50 text-xs font-bold text-slate-800"
                    value={newPO.supplier_id}
                    onChange={(e) => setNewPO({...newPO, supplier_id: e.target.value})}
                    required
                  >
                    <option value="">Select a supplier...</option>
                    {suppliers.map((s:any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5">Expected Delivery Date</label>
                  <input 
                    type="date"
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:border-emerald-600 bg-slate-50 text-xs font-bold text-slate-800"
                    value={newPO.expected_delivery_date}
                    onChange={(e) => setNewPO({...newPO, expected_delivery_date: e.target.value})}
                    required
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto border border-slate-200 rounded-2xl p-4 bg-slate-50/50 mb-4">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-black text-slate-700 text-xs uppercase tracking-wider">Purchase Order Items</h4>
                  <span className="text-[11px] font-bold text-slate-400">{poItems.length} item line(s)</span>
                </div>

                <div className="space-y-2.5">
                  {poItems.map((item, idx) => {
                    const selProd = products.find((p: any) => p.id === item.product_id);
                    const prodUnit = selProd?.unit || 'pc';
                    const isScale = selProd?.is_scale_item;

                    return (
                      <div key={idx} className="flex gap-2.5 items-center bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs flex-wrap sm:flex-nowrap">
                        <div className="flex-1 min-w-[200px]">
                          <SearchableSelect 
                            items={products} 
                            value={item.product_id} 
                            placeholder="Search & Select Product (Scale / Retail)..."
                            onChange={(val: any) => {
                              const newItems = [...poItems];
                              newItems[idx].product_id = val;
                              const found = products.find((p: any) => p.id === val);
                              if (found && found.cost_price > 0 && !item.unit_cost) {
                                newItems[idx].unit_cost = found.cost_price;
                              }
                              setPoItems(newItems);
                            }} 
                          />
                        </div>

                        {/* Quantity with unit */}
                        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
                          <input 
                            type="number" 
                            step="any" 
                            placeholder="Qty" 
                            className="w-20 bg-transparent outline-none text-xs font-black text-slate-900" 
                            value={item.qty_ordered || ''} 
                            onChange={(e) => {
                              const newItems = [...poItems];
                              newItems[idx].qty_ordered = Number(e.target.value);
                              setPoItems(newItems);
                            }} 
                            required
                          />
                          <span className="text-[11px] font-black text-emerald-700 uppercase bg-emerald-100 px-1.5 py-0.5 rounded">
                            {prodUnit} {isScale ? '⚖️' : ''}
                          </span>
                        </div>

                        {/* Cost per unit */}
                        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
                          <span className="text-xs font-bold text-slate-400">Rs.</span>
                          <input 
                            type="number" 
                            step="any" 
                            placeholder="Unit Cost" 
                            className="w-24 bg-transparent outline-none text-xs font-black text-slate-900" 
                            value={item.unit_cost || ''} 
                            onChange={(e) => {
                              const newItems = [...poItems];
                              newItems[idx].unit_cost = Number(e.target.value);
                              setPoItems(newItems);
                            }} 
                            required
                          />
                          <span className="text-[10px] font-bold text-slate-400">/{prodUnit}</span>
                        </div>

                        <div className="text-xs font-black text-emerald-700 min-w-[90px] text-right">
                          Rs. {((item.qty_ordered || 0) * (item.unit_cost || 0)).toLocaleString()}
                        </div>

                        <button 
                          type="button" 
                          onClick={() => setPoItems(poItems.filter((_, i) => i !== idx))} 
                          className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                        >
                          <X size={16}/>
                        </button>
                      </div>
                    );
                  })}

                  <button 
                    type="button" 
                    onClick={() => setPoItems([...poItems, { product_id: 0, qty_ordered: 0, unit_cost: 0 }])} 
                    className="text-xs font-black text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-4 py-2 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Plus size={15}/> Add Another Item Line
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-100 shrink-0 gap-3">
                <div className="text-sm font-black text-slate-900">
                  Total Order: <span className="text-emerald-700 ml-1">Rs. {poItems.reduce((acc, i) => acc + ((i.qty_ordered || 0) * (i.unit_cost || 0)), 0).toLocaleString()}</span>
                </div>

                <div className="flex items-center gap-2">
                  <button 
                    type="button" 
                    onClick={() => setShowPOModal(false)} 
                    className="px-4 py-2.5 rounded-xl font-bold text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>

                  <button 
                    type="button"
                    onClick={(e) => handleCreatePO(e, true)}
                    className="px-5 py-2.5 rounded-xl font-black text-xs text-white bg-amber-500 hover:bg-amber-600 transition-all shadow-md cursor-pointer flex items-center gap-1.5"
                  >
                    <Clock size={15} /> Save & Submit for Approval
                  </button>

                  <button 
                    type="submit" 
                    className="px-5 py-2.5 rounded-xl font-black text-xs text-white bg-emerald-600 hover:bg-emerald-700 transition-all shadow-md shadow-emerald-600/20 cursor-pointer flex items-center gap-1.5"
                  >
                    <Check size={15} /> {isAdmin ? 'Save & Approve PO' : 'Save as Draft'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: RECEIVE GRN (WITH PROPER UNITS & APPROVAL OPTION) ── */}
      {showGRNModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-7 max-w-5xl w-full shadow-2xl h-[88vh] flex flex-col border border-slate-100 animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-start mb-5 shrink-0 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-2xl font-black text-slate-900 flex items-center gap-2">
                  <Package className="text-emerald-600" size={24} />
                  <span>Receive Goods (GRN Entry)</span>
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Confirm physical counts, scale weights, supplier invoice & costs for <strong>PO-{String(showGRNModal.id).padStart(4, '0')}</strong>
                </p>
              </div>
              <button onClick={() => setShowGRNModal(null)} className="text-slate-400 hover:text-slate-700 p-1 rounded-xl cursor-pointer"><X size={20}/></button>
            </div>

            <div className="mb-4 shrink-0 flex items-center gap-4 bg-slate-50 p-3 rounded-2xl border border-slate-200">
              <div className="flex-1 max-w-xs">
                <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1">Supplier Invoice Number</label>
                <input 
                  type="text"
                  className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 outline-none focus:border-emerald-600 text-xs font-bold text-slate-800"
                  value={invoiceNo}
                  onChange={(e) => setInvoiceNo(e.target.value)}
                  placeholder="e.g. INV-90421"
                />
              </div>
              <div className="text-xs text-slate-500 font-medium">
                Supplier: <strong>{showGRNModal.supplier_name || 'Direct'}</strong> &bull; Receiving Officer: <strong>{currentUserName}</strong>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto mb-4 border border-slate-200 rounded-2xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 sticky top-0 shadow-2xs border-b border-slate-200">
                  <tr>
                    <th className="p-3 font-black text-slate-600">Product Line</th>
                    <th className="p-3 font-black text-slate-600">PO Expected</th>
                    <th className="p-3 font-black text-slate-600">Actual Qty Received</th>
                    <th className="p-3 font-black text-slate-600">Free Bonus</th>
                    <th className="p-3 font-black text-slate-600">Unit Cost (Rs)</th>
                    <th className="p-3 font-black text-indigo-700">Effective Cost</th>
                    <th className="p-3 font-black text-emerald-700">Retail Price</th>
                    <th className="p-3 font-black text-amber-700">Wholesale Price</th>
                    <th className="p-3 font-black text-slate-600 text-right">Line Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {grnItems.map((item, idx) => {
                    const variance = (Number(item.qtyReceived) || 0) - (Number(item.qty_ordered) || 0);
                    const prodUnit = item.unit || 'pc';
                    const recQty = Number(item.qtyReceived) || 0;
                    const freeQty = Number(item.freeQty) || 0;
                    const totalUnits = recQty + freeQty;
                    const rawCost = Number(item.actualUnitCost) || 0;
                    const effectiveCost = totalUnits > 0 && recQty > 0 ? (recQty * rawCost) / totalUnits : rawCost;

                    return (
                      <tr key={idx} className="hover:bg-slate-50/60">
                        <td className="p-3 font-bold text-slate-900">
                          <div>{item.name}</div>
                          <div className="text-[10px] text-slate-400 font-bold uppercase">{prodUnit} {item.is_scale_item ? '• Scale Weight' : ''}</div>
                        </td>
                        <td className="p-3 text-slate-600 font-black whitespace-nowrap">
                          {item.qty_ordered} <span className="text-[10px] uppercase font-bold text-slate-400">{prodUnit}</span>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1">
                            <input 
                              type="number" 
                              step="any" 
                              className="w-20 border border-slate-300 p-1.5 rounded-lg outline-none font-black text-slate-900 text-xs focus:border-emerald-600" 
                              value={item.qtyReceived || ''} 
                              onChange={e => {
                                const newItems = [...grnItems]; 
                                newItems[idx].qtyReceived = Number(e.target.value); 
                                setGrnItems(newItems);
                              }}
                            />
                            <span className="text-[10px] font-black uppercase text-emerald-800 bg-emerald-50 px-1 py-0.5 rounded">{prodUnit}</span>
                            {variance !== 0 && item.qtyReceived > 0 && (
                              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${variance > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                                {variance > 0 ? '+' : ''}{variance}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1">
                            <input 
                              type="number" 
                              step="any" 
                              className="w-16 border border-slate-300 p-1.5 rounded-lg outline-none text-blue-700 font-bold text-xs" 
                              value={item.freeQty || ''} 
                              onChange={e => {
                                const newItems = [...grnItems]; 
                                newItems[idx].freeQty = Number(e.target.value); 
                                setGrnItems(newItems);
                              }}
                            />
                            <span className="text-[10px] font-bold text-slate-400">{prodUnit}</span>
                          </div>
                        </td>
                        <td className="p-3">
                          <input 
                            type="number" 
                            step="any" 
                            className="w-24 border border-slate-300 p-1.5 rounded-lg outline-none font-bold text-xs" 
                            value={item.actualUnitCost || ''} 
                            onChange={e => {
                              const newItems = [...grnItems]; 
                              newItems[idx].actualUnitCost = Number(e.target.value); 
                              setGrnItems(newItems);
                            }}
                          />
                        </td>
                        <td className="p-3">
                          <div className="font-mono font-bold text-xs text-indigo-900">
                            Rs. {effectiveCost.toFixed(2)}
                          </div>
                          {freeQty > 0 && (
                            <span className="text-[9px] text-emerald-600 font-bold block whitespace-nowrap">
                              {((1 - (effectiveCost / rawCost)) * 100).toFixed(1)}% bonus cut
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          <input 
                            type="number" 
                            step="any" 
                            className="w-24 border border-emerald-300 p-1.5 rounded-lg outline-none text-emerald-700 font-black bg-emerald-50/50 text-xs" 
                            value={item.newSalePrice || ''} 
                            onChange={e => {
                              const newItems = [...grnItems]; 
                              newItems[idx].newSalePrice = Number(e.target.value); 
                              setGrnItems(newItems);
                            }}
                          />
                        </td>
                        <td className="p-3">
                          <input 
                            type="number" 
                            step="any" 
                            className="w-24 border border-amber-300 p-1.5 rounded-lg outline-none text-amber-700 font-black bg-amber-50/50 text-xs" 
                            value={item.newWholesalePrice || ''} 
                            onChange={e => {
                              const newItems = [...grnItems]; 
                              newItems[idx].newWholesalePrice = Number(e.target.value); 
                              setGrnItems(newItems);
                            }}
                          />
                        </td>
                        <td className="p-3 font-black text-right text-slate-900">
                          Rs. {(item.qtyReceived * item.actualUnitCost).toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mb-3 px-4 py-2.5 bg-indigo-50/70 border border-indigo-200/60 rounded-xl text-xs text-indigo-950 flex items-center justify-between">
              <div>
                <strong>💡 Accounting Note on Free Bonus Items:</strong> Free items automatically reduce the product's effective landed cost (e.g. 10 paid + 2 free spreads total cost over 12 items). When sold, inventory reports accurately reflect the higher profit margin.
              </div>
              <div className="font-bold text-indigo-700 whitespace-nowrap ml-4">
                Total Stock Inflow: {grnItems.reduce((acc, i) => acc + (Number(i.qtyReceived) || 0) + (Number(i.freeQty) || 0), 0)} units
              </div>
            </div>

            <div className="flex justify-between items-center shrink-0 pt-4 border-t border-slate-100 flex-wrap gap-4">
              <div className="font-bold text-slate-500 text-xs">
                Total Invoice Value: <span className="text-xl font-black text-slate-900 ml-2">Rs. {grnItems.reduce((acc, i) => acc + (i.qtyReceived * i.actualUnitCost), 0).toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <button 
                  type="button" 
                  onClick={() => setShowGRNModal(null)} 
                  className="px-5 py-2.5 rounded-xl font-bold text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Cancel
                </button>

                <button 
                  type="button"
                  onClick={() => submitGRN(false)} 
                  className="px-5 py-2.5 rounded-xl font-black text-xs text-white bg-amber-500 hover:bg-amber-600 transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  <Clock size={15} /> Submit GRN for Admin Approval
                </button>

                {isAdmin && (
                  <button 
                    type="button"
                    onClick={() => submitGRN(true)} 
                    className="px-6 py-2.5 rounded-xl font-black text-xs text-white bg-emerald-600 hover:bg-emerald-700 transition-all shadow-md shadow-emerald-600/30 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Check size={16} /> Confirm & Update Stock
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}