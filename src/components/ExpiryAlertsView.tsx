import React, { useState, useEffect } from 'react';
import { AlertTriangle, Clock, Package, Printer } from 'lucide-react';
import ExpiryPrintModal, { type ExpiryAlertItem } from './ExpiryPrintModal';

const DAYS: { days: number; label: string }[] = [
  { days: 1, label: 'Today (1d)' },
  { days: 7, label: '1 Wk (7d)' },
  { days: 30, label: '30d' },
  { days: 60, label: '60d' },
  { days: 90, label: '90d' },
  { days: 180, label: '180d' },
];

export default function ExpiryAlertsView({ currentUser }: { currentUser?: any }) {
  const [products, setProducts] = useState<any[]>([]);
  const [threshold, setThreshold] = useState(90);
  const [showPrintModal, setShowPrintModal] = useState(false);

  useEffect(() => {
    // @ts-ignore
    window.db.invoke('get-products-advanced').then((data: any[]) => setProducts(data || []));
  }, []);

  const now = Date.now();
  const cutoff = now + threshold * 24 * 60 * 60 * 1000;

  const alerts: (ExpiryAlertItem & { productName: string })[] = [];

  for (const p of products) {
    // Check main product with expiry_date
    if (p.expiry_date) {
      const exp = new Date(p.expiry_date).getTime();
      if (!isNaN(exp) && exp <= cutoff) {
        alerts.push({
          id: `p-${p.id}`,
          productId: p.id,
          name: p.name,
          productName: p.name,
          code: p.barcode || p.plu || p.item_code || '-',
          type: 'Product',
          detail: 'Main Product Stock',
          stock: Number(p.stock) || 0,
          unit: p.unit || 'pc',
          expiryDate: p.expiry_date,
          daysLeft: Math.ceil((exp - now) / (24 * 60 * 60 * 1000)),
        });
      }
    }
    // Check variants with expiry_date
    for (const v of p.variants || []) {
      if (!v.expiry_date) continue;
      const exp = new Date(v.expiry_date).getTime();
      if (!isNaN(exp) && exp <= cutoff) {
        alerts.push({
          id: `v-${v.id}`,
          productId: p.id,
          name: p.name,
          productName: p.name,
          code: v.barcode || v.sku || p.barcode || '-',
          type: 'Variant',
          detail: [v.size, v.color].filter(Boolean).join(' / ') || v.sku || `Variant #${v.id}`,
          stock: Number(v.stock) || 0,
          unit: p.unit || 'pc',
          expiryDate: v.expiry_date,
          daysLeft: Math.ceil((exp - now) / (24 * 60 * 60 * 1000)),
        });
      }
    }
    // Check product_batches
    for (const b of p.batches || []) {
      if (!b.expiry_date) continue;
      const exp = new Date(b.expiry_date).getTime();
      if (!isNaN(exp) && exp <= cutoff) {
        alerts.push({
          id: `b-${b.id}`,
          productId: p.id,
          name: p.name,
          productName: p.name,
          code: p.barcode || p.plu || p.item_code || '-',
          type: 'Batch',
          detail: `Batch: ${b.batch_no}`,
          stock: Number(b.stock || b.quantity) || 0,
          unit: p.unit || 'pc',
          expiryDate: b.expiry_date,
          daysLeft: Math.ceil((exp - now) / (24 * 60 * 60 * 1000)),
        });
      }
    }
  }

  alerts.sort((a, b) => a.daysLeft - b.daysLeft);

  const expired = alerts.filter(a => a.daysLeft <= 0);
  const expiring = alerts.filter(a => a.daysLeft > 0);

  const badge = (days: number) => {
    if (days <= 0) return 'bg-red-100 text-red-700';
    if (days <= 30) return 'bg-orange-100 text-orange-700';
    if (days <= 60) return 'bg-amber-100 text-amber-700';
    return 'bg-yellow-100 text-yellow-700';
  };

  return (
    <div className="bg-[#FAFAFA] p-6 h-full flex flex-col">
      <div className="flex justify-between items-center mb-4 shrink-0">
        <div>
          <h2 className="text-2xl font-black text-brand-dark tracking-tight">Expiry Alerts</h2>
          <p className="text-xs font-medium text-gray-500 mt-1">Products and batches expiring within the selected window.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowPrintModal(true)}
            className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-xs px-4 py-2 rounded-xl shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
          >
            <Printer size={15} />
            <span>Print Expiry Report</span>
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Show within</span>
            <div className="flex bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              {DAYS.map(opt => (
                <button key={opt.days} onClick={() => setThreshold(opt.days)}
                  className={`px-3 py-1.5 text-xs font-bold transition-colors ${threshold === opt.days ? 'bg-brand-primary text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Summary pills */}
      <div className="flex gap-3 mb-4 shrink-0">
        <div className="bg-red-50 border border-red-100 text-red-700 px-4 py-2 rounded-full text-sm font-bold flex items-center gap-2">
          <AlertTriangle size={14} /> {expired.length} Expired
        </div>
        <div className="bg-amber-50 border border-amber-100 text-amber-700 px-4 py-2 rounded-full text-sm font-bold flex items-center gap-2">
          <Clock size={14} /> {expiring.length} Expiring Soon
        </div>
      </div>

      <div className="flex-1 bg-white rounded-2xl border border-gray-200 overflow-hidden flex flex-col shadow-sm">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] px-5 py-3 border-b border-gray-100 bg-gray-50 shrink-0">
          {['Product', 'Type / Detail', 'Stock', 'Expiry Date', 'Status'].map((h, i) => (
            <div key={i} className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{h}</div>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
          {alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-16 text-gray-400">
              <Package size={40} className="mb-3 opacity-20" />
              <p className="font-bold">No expiry alerts within {threshold} days.</p>
              <p className="text-sm mt-1">All products and batches are within safe date ranges.</p>
            </div>
          ) : alerts.map((a, i) => (
            <div key={i} className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] items-center px-5 py-3 hover:bg-gray-50 transition-colors">
              <div className="font-bold text-brand-dark text-sm flex items-center gap-2">
                <Package size={14} className="text-brand-primary opacity-50 shrink-0" />
                {a.productName}
              </div>
              <div>
                <span className={`text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider ${a.type === 'Variant' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                  {a.type}
                </span>
                <p className="text-xs text-gray-500 mt-1">{a.detail}</p>
              </div>
              <div className="font-black text-sm text-brand-dark">{a.stock} units</div>
              <div className="text-sm font-medium text-gray-600">{new Date(a.expiryDate).toLocaleDateString()}</div>
              <div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${badge(a.daysLeft)}`}>
                  {a.daysLeft <= 0 ? `Expired ${Math.abs(a.daysLeft)}d ago` : `${a.daysLeft}d left`}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <ExpiryPrintModal
        isOpen={showPrintModal}
        onClose={() => setShowPrintModal(false)}
        alerts={alerts}
        currentUser={currentUser}
      />
    </div>
  );
}
