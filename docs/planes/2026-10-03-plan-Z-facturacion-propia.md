# Plan Z · Microservicio propio de facturación electrónica DIAN (`fiscal/`)

**Fecha:** 2026-10-03 · **Rama:** `feat/03102026-facturacion-propia` · **Decisión del dueño:** «hacemos nuestro propio
microservicio… en Django… lo tendríamos aparte». Se descartó comprar APIDIAN (Factura Latam): su edición pública
deriva el token de cada empresa del NIT, deja el registro abierto por omisión y corre en Laravel 10 sin soporte de
seguridad. Tampoco se toma un proveedor en la nube: el costo por documento y la dependencia no compensan.

## Qué es y qué no es

- Un **proyecto Django aparte**, `fiscal/` en la raíz del repositorio (hermano de `experience/`), con su propia base
  (`waiter_fiscal` en MySQL 8.4; en desarrollo, el mismo contenedor `waiter-mysql`), su propio proceso y su propio
  puerto (8002). **No se expone a internet:** solo `experience` le habla, por la red interna.
- Modalidad **software propio** ante la DIAN (Resolución 000165 de 2023, compilada en la 000227 de 2025): cada
  organización se habilita con su NIT, su certificado digital y su resolución de numeración. No somos proveedor
  tecnológico autorizado ni lo necesitamos.
- `fiscal` sabe de la DIAN; `experience` sabe del restaurante. `experience` sigue armando el documento comercial
  (líneas, impuestos, comprador, numeración asignada) como hoy en `billing`; `fiscal` lo convierte en el documento
  electrónico, lo firma, lo transmite y guarda la prueba.
- **La venta nunca espera a la DIAN.** El cobro termina siempre; el documento entra a una cola y sale cuando pueda.

## Arquitectura

```
POS ─▶ experience (billing) ──HTTP interno firmado──▶ fiscal ──SOAP WS-Security──▶ DIAN
            ▲                                            │
            └──────── aviso de estado (webhook) ◀────────┘
```

- **Contrato interno** (`/internal/v1/…`), autenticado con HMAC por petición (clave compartida, marca de tiempo y
  cuerpo firmados; se rechaza lo que tenga más de 5 minutos). En producción, además, solo la red interna llega.
  - `PUT tenants/<org>`: datos fiscales de la organización (NIT, DV, razón social, régimen, responsabilidades,
    dirección, ambiente `habilitacion` o `produccion`, identificador y PIN del software, clave técnica).
  - `PUT tenants/<org>/certificate`: el .p12 y su contraseña; se guardan cifrados (Fernet con clave propia de
    `fiscal`, distinta de la de `experience`) y se responde con titular y vencimiento.
  - `POST documents` con clave de idempotencia (`<org>:<id del documento en experience>`): reenviar lo mismo nunca
    emite dos veces. Responde `202 {"id", "state": "queued"}`.
  - `GET documents/<id>`: estado, CUFE/CUDE, QR, errores de la DIAN, enlaces al XML firmado, la respuesta de la DIAN,
    el `AttachedDocument` y el PDF.
  - `POST tenants/<org>/test-set`: corre el set de pruebas de habilitación y devuelve su avance.
  - `GET tenants/<org>/numbering`: rangos de numeración autorizados (`GetNumberingRange`).
- **Aviso de vuelta:** `fiscal` llama a `experience` (`POST /internal/fiscal/events`, también con HMAC) cuando cambia
  un estado; `experience` además consulta los pendientes cada minuto por si un aviso se pierde.
- En `experience`: `billing/providers/fiscal.py` implementa `BillingProvider` contra este contrato. El proveedor
  simulado se queda para desarrollo y pruebas.

## Qué hace `fiscal` por dentro

- **Documentos:** factura electrónica de venta, **documento equivalente electrónico tiquete POS** (el principal de un
  restaurante), nota crédito (devoluciones, plan U) y nota débito. UBL 2.1 según el anexo técnico 1.9 y el anexo del
  documento equivalente 1.0, con sus catálogos.
- **CUFE y CUDE** (SHA-384) y el QR con la URL de consulta de la DIAN.
- **Firma XAdES-EPES** con la política de firma de la DIAN (`lxml` y `cryptography`; `signxml` solo si su XAdES
  produce exactamente lo que la DIAN valida, se decide en Z0).
- **Transmisión:** sobre zip en base64, SOAP 1.2 con WS-Security firmado (`SendBillSync`, `SendTestSetAsync`,
  `GetStatus`, `GetStatusZip`, `GetNumberingRange`). Ambientes de habilitación y producción.
