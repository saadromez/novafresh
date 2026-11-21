import React from 'react';
import { Minus, Square, X } from 'lucide-react';

export default function TitleBar() {
  const handleMinimize = () => {
    // @ts-ignore
    window.ipcRenderer?.send('window-min');
  };

  const handleMaximize = () => {
    // @ts-ignore
    window.ipcRenderer?.send('window-max');
  };

  const handleClose = () => {
    // @ts-ignore
    window.ipcRenderer?.send('window-close');
  };

  return (
    <div 
      className="h-8 bg-brand-bg flex justify-between items-center px-4 select-none fixed top-0 w-full z-[1000] border-b border-gray-200"
      style={{ WebkitAppRegion: 'drag' } as any}
    >
      <div className="flex items-center text-xs font-bold text-brand-dark tracking-wide">
        <span className="text-brand-primary mr-1">Nova</span>FreshMart
      </div>
      <div className="flex space-x-1" style={{ WebkitAppRegion: 'no-drag' } as any}>
        <button 
          onClick={handleMinimize} 
          className="p-1 hover:bg-gray-200 rounded text-brand-dark transition-colors"
        >
          <Minus size={14} />
        </button>
        <button 
          onClick={handleMaximize} 
          className="p-1 hover:bg-gray-200 rounded text-brand-dark transition-colors"
        >
          <Square size={12} />
        </button>
        <button 
          onClick={handleClose} 
          className="p-1 hover:bg-brand-primary hover:text-white rounded text-brand-dark transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
