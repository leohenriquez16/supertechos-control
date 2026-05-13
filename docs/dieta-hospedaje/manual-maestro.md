# 🍽 Manual de Dieta + Hospedaje — Maestro / Supervisor

> Esta guía es para ti si la oficina te activó **dieta** y/o **hospedaje** en tu perfil. Si en tu caja chica ves la tarjeta "Dieta + Hospedaje · este mes", esto te aplica.

---

## 1. ¿Qué es esto y por qué cambió?

Cuando trabajas en proyectos del **interior**, la empresa te da un **presupuesto fijo por día** para comida y, si te quedas a dormir, para hotel.

**Antes** guardabas todas las facturas y la oficina te reembolsaba todo. **Ahora** la empresa ya te entregó el dinero en tu caja chica y tú decides cómo gastarlo:

- Si comes barato, **la diferencia es tuya**.
- Si gastas más, hablas con la oficina caso por caso.
- Las facturas de comida que reportes con la categoría correcta **no se reembolsan adicional**: la empresa ya te dio el dinero por adelantado.

---

## 2. Montos por día (los pone la oficina)

| Comida | Monto típico |
|---|---|
| 🥐 Desayuno | RD$ 200 |
| 🍽 Comida (almuerzo) | RD$ 350 |
| 🌙 Cena | RD$ 350 |
| 🛏 Hotel (noche) | RD$ 900 |

> Estos montos pueden cambiar. Los actuales siempre se ven en el botón **¿Cómo funciona?** de tu Caja Chica.

---

## 3. Cómo se carga al cerrar la jornada

Cuando termines el día y cierres la jornada en el app, en el modal aparece **🍽 Dieta + Hospedaje de hoy** con cada persona presente que tiene dieta activa.

Para cada persona marca:

- ✅ **🥐 Desayuno** — si desayunó hoy
- ✅ **🍽 Comida** — si almorzó hoy
- ✅ **🌙 Cena** — si cenó hoy (típicamente solo si se quedaron en el interior)
- ✅ **🛏 Hotel** — si durmió en hotel anoche

Cada marca **suma al presupuesto del mes** de esa persona. **No necesitas factura** para hacer la marca: la oficina ya autorizó ese monto por trabajar en el interior.

> 💡 Marca solo lo que **realmente consumieron**. Si alguien se quedó dormido temprano sin comer, no marques la cena.

---

## 4. Mi Caja Chica → "Dieta + Hospedaje · este mes"

En la pantalla **Mi Caja Chica** verás dos tarjetas naranja/morada:

### 🍽 Dieta
- **Presupuesto**: total que se acumuló este mes por todas las marcas (desayunos + comidas + cenas).
- **Facturas que descuentan**: total de facturas que reportaste con categoría de comida (badge 🍽 Dieta).
- **Holgura**: la diferencia.
  - Positiva (verde) → te sobró presupuesto, es tuyo.
  - Negativa (rojo) → gastaste más, habla con la oficina.

### 🛏 Hospedaje
- Funciona igual que Dieta pero con el hotel.

---

## 5. ¿Y las facturas de comida/hotel del interior?

Sí puedes reportarlas, **pero la categoría es la que decide el comportamiento**:

| Si la categoría tiene… | Qué pasa |
|---|---|
| `🍽 Dieta` (badge naranja) | La factura **descuenta del presupuesto de dieta**, no del saldo de tu caja. |
| `🛏 Hospedaje` (badge morado) | La factura **descuenta del presupuesto de hospedaje**. |
| Sin badge | Es un gasto normal **reembolsable** desde tu caja chica. |

> 💡 Si no estás seguro de qué categoría usar, reporta el gasto y la oficina lo ajusta al revisar.

---

## 6. Ejemplos rápidos

### Ejemplo A — Viaje de un día (sin dormir)
> Lunes: viajaste a Higüey en la mañana, regresaste en la tarde.

1. Al cerrar la jornada del lunes marca: **🍽 Comida** (RD$350). Tal vez también **🥐 Desayuno** si lo tomaste en el camino.
2. No marques cena ni hotel.
3. Presupuesto del mes: +RD$350 (o +RD$550 con desayuno).

### Ejemplo B — Viaje de 2 días con noche
> Lunes mañana → martes noche. Dormiste 1 noche en hotel.

| Día | Marca |
|---|---|
| Lunes | 🍽 Comida + 🌙 Cena + 🛏 Hotel |
| Martes | 🥐 Desayuno + 🍽 Comida |

Presupuesto total: 350 + 350 + 900 + 200 + 350 = **RD$ 2,150**

### Ejemplo C — La factura excede el presupuesto
> Marcaste comida (presupuesto RD$350) pero la factura del restaurante fue RD$ 600.

1. Reporta la factura con la categoría de comida. Aparece con badge 🍽 Dieta.
2. En la tarjeta del mes verás holgura negativa.
3. Habla con la oficina: tal vez fue circunstancia justificada (cliente extendió la jornada) y te ajustan, o tal vez la diferencia sale de tu bolsillo.

### Ejemplo D — Comiste barato
> Comida marcada RD$350, gastaste RD$180 en un comedor.

1. Reporta la factura RD$180 con categoría de comida → descuenta RD$180 del presupuesto.
2. Te queda RD$170 de holgura → **es tuyo**.
3. O simplemente no reportas la factura (es informal): el presupuesto entero queda como holgura.

> 💡 La oficina prefiere que reportes las facturas que tengas — sirve para llevar control. La holgura sigue siendo tuya igual.

---

## 7. Errores comunes y cómo arreglarlos

| Problema | Solución |
|---|---|
| Marqué una comida que no tomé | Pide a la oficina que **borre la marca** desde su vista (movimiento tipo "dieta" en tu caja). |
| Reporté factura con categoría incorrecta | Si está pendiente, edítala tú mismo en Mi Caja Chica → toca la fila. Si ya aprobada, pide al admin. |
| No me aparece la sección de dieta al cerrar jornada | Verifica con la oficina: o tu perfil no tiene `dieta_habilitada`, o el proyecto no tiene `aplica_dieta`. Se necesitan **ambos**. |
| Llegué tarde y solo cené | Marca solo **🌙 Cena**. No marques las que no tomaste. |

---

## 8. Lo que **NO** hace este sistema

- ❌ No te paga doble: el presupuesto y las facturas son la misma plata. La empresa solo cuenta lo que te dio en caja chica.
- ❌ No reemplaza al modo viejo si tu proyecto no tiene `aplica_dieta`. En proyectos normales sigues reportando facturas de comida y te reembolsan.
- ❌ No te bloquea de comer caro: puedes gastar lo que quieras, pero la holgura (positiva o negativa) refleja la diferencia.

---

## 9. Resumen en una frase

> **Al cerrar la jornada marca lo que comiste y dónde dormiste. La empresa ya te dio ese dinero. Lo que te sobre es tuyo.**

---

¿Dudas? Habla con la oficina o usa el botón **¿Cómo funciona?** dentro de Mi Caja Chica.
