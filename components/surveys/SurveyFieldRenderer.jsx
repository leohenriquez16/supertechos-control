'use client';

// v8.19.4: SurveyFieldRenderer — renderea un solo campo del template
// JSONB. Despacha sobre `field.type`. Tipos soportados en este PR (3B.4):
//   - text, textarea, number          → input simple
//   - single_select                   → radio buttons o dropdown
//   - multi_select                    → checkboxes
//   - boolean                         → toggle
//   - rating_1_5                      → 5 botones 1-5
//   - computed                        → label calculado (formula simple)
//   - photos                          → placeholder con # de fotos (real upload en PR 3B.5)
//   - measurement_table               → tabla con filas + auto cálculo m²
//   - openings_table                  → tabla de aperturas a descontar
//   - signature                       → placeholder
//
// Cada renderer recibe { field, value, onChange, allValues } donde:
//   - field: { id, label, type, required?, options?, columns?, formula?, show_if?, ... }
//   - value: valor actual del campo
//   - onChange(nuevoValor): callback
//   - allValues: objeto con todos los valores del bloque/sección (para show_if y computed)

import React from 'react';
import { Star, Camera, Plus, Trash2, Calculator } from 'lucide-react';
import PhotoCapture from './PhotoCapture';

export default function SurveyFieldRenderer({ field, value, onChange, allValues = {}, context = {} }) {
  // Soporte de show_if simple: "field_id == valor" o "field_id == true"
  if (field.show_if && !evaluarShowIf(field.show_if, allValues)) {
    return null;
  }

  const label = (
    <div className="flex items-center gap-1 mb-1">
      <span className="text-[11px] uppercase tracking-wider text-zinc-400 font-bold">{field.label}</span>
      {field.required && <span className="text-red-500 text-[11px]">*</span>}
    </div>
  );

  switch (field.type) {
    case 'text':
      return (
        <div>
          {label}
          <input
            type="text"
            value={value || ''}
            onChange={e => onChange(e.target.value)}
            placeholder={field.placeholder || ''}
            className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-2 text-sm text-white"
          />
        </div>
      );

    case 'textarea':
      return (
        <div>
          {label}
          <textarea
            value={value || ''}
            onChange={e => onChange(e.target.value)}
            placeholder={field.placeholder || ''}
            rows={field.rows || 3}
            className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-2 text-sm text-white resize-y"
          />
        </div>
      );

    case 'number':
      return (
        <div>
          {label}
          <div className="flex items-baseline gap-2">
            <input
              type="number"
              value={value ?? ''}
              onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
              step={field.step || 'any'}
              min={field.min}
              max={field.max}
              placeholder={field.placeholder || ''}
              className="flex-1 bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-2 text-sm text-white"
            />
            {field.unit && <span className="text-[11px] text-zinc-500">{field.unit}</span>}
          </div>
        </div>
      );

    case 'single_select': {
      const opts = field.options || [];
      const renderAsDropdown = opts.length > 5;
      if (renderAsDropdown) {
        return (
          <div>
            {label}
            <select
              value={value || ''}
              onChange={e => onChange(e.target.value || null)}
              className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-2 text-sm text-white"
            >
              <option value="">— Selecciona —</option>
              {opts.map(opt => {
                const v = typeof opt === 'string' ? opt : opt.value;
                const l = typeof opt === 'string' ? opt : (opt.label || opt.value);
                return <option key={v} value={v}>{l}</option>;
              })}
            </select>
          </div>
        );
      }
      return (
        <div>
          {label}
          <div className="flex flex-wrap gap-1.5">
            {opts.map(opt => {
              const v = typeof opt === 'string' ? opt : opt.value;
              const l = typeof opt === 'string' ? opt : (opt.label || opt.value);
              const activo = value === v;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => onChange(activo ? null : v)}
                  className={`text-xs px-3 py-1.5 border-2 transition-colors ${
                    activo
                      ? 'bg-red-600 border-red-600 text-white'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-red-600'
                  }`}
                >
                  {l}
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    case 'multi_select': {
      const opts = field.options || [];
      const current = Array.isArray(value) ? value : [];
      const toggle = (v) => {
        if (current.includes(v)) onChange(current.filter(x => x !== v));
        else onChange([...current, v]);
      };
      return (
        <div>
          {label}
          <div className="flex flex-wrap gap-1.5">
            {opts.map(opt => {
              const v = typeof opt === 'string' ? opt : opt.value;
              const l = typeof opt === 'string' ? opt : (opt.label || opt.value);
              const activo = current.includes(v);
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => toggle(v)}
                  className={`text-xs px-3 py-1.5 border-2 transition-colors ${
                    activo
                      ? 'bg-red-600 border-red-600 text-white'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-red-600'
                  }`}
                >
                  {l}
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    case 'boolean':
      return (
        <div className="flex items-center justify-between gap-3 bg-zinc-900 border border-zinc-800 rounded-card px-3 py-2">
          <span className="text-sm text-zinc-200">{field.label}</span>
          <button
            type="button"
            onClick={() => onChange(!value)}
            className={`relative inline-flex h-6 w-11 items-center transition-colors ${
              value ? 'bg-red-600' : 'bg-zinc-700'
            }`}
            aria-pressed={!!value}
          >
            <span
              className={`inline-block h-4 w-4 transform bg-white transition-transform ${
                value ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      );

    case 'rating_1_5': {
      const v = Number(value || 0);
      return (
        <div>
          {label}
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                type="button"
                onClick={() => onChange(n === v ? null : n)}
                className={`w-9 h-9 border-2 flex items-center justify-center text-sm font-bold ${
                  n <= v
                    ? 'bg-red-600 border-red-600 text-white'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-red-600'
                }`}
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              onClick={() => onChange(null)}
              className="ml-2 text-[10px] text-zinc-500 hover:text-white"
              title="Limpiar"
            >
              ×
            </button>
          </div>
        </div>
      );
    }

    case 'computed': {
      const calculated = computeFormula(field.formula, allValues);
      return (
        <div className="bg-zinc-900 border border-zinc-800 rounded-card px-3 py-2 flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wider text-zinc-400 font-bold flex items-center gap-1">
            <Calculator className="w-3 h-3" /> {field.label}
          </span>
          <span className="text-sm font-bold text-red-500">
            {calculated != null ? `${calculated}${field.unit ? ' ' + field.unit : ''}` : '—'}
          </span>
        </div>
      );
    }

    case 'photos':
      return (
        <PhotoCapture
          visitId={context.visitId}
          areaId={context.areaId || null}
          field={field}
          value={value}
          onChange={onChange}
        />
      );

    case 'measurement_table':
      return <MeasurementTableField field={field} value={value} onChange={onChange} />;

    case 'openings_table':
      return <OpeningsTableField field={field} value={value} onChange={onChange} />;

    case 'signature':
      return (
        <div>
          {label}
          <div className="bg-zinc-900 border-2 border-dashed border-zinc-700 p-4 text-center text-sm text-zinc-500">
            Firma (placeholder — PR posterior)
          </div>
        </div>
      );

    default:
      return (
        <div className="bg-amber-900/20 border border-amber-700 text-amber-300 p-2 text-xs">
          Campo no soportado: <code>{field.type}</code> ({field.id})
        </div>
      );
  }
}

// ============================================================
// MeasurementTable — filas con label + columns numéricas + total m²
// ============================================================
function MeasurementTableField({ field, value, onChange }) {
  const filas = Array.isArray(value) ? value : [];
  const columns = field.columns || [
    { id: 'label', label: 'Sección', type: 'text' },
    { id: 'length_m', label: 'Largo (m)', type: 'number' },
    { id: 'height_m', label: 'Alto (m)', type: 'number' },
  ];
  const autoCalcArea = field.auto_calc_area !== false;

  const agregarFila = () => {
    onChange([...filas, { id: 'm_' + Date.now() + Math.random().toString(36).slice(2, 5) }]);
  };
  const eliminarFila = (idx) => {
    onChange(filas.filter((_, i) => i !== idx));
  };
  const setCampo = (idx, colId, val) => {
    const nuevo = [...filas];
    nuevo[idx] = { ...nuevo[idx], [colId]: val };
    // Auto-calc area si hay length_m * height_m o length_m * width_m
    if (autoCalcArea) {
      const l = Number(nuevo[idx].length_m) || 0;
      const h = Number(nuevo[idx].height_m) || Number(nuevo[idx].width_m) || 0;
      nuevo[idx].area_m2 = (l && h) ? Number((l * h).toFixed(2)) : null;
    }
    onChange(nuevo);
  };

  const total = filas.reduce((acc, f) => acc + (Number(f.area_m2) || 0), 0);

  return (
    <div>
      <div className="flex items-center gap-1 mb-1">
        <span className="text-[11px] uppercase tracking-wider text-zinc-400 font-bold">{field.label}</span>
        {field.required && <span className="text-red-500 text-[11px]">*</span>}
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-card overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-zinc-950 border-b border-zinc-800">
            <tr>
              {columns.map(c => (
                <th key={c.id} className="px-2 py-1.5 text-left text-[10px] uppercase tracking-wider text-zinc-500">
                  {c.label}
                </th>
              ))}
              {autoCalcArea && (
                <th className="px-2 py-1.5 text-right text-[10px] uppercase tracking-wider text-red-400">
                  m²
                </th>
              )}
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && (
              <tr>
                <td colSpan={columns.length + 2} className="text-center text-zinc-500 py-3 text-[11px]">
                  Sin filas. Agrega una con el botón abajo.
                </td>
              </tr>
            )}
            {filas.map((f, idx) => (
              <tr key={f.id || idx} className="border-b border-zinc-800/50">
                {columns.map(c => (
                  <td key={c.id} className="px-1 py-1">
                    <input
                      type={c.type === 'number' ? 'number' : 'text'}
                      step="any"
                      value={f[c.id] ?? ''}
                      onChange={e => setCampo(idx, c.id, c.type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value)}
                      className="w-full bg-transparent border border-zinc-800 focus:border-red-600 outline-none px-2 py-1 text-xs text-white"
                    />
                  </td>
                ))}
                {autoCalcArea && (
                  <td className="px-2 py-1 text-right text-xs text-red-400 font-bold">
                    {f.area_m2 != null ? f.area_m2.toFixed(2) : '—'}
                  </td>
                )}
                <td className="px-1 py-1">
                  <button
                    type="button"
                    onClick={() => eliminarFila(idx)}
                    className="text-zinc-500 hover:text-red-500"
                    title="Eliminar fila"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          {autoCalcArea && filas.length > 0 && (
            <tfoot>
              <tr className="bg-zinc-950 border-t border-zinc-800">
                <td colSpan={columns.length} className="px-2 py-1.5 text-right text-[10px] uppercase tracking-wider text-zinc-500 font-bold">
                  Total
                </td>
                <td className="px-2 py-1.5 text-right text-sm font-black text-red-500">
                  {total.toFixed(2)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <button
        type="button"
        onClick={agregarFila}
        className="mt-2 text-xs text-red-500 hover:text-red-400 font-bold flex items-center gap-1"
      >
        <Plus className="w-3 h-3" /> Agregar fila
      </button>
    </div>
  );
}

// ============================================================
// OpeningsTable — tabla de aperturas (puertas/ventanas/etc) a descontar
// ============================================================
function OpeningsTableField({ field, value, onChange }) {
  const filas = Array.isArray(value) ? value : [];
  const tipos = field.types || ['puerta', 'ventana', 'otro'];

  const agregarFila = () => {
    onChange([...filas, { id: 'o_' + Date.now() + Math.random().toString(36).slice(2, 5), tipo: tipos[0], cantidad: 1, ancho_m: null, alto_m: null }]);
  };
  const eliminarFila = (idx) => {
    onChange(filas.filter((_, i) => i !== idx));
  };
  const setCampo = (idx, colId, val) => {
    const nuevo = [...filas];
    nuevo[idx] = { ...nuevo[idx], [colId]: val };
    const cant = Number(nuevo[idx].cantidad) || 0;
    const a = Number(nuevo[idx].ancho_m) || 0;
    const h = Number(nuevo[idx].alto_m) || 0;
    nuevo[idx].area_total_m2 = (cant && a && h) ? Number((cant * a * h).toFixed(2)) : null;
    onChange(nuevo);
  };

  const total = filas.reduce((acc, f) => acc + (Number(f.area_total_m2) || 0), 0);

  return (
    <div>
      <div className="flex items-center gap-1 mb-1">
        <span className="text-[11px] uppercase tracking-wider text-zinc-400 font-bold">{field.label}</span>
        {field.required && <span className="text-red-500 text-[11px]">*</span>}
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-card overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-zinc-950 border-b border-zinc-800">
            <tr>
              <th className="px-2 py-1.5 text-left text-[10px] uppercase tracking-wider text-zinc-500">Tipo</th>
              <th className="px-2 py-1.5 text-left text-[10px] uppercase tracking-wider text-zinc-500">Cant.</th>
              <th className="px-2 py-1.5 text-left text-[10px] uppercase tracking-wider text-zinc-500">Ancho m</th>
              <th className="px-2 py-1.5 text-left text-[10px] uppercase tracking-wider text-zinc-500">Alto m</th>
              <th className="px-2 py-1.5 text-right text-[10px] uppercase tracking-wider text-amber-400">m² total</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-zinc-500 py-3 text-[11px]">
                  Sin aperturas. Agrega una con el botón abajo.
                </td>
              </tr>
            )}
            {filas.map((f, idx) => (
              <tr key={f.id || idx} className="border-b border-zinc-800/50">
                <td className="px-1 py-1">
                  <select
                    value={f.tipo || tipos[0]}
                    onChange={e => setCampo(idx, 'tipo', e.target.value)}
                    className="w-full bg-transparent border border-zinc-800 focus:border-red-600 outline-none px-2 py-1 text-xs text-white"
                  >
                    {tipos.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </td>
                <td className="px-1 py-1">
                  <input
                    type="number"
                    value={f.cantidad ?? ''}
                    onChange={e => setCampo(idx, 'cantidad', e.target.value === '' ? null : Number(e.target.value))}
                    className="w-full bg-transparent border border-zinc-800 focus:border-red-600 outline-none px-2 py-1 text-xs text-white"
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    type="number"
                    step="any"
                    value={f.ancho_m ?? ''}
                    onChange={e => setCampo(idx, 'ancho_m', e.target.value === '' ? null : Number(e.target.value))}
                    className="w-full bg-transparent border border-zinc-800 focus:border-red-600 outline-none px-2 py-1 text-xs text-white"
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    type="number"
                    step="any"
                    value={f.alto_m ?? ''}
                    onChange={e => setCampo(idx, 'alto_m', e.target.value === '' ? null : Number(e.target.value))}
                    className="w-full bg-transparent border border-zinc-800 focus:border-red-600 outline-none px-2 py-1 text-xs text-white"
                  />
                </td>
                <td className="px-2 py-1 text-right text-xs text-amber-400 font-bold">
                  {f.area_total_m2 != null ? f.area_total_m2.toFixed(2) : '—'}
                </td>
                <td className="px-1 py-1">
                  <button
                    type="button"
                    onClick={() => eliminarFila(idx)}
                    className="text-zinc-500 hover:text-red-500"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          {filas.length > 0 && (
            <tfoot>
              <tr className="bg-zinc-950 border-t border-zinc-800">
                <td colSpan={4} className="px-2 py-1.5 text-right text-[10px] uppercase tracking-wider text-zinc-500 font-bold">
                  Total a descontar
                </td>
                <td className="px-2 py-1.5 text-right text-sm font-black text-amber-400">
                  {total.toFixed(2)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <button
        type="button"
        onClick={agregarFila}
        className="mt-2 text-xs text-red-500 hover:text-red-400 font-bold flex items-center gap-1"
      >
        <Plus className="w-3 h-3" /> Agregar apertura
      </button>
    </div>
  );
}

// ============================================================
// Helpers de fórmulas y condicionales
// ============================================================

// Evalúa show_if simple: "field_id == valor" o "field_id == true" o "field_id != null"
function evaluarShowIf(expr, allValues) {
  if (!expr || typeof expr !== 'string') return true;
  // Parsing muy simple: <field_id> <op> <literal>
  const m = expr.match(/^\s*([\w.-]+)\s*(==|!=|>|<|>=|<=)\s*(.+?)\s*$/);
  if (!m) return true;
  const [, fieldId, op, rhsRaw] = m;
  const lhs = allValues[fieldId];
  let rhs = rhsRaw.trim();
  // Parse RHS literal
  if (rhs === 'true') rhs = true;
  else if (rhs === 'false') rhs = false;
  else if (rhs === 'null') rhs = null;
  else if (!isNaN(Number(rhs))) rhs = Number(rhs);
  else if ((rhs.startsWith('"') && rhs.endsWith('"')) || (rhs.startsWith("'") && rhs.endsWith("'"))) rhs = rhs.slice(1, -1);
  switch (op) {
    case '==': return lhs == rhs;
    case '!=': return lhs != rhs;
    case '>':  return Number(lhs) > Number(rhs);
    case '<':  return Number(lhs) < Number(rhs);
    case '>=': return Number(lhs) >= Number(rhs);
    case '<=': return Number(lhs) <= Number(rhs);
    default:   return true;
  }
}

// Evalúa fórmula simple: solo aritmética con field_id como variables.
// Ej: "length_m * width_m" o "(gross - openings) * 1.1"
function computeFormula(formula, allValues) {
  if (!formula || typeof formula !== 'string') return null;
  try {
    // Reemplaza identificadores por sus valores numéricos (o 0 si null)
    const expr = formula.replace(/[a-zA-Z_][a-zA-Z0-9_]*/g, (id) => {
      const v = allValues[id];
      return v == null ? '0' : String(Number(v) || 0);
    });
    // Solo permitimos +, -, *, /, parens, dígitos y punto
    if (!/^[\d+\-*/().\s]+$/.test(expr)) return null;
    // eslint-disable-next-line no-new-func
    const result = Function('"use strict"; return (' + expr + ')')();
    return Number.isFinite(result) ? Number(result.toFixed(2)) : null;
  } catch {
    return null;
  }
}
