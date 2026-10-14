/* J3: captura cada opción y combinaciones extremas con la API interceptada. No escribe datos operativos. */
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')
const execute = promisify(execFile)
const root = path.resolve(__dirname, '../../..')
const output = path.resolve(process.env.VARIANT_EVIDENCE || path.join(root, 'test-reports/j3'))
const inventory = require(path.join(root, 'experience/experience_app/diseno/inventario.json'))
const rgb = hex => `rgb(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`
const columns = element => element.columns.split(' ').length
const near = (a, b) => assert(Math.abs(a - b) < 1, `${a} difiere de ${b}`)

function verify(row, item, template) {
  const m = row.variants, c = template.tema.fundamentos.colores
  // Falla si una pantalla deja de recibir el tema elegido, incluido un diálogo o la ficha abierta desde la carta.
  assert(m, 'Faltan medidas de variantes')
  // Falla si el tema por defecto activa un estilo nuevo, o si la hoja de variantes ni siquiera se cargó.
  if (item.id === 'predeterminado') { assert(m.variantRules > 0); assert.deepEqual(m.activeRules, []) }
  // Falla si el texto ampliado sale de su botón y se superpone a la siguiente categoría.
  if (template.tema.distribucion.carta !== 'actual' || template.tema.variantes.categorias !== 'chips') {
    assert.deepEqual(m.categoryOverflow, [])
  }
  for (const definition of Object.values(inventory.variantes)) {
    const [layer, key] = definition.ruta.split('.')
    assert.equal(m.attributes[definition.atributo], template.tema[layer][key])
  }
  // Falla si ampliar el texto de una distribución nueva recorta el nombre o el precio del destacado.
  if (template.tema.distribucion.carta !== 'actual' && ['menu', 'category'].includes(row.name)) {
    assert(m.featuredCopy.y >= m.featured.y)
    assert(m.featuredCopy.y + m.featuredCopy.height <= m.featured.y + m.featured.height)
  }
  // Falla si la variante existe en el CSS pero pierde la cascada y no cambia la presentación real.
  const targets = {boton:'primary',formaBoton:'primary',tarjeta:'card',categorias:'category',precio:'price',imagen:'photo',formaImagen:'photo',cabecera:'header',saludo:'header',insignia:'badge',carta:'layout',ficha:'dish',carrito:'cart'}
  // Falla si la captura dedicada a una opción ya no contiene el componente que debe demostrarla.
  if (item.grupo) assert(m[targets[item.grupo]], `Falta el componente de ${item.grupo}`)
  for (const [group, value] of Object.entries({...template.tema.variantes,...template.tema.distribucion})) {
    if (value === inventory.variantes[group].predeterminada || !m[targets[group]]) continue
    switch (group) {
    case 'boton':
      assert.equal(m.primary.background, rgb(value === 'contorno' ? c.superficie : c.acentoSuave))
      if (value === 'contorno') assert.equal(m.primary.border, '1px')
      break
    case 'formaBoton': assert.equal(m.primary.radius, value === 'recta' ? '0px' : '999px'); break
    case 'tarjeta':
      if (value === 'sombra') assert.notEqual(m.card.shadow, 'none')
      else { assert.equal(m.card.border, '1px'); assert.equal(m.card.shadow, 'none') }
      break
    case 'categorias':
      assert.notEqual(m.category.shadow, 'none')
      assert.equal(m.category.background, value === 'pestanas' ? rgb(c.acentoSuave) : 'rgba(0, 0, 0, 0)')
      break
    case 'precio':
      if (value === 'normal') assert.equal(m.price.color, rgb(c.tinta))
      else { assert.equal(m.price.background, rgb(c.acentoSuave)); assert.equal(m.price.radius, '999px') }
      break
    case 'imagen': near(m.photo.width / m.photo.height * 100, (value === '4:3' && template.tema.variantes.formaImagen !== 'circular' ? 4 / 3 : 1) * 100); break
    case 'formaImagen':
      assert.equal(m.photo.radius, value === 'tema' ? `${16 * template.tema.fundamentos.forma.imagen}px` : '50%')
      if (value === 'circular') near(m.photo.width, m.photo.height)
      break
    case 'cabecera':
      assert.equal(m.greeting.direction, 'column')
      near(m.greeting.x + m.greeting.width / 2, m.header.x + m.header.width / 2)
      break
    case 'saludo': assert.equal(m.salute, null); assert(m.header); break
    case 'insignia': assert.equal(m.badge.border, '1px'); assert.equal(m.badge.shadow, 'none'); break
    case 'carta':
      assert.equal(m.layout.display, 'grid')
      assert.equal(columns(m.layout), value === 'cuadricula' && m.layout.width >= 280 * template.tema.fundamentos.texto + 16 * template.tema.fundamentos.densidad - 1 ? 2 : 1)
      if (value === 'lista') { assert.equal(columns(m.link), 2); near(parseFloat(m.link.columns), m.link.width * .25) }
      if (value === 'foto-grande') { assert(m.photo.width > m.layout.width * .75); near(m.photo.width / m.photo.height * 100, template.tema.variantes.formaImagen === 'circular' || template.tema.variantes.imagen === 'cuadrada' ? 100 : 400 / 3) }
      break
    case 'ficha':
      if (value === 'dividida' && row.viewport.width >= 760) assert(m.details.x >= m.hero.x + m.hero.width)
      else assert(m.details.y >= m.hero.y + m.hero.height)
      break
    case 'carrito': assert.equal(m.cart.radius, '0px'); break
    }
  }
}

