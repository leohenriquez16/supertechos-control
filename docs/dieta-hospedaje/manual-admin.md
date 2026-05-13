# 🏢 Manual de Dieta + Hospedaje — Oficina / Admin

> Guía para administrar el módulo de dieta y hospedaje, configurar montos, revisar cuadres y manejar excepciones.

---

## 1. ¿Qué problema resuelve?

Cuando enviamos maestros/supervisores al interior, antes pagábamos:
- El dinero diario fijo de comida (RD$ X/día).
- + todas las facturas de comida que traían.
- = doble pago en muchos casos, sin tracking limpio.

Ahora damos **un solo monto fijo por sub-tipo** (desayuno/comida/cena/hotel) que se debita de la caja chica del maestro cuando él marca "consumí" al cerrar jornada. Las facturas de comida que reporta **no se reembolsan**: solo descuentan del presupuesto que ya le dimos, y la **holgura es del maestro**.

---

## 2. Modelo opt-in en 2 niveles

Para que aplique a un movimiento, **ambos toggles deben estar en `true`**:

| Nivel | Toggle | Dónde se configura |
|---|---|---|
| Persona | `dieta_habilitada` / `hospedaje_habilitado` | Personal → Editar maestro/supervisor → "Dieta y Hospedaje en proyectos del interior" |
| Proyecto | `aplica_dieta` / `aplica_hospedaje` | Modal de editar proyecto → "Dieta granular + Hospedaje (interior)" |

Si solo uno está activo, el sistema **ignora** la dieta para esa combinación. Esto es intencional: hay maestros que nunca viajan, y proyectos en la capital donde no aplica.

---

## 3. Configuración inicial (una sola vez)

### 3.1. Montos globales
Caja Chica → **Categorías** → tarjeta arriba **"Montos de dieta + hospedaje"** → Editar.

Defaults:
- 🥐 Desayuno: RD$ 200
- 🍽 Comida: RD$ 350
- 🌙 Cena: RD$ 350
- 🛏 Hotel: RD$ 900

Cambiar los montos **NO afecta movimientos viejos** (ya quedaron registrados con su monto original). Solo aplica a marcas nuevas.

### 3.2. Categorías con `aplica_a`
Para que las facturas de comida/hotel descuenten del presupuesto en vez de reembolsarse, sus categorías deben tener `aplica_a` seteado.

En Caja Chica → Categorías → Editar categoría → dropdown **"Cuenta a presupuesto de…"**:
- `🍽 Dieta` → la factura descuenta del presupuesto de comida.
- `🛏 Hospedaje` → descuenta del de hotel.
- `— Ninguna —` (default) → es un gasto normal reembolsable.

> Recomendación: marca `dieta` a las categorías típicas de comida (Restaurante, Comida obrero, Comida cliente) y `hospedaje` a Hotel/Alojamiento.

### 3.3. Habilitar a las personas elegibles
Personal → Editar maestro/supervisor que viaja al interior → "Dieta y Hospedaje en proyectos del interior" → activar ambos toggles (o solo el que aplique).

### 3.4. Habilitar a los proyectos del interior
Modal editar proyecto → al final, "Dieta granular + Hospedaje (interior)" → activar ambos toggles.

---

## 4. Flujo diario

1. **Maestro en obra**: al cerrar la jornada, marca para cada persona presente qué comidas tomó y si durmió en hotel.
2. **Sistema**: por cada marca crea un movimiento `tipo='dieta'` (o `'hospedaje'`) con `sub_tipo` (desayuno/comida/cena/hotel) y monto fijo. Status: `aprobado` automáticamente.
3. **Maestro durante el viaje**: reporta facturas de comida con la categoría adecuada. Si la categoría tiene `aplica_a='dieta'`, el movimiento queda con badge 🍽 y **NO descuenta de su saldo** (solo del presupuesto).
4. **Admin revisa la bandeja** y aprueba/rechaza facturas como siempre.
5. **Al cuadrar**: la holgura (presupuesto − facturas) **se queda con el maestro**. No hay nada que pagar adicional.

---

## 5. Cómo leer la caja del maestro

En **Vista admin → Por Persona → expandir card** o **Bandeja**, verás los movimientos:

| Tipo de movimiento | Qué significa | Afecta saldo |
|---|---|---|
| `entrega` | La empresa le entregó cash | ➕ Suma |
| `dieta` con `sub_tipo` | Marca de "consumí desayuno/comida/cena" | ➖ Resta |
| `hospedaje` con `sub_tipo=hotel` | Marca de "dormí en hotel" | ➖ Resta |
| `gasto_factura` **sin** `aplica_a` | Gasto normal reembolsable | ➖ Resta |
| `gasto_factura` **con** `aplica_a` (badge 🍽/🛏) | Factura informativa: ya descontó la marca | ❌ NO afecta saldo (solo informa) |
| `ajuste` | Corrección manual | Depende de signo |

> El `saldo` de la vista `caja_chica_saldos` ya ignora las facturas con `aplica_a` para no doble-debitar.

---

## 6. Cálculo de la holgura

Por persona × mes:

```
Presupuesto = SUMA de movimientos tipo='dieta' o 'hospedaje' con sub_tipo (créditos)
Consumido   = SUMA de gasto_factura con aplica_a (facturas que reportó)
Holgura     = Presupuesto − Consumido
```

