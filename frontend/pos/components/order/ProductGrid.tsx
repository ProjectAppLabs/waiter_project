'use client'

import { ProductCard } from '@/components/order/ProductCard'
import type { Product } from '@/lib/types'

export function ProductGrid({ products, onAdd }: { products: Product[]; onAdd: (p: Product) => void }) {
  return (
    <div className="flex-1 min-h-0 p-4.5 px-6 grid grid-cols-4 auto-rows-[214px] gap-3.5 content-start overflow-auto">
      {products.map((p) => <ProductCard key={p.id} product={p} onAdd={onAdd} />)}
    </div>
  )
}
