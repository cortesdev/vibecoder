# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: v2-flow.spec.ts >> v2 rebuild flow >> template picker, first turn error path, preview, export, presets
- Location: e2e/v2-flow.spec.ts:18:7

# Error details

```
Error: expect(page).toHaveURL(expected) failed

Expected pattern: /\/agent(\?|$)/
Received string:  "http://127.0.0.1:3105/api/dev/fake-login?token=b20f8cb54ef5"
Timeout: 30000ms

Call log:
  - Expect "toHaveURL" with timeout 30000ms
    64 × locator resolved to <html>…</html>
       - unexpected value "http://127.0.0.1:3105/api/dev/fake-login?token=b20f8cb54ef5"

```

# Test source

```ts
  1  | import { expect, test } from "@playwright/test";
  2  | import AxeBuilder from "@axe-core/playwright";
  3  | import { writeFileSync } from "node:fs";
  4  | import { tmpdir } from "node:os";
  5  | import path from "node:path";
  6  | 
  7  | // vaibcode-V2 smoke: login → template picker → project with failing-first-turn
  8  | // (no provider keys by config) → live preview → export → preset apply/undo →
  9  | // share flow errors cleanly → axe on the workspace.
  10 | test.describe("v2 rebuild flow", () => {
  11 |   test.beforeEach(async ({ page }) => {
  12 |     const token = process.env.FAKE_LOGIN_TOKEN ?? "";
  13 |     test.skip(!token, "FAKE_LOGIN_TOKEN not set");
  14 |     await page.goto(`/api/dev/fake-login?token=${encodeURIComponent(token)}`);
> 15 |     await expect(page).toHaveURL(/\/agent(\?|$)/, { timeout: 30_000 });
     |                        ^ Error: expect(page).toHaveURL(expected) failed
  16 |   });
  17 | 
  18 |   test("template picker, first turn error path, preview, export, presets", async ({ page }) => {
  19 |     // Picker: six cards, selection survives in the URL.
  20 |     await expect(page.getByRole("radio", { name: /Blog/ })).toBeVisible();
  21 |     await page.getByRole("radio", { name: /Blog/ }).click();
  22 |     await expect(page).toHaveURL(/template=blog/);
  23 | 
  24 |     // Attachments: a zip is rejected client-side with a kind error.
  25 |     const zipPath = path.join(tmpdir(), "payload.zip");
  26 |     writeFileSync(zipPath, Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  27 |     await page.getByLabel("Attach files").first().setInputFiles(zipPath);
  28 |     await expect(page.getByText(/unsupported type/i)).toBeVisible();
  29 | 
  30 |     // First turn: no provider keys → the route refuses, text stays intact.
  31 |     await page.getByLabel("Describe what to build").fill("A tiny blog about shipping");
  32 |     await page.getByRole("button", { name: "Send message" }).click();
  33 |     await expect(page.getByText(/Starting your project|Running your first prompt/i)).toBeVisible();
  34 |     await page.waitForURL(/\/agent\/projects\/[^/]+$/, { timeout: 60_000 });
  35 | 
  36 |     // Workspace: preview builds the blog starter with zero prompts.
  37 |     const frame = page.frameLocator('iframe[title="Project preview"]');
  38 |     await expect(frame.getByRole("heading", { name: /notes/i }).first()).toBeVisible({ timeout: 90_000 });
  39 | 
  40 |     // Toolbar keyboard access: tab to Refresh and activate.
  41 |     await page.getByRole("toolbar", { name: "Preview controls" }).getByLabel("Refresh preview").focus();
  42 |     await expect(page.getByLabel("Refresh preview")).toBeFocused();
  43 | 
  44 |     // Export: real download, real filename.
  45 |     const downloadPromise = page.waitForEvent("download");
  46 |     await page.getByRole("button", { name: "Export ZIP" }).first().click();
  47 |     const download = await downloadPromise;
  48 |     expect(download.suggestedFilename()).toMatch(/\.zip$/);
  49 | 
  50 |     // Presets: apply persists, undo restores.
  51 |     await page.getByRole("tab", { name: "Presets" }).click();
  52 |     const coral = page.getByRole("radio", { name: /^Coral/ });
  53 |     await coral.scrollIntoViewIfNeeded();
  54 |     await page.getByRole("button", { name: "Apply", exact: true }).first().click();
  55 |     await expect(page.getByText(/Theme applied/i)).toBeVisible({ timeout: 30_000 });
  56 |     await page.reload();
  57 |     await expect(page.getByRole("radio", { name: /Coral \(current\)/ })).toBeVisible({ timeout: 30_000 });
  58 |     await page.getByRole("button", { name: /Undo/ }).click();
  59 |     await expect(page.getByText(/Undone/i)).toBeVisible({ timeout: 30_000 });
  60 | 
  61 |     // Axe: no critical violations on the workspace.
  62 |     const results = await new AxeBuilder({ page }).analyze();
  63 |     expect(results.violations.filter((v) => v.impact === "critical")).toEqual([]);
  64 |   });
  65 | });
  66 | 
```