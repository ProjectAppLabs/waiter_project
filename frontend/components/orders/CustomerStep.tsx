'use client'

import { useTranslations } from 'next-intl'

import { Icon, type KitIcon } from '@/components/kit/Icon'
import { Stepper } from '@/components/orders/Stepper'
import { Button } from '@/components/ui/Button'
import { customerInfoValid, ORDER_TYPES, type CustomerInfo, type OrderType } from '@/lib/domain/orderWizard'
import { cn } from '@/lib/utils'

const TYPE_ICON: Record<OrderType, KitIcon> = { dineIn: 'tables', takeAway: 'bag', delivery: 'delivery' }
const INPUT = 'h-12 px-3.5 rounded-md border border-border bg-surface text-[15px] text-ink placeholder:text-dim focus:outline-2 focus:outline-primary'

// Paso 1 del wizard (Dine In Selected.png): tipo de pedido, personas, silla de bebé y nombre; domicilio pide dirección y teléfono.
export function CustomerStep({ info, onChange, onContinue, allowedTypes = ORDER_TYPES, selectedType = info.type }: { info: CustomerInfo; onChange: (patch: Partial<CustomerInfo>) => void; onContinue: () => void; allowedTypes?: readonly OrderType[]; selectedType?: OrderType | null }) {
  const t = useTranslations('orders.create')
  return (
    <div className="h-full overflow-y-auto p-5 sm:p-8 flex justify-center">
      <div className="w-[672px] max-w-full flex flex-col gap-5">
        <h1 className="text-[24px] font-bold text-ink">{t('orderInfo')}</h1>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-[15px] text-soft mb-2">{t('orderType')}</legend>
          <div role="radiogroup" aria-label={t('orderType')} className="flex gap-3 flex-wrap">
            {allowedTypes.map((type) => (
              <button key={type} type="button" role="radio" aria-checked={selectedType === type} onClick={() => onChange({ type })}
                className={cn('w-[200px] h-[52px] px-4 rounded-md border bg-surface flex items-center gap-2.5 text-[16px] font-semibold text-ink',
                  selectedType === type ? 'border-primary' : 'border-border')}>
                <Icon name={TYPE_ICON[type]} size={20} className="text-soft" />
                <span className="flex-1 text-left">{t(`types.${type}`)}</span>
                <span className={cn('w-5 h-5 rounded-full border-2 grid place-items-center', selectedType === type ? 'border-primary' : 'border-border')}>
                  {selectedType === type && <span className="w-2.5 h-2.5 rounded-full bg-primary" />}
                </span>
              </button>
            ))}
          </div>
        </fieldset>

        {selectedType === 'dineIn' && <>
        <div className="flex flex-col gap-2">
          <span className="text-[15px] text-soft">{t('people')}</span>
          <Stepper value={info.people} onChange={(people) => onChange({ people })} min={1} max={40} lessLabel={t('fewerPeople')} moreLabel={t('morePeople')} />
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-[15px] text-soft mb-2">{t('babyChair')}</legend>
          <div role="radiogroup" aria-label={t('babyChair')} className="flex items-center gap-6">
            {[false, true].map((value) => (
              <button key={String(value)} type="button" role="radio" aria-checked={info.babyChair === value} onClick={() => onChange({ babyChair: value })}
                className="flex items-center gap-2.5 text-[16px] text-ink">
                <span className={cn('w-6 h-6 rounded-full border-2 grid place-items-center', info.babyChair === value ? 'border-primary' : 'border-border')}>
                  {info.babyChair === value && <span className="w-3 h-3 rounded-full bg-primary" />}
                </span>
                {value ? t('yes') : t('no')}
              </button>
            ))}
          </div>
        </fieldset>

        </>}

        <label className="flex flex-col gap-2">
          <span className="text-[15px] text-soft">{t('customerName')}</span>
          <input value={info.name} onChange={(e) => onChange({ name: e.target.value })} placeholder={t('customerNamePlaceholder')} className={INPUT} />
        </label>

        {selectedType === 'delivery' && (
          <div className="flex flex-col gap-4 p-4 rounded-lg border border-border bg-surface">
            <span className="text-[15px] font-semibold text-ink">{t('deliveryData')}</span>
            <label className="flex flex-col gap-2">
              <span className="text-[15px] text-soft">{t('address')}</span>
              <input value={info.address} onChange={(e) => onChange({ address: e.target.value })} placeholder={t('addressPlaceholder')} className={INPUT} />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-[15px] text-soft">{t('phone')}</span>
              <input value={info.phone} onChange={(e) => onChange({ phone: e.target.value })} placeholder={t('phonePlaceholder')} inputMode="tel" className={INPUT} />
            </label>
          </div>
        )}

        <Button variant="primary" className="self-start mt-2 rounded-lg" disabled={!selectedType || !allowedTypes.includes(selectedType) || !customerInfoValid(info)} onClick={onContinue}>
          {t('continue')}<Icon name="arrowRight" size={18} />
        </Button>
      </div>
    </div>
  )
}
