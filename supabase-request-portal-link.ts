// ============================================================
// SSR — request-portal-link
//
// Gatekeeper for the B2B Partner Portal. The browser never talks
// to Supabase Auth directly, so an arbitrary email address cannot
// obtain a sign-in link.
//
// Flow:
//   1. Look up the email in pre_registrations using the service role.
//   2. Approve only if mnda_executed = true AND partner_onboarding_active = true.
//   3. Ensure an auth user exists for that address.
//   4. Generate the magic link and email it with SSR's own copy
//      (so Supabase's stock template is never used).
//
// Deploy as an Edge Function named: request-portal-link
// Turn OFF "Verify JWT with legacy secret" on this function.
//
// Required secrets:
//   RESEND_API_KEY   — already set
//   PORTAL_URL       — e.g. https://xrpcowboys.com/SSR/Partner%20Portal.dc.html
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.)
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Deliberately identical whether the address is unknown or not yet approved:
// the portal must not reveal who is registered or how far along they are.
const DECLINE =
  'That address is not currently approved for portal access. Once your MNDA is countersigned, ' +
  'our team will activate your portal and confirm by email.';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { email } = await req.json();
    const address = String(email || '').trim().toLowerCase();
    if (!address || !address.includes('@')) {
      return json({ error: 'Please enter a valid email address.' }, 400);
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );

    const { data: rows, error: lookupError } = await admin
      .from('pre_registrations')
      .select('business_email, company_name, mnda_executed, partner_onboarding_active')
      .ilike('business_email', address)
      .limit(1);

    if (lookupError) throw lookupError;

    const row = rows?.[0];
    const approved = !!row && row.mnda_executed === true && row.partner_onboarding_active === true;
    if (!approved) {
      // 200, not 403 — a distinct status code would let anyone probe the list.
      return json({ allowed: false, message: DECLINE });
    }

    // Public signups stay disabled; approved partners get their auth user here.
    const { error: createError } = await admin.auth.admin.createUser({
      email: address,
      email_confirm: true,
    });
    if (createError && !/already/i.test(createError.message)) throw createError;

    const portalUrl = Deno.env.get('PORTAL_URL') || '';
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: address,
      options: { redirectTo: portalUrl },
    });
    if (linkError) throw linkError;

    const actionLink = link?.properties?.action_link;
    if (!actionLink) throw new Error('Supabase did not return a sign-in link.');

    const text = [
      'Hello,',
      '',
      'Click the link below to securely log into your private Split Second Royalties onboarding dashboard.',
      '',
      actionLink,
      '',
      'You can use this portal to upload your files, save your progress, and return at any time as you gather your documents.',
      '',
      'If you did not request this link, please ignore this email.',
      '',
      'Best,',
      'Split Second Royalties Team',
    ].join('\n');

    const html = `<div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#22252e;max-width:520px">
  <p style="margin:0 0 16px">Hello,</p>
  <p style="margin:0 0 16px">Click the link below to securely log into your private Split Second Royalties onboarding dashboard.</p>
  <p style="margin:0 0 18px"><a href="${actionLink}" style="display:inline-block;background:#d2571c;color:#ffffff;text-decoration:none;font-weight:700;padding:13px 24px;border-radius:8px">Log In to Secure Portal</a></p>
  <p style="margin:0 0 16px">You can use this portal to upload your files, save your progress, and return at any time as you gather your documents.</p>
  <p style="margin:0 0 16px;color:#5c6070;font-size:13.5px">If you did not request this link, please ignore this email.</p>
  <p style="margin:0;color:#5c6070;font-size:13.5px">Best,<br>Split Second Royalties Team</p>
</div>`;

    const send = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
      },
      body: JSON.stringify({
        from: 'Split Second Royalties <onboarding@splitsecondroyalties.com>',
        to: [address],
        subject: 'Access Your Secure Split Second Royalties Onboarding Portal',
        text,
        html,
      }),
    });

    if (!send.ok) throw new Error(`Resend responded ${send.status}: ${await send.text()}`);

    return json({ allowed: true });
  } catch (err) {
    console.error('request-portal-link failed', err);
    return json({ error: 'We could not send your sign-in link. Please try again shortly.' }, 500);
  }
});
