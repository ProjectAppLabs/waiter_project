'use client'
import { useParams, useSearchParams } from 'next/navigation'

import { OrganizationSheet } from '@/components/platform/OrganizationSheet'

export default function ClientSheet() {
  const { slug } = useParams<{ slug: string }>()
  const justCreated = useSearchParams().get('nuevo') === '1'
  return <OrganizationSheet slug={slug} justCreated={justCreated} />
}
