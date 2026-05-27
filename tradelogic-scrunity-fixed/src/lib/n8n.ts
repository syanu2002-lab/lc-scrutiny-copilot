const SCRUTINY_URL = (
  import.meta.env.VITE_N8N_SCRUTINY_WEBHOOK_URL ||
  import.meta.env.VITE_N8N_WEBHOOK_URL
) as string | undefined;

const CHECKER_URL = (
  import.meta.env.VITE_N8N_CHECKER_WEBHOOK_URL ||
  import.meta.env.VITE_N8N_WEBHOOK_URL
) as string | undefined;

async function postWebhook(url: string | undefined, payload: Record<string, unknown>): Promise<any> {
  if (!url) {
    // Mock response so the app remains functional without the webhook configured.
    return mockScrutiny(payload);
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Webhook error ${res.status}${detail ? `: ${detail}` : ""}`);
  }
  return res.json();
}

export async function callN8n(payload: Record<string, unknown>): Promise<any> {
  return postWebhook(SCRUTINY_URL, payload);
}

export async function callCheckerWebhook(payload: Record<string, unknown>): Promise<any> {
  return postWebhook(CHECKER_URL, payload);
}

function mockScrutiny(payload: Record<string, unknown>) {
  if ((payload as any).action === "AUTHORIZE" || (payload as any).action === "REJECT") {
    return { ok: true };
  }
  return {
    checks: [
      { field: "LC Reference (Field 20)", description: "LC reference present and matches documents", status: "PASS" },
      { field: "Documentary Credit Number", description: "Cross-checked against MT700 field 20", status: "PASS" },
      { field: "Bill of Lading – Consignee (UCP 600 art.20)", description: "Consignee field formatting", status: "WARNING", detail: "Consignee shown as 'TO ORDER' — confirm endorsement chain." },
      { field: "Invoice value vs LC amount (ISBP 745 C5)", description: "Invoice total ≤ LC amount", status: "FAIL", detail: "Invoice USD 105,400 exceeds LC amount USD 100,000 by USD 5,400." },
      { field: "Packing List – Marks & Numbers (ISBP 745 M2)", description: "Marks consistent across documents", status: "PASS" },
      { field: "Latest Shipment Date (UCP 600 art.6)", description: "On-board date ≤ latest shipment date", status: "FAIL", detail: "On-board date 2026-05-20 is after latest shipment date 2026-05-15." },
      { field: "Presentation Period (UCP 600 art.14c)", description: "Presented within 21 days of shipment", status: "PASS" },
      { field: "Description of Goods (UCP 600 art.18c)", description: "Invoice description matches LC field 45A", status: "PASS" },
    ],
    suggested_mt: "MT734",
    suggested_swift: `{1:F01BANKXXXX0000000000}{2:I734BANKYYYYN}{4:
:20:LC2026/000123
:21:LC2026/000123
:32A:260526USD100000,00
:73A:/DISC/
:77J:DOCUMENTS REFUSED DUE TO THE FOLLOWING DISCREPANCIES:
1. INVOICE AMOUNT EXCEEDS LC AMOUNT BY USD 5,400.
2. LATE SHIPMENT: ON BOARD 2026-05-20, LATEST SHIPMENT 2026-05-15.
DOCUMENTS HELD AT YOUR DISPOSAL.
-}`,
  };
}
