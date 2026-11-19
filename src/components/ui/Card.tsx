import { cn } from '@/lib/cn';

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('border-border bg-card rounded-xl border p-6 md:p-8 shadow-sm', className)}>
      {children}
    </div>
  );
}
