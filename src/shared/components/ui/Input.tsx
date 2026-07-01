import type { InputHTMLAttributes } from 'react';

const cls =
  'h-9 w-full rounded-md border border-border bg-surface-elevated px-3 text-body text-text-primary placeholder:text-text-muted transition-colors duration-fast ease-out hover:border-border-strong focus-visible:border-primary focus-visible:shadow-focus outline-none';

export function Input({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${cls} ${className}`} {...rest} />;
}
