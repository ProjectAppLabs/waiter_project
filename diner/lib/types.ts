import type { MenuVariants, MenuLayouts } from './domain/designVariants'

// Contrato con experience/ (bloque 3). Nada aquí sabe de Odoo ni del registro.
export interface Brand { nombre: string; lema: string; logo: string | null; saludo: string; mesero: string; bienvenida: string; color: string; colorTexto: string; colorSuave: string; fuente: string; radio: number }

// ---- Plantillas (Plan H, contratos 1 y 3) ----------------------------------------------------------------------
export type TemplateFamily = 'A' | 'B' | 'C' | 'D' | 'E' | 'F'
export type SignupPattern = 'banner5' | 'portada' | 'beneficios'
export type CodePattern = 'casillas' | 'revisaCorreo' | 'canal'
export type HistoryPattern = 'porMes' | 'tarjetas' | 'tablaCufe'
export type PhotoRequirement = 'ninguna' | 'algunas' | 'todas' | 'hero'
export type PhotoCrop = '4x3' | '1x1' | '3x4' | '3x2' | 'ninguno'
// Tokens de una plantilla: los colores son hex exactos del marco; las fuentes van por nombre de Google Fonts; los radios en px.
export interface TemplateTokens {
  modo: 'claro' | 'oscuro'
  fondo: string; superficie: string; tinta: string; tintaSuave: string; tintaTerciaria: string
  borde: string; acento: string; acentoTinta: string; acentoSuave: string
  displayFont: string; displayPeso: number; displayTracking: string; displayTransform: 'none' | 'uppercase'
  cuerpoFont: string; monoFont: string
  radioTarjeta: number; radioBoton: number; radioChip: number
  densidad: 'compacta' | 'media' | 'amplia'
}
// Qué componente pinta cada pantalla: el menú por código ("B1"), carrito y pago por familia ("familia-B"), la cuenta por patrón.
export interface TemplateLayouts { menu: string; carrito: string; pago: string; registro: SignupPattern; codigo: CodePattern; historial: HistoryPattern }
export interface TemplatePhotos { requiere: PhotoRequirement; recorte: PhotoCrop }
export interface TemplateDiscount { porcentaje: number; activo: boolean }
// Tema v2 resuelto por experience; opcional para seguir leyendo respuestas anteriores a J2.
// Plan K: árbol validado de una plantilla de componente (experience/diseno/plantillas.py); el comensal lo dibuja sin HTML crudo.
export type TemplateNode =
  | { tipo: 'elemento'; etiqueta: string; clases: string[]; hijos: TemplateNode[] }
  | { tipo: 'texto'; texto: string }
  | { tipo: 'dato'; nombre: string; formato?: 'texto' | 'precio' | 'numero' }
  | { tipo: 'ranura'; nombre: string; hijos: TemplateNode[] }
  | { tipo: 'si'; dato: string; hijos: TemplateNode[] }
  | { tipo: 'cada'; dato: string; como: string; hijos: TemplateNode[] }
  // archivo: ruta que resolvió experience (paquete de fábrica en /smart-menu/ o galería de la sede en /api/v1/…).
  | { tipo: 'decoracion'; id: string; movimiento: string; posicion: string; archivo?: string }
export interface ComponentTemplate { version: number; arbol: TemplateNode[] }
export interface MenuTheme {
  version: 2
  variantes?: MenuVariants
  distribucion?: MenuLayouts
  // null = plantilla de fábrica del componente.
  componentes?: Record<string, ComponentTemplate | null>
  fundamentos: {
    densidad: number; texto: number; titulo: number
    forma: Record<'tarjeta' | 'boton' | 'chip' | 'campo' | 'imagen' | 'hoja', number>
    // Plan L: tintaFondo es el texto que va directo sobre el fondo de la página (por defecto, igual que tinta).
    colores: Pick<TemplateTokens, 'fondo' | 'superficie' | 'tinta' | 'tintaSuave' | 'tintaTerciaria' | 'borde' | 'acento' | 'acentoTinta' | 'acentoSuave'> & { tintaFondo?: string }
    // Plan L: hasta tres familias de Google Fonts importadas una vez para toda la sede; las plantillas las usan con ds-fuente-N.
    tipografia: { display: string; cuerpo: string; fuentes?: string[] }
    // Plan L: textura de todo el fondo de la página (patrón del catálogo, tamaño en px e intensidad 0–0.25).
    textura?: { patron: string; tamano: number; intensidad: number }
    // Plan L: reglas de las fotos (radio 8–40 px, cubrir o contener); forma.imagen se deriva del radio.
    imagenes?: { radio: number; ajuste: 'cubrir' | 'contener' }
  }
}
// `contexto.plantilla`: la plantilla resuelta (catálogo + paleta y tipografía de la sede + marca). Es lo único que el motor necesita.
export interface Template { codigo: string; nombre: string; familia: TemplateFamily; tokens: TemplateTokens; layouts: TemplateLayouts; fotos: TemplatePhotos; fuentesGoogle: string[]; descuento: TemplateDiscount; acciones?: RewardOffer[]; tema?: MenuTheme }
// Una entrada del catálogo público (GET /api/v1/plantillas/): el spec.json sin resúmenes, con miniatura.
export interface TemplateSpec {
  codigo: string; nombre: string; familia: TemplateFamily; familiaNombre?: string; descripcion?: string
  fotos: TemplatePhotos; tokens: TemplateTokens
  personalizable?: { colores: string[]; tipografiaDisplay: boolean; logo: boolean }
  pantallas: { menu: { layout: string }; carrito: { layout: string; descuento5?: string }; pago: { layout: string }; registro: { patron: SignupPattern }; codigo: { patron: CodePattern }; historial: { patron: HistoryPattern } }
  fuentesGoogle?: string[]
  miniatura?: string
}
export interface TemplateCatalog { familias: Record<string, string>; plantillas: TemplateSpec[] }
// Vista previa sin guardar (?vista_previa=<base64url JSON>): la usa el POS por iframe. Todo es opcional.
export interface PreviewPayload { plantilla?: string; paleta?: Record<string, string>; tipografia?: { display?: string } }

