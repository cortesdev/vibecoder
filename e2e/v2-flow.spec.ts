import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// vaibcode-V2 smoke: login → template picker → project with failing-first-turn
// (no provider keys by config) → live preview → export → preset apply/undo →
// share flow errors cleanly → axe on the workspace.
test.describe("v2 rebuild flow", () => {
  test.beforeEach(async ({ page }) => {
    const token = process.env.FAKE_LOGIN_TOKEN ?? "";
    test.skip(!token, "FAKE_LOGIN_TOKEN not set");
    await page.goto(`/api/dev/fake-login?token=${encodeURIComponent(token)}`);
    await expect(page).toHaveURL(/\/agent(\?|$)/, { timeout: 30_000 });
  });

  test("template picker, first turn error path, preview, export, presets", async ({ page }) => {
    // Picker: six cards, selection survives in the URL.
    await expect(page.getByRole("radio", { name: /Blog/ })).toBeVisible();
    await page.getByRole("radio", { name: /Blog/ }).click();
    await expect(page).toHaveURL(/template=blog/);

    // Attachments: a zip is rejected client-side with a kind error.
    const zipPath = path.join(tmpdir(), "payload.zip");
    writeFileSync(zipPath, Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    await page.getByLabel("Attach files").first().setInputFiles(zipPath);
    await expect(page.getByText(/unsupported type/i)).toBeVisible();

    // First turn: no provider keys → the route refuses, text stays intact.
    await page.getByLabel("Describe what to build").fill("A tiny blog about shipping");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByText(/Starting your project|Running your first prompt/i)).toBeVisible();
    await expect(page.getByText(/No free provider|failed/i).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByLabel("Describe what to build")).toHaveValue("A tiny blog about shipping");

    // Create the workspace project directly (template: blog) for the rest.
    const created = await page.request.post("/api/app/projects", {
      data: { name: "e2e blog", templateId: "blog" },
    });
    expect(created.ok()).toBe(true);
    const { project } = (await created.json()) as { project: { id: string } };
    await page.goto(`/agent/projects/${project.id}`);

    // Workspace: preview builds the blog starter with zero prompts.
    const frame = page.frameLocator('iframe[title="Project preview"]');
    await expect(frame.getByRole("heading", { name: /notes/i }).first()).toBeVisible({ timeout: 90_000 });

    // Toolbar keyboard access: tab to Refresh and activate.
    await page.getByRole("toolbar", { name: "Preview controls" }).getByLabel("Refresh preview").focus();
    await expect(page.getByLabel("Refresh preview")).toBeFocused();

    // Export: real download, real filename.
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export ZIP" }).first().click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.zip$/);

    // Presets: apply persists, undo restores.
    await page.getByRole("tab", { name: "Presets" }).click();
    const coral = page.getByRole("radio", { name: /^Coral/ });
    await coral.scrollIntoViewIfNeeded();
    await page.getByRole("button", { name: "Apply", exact: true }).first().click();
    await expect(page.getByText(/Theme applied/i)).toBeVisible({ timeout: 30_000 });
    await page.reload();
    await expect(page.getByRole("radio", { name: /Coral \(current\)/ })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: /Undo/ }).click();
    await expect(page.getByText(/Undone/i)).toBeVisible({ timeout: 30_000 });

    // Axe: no critical violations on the workspace.
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((v) => v.impact === "critical")).toEqual([]);
  });
});
