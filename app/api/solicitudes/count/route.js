// GET /api/solicitudes/count → { nuevas: N }  (para el badge del menú "Solicitudes").
// service_role porque la tabla tiene RLS ON; solo devuelve el conteo, sin PII.
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } });
    const { count } = await db.from('solicitudes_levantamiento')
      .select('id', { count: 'exact', head: true }).eq('estado', 'nueva');
    return Response.json({ nuevas: count || 0 });
  } catch {
    return Response.json({ nuevas: 0 });
  }
}