- **Respuesta:** interpreta el `ApplicationResponse`, guarda las reglas que fallaron con su código y un mensaje en
  español para el restaurante, y arma el `AttachedDocument` que va al comprador.
- **Cola en la base** (sin Celery): un proceso trabajador (`manage.py fiscal_worker`) toma documentos con
  `select_for_update(skip_locked=True)`, reintenta con espera creciente y nunca cambia el número ni el CUFE de un
  documento ya construido.
- **Contingencia:** si la DIAN no responde, el documento queda en contingencia tipo 04, se entrega igual al comprador
  y se transmite al volver; se vigila el plazo de **48 horas** y se alerta antes de que venza.
- **PDF** (representación gráfica) con el QR. El correo al comprador lo sigue enviando `experience`.

## Para que los restaurantes no se nos vengan encima

- Alertas en la consola de ProjectApp y del dueño: certificado por vencer (30, 15 y 7 días), numeración por debajo
  del 10 %, resolución por vencer, documentos en contingencia cerca de las 48 horas, rechazos.
- Panel en la consola de ProjectApp: documentos por estado y por cliente, tasa de rechazo, latencia de la DIAN y
  si la DIAN responde (sondeo cada minuto).
- Mensajes claros en el POS: «La DIAN no responde; la factura quedó guardada y se envía sola».
- **Seguimiento de la norma:** revisión mensual del normograma y del micrositio de facturación de la DIAN; cada
  resolución o anexo nuevo se convierte en una tarea con fecha, probada en habilitación antes de su vigencia.

## Fases

- **Z0 · Prueba de lo difícil primero:** firma XAdES y SOAP con WS-Security contra el ambiente de habilitación de la
  DIAN con un certificado real: `GetNumberingRange` y una factura del set de pruebas aceptada. Si esto no sale, nada
  más importa.
- **Z1 · El servicio:** proyecto `fiscal/`, organizaciones, certificados cifrados, contrato interno con HMAC,
  idempotencia, cola y trabajador, `dev.sh` lo levanta en 8002.
- **Z2 · Factura y notas:** factura de venta, nota crédito y débito; set de pruebas automático; proveedor `fiscal` en
  `experience`.
- **Z3 · Documento equivalente POS** con CUDE: el que emiten los restaurantes en cada venta.
- **Z4 · Operación:** contingencia y plazo de 48 horas, `AttachedDocument` y PDF, alertas, panel en ProjectApp,
  asistente de habilitación en la consola del dueño (subir certificado, datos del software, correr el set de pruebas).
- **Z5 · Piloto:** una organización real en producción una semana, con su contador revisando lo emitido.

## Lo que necesitamos del dueño (bloquea Z0)

- Un **certificado digital** de firma (persona jurídica) para pruebas: el de ProjectApp sirve.
- **Habilitar a ProjectApp** como facturador en el portal de la DIAN (modalidad software propio) para obtener el
  identificador del software, su PIN y el `TestSetId` del ambiente de habilitación.

## Pruebas que deben existir (`# Falla si …`)

- Falla si el XML no valida contra los esquemas UBL 2.1 de la DIAN o si el CUFE/CUDE no coincide con los ejemplos
  del anexo.
- Falla si la firma no verifica, o si cambiar un byte del documento firmado no rompe la verificación.
- Falla si reenviar el mismo documento emite dos veces o cambia su número o su CUFE.
- Falla si una caída de la DIAN bloquea la venta, si el documento en contingencia no sale al volver la red, o si no
  hay alerta antes de las 48 horas.
- Falla si `fiscal` acepta una petición sin firma HMAC, con la firma vieja o de otra organización.
- Falla si el certificado o su contraseña quedan legibles en la base, en los registros o en una respuesta.
- Falla si una organización ve o emite documentos con el certificado de otra.

## Estado

- 2026-10-03: plan escrito. Esperando el certificado y la habilitación de ProjectApp para empezar Z0.
- 2026-10-03: estudio de viabilidad, operación y beneficio económico publicado en el gestor documental de ProjectApp
  (carpeta «Waiter SaaS», documento 233). Equilibrio frente a un proveedor: unos 9 a 27 locales según su precio.
  ProjectApp es persona natural: el facturador de pruebas puede ser el dueño (si está inscrito como facturador) o la
  SAS de un amigo, con autorización escrita.

**Superado (2026-10-04).** El dueño decidió que la facturación electrónica sea una API en su propio servidor y su propio
repositorio, fuera de Waiter, para servir a varios sistemas: **Fiscal.**, repositorio `ProjectAppLabs/fiscal_project`,
con su plan y sus fases (F0–F7) allí. Este documento queda como historia de la decisión; la integración con Waiter es
la fase F6 de Fiscal.

