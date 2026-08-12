import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function expectNoWcagViolations(page: Parameters<typeof AxeBuilder>[0]["page"]) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(result.violations.map((violation) => ({ id: violation.id, impact: violation.impact, targets: violation.nodes.map((node) => node.target) }))).toEqual([]);
}

test("public authentication surfaces are responsive, keyboard reachable and accessible", async ({ page }, testInfo) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("link", { name: "Forgot password?" })).toBeVisible();
  await expectNoWcagViolations(page);

  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();

  const viewport = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  expect(viewport.scrollWidth, `${testInfo.project.name} login has horizontal overflow`).toBeLessThanOrEqual(viewport.width + 1);

  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(`unknown-${testInfo.project.name}@example.test`);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText(/reset|inbox|email/i);
  await expectNoWcagViolations(page);
});

test("signup and reduced-motion behaviour remain usable across release browsers", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/signup");
  await expect(page.getByRole("heading", { name: "Create your GridFlow organisation" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create GridFlow account" })).toBeEnabled();
  const viewport = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  expect(viewport.scrollWidth, `${testInfo.project.name} signup has horizontal overflow`).toBeLessThanOrEqual(viewport.width + 1);
  const motion = await page.getByRole("button", { name: "Create GridFlow account" }).evaluate((element) => {
    const style = getComputedStyle(element);
    return { transitionDuration: style.transitionDuration, animationDuration: style.animationDuration };
  });
  expect(Number.parseFloat(motion.transitionDuration)).toBeLessThanOrEqual(0.00001);
  await expectNoWcagViolations(page);

  const suffix = testInfo.project.name.replace(/[^a-z0-9]/gi, "-").toLowerCase();
  await page.getByLabel("Your name").fill(`Release ${suffix}`);
  await page.getByLabel("Email").fill(`phase51-${suffix}-${testInfo.retry}@example.test`);
  await page.getByLabel("Organisation name").fill(`GridFlow ${suffix} ${testInfo.retry}`);
  await page.getByLabel("Password").fill("GridFlow-browser-test-2026!");
  await page.getByRole("button", { name: "Create GridFlow account" }).click();
  await page.waitForURL(/\/(welcome|onboarding|pending-approval)/);
  await expect(page.locator("main")).toBeVisible();
  if (page.url().endsWith("/welcome")) {
    await expect(page.getByRole("heading", { name: new RegExp(`Welcome to GridFlow, Release`, "i") })).toBeVisible();
    await expect(page.getByText("Atlas", { exact: true })).toBeVisible();
    await expectNoWcagViolations(page);
    await page.getByRole("button", { name: /Set up my GridFlow/i }).click();
    await page.waitForURL(/\/onboarding/);
  }
  if (page.url().endsWith("/onboarding")) {
    await expect(page.getByRole("heading", { name: "Build the operating system around your programme" })).toBeVisible();
    await expect(page.getByText(/saves each step automatically/i)).toBeVisible();
    await expectNoWcagViolations(page);
    await page.goto("/guide");
    await expect(page.getByRole("heading", { name: "Learn GridFlow by following the real workflow" })).toBeVisible();
    await expectNoWcagViolations(page);
    await page.goto("/help");
    await expect(page.getByRole("heading", { name: "Everything you need to run GridFlow safely" })).toBeVisible();
    await page.getByLabel("Search the GridFlow manual").fill("API keys");
    await expect(page.getByRole("button", { name: /AI Setup and keys/i })).toBeVisible();
    await expectNoWcagViolations(page);
    await page.goto("/automation");
    await expect(page.getByRole("heading", { name: "Run the commercial system by exception" })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Approval Inbox/i })).toBeVisible();
    await expect(page.getByText("LinkedIn sending is always manual")).toBeVisible();
    const cockpitViewport = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    expect(cockpitViewport.scrollWidth, `${testInfo.project.name} automation cockpit has horizontal overflow`).toBeLessThanOrEqual(cockpitViewport.width + 1);
    await expectNoWcagViolations(page);
    await page.getByRole("button", { name: "Set away mode" }).click();
    await expect(page.getByRole("heading", { name: "Pause safe internal automation, then return automatically" })).toBeVisible();
    await page.getByRole("button", { name: "Race weekend" }).click();
    await expectNoWcagViolations(page);
    await page.getByRole("button", { name: "Start away mode" }).click();
    await expect(page.getByRole("heading", { name: "Away mode is protecting the queue" })).toBeVisible();
    await page.getByRole("button", { name: "Resume now" }).click();
    await expect(page.getByRole("heading", { name: /mode is active/i })).toBeVisible();
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Your three highest-leverage moves" })).toBeVisible();
    const searchCompany = `Search Sponsor ${suffix}`;
    const companyResponse = await page.request.post("/backend/companies", { data: { companyName: searchCompany, website: `https://${suffix}.search.example`, country: "United Kingdom", industries: "Technology" } });
    expect(companyResponse.ok()).toBe(true);
    await page.keyboard.press("Control+K");
    const command = page.getByRole("dialog", { name: "Search GridFlow" });
    await expect(command).toBeVisible();
    await command.getByPlaceholder("Find any sponsor record or workspace…").fill(searchCompany);
    const companyResult = command.getByRole("button", { name: new RegExp(searchCompany, "i") });
    await expect(companyResult).toBeVisible();
    await companyResult.click();
    await page.waitForURL(/\/companies\/[0-9a-f-]+$/);
    await page.goto("/dashboard");
    const dismissSetup = page.getByRole("button", { name: "Dismiss setup checklist" });
    await expect(dismissSetup).toBeVisible();
    await dismissSetup.click();
    await page.reload();
    await expect(page.getByRole("button", { name: "Dismiss setup checklist" })).toHaveCount(0);
    const dashboardViewport = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    expect(dashboardViewport.scrollWidth, `${testInfo.project.name} Focus Desk has horizontal overflow`).toBeLessThanOrEqual(dashboardViewport.width + 1);
    await expectNoWcagViolations(page);
    await page.goto("/seal");
    await expect(page.getByRole("heading", { name: "Turn a negotiated deal into signed, collectable revenue" })).toBeVisible();
    await expect(page.getByText("No contracts in this view.")).toBeVisible();
    const sealViewport = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    expect(sealViewport.scrollWidth, `${testInfo.project.name} Seal cockpit has horizontal overflow`).toBeLessThanOrEqual(sealViewport.width + 1);
    await expectNoWcagViolations(page);
    await page.goto("/delivery");
    await expect(page.getByRole("heading", { name: "Deliver every promise. Prove every result." })).toBeVisible();
    await expect(page.getByText("No partnerships in this view.")).toBeVisible();
    const deliveryViewport = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    expect(deliveryViewport.scrollWidth, `${testInfo.project.name} Delivery cockpit has horizontal overflow`).toBeLessThanOrEqual(deliveryViewport.width + 1);
    await expectNoWcagViolations(page);
    await page.goto("/renewals");
    await expect(page.getByRole("heading", { name: "Keep the partnership. Grow the value." })).toBeVisible();
    await expect(page.getByText("No renewals in this view.")).toBeVisible();
    const renewalViewport = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    expect(renewalViewport.scrollWidth, `${testInfo.project.name} Renewals cockpit has horizontal overflow`).toBeLessThanOrEqual(renewalViewport.width + 1);
    await expectNoWcagViolations(page);
  }
});
