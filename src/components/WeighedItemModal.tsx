import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Scale, Droplet, X, Check, ArrowRight } from 'lucide-react';
import { 
  WEIGHT_PRESETS, 
  VOLUME_PRESETS, 
  formatQuantityWithUnit, 
  isWeightUnit, 
  isVolumeUnit 
} from '../utils/units';

interface WeighedItemModalProps {
  product: any;
  existingQuantity?: number;
  isEditing?: boolean;
  onConfirm: (quantity: number, unit: string, customPrice?: number) => void;
  onClose: () => void;
}

export default function WeighedItemModal({
  product,
  existingQuantity,
  isEditing = false,
  onConfirm,
  onClose
}: WeighedItemModalProps) {
  const baseUnit = (product.unit || 'kg').toLowerCase().trim();
  const isWeight = isWeightUnit(baseUnit);
  const isVolume = isVolumeUnit(baseUnit);

  // Default mode: For kg products, default to 'kg' (supports typing .200) or 'g'
  const [mode, setMode] = useState<'kg' | 'g' | 'l' | 'ml'>(() => {
    if (isWeight) {
      if (baseUnit === 'g') return 'g';
      return 'kg';
    }
    if (isVolume) {
      if (baseUnit === 'ml') return 'ml';
      return 'l';
    }
    return 'kg';
  });

  // Raw string input for weight/quantity
  const [inputValue, setInputValue] = useState<string>(() => {
    if (existingQuantity) {
      if (mode === 'g' || mode === 'ml') {
        return String(Math.round(existingQuantity * 1000));
      }
      return String(existingQuantity);
    }
    return '';
  });

  // Editable price per unit (Each Price)
  const [priceInput, setPriceInput] = useState<string>(() => {
    return product.price !== undefined && product.price !== null ? String(product.price) : '';
  });

  // Calculate actual normalized quantity (in kg or L)
  const calculateQuantity = (): number => {
    if (!inputValue || inputValue === '.') return 0;
    const raw = parseFloat(inputValue);
    if (isNaN(raw) || raw <= 0) return 0;

    if (mode === 'g' || mode === 'ml') {
      return Number((raw / 1000).toFixed(4));
    }
    return Number(raw.toFixed(4));
  };

  const currentQty = calculateQuantity();
  const effectivePrice = parseFloat(priceInput) >= 0 ? parseFloat(priceInput) : Number(product.price || 0);
  const lineTotal = Number((currentQty * effectivePrice).toFixed(2));

  // Handle mode toggle
  const handleModeChange = (newMode: 'kg' | 'g' | 'l' | 'ml') => {
    if (newMode === mode) return;
    const currentNorm = calculateQuantity();
    setMode(newMode);
    if (currentNorm > 0) {
      if (newMode === 'g' || newMode === 'ml') {
        setInputValue(String(Math.round(currentNorm * 1000)));
      } else {
        setInputValue(String(currentNorm));
      }
    }
  };

  // Keyboard navigation & shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleConfirm();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const handleKeypadPress = (val: string) => {
    if (val === 'C') {
      setInputValue('');
    } else if (val === 'DEL') {
      setInputValue(prev => prev.slice(0, -1));
    } else if (val === '.') {
      if (!inputValue.includes('.')) {
        setInputValue(prev => (prev === '' ? '0.' : prev + '.'));
      }
    } else if (val === '+0.1') {
      const q = calculateQuantity();
      const updated = q + 0.1;
      if (mode === 'g' || mode === 'ml') {
        setInputValue(String(Math.round(updated * 1000)));
      } else {
        setInputValue(String(Number(updated.toFixed(3))));
      }
    } else {
      // Append digit or 00
      setInputValue(prev => prev + val);
    }
  };

  const handlePresetClick = (presetValue: number) => {
    if (mode === 'g' || mode === 'ml') {
      setInputValue(String(Math.round(presetValue * 1000)));
    } else {
      setInputValue(String(presetValue));
    }
  };

  const isOverrideAllowed = product?.allow_price_override !== 0 && product?.allow_price_override !== false;

  const handleConfirm = () => {
    const qty = calculateQuantity();
    if (qty <= 0) {
      alert('Please enter a valid weight or quantity (e.g. .200 for 200g)');
      return;
    }
    const finalPrice = isOverrideAllowed && parseFloat(priceInput) >= 0 ? parseFloat(priceInput) : Number(product.price || 0);
    // Pass normalized quantity (in kg or L), unit, and custom price
    onConfirm(qty, baseUnit, finalPrice);
  };

  return createPortal(
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[120] flex items-center justify-center p-4">
      <div className="bg-[#0F172A] border border-slate-700/80 rounded-3xl max-w-xl w-full p-6 shadow-2xl text-white flex flex-col space-y-4 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="flex justify-between items-start border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
              {isVolume ? <Droplet size={24} /> : <Scale size={24} />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  {isVolume ? 'Volume / Liquid Item' : 'Weighed Scale Item'}
                </span>
                {product.plu && (
                  <span className="text-[10px] font-mono font-black text-amber-300 bg-amber-500/15 px-2 py-0.5 rounded border border-amber-500/30">
                    PLU #{product.plu}
                  </span>
                )}
                {product.barcode && (
                  <span className="text-[10px] font-mono font-bold text-slate-300 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                    Code: {product.barcode}
                  </span>
                )}
              </div>
              <h3 className="text-xl font-black text-white mt-1">{product.name}</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Catalog Default: <span className="text-emerald-400 font-bold">Rs. {Number(product.price || 0).toFixed(2)}</span> per {baseUnit}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Mode Toggle (Kg vs Grams OR Liter vs Milliliter) */}
        <div className="flex items-center justify-between bg-[#1E293B] p-1.5 rounded-2xl border border-slate-700/70">
          <span className="text-xs font-bold text-slate-400 ml-3">Weight Unit:</span>
          <div className="flex gap-1.5">
            {isWeight ? (
              <>
                <button
                  type="button"
                  onClick={() => handleModeChange('kg')}
                  className={`px-4 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                    mode === 'kg'
                      ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  Kilograms (kg) — e.g. .250
                </button>
                <button
                  type="button"
                  onClick={() => handleModeChange('g')}
                  className={`px-4 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                    mode === 'g'
                      ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  Grams (g) — e.g. 250, 500
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => handleModeChange('l')}
                  className={`px-4 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                    mode === 'l'
                      ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  Liters (L) — e.g. .500
                </button>
                <button
                  type="button"
                  onClick={() => handleModeChange('ml')}
                  className={`px-4 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                    mode === 'ml'
                      ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  Milliliters (ml) — e.g. 250, 500
                </button>
              </>
            )}
          </div>
        </div>

        {/* Input Value Display & Live Total Box (3 Columns: Weight, Each Price, Line Total) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
          {/* 1. Weight Input field */}
          <div className="bg-[#182038] p-3 rounded-2xl border-2 border-emerald-500/60 flex flex-col justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              1. Weight / Qty
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <input
                type="text"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                placeholder={mode === 'kg' ? '.250' : '250'}
                autoFocus
                className="bg-transparent text-2xl font-black text-white outline-none w-full font-mono placeholder:text-slate-600"
              />
              <span className="text-sm font-black text-emerald-400 uppercase ml-2">{mode}</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              {mode === 'kg' ? 'e.g. .250 for 250g, 1.25 for 1.25kg' : 'e.g. 250 or 500'}
            </p>
          </div>

          {/* 2. Each / Unit Price (Editable if allowed) */}
          <div className="bg-[#182038] p-3 rounded-2xl border border-slate-700/90 flex flex-col justify-between">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                2. Price / {baseUnit}
              </span>
              {isOverrideAllowed ? (
                <span className="text-[8px] bg-emerald-500/20 text-emerald-300 font-bold px-1.5 py-0.5 rounded uppercase">
                  Editable
                </span>
              ) : (
                <span className="text-[8px] bg-rose-500/20 text-rose-300 font-bold px-1.5 py-0.5 rounded uppercase">
                  🔒 Locked
                </span>
              )}
            </div>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-xs font-black text-slate-400 mr-1.5 font-mono">Rs.</span>
              <input
                type="number"
                step="any"
                disabled={!isOverrideAllowed}
                value={isOverrideAllowed ? priceInput : Number(product.price || 0).toFixed(2)}
                onChange={e => isOverrideAllowed && setPriceInput(e.target.value)}
                placeholder="Rate"
                className={`bg-transparent text-2xl font-black outline-none w-full font-mono placeholder:text-slate-600 ${
                  !isOverrideAllowed ? 'text-slate-500 cursor-not-allowed select-none' : 'text-emerald-300 focus:text-white'
                }`}
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              {isOverrideAllowed ? 'Change if day rate differs' : 'Price locked by store'}
            </p>
          </div>

          {/* 3. Live Result Preview */}
          <div className="bg-[#1A233A] p-3 rounded-2xl border border-emerald-500/40 flex flex-col justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              3. Line Total
            </span>
            <div className="mt-1">
              <div className="text-2xl font-black text-emerald-400 font-mono">
                Rs {lineTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <p className="text-[10px] font-bold text-slate-300 mt-0.5 truncate">
                {formatQuantityWithUnit(currentQty, baseUnit)} @ Rs. {effectivePrice.toFixed(2)}
              </p>
            </div>
          </div>
        </div>

        {/* Quick Touchscreen Presets */}
        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1.5">
            Quick Touch Presets:
          </span>
          <div className="grid grid-cols-5 sm:grid-cols-9 gap-1.5">
            {(isVolume ? VOLUME_PRESETS : WEIGHT_PRESETS).map(p => (
              <button
                key={p.label}
                type="button"
                onClick={() => handlePresetClick(p.value)}
                className="bg-[#1E293B] hover:bg-emerald-500/20 hover:border-emerald-500/60 active:scale-95 border border-slate-700/80 rounded-xl py-2 text-center text-xs font-black text-slate-200 transition-all"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Touchscreen Numeric Keypad */}
        <div className="grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'DEL'].map(btn => (
            <button
              key={btn}
              type="button"
              onClick={() => handleKeypadPress(btn)}
              className={`py-3 rounded-2xl font-black text-base transition-all active:scale-95 shadow-sm ${
                btn === 'DEL'
                  ? 'bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30'
                  : 'bg-[#1E293B] hover:bg-slate-700 text-white border border-slate-700/80'
              }`}
            >
              {btn === 'DEL' ? '⌫' : btn}
            </button>
          ))}
          <button
            type="button"
            onClick={() => handleKeypadPress('C')}
            className="py-3 rounded-2xl font-black text-xs text-amber-400 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 transition-all"
          >
            CLEAR (C)
          </button>
          <button
            type="button"
            onClick={() => handleKeypadPress('00')}
            className="py-3 rounded-2xl font-black text-sm text-white bg-[#1E293B] hover:bg-slate-700 border border-slate-700/80 transition-all"
          >
            00
          </button>
          <button
            type="button"
            onClick={() => handleKeypadPress('+0.1')}
            className="py-3 rounded-2xl font-black text-xs text-emerald-400 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 transition-all"
          >
            +100g / +0.1
          </button>
        </div>

        {/* Bottom Actions */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3.5 rounded-2xl font-bold text-xs text-slate-400 bg-slate-800/80 hover:bg-slate-800 hover:text-white transition-all"
          >
            Cancel (Esc)
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={currentQty <= 0}
            className="flex-[2] py-3.5 rounded-2xl font-black text-sm bg-emerald-500 hover:bg-emerald-400 active:scale-95 disabled:opacity-40 disabled:pointer-events-none text-slate-950 shadow-xl shadow-emerald-500/20 transition-all flex items-center justify-center gap-2"
          >
            <Check size={18} />
            <span>
              {isEditing ? 'UPDATE CART' : 'ADD TO CART'} (Rs. {lineTotal.toFixed(2)})
            </span>
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
}
