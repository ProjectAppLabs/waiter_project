import { formatCop } from '@/lib/domain/money'
import { cn } from '@/lib/utils'

export function Money({ amount, withSymbol = false, className }: { amount: number; withSymbol?: boolean; className?: string }) {
  const text = withSymbol ? `$ ${formatCop(amount)}` : formatCop(amount)
  return <span className={cn('font-mono tabular', className)}>{text}</span>
}
