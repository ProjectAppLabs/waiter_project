// El catálogo ya entrega el precio final. Ventas redondea unidad, línea y base a centavos, en ese orden.
export interface CartAmountTax { id: number; amount: number; priceInclude: boolean }
export interface CartAmountLine { unitPrice: number; qty: number; taxIds: number[]; extras?: readonly number[] }
export interface CartAmounts { subtotal: number; tax: number; total: number }

interface DecimalRatio { value: bigint; scale: bigint }
const ZERO = BigInt(0), ONE = BigInt(1), TWO = BigInt(2), HUNDRED = BigInt(100)

// Se conserva el decimal del JSON, incluidos exponentes, para que 1.005 no redondee a 1.00 por coma flotante.
function decimal(value: number): DecimalRatio {
  const [coefficient, exponent = '0'] = value.toString().toLowerCase().split('e')
  const [whole, fraction = ''] = coefficient.split('.')
  const places = fraction.length - Number(exponent)
  const digits = BigInt(whole + fraction)
  return places >= 0
    ? { value: digits, scale: BigInt(10) ** BigInt(places) }
    : { value: digits * BigInt(10) ** BigInt(-places), scale: ONE }
}

function sum(values: readonly number[]): DecimalRatio {
  return values.reduce<DecimalRatio>((result, value) => {
    const next = decimal(value)
    const scale = result.scale > next.scale ? result.scale : next.scale
    return { value: result.value * (scale / result.scale) + next.value * (scale / next.scale), scale }
  }, { value: ZERO, scale: ONE })
}

function halfUp(value: bigint, scale: bigint): bigint {
  const sign = value < ZERO ? -ONE : ONE
  return sign * ((sign * value * TWO + scale) / (scale * TWO))
}

function unitCents(unitPrice: number, extras: readonly number[]): bigint {
  const unit = sum([unitPrice, ...extras])
  return halfUp(unit.value * HUNDRED, unit.scale)
}

function totalCents(line: CartAmountLine): bigint {
  const qty = decimal(line.qty)
  return halfUp(unitCents(line.unitPrice, line.extras ?? []) * qty.value, qty.scale)
}

export const finalUnitPrice = (unitPrice: number, extras: readonly number[] = []): number => Number(unitCents(unitPrice, extras)) / 100
export const finalLineTotal = (line: CartAmountLine): number => Number(totalCents(line)) / 100

export function cartAmounts(lines: readonly CartAmountLine[], taxes: readonly CartAmountTax[]): CartAmounts {
  let subtotal = ZERO, total = ZERO
  for (const line of lines) {
    const rates = taxes.filter((tax) => line.taxIds.includes(tax.id))
    const excluded = sum(rates.filter((tax) => !tax.priceInclude).map((tax) => tax.amount))
    const included = sum(rates.filter((tax) => tax.priceInclude).map((tax) => tax.amount))
    const gross = totalCents(line)
    // Misma descomposición que sales.services.add_lines; los dos grupos se suman antes de dividir.
    subtotal += halfUp(gross * HUNDRED * excluded.scale * HUNDRED * included.scale,
      (HUNDRED * excluded.scale + excluded.value) * (HUNDRED * included.scale + included.value))
    total += gross
  }
  return { subtotal: Number(subtotal) / 100, tax: Number(total - subtotal) / 100, total: Number(total) / 100 }
}