async function main() {
  const matrix = JSON.parse(await fs.readFile(path.join(output, 'temas/matriz.json'), 'utf8'))
  const selected = process.env.VARIANT_CASES?.split(',')
  const queue = matrix.filter(item => !selected || selected.includes(item.id))
  const summaryPath = path.join(output, 'variantes-resumen.json')
  const results = JSON.parse(await fs.readFile(summaryPath, 'utf8').catch(error => { if (error.code === 'ENOENT') return '[]'; throw error }))
  async function worker() {
    while (queue.length) {
      const item = queue.shift(), folder = path.join(output, 'variantes', item.id)
      const templatePath = path.join(output, 'temas', `${item.id}.json`)
      const template = JSON.parse(await fs.readFile(templatePath, 'utf8'))
      let error = null, log = ''
      try {
        if (!process.env.VARIANT_VERIFY_ONLY) {
          const result = await execute(process.execPath, [path.join(root, 'diner/scripts/exporty-audit/capture.cjs')], {
            env: { ...process.env, AUDIT_CASES: process.env.VARIANT_SCENARIOS || (Array.isArray(item.casos) ? item.casos.join(',') : item.casos),
              AUDIT_ACCESSIBILITY: '1', AUDIT_VARIANTS: '1', AUDIT_CONTINUE: '1', AUDIT_TIMEOUT: '15000',
              AUDIT_VIEWPORT: JSON.stringify({ width: item.ancho || 375, height: 812 }),
              AUDIT_TEMPLATE: templatePath, EXPORTY_OUTPUT: folder }, maxBuffer: 4 * 1024 * 1024,
          })
          log = result.stdout + result.stderr
        }
      } catch (failure) { error = `Captura fallida: ${failure.code}`; log = (failure.stdout || '') + (failure.stderr || '') }
      await fs.mkdir(folder, { recursive: true })
      if (!process.env.VARIANT_VERIFY_ONLY) await fs.writeFile(path.join(folder, 'ejecucion.log'), log)
      const evidence = JSON.parse(await fs.readFile(path.join(folder, 'evidence.json'), 'utf8').catch(() => '[]'))
      try {
        assert.equal(evidence.length, item.casos === 'j2' ? 50 : item.casos.length)
        for (const row of evidence) {
          // Falla si un tema rompe los mínimos de J2 o el recorrido necesita una API que no se ha preparado.
          assert(!row.errors.length && !row.unhandled.length && !Object.values(row.accessibility).some(value => Array.isArray(value) ? value.length : value), row.name)
          try { verify(row, item, template) } catch (failure) { throw new Error(`${row.name}: ${failure.message}`) }
        }
      } catch (failure) { error = `${error ? `${error}; ` : ''}${failure.message}` }
      const previous = results.findIndex(result => result.id === item.id)
      if (previous >= 0) results.splice(previous, 1)
      results.push({ id: item.id, capturas: evidence.length, error })
      console.log(item.id, evidence.length, error || 'correcto')
    }
  }
  await Promise.all([worker(), worker()])
  await fs.writeFile(summaryPath, JSON.stringify(results, null, 2))
  if (results.some(result => result.error)) process.exitCode = 1
}
main().catch(error => { console.error(error); process.exitCode = 1 })
