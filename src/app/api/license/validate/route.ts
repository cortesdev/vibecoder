import { NextResponse } from "next/server";
import { validateLicense } from "@/lib/licenses";
import { rateLimit } from "@/lib/ratelimit";

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const limit = rateLimit(`validate:${ip}`, 30, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ ok: false, reason: "rate_limited" }, { status: 429 });
  }

  const body = (await req.json().catch(() => null)) as {
    key?: string;
    machineId?: string;
    label?: string;
  } | null;

  if (!body?.key || typeof body.key !== "string") {
    return NextResponse.json(
      { ok: false, reason: "bad_request", message: "Provide a license key." },
      { status: 400 },
    );
  }

  const result = await validateLicense(
    body.key,
    typeof body.machineId === "string" && body.machineId.length > 0 ? body.machineId : undefined,
    typeof body.label === "string" ? body.label : undefined,
  );

  // Machine-limit failures are client-fixable, so 200 with ok:false; the app
  // shows the message. Only malformed requests get 4xx.
  return NextResponse.json(result, { status: 200 });
}
