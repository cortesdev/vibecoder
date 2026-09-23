import { currentUser } from "@/lib/auth";
import { getBalance, ensureWallet, CREDIT_PACKS } from "@/lib/credits";
import { listUserKeyProviders } from "@/lib/userkeys";
import SettingsClient from "@/components/app/settings-client";
import { testEnabled } from "@/lib/env";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await currentUser();
  const providers = user ? await listUserKeyProviders(user.id) : [];
  const balance = user ? await ensureWallet(user.id).then(() => getBalance(user.id)) : 0;

  return (
    <main className="mx-auto w-full max-w-[680px] px-6 py-10">
      <h1 className="text-[26px] font-bold tracking-[-0.02em]">Settings</h1>
      <p className="muted mt-1 text-sm">
        Keys are stored server-side and never shown again. Credits pay for hosted models.
      </p>

      <SettingsClient initialProviders={providers} balance={balance} packs={[...CREDIT_PACKS]} demoCheckout={testEnabled} />
    </main>
  );
}
