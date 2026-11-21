import React, { useState, useEffect } from 'react';
import { 
  Sparkles, Search, RefreshCw, Calendar, User, FileText, 
  Download, Tag, AlertCircle, ShoppingBag, ShieldCheck, ArrowUpDown
} from 'lucide-react';

interface CustomBillItem {
  id: number;
  invoice_id: number;
  branch_id: string;
  terminal_id: string;
  cashier: string;
  item_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
  notes?: string;
  created_at: string;
}

export default function CustomItemsAuditView({ currentUser }: { currentUser?: any }) {
  const [items, setItems] = useState<CustomBillItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('ALL');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');

  useEffect(() => {
    loadItems();
  }, []);

  const loadItems = async () => {
    setLoading(true);
    try {
      // @ts-ignore
      if (window.db?.getCustomBillItems) {
        // @ts-ignore
        const data = await window.db.getCustomBillItems();
        setItems(data || []);
      }
    } catch (err) {
      console.error('Failed to load custom items log:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = items.filter(item => {
    const s = searchTerm.toLowerCase();
    const matchSearch = 
      item.item_name.toLowerCase().includes(s) ||
      (item.notes || '').toLowerCase().includes(s) ||
      item.cashier.toLowerCase().includes(s) ||
      String(item.invoice_id || '').includes(s);

    const matchBranch = selectedBranch === 'ALL' || item.branch_id === selectedBranch;

    let matchDate = true;
    if (dateFilter !== 'all' && item.created_at) {
      const itemDate = new Date(item.created_at);
      const now = new Date();
      if (dateFilter === 'today') {
        matchDate = itemDate.toDateString() === now.toDateString();
      } else if (dateFilter === 'week') {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        matchDate = itemDate >= weekAgo;
      } else if (dateFilter === 'month') {
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        matchDate = itemDate >= monthAgo;
      }
    }

    return matchSearch && matchBranch && matchDate;
  });

  const totalRevenue = filteredItems.reduce((acc, i) => acc + (Number(i.total_price) || 0), 0);
  const totalQuantity = filteredItems.reduce((acc, i) => acc + (Number(i.quantity) || 0), 0);

  // Group cashiers to find most frequent
  const cashierCounts: Record<string, number> = {};
  filteredItems.forEach(i => {
    cashierCounts[i.cashier] = (cashierCounts[i.cashier] || 0) + 1;
  });
  const topCashier = Object.entries(cashierCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

  const exportCSV = () => {
    if (filteredItems.length === 0) return alert('No items to export');
    const headers = ['ID', 'Date Time', 'Invoice ID', 'Branch', 'Terminal', 'Cashier', 'Item Name', 'Qty', 'Unit', 'Unit Price', 'Total Price', 'Notes'];
    const rows = filteredItems.map(i => [
      i.id,
      `"${i.created_at || ''}"`,
      i.invoice_id,
      `"${i.branch_id}"`,
      `"${i.terminal_id}"`,
      `"${i.cashier}"`,
      `"${i.item_name.replace(/"/g, '""')}"`,
      i.quantity,
      `"${i.unit}"`,
      i.unit_price,
      i.total_price,
      `"${(i.notes || '').replace(/"/g, '""')}"`
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `custom_billed_items_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 select-none font-sans">
      
      {/* ── HEADER ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-emerald-800 via-teal-800 to-emerald-950 p-6 rounded-3xl text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 bg-emerald-500/20 px-3 py-1 rounded-full text-emerald-200 text-xs font-bold border border-emerald-400/30 mb-2">
            <Sparkles size={14} className="text-emerald-300" />
            <span>Audit & Compliance Station</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-3">
            Custom Billed Items Audit
          </h1>
          <p className="text-xs text-emerald-100/80 mt-1 max-w-2xl font-medium leading-relaxed">
            Every custom/open product billed by cashiers at any terminal is permanently tracked here with cashier identity, invoice number, unit pricing, and authorization notes.
          </p>
        </div>

        <div className="flex items-center gap-2 relative z-10 shrink-0">
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold text-xs border border-white/20 transition-all cursor-pointer backdrop-blur-sm shadow-sm"
          >
            <Download size={14} />
            <span>Export CSV</span>
          </button>
          <button
            onClick={loadItems}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-900 rounded-xl font-black text-xs transition-all cursor-pointer shadow-md shadow-emerald-500/30 disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Decorative background glow */}
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-emerald-400/10 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* ── METRIC STAT CARDS ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="bg-white p-5 rounded-2xl border border-emerald-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Custom Items</p>
            <p className="text-2xl font-black text-slate-900 mt-1">{filteredItems.length}</p>
            <p className="text-[10px] text-slate-400 font-medium mt-0.5">{totalQuantity.toFixed(1)} units billed</p>
          </div>
          <div className="h-12 w-12 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
            <Tag size={22} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-emerald-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Custom Sales</p>
            <p className="text-2xl font-black text-emerald-700 mt-1">Rs {totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            <p className="text-[10px] text-emerald-600 font-medium mt-0.5">Billed through POS invoices</p>
          </div>
          <div className="h-12 w-12 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
            <ShoppingBag size={22} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-emerald-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Top Cashier</p>
            <p className="text-xl font-black text-slate-900 mt-1 truncate max-w-[150px]">{topCashier}</p>
            <p className="text-[10px] text-slate-400 font-medium mt-0.5">{cashierCounts[topCashier] || 0} open items added</p>
          </div>
          <div className="h-12 w-12 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold">
            <User size={22} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-emerald-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Audit Integrity</p>
            <p className="text-xl font-black text-emerald-700 mt-1 flex items-center gap-1.5">
              <ShieldCheck size={18} className="text-emerald-600" /> Active
            </p>
            <p className="text-[10px] text-slate-400 font-medium mt-0.5">Logged with invoice links</p>
          </div>
          <div className="h-12 w-12 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center font-bold">
            <FileText size={22} />
          </div>
        </div>

      </div>

      {/* ── SEARCH & FILTER CONTROLS ── */}
      <div className="bg-white p-4 rounded-2xl border border-emerald-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
        
        {/* Search */}
        <div className="relative w-full md:w-96">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search custom item, cashier, notes, or invoice #..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-emerald-600 focus:bg-white transition-all"
          />
        </div>

        {/* Date Filters & Branch */}
        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-bold text-slate-600 shrink-0">
            {(['all', 'today', 'week', 'month'] as const).map(d => (
              <button
                key={d}
                onClick={() => setDateFilter(d)}
                className={`px-3 py-1 rounded-lg capitalize transition-all cursor-pointer ${
                  dateFilter === d ? 'bg-white text-emerald-800 shadow-xs font-black' : 'hover:text-slate-900'
                }`}
              >
                {d === 'all' ? 'All Time' : d}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── AUDIT LOG TABLE ── */}
      <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-emerald-50 flex items-center justify-between bg-emerald-50/30">
          <h3 className="text-xs font-black text-slate-800 flex items-center gap-2">
            <span>Logged Custom Records ({filteredItems.length})</span>
          </h3>
          <span className="text-[10px] font-bold text-slate-400">Read-only audit record</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#FAFDFB] border-b border-emerald-100 text-[10px] font-black text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Date &amp; Time</th>
                <th className="py-3 px-4">Invoice #</th>
                <th className="py-3 px-4">Branch / Terminal</th>
                <th className="py-3 px-4">Cashier</th>
                <th className="py-3 px-4">Custom Item Description</th>
                <th className="py-3 px-4 text-center">Qty</th>
                <th className="py-3 px-4 text-right">Unit Price</th>
                <th className="py-3 px-4 text-right">Total Price</th>
                <th className="py-3 px-4">Cashier Reason / Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400 font-bold">
                    <RefreshCw className="mx-auto mb-2 animate-spin text-emerald-600" size={24} />
                    Loading custom items audit trail...
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400 font-bold">
                    <Sparkles className="mx-auto mb-2 text-slate-300" size={32} />
                    No custom billed items found matching criteria.
                  </td>
                </tr>
              ) : (
                filteredItems.map(item => (
                  <tr key={item.id} className="hover:bg-emerald-50/40 transition-colors">
                    
                    <td className="py-3.5 px-4 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                      {item.created_at ? new Date(item.created_at).toLocaleString() : '—'}
                    </td>

                    <td className="py-3.5 px-4 font-mono font-bold text-emerald-700 whitespace-nowrap">
                      #{item.invoice_id || 'Direct'}
                    </td>

                    <td className="py-3.5 px-4 text-slate-700 font-medium whitespace-nowrap">
                      <span className="font-bold text-slate-900">{item.branch_id || 'BR-MAIN'}</span>
                      <span className="text-slate-400 mx-1">/</span>
                      <span className="text-xs text-slate-500">{item.terminal_id || 'TERM-01'}</span>
                    </td>

                    <td className="py-3.5 px-4 font-bold text-slate-800 whitespace-nowrap flex items-center gap-1.5">
                      <div className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 font-black text-[9px] flex items-center justify-center">
                        {(item.cashier || 'C').charAt(0).toUpperCase()}
                      </div>
                      <span>{item.cashier || 'Cashier'}</span>
                    </td>

                    <td className="py-3.5 px-4 font-black text-slate-900">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                        <span>{item.item_name}</span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-center font-black text-slate-800">
                      {item.quantity} <span className="text-[10px] text-slate-500 uppercase">{item.unit || 'pc'}</span>
                    </td>

                    <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-700">
                      Rs {Number(item.unit_price).toFixed(2)}
                    </td>

                    <td className="py-3.5 px-4 text-right font-mono font-black text-emerald-800">
                      Rs {Number(item.total_price).toFixed(2)}
                    </td>

                    <td className="py-3.5 px-4 text-slate-600 max-w-xs truncate text-[11px]">
                      {item.notes ? (
                        <span className="bg-purple-50 text-purple-800 px-2 py-0.5 rounded border border-purple-200 font-medium">
                          {item.notes}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">None provided</span>
                      )}
                    </td>

                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
