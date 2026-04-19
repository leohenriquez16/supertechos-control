'use client';

import { useEffect, useState } from 'react';
import {
  listarNotificationConfigs,
  toggleNotificationActiva,
  actualizarDestinatarios,
} from './db';
import { probarEvento } from './email';

const CATEGORIAS_META = {
  seguridad: { label: 'Seguridad', icon: '🛡️', color: '#b91c1c' },
  operaciones: { label: 'Operaciones', icon: '🏗️', color: '#1e40af' },
  finanzas: { label: 'Finanzas', icon: '💵', color: '#047857' },
  credenciales: { label: 'Credenciales', icon: '🔑', color: '#7c2d12' },
  sistema: { label: 'Sistema', icon: '⚙️', color: '#374151' },
};

function SeveridadBadge({ severidad }) {
  const map = {
    alerta: { bg: '#fef2f2', fg: '#b91c1c', label: 'Alerta' },
    aviso: { bg: '#fffbeb', fg: '#92400e', label: 'Aviso' },
    info: { bg: '#eff6ff', fg: '#1e40af', label: 'Info' },
  };
  const s = map[severidad] || map.info;
  return (
    <span
      className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded uppercase tracking-wide"
      style={{ background: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
}

function formatearUltimoEnvio(iso, ok) {
  if (!iso) return <span className="text-gray-400 text-xs">Nunca</span>;
  const fecha = new Date(iso);
  const ahora = new Date();
  const diffMs = ahora - fecha;
  const diffHoras = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDias = Math.floor(diffHoras / 24);

  let txt;
  if (diffHoras < 1) txt = 'hace minutos';
  else if (diffHoras < 24) txt = `hace ${diffHoras}h`;
  else if (diffDias < 30) txt = `hace ${diffDias}d`;
  else txt = fecha.toLocaleDateString('es-DO');

  return (
    <span className={`text-xs ${ok === false ? 'text-red-600' : 'text-gray-600'}`}>
      {ok === false ? '⚠ ' : ''}
      {txt}
    </span>
  );
}

function ConfigCard({ config, onToggle, onSaveDestinatarios, onProbar }) {
  const [editando, setEditando] = useState(false);
  const [destinatariosTxt, setDestinatariosTxt] = useState(
    (config.destinatarios || []).join(', ')
  );
  const [probandoResultado, setProbandoResultado] = useState(null);
  const [probando, setProbando] = useState(false);

  async function handleProbar() {
    setProbando(true);
    setProbandoResultado(null);
    const res = await onProbar(config.evento_key);
    setProbando(false);
    setProbandoResultado(res);
    setTimeout(() => setProbandoResultado(null), 5000);
  }

  async function handleGuardarDestinatarios() {
    const lista = destinatariosTxt
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      await onSaveDestinatarios(config.id, lista);
      setEditando(false);
    } catch (err) {
      alert('Error al guardar destinatarios: ' + (err?.message || err));
    }
  }

  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-semibold text-sm text-gray-900">{config.nombre}</h4>
            <SeveridadBadge severidad={config.severidad} />
          </div>
          {config.descripcion && (
            <p className="text-xs text-gray-600 mt-1">{config.descripcion}</p>
          )}
        </div>
        <label className="relative inline-flex items-center cursor-pointer shrink-0">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={!!config.activo}
            onChange={(e) => onToggle(config.id, e.target.checked)}
          />
          <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-green-500 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-transform peer-checked:after:translate-x-5"></div>
        </label>
      </div>

      <div className="mt-3 pt-3 border-t border-gray-100">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Destinatarios
          </span>
          {!editando && (
            <button
              type="button"
              onClick={() => setEditando(true)}
              className="text-xs text-blue-600 hover:underline"
            >
              Editar
            </button>
          )}
        </div>
        {editando ? (
          <div>
            <textarea
              value={destinatariosTxt}
              onChange={(e) => setDestinatariosTxt(e.target.value)}
              className="w-full text-xs border border-gray-300 rounded px-2 py-1 font-mono"
              rows={2}
              placeholder="email1@dominio.com, email2@dominio.com"
            />
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={handleGuardarDestinatarios}
                className="text-xs bg-gray-900 text-white px-3 py-1 rounded hover:bg-gray-700"
              >
                Guardar
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditando(false);
                  setDestinatariosTxt((config.destinatarios || []).join(', '));
                }}
                className="text-xs text-gray-600 px-3 py-1 rounded hover:bg-gray-100"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="text-xs text-gray-700">
            {(config.destinatarios || []).length === 0 ? (
              <span className="text-red-600 italic">Sin destinatarios</span>
            ) : (
              (config.destinatarios || []).map((e, i) => (
                <span
                  key={i}
                  className="inline-block bg-gray-100 text-gray-800 rounded px-2 py-0.5 mr-1 mb-1 font-mono"
                >
                  {e}
                </span>
              ))
            )}
          </div>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
        <div className="text-xs text-gray-500">
          Último envío: {formatearUltimoEnvio(config.ultimo_envio, config.ultimo_envio_ok)}
          {config.total_enviados > 0 && (
            <span className="ml-2 text-gray-400">· {config.total_enviados} enviados</span>
          )}
        </div>
        <button
          type="button"
          onClick={handleProbar}
          disabled={probando || !config.activo || (config.destinatarios || []).length === 0}
          className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {probando ? 'Enviando...' : 'Probar'}
        </button>
      </div>

      {probandoResultado && (
        <div
          className={`mt-2 text-xs px-2 py-1 rounded ${
            probandoResultado.ok
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {probandoResultado.ok
            ? `✓ Enviado correctamente (${probandoResultado.resend_id || 'sin ID'})`
            : `✗ Error: ${probandoResultado.error}`}
        </div>
      )}

      {config.ultimo_envio_error && (
        <div className="mt-2 text-xs px-2 py-1 rounded bg-red-50 text-red-600 border border-red-200">
          Último error: {config.ultimo_envio_error}
        </div>
      )}
    </div>
  );
}

export default function NotificacionesPanel({ userRole = 'admin' }) {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  async function cargar() {
    setLoading(true);
    setErr(null);
    try {
      const data = await listarNotificationConfigs();
      setConfigs(data);
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  async function handleToggle(id, activo) {
    try {
      await toggleNotificationActiva(id, activo);
      setConfigs((prev) => prev.map((c) => (c.id === id ? { ...c, activo } : c)));
    } catch (e) {
      alert('Error al cambiar estado: ' + (e?.message || e));
    }
  }

  async function handleSaveDestinatarios(id, destinatarios) {
    const actualizado = await actualizarDestinatarios(id, destinatarios);
    setConfigs((prev) => prev.map((c) => (c.id === id ? actualizado : c)));
  }

  async function handleProbar(evento_key) {
    return await probarEvento(evento_key);
  }

  const puedeEditar = userRole === 'admin' || userRole === 'supervisor';

  if (!puedeEditar) {
    return (
      <div className="p-4 text-sm text-gray-600">
        No tienes permisos para ver esta sección.
      </div>
    );
  }

  if (loading) {
    return <div className="p-4 text-sm text-gray-500">Cargando configuración...</div>;
  }

  if (err) {
    return (
      <div className="p-4 text-sm text-red-600">
        Error al cargar: {err}
        <button
          type="button"
          onClick={cargar}
          className="ml-2 text-blue-600 hover:underline"
        >
          Reintentar
        </button>
      </div>
    );
  }

  const porCategoria = configs.reduce((acc, c) => {
    const cat = c.categoria || 'sistema';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(c);
    return acc;
  }, {});

  const categoriasOrdenadas = Object.keys(porCategoria).sort((a, b) => {
    const order = ['seguridad', 'operaciones', 'finanzas', 'credenciales', 'sistema'];
    return order.indexOf(a) - order.indexOf(b);
  });

  return (
    <div className="p-4 max-w-5xl mx-auto">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">Notificaciones por email</h2>
        <p className="text-sm text-gray-600 mt-1">
          Configura qué eventos del ERP envían correos y a quién. Los correos salen
          desde <code className="bg-gray-100 px-1 rounded">noreply@notificaciones.supertechos.com.do</code>.
        </p>
      </div>

      {configs.length === 0 ? (
        <div className="text-sm text-gray-500 border border-dashed border-gray-300 rounded p-6 text-center">
          No hay eventos configurados todavía.
        </div>
      ) : (
        categoriasOrdenadas.map((cat) => {
          const meta = CATEGORIAS_META[cat] || CATEGORIAS_META.sistema;
          return (
            <div key={cat} className="mb-6">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-200">
                <span className="text-lg">{meta.icon}</span>
                <h3 className="text-sm font-semibold uppercase tracking-wide" style={{ color: meta.color }}>
                  {meta.label}
                </h3>
                <span className="text-xs text-gray-400">({porCategoria[cat].length})</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {porCategoria[cat].map((c) => (
                  <ConfigCard
                    key={c.id}
                    config={c}
                    onToggle={handleToggle}
                    onSaveDestinatarios={handleSaveDestinatarios}
                    onProbar={handleProbar}
                  />
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
