import type { ButtonHTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'destructive' | 'ghost'
  size?: 'default' | 'money' | 'compact'
}

const VARIANT = {
  primary: 'bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700',
  secondary: 'bg-surface text-ink border border-border hover:bg-muted',
  destructive: 'bg-busy-soft text-busy-ink border border-busy-soft hover:bg-busy hover:text-white',
  ghost: 'bg-transparent text-soft hover:bg-muted',
}
const SIZE = { default: 'h-tap px-5 text-base', money: 'h-tap-money px-6 text-lg', compact: 'h-tap-min px-4 text-[15px]' }

export function Button({ variant = 'secondary', size = 'default', className, ...rest }: ButtonProps) {
  return (
    <button
      className={cn('inline-flex items-center justify-center gap-2 rounded-md font-bold', 'disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-brand-500', VARIANT[variant], SIZE[size], className)}
      {...rest}
    />
  )
}
