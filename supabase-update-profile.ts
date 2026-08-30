// ============================================================
// SSR — update-profile
//
// Lets a signed-in partner update their own profile fields
// (Internal Integration Contact Email, Data Integration Preference).
// The caller's session token proves identity; the row is looked up
// by the email on that token, so a partner can only ever touch
// their own row.
//
// Deploy as an Edge Function named: update-profile
// Turn OFF "Verify JWT with legacy secret" on this function
// (it verifies the token itself, against the real signing keys).
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'Not signed in.' }, 401);

    const anon = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    );
    const { data: userData, error: userError } = await anon.auth.getUser(token);
    if (userError || !userData?.user?.email) return json({ error: 'Not signed in.' }, 401);
    const email = userData.user.email.toLowerCase();

    const { integrationContactEmail, dataIntegrationPreference } = await req.json();

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );

    const patch: Record<string, unknown> = {};
    if (integrationContactEmail !== undefined) patch.integration_contact_email = integrationContactEmail || null;
    if (dataIntegrationPreference !== undefined) patch.data_integration_preference = dataIntegrationPreference || null;

    if (Object.keys(patch).length === 0) return json({ error: 'Nothing to update.' }, 400);

    const { error: updateError } = await admin
      .from('pre_registrations')
      .update(patch)
      .ilike('business_email', email);

    if (updateError) throw updateError;

    return json({ success: true });
  } catch (err) {
    console.error('update-profile failed', err);
    return json({ error: 'We could not save your changes. Please try again shortly.' }, 500);
  }
});