export interface Context { restaurante: { slug: string; nombre: string }; sede: { slug: string; nombre: string }; mesa: { numero: number; token: string } | null; marca: Brand; plantilla?: Template }
// Origen de la foto: 'ia' pide la nota «Imágenes de referencia» (límite legal); null = la plantilla no está marcada.
export type PhotoOrigin = 'real' | 'ia' | 'placeholder'
// Atributos opcionales por producto (contrato 2): una plantilla los pinta si existen y los omite si no; nunca los inventa.
export interface DishAttributes { combo?: {producto:number;cantidad:number;nombre:string}[]; extras?: number[]; acompanamientos?: number[]; ingredientes?: string[]; nutricion?: { calorias?: number; peso?: number; proteina?: number; grasa?: number; carbohidratos?: number; fibra?: number }; piezas?: number; picante?: 0 | 1 | 2 | 3; etiquetas?: string[]; alergenos?: string[]; abv?: number; ibu?: number; tamanos?: { nombre: string; precio: number }[]; soloHoy?: boolean; tiempoPreparacion?: number; precioAntes?: number }
export interface Dish { valoracion?: {promedio:number;cantidad:number}; id: number; nombre: string; precio: number; agotado: boolean; categorias: number[]; descripcion?: string; foto?: string | null; fotos?: string[]; favorito?: boolean; fotoOrigen?: PhotoOrigin | null; atributos?: DishAttributes }
export interface Category { id: number; nombre: string; productos: Dish[] }
// imagenesDeReferencia: algún plato con foto la tiene generada con IA. Opcional: una experience/ anterior no lo manda y la carta sigue igual, sin la nota.
export interface Menu { restaurante: string; categorias: Category[]; imagenesDeReferencia?: boolean }
export interface MenuBanner {layout:'product'|'promotion'|'category'|'image'|'notice';title:string;subtitle:string;button:string;target:'product'|'category'|'none';targetId:number|null;image:string;theme:'violet'|'amber'|'dark';active:boolean}
export interface Entry { domicilio?: { enabled: boolean; buscador: boolean; centro?: { lat: number; lng: number }; radio_km?: number }; banners?: MenuBanner[] | null; contexto: Context; carta: Menu
  // Plan W: módulos activos que afectan al comensal (menu_comensal, pagos_en_linea, fidelizacion, asistente_menu).
  modulos?: string[] }
export interface Session { id: string; estado: string; mesa: number | null }
export interface CartLine { id: number; comensal: string; mio: boolean; producto_id: number; nombre: string; precio: number; cantidad: number; nota: string; subtotal: number }
// Descuento de primera compra (5 % por defecto): aplicable = la cuenta verificada aún no lo usó; aplicado = ya va en las líneas.
export interface Discount {
  codigo?: string; error?: string;
  registrado?: boolean; porcentaje: number; monto: number; aplicable: boolean; aplicado: boolean }
export interface Cart { sesion: string; lineas: CartLine[]; total: number; mio: number; por_comensal: { comensal: string; total: number }[]; descuento?: Discount
  // Plan D: el envío y los datos del domicilio cuando la visita es sin mesa y ya se cotizó.
  envio?: number; domicilio?: DeliveryQuote | null }
