import { currentUser } from "@/lib/auth";
import { listUserKeyProviders } from "@/lib/userkeys";
import { checkFreeReadiness } from "@/lib/readiness";
import SettingsClient from "@/components/app/settings-client";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await currentUser();
  const providers = user ? await listUserKeyProviders(user.id) : [];
  const readiness = user ? await checkFreeReadiness(user.id) : [];

  return (
    <main className="mx-auto w-full max-w-[680px] px-6 py-10">
      <h1 className="text-[26px] font-bold tracking-[-0.02em]">Settings</h1>
      <p className="muted mt-1 text-sm">
        Keys are stored server-side and never shown again. Credits pay for hosted models.
      </p>

      <SettingsClient initialProviders={providers} initialReadiness={readiness} />
    </main>
  );
}
