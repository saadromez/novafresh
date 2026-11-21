import { create } from 'zustand'

export interface Product {
  id: number
  name: string
  price: number
  stock: number
  barcode?: string
  attributes?: string
  unit?: string
  wholesale_price?: number
  cost_price?: number
  branch_id?: string
  category_id?: number
  is_scale_item?: boolean | number
  plu?: string
  allow_price_override?: boolean | number
  expiry_date?: string
}

export interface CartItem extends Product {
  cartId: string
  quantity: number
  discount: number
  discountPercent?: number
  discountType?: 'percent' | 'fixed'
  variantId?: number
  variantName?: string
  unit?: string
  is_custom?: boolean
  is_return?: boolean
  is_damaged?: boolean
  return_condition?: 'restock' | 'damage'
  custom_notes?: string
  parentInvoiceId?: number
  originalInvoiceId?: number
  promoName?: string
  isPromoDiscount?: boolean
}

export interface CartStore {
  items: CartItem[]
  customerId: string | null
  customerName: string | null
  parentInvoiceId: number | null
  billDiscount: { type: 'percent' | 'fixed'; value: number }
  isPromoBillDiscount?: boolean
  loyaltyDiscountAmount: number
  redeemedLoyaltyPoints: number
  activePromoTitle: string | null
  setCustomer: (id: string | null, name: string | null) => void
  setParentInvoiceId: (id: number | null) => void
  addItem: (product: Product, variant?: any, quantity?: number) => void
  addReturnItem: (item: { id: number; name: string; price: number; quantity: number; variantId?: number; unit?: string; barcode?: string; originalInvoiceId?: number; is_damaged?: boolean; return_condition?: 'restock' | 'damage' }) => void
  addCustomItem: (custom: { name: string; price: number; quantity: number; unit?: string; notes?: string }) => void
  removeItem: (cartId: string) => void
  updateQuantity: (cartId: string, quantity: number) => void
  updatePrice: (cartId: string, price: number) => void
  applyDiscount: (cartId: string, discount: number) => void
  applyItemDiscount: (cartId: string, type: 'percent' | 'fixed', value: number, promoName?: string, isPromo?: boolean) => void
  removeItemDiscount: (cartId: string) => void
  setBillDiscount: (type: 'percent' | 'fixed', value: number) => void
  clearBillDiscount: () => void
  getBillDiscountAmount: () => number
  setLoyaltyRedemption: (points: number, amount: number) => void
  clearLoyaltyRedemption: () => void
  setActivePromoTitle: (title: string | null) => void
  applyAutoPromotions: (activePromotions: any[]) => void
  clearPromoDiscounts: () => void
  clearCart: () => void
  restoreCart: (items: any[], customerId?: string | null, customerName?: string | null, billDiscount?: { type: 'percent' | 'fixed'; value: number }) => void
  getTotal: () => number
  getSubtotal: () => number
  getDiscountTotal: () => number
}

