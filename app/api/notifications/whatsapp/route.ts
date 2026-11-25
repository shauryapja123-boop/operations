import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

interface WhatsAppNotification {
  ticketId: string;
  title: string;
  location: string;
  priority: "Critical" | "High" | "Medium" | "Low";
}

interface DemoWhatsAppNotification extends WhatsAppNotification {
  department: "IT" | "Maintenance";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDemoWhatsAppNotification(value: unknown): value is DemoWhatsAppNotification {
  if (!isRecord(value)) return false;
  return (value.department === "IT" || value.department === "Maintenance") &&
    typeof value.ticketId === "string" && value.ticketId.length > 0 && value.ticketId.length <= 40 &&
    typeof value.title === "string" && value.title.length > 0 && value.title.length <= 120 &&
    typeof value.location === "string" && value.location.length > 0 && value.location.length <= 80 &&
    (value.priority === "Critical" || value.priority === "High" || value.priority === "Medium" || value.priority === "Low");
}

function isTicketRequest(value: unknown): value is { ticketId: string } {
  return isRecord(value) &&
    typeof value.ticketId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.ticketId);
}

function getProviderError(value: unknown): string {
  if (!isRecord(value) || !isRecord(value.error) || typeof value.error.message !== "string") {
    return "WhatsApp returned an unexpected response.";
  }
  return value.error.message;
}

function recipientsFromEnvironment(value: string | undefined): string[] {
  return value?.split(",").map(recipient => recipient.trim()).filter(Boolean) ?? [];
}

