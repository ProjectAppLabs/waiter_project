# Arquitectura vigente y alcance de la ronda

```mermaid
flowchart LR
  Personal[Personal, dueño y ProjectApp] --> POS[POS · Next.js]
  Comensal --> Diner[Comensal · Next.js]
  POS -->|API POS y plataforma| Django[experience · Django]
  Diner -->|API pública del comensal| Django
  Django --> MySQL[(MySQL 8.4)]
```

Las rutas están en `experience/experience_project/urls.py`: `/api/pos/v1/`,
`/api/platform/v1/` y las rutas del comensal incluidas desde `experience_app`.
El POS reenvía `/experience/` al backend (`pos/next.config.ts`). El despliegue
está preparado en `deploy/`; esta ronda no lo aplica.

```mermaid
sequenceDiagram
  participant UI as Caja del POS
  participant Cola as Cola persistida
  participant API as API de movimientos
  participant DB as MySQL
  UI->>API: movimiento + clave estable
  API->>DB: permiso, sede, transacción y bloqueo del turno
  API->>DB: recuperar clave o crear movimiento y evento
  API-->>UI: ID y efectivo esperado
  opt respuesta perdida
    UI->>Cola: conservar carga y clave
    Cola->>API: reenviar la misma carga
    API-->>Cola: mismo movimiento, sin duplicarlo
  end
```

```mermaid
erDiagram
  Organization ||--o{ Restaurant : contiene
  Organization ||--o{ Account : contiene
  Restaurant ||--o{ CashShift : registra
  CashShift ||--o{ CashMove : registra
  Account ||--o{ CashMove : autor
  CashShift ||--o{ Order : agrupa
  Order ||--o{ OrderLine : contiene
  Order ||--o{ Payment : recibe
```

Relaciones verificadas en `tenancy/models.py`, `accounts/models.py` y
`sales/models.py`. El diagrama recorta el dominio a los cambios de caja;
no representa todos los modelos ni certifica todos los flujos del producto.
