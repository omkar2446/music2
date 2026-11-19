import React from 'react';
import { cn } from '@/lib/cn';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        'border-input bg-background focus:ring-primary min-w-0 flex-1 rounded-full border px-4 py-2 text-sm outline-none focus:ring-2',
        className,
      )}
      {...props}
    />
  );
}
