import React, { useState, useEffect } from 'react';
import { 
  Calendar, TrendingUp, TrendingDown, DollarSign, Package, AlertCircle, 
  Ghost, ArrowUpRight, Download, Wallet, Layers, Zap, Award, 
  ShoppingBag, Receipt, PieChart, Activity, RefreshCw, BarChart2
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { subDays, startOfDay, endOfDay, startOfWeek, startOfMonth, startOfYear } from 'date-fns';

export default function AnalyticsView() {
  const [data, setData] = useState<any>(null);
  const [dateRange, setDateRange] = useState('month');
  const [activeLeaderboardTab, setActiveLeaderboardTab] = useState<'fast' | 'profit' | 'dead' | 'margin'>('fast');
  
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string|null>(null);

  useEffect(() => {
    loadData();
  }, [dateRange, customStart, customEnd]);

  const loadData = async () => {
    setError(null);
    setIsLoading(true);
    try {
      let start = new Date();
      let end = new Date();

      const now = new Date();
      if (dateRange === 'today') {
        start = startOfDay(now);
        end = endOfDay(now);
      } else if (dateRange === 'yesterday') {
        start = startOfDay(subDays(now, 1));
        end = endOfDay(subDays(now, 1));
      } else if (dateRange === 'week') {
        start = startOfWeek(now);
        end = endOfDay(now);
      } else if (dateRange === 'month') {
        start = startOfMonth(now);
        end = endOfDay(now);
      } else if (dateRange === '3month') {
        start = startOfMonth(subDays(now, 90));
        end = endOfDay(now);
      } else if (dateRange === 'year') {
        start = startOfYear(now);
        end = endOfDay(now);
      } else if (dateRange === 'custom') {
        if (!customStart || !customEnd) {
          setIsLoading(false);
          return;
        }
        start = startOfDay(new Date(customStart));
        end = endOfDay(new Date(customEnd));
      }

      // @ts-ignore
      const res = await window.ipcRenderer.invoke('get-analytics-by-date', { 
        startDate: start.toISOString(), 
        endDate: end.toISOString() 
      });
      
      // @ts-ignore
      const babyRes = await window.ipcRenderer.invoke('get-baby-analytics', {
        startDate: start.toISOString(),
        endDate: end.toISOString()
      });

      setData({
        invoices: res?.invoices || [],
        transactions: res?.transactions || [],
        ...(babyRes || { 
          deadStock: [], 
          marginProducts: [], 
          fastMoving: [], 
          mostProfitable: [],
          inventory: {},
          salesAnalytics: {}
        })
      });
    } catch (err: any) {
      setError(err?.message || 'Failed to load analytics');
      setData({ 
        invoices: [], 
        transactions: [], 
        deadStock: [], 
        marginProducts: [], 
        fastMoving: [], 
        mostProfitable: [],
        inventory: {},
        salesAnalytics: {}
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!data && isLoading) {
    return (
      <div className="h-full flex items-center justify-center flex-col gap-3 font-bold text-gray-500 animate-pulse">
        <RefreshCw size={28} className="animate-spin text-brand-primary" />
        <span>Calculating business valuation & analytics...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center flex-col gap-3 text-red-500">
        <AlertCircle size={36}/>
        <p className="font-bold">{error}</p>
        <button onClick={loadData} className="text-sm bg-brand-primary text-white px-5 py-2.5 rounded-xl font-bold shadow-md hover:opacity-90">
          Retry Analysis
        </button>
      </div>
    );
  }

  // Safe metrics extraction
  const invoices = data?.invoices || [];
  const invSales = invoices.reduce((acc: number, inv: any) => acc + Number(inv.total || 0), 0);
  
  const sales = data?.salesAnalytics || {};
  const totalRevenue = Number(sales.totalRevenue ?? invSales);
  const totalCogs = Number(sales.totalCogs ?? (totalRevenue * 0.7)); // Sold Stock Value
  const grossProfit = Number(sales.grossProfit ?? (totalRevenue - totalCogs)); // Got Profit
  const grossMarginPercent = Number(sales.grossMarginPercent ?? (totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0));
  const totalExpenses = Number(sales.totalExpenses ?? 0);
  const netProfit = Number(sales.netProfit ?? (grossProfit - totalExpenses)); // Remaining after expenses
  const netMarginPercent = Number(sales.netMarginPercent ?? (totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0));

  const invVal = data?.inventory || {};
  const totalSkus = Number(invVal.totalSkus || 0);
  const activeSkus = Number(invVal.activeSkus || 0);
  const totalStockUnits = Number(invVal.totalStockUnits || 0);
  const inventoryCostValue = Number(invVal.inventoryCostValue || 0); // Remaining stock at cost
  const inventoryRetailValue = Number(invVal.inventoryRetailValue || 0); // Remaining stock at retail
  const potentialProfit = Number(invVal.potentialProfit || Math.max(0, inventoryRetailValue - inventoryCostValue));
  const potentialMargin = Number(invVal.potentialMargin || (inventoryRetailValue > 0 ? (potentialProfit / inventoryRetailValue) * 100 : 0));

  const deadStock = data?.deadStock || [];
  const deadStockValue = deadStock.reduce((acc: number, item: any) => acc + (Number(item.stock || 0) * Number(item.cost_price || 0)), 0);

  const fastMoving = data?.fastMoving || [];
  const mostProfitable = data?.mostProfitable || [];
  const marginProducts = data?.marginProducts || [];

  // Group invoices by day for revenue trend chart
  const chartDataMap: Record<string, number> = {};
  invoices.forEach((inv: any) => {
    const d = new Date(inv.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    chartDataMap[d] = (chartDataMap[d] || 0) + Number(inv.total || 0);
  });
  const chartData = Object.keys(chartDataMap).map(k => ({ name: k, total: chartDataMap[k] }));

  return (
    <div className="bg-[#F8FAFC] p-6 h-full flex flex-col overflow-y-auto space-y-6">
      
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">Executive Business & Inventory Analytics</h2>
            <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
              Live Real-Time
            </span>
          </div>
          <p className="text-xs font-medium text-slate-500 mt-1">
            Remaining stock valuation, sold cost of goods, net profit reconciliation & product movement rankings.
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center space-x-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200 shadow-inner">
            <Calendar size={15} className="text-slate-400 ml-2" />
            <select 
              className="bg-transparent text-xs font-bold text-slate-700 outline-none cursor-pointer pr-3 py-1"
              value={dateRange}
              onChange={e => setDateRange(e.target.value)}
            >
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="3month">Last 3 Months</option>
              <option value="year">This Year</option>
              <option value="custom">Custom Range</option>
            </select>

            {dateRange === 'custom' && (
              <div className="flex items-center space-x-1.5 px-2 border-l border-slate-200">
                <input type="date" className="text-xs font-bold outline-none text-slate-600 bg-transparent" value={customStart} onChange={e => setCustomStart(e.target.value)} />
                <span className="text-slate-300">-</span>
                <input type="date" className="text-xs font-bold outline-none text-slate-600 bg-transparent" value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
              </div>
            )}
          </div>

          <button 
            onClick={loadData}
            disabled={isLoading}
            className="flex items-center gap-1.5 text-xs font-bold bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 px-3 py-2 rounded-xl shadow-sm transition"
            title="Refresh Data"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin text-brand-primary' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* SECTION 1: INVENTORY & REMAINING STOCK VALUATION */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Layers size={17} className="text-indigo-600" />
          <h3 className="text-sm font-black text-slate-700 uppercase tracking-wider">
            1. Remaining Stock Valuation & Inventory Assets
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Remaining Stock Value (Cost & Retail) */}
          <div className="bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-900 border border-indigo-800/50 p-5 rounded-2xl shadow-lg text-white flex flex-col justify-between">
            <div className="flex justify-between items-start mb-2">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-300">Remaining Stock Value</span>
                <h4 className="text-xs font-bold text-slate-300 mt-0.5">At Purchase Cost</h4>
              </div>
              <div className="bg-indigo-500/20 text-indigo-300 p-2 rounded-xl border border-indigo-400/20">
                <Package size={18} />
              </div>
            </div>
            <div>
              <p className="text-2xl font-black tracking-tight text-white mb-1">
                Rs. {inventoryCostValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <div className="text-xs font-bold text-indigo-200/90 mb-2">
                Retail Value: Rs. {inventoryRetailValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-indigo-800/40 text-[11px] font-semibold text-indigo-300">
                <span className="bg-white/10 px-2 py-0.5 rounded-md text-white font-bold">
                  {totalStockUnits.toLocaleString()} units
                </span>
                <span>across</span>
                <span className="bg-white/10 px-2 py-0.5 rounded-md text-white font-bold">
                  {activeSkus.toLocaleString()} in-stock SKUs
                </span>
              </div>
            </div>
          </div>

          {/* Potential Profit */}
          <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm flex flex-col justify-between hover:border-emerald-300 transition">
            <div className="flex justify-between items-start mb-2">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Inventory Potential</span>
                <h4 className="text-xs font-bold text-slate-700 mt-0.5">Potential Profit</h4>
              </div>
              <div className="bg-emerald-50 text-emerald-600 p-2 rounded-xl border border-emerald-100">
                <TrendingUp size={18} />
              </div>
            </div>
            <div>
              <p className="text-2xl font-black tracking-tight text-emerald-600 mb-1">
                Rs. {potentialProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 mb-2">
                <span>Expected Margin:</span>
                <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md font-black">
                  {potentialMargin.toFixed(1)}%
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium pt-2 border-t border-slate-100">
                Estimated profit if all current inventory is sold at retail price.
              </p>
            </div>
          </div>

          {/* Dead Stock Value */}
          <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm flex flex-col justify-between hover:border-rose-300 transition">
            <div className="flex justify-between items-start mb-2">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Unmoving Inventory</span>
                <h4 className="text-xs font-bold text-slate-700 mt-0.5">Dead Stock Value</h4>
              </div>
              <div className="bg-rose-50 text-rose-500 p-2 rounded-xl border border-rose-100">
                <Ghost size={18} />
              </div>
            </div>
            <div>
              <p className="text-2xl font-black tracking-tight text-slate-800 mb-1">
                Rs. {deadStockValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <div className="flex items-center gap-1.5 text-xs font-bold text-rose-600 bg-rose-50 w-fit px-2.5 py-1 rounded-md mb-2">
                <Ghost size={12} />
                <span>{deadStock.length} SKUs locked (0 sales in 90d)</span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium pt-2 border-t border-slate-100">
                Capital tied up in dormant inventory requiring promotions or clearance.
              </p>
            </div>
          </div>

          {/* Catalog SKU Health */}
          <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm flex flex-col justify-between hover:border-amber-300 transition">
            <div className="flex justify-between items-start mb-2">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Catalog Coverage</span>
                <h4 className="text-xs font-bold text-slate-700 mt-0.5">SKU Availability</h4>
              </div>
              <div className="bg-amber-50 text-amber-600 p-2 rounded-xl border border-amber-100">
                <ShoppingBag size={18} />
              </div>
            </div>
            <div>
              <p className="text-2xl font-black tracking-tight text-slate-800 mb-1">
                {activeSkus} <span className="text-sm font-semibold text-slate-400">/ {totalSkus} SKUs</span>
              </p>
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-50 w-fit px-2.5 py-1 rounded-md mb-2">
                <AlertCircle size={12} />
                <span>{marginProducts.length} items on Low Margin Watchlist</span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium pt-2 border-t border-slate-100">
                {((activeSkus / (totalSkus || 1)) * 100).toFixed(1)}% of registered catalog products currently in stock.
              </p>
            </div>
          </div>

        </div>
      </div>

      {/* SECTION 2: SALES, EXPENSES & NET PROFIT RECONCILIATION */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <DollarSign size={17} className="text-emerald-600" />
          <h3 className="text-sm font-black text-slate-700 uppercase tracking-wider">
            2. Realized Sales, Sold Stock (COGS), Expenses & "Got Profit"
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Total Revenue */}
          <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm flex flex-col justify-between hover:border-blue-300 transition">
            <div className="flex justify-between items-start mb-2">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Sales</span>
                <h4 className="text-xs font-bold text-slate-700 mt-0.5">Realized Revenue</h4>
              </div>
              <div className="bg-blue-50 text-blue-600 p-2 rounded-xl border border-blue-100">
                <DollarSign size={18} />
              </div>
            </div>
            <div>
              <p className="text-2xl font-black tracking-tight text-slate-900 mb-1">
                Rs. {totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-blue-50 w-fit px-2.5 py-1 rounded-md mb-2">
                <Receipt size={12} />
                <span>{invoices.length} Invoices generated</span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium pt-2 border-t border-slate-100">
                Gross sales received during selected date period.
              </p>
            </div>
          </div>

          {/* Sold Stock Value (COGS) */}
          <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm flex flex-col justify-between hover:border-amber-300 transition">
            <div className="flex justify-between items-start mb-2">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cost of Goods</span>
                <h4 className="text-xs font-bold text-slate-700 mt-0.5">Sold Stock Value (COGS)</h4>
              </div>
              <div className="bg-amber-50 text-amber-600 p-2 rounded-xl border border-amber-100">
                <BarChart2 size={18} />
              </div>
            </div>
            <div>
              <p className="text-2xl font-black tracking-tight text-amber-700 mb-1">
                Rs. {totalCogs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 mb-2">
                <span>Cost ratio:</span>
                <span className="font-bold text-slate-700">
                  {totalRevenue > 0 ? ((totalCogs / totalRevenue) * 100).toFixed(1) : 0}% of revenue
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium pt-2 border-t border-slate-100">
                Original purchase cost of all products sold during period.
              </p>
            </div>
          </div>

          {/* Got Profit (Realized Gross Profit) */}
          <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm flex flex-col justify-between hover:border-emerald-300 transition">
            <div className="flex justify-between items-start mb-2">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Realized Gross</span>
                <h4 className="text-xs font-bold text-slate-700 mt-0.5">"Got Profit" (Gross)</h4>
              </div>
              <div className="bg-emerald-50 text-emerald-600 p-2 rounded-xl border border-emerald-100">
                <TrendingUp size={18} />
              </div>
            </div>
            <div>
              <p className="text-2xl font-black tracking-tight text-emerald-600 mb-1">
                Rs. {grossProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 w-fit px-2.5 py-1 rounded-md mb-2">
                <TrendingUp size={12} />
                <span>Gross Margin: {grossMarginPercent.toFixed(1)}%</span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium pt-2 border-t border-slate-100">
                Revenue minus purchase cost of sold products.
              </p>
            </div>
          </div>

          {/* Expenses & What Remains After Expenses (Net Profit) */}
          <div className={`p-5 rounded-2xl shadow-sm flex flex-col justify-between border transition ${
            netProfit >= 0 ? 'bg-emerald-950 text-white border-emerald-800/60' : 'bg-rose-950 text-white border-rose-800/60'
          }`}>
            <div className="flex justify-between items-start mb-2">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-300">Final Bottom Line</span>
                <h4 className="text-xs font-bold text-slate-200 mt-0.5">Remaining After Expenses</h4>
              </div>
              <div className="bg-white/10 p-2 rounded-xl border border-white/15">
                <Wallet size={18} />
              </div>
            </div>
            <div>
              <p className="text-2xl font-black tracking-tight mb-1 text-white">
                Rs. {netProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <div className="text-xs font-bold text-slate-300 mb-2">
                Operating Expenses: Rs. {totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="flex items-center gap-1.5 text-[11px] font-bold bg-white/10 w-fit px-2.5 py-1 rounded-md border border-white/10">
                <span>Net Margin: {netMarginPercent.toFixed(1)}%</span>
              </div>
              <p className="text-[11px] text-slate-300/80 font-medium pt-2 border-t border-white/10 mt-2">
                Net profit remaining in cash/bank after deducting operating overhead.
              </p>
            </div>
          </div>

        </div>
      </div>

      {/* SECTION 3: REVENUE TREND & TRANSACTION BREAKDOWN */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Revenue Trend Area Chart */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="font-black text-slate-800 text-sm">Revenue Sales Velocity</h3>
              <p className="text-xs font-medium text-slate-400">Daily invoicing trend over selected period</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-brand-primary"></span>
              <span className="text-xs font-bold text-slate-600">Daily Sales (Rs.)</span>
            </div>
          </div>

          <div className="h-56 w-full">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3CBCCF" stopOpacity={0.7}/>
                      <stop offset="95%" stopColor="#3CBCCF" stopOpacity={0.05}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{fontSize: 10, fill: '#64748b'}} axisLine={false} tickLine={false} />
                  <YAxis tick={{fontSize: 10, fill: '#64748b'}} axisLine={false} tickLine={false} tickFormatter={value => 'Rs.'+value} width={70} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontWeight: 'bold' }} />
                  <Area type="monotone" dataKey="total" stroke="#3CBCCF" strokeWidth={3} fillOpacity={1} fill="url(#colorTotal)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs font-bold text-slate-400">
                No revenue recorded in the selected date range.
              </div>
            )}
          </div>
        </div>

        {/* Transaction Summary Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="font-black text-slate-800 text-sm mb-1">Payment Method Breakdown</h3>
            <p className="text-xs font-medium text-slate-400 mb-5">Settlement channels across all terminals</p>

            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-xs font-bold text-slate-600 flex items-center">
                  <Wallet size={15} className="mr-2.5 text-emerald-500"/> Cash Settlements
                </span>
                <span className="text-xs font-black text-slate-800">
                  {invoices.filter((i:any) => i.payment_method?.toLowerCase() === 'cash').length} bills
                </span>
              </div>

              <div className="flex justify-between items-center p-3 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-xs font-bold text-slate-600 flex items-center">
                  <DollarSign size={15} className="mr-2.5 text-blue-500"/> Card & POS Swipes
                </span>
                <span className="text-xs font-black text-slate-800">
                  {invoices.filter((i:any) => i.payment_method?.toLowerCase() === 'card').length} bills
                </span>
              </div>

              <div className="flex justify-between items-center p-3 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-xs font-bold text-slate-600 flex items-center">
                  <Package size={15} className="mr-2.5 text-indigo-500"/> Total Items Sold
                </span>
                <span className="text-xs font-black text-slate-800">
                  {invoices.reduce((a: any, b: any) => {
                    try { return a + JSON.parse(b.items || '[]').length; } catch { return a; }
                  }, 0)} line items
                </span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 mt-4">
            <div className="bg-gradient-to-r from-brand-primary/10 to-brand-secondary/10 p-3 rounded-xl border border-brand-primary/20 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-black text-brand-dark uppercase tracking-wider">Average Basket Size</p>
                <p className="text-sm font-black text-brand-dark mt-0.5">
                  Rs. {invoices.length > 0 ? (totalRevenue / invoices.length).toFixed(2) : '0.00'} / bill
                </p>
              </div>
              <Receipt size={22} className="text-brand-primary opacity-80" />
            </div>
          </div>
        </div>

      </div>

      {/* SECTION 4: PRODUCT LEADERBOARDS & PERFORMANCE RANKINGS */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        
        {/* Navigation Subtabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5 pb-4 border-b border-slate-100">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setActiveLeaderboardTab('fast')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition ${
                activeLeaderboardTab === 'fast'
                  ? 'bg-amber-500 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Zap size={14} />
              <span>⚡ Most Fast Moving Products ({fastMoving.length})</span>
            </button>

            <button
              onClick={() => setActiveLeaderboardTab('profit')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition ${
                activeLeaderboardTab === 'profit'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Award size={14} />
              <span>🏆 Most Profitable Products ({mostProfitable.length})</span>
            </button>

            <button
              onClick={() => setActiveLeaderboardTab('dead')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition ${
                activeLeaderboardTab === 'dead'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Ghost size={14} />
              <span>Dormant Dead Stock ({deadStock.length})</span>
            </button>

            <button
              onClick={() => setActiveLeaderboardTab('margin')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition ${
                activeLeaderboardTab === 'margin'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <AlertCircle size={14} />
              <span>Low Margin Watchlist ({marginProducts.length})</span>
            </button>
          </div>

          <span className="text-xs font-semibold text-slate-400">
            Top 10 Rankings based on invoice transaction ledger
          </span>
        </div>

        {/* TAB 1: FAST MOVING PRODUCTS */}
        {activeLeaderboardTab === 'fast' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-black text-slate-400 uppercase tracking-wider">
                  <th className="py-2.5 px-3">Rank</th>
                  <th className="py-2.5 px-3">Product Name</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3 text-right">Units Sold</th>
                  <th className="py-2.5 px-3 text-right">Revenue Generated</th>
                  <th className="py-2.5 px-3 text-right">Current Stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-bold text-slate-700">
                {fastMoving.map((p: any, idx: number) => (
                  <tr key={p.id} className="hover:bg-slate-50 transition">
                    <td className="py-3 px-3">
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-black ${
                        idx === 0 ? 'bg-amber-100 text-amber-800' :
                        idx === 1 ? 'bg-slate-200 text-slate-700' :
                        idx === 2 ? 'bg-amber-50 text-amber-900' : 'text-slate-400'
                      }`}>
                        #{idx + 1}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-black text-slate-900">{p.name}</td>
                    <td className="py-3 px-3 text-slate-500 font-semibold">{p.category || 'General'}</td>
                    <td className="py-3 px-3 text-right">
                      <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-md font-black">
                        {p.unitsSold.toLocaleString()} units
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-black text-slate-900">
                      Rs. {Number(p.revenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-slate-500">
                      {p.stock} units
                    </td>
                  </tr>
                ))}
                {fastMoving.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400 font-bold">
                      No product sales recorded in the selected period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 2: MOST PROFITABLE PRODUCTS */}
        {activeLeaderboardTab === 'profit' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-black text-slate-400 uppercase tracking-wider">
                  <th className="py-2.5 px-3">Rank</th>
                  <th className="py-2.5 px-3">Product Name</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3 text-right">Cost Price</th>
                  <th className="py-2.5 px-3 text-right">Selling Price</th>
                  <th className="py-2.5 px-3 text-right">Profit Earned</th>
                  <th className="py-2.5 px-3 text-right">Profit Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-bold text-slate-700">
                {mostProfitable.map((p: any, idx: number) => (
                  <tr key={p.id} className="hover:bg-slate-50 transition">
                    <td className="py-3 px-3">
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-black ${
                        idx === 0 ? 'bg-emerald-100 text-emerald-800' :
                        idx === 1 ? 'bg-slate-200 text-slate-700' :
                        idx === 2 ? 'bg-amber-50 text-amber-900' : 'text-slate-400'
                      }`}>
                        #{idx + 1}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-black text-slate-900">{p.name}</td>
                    <td className="py-3 px-3 text-slate-500 font-semibold">{p.category || 'General'}</td>
                    <td className="py-3 px-3 text-right font-medium text-slate-500">
                      Rs. {Number(p.cost || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-3 text-right font-medium text-slate-500">
                      Rs. {Number(p.price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-3 text-right font-black text-emerald-600">
                      +Rs. {Number(p.profit || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-md font-black">
                        {Number(p.marginPercent || 0).toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
                {mostProfitable.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400 font-bold">
                      No profit data recorded in the selected period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 3: DEAD STOCK ITEMS */}
        {activeLeaderboardTab === 'dead' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-black text-slate-400 uppercase tracking-wider">
                  <th className="py-2.5 px-3">Product Name</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3 text-right">In-Stock Units</th>
                  <th className="py-2.5 px-3 text-right">Unit Cost</th>
                  <th className="py-2.5 px-3 text-right">Locked Capital Value</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-bold text-slate-700">
                {deadStock.slice(0, 20).map((p: any) => (
                  <tr key={p.id} className="hover:bg-slate-50 transition">
                    <td className="py-3 px-3 font-black text-slate-900">{p.name}</td>
                    <td className="py-3 px-3 text-slate-500 font-semibold">{p.category_name || 'General'}</td>
                    <td className="py-3 px-3 text-right font-bold text-slate-700">{p.stock} units</td>
                    <td className="py-3 px-3 text-right text-slate-500">
                      Rs. {Number(p.cost_price || 0).toFixed(2)}
                    </td>
                    <td className="py-3 px-3 text-right font-black text-rose-600">
                      Rs. {(Number(p.stock || 0) * Number(p.cost_price || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className="bg-rose-50 text-rose-600 border border-rose-200 px-2.5 py-0.5 rounded-full text-[10px] font-black">
                        0 Sales (90d)
                      </span>
                    </td>
                  </tr>
                ))}
                {deadStock.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400 font-bold">
                      Zero dead stock detected. All inventory items are moving actively!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 4: LOW MARGIN WATCHLIST */}
        {activeLeaderboardTab === 'margin' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-black text-slate-400 uppercase tracking-wider">
                  <th className="py-2.5 px-3">Product Name</th>
                  <th className="py-2.5 px-3 text-right">Cost Price</th>
                  <th className="py-2.5 px-3 text-right">Selling Price</th>
                  <th className="py-2.5 px-3 text-right">Gross Margin</th>
                  <th className="py-2.5 px-3 text-center">Alert</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-bold text-slate-700">
                {marginProducts.slice(0, 20).map((p: any) => (
                  <tr key={p.id} className="hover:bg-slate-50 transition">
                    <td className="py-3 px-3 font-black text-slate-900">{p.name}</td>
                    <td className="py-3 px-3 text-right text-slate-500">
                      Rs. {Number(p.cost_price || 0).toFixed(2)}
                    </td>
                    <td className="py-3 px-3 text-right text-slate-500">
                      Rs. {Number(p.price || 0).toFixed(2)}
                    </td>
                    <td className="py-3 px-3 text-right font-black text-amber-700">
                      Rs. {(Number(p.price || 0) - Number(p.cost_price || 0)).toFixed(2)}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-0.5 rounded-full text-[10px] font-black">
                        {Number(p.marginPercent || 0).toFixed(1)}% Margin (&lt;20%)
                      </span>
                    </td>
                  </tr>
                ))}
                {marginProducts.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400 font-bold">
                      All products have healthy margins (&gt;= 20%).
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

      </div>

    </div>
  );
}