'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { WizardSteps } from '@/components/kit/WizardSteps'
import { Button } from '@/components/ui/Button'
import { Select, TextInput } from '@/components/ui/Field'
import { slugify, suggestUsername, validSlug, validUsername } from '@/lib/domain/slug'
import { RESERVED_SUBDOMAINS } from '@/lib/domain/tenant'
import { CoreError } from '@/lib/services/core/http'
import { createOrganization, type OrganizationInput } from '@/lib/services/core/platform'
import { orgUrl } from './OrganizationsView'

const STEPS = ['Organización', 'Dueño', 'Plan']
// Plan W: plantillas de módulos. `inicial` está reservada hasta que el dueño la defina.
export const PLANS: [string, string][] = [['completo', 'Completo']]
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Plan T0: dar de alta a un cliente. Tres pasos (la organización y sus datos legales, el dueño, el plan) y al confirmar el
// sistema propio crea la organización y al dueño y le envía la invitación. No hay bases por crear ni DNS que tocar: la
// dirección sale sola del slug.
export function NewOrganizationWizard() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [name, setName] = useState(''), [slug, setSlug] = useState(''), [slugTouched, setSlugTouched] = useState(false)
  const [legalName, setLegalName] = useState(''), [taxId, setTaxId] = useState(''), [billingEmail, setBillingEmail] = useState(''), [billingContact, setBillingContact] = useState('')
  const [ownerName, setOwnerName] = useState(''), [ownerEmail, setOwnerEmail] = useState(''), [ownerUser, setOwnerUser] = useState(''), [userTouched, setUserTouched] = useState(false)
  const [plan, setPlan] = useState('completo'), [price, setPrice] = useState('150000'), [maxRestaurants, setMaxRestaurants] = useState('1'), [trialEnds, setTrialEnds] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const reserved = (RESERVED_SUBDOMAINS as readonly string[]).includes(slug)
  const stepOk = [
    name.trim().length >= 2 && validSlug(slug) && !reserved && legalName.trim() && taxId.trim() && EMAIL.test(billingEmail.trim()),
    ownerName.trim().length >= 2 && EMAIL.test(ownerEmail.trim()) && validUsername(ownerUser),
    Number(price) >= 0 && Number.isInteger(Number(maxRestaurants)) && Number(maxRestaurants) >= 1,
  ][step]
  async function submit() {
    setBusy(true); setError('')
    const input: OrganizationInput = {
      name: name.trim(), slug, legal_name: legalName.trim(), tax_id: taxId.trim(), billing_email: billingEmail.trim().toLowerCase(), billing_contact: billingContact.trim(),
      plan, monthly_price: Number(price), max_restaurants: Number(maxRestaurants), trial_ends: trialEnds || null, timezone: 'America/Bogota',
      owner: { name: ownerName.trim(), email: ownerEmail.trim().toLowerCase(), username: ownerUser },
    }
    try { const org = await createOrganization(input); router.replace(`/plataforma/clientes/${org.slug}?nuevo=1`) }
    catch (e) { setError(e instanceof CoreError && e.code === 'slug_taken' ? 'Ya existe un cliente con esa dirección. Cambia el slug.' : e instanceof Error ? e.message : 'No se pudo crear el cliente.') }
    finally { setBusy(false) }
  }
  return (
    <section className="max-w-3xl flex flex-col gap-6">
      <div><h1 className="text-[26px] font-bold">Nuevo cliente</h1><p className="mt-1 text-soft">Al terminar, al dueño le llega un correo con su usuario y un código para poner su contraseña.</p></div>
      <WizardSteps steps={STEPS} current={step} />
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if (!stepOk) return; if (step < 2) setStep(step + 1); else void submit() }}>
        {step === 0 && <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TextInput label="Nombre de la organización" required value={name} onChange={(e) => { setName(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)) }} hint="Como la conocen sus clientes: «Burger House»." />
            <TextInput label="Dirección (slug)" required value={slug} autoCapitalize="none" spellCheck={false} onChange={(e) => { setSlugTouched(true); setSlug(e.target.value.toLowerCase()) }}
              hint={slug && validSlug(slug) && !reserved ? `Entrarán por ${orgUrl(slug)}` : reserved ? 'Ese nombre está reservado.' : 'Minúsculas, números y guiones.'} />
            <TextInput label="Razón social" required value={legalName} onChange={(e) => setLegalName(e.target.value)} />
            <TextInput label="NIT" required value={taxId} onChange={(e) => setTaxId(e.target.value)} />
            <TextInput label="Correo de facturación" type="email" required value={billingEmail} onChange={(e) => setBillingEmail(e.target.value)} hint="A quién le facturamos la suscripción." />
            <TextInput label="Contacto de facturación" value={billingContact} onChange={(e) => setBillingContact(e.target.value)} />
          </div>
        </>}
        {step === 1 && <>
          <p className="text-soft">El dueño entra a su consola, crea sus restaurantes y da de alta a su equipo.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TextInput label="Nombre del dueño" required value={ownerName} onChange={(e) => { setOwnerName(e.target.value); if (!userTouched) setOwnerUser(suggestUsername(e.target.value)) }} />
            <TextInput label="Correo del dueño" type="email" required value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} hint="Aquí le llega la invitación." />
            <TextInput label="Usuario" required value={ownerUser} autoCapitalize="none" spellCheck={false} onChange={(e) => { setUserTouched(true); setOwnerUser(e.target.value.toLowerCase()) }}
              hint="Minúsculas, números y puntos. También podrá entrar con su correo." />
          </div>
        </>}
        {step === 2 && <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select label="Plan" value={plan} onChange={(e) => setPlan(e.target.value)}>{PLANS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
            <TextInput label="Precio por local al mes (COP)" type="number" min={0} step={1000} required value={price} onChange={(e) => setPrice(e.target.value)} />
            <TextInput label="Límite de restaurantes" type="number" min={1} step={1} required value={maxRestaurants} onChange={(e) => setMaxRestaurants(e.target.value)} hint="El dueño no podrá crear más que estos." />
            <TextInput label="En prueba hasta (opcional)" type="date" value={trialEnds} onChange={(e) => setTrialEnds(e.target.value)} hint="Sin fecha, la cuenta nace activa." />
          </div>
          <div className="rounded-lg border border-border p-4 text-[15px] flex flex-col gap-1">
            <p><strong>{name}</strong> · {orgUrl(slug)}</p><p className="text-soft">{legalName} · NIT {taxId} · {billingEmail}</p>
            <p className="text-soft">Dueño: {ownerName} ({ownerUser}, {ownerEmail})</p>
            <p className="text-soft">{PLANS.find(([v]) => v === plan)?.[1]} · ${Number(price).toLocaleString('es-CO')} por local al mes · hasta {maxRestaurants} {Number(maxRestaurants) === 1 ? 'restaurante' : 'restaurantes'}{trialEnds && ` · en prueba hasta ${trialEnds}`}</p>
          </div>
        </>}
        {error && <p role="alert" className="text-danger">{error}</p>}
        <div className="flex justify-between gap-3">
          <Button type="button" variant="ghost" onClick={() => (step === 0 ? router.push('/plataforma') : setStep(step - 1))}>{step === 0 ? 'Cancelar' : 'Atrás'}</Button>
          <Button type="submit" variant="primary" disabled={busy || !stepOk}>{step < 2 ? 'Siguiente' : busy ? 'Creando…' : 'Crear cliente e invitar al dueño'}</Button>
        </div>
      </form>
    </section>
  )
}
