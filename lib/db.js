// =====================================================================
// v8.9.26 - Notificaciones por email
// =====================================================================

export async function listarNotificationConfigs() {
  const { data, error } = await supabase
    .from('notification_configs')
    .select('*')
    .order('categoria', { ascending: true })
    .order('nombre', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function toggleNotificationActiva(id, activo) {
  const { data, error } = await supabase
    .from('notification_configs')
    .update({ activo })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function actualizarDestinatarios(id, destinatarios) {
  if (!Array.isArray(destinatarios)) {
    throw new Error('destinatarios debe ser un array');
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const limpios = destinatarios
    .map((e) => String(e).trim())
    .filter((e) => e.length > 0);
  const invalidos = limpios.filter((e) => !emailRegex.test(e));
  if (invalidos.length > 0) {
    throw new Error(`Emails inválidos: ${invalidos.join(', ')}`);
  }
  const { data, error } = await supabase
    .from('notification_configs')
    .update({ destinatarios: limpios })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listarUltimosEnviosNotificacion(limite = 50) {
  const { data, error } = await supabase
    .from('notification_sends')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limite);
  if (error) throw error;
  return data || [];
}
