import { db } from "@/lib/db";
import { verifyShare } from "@/lib/preview/share";

// Public read-only snapshot. No auth, no editing APIs, no project data beyond
// the stored document. Invalid, expired, and revoked tokens share one answer.
export default async function SharedPreviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { createHash } = await import("node:crypto");
  const digest = createHash("sha256").update(token).digest("hex");
  const share = await db.previewShare.findUnique({ where: { tokenHash: digest } });
  const valid =
    share !== null &&
    verifyShare(
      { tokenHash: share.tokenHash, createdAt: share.createdAt, expiresAt: share.expiresAt, revokedAt: share.revokedAt },
      token,
    );

  if (!valid || !share) {
    return (
      <main style={{ maxWidth: 560, margin: "10vh auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
        <h1 style={{ fontSize: 20 }}>This preview is unavailable</h1>
        <p style={{ opacity: 0.7 }}>The link is invalid, expired, or was revoked.</p>
      </main>
    );
  }

  return (
    <iframe
      srcDoc={share.snapshot}
      title="Shared preview"
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      style={{ position: "fixed", inset: 0, width: "100%", height: "100%", border: 0 }}
    />
  );
}
