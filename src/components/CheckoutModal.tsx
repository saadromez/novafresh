import React, { useState, useEffect } from 'react';
import { Wallet, CreditCard, Landmark, User, X, CheckCircle, Tag, Check, AlertCircle, AlertTriangle, Award, Coins } from 'lucide-react';

export default function CheckoutModal({ total, onComplete, onCancel, customer, cartItems, initialVoucher, settings }: any) {
  const [cash, setCash] = useState('')
  const [card, setCard] = useState('')
  const [bank, setBank] = useState('')
  const [credit, setCredit] = useState('')
  
  // Voucher state
  const [voucherCode, setVoucherCode] = useState(initialVoucher?.code || '')
  const [voucherData, setVoucherData] = useState<any>(initialVoucher || null)
  const [isOverridden, setIsOverridden] = useState(initialVoucher?.isOverride || false)
  const [voucherError, setVoucherError] = useState('')
  const [isValidating, setIsValidating] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Loyalty Points Redemption State
  const [redeemedPoints, setRedeemedPoints] = useState<number>(0)
  const pointValueRs = Number(settings?.loyalty_point_value_rs) > 0 ? Number(settings.loyalty_point_value_rs) : 1.0;
  const loyaltyEnabled = settings?.loyalty_enabled !== false && settings?.loyalty_enabled !== 'false';
  const minRedeemPoints = Number(settings?.loyalty_min_redeem_points) > 0 ? Number(settings.loyalty_min_redeem_points) : 1;
  const customerPoints = Number(customer?.points) || 0;
  const maxRedeemablePoints = Math.min(customerPoints, Math.ceil(total / pointValueRs));
  const numPointsDiscount = Number((redeemedPoints * pointValueRs).toFixed(2));

  const numCash = Number(cash) || 0;
  const numCard = Number(card) || 0;
  const numBank = Number(bank) || 0;
  const numCredit = Number(credit) || 0;

  // Voucher covers up to its remaining value, or cart total
  const numVoucher = voucherData 
    ? (voucherData.isCartSufficient || isOverridden ? Math.min(total, voucherData.remainingValue) : 0)
    : 0;

  const isRefund = total < 0;
  const paid = isRefund ? 0 : numCash + numCard + numBank + numCredit + numVoucher + numPointsDiscount;
  const balance = total - paid;
  const change = paid > total && numCash > 0 ? paid - total : 0;
  const isValid = isRefund ? true : (paid >= total || balance <= 0.001);

  const handleValidateVoucher = async () => {
    const code = voucherCode.trim();
    if (!code) return;
    setIsValidating(true);
    setVoucherError('');
    try {
      // @ts-ignore
      const res = await window.db.invoke('validate-voucher', { code, cartItems });
      setIsValidating(false);
      if (!res.valid) {
        setVoucherError(res.message);
        setVoucherData(null);
        setIsOverridden(false);
      } else {
        setVoucherData(res);
        setIsOverridden(false);
      }
    } catch (e: any) {
      setIsValidating(false);
      setVoucherError(e.message || 'Failed to validate voucher');
      setVoucherData(null);
    }
  };

  const removeVoucher = () => {
    setVoucherCode('');
    setVoucherData(null);
    setIsOverridden(false);
    setVoucherError('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || isSubmitting) return;
    setIsSubmitting(true);

    if (isRefund) {
      onComplete({
        method: 'Refund',
        split: { cash: 0, card: 0, bank: 0, credit: 0, voucher: 0 },
        change: 0,
        voucherId: null
      });
      return;
    }

    let primaryMethod = 'Cash';
    if (numCard > numCash) primaryMethod = 'Card';
    if (numBank > numCard && numBank > numCash) primaryMethod = 'Bank';
    if (numVoucher > numCard && numVoucher > numCash && numVoucher > numBank) primaryMethod = 'Voucher';
    if (numCredit > numCash && numCredit > numCard && numCredit > numBank && numCredit > numVoucher) primaryMethod = 'Credit';

    onComplete({ 
      method: primaryMethod, 
      split: { 
        cash: numCash > change ? numCash - change : 0, 
        card: numCard, 
        bank: numBank, 
        credit: numCredit,
        voucher: numVoucher,
        pointsDiscount: numPointsDiscount
      }, 
      change,
      claimedPoints: redeemedPoints,
      pointsDiscount: numPointsDiscount,
      voucherId: voucherData ? voucherData.voucherId : null,
      voucherAmount: voucherData ? voucherData.remainingValue : 0,
      isVoucherOverride: isOverridden
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl flex overflow-hidden max-h-[90vh]">
        
        {/* Left Side: Summary */}
        <div className="w-1/3 bg-[#FAFAFA] p-8 border-r border-gray-100 flex flex-col justify-between">
          <div>
            <h3 className="text-gray-400 font-bold text-[10px] uppercase tracking-widest mb-2">Total Due</h3>
            <p className="text-4xl font-black text-brand-dark mb-8">Rs. {total.toLocaleString()}</p>
            
            <div className="space-y-4">
              <div className="flex justify-between items-center text-sm border-b border-gray-100 pb-2">
                <span className="text-gray-500 font-medium">Customer</span>
                <span className="font-bold text-brand-dark">{customer ? customer.name : 'Walk-in'}</span>
              </div>
              
              {numVoucher > 0 && (
                <div className="flex justify-between items-center text-sm border-b border-gray-100 pb-2">
                  <span className="text-brand-secondary font-bold flex items-center"><Tag size={14} className="mr-1"/> Voucher</span>
                  <span className="font-bold text-brand-secondary">- Rs. {numVoucher.toLocaleString()}</span>
                </div>
              )}

              {numPointsDiscount > 0 && (
                <div className="flex justify-between items-center text-sm border-b border-gray-100 pb-2">
                  <span className="text-amber-600 font-bold flex items-center"><Award size={14} className="mr-1"/> Loyalty Points ({redeemedPoints} pts)</span>
                  <span className="font-bold text-amber-600">- Rs. {numPointsDiscount.toLocaleString()}</span>
                </div>
              )}
              
              <div className="flex justify-between items-center text-sm pt-2">
                <span className="text-gray-500 font-bold uppercase text-[10px] tracking-widest">Total Tendered</span>
                <span className="font-black text-brand-dark">Rs. {paid.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div>
            {isRefund ? (
              <div className="bg-orange-100 p-5 rounded-2xl border border-orange-200 text-center">
                <p className="text-orange-600 font-bold text-[10px] uppercase tracking-widest mb-1">Refund Amount</p>
                <p className="text-3xl font-black text-orange-600">Rs. {Math.abs(total).toLocaleString()}</p>
              </div>
            ) : change > 0 ? (
              <div className="bg-brand-secondary/10 p-5 rounded-2xl border border-brand-secondary/20 text-center animate-pulse">
                <p className="text-brand-secondary font-bold text-[10px] uppercase tracking-widest mb-1">Change Due</p>
                <p className="text-3xl font-black text-brand-secondary">Rs. {change.toLocaleString()}</p>
              </div>
            ) : balance > 0.001 ? (
              <div className="bg-brand-primary/10 p-5 rounded-2xl border border-brand-primary/20 text-center">
                <p className="text-brand-primary font-bold text-[10px] uppercase tracking-widest mb-1">Remaining Balance</p>
                <p className="text-3xl font-black text-brand-primary">Rs. {balance.toLocaleString()}</p>
              </div>
            ) : (
              <div className="bg-[#E8F5E9] p-5 rounded-2xl border border-[#C8E6C9] text-center">
                <CheckCircle size={32} className="text-[#4CAF50] mx-auto mb-2" />
                <p className="text-[#2E7D32] font-bold">Ready to Complete</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Inputs */}
        <div className="flex-1 p-8 overflow-y-auto">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-black text-brand-dark tracking-tight">Payment Checkout</h2>
            <button onClick={onCancel} className="text-gray-400 hover:text-brand-primary transition-colors bg-gray-50 p-2 rounded-full"><X size={20}/></button>
          </div>

          <form onSubmit={handleSubmit} className="flex-1 flex flex-col justify-center">
            {isRefund ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4">
                <AlertCircle size={64} className="text-orange-500" />
                <h2 className="text-2xl font-black text-gray-800">Process Refund</h2>
                <p className="text-gray-500">You are about to issue a refund of <span className="font-bold text-gray-800">Rs. {Math.abs(total).toLocaleString()}</span> to the customer.</p>
              </div>
            ) : (
              <>
                {/* Customer Loyalty Points Redemption Section */}
                {customer && loyaltyEnabled && (
                  <div className="bg-amber-50/60 border border-amber-200 rounded-2xl p-4 mb-4">
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="text-[10px] font-bold text-amber-900 uppercase tracking-widest flex items-center gap-1.5">
                        <Award size={13} className="text-amber-600" />
                        <span>Loyalty Points • {customer.name}</span>
                      </label>
                      <span className="text-xs font-black text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-full border border-amber-300">
                        {customerPoints} pts (Worth Rs. {(customerPoints * pointValueRs).toFixed(2)})
                      </span>
                    </div>

                    {customerPoints < minRedeemPoints ? (
                      <p className="text-[11px] text-amber-700 font-medium">
                        Minimum <strong>{minRedeemPoints} points</strong> required to redeem (Customer currently has {customerPoints} pts).
                      </p>
                    ) : (
                      <div className="space-y-2 mt-2">
                        <div className="flex items-center gap-2">
                          <input 
                            type="number" 
                            min="0"
                            max={maxRedeemablePoints}
                            value={redeemedPoints || ''}
                            onChange={e => {
                              const val = Math.max(0, Math.min(Number(e.target.value) || 0, maxRedeemablePoints));
                              setRedeemedPoints(val);
                            }}
                            placeholder={`Points to redeem (Max ${maxRedeemablePoints})`}
                            className="flex-1 px-4 py-2.5 rounded-xl border border-amber-200 focus:border-amber-500 bg-white outline-none font-black text-sm text-slate-800"
                          />
                          <button
                            type="button"
                            onClick={() => setRedeemedPoints(maxRedeemablePoints)}
                            className="px-3.5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                          >
                            Redeem Max ({maxRedeemablePoints} pts)
                          </button>
                          {redeemedPoints > 0 && (
                            <button
                              type="button"
                              onClick={() => setRedeemedPoints(0)}
                              className="px-3 py-2.5 bg-white border border-gray-200 hover:bg-gray-100 text-gray-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                        {redeemedPoints > 0 && (
                          <div className="flex items-center justify-between text-xs font-bold text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
                            <span>✓ {redeemedPoints} Points Redeemed</span>
                            <span>Discount: -Rs. {numPointsDiscount.toFixed(2)} (1 pt = Rs. {pointValueRs})</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Voucher Section */}
                <div className="bg-brand-secondary/5 border border-brand-secondary/20 rounded-2xl p-4 mb-4">
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 flex items-center">
                    <Tag size={12} className="mr-1" /> Apply Gift Card / Voucher
                  </label>
                  {!voucherData ? (
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        placeholder="Enter Voucher Code (e.g. TEST)" 
                        className="flex-1 px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-secondary outline-none font-bold text-sm bg-white uppercase" 
                        value={voucherCode} 
                        onChange={e => setVoucherCode(e.target.value.toUpperCase())} 
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleValidateVoucher(); } }}
                      />
                      <button 
                        type="button" 
                        onClick={handleValidateVoucher} 
                        disabled={!voucherCode.trim() || isValidating} 
                        className="bg-brand-secondary text-white px-5 rounded-xl font-bold text-sm disabled:opacity-50 hover:bg-opacity-90 transition-all shadow-sm"
                      >
                        {isValidating ? '...' : 'Apply'}
                      </button>
                    </div>
                  ) : (
                    <div>
                      <div className="flex justify-between items-center bg-white p-3 rounded-xl border border-brand-secondary/30">
                        <div className="flex items-center">
                          <CheckCircle size={18} className="text-brand-secondary mr-2 shrink-0" />
                          <div>
                            <p className="font-bold text-sm text-brand-dark flex items-center gap-1.5">
                              {voucherData.code}
                              {voucherData.name && <span className="text-xs text-gray-400 font-normal">({voucherData.name})</span>}
                            </p>
                            <p className="text-[10px] text-gray-500 font-medium">
                              Voucher Value: Rs. {voucherData.remainingValue.toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center">
                          <span className="font-black text-brand-secondary mr-3">
                            - Rs. {numVoucher.toLocaleString()}
                          </span>
                          <button type="button" onClick={removeVoucher} className="text-gray-400 hover:text-red-500 p-1"><X size={16}/></button>
                        </div>
                      </div>

                      {/* Cart shortage notification with cashier override */}
                      {!voucherData.isCartSufficient && !isOverridden && (
                        <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-3">
                          <div className="flex items-start">
                            <AlertTriangle size={16} className="text-amber-600 mr-2 mt-0.5 shrink-0" />
                            <div className="flex-1">
                              <p className="text-xs font-bold text-amber-900">
                                Cart (Rs. {total.toLocaleString()}) is below voucher value (Rs. {voucherData.remainingValue.toLocaleString()})
                              </p>
                              <p className="text-[11px] text-amber-700 mt-0.5">
                                Short by <strong>Rs. {voucherData.deficit.toLocaleString()}</strong>. Customer should add more items, or you can override to redeem without change.
                              </p>
                              <button
                                type="button"
                                onClick={() => setIsOverridden(true)}
                                className="mt-2.5 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white px-3.5 py-1.5 rounded-lg transition-colors shadow-sm"
                              >
                                Override & Redeem (Forfeit Rs. {voucherData.deficit.toLocaleString()})
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Active override badge */}
                      {isOverridden && (
                        <div className="mt-2.5 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 flex justify-between items-center">
                          <div>
                            <p className="text-xs font-bold text-emerald-800">Cashier Override Active</p>
                            <p className="text-[10px] text-emerald-600">Covers cart in full. Rs. {voucherData.deficit?.toLocaleString()} forfeited by customer.</p>
                          </div>
                          <button type="button" onClick={() => setIsOverridden(false)} className="text-xs text-emerald-700 font-bold underline">
                            Cancel Override
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  {voucherError && <p className="text-xs text-red-500 font-bold mt-2 flex items-center"><AlertCircle size={12} className="mr-1 shrink-0"/>{voucherError}</p>}
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-black text-emerald-950 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                      <span className="flex items-center gap-1.5"><Wallet size={14} className="text-emerald-700"/> Cash Tender</span>
                      <span className="text-[10px] text-emerald-800 font-bold">Quick Touch Keys Below</span>
                    </label>
                    <div className="relative">
                      <Wallet className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-700" size={20} />
                      <input 
                        type="number" 
                        placeholder="Cash Amount (Rs)" 
                        className="w-full pl-12 pr-4 py-3.5 rounded-xl border-2 border-emerald-200 focus:border-emerald-600 outline-none font-black text-2xl bg-emerald-50/20 text-slate-900 transition-all focus:ring-2 focus:ring-emerald-600/20" 
                        value={cash} 
                        onChange={e => setCash(e.target.value)} 
                        autoFocus={!voucherData} 
                      />
                    </div>
                    {/* Quick Cash Buttons */}
                    <div className="grid grid-cols-5 gap-2 mt-2">
                      {[500, 1000, 2000, 5000].map(amt => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setCash(String(amt))}
                          className="py-2 px-2 bg-emerald-50 hover:bg-emerald-100 active:scale-95 text-emerald-900 font-black text-xs rounded-xl border border-emerald-200 text-center transition-all shadow-xs"
                        >
                          Rs {amt}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          const rem = Math.max(0, total - numCard - numBank - numCredit - numVoucher);
                          setCash(rem > 0 ? String(rem) : String(total));
                        }}
                        className="py-2 px-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs rounded-xl text-center transition-all shadow-md shadow-emerald-600/20"
                      >
                        Exact
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 pt-2 border-t border-gray-100">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center gap-1">
                        <CreditCard size={13} className="text-blue-600"/> Card / PDQ
                      </label>
                      <input 
                        type="number" 
                        placeholder="0.00" 
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-emerald-600 outline-none font-black text-base bg-gray-50 transition-all" 
                        value={card} 
                        onChange={e => setCard(e.target.value)} 
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center gap-1">
                        <Landmark size={13} className="text-purple-600"/> Bank / QR
                      </label>
                      <input 
                        type="number" 
                        placeholder="0.00" 
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-emerald-600 outline-none font-black text-base bg-gray-50 transition-all" 
                        value={bank} 
                        onChange={e => setBank(e.target.value)} 
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center gap-1">
                        <User size={13} className="text-amber-600"/> Credit
                      </label>
                      <input 
                        type="number" 
                        placeholder="0.00" 
                        disabled={!customer} 
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-emerald-600 outline-none font-black text-base bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all" 
                        value={credit} 
                        onChange={e => setCredit(e.target.value)} 
                        title={!customer ? "Select a customer first to use credit" : ""} 
                      />
                    </div>
                  </div>
                </div>

                <button 
                  type="submit" 
                  disabled={!isValid || isSubmitting} 
                  className="w-full mt-6 bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-2xl font-black text-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xl shadow-emerald-600/30 flex items-center justify-center gap-2 active:scale-[0.99]"
                >
                  <Check size={22} /> {isSubmitting ? 'Processing Transaction...' : 'Complete Transaction (Enter)'}
                </button>
              </>
            )}
          </form>

        </div>
      </div>
    </div>
  );
}