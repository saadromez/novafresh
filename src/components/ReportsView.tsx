import React, { useState, useMemo, useEffect } from 'react';
import { 
  FileText, Download, Calendar, Search, DollarSign, CreditCard, 
  Package, AlertTriangle, Printer, TrendingUp, RotateCcw, 
  Users, Truck, Tag, Barcode, Layers, ArrowUpRight, 
  Building2, ChevronRight, CheckCircle, RefreshCw
} from 'lucide-react';
import { formatSriLankaDateTime } from '../utils/dateUtils';

export type ReportType = 
  | 'fast_moving'
  | 'inventory_movement'
  | 'low_stock'
  | 'sold_stock'
  | 'remaining_stock'
  | 'product_catalog'
  | 'employees_salary'
  | 'suppliers_orders'
  | 'promotions_discounts'
  | 'invoices_registry'
  | 'refund_exchange';

interface CategoryGroup {
  id: string;
  label: string;
  icon: any;
  reports: { id: ReportType; label: string; badge?: string }[];
}

export default function ReportsView({ invoices: initialInvoices = [], products = [], currentUser, loadInvoices }: any) {
  const [activeReport, setActiveReport] = useState<ReportType>('fast_moving');
  const [datePeriod, setDatePeriod] = useState<string>('month');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  
  // Data stores
  const [invoices, setInvoices] = useState<any[]>(initialInvoices);
  const [movements, setMovements] = useState<any[]>([]);
  const [staffUsers, setStaffUsers] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [supplierPayments, setSupplierPayments] = useState<any[]>([]);
  const [promotions, setPromotions] = useState<any[]>([]);
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({});
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    loadSettings();
    loadAllReportData();

    const handleSync = () => {
      loadAllReportData();
    };

    // @ts-ignore
    window.ipcRenderer?.on('sync-data-updated', handleSync);
    // @ts-ignore
    window.ipcRenderer?.on('products-updated', handleSync);
    // @ts-ignore
    window.ipcRenderer?.on('sync-completed', handleSync);

    return () => {
      // @ts-ignore
      window.ipcRenderer?.off('sync-data-updated', handleSync);
      // @ts-ignore
      window.ipcRenderer?.off('products-updated', handleSync);
      // @ts-ignore
      window.ipcRenderer?.off('sync-completed', handleSync);
    };
  }, []);

  const loadSettings = async () => {
    try {
      // @ts-ignore
      const s = await window.db.invoke('get-settings');
      setSettings(s || {});
    } catch (_) {}
  };

  const loadAllReportData = async () => {
    setLoading(true);
    try {
      if (loadInvoices) loadInvoices();
      
      // @ts-ignore
      const invData = await window.db.invoke('get-invoices');
      setInvoices(invData || initialInvoices || []);

      // @ts-ignore
      const movData = await window.db.invoke('get-inventory-movements', {});
      setMovements(movData || []);

      // @ts-ignore
      const uData = await window.db.invoke('get-users');
      setStaffUsers(uData || []);

      // @ts-ignore
      const empData = await window.db.invoke('get-employees');
      setEmployees(empData || []);

      // @ts-ignore
      const supData = await window.db.invoke('get-suppliers');
      setSuppliers(supData || []);

      // @ts-ignore
      const poData = await window.db.invoke('get-pos');
      setPurchaseOrders(poData || []);

      // @ts-ignore
      const payData = await window.db.invoke('get-supplier-payments');
      setSupplierPayments(payData || []);

      // @ts-ignore
      const promoData = await window.db.invoke('get-promotions-advanced');
      setPromotions(promoData || []);

      // @ts-ignore
      const vData = await window.db.invoke('get-vouchers-full');
      setVouchers(vData || []);
    } catch (err) {
      console.warn('Error loading report datasets:', err);
    } finally {
      setLoading(false);
    }
  };

  // Date range calculation
  const { startDate, endDate, dateLabel } = useMemo(() => {
    const now = new Date();
    let s = new Date();
    let e = new Date();

    if (datePeriod === 'today') {
      s.setHours(0, 0, 0, 0);
      e.setHours(23, 59, 59, 999);
      return { startDate: s, endDate: e, dateLabel: 'Today (' + s.toLocaleDateString() + ')' };
    }
    if (datePeriod === 'yesterday') {
      s.setDate(s.getDate() - 1);
      s.setHours(0, 0, 0, 0);
      e.setDate(e.getDate() - 1);
      e.setHours(23, 59, 59, 999);
      return { startDate: s, endDate: e, dateLabel: 'Yesterday (' + s.toLocaleDateString() + ')' };
    }
    if (datePeriod === 'week') {
      s.setDate(s.getDate() - 7);
      s.setHours(0, 0, 0, 0);
      e.setHours(23, 59, 59, 999);
      return { startDate: s, endDate: e, dateLabel: 'Last 7 Days (' + s.toLocaleDateString() + ' - ' + e.toLocaleDateString() + ')' };
    }
    if (datePeriod === 'month') {
      s = new Date(now.getFullYear(), now.getMonth(), 1);
      e = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      return { startDate: s, endDate: e, dateLabel: 'This Month (' + s.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) + ')' };
    }
    if (datePeriod === 'custom' && customStart && customEnd) {
      s = new Date(customStart + 'T00:00:00');
      e = new Date(customEnd + 'T23:59:59');
      return { startDate: s, endDate: e, dateLabel: s.toLocaleDateString() + ' to ' + e.toLocaleDateString() };
    }
    // all time
    s = new Date('2020-01-01T00:00:00');
    e = new Date('2099-12-31T23:59:59');
    return { startDate: s, endDate: e, dateLabel: 'All Recorded Time' };
  }, [datePeriod, customStart, customEnd]);

  // Filtered invoices by date
  const periodInvoices = useMemo(() => {
    return invoices.filter((inv: any) => {
      const d = new Date(inv.created_at);
      return d >= startDate && d <= endDate;
    });
  }, [invoices, startDate, endDate]);

  // Filtered inventory movements by date
  const periodMovements = useMemo(() => {
    return movements.filter((m: any) => {
      const d = new Date(m.created_at);
      return d >= startDate && d <= endDate;
    });
  }, [movements, startDate, endDate]);

  // Categories & report definitions
  const reportCategories: CategoryGroup[] = [
    {
      id: 'inventory_group',
      label: 'Inventory & Stock Analytics',
      icon: Package,
      reports: [
        { id: 'fast_moving', label: 'Fast Moving Products', badge: 'Top Sales' },
        { id: 'inventory_movement', label: 'Inventory Movement Ledger', badge: 'Audit' },
        { id: 'low_stock', label: 'Low Stock Alerts', badge: 'Reorder' },
        { id: 'sold_stock', label: 'Sold Stock Breakdown' },
        { id: 'remaining_stock', label: 'Remaining Stock & Valuation' },
        { id: 'product_catalog', label: 'Product List & Barcode Catalog' }
      ]
    },
    {
      id: 'sales_group',
      label: 'Sales & Audit Registry',
      icon: DollarSign,
      reports: [
        { id: 'invoices_registry', label: 'Sales Invoices & Transactions' },
        { id: 'refund_exchange', label: 'Refunds & Returns Audit' },
        { id: 'promotions_discounts', label: 'Promotions & Discounts' }
      ]
    },
    {
      id: 'staff_supplier_group',
      label: 'Staff & Suppliers',
      icon: Users,
      reports: [
        { id: 'employees_salary', label: 'Staff Directory & Salaries' },
        { id: 'suppliers_orders', label: 'Supplier Orders & Payables' }
      ]
    }
  ];

  // -------------------------------------------------------------
  // COMPUTED REPORT DATASETS
  // -------------------------------------------------------------

  // 1. Fast Moving Items
  const fastMovingData = useMemo(() => {
    const map = new Map<number | string, { id: any; name: string; barcode: string; category: string; qty: number; revenue: number; txCount: number; cost: number }>();
    
    periodInvoices.forEach((inv: any) => {
      let items: any[] = [];
      try { items = typeof inv.items === 'string' ? JSON.parse(inv.items) : (inv.items || []); } catch (_) {}
      items.forEach((it: any) => {
        if (it.quantity <= 0) return; // skip returns in fast-moving calculation
        const key = it.id || it.name;
        const prod = products.find((p: any) => p.id === it.id);
        const existing = map.get(key) || {
          id: it.id,
          name: it.name || prod?.name || 'Product',
          barcode: it.barcode || prod?.barcode || 'N/A',
          category: prod?.category_name || prod?.category || 'General',
          qty: 0,
          revenue: 0,
          txCount: 0,
          cost: prod?.cost_price || 0
        };
        existing.qty += Number(it.quantity || 1);
        existing.revenue += Number((it.price || 0) * (it.quantity || 1)) - Number(it.discount || 0);
        existing.txCount += 1;
        map.set(key, existing);
      });
    });

    const list = Array.from(map.values()).sort((a, b) => b.qty - a.qty);
    const totalQty = list.reduce((s, i) => s + i.qty, 0);
    return list.map((item, idx) => ({
      ...item,
      rank: idx + 1,
      share: totalQty > 0 ? ((item.qty / totalQty) * 100).toFixed(1) + '%' : '0%',
      avgPrice: item.qty > 0 ? (item.revenue / item.qty).toFixed(2) : '0.00',
      profit: item.revenue - (item.cost * item.qty)
    }));
  }, [periodInvoices, products]);

  // 2. Inventory Movement Ledger
  const inventoryMovementData = useMemo(() => {
    // Group movements in the period by product
    const map = new Map<number, { id: number; name: string; barcode: string; category: string; unit: string; current_stock: number; grn_added: number; sold_qty: number; returned_qty: number; adjusted_qty: number; opening_stock: number; net_change: number }>();

    products.forEach((p: any) => {
      map.set(p.id, {
        id: p.id,
        name: p.name,
        barcode: p.barcode || 'N/A',
        category: p.category_name || p.category || 'General',
        unit: p.unit || 'pc',
        current_stock: Number(p.stock || 0),
        grn_added: 0,
        sold_qty: 0,
        returned_qty: 0,
        adjusted_qty: 0,
        opening_stock: Number(p.stock || 0),
        net_change: 0
      });
    });

    periodMovements.forEach((m: any) => {
      const entry = map.get(m.product_id);
      if (entry) {
        const qty = Number(m.qty_change || 0);
        const type = String(m.transaction_type || '').toUpperCase();
        if (type === 'GRN' || type === 'PURCHASE_ORDER' || type === 'PURCHASE') {
          entry.grn_added += Math.abs(qty);
        } else if (type === 'SALE') {
          entry.sold_qty += Math.abs(qty);
        } else if (type === 'REFUND' || type === 'RETURN' || type === 'EXCHANGE') {
          entry.returned_qty += Math.abs(qty);
        } else {
          entry.adjusted_qty += qty;
        }
      }
    });

    // Also factor in period invoices if ledger doesn't have sales backfilled
    periodInvoices.forEach((inv: any) => {
      let items: any[] = [];
      try { items = typeof inv.items === 'string' ? JSON.parse(inv.items) : (inv.items || []); } catch (_) {}
      items.forEach((it: any) => {
        if (!it.id || it.id <= 0) return;
        const entry = map.get(it.id);
        if (entry && entry.sold_qty === 0 && entry.returned_qty === 0) {
          if (it.quantity > 0) entry.sold_qty += Number(it.quantity);
          else if (it.quantity < 0) entry.returned_qty += Math.abs(Number(it.quantity));
        }
      });
    });

    return Array.from(map.values())
      .map(e => {
        const net = e.grn_added - e.sold_qty + e.returned_qty + e.adjusted_qty;
        const opening = e.current_stock - net;
        return {
          ...e,
          opening_stock: opening,
          net_change: net
        };
      })
      .filter(e => e.grn_added > 0 || e.sold_qty > 0 || e.returned_qty > 0 || e.adjusted_qty !== 0 || e.current_stock > 0);
  }, [products, periodMovements, periodInvoices]);

  // 3. Low Stock Report
  const lowStockData = useMemo(() => {
    return products
      .filter((p: any) => Number(p.stock || 0) <= (p.low_stock_alert !== undefined && p.low_stock_alert !== null ? Number(p.low_stock_alert) : 2))
      .map((p: any) => {
        const threshold = (p.low_stock_alert !== undefined && p.low_stock_alert !== null ? Number(p.low_stock_alert) : 2);
        const current = Number(p.stock || 0);
        const deficit = Math.max(0, (threshold * 2) - current);
        const cost = Number(p.cost_price || 0);
        const supplierObj = suppliers.find((s: any) => s.id === p.supplier_id);
        return {
          id: p.id,
          name: p.name,
          barcode: p.barcode || 'N/A',
          category: p.category_name || p.category || 'General',
          current_stock: current,
          threshold,
          deficit,
          unit: p.unit || 'pc',
          cost_price: cost,
          reorder_cost: deficit * cost,
          supplier: supplierObj?.name || 'Standard Wholesaler',
          status: current <= 0 ? 'OUT OF STOCK' : 'LOW STOCK'
        };
      })
      .sort((a, b) => a.current_stock - b.current_stock);
  }, [products, suppliers]);

  // 4. Sold Stock Report (Itemized)
  const soldStockData = useMemo(() => {
    const list: any[] = [];
    periodInvoices.forEach((inv: any) => {
      let items: any[] = [];
      try { items = typeof inv.items === 'string' ? JSON.parse(inv.items) : (inv.items || []); } catch (_) {}
      items.forEach((it: any) => {
        const prod = products.find((p: any) => p.id === it.id);
        const qty = Number(it.quantity || 1);
        const price = Number(it.price || 0);
        const cost = Number(prod?.cost_price || 0);
        const lineTotal = Number((qty * price).toFixed(2));
        const lineCost = Number((qty * cost).toFixed(2));
        const margin = lineTotal - lineCost;
        list.push({
          invoice_id: inv.id,
          invoice_no: `INV-${inv.id}`,
          created_at: inv.created_at,
          name: it.name || prod?.name || 'Product',
          barcode: it.barcode || prod?.barcode || 'N/A',
          quantity: qty,
          unit: it.unit || prod?.unit || 'pc',
          price,
          lineTotal,
          cost,
          margin,
          cashier: inv.cashier || 'Cashier',
          terminal_id: inv.terminal_id || 'TERM-01',
          payment_method: inv.payment_method || 'Cash'
        });
      });
    });
    return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [periodInvoices, products]);

  // 5. Remaining Stock & Valuation Report
  const remainingStockData = useMemo(() => {
    return products.map((p: any) => {
      const stock = Number(p.stock || 0);
      const cost = Number(p.cost_price || 0);
      const price = Number(p.price || 0);
      const wholesale = Number(p.wholesale_price || price);
      const totalCost = Number((stock * cost).toFixed(2));
      const totalRetail = Number((stock * price).toFixed(2));
      const potentialProfit = totalRetail - totalCost;
      const marginPct = totalRetail > 0 ? ((potentialProfit / totalRetail) * 100).toFixed(1) + '%' : '0%';
      return {
        id: p.id,
        item_code: p.item_code || `ITEM-${String(p.id).padStart(5, '0')}`,
        barcode: p.barcode || 'N/A',
        name: p.name,
        category: p.category_name || p.category || 'General',
        stock,
        unit: p.unit || 'pc',
        cost,
        price,
        wholesale,
        totalCost,
        totalRetail,
        potentialProfit,
        marginPct
      };
    }).sort((a, b) => b.totalRetail - a.totalRetail);
  }, [products]);

  // 6. Product List & Barcode Catalog Report
  const productCatalogData = useMemo(() => {
    return products.map((p: any) => ({
      id: p.id,
      item_code: p.item_code || `ITEM-${String(p.id).padStart(5, '0')}`,
      barcode: p.barcode || 'N/A',
      name: p.name,
      category: p.category_name || p.category || 'General',
      price: Number(p.price || 0),
      wholesale_price: Number(p.wholesale_price || p.price || 0),
      cost_price: Number(p.cost_price || 0),
      stock: Number(p.stock || 0),
      unit: p.unit || 'pc',
      status: Number(p.stock || 0) > 0 ? 'Active Stock' : 'Depleted'
    })).sort((a, b) => a.name.localeCompare(b.name));
  }, [products]);

  // 7. Employee Directory & Salary Report
  const employeeSalaryData = useMemo(() => {
    return staffUsers.map((u: any) => {
      const userInvoices = periodInvoices.filter((inv: any) => 
        (inv.cashier || '').toLowerCase() === (u.username || '').toLowerCase()
      );
      const salesCount = userInvoices.length;
      const salesVolume = userInvoices.reduce((s: number, inv: any) => s + (inv.total || 0), 0);
      return {
        id: u.id,
        username: u.username,
        role: u.role || 'Staff',
        branch_id: u.branch_id || 'ALL',
        phone: u.phone || 'N/A',
        nic: u.nic || 'N/A',
        salary: Number(u.salary || 0),
        bank_account: u.bank_account || 'N/A',
        allowed_terminals: u.allowed_terminals || 'ALL',
        salesCount,
        salesVolume
      };
    });
  }, [staffUsers, periodInvoices]);

  // 8. Supplier Orders & Payables Report
  const supplierOrdersData = useMemo(() => {
    return suppliers.map((s: any) => {
      const pos = purchaseOrders.filter((po: any) => po.supplier_id === s.id);
      const payments = supplierPayments.filter((sp: any) => sp.supplier_id === s.id);
      const totalPoAmount = pos.reduce((sum: number, po: any) => sum + Number(po.total_amount || po.total_cost || 0), 0);
      const totalPaid = payments.reduce((sum: number, pay: any) => sum + Number(pay.amount || 0), 0);
      const balanceDue = totalPoAmount - totalPaid;
      return {
        id: s.id,
        name: s.name,
        contact: s.contact || 'N/A',
        phone: s.phone || s.contact || 'N/A',
        poCount: pos.length,
        totalPoAmount,
        totalPaid,
        balanceDue,
        status: balanceDue <= 0 ? 'Settled' : 'Payable Outstanding'
      };
    });
  }, [suppliers, purchaseOrders, supplierPayments]);

  // 9. Promotions & Discounts Report
  const promotionsDiscountsData = useMemo(() => {
    const list: any[] = [];

    // From promotions table
    promotions.forEach((pr: any) => {
      list.push({
        name: pr.name,
        code: pr.code || `PROMO-${pr.id}`,
        type: `Promotion (${pr.discount_type || 'PERCENT'})`,
        value: pr.discount_value ? `${pr.discount_value}${pr.discount_type === 'PERCENT' ? '%' : ' Rs'}` : 'Custom',
        start_date: pr.start_date || 'Ongoing',
        end_date: pr.end_date || 'Ongoing',
        itemsCount: pr.items?.length || 0,
        status: 'Active Campaign'
      });
    });

    // From vouchers table
    vouchers.forEach((v: any) => {
      list.push({
        name: v.name || 'Gift Card Voucher',
        code: v.code,
        type: 'Voucher Code',
        value: `Rs. ${Number(v.amount || 0).toLocaleString()}`,
        start_date: 'Issued',
        end_date: v.expiry_date || 'No Expiry',
        itemsCount: v.restrictions?.length || 0,
        status: v.status || 'ACTIVE'
      });
    });

    // Invoices with applied discount in this period
    const discountedInvoices = periodInvoices.filter((inv: any) => (inv.discount || 0) > 0);
    const totalDiscountAmount = discountedInvoices.reduce((s: number, inv: any) => s + (inv.discount || 0), 0);

    return {
      campaigns: list,
      discountedBillsCount: discountedInvoices.length,
      totalDiscountAmount
    };
  }, [promotions, vouchers, periodInvoices]);

  // 10. Sales Invoices Registry
  const invoicesRegistryData = useMemo(() => {
    return periodInvoices.map((inv: any) => {
      let items: any[] = [];
      try { items = typeof inv.items === 'string' ? JSON.parse(inv.items) : (inv.items || []); } catch (_) {}
      return {
        id: inv.id,
        invoice_no: `INV-${inv.id}`,
        created_at: inv.created_at,
        terminal_id: inv.terminal_id || 'TERM-01',
        cashier: inv.cashier || 'Cashier',
        customer_name: inv.customer_name || 'Walk-in',
        sale_type: inv.sale_type || (inv.total < 0 ? 'REFUND' : 'SALE'),
        payment_method: inv.payment_method || 'Cash',
        items_count: items.reduce((c: number, it: any) => c + Math.abs(Number(it.quantity || 1)), 0),
        subtotal: Number(inv.total || 0) + Number(inv.discount || 0),
        discount: Number(inv.discount || 0),
        total: Number(inv.total || 0)
      };
    }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [periodInvoices]);

  // 11. Refund & Exchange Audit Report
  const refundExchangeData = useMemo(() => {
    const list: any[] = [];
    periodInvoices.forEach((inv: any) => {
      const type = (inv.sale_type || '').toUpperCase();
      let items: any[] = [];
      try { items = typeof inv.items === 'string' ? JSON.parse(inv.items) : (inv.items || []); } catch (_) {}
      const hasNegative = items.some((it: any) => Number(it.quantity) < 0);

      if (type === 'REFUND' || type === 'EXCHANGE' || inv.total < 0 || hasNegative) {
        const returnedItems = items.filter((it: any) => Number(it.quantity) < 0);
        const newItems = items.filter((it: any) => Number(it.quantity) > 0);
        const returnedTotal = returnedItems.reduce((s: number, it: any) => s + (Math.abs(it.quantity) * (it.price || 0)), 0);
        
        list.push({
          id: inv.id,
          invoice_no: `INV-${inv.id}`,
          date: inv.created_at,
          parent_invoice_id: inv.parent_invoice_id ? `INV-${inv.parent_invoice_id}` : 'Direct Register',
          sale_type: type || (returnedItems.length > 0 && newItems.length > 0 ? 'EXCHANGE' : 'REFUND'),
          returned_items_desc: returnedItems.map((it: any) => `${it.name} (x${Math.abs(it.quantity)})`).join(', ') || 'Returned Goods',
          returned_value: returnedTotal,
          net_settlement: inv.total,
          cashier: inv.cashier || 'Cashier',
          terminal_id: inv.terminal_id || 'TERM-01',
          payment_method: inv.payment_method || 'Cash'
        });
      }
    });
    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [periodInvoices]);

  // -------------------------------------------------------------
  // PRINT & PDF EXPORT GENERATOR
  // -------------------------------------------------------------
  const handlePrintReport = () => {
    const storeName = settings.storeName || 'Nova FreshMart';
    const storeTagline = settings.tagline || 'Supermarket Retail Management System';
    const storePhone = settings.phone || '011-2345678';
    const printTime = new Date().toLocaleString();
    const currentUserLabel = currentUser?.username || 'Administrator';

    let reportTitle = '';
    let summaryHtml = '';
    let tableHtml = '';

    const formatCurrency = (val: number) => `Rs. ${Number(val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    if (activeReport === 'fast_moving') {
      reportTitle = 'FAST MOVING PRODUCTS REPORT';
      const totalUnits = fastMovingData.reduce((s, i) => s + i.qty, 0);
      const totalRev = fastMovingData.reduce((s, i) => s + i.revenue, 0);
      summaryHtml = `
        <div class="kpi-grid">
          <div class="kpi-card"><div class="kpi-label">Total Units Sold</div><div class="kpi-val">${totalUnits}</div></div>
          <div class="kpi-card"><div class="kpi-label">Fast-Moving Sales</div><div class="kpi-val">${formatCurrency(totalRev)}</div></div>
          <div class="kpi-card"><div class="kpi-label">Unique Products Sold</div><div class="kpi-val">${fastMovingData.length}</div></div>
        </div>
      `;
      tableHtml = `
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Product Name</th>
              <th>Barcode</th>
              <th>Category</th>
              <th style="text-align:right">Units Sold</th>
              <th style="text-align:right">Avg Price</th>
              <th style="text-align:right">Total Revenue</th>
              <th style="text-align:right">Sales Share</th>
            </tr>
          </thead>
          <tbody>
            ${fastMovingData.map(item => `
              <tr>
                <td>#${item.rank}</td>
                <td><strong>${item.name}</strong></td>
                <td>${item.barcode}</td>
                <td>${item.category}</td>
                <td style="text-align:right">${item.qty}</td>
                <td style="text-align:right">${formatCurrency(Number(item.avgPrice))}</td>
                <td style="text-align:right"><strong>${formatCurrency(item.revenue)}</strong></td>
                <td style="text-align:right">${item.share}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else if (activeReport === 'inventory_movement') {
      reportTitle = 'INVENTORY MOVEMENT & STOCK AUDIT REPORT';
      const totalAdded = inventoryMovementData.reduce((s, i) => s + i.grn_added, 0);
      const totalSold = inventoryMovementData.reduce((s, i) => s + i.sold_qty, 0);
      const totalReturned = inventoryMovementData.reduce((s, i) => s + i.returned_qty, 0);
      summaryHtml = `
        <div class="kpi-grid">
          <div class="kpi-card"><div class="kpi-label">Total GRN Inward</div><div class="kpi-val">+${totalAdded}</div></div>
          <div class="kpi-card"><div class="kpi-label">Total Sales Outward</div><div class="kpi-val">-${totalSold}</div></div>
          <div class="kpi-card"><div class="kpi-label">Returns Restored</div><div class="kpi-val">+${totalReturned}</div></div>
        </div>
      `;
      tableHtml = `
        <table>
          <thead>
            <tr>
              <th>Product Name</th>
              <th>Barcode</th>
              <th>Category</th>
              <th style="text-align:right">Opening</th>
              <th style="text-align:right">Inward (GRN)</th>
              <th style="text-align:right">Sales Out</th>
              <th style="text-align:right">Returns In</th>
              <th style="text-align:right">Adjustments</th>
              <th style="text-align:right">Closing Stock</th>
            </tr>
          </thead>
          <tbody>
            ${inventoryMovementData.map(item => `
              <tr>
                <td><strong>${item.name}</strong></td>
                <td>${item.barcode}</td>
                <td>${item.category}</td>
                <td style="text-align:right">${item.opening_stock} ${item.unit}</td>
                <td style="text-align:right;color:#059669">+${item.grn_added}</td>
                <td style="text-align:right;color:#DC2626">-${item.sold_qty}</td>
                <td style="text-align:right;color:#2563EB">+${item.returned_qty}</td>
                <td style="text-align:right">${item.adjusted_qty >= 0 ? '+' : ''}${item.adjusted_qty}</td>
                <td style="text-align:right"><strong>${item.current_stock} ${item.unit}</strong></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else if (activeReport === 'low_stock') {
      reportTitle = 'LOW STOCK & REORDER DEFICIT REPORT';
      const totalDeficit = lowStockData.reduce((s, i) => s + i.deficit, 0);
      const totalReorderCost = lowStockData.reduce((s, i) => s + i.reorder_cost, 0);
      summaryHtml = `
        <div class="kpi-grid">
          <div class="kpi-card"><div class="kpi-label">Critical Products</div><div class="kpi-val">${lowStockData.length}</div></div>
          <div class="kpi-card"><div class="kpi-label">Total Deficit Units</div><div class="kpi-val">${totalDeficit}</div></div>
          <div class="kpi-card"><div class="kpi-label">Estimated Reorder Cost</div><div class="kpi-val">${formatCurrency(totalReorderCost)}</div></div>
        </div>
      `;
      tableHtml = `
        <table>
          <thead>
            <tr>
              <th>Status</th>
              <th>Product Name</th>
              <th>Barcode</th>
              <th>Category</th>
              <th style="text-align:right">Current Stock</th>
              <th style="text-align:right">Min Alert</th>
              <th style="text-align:right">Deficit Needed</th>
              <th style="text-align:right">Unit Cost</th>
              <th style="text-align:right">Est. Reorder Cost</th>
              <th>Supplier</th>
            </tr>
          </thead>
          <tbody>
            ${lowStockData.map(item => `
              <tr>
                <td><span class="badge ${item.current_stock <= 0 ? 'badge-danger' : 'badge-warning'}">${item.status}</span></td>
                <td><strong>${item.name}</strong></td>
                <td>${item.barcode}</td>
                <td>${item.category}</td>
                <td style="text-align:right"><strong>${item.current_stock} ${item.unit}</strong></td>
                <td style="text-align:right">${item.threshold}</td>
                <td style="text-align:right">${item.deficit}</td>
                <td style="text-align:right">${formatCurrency(item.cost_price)}</td>
                <td style="text-align:right"><strong>${formatCurrency(item.reorder_cost)}</strong></td>
                <td>${item.supplier}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else if (activeReport === 'sold_stock') {
      reportTitle = 'SOLD STOCK ITEMIZATION REPORT';
      const totalUnits = soldStockData.reduce((s, i) => s + i.quantity, 0);
      const totalRev = soldStockData.reduce((s, i) => s + i.lineTotal, 0);
      const totalMargin = soldStockData.reduce((s, i) => s + i.margin, 0);
      summaryHtml = `
        <div class="kpi-grid">
          <div class="kpi-card"><div class="kpi-label">Total Sold Items</div><div class="kpi-val">${soldStockData.length}</div></div>
          <div class="kpi-card"><div class="kpi-label">Total Units Sold</div><div class="kpi-val">${totalUnits}</div></div>
          <div class="kpi-card"><div class="kpi-label">Gross Revenue</div><div class="kpi-val">${formatCurrency(totalRev)}</div></div>
          <div class="kpi-card"><div class="kpi-label">Estimated Gross Margin</div><div class="kpi-val">${formatCurrency(totalMargin)}</div></div>
        </div>
      `;
      tableHtml = `
        <table>
          <thead>
            <tr>
              <th>Invoice #</th>
              <th>Date & Time</th>
              <th>Product Name</th>
              <th>Barcode</th>
              <th style="text-align:right">Qty</th>
              <th style="text-align:right">Unit Price</th>
              <th style="text-align:right">Line Total</th>
              <th style="text-align:right">Margin</th>
              <th>Cashier</th>
            </tr>
          </thead>
          <tbody>
            ${soldStockData.map(item => `
              <tr>
                <td>${item.invoice_no}</td>
                <td>${formatSriLankaDateTime(item.created_at)}</td>
                <td><strong>${item.name}</strong></td>
                <td>${item.barcode}</td>
                <td style="text-align:right">${item.quantity} ${item.unit}</td>
                <td style="text-align:right">${formatCurrency(item.price)}</td>
                <td style="text-align:right"><strong>${formatCurrency(item.lineTotal)}</strong></td>
                <td style="text-align:right;color:#059669">${formatCurrency(item.margin)}</td>
                <td>${item.cashier}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else if (activeReport === 'remaining_stock') {
      reportTitle = 'REMAINING STOCK & INVENTORY VALUATION REPORT';
      const totalUnits = remainingStockData.reduce((s, i) => s + i.stock, 0);
      const totalCostVal = remainingStockData.reduce((s, i) => s + i.totalCost, 0);
      const totalRetailVal = remainingStockData.reduce((s, i) => s + i.totalRetail, 0);
      const totalProfit = totalRetailVal - totalCostVal;
      summaryHtml = `
        <div class="kpi-grid">
          <div class="kpi-card"><div class="kpi-label">Total On-Hand Stock</div><div class="kpi-val">${totalUnits.toLocaleString()} units</div></div>
          <div class="kpi-card"><div class="kpi-label">Total Cost Valuation</div><div class="kpi-val">${formatCurrency(totalCostVal)}</div></div>
          <div class="kpi-card"><div class="kpi-label">Total Retail Valuation</div><div class="kpi-val">${formatCurrency(totalRetailVal)}</div></div>
          <div class="kpi-card"><div class="kpi-label">Potential Gross Profit</div><div class="kpi-val">${formatCurrency(totalProfit)}</div></div>
        </div>
      `;
      tableHtml = `
        <table>
          <thead>
            <tr>
              <th>Item Code</th>
              <th>Barcode</th>
              <th>Product Name</th>
              <th>Category</th>
              <th style="text-align:right">Stock</th>
              <th style="text-align:right">Cost Price</th>
              <th style="text-align:right">Retail Price</th>
              <th style="text-align:right">Total Cost</th>
              <th style="text-align:right">Total Retail</th>
              <th style="text-align:right">Potential Margin</th>
            </tr>
          </thead>
          <tbody>
            ${remainingStockData.map(item => `
              <tr>
                <td>${item.item_code}</td>
                <td>${item.barcode}</td>
                <td><strong>${item.name}</strong></td>
                <td>${item.category}</td>
                <td style="text-align:right"><strong>${item.stock} ${item.unit}</strong></td>
                <td style="text-align:right">${formatCurrency(item.cost)}</td>
                <td style="text-align:right">${formatCurrency(item.price)}</td>
                <td style="text-align:right">${formatCurrency(item.totalCost)}</td>
                <td style="text-align:right"><strong>${formatCurrency(item.totalRetail)}</strong></td>
                <td style="text-align:right;color:#059669">${item.marginPct}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else if (activeReport === 'product_catalog') {
      reportTitle = 'MASTER PRODUCT CATALOG & BARCODE REPORT';
      summaryHtml = `
        <div class="kpi-grid">
          <div class="kpi-card"><div class="kpi-label">Total Catalog Products</div><div class="kpi-val">${productCatalogData.length}</div></div>
          <div class="kpi-card"><div class="kpi-label">Active Stock Items</div><div class="kpi-val">${productCatalogData.filter(p => p.stock > 0).length}</div></div>
        </div>
      `;
      tableHtml = `
        <table>
          <thead>
            <tr>
              <th>Barcode</th>
              <th>Item Code</th>
              <th>Product Name</th>
              <th>Category</th>
              <th style="text-align:right">Retail Price</th>
              <th style="text-align:right">Wholesale Price</th>
              <th style="text-align:right">Cost Price</th>
              <th style="text-align:right">Stock</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${productCatalogData.map(item => `
              <tr>
                <td><strong>${item.barcode}</strong></td>
                <td>${item.item_code}</td>
                <td>${item.name}</td>
                <td>${item.category}</td>
                <td style="text-align:right"><strong>${formatCurrency(item.price)}</strong></td>
                <td style="text-align:right">${formatCurrency(item.wholesale_price)}</td>
                <td style="text-align:right">${formatCurrency(item.cost_price)}</td>
                <td style="text-align:right">${item.stock} ${item.unit}</td>
                <td><span class="badge ${item.stock > 0 ? 'badge-success' : 'badge-danger'}">${item.status}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else if (activeReport === 'employees_salary') {
      reportTitle = 'EMPLOYEE DIRECTORY & PAYROLL REPORT';
      const totalPayroll = employeeSalaryData.reduce((s, i) => s + i.salary, 0);
      const totalSales = employeeSalaryData.reduce((s, i) => s + i.salesVolume, 0);
      summaryHtml = `
        <div class="kpi-grid">
          <div class="kpi-card"><div class="kpi-label">Total Staff Members</div><div class="kpi-val">${employeeSalaryData.length}</div></div>
          <div class="kpi-card"><div class="kpi-label">Total Monthly Payroll Base</div><div class="kpi-val">${formatCurrency(totalPayroll)}</div></div>
          <div class="kpi-card"><div class="kpi-label">Sales Handled in Period</div><div class="kpi-val">${formatCurrency(totalSales)}</div></div>
        </div>
      `;
      tableHtml = `
        <table>
          <thead>
            <tr>
              <th>Staff Username</th>
              <th>Role</th>
              <th>Branch</th>
              <th>Phone</th>
              <th>NIC</th>
              <th style="text-align:right">Basic Salary</th>
              <th>Bank Account</th>
              <th style="text-align:right">Bills Handled</th>
              <th style="text-align:right">Sales Volume</th>
            </tr>
          </thead>
          <tbody>
            ${employeeSalaryData.map(item => `
              <tr>
                <td><strong>${item.username}</strong></td>
                <td>${item.role}</td>
                <td>${item.branch_id}</td>
                <td>${item.phone}</td>
                <td>${item.nic}</td>
                <td style="text-align:right"><strong>${formatCurrency(item.salary)}</strong></td>
                <td>${item.bank_account}</td>
                <td style="text-align:right">${item.salesCount}</td>
                <td style="text-align:right">${formatCurrency(item.salesVolume)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else if (activeReport === 'suppliers_orders') {
      reportTitle = 'SUPPLIER ORDERS & PAYABLES LEDGER';
      const totalPoAmt = supplierOrdersData.reduce((s, i) => s + i.totalPoAmount, 0);
      const totalPaid = supplierOrdersData.reduce((s, i) => s + i.totalPaid, 0);
      const totalDue = supplierOrdersData.reduce((s, i) => s + i.balanceDue, 0);
      summaryHtml = `
        <div class="kpi-grid">
          <div class="kpi-card"><div class="kpi-label">Active Suppliers</div><div class="kpi-val">${supplierOrdersData.length}</div></div>
          <div class="kpi-card"><div class="kpi-label">Total Orders / GRN</div><div class="kpi-val">${formatCurrency(totalPoAmt)}</div></div>
          <div class="kpi-card"><div class="kpi-label">Total Disbursed Paid</div><div class="kpi-val">${formatCurrency(totalPaid)}</div></div>
          <div class="kpi-card"><div class="kpi-label">Outstanding Payables Due</div><div class="kpi-val">${formatCurrency(totalDue)}</div></div>
        </div>
      `;
      tableHtml = `
        <table>
          <thead>
            <tr>
              <th>Supplier Name</th>
              <th>Contact Info</th>
              <th style="text-align:right">POs Count</th>
              <th style="text-align:right">Total Ordered / GRN</th>
              <th style="text-align:right">Total Paid</th>
              <th style="text-align:right">Balance Due</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${supplierOrdersData.map(item => `
              <tr>
                <td><strong>${item.name}</strong></td>
                <td>${item.contact}</td>
                <td style="text-align:right">${item.poCount}</td>
                <td style="text-align:right">${formatCurrency(item.totalPoAmount)}</td>
                <td style="text-align:right;color:#059669">${formatCurrency(item.totalPaid)}</td>
                <td style="text-align:right;color:${item.balanceDue > 0 ? '#DC2626' : '#059669'}"><strong>${formatCurrency(item.balanceDue)}</strong></td>
                <td><span class="badge ${item.balanceDue <= 0 ? 'badge-success' : 'badge-danger'}">${item.status}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else if (activeReport === 'promotions_discounts') {
      reportTitle = 'PROMOTIONS & DISCOUNTS PERIOD REPORT';
      summaryHtml = `
        <div class="kpi-grid">
          <div class="kpi-card"><div class="kpi-label">Discounted Invoices</div><div class="kpi-val">${promotionsDiscountsData.discountedBillsCount}</div></div>
          <div class="kpi-card"><div class="kpi-label">Total Discounts Given</div><div class="kpi-val">${formatCurrency(promotionsDiscountsData.totalDiscountAmount)}</div></div>
          <div class="kpi-card"><div class="kpi-label">Active Campaigns</div><div class="kpi-val">${promotionsDiscountsData.campaigns.length}</div></div>
        </div>
      `;
      tableHtml = `
        <table>
          <thead>
            <tr>
              <th>Campaign Name</th>
              <th>Code</th>
              <th>Type</th>
              <th>Discount Value</th>
              <th>Valid Period</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${promotionsDiscountsData.campaigns.map((item: any) => `
              <tr>
                <td><strong>${item.name}</strong></td>
                <td>${item.code}</td>
                <td>${item.type}</td>
                <td><strong>${item.value}</strong></td>
                <td>${item.start_date} to ${item.end_date}</td>
                <td><span class="badge badge-success">${item.status}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else if (activeReport === 'invoices_registry') {
      reportTitle = 'SALES INVOICES & TRANSACTION REGISTRY';
      const totalRev = invoicesRegistryData.reduce((s, i) => s + i.total, 0);
      const totalDisc = invoicesRegistryData.reduce((s, i) => s + i.discount, 0);
      summaryHtml = `
        <div class="kpi-grid">
          <div class="kpi-card"><div class="kpi-label">Total Invoices</div><div class="kpi-val">${invoicesRegistryData.length}</div></div>
          <div class="kpi-card"><div class="kpi-label">Gross Net Revenue</div><div class="kpi-val">${formatCurrency(totalRev)}</div></div>
          <div class="kpi-card"><div class="kpi-label">Discounts Granted</div><div class="kpi-val">${formatCurrency(totalDisc)}</div></div>
        </div>
      `;
      tableHtml = `
        <table>
          <thead>
            <tr>
              <th>Invoice #</th>
              <th>Date & Time</th>
              <th>Terminal</th>
              <th>Cashier</th>
              <th>Customer</th>
              <th>Type</th>
              <th>Payment</th>
              <th style="text-align:right">Subtotal</th>
              <th style="text-align:right">Discount</th>
              <th style="text-align:right">Net Total</th>
            </tr>
          </thead>
          <tbody>
            ${invoicesRegistryData.map(item => `
              <tr>
                <td><strong>${item.invoice_no}</strong></td>
                <td>${formatSriLankaDateTime(item.created_at)}</td>
                <td>${item.terminal_id}</td>
                <td>${item.cashier}</td>
                <td>${item.customer_name}</td>
                <td><span class="badge ${item.sale_type === 'REFUND' ? 'badge-danger' : item.sale_type === 'EXCHANGE' ? 'badge-warning' : 'badge-success'}">${item.sale_type}</span></td>
                <td>${item.payment_method}</td>
                <td style="text-align:right">${formatCurrency(item.subtotal)}</td>
                <td style="text-align:right;color:#DC2626">${formatCurrency(item.discount)}</td>
                <td style="text-align:right"><strong>${formatCurrency(item.total)}</strong></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else if (activeReport === 'refund_exchange') {
      reportTitle = 'REFUND & EXCHANGE AUDIT TRAIL REPORT';
      const totalRefunded = refundExchangeData.reduce((s, i) => s + i.returned_value, 0);
      summaryHtml = `
        <div class="kpi-grid">
          <div class="kpi-card"><div class="kpi-label">Return Transactions</div><div class="kpi-val">${refundExchangeData.length}</div></div>
          <div class="kpi-card"><div class="kpi-label">Total Returned Value</div><div class="kpi-val">${formatCurrency(totalRefunded)}</div></div>
        </div>
      `;
      tableHtml = `
        <table>
          <thead>
            <tr>
              <th>Date & Time</th>
              <th>Return Invoice #</th>
              <th>Original Invoice #</th>
              <th>Type</th>
              <th>Returned Items</th>
              <th style="text-align:right">Returned Value</th>
              <th style="text-align:right">Net Settlement</th>
              <th>Cashier</th>
              <th>Terminal</th>
            </tr>
          </thead>
          <tbody>
            ${refundExchangeData.map(item => `
              <tr>
                <td>${new Date(item.date).toLocaleString()}</td>
                <td><strong>${item.invoice_no}</strong></td>
                <td>${item.parent_invoice_id}</td>
                <td><span class="badge ${item.sale_type === 'REFUND' ? 'badge-danger' : 'badge-warning'}">${item.sale_type}</span></td>
                <td>${item.returned_items_desc}</td>
                <td style="text-align:right;color:#DC2626"><strong>${formatCurrency(item.returned_value)}</strong></td>
                <td style="text-align:right"><strong>${formatCurrency(item.net_settlement)}</strong></td>
                <td>${item.cashier}</td>
                <td>${item.terminal_id}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${reportTitle} - ${storeName}</title>
          <style>
            @page { size: A4 portrait; margin: 12mm 10mm; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
              color: #0f172a;
              margin: 0;
              padding: 0;
              font-size: 11px;
            }
            .header-table {
              width: 100%;
              border-bottom: 2px solid #008B44;
              padding-bottom: 8px;
              margin-bottom: 12px;
            }
            .store-name {
              font-size: 20px;
              font-weight: 900;
              color: #008B44;
              letter-spacing: -0.5px;
              margin: 0;
            }
            .store-tagline {
              font-size: 10px;
              font-weight: 700;
              color: #64748b;
              text-transform: uppercase;
              letter-spacing: 1px;
              margin: 2px 0;
            }
            .report-title-banner {
              background: #f8fafc;
              border: 1px solid #e2e8f0;
              border-left: 4px solid #008B44;
              padding: 8px 12px;
              margin-bottom: 12px;
              display: flex;
              justify-content: space-between;
              align-items: center;
            }
            .report-title {
              font-size: 14px;
              font-weight: 900;
              color: #0f172a;
              margin: 0;
            }
            .report-meta {
              font-size: 9px;
              color: #64748b;
              font-weight: 600;
            }
            .kpi-grid {
              display: flex;
              gap: 8px;
              margin-bottom: 12px;
            }
            .kpi-card {
              flex: 1;
              background: #f1f5f9;
              border: 1px solid #cbd5e1;
              border-radius: 6px;
              padding: 6px 10px;
            }
            .kpi-label {
              font-size: 8px;
              font-weight: 700;
              text-transform: uppercase;
              color: #64748b;
              letter-spacing: 0.5px;
            }
            .kpi-val {
              font-size: 13px;
              font-weight: 900;
              color: #0f172a;
              margin-top: 2px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              font-size: 10px;
              margin-bottom: 20px;
            }
            th {
              background: #0f172a;
              color: #ffffff;
              font-weight: 700;
              text-align: left;
              padding: 5px 6px;
              font-size: 9px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            td {
              padding: 5px 6px;
              border-bottom: 1px solid #e2e8f0;
              color: #334155;
            }
            tr:nth-child(even) td {
              background: #f8fafc;
            }
            .badge {
              display: inline-block;
              padding: 1px 4px;
              border-radius: 3px;
              font-size: 8px;
              font-weight: 700;
              text-transform: uppercase;
            }
            .badge-success { background: #dcfce7; color: #15803d; }
            .badge-danger { background: #fee2e2; color: #b91c1c; }
            .badge-warning { background: #fef3c7; color: #b45309; }
            .signatures {
              margin-top: 30px;
              display: flex;
              justify-content: space-between;
              padding-top: 20px;
            }
            .sig-block {
              width: 220px;
              border-top: 1px dashed #64748b;
              text-align: center;
              font-size: 9px;
              font-weight: 700;
              color: #475569;
              padding-top: 4px;
            }
            .footer-note {
              margin-top: 15px;
              text-align: center;
              font-size: 8px;
              color: #94a3b8;
              border-top: 1px solid #f1f5f9;
              padding-top: 6px;
            }
          </style>
        </head>
        <body>
          <table class="header-table">
            <tr>
              <td style="border:none;padding:0;">
                <h1 class="store-name">${storeName}</h1>
                <p class="store-tagline">${storeTagline}</p>
                <p style="margin:2px 0 0 0;font-size:9px;color:#64748b;">Phone: ${storePhone} &nbsp;•&nbsp; Supermarket Branch: ${currentUser?.branch_id || 'Main Branch'}</p>
              </td>
              <td style="border:none;padding:0;text-align:right;vertical-align:bottom;">
                <div style="font-size:9px;color:#64748b;font-weight:700;">OFFICIAL SYSTEM REPORT</div>
                <div style="font-size:8px;color:#94a3b8;">Printed: ${printTime}</div>
              </td>
            </tr>
          </table>

          <div class="report-title-banner">
            <div>
              <h2 class="report-title">${reportTitle}</h2>
              <div class="report-meta">Reporting Filter Range: <strong>${dateLabel}</strong></div>
            </div>
            <div style="text-align:right;">
              <div class="report-meta">Generated By: <strong>${currentUserLabel}</strong></div>
              <div class="report-meta">Status: <strong>System Audited</strong></div>
            </div>
          </div>

          ${summaryHtml}
          ${tableHtml}

          <div class="signatures">
            <div class="sig-block">Prepared By: ${currentUserLabel}</div>
            <div class="sig-block">Stock Keeper / Auditor</div>
            <div class="sig-block">Store Manager Approval</div>
          </div>

          <div class="footer-note">
            Nova FreshMart Retail POS System &nbsp;•&nbsp; Confidential Internal Business Document &nbsp;•&nbsp; Page 1 of 1
          </div>

          <script>
            window.onload = function() {
              window.print();
              window.onafterprint = function() { window.close(); };
            };
          </script>
        </body>
      </html>
    `;

    const printWin = window.open('', '_blank', 'width=1000,height=800');
    if (printWin) {
      printWin.document.open();
      printWin.document.write(htmlContent);
      printWin.document.close();
    }
  };

  // Helper search filter
  const applySearch = (items: any[], fields: string[]) => {
    if (!searchTerm.trim()) return items;
    const s = searchTerm.toLowerCase().trim();
    return items.filter(item => {
      return fields.some(f => String(item[f] || '').toLowerCase().includes(s));
    });
  };

  return (
    <div className="bg-[#FAFDFB] p-6 rounded-3xl h-full flex flex-col border border-emerald-100 shadow-sm overflow-hidden">
      
      {/* ── TOP HEADER ── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-5 shrink-0 bg-white p-4 rounded-2xl border border-emerald-100 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <FileText size={18} />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">Nova FreshMart Business Reports</h1>
              <p className="text-xs font-semibold text-slate-500">Comprehensive inventory movements, sales registries, payroll, and supplier ledgers</p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 w-full md:w-auto">
          <button
            onClick={loadAllReportData}
            disabled={loading}
            className="p-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl transition-all border border-emerald-200 cursor-pointer text-xs font-bold flex items-center gap-1.5"
            title="Refresh All Data"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            onClick={handlePrintReport}
            className="flex-1 md:flex-none px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-black text-xs rounded-xl shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Printer size={16} />
            <span>Print / Export PDF</span>
          </button>
        </div>
      </div>

      {/* ── REPORT SELECTION TABS & GROUPS ── */}
      <div className="mb-4 shrink-0 overflow-x-auto pb-1">
        <div className="flex gap-2">
          {reportCategories.map(cat => (
            <div key={cat.id} className="bg-white p-1.5 rounded-2xl border border-emerald-100 flex items-center gap-1 shadow-2xs">
              <span className="text-[10px] font-black uppercase text-emerald-800 px-2 flex items-center gap-1">
                <cat.icon size={13} className="text-emerald-600" />
                <span className="hidden lg:inline">{cat.label}</span>
              </span>
              <div className="flex items-center gap-1">
                {cat.reports.map(rep => {
                  const isActive = activeReport === rep.id;
                  return (
                    <button
                      key={rep.id}
                      onClick={() => setActiveReport(rep.id)}
                      className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                        isActive
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-600 hover:bg-emerald-50 hover:text-emerald-800'
                      }`}
                    >
                      <span>{rep.label}</span>
                      {rep.badge && (
                        <span className={`text-[9px] px-1.5 py-0.2 rounded font-black ${isActive ? 'bg-emerald-800 text-emerald-200' : 'bg-emerald-100 text-emerald-800'}`}>
                          {rep.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── FILTER & SEARCH BAR ── */}
      <div className="bg-white p-3.5 rounded-2xl border border-emerald-100 mb-4 shrink-0 flex flex-col md:flex-row gap-3 justify-between items-center shadow-2xs">
        
        {/* Date Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto">
          <Calendar size={15} className="text-emerald-700 mr-1 hidden sm:inline" />
          <span className="text-xs font-black text-slate-500 mr-1 hidden sm:inline">Period:</span>
          {[
            { id: 'today', label: 'Today' },
            { id: 'yesterday', label: 'Yesterday' },
            { id: 'week', label: '7 Days' },
            { id: 'month', label: 'This Month' },
            { id: 'all', label: 'All Time' },
            { id: 'custom', label: 'Custom' }
          ].map(p => (
            <button
              key={p.id}
              onClick={() => setDatePeriod(p.id)}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                datePeriod === p.id 
                  ? 'bg-slate-900 text-white' 
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              {p.label}
            </button>
          ))}

          {datePeriod === 'custom' && (
            <div className="flex items-center gap-1.5 mt-2 sm:mt-0">
              <input
                type="date"
                value={customStart}
                onChange={e => setCustomStart(e.target.value)}
                className="px-2.5 py-1 text-xs border border-slate-300 rounded-lg outline-none font-bold"
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={e => setCustomEnd(e.target.value)}
                className="px-2.5 py-1 text-xs border border-slate-300 rounded-lg outline-none font-bold"
              />
            </div>
          )}
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-72">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search report items..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-200 focus:border-emerald-600 rounded-xl text-xs font-bold outline-none"
          />
        </div>
      </div>

      {/* ── REPORT CONTENT CONTAINER ── */}
      <div className="flex-1 bg-white rounded-2xl border border-emerald-100 shadow-sm flex flex-col min-h-0 overflow-hidden">
        
        {/* REPORT HEADER SUMMARY */}
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center shrink-0">
          <div>
            <span className="text-[11px] font-black uppercase tracking-wider text-emerald-800">
              Active Report:
            </span>
            <span className="ml-2 font-black text-slate-900 text-sm">
              {reportCategories.flatMap(c => c.reports).find(r => r.id === activeReport)?.label}
            </span>
            <span className="ml-2 text-xs font-semibold text-slate-500">
              • Filter: {dateLabel}
            </span>
          </div>
        </div>

        {/* TABLE CONTENT */}
        <div className="flex-1 overflow-auto p-4">
          
          {/* 1. FAST MOVING ITEMS */}
          {activeReport === 'fast_moving' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                  <span className="text-[10px] font-bold uppercase text-emerald-800">Total Units Sold</span>
                  <div className="text-xl font-black text-emerald-950 mt-1">{fastMovingData.reduce((s, i) => s + i.qty, 0)}</div>
                </div>
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                  <span className="text-[10px] font-bold uppercase text-emerald-800">Total Sales Value</span>
                  <div className="text-xl font-black text-emerald-950 mt-1">Rs. {fastMovingData.reduce((s, i) => s + i.revenue, 0).toLocaleString()}</div>
                </div>
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                  <span className="text-[10px] font-bold uppercase text-emerald-800">Top Moving Product</span>
                  <div className="text-sm font-black text-emerald-950 mt-1 truncate">{fastMovingData[0]?.name || 'N/A'}</div>
                </div>
              </div>

              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                    <th className="py-2.5 px-3">Rank</th>
                    <th className="py-2.5 px-3">Product Name</th>
                    <th className="py-2.5 px-3">Barcode</th>
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3 text-right">Units Sold</th>
                    <th className="py-2.5 px-3 text-right">Avg Price</th>
                    <th className="py-2.5 px-3 text-right">Total Revenue</th>
                    <th className="py-2.5 px-3 text-right">Sales Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {applySearch(fastMovingData, ['name', 'barcode', 'category']).map(row => (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-black text-emerald-700">#{row.rank}</td>
                      <td className="py-2.5 px-3 font-bold text-slate-900">{row.name}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-500">{row.barcode}</td>
                      <td className="py-2.5 px-3 text-slate-600">{row.category}</td>
                      <td className="py-2.5 px-3 text-right font-black text-slate-900">{row.qty}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600">Rs. {row.avgPrice}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-black text-emerald-800">Rs. {row.revenue.toLocaleString()}</td>
                      <td className="py-2.5 px-3 text-right font-semibold text-slate-600">{row.share}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 2. INVENTORY MOVEMENT REPORT */}
          {activeReport === 'inventory_movement' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                  <span className="text-[10px] font-bold uppercase text-emerald-800">Total GRN Inward</span>
                  <div className="text-xl font-black text-emerald-950 mt-1">+{inventoryMovementData.reduce((s, i) => s + i.grn_added, 0)}</div>
                </div>
                <div className="p-3 bg-rose-50 rounded-xl border border-rose-200">
                  <span className="text-[10px] font-bold uppercase text-rose-800">Total Sales Out</span>
                  <div className="text-xl font-black text-rose-950 mt-1">-{inventoryMovementData.reduce((s, i) => s + i.sold_qty, 0)}</div>
                </div>
                <div className="p-3 bg-blue-50 rounded-xl border border-blue-200">
                  <span className="text-[10px] font-bold uppercase text-blue-800">Returns Restored</span>
                  <div className="text-xl font-black text-blue-950 mt-1">+{inventoryMovementData.reduce((s, i) => s + i.returned_qty, 0)}</div>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold uppercase text-slate-700">Net Movement</span>
                  <div className="text-xl font-black text-slate-900 mt-1">{inventoryMovementData.reduce((s, i) => s + i.net_change, 0)}</div>
                </div>
              </div>

              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                    <th className="py-2.5 px-3">Product Name</th>
                    <th className="py-2.5 px-3">Barcode</th>
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3 text-right">Opening Stock</th>
                    <th className="py-2.5 px-3 text-right">Inward (GRN)</th>
                    <th className="py-2.5 px-3 text-right">Sales Out</th>
                    <th className="py-2.5 px-3 text-right">Returns In</th>
                    <th className="py-2.5 px-3 text-right">Adjustments</th>
                    <th className="py-2.5 px-3 text-right">Closing Stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {applySearch(inventoryMovementData, ['name', 'barcode', 'category']).map(row => (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-bold text-slate-900">{row.name}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-500">{row.barcode}</td>
                      <td className="py-2.5 px-3 text-slate-600">{row.category}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold">{row.opening_stock} {row.unit}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">+{row.grn_added}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-600">-{row.sold_qty}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-blue-600">+{row.returned_qty}</td>
                      <td className="py-2.5 px-3 text-right font-mono">{row.adjusted_qty >= 0 ? `+${row.adjusted_qty}` : row.adjusted_qty}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-black text-slate-900 bg-slate-50">{row.current_stock} {row.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 3. LOW STOCK REPORT */}
          {activeReport === 'low_stock' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
                  <span className="text-[10px] font-bold uppercase text-amber-800">Critical Low Stock Products</span>
                  <div className="text-xl font-black text-amber-950 mt-1">{lowStockData.length} items</div>
                </div>
                <div className="p-3 bg-red-50 rounded-xl border border-red-200">
                  <span className="text-[10px] font-bold uppercase text-red-800">Out of Stock Depleted</span>
                  <div className="text-xl font-black text-red-950 mt-1">{lowStockData.filter(i => i.current_stock <= 0).length} items</div>
                </div>
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                  <span className="text-[10px] font-bold uppercase text-emerald-800">Estimated Reorder Cost</span>
                  <div className="text-xl font-black text-emerald-950 mt-1">Rs. {lowStockData.reduce((s, i) => s + i.reorder_cost, 0).toLocaleString()}</div>
                </div>
              </div>

              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Product Name</th>
                    <th className="py-2.5 px-3">Barcode</th>
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3 text-right">In Stock</th>
                    <th className="py-2.5 px-3 text-right">Min Alert</th>
                    <th className="py-2.5 px-3 text-right">Deficit Needed</th>
                    <th className="py-2.5 px-3 text-right">Unit Cost</th>
                    <th className="py-2.5 px-3 text-right">Est. Reorder Cost</th>
                    <th className="py-2.5 px-3">Supplier</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {applySearch(lowStockData, ['name', 'barcode', 'category', 'supplier']).map(row => (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black ${row.current_stock <= 0 ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
                          {row.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-bold text-slate-900">{row.name}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-500">{row.barcode}</td>
                      <td className="py-2.5 px-3 text-slate-600">{row.category}</td>
                      <td className="py-2.5 px-3 text-right font-black text-red-600">{row.current_stock} {row.unit}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-500">{row.threshold}</td>
                      <td className="py-2.5 px-3 text-right font-bold text-amber-700">+{row.deficit}</td>
                      <td className="py-2.5 px-3 text-right font-mono">Rs. {row.cost_price.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-800">Rs. {row.reorder_cost.toLocaleString()}</td>
                      <td className="py-2.5 px-3 text-slate-600">{row.supplier}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 4. SOLD STOCK REPORT */}
          {activeReport === 'sold_stock' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                  <span className="text-[10px] font-bold uppercase text-emerald-800">Sold Records</span>
                  <div className="text-xl font-black text-emerald-950 mt-1">{soldStockData.length} lines</div>
                </div>
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                  <span className="text-[10px] font-bold uppercase text-emerald-800">Total Units Sold</span>
                  <div className="text-xl font-black text-emerald-950 mt-1">{soldStockData.reduce((s, i) => s + i.quantity, 0)}</div>
                </div>
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                  <span className="text-[10px] font-bold uppercase text-emerald-800">Gross Sales Value</span>
                  <div className="text-xl font-black text-emerald-950 mt-1">Rs. {soldStockData.reduce((s, i) => s + i.lineTotal, 0).toLocaleString()}</div>
                </div>
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                  <span className="text-[10px] font-bold uppercase text-emerald-800">Est. Gross Margin</span>
                  <div className="text-xl font-black text-emerald-950 mt-1">Rs. {soldStockData.reduce((s, i) => s + i.margin, 0).toLocaleString()}</div>
                </div>
              </div>

              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                    <th className="py-2.5 px-3">Invoice #</th>
                    <th className="py-2.5 px-3">Date & Time</th>
                    <th className="py-2.5 px-3">Product Name</th>
                    <th className="py-2.5 px-3">Barcode</th>
                    <th className="py-2.5 px-3 text-right">Qty</th>
                    <th className="py-2.5 px-3 text-right">Unit Price</th>
                    <th className="py-2.5 px-3 text-right">Line Total</th>
                    <th className="py-2.5 px-3 text-right">Margin</th>
                    <th className="py-2.5 px-3">Cashier</th>
                    <th className="py-2.5 px-3">Terminal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {applySearch(soldStockData, ['invoice_no', 'name', 'barcode', 'cashier', 'terminal_id']).map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono font-bold text-emerald-800">{row.invoice_no}</td>
                      <td className="py-2.5 px-3 text-slate-500">{formatSriLankaDateTime(row.created_at)}</td>
                      <td className="py-2.5 px-3 font-bold text-slate-900">{row.name}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-500">{row.barcode}</td>
                      <td className="py-2.5 px-3 text-right font-black">{row.quantity} {row.unit}</td>
                      <td className="py-2.5 px-3 text-right font-mono">Rs. {row.price.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-black text-slate-900">Rs. {row.lineTotal.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">Rs. {row.margin.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-slate-600">{row.cashier}</td>
                      <td className="py-2.5 px-3 text-slate-500 font-mono text-[10px]">{row.terminal_id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 5. REMAINING STOCK VALUATION REPORT */}
          {activeReport === 'remaining_stock' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                  <span className="text-[10px] font-bold uppercase text-emerald-800">Total Units in Stock</span>
                  <div className="text-xl font-black text-emerald-950 mt-1">{remainingStockData.reduce((s, i) => s + i.stock, 0).toLocaleString()}</div>
                </div>
                <div className="p-3 bg-slate-100 rounded-xl border border-slate-300">
                  <span className="text-[10px] font-bold uppercase text-slate-700">Total Asset Cost</span>
                  <div className="text-xl font-black text-slate-900 mt-1">Rs. {remainingStockData.reduce((s, i) => s + i.totalCost, 0).toLocaleString()}</div>
                </div>
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                  <span className="text-[10px] font-bold uppercase text-emerald-800">Total Retail Value</span>
                  <div className="text-xl font-black text-emerald-950 mt-1">Rs. {remainingStockData.reduce((s, i) => s + i.totalRetail, 0).toLocaleString()}</div>
                </div>
                <div className="p-3 bg-emerald-100 rounded-xl border border-emerald-300">
                  <span className="text-[10px] font-bold uppercase text-emerald-900">Potential Profit</span>
                  <div className="text-xl font-black text-emerald-900 mt-1">Rs. {(remainingStockData.reduce((s, i) => s + i.totalRetail, 0) - remainingStockData.reduce((s, i) => s + i.totalCost, 0)).toLocaleString()}</div>
                </div>
              </div>

              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                    <th className="py-2.5 px-3">Item Code</th>
                    <th className="py-2.5 px-3">Barcode</th>
                    <th className="py-2.5 px-3">Product Name</th>
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3 text-right">Stock</th>
                    <th className="py-2.5 px-3 text-right">Cost Price</th>
                    <th className="py-2.5 px-3 text-right">Retail Price</th>
                    <th className="py-2.5 px-3 text-right">Total Cost</th>
                    <th className="py-2.5 px-3 text-right">Total Retail</th>
                    <th className="py-2.5 px-3 text-right">Potential Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {applySearch(remainingStockData, ['item_code', 'barcode', 'name', 'category']).map(row => (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono text-slate-500">{row.item_code}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-500">{row.barcode}</td>
                      <td className="py-2.5 px-3 font-bold text-slate-900">{row.name}</td>
                      <td className="py-2.5 px-3 text-slate-600">{row.category}</td>
                      <td className="py-2.5 px-3 text-right font-black text-slate-900">{row.stock} {row.unit}</td>
                      <td className="py-2.5 px-3 text-right font-mono">Rs. {row.cost.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold">Rs. {row.price.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600">Rs. {row.totalCost.toLocaleString()}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-black text-emerald-800">Rs. {row.totalRetail.toLocaleString()}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">{row.marginPct}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 6. PRODUCT CATALOG & BARCODE REPORT */}
          {activeReport === 'product_catalog' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                  <span className="text-[10px] font-bold uppercase text-emerald-800">Catalog Count</span>
                  <div className="text-xl font-black text-emerald-950 mt-1">{productCatalogData.length} items</div>
                </div>
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                  <span className="text-[10px] font-bold uppercase text-emerald-800">Active Stock</span>
                  <div className="text-xl font-black text-emerald-950 mt-1">{productCatalogData.filter(i => i.stock > 0).length} items</div>
                </div>
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                  <span className="text-[10px] font-bold uppercase text-emerald-800">Depleted / Zero Stock</span>
                  <div className="text-xl font-black text-emerald-950 mt-1">{productCatalogData.filter(i => i.stock <= 0).length} items</div>
                </div>
              </div>

              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                    <th className="py-2.5 px-3">Barcode</th>
                    <th className="py-2.5 px-3">Item Code</th>
                    <th className="py-2.5 px-3">Product Name</th>
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3 text-right">Retail Price</th>
                    <th className="py-2.5 px-3 text-right">Wholesale Price</th>
                    <th className="py-2.5 px-3 text-right">Cost Price</th>
                    <th className="py-2.5 px-3 text-right">Stock</th>
                    <th className="py-2.5 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {applySearch(productCatalogData, ['barcode', 'item_code', 'name', 'category']).map(row => (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono font-bold text-emerald-800">{row.barcode}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-500">{row.item_code}</td>
                      <td className="py-2.5 px-3 font-bold text-slate-900">{row.name}</td>
                      <td className="py-2.5 px-3 text-slate-600">{row.category}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-black text-emerald-800">Rs. {row.price.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-right font-mono">Rs. {row.wholesale_price.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-500">Rs. {row.cost_price.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-right font-black">{row.stock} {row.unit}</td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black ${row.stock > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 7. EMPLOYEE DIRECTORY & SALARY REPORT */}
          {activeReport === 'employees_salary' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                  <span className="text-[10px] font-bold uppercase text-emerald-800">Total Staff</span>
                  <div className="text-xl font-black text-emerald-950 mt-1">{employeeSalaryData.length} employees</div>
                </div>
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                  <span className="text-[10px] font-bold uppercase text-emerald-800">Total Monthly Payroll</span>
                  <div className="text-xl font-black text-emerald-950 mt-1">Rs. {employeeSalaryData.reduce((s, i) => s + i.salary, 0).toLocaleString()}</div>
                </div>
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                  <span className="text-[10px] font-bold uppercase text-emerald-800">Sales Handled in Period</span>
                  <div className="text-xl font-black text-emerald-950 mt-1">Rs. {employeeSalaryData.reduce((s, i) => s + i.salesVolume, 0).toLocaleString()}</div>
                </div>
              </div>

              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                    <th className="py-2.5 px-3">Username</th>
                    <th className="py-2.5 px-3">Role</th>
                    <th className="py-2.5 px-3">Branch</th>
                    <th className="py-2.5 px-3">Phone</th>
                    <th className="py-2.5 px-3">NIC</th>
                    <th className="py-2.5 px-3 text-right">Basic Salary</th>
                    <th className="py-2.5 px-3">Bank Account</th>
                    <th className="py-2.5 px-3 text-right">Bills Handled</th>
                    <th className="py-2.5 px-3 text-right">Sales Volume</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {applySearch(employeeSalaryData, ['username', 'role', 'phone', 'nic']).map(row => (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-bold text-slate-900">{row.username}</td>
                      <td className="py-2.5 px-3"><span className="px-2 py-0.5 rounded bg-slate-100 font-black text-[10px] text-slate-700">{row.role}</span></td>
                      <td className="py-2.5 px-3 text-slate-600">{row.branch_id}</td>
                      <td className="py-2.5 px-3 text-slate-600">{row.phone}</td>
                      <td className="py-2.5 px-3 text-slate-600">{row.nic}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-black text-emerald-800">Rs. {row.salary.toLocaleString()}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">{row.bank_account}</td>
                      <td className="py-2.5 px-3 text-right font-black">{row.salesCount}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">Rs. {row.salesVolume.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 8. SUPPLIER ORDERS & PAYABLES REPORT */}
          {activeReport === 'suppliers_orders' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                  <span className="text-[10px] font-bold uppercase text-emerald-800">Active Suppliers</span>
                  <div className="text-xl font-black text-emerald-950 mt-1">{supplierOrdersData.length} suppliers</div>
                </div>
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                  <span className="text-[10px] font-bold uppercase text-emerald-800">Total Ordered / GRN</span>
                  <div className="text-xl font-black text-emerald-950 mt-1">Rs. {supplierOrdersData.reduce((s, i) => s + i.totalPoAmount, 0).toLocaleString()}</div>
                </div>
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                  <span className="text-[10px] font-bold uppercase text-emerald-800">Total Paid Out</span>
                  <div className="text-xl font-black text-emerald-950 mt-1">Rs. {supplierOrdersData.reduce((s, i) => s + i.totalPaid, 0).toLocaleString()}</div>
                </div>
                <div className="p-3 bg-rose-50 rounded-xl border border-rose-200">
                  <span className="text-[10px] font-bold uppercase text-rose-800">Outstanding Balance Due</span>
                  <div className="text-xl font-black text-rose-950 mt-1">Rs. {supplierOrdersData.reduce((s, i) => s + i.balanceDue, 0).toLocaleString()}</div>
                </div>
              </div>

              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                    <th className="py-2.5 px-3">Supplier Name</th>
                    <th className="py-2.5 px-3">Contact</th>
                    <th className="py-2.5 px-3 text-right">POs Count</th>
                    <th className="py-2.5 px-3 text-right">Total Ordered / GRN</th>
                    <th className="py-2.5 px-3 text-right">Total Paid</th>
                    <th className="py-2.5 px-3 text-right">Balance Due</th>
                    <th className="py-2.5 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {applySearch(supplierOrdersData, ['name', 'contact']).map(row => (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-bold text-slate-900">{row.name}</td>
                      <td className="py-2.5 px-3 text-slate-600">{row.contact}</td>
                      <td className="py-2.5 px-3 text-right font-black">{row.poCount}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold">Rs. {row.totalPoAmount.toLocaleString()}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">Rs. {row.totalPaid.toLocaleString()}</td>
                      <td className={`py-2.5 px-3 text-right font-mono font-black ${row.balanceDue > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>Rs. {row.balanceDue.toLocaleString()}</td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black ${row.balanceDue <= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 9. PROMOTIONS & DISCOUNTS REPORT */}
          {activeReport === 'promotions_discounts' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                  <span className="text-[10px] font-bold uppercase text-emerald-800">Discounted Invoices in Period</span>
                  <div className="text-xl font-black text-emerald-950 mt-1">{promotionsDiscountsData.discountedBillsCount} invoices</div>
                </div>
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                  <span className="text-[10px] font-bold uppercase text-emerald-800">Total Customer Discounts Granted</span>
                  <div className="text-xl font-black text-emerald-950 mt-1">Rs. {promotionsDiscountsData.totalDiscountAmount.toLocaleString()}</div>
                </div>
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                  <span className="text-[10px] font-bold uppercase text-emerald-800">Active Campaign Setup</span>
                  <div className="text-xl font-black text-emerald-950 mt-1">{promotionsDiscountsData.campaigns.length} rules</div>
                </div>
              </div>

              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                    <th className="py-2.5 px-3">Promotion / Voucher Name</th>
                    <th className="py-2.5 px-3">Code</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Discount Value</th>
                    <th className="py-2.5 px-3">Validity Period</th>
                    <th className="py-2.5 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {applySearch(promotionsDiscountsData.campaigns, ['name', 'code', 'type']).map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-bold text-slate-900">{row.name}</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-emerald-800">{row.code}</td>
                      <td className="py-2.5 px-3 text-slate-600">{row.type}</td>
                      <td className="py-2.5 px-3 font-black text-slate-900">{row.value}</td>
                      <td className="py-2.5 px-3 text-slate-500">{row.start_date} to {row.end_date}</td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-black">
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 10. SALES INVOICES & TRANSACTION REGISTRY */}
          {activeReport === 'invoices_registry' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                  <span className="text-[10px] font-bold uppercase text-emerald-800">Total Period Invoices</span>
                  <div className="text-xl font-black text-emerald-950 mt-1">{invoicesRegistryData.length} bills</div>
                </div>
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                  <span className="text-[10px] font-bold uppercase text-emerald-800">Gross Sales Value</span>
                  <div className="text-xl font-black text-emerald-950 mt-1">Rs. {invoicesRegistryData.reduce((s, i) => s + i.total, 0).toLocaleString()}</div>
                </div>
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                  <span className="text-[10px] font-bold uppercase text-emerald-800">Total Discounts</span>
                  <div className="text-xl font-black text-emerald-950 mt-1">Rs. {invoicesRegistryData.reduce((s, i) => s + i.discount, 0).toLocaleString()}</div>
                </div>
              </div>

              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                    <th className="py-2.5 px-3">Invoice #</th>
                    <th className="py-2.5 px-3">Date & Time</th>
                    <th className="py-2.5 px-3">Terminal</th>
                    <th className="py-2.5 px-3">Cashier</th>
                    <th className="py-2.5 px-3">Customer</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Payment</th>
                    <th className="py-2.5 px-3 text-right">Subtotal</th>
                    <th className="py-2.5 px-3 text-right">Discount</th>
                    <th className="py-2.5 px-3 text-right">Net Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {applySearch(invoicesRegistryData, ['invoice_no', 'cashier', 'customer_name', 'terminal_id']).map(row => (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono font-bold text-emerald-800">{row.invoice_no}</td>
                      <td className="py-2.5 px-3 text-slate-500">{formatSriLankaDateTime(row.created_at)}</td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">{row.terminal_id}</td>
                      <td className="py-2.5 px-3 font-semibold text-slate-800">{row.cashier}</td>
                      <td className="py-2.5 px-3 text-slate-600">{row.customer_name}</td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black ${row.sale_type === 'REFUND' ? 'bg-red-100 text-red-800' : row.sale_type === 'EXCHANGE' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                          {row.sale_type}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">{row.payment_method}</td>
                      <td className="py-2.5 px-3 text-right font-mono">Rs. {row.subtotal.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-rose-600">Rs. {row.discount.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-black text-slate-900">Rs. {row.total.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 11. REFUND & EXCHANGE REPORT */}
          {activeReport === 'refund_exchange' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-red-50 rounded-xl border border-red-200">
                  <span className="text-[10px] font-bold uppercase text-red-800">Return Events</span>
                  <div className="text-xl font-black text-red-950 mt-1">{refundExchangeData.length} records</div>
                </div>
                <div className="p-3 bg-red-50 rounded-xl border border-red-200">
                  <span className="text-[10px] font-bold uppercase text-red-800">Total Returned Stock Value</span>
                  <div className="text-xl font-black text-red-950 mt-1">Rs. {refundExchangeData.reduce((s, i) => s + i.returned_value, 0).toLocaleString()}</div>
                </div>
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                  <span className="text-[10px] font-bold uppercase text-emerald-800">Net Refund Cash Flow</span>
                  <div className="text-xl font-black text-emerald-950 mt-1">Rs. {refundExchangeData.reduce((s, i) => s + i.net_settlement, 0).toLocaleString()}</div>
                </div>
              </div>

              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                    <th className="py-2.5 px-3">Date & Time</th>
                    <th className="py-2.5 px-3">Return Invoice #</th>
                    <th className="py-2.5 px-3">Original Invoice #</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Returned Items Description</th>
                    <th className="py-2.5 px-3 text-right">Returned Value</th>
                    <th className="py-2.5 px-3 text-right">Net Settlement</th>
                    <th className="py-2.5 px-3">Cashier</th>
                    <th className="py-2.5 px-3">Terminal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {applySearch(refundExchangeData, ['invoice_no', 'parent_invoice_id', 'returned_items_desc', 'cashier']).map(row => (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 text-slate-500">{new Date(row.date).toLocaleString()}</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-red-700">{row.invoice_no}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">{row.parent_invoice_id}</td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black ${row.sale_type === 'REFUND' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
                          {row.sale_type}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-800 max-w-xs truncate">{row.returned_items_desc}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-red-600">Rs. {row.returned_value.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-black text-slate-900">Rs. {row.net_settlement.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-slate-600">{row.cashier}</td>
                      <td className="py-2.5 px-3 font-mono text-[10px] text-slate-500">{row.terminal_id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}