- **Holgura positiva** → al maestro le sobró. La diferencia ya es suya (ya está en su caja).
- **Holgura negativa** → reportó más facturas que el presupuesto. Es **circunstancia anómala**: decide caso por caso.
- **Holgura = 0 con presupuesto 0** → no se cargó nada este mes (no viajó, o no marcaron).

El maestro ve este número en su Mi Caja Chica, tarjeta "Dieta + Hospedaje · este mes".

---

## 7. Excepciones y cómo manejarlas

### 7.1. El maestro marcó comida que no tomó
**Síntoma**: presupuesto inflado, holgura demasiado positiva.

**Solución**: abre la caja del maestro → encuentra el movimiento `tipo='dieta'` con la fecha equivocada → eliminar. Si ya cuadraste el mes, registra un `ajuste` negativo en su lugar.

### 7.2. La factura excede el monto fijo
**Síntoma**: holgura negativa.

**Posibles causas**:
- Cliente extendió jornada y comieron en zona cara.
- Lluvia cerró opciones baratas.
- Maestro pidió de más sin justificación.

**Decisión**: caso por caso. Si justificable, registra un `ajuste` positivo en su caja (cubre la diferencia). Si no, le explicas que la diferencia es de él.

### 7.3. Factura de comida en proyecto sin `aplica_dieta`
**Síntoma**: gasto reembolsable normal (sin badge).

**Solución**: nada que hacer. El sistema correctamente lo trata como reembolso porque el proyecto no tiene dieta activa.

### 7.4. Persona viajó pero no tiene `dieta_habilitada`
**Síntoma**: al cerrar jornada no aparecen los checkboxes para esa persona.

**Solución**: activa el toggle en su perfil. Si ya cerró la jornada, registra manualmente los movimientos `dieta`/`hospedaje` con monto fijo desde la edición del movimiento (o desde la consola si es urgente).

### 7.5. Cambio de montos a mitad de mes
Los movimientos viejos mantienen su monto original. Solo las marcas nuevas usan los nuevos montos. **No hay que recalcular**.

### 7.6. El maestro reportó la factura con la categoría incorrecta
Abre el movimiento en la bandeja → cambia la categoría → el sistema recalcula `aplica_a` automáticamente desde la nueva categoría.

---

## 8. Cuadre mensual / cierre

1. Al final del mes, abre **Vista admin → Por Persona** y por cada maestro con dieta activa:
   - Suma de movimientos `tipo='dieta'` + `'hospedaje'` = presupuesto del mes.
   - Suma de `gasto_factura` con `aplica_a` = consumido reportado.
   - Diferencia = lo que se queda el maestro.
2. La caja chica del maestro debe coincidir físicamente: si tiene RD$X en efectivo + presupuesto pendiente de gastar, debe sumar el saldo del sistema.
3. Si hay discrepancias, revisa los movimientos rechazados o los `ajuste` manuales que hayas registrado.

---

## 9. Reglas para tener en cuenta

- ✅ Los maestros **NO necesitan factura** para marcar consumos al cerrar jornada. El monto fijo se aplica directo.
- ✅ Las facturas con `aplica_a` están **solo para tracking**: NO se reembolsan adicional.
- ✅ Cambiar montos en config no afecta histórico.
- ✅ Opt-in 2 niveles: si quitas el toggle a una persona, todos sus movimientos viejos se quedan donde están.
- ⚠️ Si un maestro nunca debió tener dieta, desactiva el toggle. Los movimientos pasados se mantienen pero ya no podrá marcar consumos nuevos.

---

## 10. SQL útil para auditoría

### Resumen del mes para un maestro
```sql
SELECT
  fecha,
  tipo,
  sub_tipo,
  aplica_a,
  monto,
  concepto,
  status
FROM caja_chica_movimientos
WHERE persona_id = '<id_del_maestro>'
  AND fecha >= '2026-05-01'
  AND fecha <= '2026-05-31'
  AND (tipo IN ('dieta', 'hospedaje') OR aplica_a IS NOT NULL)
ORDER BY fecha;
```

### Holgura del mes (presupuesto − consumido) por persona
```sql
SELECT
  persona_id,
  SUM(CASE WHEN tipo IN ('dieta','hospedaje') THEN monto ELSE 0 END) AS presupuesto,
  SUM(CASE WHEN tipo = 'gasto_factura' AND aplica_a IS NOT NULL THEN monto ELSE 0 END) AS consumido,
  SUM(CASE WHEN tipo IN ('dieta','hospedaje') THEN monto ELSE 0 END) -
  SUM(CASE WHEN tipo = 'gasto_factura' AND aplica_a IS NOT NULL THEN monto ELSE 0 END) AS holgura
FROM caja_chica_movimientos
WHERE fecha >= '2026-05-01' AND fecha <= '2026-05-31'
  AND status = 'aprobado'
GROUP BY persona_id;
```

---

## 11. Resumen ejecutivo

> **La empresa paga un presupuesto fijo por día al maestro/supervisor del interior. El maestro marca lo que consumió. Las facturas de comida son para tracking, no para reembolso adicional. La holgura se queda con el maestro.**

Toggles persona × proyecto → categorías marcadas → montos configurables → marcas al cerrar jornada → tracking automático en caja chica → cuadre mensual sin sorpresas.

---

¿Algo no encaja con un caso real? Documenta el caso y lo conversamos para ajustar el flujo o agregar una excepción al sistema.
