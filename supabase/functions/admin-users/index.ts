import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('PROJECT_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY')!;

async function authorize(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    throw new Error('No autenticado');
  }

  const { data: profile, error: profileError } = await service
    .from('profiles')
    .select('id, role, is_active')
    .eq('id', userData.user.id)
    .single();

  if (profileError || !profile) {
    throw new Error('Perfil no encontrado');
  }

  if (profile.role !== 'super_admin') {
    throw new Error('Solo el super admin puede gestionar usuarios');
  }

  return { service, currentUser: userData.user, currentProfile: profile };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { service, currentUser } = await authorize(request);

    if (request.method === 'GET') {
      const url = new URL(request.url);
      const page = Number(url.searchParams.get('page') || 1);
      const perPage = Number(url.searchParams.get('perPage') || 100);

      const { data, error } = await service.auth.admin.listUsers({ page, perPage });
      if (error) throw error;

      const ids = (data.users || []).map((user) => user.id);
      const profiles = ids.length
        ? await service.from('profiles').select('*').in('id', ids)
        : { data: [], error: null };

      if (profiles.error) throw profiles.error;

      const profileMap = new Map((profiles.data || []).map((profile) => [profile.id, profile]));

      return Response.json(
        {
          users: (data.users || []).map((user) => ({
            id: user.id,
            email: user.email,
            created_at: user.created_at,
            last_sign_in_at: user.last_sign_in_at,
            app_metadata: user.app_metadata,
            user_metadata: user.user_metadata,
            profile: profileMap.get(user.id) || null,
          })),
        },
        { headers: corsHeaders }
      );
    }

    if (request.method === 'PATCH') {
      const payload = await request.json();
      const { userId, role, isActive } = payload || {};

      if (!userId) throw new Error('Falta userId');

      const { error } = await service
        .from('profiles')
        .update({
          role: role ?? undefined,
          is_active: typeof isActive === 'boolean' ? isActive : undefined,
        })
        .eq('id', userId);

      if (error) throw error;

      return Response.json({ ok: true }, { headers: corsHeaders });
    }

    if (request.method === 'DELETE') {
      const payload = await request.json();
      const { userId } = payload || {};
      if (!userId) throw new Error('Falta userId');

      if (userId === currentUser.id) {
        throw new Error('No podés eliminar tu propio usuario desde esta función');
      }

      const { error } = await service.auth.admin.deleteUser(userId);
      if (error) throw error;

      return Response.json({ ok: true }, { headers: corsHeaders });
    }

    return Response.json({ error: 'Método no permitido' }, { status: 405, headers: corsHeaders });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 400, headers: corsHeaders }
    );
  }
});
