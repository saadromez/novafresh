import React, { useState, useEffect, useRef } from 'react'
import { Search } from 'lucide-react'

export default function SearchableSelect({ items, value, onChange, placeholder }: any) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    function handleClickOutside(event: any) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selected = items.find((i:any) => i.id === value);
  const filtered = items.filter((i:any) => i.name.toLowerCase().includes(search.toLowerCase()) || i.barcode?.includes(search));

  return (
    <div className="relative flex-1" ref={wrapperRef}>
      <div 
        onClick={() => { setOpen(!open); setSearch(''); }}
        className="bg-transparent border border-gray-200 rounded-lg outline-none text-sm cursor-pointer p-2 flex justify-between items-center bg-white"
      >
        <span className="truncate">{selected ? selected.name : placeholder}</span>
      </div>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-full max-h-48 overflow-y-auto bg-white border border-gray-200 shadow-xl rounded-lg z-[100]">
          <div className="sticky top-0 bg-white p-2 border-b border-gray-100 flex items-center">
            <Search size={14} className="text-gray-400 mr-2" />
            <input 
              type="text" 
              placeholder="Search product..." 
              className="w-full text-sm outline-none"
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          {filtered.map((item:any) => (
            <div 
              key={item.id} 
              className="p-2 text-sm hover:bg-brand-primary/10 cursor-pointer truncate font-medium text-gray-700"
              onClick={() => { onChange(item.id); setOpen(false); setSearch(''); }}
            >
              {item.name}
            </div>
          ))}
          {filtered.length === 0 && <div className="p-2 text-sm text-gray-400 text-center">No results</div>}
        </div>
      )}
    </div>
  )
}
