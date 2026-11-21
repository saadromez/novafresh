import React, { useState } from 'react';
import { DollarSign, X } from 'lucide-react';

export default function OpenSessionModal({ onOpenSession, onClose }: any) {
  const [openingCash, setOpeningCash] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (Number(openingCash) < 0) return alert('Enter a valid amount');
    onOpenSession(Number(openingCash));
  };

  return (
    <div className="fixed inset-0 bg-brand-dark/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <h2 className="text-xl font-bold text-brand-dark flex items-center">
            <DollarSign className="mr-2 text-brand-primary" /> Start New Day
          </h2>
          {onClose && (
            <button onClick={onClose} className="text-gray-400 hover:text-red-500 font-bold p-1 rounded-full hover:bg-gray-200">
              <X size={18} />
            </button>
          )}
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2 text-center">
              Enter Opening Cash (Till Float)
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-lg">Rs.</span>
              <input 
                type="number" 
                className="w-full border-2 border-gray-200 rounded-xl pl-12 pr-4 py-4 outline-none focus:border-brand-primary font-black text-2xl text-brand-dark text-center" 
                value={openingCash} 
                onChange={e => setOpeningCash(e.target.value)} 
                required 
                autoFocus 
              />
            </div>
          </div>
          <button type="submit" className="w-full px-6 py-4 rounded-xl font-black text-white bg-brand-primary hover:bg-brand-secondary shadow-lg shadow-brand-primary/30 transition-transform hover:scale-[1.02]">
            Open Session
          </button>
        </form>
      </div>
    </div>
  );
}
