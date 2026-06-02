import React from 'react';
import { cn } from '../lib/utils';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function Logo({ className, size = 'sm' }: LogoProps) {
  const sizeClasses = {
    sm: 'w-10 h-10 rounded-[12px]',
    md: 'w-16 h-16 rounded-[18px]',
    lg: 'w-24 h-24 rounded-[24px]',
  };

  const iconClasses = {
    sm: 'w-6 h-6',
    md: 'w-10 h-10',
    lg: 'w-14 h-14',
  };

  const sparkClasses = {
    sm: 'w-3 h-3 top-[-4px] right-[-4px] absolute text-amber-300 drop-shadow-[0_0_8px_rgba(252,211,77,1)]',
    md: 'w-5 h-5 top-[-6px] right-[-6px] absolute text-amber-300 drop-shadow-[0_0_12px_rgba(252,211,77,1)] animate-pulse',
    lg: 'w-7 h-7 top-[-8px] right-[-8px] absolute text-amber-300 drop-shadow-[0_0_16px_rgba(252,211,77,1)] animate-pulse',
  };

  return (
    <div className={cn(
      "relative flex items-center justify-center bg-gradient-to-br from-blue-500 hover:from-blue-400 to-blue-600 dark:from-blue-600 dark:hover:from-blue-500 dark:to-blue-700 shadow-lg shadow-blue-500/20 dark:shadow-blue-900/40 shrink-0 transition-colors",
      sizeClasses[size],
      className
    )}>
      {/* Decorative inner glow */}
      <div className="absolute inset-0 rounded-[inherit] bg-gradient-to-b from-white/20 to-transparent pointer-events-none" />
      
      {/* M Shape */}
      <div className="relative">
        <svg 
          viewBox="0 0 24 24" 
          fill="none" 
          className={cn("text-white drop-shadow-sm", iconClasses[size])}
        >
          <path 
            d="M4 18V8C4 5.79086 5.79086 4 8 4H8.5C10.05 4 11.455 4.88 12 6.27V6.27C12.545 4.88 13.95 4 15.5 4H16C18.2091 4 20 5.79086 20 8V18" 
            stroke="currentColor" 
            strokeWidth="2.5" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
          />
          <path 
            d="M12 8V18" 
            stroke="currentColor" 
            strokeWidth="2.5" 
            strokeLinecap="round" 
            className="opacity-70"
          />
        </svg>
        
        {/* Sparkle */}
        <svg 
          viewBox="0 0 24 24" 
          fill="none" 
          className={cn("z-10", sparkClasses[size])}
        >
          <path 
            d="M12 1L14.59 8.41L22 11L14.59 13.59L12 21L9.41 13.59L2 11L9.41 8.41L12 1Z" 
            fill="currentColor" 
          />
        </svg>
      </div>
    </div>
  );
}
