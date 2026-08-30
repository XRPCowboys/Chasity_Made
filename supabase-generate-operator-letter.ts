// ============================================================
// SSR — generate-operator-letter
//
// Builds the Operator Data Request Letter PDF for a signed-in
// partner, verbatim from Dave's template, with:
//   - [Client Name] / [Client Company Name] filled from company_name
//   - [Client Executive Name] filled from the registrant's contact name
//   - CC line filled from integration_contact_email
//       (falls back to the registrant's own business_email if blank)
//   - The "To:" line filled from the operator IT contact captured in
//     the partner's saved Data Integration Preference, when present
//   - The response date filled to 14 days from generation
//
// Returns the PDF as base64 for the portal to trigger a download.
//
// Deploy as an Edge Function named: generate-operator-letter
// Turn OFF "Verify JWT with legacy secret" on this function.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { PDFDocument, StandardFonts, rgb } from 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.esm.js';

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

function toBase64(bytes: Uint8Array) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(bin);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'Not signed in.' }, 401);

    const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!);
    const { data: userData, error: userError } = await anon.auth.getUser(token);
    if (userError || !userData?.user?.email) return json({ error: 'Not signed in.' }, 401);
    const email = userData.user.email.toLowerCase();

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );

    const { data: rows, error: lookupError } = await admin
      .from('pre_registrations')
      .select('first_name, last_name, business_email, company_name, integration_contact_email, data_integration_preference')
      .ilike('business_email', email)
      .limit(1);
    if (lookupError) throw lookupError;

    const row = rows?.[0];
    if (!row) return json({ error: 'No profile found for this account.' }, 404);

    const company = row.company_name || 'Registrant Company';
    const executive = [row.first_name, row.last_name].filter(Boolean).join(' ') || '[Client Executive Name]';
    const cc = row.integration_contact_email || row.business_email || '[Client Internal Technical Integration Team]';
    const pref = row.data_integration_preference || {};
    const operatorContact = pref.operatorItEmail || '[Operator Partner Relations or SCADA Admin Contact]';

    const respondBy = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
      .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    // ---- Build the PDF ----
    const doc = await PDFDocument.create();
    const helv = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const ital = await doc.embedFont(StandardFonts.HelveticaOblique);

    const L = 72, R = 540, W = R - L, BOTTOM = 66;
    const ink = rgb(0.13, 0.14, 0.18), grey = rgb(0.42, 0.43, 0.47);

    let page: any, y: number;
    function newPage() {
      page = doc.addPage([612, 792]);
      y = 726;
    }
    function room(lines = 1, size = 10.2) { if (y - lines * size * 1.42 < BOTTOM) newPage(); }
    function wrapLines(text: string, font: any, size: number, maxW: number) {
      const out: string[] = [];
      for (const seg of text.split('\n')) {
        const words = seg.split(' ');
        let cur = '';
        for (const w of words) {
          const t = cur ? cur + ' ' + w : w;
          if (font.widthOfTextAtSize(t, size) > maxW && cur) { out.push(cur); cur = w; }
          else cur = t;
        }
        out.push(cur);
      }
      return out;
    }
    function para(text: string, opts: any = {}) {
      const size = opts.size ?? 10.2, font = opts.font ?? helv, gap = opts.gap ?? 10;
      const lines = wrapLines(text, font, size, W);
      for (const ln of lines) { room(1, size); page.drawText(ln, { x: L, y, size, font, color: ink }); y -= size * 1.42; }
      y -= gap;
    }
    function bullet(label: string, body: string) {
      room(2);
      const size = 10.2, indent = 16, leadW = bold.widthOfTextAtSize(label + ' ', size);
      const lines = wrapLines(body, helv, size, W - indent - leadW);
      page.drawText(label, { x: L + indent, y, size, font: bold, color: ink });
      if (lines.length) page.drawText(lines[0], { x: L + indent + leadW, y, size, font: helv, color: ink });
      y -= size * 1.42;
      for (const ln of lines.slice(1)) { room(1, size); page.drawText(ln, { x: L + indent, y, size, font: helv, color: ink }); y -= size * 1.42; }
      y -= 9;
    }

    newPage();
    page.drawText('[Draft — Client Letterhead]', { x: L, y, size: 9, font: ital, color: grey });
    y -= 22;
    para(`Subject: Daily Volumetric Partner Data Ingestion Setup — ${company} Leases`, { font: bold, gap: 4 });
    para(`To: ${operatorContact}`, { gap: 4 });
    para(`CC: ${cc}`, { gap: 18 });

    para('Dear Operator Team,', { gap: 12 });

    para(`As part of our ongoing internal digital modernization, compliance, and auditing initiatives, ${company} is upgrading our internal asset management and reporting systems. This upgraded system is designed to automate our daily volumetric reconciliations for standard reporting and internal auditing purposes.`);
    para('To support this operational transition, we are establishing secure, read-only data connections for the specific wells we hold an interest in, as detailed in the attached Schedule A (containing our Well Names, API numbers, and decimal interests). Specifically, we request read-only access to daily totalized production volumes (24-hour totalized oil, gas, and water volumes) for these assets.');
    para('These daily figures are for internal reconciliation and timing visibility only; we understand they are unallocated, and we will continue to settle against your official month-end statements.');
    para('To make this setup as straightforward as possible for your technical team, our technical integration specialists will handle all coordination. We are highly flexible and happy to establish this connection using whichever of the following methods is easiest for your IT department to support:');

    bullet('Option A: Cloud Data Sharing (Highly Preferred):', 'A read-only Snowflake Secure Data Share, AWS S3 bucket share, or equivalent cloud data warehouse link.');
    bullet('Option B: Automated File Transfer:', 'A daily automated push of standardized production reports (CSV or JSON) to our secure SFTP server or cloud storage bucket.');
    bullet('Option C: Read-Only API Ingestion:', 'Read-only API credentials or tokens for your existing partner developer portals or hosted historians (e.g., eLynx, CygNet, Ignition, or AVEVA PI).');
    bullet('Option D: Custom Operator Standard & Ultimate Flexibility:', 'If your IT team has a pre-existing standard protocol, custom partner-facing portal, or any other preferred method for delivering daily volume data, we are fully prepared to integrate directly with your established workflow, provided it meets secure, read-only transmission standards.');

    room(2);
    page.drawText('Security & Operational Safeguards', { x: L, y, size: 11, font: bold, color: ink });
    y -= 18;
    para('To ensure absolute network isolation, please note that our data setup operates strictly at the corporate cloud layer. We neither require nor request any write-privileges or network access to physical field-level control equipment or local subnets (Purdue Levels 1–3). This integration is strictly read-only and places zero load on your active operations.');
    para(`Our technical integration lead is cc'd on this email and is ready to work directly with your IT lead to configure the link. Please let us know by ${respondBy} which option works best for your team, or connect us with your data administrator so we can establish the secure endpoints.`);
    para('Thank you for your continued partnership and support.', { gap: 22 });

    room(4);
    page.drawText('Sincerely,', { x: L, y, size: 10.2, font: helv, color: ink }); y -= 15;
    page.drawText(executive, { x: L, y, size: 10.2, font: helv, color: ink }); y -= 15;
    page.drawText('[Client Title]', { x: L, y, size: 10.2, font: helv, color: ink }); y -= 15;
    page.drawText(company, { x: L, y, size: 10.2, font: helv, color: ink }); y -= 30;

    newPage();
    page.drawText('Schedule A: Well Assets Target List', { x: L, y, size: 13, font: bold, color: ink });
    y -= 8;
    page.drawLine({ start: { x: L, y }, end: { x: L + 210, y }, thickness: 1.6, color: rgb(0.82, 0.35, 0.11) });
    y -= 20;
    para('Please attach the completed Schedule A file uploaded through the SSR partner portal, or populate the table below prior to dispatching to the operator:', { font: ital, size: 9.6 });

    const c1 = L, c2 = L + 220, c3 = L + 360;
    page.drawText('Well Name', { x: c1, y, size: 10, font: bold, color: ink });
    page.drawText('API Number', { x: c2, y, size: 10, font: bold, color: ink });
    page.drawText('Decimal Interest', { x: c3, y, size: 10, font: bold, color: ink });
    y -= 6;
    page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 0.7, color: rgb(0.78, 0.79, 0.82) });
    y -= 16;
    for (let i = 0; i < 3; i++) {
      page.drawText(`[Placeholder Well ${i + 1}]`, { x: c1, y, size: 10, font: helv, color: grey });
      y -= 20;
    }

    const bytes = await doc.save();

    return json({
      success: true,
      filename: `Operator_Data_Request_Letter_${company.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_')}.pdf`,
      pdfBase64: toBase64(bytes),
    });
  } catch (err) {
    console.error('generate-operator-letter failed', err);
    return json({ error: 'We could not generate the letter. Please try again shortly.' }, 500);
  }
});