// Plan D: un domicilio cotizado (coordenadas, dirección, envío y cómo se puede pagar).
export type DeliveryMethod = 'online' | 'cash' | 'card_on_delivery'
export interface DeliveryQuote {
  lat: number; lng: number; direccion: string; indicaciones: string; telefono: string; nombre: string
  envio: number; distancia_km: number; sede: { slug: string; nombre: string }; metodos: DeliveryMethod[]; minimo?: number; nota?: string
  sugerida?: { slug: string; nombre: string } | null
}
export interface SavedAddress { id: number; etiqueta: string; direccion: string; indicaciones: string; lat: number; lng: number }
export type OrderState = 'pendiente_pago' | 'enviado' | 'en_cocina' | 'listo' | 'servido' | 'pagado' | 'fallido'
export interface OrderStatus { recompensas?: DinerRewards; lineas?: AccountOrderLine[];
  descuento?: Pick<Discount, 'porcentaje' | 'monto' | 'aplicado'>; id: string; sesion: string; estado: OrderState; total: number; impuestos: number; intentos: number; detalle?: string }
export interface Bill { ok: boolean; total: number; mio: number; porComensal: { comensal: string; total: number }[]; partes: number; porParte: number; descuento?: Discount }

// ---- Cuenta del comensal (maquetada con datos reales; contrato 3) ---------------------------------------------
export interface Account { alergenos?: string; tieneClave?: boolean; novedades?: boolean; descuentoDisponible?: boolean; id: string; nombre: string; correo: string; celular?: string; verificada: boolean }
export interface RegisterForm { clave?: string; nombre: string; correo: string; celular: string; aceptaDatos: boolean; novedades: boolean }
export interface AccountOrderLine { producto_id: number; nombre: string; cantidad: number; precio: number }
export interface AccountOrder { restaurante?: string; sede?: string; id: string; fecha: string; local: string; mesa: number | null; items: number; total: number; estado: OrderState; descuento: number; lineas?: AccountOrderLine[] }
export interface AccountSummary { cuenta: Account | null; pedidos: AccountOrder[] }

// ---- Pago (maquetado detrás de un endpoint con la forma final; contrato 3) ------------------------------------
export type PayScope = 'all' | 'mine' | 'parts'
export type PayMethod = 'tarjeta' | 'pse' | 'nequi' | 'efectivo'
export type PayState = 'idle' | 'authorizing' | 'paid' | 'declined'
export interface PayResult { estado: 'aprobado' | 'rechazado'; referencia: string; demo: boolean; metodo?: PayMethod; monto?: number }

// ---- Sistema de diseño (Plan J5): contrato público GET /api/v1/diseno/, el mismo que sirve el MCP ----------------
export interface DesignRule { type?: string; description?: string; minimum?: number; maximum?: number; default?: unknown; enum?: string[]; readOnly?: boolean; properties?: Record<string, DesignRule> }
export interface DesignOption { valor: string; descripcion: string; selector: string }
export interface DesignVariantField { ruta: string; atributo: string; predeterminada: string; opciones: DesignOption[] }
export interface DesignComponent { id: string; nombre: string; selectores: string[]; fundamentos: string[]; variantes: string[] }
export interface DesignContract {
  version: number
  esquema: { properties: Record<string, DesignRule> }
  inventario: { fundamentos: Record<string, string[]>; derivadas: Record<string, string>; componentes: DesignComponent[]; pantallas: Record<string, string[]>; variantes: Record<string, DesignVariantField> }
}

// Plan N: acciones del menú que dan un premio, lo que la cuenta ya ganó y las acciones que le quedan (GET recompensas).
export type RewardAction = 'cuenta' | 'opinion' | 'novedades' | 'pago_en_linea'
export type RewardPrize =
  | { tipo: 'descuento'; porcentaje: number }
  | { tipo: 'cupon'; codigo: string; nombre: string; porcentaje: number; minimo: number }
  | { tipo: 'puntos'; puntos: number; programa?: string }
export interface RewardOffer { accion: RewardAction; premio: RewardPrize; hecha?: boolean }
export interface EarnedReward { id: number | string; accion: RewardAction; premio: RewardPrize; estado: 'disponible' | 'reservado' | 'usado' | 'acreditado'; fecha: string }
export interface DinerRewards {tarjeta:number|null;codigo:string;puntos:number;ganados:number;programa:string;valorPunto:number;minimoCanje:number;beneficios?:EarnedReward[];acciones?:RewardOffer[]}
export interface VenueLocation {direccion:string;latitud:number|null;longitud:number|null}

// Plan O: portada de la organización (`GET /api/v1/<org>/`): sus restaurantes para elegir a cuál entrar.
export interface OrganizationEntry { organizacion: { slug: string; nombre: string; marca?: Record<string, unknown> }; restaurantes: { slug: string; nombre: string; direccion?: string }[] }