export const useCartStore = create<CartStore>((set, get) => ({
  items: [],
  customerId: null,
  customerName: null,
  parentInvoiceId: null,
  billDiscount: { type: 'fixed', value: 0 },
  isPromoBillDiscount: false,
  loyaltyDiscountAmount: 0,
  redeemedLoyaltyPoints: 0,
  activePromoTitle: null,
  setCustomer: (id, name) => set({ customerId: id, customerName: name }),
  setParentInvoiceId: (id) => set({ parentInvoiceId: id }),
  setBillDiscount: (type, value) => set({
    billDiscount: { type, value: Math.max(0, Number(value) || 0) },
    isPromoBillDiscount: false
  }),
  clearBillDiscount: () => set({
    billDiscount: { type: 'fixed', value: 0 },
    isPromoBillDiscount: false
  }),
  getBillDiscountAmount: () => {
    const { billDiscount, getSubtotal } = get();
    if (!billDiscount || billDiscount.value <= 0) return 0;
    const sub = getSubtotal();
    if (billDiscount.type === 'percent') {
      return Number(((sub * Math.min(100, billDiscount.value)) / 100).toFixed(2));
    }
    return Number(Math.min(sub, billDiscount.value).toFixed(2));
  },
  setLoyaltyRedemption: (points, amount) => set({
    redeemedLoyaltyPoints: Math.max(0, Number(points) || 0),
    loyaltyDiscountAmount: Math.max(0, Number(amount) || 0)
  }),
  clearLoyaltyRedemption: () => set({
    redeemedLoyaltyPoints: 0,
    loyaltyDiscountAmount: 0
  }),
  setActivePromoTitle: (title) => set({ activePromoTitle: title }),
  addItem: (product, variant = null, quantity = 1) => set((state) => {
    // Strictly convert quantity to Number to prevent any accidental string concatenation (e.g. '1' + 1 = '11')
    const qtyToAdd = Math.max(0.001, Number(quantity) || 1);
    const existing = state.items.find(i => i.id === product.id && i.variantId === variant?.id);
    const availableStock = variant ? Number(variant.stock) : Number(product.stock);
    
    if (existing) {
      const existingQty = Number(existing.quantity) || 0;
      const newQty = Number((existingQty + qtyToAdd).toFixed(3));
      if (newQty > availableStock) {
        alert(`Cannot add more. Only ${availableStock} in stock.`);
        return { items: state.items };
      }
      return {
        items: state.items.map(i => {
          if (i.cartId !== existing.cartId) return i;
          let disc = i.discount;
          if (i.discountType === 'percent' && i.discountPercent) {
            disc = Number((((i.price * newQty) * i.discountPercent) / 100).toFixed(2));
          }
          return { ...i, quantity: newQty, discount: disc };
        })
      };
    }
    
    if (qtyToAdd > availableStock) {
      alert(`Cannot add more. Only ${availableStock} in stock.`);
      return { items: state.items };
    }
    
    return {
      items: [...state.items, { 
        ...product, 
        unit: (product.unit && !/^\d+$/.test(String(product.unit).trim())) ? product.unit : 'pc',
        cartId: Math.random().toString(36).substr(2, 9), 
        quantity: Number(qtyToAdd.toFixed(3)), 
        discount: 0,
        variantId: variant?.id,
        variantName: variant?.name,
        stock: availableStock
      }]
    };
  }),
  addReturnItem: (ret) => set((state) => {
    const qty = -Math.abs(Number(ret.quantity) || 1);
    const returnItem: CartItem = {
      id: ret.id,
      name: ret.name.startsWith('[RETURN') ? ret.name : `[RETURN #${ret.originalInvoiceId || 'INV'}] ${ret.name}`,
      price: Number(ret.price) || 0,
      quantity: Number(qty.toFixed(3)),
      discount: 0,
      stock: 999999,
      unit: ret.unit || 'pc',
      is_custom: false,
      is_return: true,
      is_damaged: ret.is_damaged,
      return_condition: ret.return_condition,
      variantId: ret.variantId,
      originalInvoiceId: ret.originalInvoiceId,
      parentInvoiceId: ret.originalInvoiceId,
      cartId: `ret_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`
    };
    return { 
      items: [...state.items, returnItem],
      parentInvoiceId: ret.originalInvoiceId || state.parentInvoiceId
    };
  }),
  addCustomItem: (custom) => set((state) => {
    const qty = Number(Number(custom.quantity || 1).toFixed(3));
    const prc = Number(custom.price || 0);
    const customItem: CartItem = {
      id: -(Math.floor(Date.now() % 10000000) + Math.floor(Math.random() * 1000)),
      name: custom.name.trim() || 'Custom Product',
      price: prc,
      quantity: qty,
      discount: 0,
      stock: 999999,
      unit: custom.unit || 'pc',
      is_custom: true,
      custom_notes: custom.notes || '',
      cartId: `custom_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`
    };
    return { items: [...state.items, customItem] };
  }),
  removeItem: (cartId) => set((state) => ({
    items: state.items.filter(i => i.cartId !== cartId)
  })),
  updateQuantity: (cartId, quantity) => set((state) => ({
    items: state.items.map(i => {
      if (i.cartId === cartId) {
        const parsed = Number(Number(quantity).toFixed(3));
        if (!i.is_custom && !i.is_return && parsed > i.stock && parsed > 0) {
          alert(`Cannot increase quantity. Only ${i.stock} in stock.`);
          return { ...i, quantity: i.stock };
        }
        const updatedQty = parsed !== 0 ? parsed : 1;
        let disc = i.discount;
        if (i.discountType === 'percent' && i.discountPercent) {
          disc = Number((((i.price * updatedQty) * i.discountPercent) / 100).toFixed(2));
        }
        return { ...i, quantity: updatedQty, discount: disc };
      }
      return i;
    })
  })),
  updatePrice: (cartId, price) => set((state) => ({
    items: state.items.map(i => {
      if (i.cartId === cartId) {
        const newPrice = Math.max(0, price);
        let disc = i.discount;
        if (i.discountType === 'percent' && i.discountPercent) {
          disc = Number((((newPrice * i.quantity) * i.discountPercent) / 100).toFixed(2));
        }
        return { ...i, price: newPrice, discount: disc };
      }
      return i;
    })
  })),
  applyDiscount: (cartId, discount) => set((state) => ({
    items: state.items.map(i => i.cartId === cartId ? { ...i, discount: Math.max(0, Number(discount) || 0) } : i)
  })),
  applyItemDiscount: (cartId, type, value, promoName, isPromo = false) => set((state) => ({
    items: state.items.map(item => {
      if (item.cartId !== cartId) return item;
      const lineGross = Math.abs(item.price * item.quantity);
      let discAmount = 0;
      if (type === 'percent') {
        const pct = Math.min(100, Math.max(0, Number(value) || 0));
        discAmount = Number(((lineGross * pct) / 100).toFixed(2));
        return { 
          ...item, 
          discount: discAmount, 
          discountType: 'percent', 
          discountPercent: pct,
          promoName: isPromo ? promoName : undefined,
          isPromoDiscount: isPromo
        };
      } else {
        discAmount = Math.min(lineGross, Math.max(0, Number(value) || 0));
        const pct = lineGross > 0 ? Number(((discAmount / lineGross) * 100).toFixed(1)) : 0;
        return { 
          ...item, 
          discount: discAmount, 
          discountType: 'fixed', 
          discountPercent: pct,
          promoName: isPromo ? promoName : undefined,
          isPromoDiscount: isPromo
        };
      }
    })
  })),
  removeItemDiscount: (cartId) => set((state) => ({
    items: state.items.map(i => i.cartId === cartId ? { 
      ...i, 
      discount: 0, 
      discountPercent: 0, 
      discountType: undefined,
      promoName: undefined,
      isPromoDiscount: false 
    } : i)
  })),
  applyAutoPromotions: (activePromotions: any[]) => set((state) => {
    if (!activePromotions || activePromotions.length === 0) {
      const hasPromoItems = state.items.some(i => i.isPromoDiscount);
      const hasPromoBill = state.isPromoBillDiscount;
      if (!hasPromoItems && !hasPromoBill && !state.activePromoTitle) {
        return state;
      }
      return {
        items: state.items.map(i => i.isPromoDiscount ? {
          ...i,
          discount: 0,
          discountPercent: 0,
          discountType: undefined,
          promoName: undefined,
          isPromoDiscount: false
        } : i),
        activePromoTitle: null,
        billDiscount: state.isPromoBillDiscount ? { type: 'fixed', value: 0 } : state.billDiscount,
        isPromoBillDiscount: false
      };
    }

    let modified = false;
    const appliedPromoNames = new Set<string>();

    const updatedItems = state.items.map(item => {
      // If item is a return or custom item without positive catalog product ID, skip
      if (item.is_return || !item.id || item.id < 0) return item;

      // If cashier manually applied an F3 discount, keep it untouched!
      if (item.discount > 0 && !item.isPromoDiscount) {
        return item;
      }

      // Check item-targeted promotions
      let bestPromo: any = null;
      let maxDiscountVal = 0;

      for (const promo of activePromotions) {
        if (promo.items && promo.items.length > 0) {
          const matchedTarget = promo.items.find((pi: any) => 
            (Number(pi.product_id) === Number(item.id) || (pi.barcode && item.barcode && pi.barcode === item.barcode)) && 
            Math.abs(item.quantity) >= (Number(pi.required_qty) || 1)
          );
          if (matchedTarget) {
            const lineGross = Math.abs(item.price * item.quantity);
            const discVal = promo.discount_type === 'PERCENT'
              ? Number(((lineGross * Math.min(100, Number(promo.discount_value) || 0)) / 100).toFixed(2))
              : Math.min(lineGross, Number(promo.discount_value) || 0);

            if (discVal > maxDiscountVal) {
              maxDiscountVal = discVal;
              bestPromo = promo;
            }
          }
        }
      }

      if (bestPromo && maxDiscountVal > 0) {
        appliedPromoNames.add(bestPromo.name);
        const isPercent = bestPromo.discount_type === 'PERCENT';
        const pct = isPercent 
          ? Number(bestPromo.discount_value) 
          : (item.price * item.quantity > 0 ? Number(((maxDiscountVal / (item.price * item.quantity)) * 100).toFixed(1)) : 0);

        const dType: 'percent' | 'fixed' = isPercent ? 'percent' : 'fixed';

        // Check if item already has exact same values
        if (
          item.isPromoDiscount === true &&
          item.promoName === bestPromo.name &&
          item.discount === maxDiscountVal &&
          item.discountType === dType &&
          item.discountPercent === pct
        ) {
          return item; // Unchanged
        }

        modified = true;
        return {
          ...item,
          discount: maxDiscountVal,
          discountType: dType,
          discountPercent: pct,
          promoName: bestPromo.name,
          isPromoDiscount: true
        };
      } else {
        // If it previously had a promo discount but no longer qualifies, reset it
        if (item.isPromoDiscount) {
          modified = true;
          return {
            ...item,
            discount: 0,
            discountPercent: 0,
            discountType: undefined,
            promoName: undefined,
            isPromoDiscount: false
          };
        }
        return item;
      }
    });

    // Check storewide promotions (promotions without specific item targets)
    let newBillDiscount = state.billDiscount;
    let isPromoBill = state.isPromoBillDiscount || false;
    const storewidePromos = activePromotions.filter(p => !p.items || p.items.length === 0);

    if (storewidePromos.length > 0 && (state.billDiscount.value === 0 || isPromoBill)) {
      const bestStorewide = storewidePromos[0];
      const type: 'percent' | 'fixed' = bestStorewide.discount_type === 'PERCENT' ? 'percent' : 'fixed';
      const val = Number(bestStorewide.discount_value) || 0;
      if (state.billDiscount.value !== val || state.billDiscount.type !== type || !isPromoBill) {
        newBillDiscount = { type, value: val };
        isPromoBill = true;
        modified = true;
      }
      appliedPromoNames.add(bestStorewide.name);
    } else if (isPromoBill && storewidePromos.length === 0) {
      newBillDiscount = { type: 'fixed', value: 0 };
      isPromoBill = false;
      modified = true;
    }

    const newPromoTitle = appliedPromoNames.size > 0 
      ? Array.from(appliedPromoNames).join(', ') 
      : null;

    if (state.activePromoTitle !== newPromoTitle) {
      modified = true;
    }

    if (!modified) {
      return state;
    }

    return {
      items: updatedItems,
      billDiscount: newBillDiscount,
      isPromoBillDiscount: isPromoBill,
      activePromoTitle: newPromoTitle
    };
  }),
  clearPromoDiscounts: () => set((state) => ({
    items: state.items.map(i => i.isPromoDiscount ? {
      ...i,
      discount: 0,
      discountPercent: 0,
      discountType: undefined,
      promoName: undefined,
      isPromoDiscount: false
    } : i),
    billDiscount: state.isPromoBillDiscount ? { type: 'fixed', value: 0 } : state.billDiscount,
    isPromoBillDiscount: false,
    activePromoTitle: null
  })),
  clearCart: () => set({ 
    items: [], 
    customerId: null, 
    customerName: null, 
    parentInvoiceId: null,
    billDiscount: { type: 'fixed', value: 0 },
    isPromoBillDiscount: false,
    loyaltyDiscountAmount: 0,
    redeemedLoyaltyPoints: 0,
    activePromoTitle: null
  }),
  restoreCart: (newItems, customerId = null, customerName = null, billDiscount = { type: 'fixed', value: 0 }) => set({
    items: (newItems || []).map((item: any) => ({
      ...item,
      cartId: item.cartId || Math.random().toString(36).substr(2, 9),
      quantity: Number(item.quantity) || 1,
      price: Number(item.price) || 0,
      discount: Number(item.discount) || 0,
      discountPercent: item.discountPercent ? Number(item.discountPercent) : 0,
      discountType: item.discountType || undefined,
      unit: (item.unit && !/^\d+$/.test(String(item.unit).trim())) ? item.unit : 'pc',
      stock: item.stock !== undefined && item.stock !== null ? Number(item.stock) : 999999,
      is_custom: item.isCustom || item.is_custom || false,
      is_return: item.is_return || false,
      custom_notes: item.notes || item.custom_notes || ''
    })),
    customerId: customerId || null,
    customerName: customerName || null,
    parentInvoiceId: null,
    billDiscount: billDiscount || { type: 'fixed', value: 0 },
    isPromoBillDiscount: false,
    redeemedLoyaltyPoints: 0,
    loyaltyDiscountAmount: 0,
    activePromoTitle: null
  }),
  getSubtotal: () => get().items.reduce((total, item) => total + (item.price * item.quantity), 0),
  getDiscountTotal: () => {
    const state = get();
    const itemsDiscount = state.items.reduce((total, item) => total + (Number(item.discount) || 0), 0);
    const billDiscount = state.getBillDiscountAmount();
    const loyaltyDiscount = Number(state.loyaltyDiscountAmount) || 0;
    return Number((itemsDiscount + billDiscount + loyaltyDiscount).toFixed(2));
  },
  getTotal: () => {
    const state = get();
    return Math.max(0, Number((state.getSubtotal() - state.getDiscountTotal()).toFixed(2)));
  }
}))
