import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '../../lib/utils';

interface Option {
  value: string;
  label: string;
}

interface CustomSelectProps {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
}

export function CustomSelect({ value, options, onChange, className, placeholder = "Select an option" }: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div className={cn("relative", className)} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 outline-none hover:border-blue-300 dark:hover:border-blue-700 transition-colors text-slate-800 dark:text-slate-200 text-left"
      >
        <span className={cn("truncate", !selectedOption && "text-slate-400 dark:text-slate-500")}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown size={16} className={cn("text-slate-400 transition-transform", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-2 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl shadow-lg animate-in fade-in zoom-in-95 duration-100 overflow-hidden py-1 max-h-60 overflow-y-auto">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={cn(
                "w-full flex justify-between items-center px-4 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors",
                value === option.value ? "text-blue-600 dark:text-blue-400 font-medium" : "text-slate-700 dark:text-slate-300"
              )}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
            >
              <span className="truncate">{option.label}</span>
              {value === option.value && <Check size={16} />}
            </button>
          ))}
          {options.length === 0 && (
            <div className="px-4 py-3 text-sm text-slate-500 text-center">No options available</div>
          )}
        </div>
      )}
    </div>
  );
}
