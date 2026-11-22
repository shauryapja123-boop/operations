import { NextResponse } from "next/server";

export const runtime = "nodejs";

interface MaintenanceNotification {
  department: "Maintenance";
  ticketId: string;
  title: string;
  location: string;
  priority: "Critical" | "High" | "Medium" | "Low";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMaintenanceNotification(value: unknown): value is MaintenanceNotification {
  if (!isRecord(value)) return false;
  return value.department === "Maintenance" &&
    typeof value.ticketId === "string" && value.ticketId.length > 0 && value.ticketId.length <= 40 &&
    typeof value.title === "string" && value.title.length > 0 && value.title.length <= 120 &&
    typeof value.location === "string" && value.location.length > 0 && value.location.length <= 80 &&
    (value.priority === "Critical" || value.priority === "High" || value.priority === "Medium" || value.priority === "Low");
}

function getProviderError(value: unknown): string {
  if (!isRecord(value) || !isRecord(value.error) || typeof value.error.message !== "string") {
    return "WhatsApp returned an unexpected response.";
  }
  return value.error.message;
}

export async function POST(request: Request) {
  if (process.env.WHATSAPP_DEMO_ALERTS_ENABLED !== "true") {
    return NextResponse.json({ error: "WhatsApp alerts are not enabled." }, { status: 503 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (!isMaintenanceNotification(payload)) {
    return NextResponse.json({ error: "A valid Maintenance issue is required." }, { status: 400 });
  }

  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const graphApiVersion = process.env.WHATSAPP_GRAPH_API_VERSION;
  const templateName = process.env.WHATSAPP_MAINTENANCE_TEMPLATE_NAME;
  const templateLanguage = process.env.WHATSAPP_MAINTENANCE_TEMPLATE_LANGUAGE;
  const recipients = process.env.WHATSAPP_MAINTENANCE_RECIPIENTS?.split(",").map(value => value.trim()).filter(Boolean);

  if (
    !accessToken ||
    !phoneNumberId ||
    !graphApiVersion ||
    !templateName ||
    !templateLanguage ||
    !recipients?.length ||
    !/^\d+$/.test(phoneNumberId) ||
    !/^v\d+\.\d+$/.test(graphApiVersion) ||
    !/^[a-z0-9_]+$/.test(templateName) ||
    !/^[a-z]{2,3}_[A-Z]{2,3}$/.test(templateLanguage) ||
    recipients.length > 25 ||
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
                { type: "text", text: payload.ticketId },
                { type: "text", text: payload.title },
                { type: "text", text: payload.location },
                { type: "text", text: payload.priority }
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
      console.error("Could not send a WhatsApp maintenance alert.", error);
      return { success: false, error: "Could not reach the WhatsApp service." };
    }
  }));

  const failures = results.filter((result): result is { success: false; error: string } => result.success === false);
  if (failures.length > 0) {
    return NextResponse.json({
      error: `${recipients.length - failures.length} of ${recipients.length} WhatsApp alerts accepted. ${failures[0].error}`.trim()
    }, { status: 502 });
  }

  return NextResponse.json({ accepted: recipients.length });
}
