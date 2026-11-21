import React, { useState, useEffect, useMemo } from 'react'
import novaLogo from '../assets/nova-freshmart-logo.png'

export default function DayEndModal({ session, invoices, products, onClose, onEndDay, isAdmin }: any) {
  const [actualCash, setActualCash] = useState(0)
  const [sessionTransactions, setSessionTransactions] = useState<any[]>([])

  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        // @ts-ignore
        const txs = await window.db.invoke('get-session-transactions', session.id);
        setSessionTransactions(txs || []);
      } catch (_) {}
    }
    fetchTransactions();
  }, [session.id]);

  const sessionInvoices = invoices.filter((i: any) => i.session_id === session.id);
  const totalInvoices = sessionInvoices.length;

  let netCashSales = 0;
  let cardSales = 0;
  sessionInvoices.forEach((i: any) => {
    const pm = (i.payment_method || '').toUpperCase();
    const tot = Number(i.total || 0);
    const cashPaid = Number(i.cash_paid || 0);
    const changeRet = Number(i.change_returned || 0);
    const cardPaid = Number(i.card_paid || 0);

    if (pm === 'CASH') {
      netCashSales += tot;
    } else if (cashPaid > 0) {
      netCashSales += Math.max(0, cashPaid - changeRet);
    }
    if (pm === 'CARD' || cardPaid > 0) {
      cardSales += (cardPaid > 0 ? cardPaid : tot);
    }
  });

  const cashIn = sessionTransactions.filter((t: any) => t.type === 'CASH_IN').reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const cashOut = sessionTransactions.filter((t: any) => t.type === 'CASH_OUT' || t.type === 'EXPENSE').reduce((sum, t) => sum + Number(t.amount || 0), 0);
  
  const expectedCash = (Number(session.opening_cash || 0) + netCashSales + cashIn) - cashOut;
  const diff = actualCash - expectedCash;

  const totalRevenue = netCashSales + cardSales;

  const productBreakdown = useMemo(() => {
    const breakdown: Record<string, { qty: number, total: number }> = {};
    sessionInvoices.forEach((inv: any) => {
      if (inv.is_refunded) return;
      const items = JSON.parse(inv.items || '[]');
      items.forEach((item: any) => {
        if (!breakdown[item.name]) {
          breakdown[item.name] = { qty: 0, total: 0 };
        }
        breakdown[item.name].qty += item.quantity || item.qty || 1;
        breakdown[item.name].total += (item.price * (item.quantity || item.qty || 1)) - (item.discount || 0);
      });
    });
    return Object.entries(breakdown).sort((a, b) => b[1].qty - a[1].qty);
  }, [sessionInvoices]);

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="fixed inset-0 bg-brand-dark/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col h-[90vh]">
        
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 print:hidden">
          <h2 className="text-xl font-bold text-brand-dark">Day-End Report</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-red-500 font-bold">✕</button>
        </div>

        <div className="p-8 flex flex-col flex-1 overflow-y-auto space-y-6 bg-white" id="printable-report">
          <div className="text-center mb-4">
            <img src={novaLogo} alt="Logo" className="h-16 mx-auto mb-2 object-contain" />
            <h1 className="text-2xl font-black text-brand-dark">End of Day Report</h1>
            <p className="text-gray-500 font-medium">Session ID: #{session.id}</p>
            <p className="text-sm text-gray-400">{new Date(session.opened_at).toLocaleString()} - {new Date().toLocaleString()}</p>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Drawer Summary</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center"><span className="text-gray-600 font-medium">Opening Cash Float</span><span className="font-bold">Rs. {Number(session.opening_cash || 0).toLocaleString()}</span></div>
                <div className="flex justify-between items-center"><span className="text-gray-600 font-medium">Net Cash Sales</span><span className="font-bold text-emerald-600">+ Rs. {netCashSales.toLocaleString()}</span></div>
                {cashIn > 0 && (
                  <div className="flex justify-between items-center"><span className="text-gray-600 font-medium">Cash In (Float / Pay-ins)</span><span className="font-bold text-emerald-600">+ Rs. {cashIn.toLocaleString()}</span></div>
                )}
                {cashOut > 0 && (
                  <div className="flex justify-between items-center"><span className="text-gray-600 font-medium">Cash Out / Expenses</span><span className="font-bold text-rose-500">- Rs. {cashOut.toLocaleString()}</span></div>
                )}
                <div className="flex justify-between items-center pt-2 border-t border-gray-200"><span className="text-lg font-black text-brand-dark">Expected Cash</span><span className="text-lg font-black text-brand-primary">{isAdmin ? `Rs. ${expectedCash.toLocaleString()}` : '— (Admin Only)'}</span></div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Sales Summary</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center"><span className="text-gray-600 font-medium">Total Invoices</span><span className="font-bold">{totalInvoices}</span></div>
                <div className="flex justify-between items-center"><span className="text-gray-600 font-medium">Card Sales</span><span className="font-bold text-blue-600">Rs. {cardSales.toLocaleString()}</span></div>
                <div className="flex justify-between items-center"><span className="text-gray-600 font-medium">Cash Sales</span><span className="font-bold text-emerald-600">Rs. {netCashSales.toLocaleString()}</span></div>
                <div className="flex justify-between items-center pt-3 border-t border-gray-200"><span className="text-lg font-black text-brand-dark">Total Revenue</span><span className="text-lg font-black text-brand-primary">Rs. {totalRevenue.toLocaleString()}</span></div>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <h3 className="text-sm font-bold text-brand-dark border-b border-gray-200 pb-2 mb-3">Itemized Sales Breakdown</h3>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-gray-400">
                  <th className="pb-2 font-bold uppercase text-xs">Product</th>
                  <th className="pb-2 font-bold uppercase text-xs text-center">Qty Sold</th>
                  <th className="pb-2 font-bold uppercase text-xs text-right">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {productBreakdown.map(([name, data]) => (
                  <tr key={name}>
                    <td className="py-2 font-medium text-gray-700">{name}</td>
                    <td className="py-2 text-center font-bold">{data.qty}</td>
                    <td className="py-2 text-right font-bold text-brand-primary">Rs. {data.total.toLocaleString()}</td>
                  </tr>
                ))}
                {productBreakdown.length === 0 && (
                  <tr><td colSpan={3} className="py-4 text-center text-gray-400 italic">No items sold during this session.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-between items-center print:hidden shrink-0">
          <div className="flex-1 mr-6">
            <label className="block text-sm font-bold text-gray-700 mb-2">Enter Actual Cash in Drawer</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">Rs.</span>
              <input 
                type="number" 
                className="w-full border-2 border-gray-200 rounded-xl pl-12 pr-4 py-3 outline-none focus:border-brand-primary font-black text-xl text-brand-dark" 
                value={actualCash || ''} 
                onChange={e => setActualCash(Number(e.target.value))} 
                autoFocus
              />
            </div>
            {actualCash > 0 && isAdmin && (
              <p className={`mt-2 text-sm font-bold ${diff === 0 ? 'text-emerald-500' : diff > 0 ? 'text-blue-500' : 'text-red-500'}`}>
                {diff === 0 ? 'Perfect Match!' : diff > 0 ? `Over by Rs. ${diff.toLocaleString()}` : `Short by Rs. ${Math.abs(diff).toLocaleString()}`}
              </p>
            )}
          </div>
          <div className="flex space-x-3 shrink-0">
            <button onClick={handlePrint} className="px-6 py-4 rounded-xl font-bold text-brand-dark bg-white border-2 border-gray-200 hover:border-brand-primary transition-colors">
              Print Report
            </button>
            <button onClick={() => onEndDay(actualCash)} className="bg-red-500 text-white px-8 py-4 rounded-xl font-black text-lg hover:bg-red-600 transition-colors shadow-lg shadow-red-500/30">
              Close Session
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
