import type { TextareaHTMLAttributes } from 'react';

const cls =
  'w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-body text-text-primary placeholder:text-text-muted transition-colors duration-fast ease-out hover:border-border-strong focus-visible:border-primary focus-visible:shadow-focus outline-none resize-none';

export function Textarea({ className = '', ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${cls} ${className}`} {...rest} />;
}
