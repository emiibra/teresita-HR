// Emails: (1) worker PIN link (2) admin confirmation that worker was created
// Secrets: RESEND_API_KEY, RESEND_FROM, APP_URL, ADMIN_NOTIFICATION_EMAIL (optional fallback)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

const DEFAULT_ADMIN_EMAIL = "emiliaabravo19@gmail.com";

async function sendResend(
  resendKey: string,
  fromEmail: string,
  to: string[],
  subject: string,
  html: string
) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ from: fromEmail, to, subject, html })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Resend failed: ${errText}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const body = await req.json();
    const appUrl = (Deno.env.get("APP_URL") || body.app_url || "").replace(/\/$/, "");
    const adminTo =
      body.admin_email ||
      Deno.env.get("ADMIN_NOTIFICATION_EMAIL") ||
      DEFAULT_ADMIN_EMAIL;

    if (body.purpose === "delete_worker_code") {
      const { nombre, worker_id } = body;
      if (!nombre || !worker_id) {
        return new Response(JSON.stringify({ error: "nombre and worker_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      const supabaseUser = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: code, error: codeErr } = await supabaseUser.rpc("issue_worker_delete_code", {
        p_worker_id: worker_id
      });
      if (codeErr || !code) {
        return new Response(JSON.stringify({ error: codeErr?.message || "Could not issue code" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      const resendKey = Deno.env.get("RESEND_API_KEY");
      if (!resendKey) {
        return new Response(
          JSON.stringify({
            ok: false,
            code_for_dev: code,
            admin_email: adminTo,
            hint: "RESEND_API_KEY not configured — use code_for_dev in the app"
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const fromEmail = Deno.env.get("RESEND_FROM") || "Teresita HR <onboarding@resend.dev>";
      await sendResend(
        resendKey,
        fromEmail,
        [adminTo],
        `Teresita — código para eliminar trabajador: ${nombre}`,
        `
          <p>Solicitaste eliminar a <strong>${nombre}</strong> del equipo.</p>
          <p>Tu código de confirmación (válido 15 minutos):</p>
          <p style="font-size:28px;font-weight:bold;letter-spacing:0.3em">${code}</p>
          <p style="color:#666;font-size:12px">Si no fuiste tú, ignora este correo.</p>
        `
      );
      return new Response(
        JSON.stringify({ ok: true, admin_notified: adminTo }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { invite_id, token, email, nombre, whatsapp, admin_email } = body;

    if (!token || !email || !nombre) {
      return new Response(JSON.stringify({ error: "token, email, nombre required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    const link = `${appUrl}?crear-pin=${token}`;
    const adminToInvite =
      admin_email ||
      Deno.env.get("ADMIN_NOTIFICATION_EMAIL") ||
      DEFAULT_ADMIN_EMAIL;

    if (!resendKey) {
      return new Response(
        JSON.stringify({
          ok: false,
          link,
          admin_email: adminToInvite,
          error: "RESEND_API_KEY not configured",
          hint: "Copy the link below for the worker at this computer"
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const fromEmail = Deno.env.get("RESEND_FROM") || "Teresita HR <onboarding@resend.dev>";

    await sendResend(
      resendKey,
      fromEmail,
      [email],
      "Teresita — crea tu PIN de acceso (6 dígitos)",
      `
        <p>Hola <strong>${nombre}</strong>,</p>
        <p>Te dieron de alta en Teresita. Abre este enlace en el navegador para crear tu <strong>PIN personal de 6 dígitos</strong>:</p>
        <p><a href="${link}">${link}</a></p>
        <p>Luego en la app: elige tu nombre e ingresa ese PIN para fichar y ver tus comandas.</p>
        <p style="color:#666;font-size:12px">El enlace expira en 14 días.</p>
      `
    );

    await sendResend(
      resendKey,
      fromEmail,
      [adminToInvite],
      `Teresita — trabajador creado: ${nombre}`,
      `
        <p>Se registró correctamente a <strong>${nombre}</strong> (${email}).</p>
        ${whatsapp ? `<p>WhatsApp: ${whatsapp}</p>` : ""}
        <p>Se envió al trabajador un correo con enlace para crear su PIN.</p>
        <p>Enlace (por si está al lado del equipo):<br/><a href="${link}">${link}</a></p>
      `
    );

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    if (invite_id) {
      await supabase.rpc("mark_invite_email_sent", { p_invite_id: invite_id });
    }

    return new Response(
      JSON.stringify({ ok: true, link, admin_notified: adminToInvite, worker_emailed: email }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
