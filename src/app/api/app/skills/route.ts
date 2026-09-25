import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getSkillCatalog } from "@/lib/agent/skill-catalog";
import { toSkillSummary } from "@/lib/agent/skills";

export const dynamic = "force-dynamic";

export async function GET() {
  const { user } = await requireUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const catalog = await getSkillCatalog();
  return NextResponse.json({
    ok: true,
    version: catalog.version,
    source: catalog.source,
    skills: catalog.skills.map(toSkillSummary),
  });
}