function getPriorityLabel(value: unknown): WhatsAppNotification["priority"] | null {
  if (value === "critical") return "Critical";
  if (value === "high") return "High";
  if (value === "medium") return "Medium";
  if (value === "low") return "Low";
  return null;
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabaseConfigured = Boolean(
    supabaseUrl &&
    anonKey &&
    !supabaseUrl.includes("YOUR_PROJECT") &&
    !anonKey.includes("YOUR_SUPABASE")
  );
  const demoAlertsEnabled = process.env.WHATSAPP_DEMO_ALERTS_ENABLED === "true";

  if (supabaseConfigured && process.env.WHATSAPP_ALERTS_ENABLED !== "true") {
    return NextResponse.json({ error: "WhatsApp alerts are not enabled." }, { status: 503 });
  }
  if (!supabaseConfigured && !demoAlertsEnabled) {
    return NextResponse.json({ error: "WhatsApp alerts are not enabled." }, { status: 503 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  let notification: WhatsAppNotification;
  if (supabaseConfigured) {
    if (!supabaseUrl || !anonKey) {
      return NextResponse.json({ error: "Supabase server configuration is incomplete." }, { status: 503 });
    }
    if (!isTicketRequest(payload)) {
      return NextResponse.json({ error: "A valid ticket ID is required." }, { status: 400 });
    }

    const cookieStore = await cookies();
    const supabase = createServerClient(supabaseUrl, anonKey, {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (values: { name: string; value: string; options: CookieOptions }[]) =>
          values.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
      }
    });
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      return NextResponse.json({ error: "Sign in to send issue notifications." }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role,is_active")
      .eq("id", authData.user.id)
      .maybeSingle();
    if (profileError) {
      console.error("Could not verify the WhatsApp alert sender profile.", profileError);
      return NextResponse.json({ error: "Could not verify the issue reporter." }, { status: 500 });
    }
    if (profile?.role !== "restaurant_manager" || profile.is_active !== true) {
      return NextResponse.json({ error: "Only an active restaurant manager can send issue alerts." }, { status: 403 });
    }

    const { data: ticket, error: ticketError } = await supabase
      .from("tickets")
      .select("id,ticket_number,reporter_id,restaurant_id,title,priority")
      .eq("id", payload.ticketId)
      .eq("reporter_id", authData.user.id)
      .maybeSingle();
    if (ticketError) {
      console.error("Could not load the reported issue for WhatsApp.", ticketError);
      return NextResponse.json({ error: "Could not verify the reported issue." }, { status: 500 });
    }
    if (!ticket) {
      return NextResponse.json({ error: "The issue was not found or was not reported by your account." }, { status: 404 });
    }

    const { data: restaurant, error: restaurantError } = await supabase
      .from("restaurants")
      .select("name")
      .eq("id", ticket.restaurant_id)
      .maybeSingle();
    if (restaurantError || !restaurant) {
      if (restaurantError) console.error("Could not load the issue restaurant for WhatsApp.", restaurantError);
      return NextResponse.json({ error: "Could not verify the issue restaurant." }, { status: 500 });
    }
    if (
      typeof ticket.title !== "string" ||
      ticket.title.length === 0 ||
      ticket.title.length > 120 ||
      typeof restaurant.name !== "string" ||
      restaurant.name.length === 0 ||
      restaurant.name.length > 80
    ) {
      return NextResponse.json({ error: "The issue title or restaurant name is too long for the WhatsApp template." }, { status: 422 });
    }

    const priority = getPriorityLabel(ticket.priority);
    if (!priority) {
      return NextResponse.json({ error: "The issue has an unsupported priority." }, { status: 500 });
    }
    notification = {
      ticketId: ticket.ticket_number ?? ticket.id,
      title: ticket.title,
      location: restaurant.name,
      priority
    };
  } else {
    if (!isDemoWhatsAppNotification(payload)) {
      return NextResponse.json({ error: "A valid demo issue is required." }, { status: 400 });
    }
    notification = payload;
  }

  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const graphApiVersion = process.env.WHATSAPP_GRAPH_API_VERSION;
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME;
  const templateLanguage = process.env.WHATSAPP_TEMPLATE_LANGUAGE;
  const itRecipients = recipientsFromEnvironment(process.env.WHATSAPP_IT_RECIPIENTS);
  const maintenanceRecipients = recipientsFromEnvironment(process.env.WHATSAPP_MAINTENANCE_RECIPIENTS);
  const recipients = [...new Set([...itRecipients, ...maintenanceRecipients])];

  if (
    !accessToken ||
    !phoneNumberId ||
    !graphApiVersion ||
    !templateName ||
    !templateLanguage ||
    itRecipients.length === 0 ||
    maintenanceRecipients.length === 0 ||
    itRecipients.length > 25 ||
    maintenanceRecipients.length > 25 ||
    recipients.length > 50 ||
    !/^\d+$/.test(phoneNumberId) ||
    !/^v\d+\.\d+$/.test(graphApiVersion) ||
    !/^[a-z0-9_]+$/.test(templateName) ||
    !/^[a-z]{2,3}_[A-Z]{2,3}$/.test(templateLanguage) ||
    recipients.some(recipient => !/^[1-9]\d{7,14}$/.test(recipient))
  ) {
    return NextResponse.json({ error: "WhatsApp server configuration is incomplete or invalid." }, { status: 503 });
  }

  const endpoint = `https://graph.facebook.com/${graphApiVersion}/${phoneNumberId}/messages`;
  const results = await Promise.all(recipients.map(async to => {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "template",
          template: {
            name: templateName,
            language: { code: templateLanguage },
            components: [{
              type: "body",
              parameters: [
                { type: "text", text: notification.ticketId },
                { type: "text", text: notification.title },
                { type: "text", text: notification.location },
                { type: "text", text: notification.priority }
              ]
            }]
          }
        }),
        signal: AbortSignal.timeout(10000)
      });

      if (!response.ok) {
        const providerPayload: unknown = await response.json().catch(() => null);
        return { success: false, error: getProviderError(providerPayload) };
      }

      return { success: true };
    } catch (error) {
      console.error("Could not send a WhatsApp issue alert.", error);
      return { success: false, error: "Could not reach the WhatsApp service." };
    }
  }));

  const failures = results.filter((result): result is { success: false; error: string } => result.success === false);
  if (failures.length > 0) {
    const accepted = recipients.length - failures.length;
    return NextResponse.json({
      error: `${accepted} of ${recipients.length} WhatsApp alerts accepted. ${failures[0].error}`.trim(),
      accepted
    }, { status: 502 });
  }

  return NextResponse.json({ accepted: recipients.length });
}
