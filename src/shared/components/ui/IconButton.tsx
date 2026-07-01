import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-primary-fg hover:bg-primary-hover',
  secondary: 'border border-border text-text-secondary hover:bg-surface-hover hover:text-text-primary',
  ghost: 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  label: string;
}

export function IconButton({ variant = 'ghost', label, className = '', ...rest }: Props) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`grid h-9 w-9 place-items-center rounded-md transition-colors duration-fast ease-out focus-visible:shadow-focus disabled:opacity-50 ${variants[variant]} ${className}`}
      {...rest}
    />
  );
}
