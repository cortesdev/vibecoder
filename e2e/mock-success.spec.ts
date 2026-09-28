import { expect, test } from "@playwright/test";

// Deterministic success path: the agent seam runs MockAgent (enabled in this
// config's webServer env only), so new project → edit → persisted file →
// updated preview → reload → working ZIP holds with zero provider keys.
test.describe("mock agent success journey", () => {
  test.beforeEach(async ({ page }) => {
    const token = process.env.FAKE_LOGIN_TOKEN ?? "";
    test.skip(!token, "FAKE_LOGIN_TOKEN not set");
    await page.goto(`/api/dev/fake-login?token=${encodeURIComponent(token)}`);
    await expect(page).toHaveURL(/\/agent(\?|$)/, { timeout: 30_000 });
  });

  test("turn succeeds, persists, previews, and exports after reload", async ({ page }) => {
    const created = await page.request.post("/api/app/projects", {
      data: { name: "e2e mock", templateId: "landing" },
    });
    expect(created.ok()).toBe(true);
    const { project } = (await created.json()) as { project: { id: string } };

    const form = new FormData();
    form.set("message", "add a footer note");
    form.set("agent", "mock");
    const turned = await page.request.post(`/api/app/projects/${project.id}/agent`, {
      multipart: { message: "add a footer note", agent: "mock" },
    });
    expect(turned.ok()).toBe(true);
    const data = (await turned.json()) as { changedPaths: string[]; reply: string };
    expect(data.changedPaths.length).toBeGreaterThan(0);

    await page.goto(`/agent/projects/${project.id}`);
    // Updated preview renders the landing starter.
    const frame = page.frameLocator('iframe[title="Project preview"]');
    await expect(frame.getByRole("heading", { name: /ships real product pages/i }).first()).toBeVisible({
      timeout: 90_000,
    });

    // Reload: the same account — routed-via line and ZIP link.
    await page.reload();
    await expect(page.getByText(/routed via/i).first()).toBeVisible({ timeout: 30_000 });
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download ZIP" }).first().click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.zip$/);
  });

  test("files and editor share one store, conflicts refuse honestly", async ({ page }) => {
    const created = await page.request.post("/api/app/projects", {
      data: { name: "e2e files", templateId: "landing" },
    });
    const { project } = (await created.json()) as { project: { id: string } };
    await page.goto(`/agent/projects/${project.id}`);
    await page.getByRole("tab", { name: "Files" }).click();

    // Create → open → edit → save.
    await page.getByRole("button", { name: "New file" }).click();
    await page.getByLabel("New file path").fill("src/note.ts");
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page.getByLabel("Edit src/note.ts")).toBeVisible();
    await page.getByLabel("Edit src/note.ts").fill("export const note = 1;");
    await expect(page.getByText("unsaved")).toBeVisible();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("unsaved")).toBeHidden({ timeout: 15_000 });

    // Tab switch keeps the draft; reload keeps the save.
    await page.getByRole("tab", { name: "Preview" }).click();
    await page.getByRole("tab", { name: "Editor" }).click();
    await page.reload();
    await page.getByRole("tab", { name: "Files" }).click();
    await expect(page.getByRole("button", { name: "Open src/note.ts in the editor" })).toBeVisible({
      timeout: 30_000,
    });

    // Stale write is refused, never clobbered.
    await page.getByRole("button", { name: "Open src/note.ts in the editor" }).click();
    await page.getByLabel("Edit src/note.ts").fill("stale edit");
    const put = await page.request.put(`/api/app/projects/${project.id}/files/src/note.ts`, {
      data: { content: "fresh from elsewhere" },
    });
    expect(put.ok()).toBe(true);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("button", { name: "Overwrite with mine" })).toBeVisible({ timeout: 30_000 });

    // Delete removes it everywhere.
    await page.getByRole("tab", { name: "Files" }).click();
    await page.getByRole("button", { name: "Delete src/note.ts" }).click();
    await expect(page.getByRole("button", { name: "Open src/note.ts in the editor" })).toBeHidden({
      timeout: 15_000,
    });
  });

  test("mobile shows a chat/workspace switch instead of hiding work", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const created = await page.request.post("/api/app/projects", {
      data: { name: "e2e mobile", templateId: "landing" },
    });
    const { project } = (await created.json()) as { project: { id: string } };
    await page.goto(`/agent/projects/${project.id}`);
    await page.getByRole("tab", { name: "Workspace" }).click();
    await expect(page.getByRole("tablist", { name: "Workspace panels" })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("tab", { name: "Chat" }).click();
    await expect(page.getByLabel("Message the agent")).toBeVisible();
  });
});

test.describe("vision and integrations", () => {
  test.beforeEach(async ({ page }) => {
    const token = process.env.FAKE_LOGIN_TOKEN ?? "";
    test.skip(!token, "FAKE_LOGIN_TOKEN not set");
    await page.goto(`/api/dev/fake-login?token=${encodeURIComponent(token)}`);
    await expect(page).toHaveURL(/\/agent(\?|$)/, { timeout: 30_000 });
  });

  test("an image turn never reaches a blind model", async ({ page }) => {
    const created = await page.request.post("/api/app/projects", {
      data: { name: "e2e vision", templateId: "landing" },
    });
    const { project } = (await created.json()) as { project: { id: string } };

    // 1x1 transparent PNG.
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    const turned = await page.request.post(`/api/app/projects/${project.id}/agent`, {
      multipart: {
        message: "match this screenshot",
        agent: "mock",
        modelId: "groq-gpt-oss",
        attachments: { name: "shot.png", mimeType: "image/png", buffer: png },
      },
    });
    const data = (await turned.json()) as {
      ok?: boolean;
      modelId?: string;
      notice?: string;
      validation?: { ok: boolean };
    };
    expect(data.ok).toBe(true);
    // Rerouted off the blind model onto a vision-capable one, and said so.
    expect(data.modelId).not.toBe("groq-gpt-oss");
    expect(data.notice).toMatch(/cannot see images/i);
    expect(data.validation?.ok).toBe(true);
  });

  test("integrations connect and remove a service key", async ({ page }) => {
    const created = await page.request.post("/api/app/projects", {
      data: { name: "e2e integrations", templateId: "landing" },
    });
    const { project } = (await created.json()) as { project: { id: string } };
    await page.goto(`/agent/projects/${project.id}`);
    await page.getByRole("tab", { name: "Integrations" }).click();

    await page.getByRole("button", { name: "Connect" }).first().click();
    await page.getByLabel("API key").fill("sk-test-not-a-real-key");
    await page.getByRole("button", { name: "Save key" }).click();
    await expect(page.getByText(/connected\. the key is stored server-side/i)).toBeVisible();
    await expect(page.getByText("1 connected")).toBeVisible();

    await page.getByRole("button", { name: "Remove" }).first().click();
    await expect(page.getByText("Credential removed.")).toBeVisible();
    await expect(page.getByText("1 connected")).toHaveCount(0);
  });
});
