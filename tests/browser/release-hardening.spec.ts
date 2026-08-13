import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function expectNoWcagViolations(page: Parameters<typeof AxeBuilder>[0]["page"]) {
  await page.waitForLoadState("domcontentloaded");
  const analyse = () => new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  let result: Awaited<ReturnType<typeof analyse>>;
  try {
    result = await analyse();
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("Execution context was destroyed")) throw error;
    await page.waitForLoadState("domcontentloaded");
    result = await analyse();
  }
  expect(result.violations.map((violation) => ({ id: violation.id, impact: violation.impact, targets: violation.nodes.map((node) => node.target) }))).toEqual([]);
}

test("public product, configured pricing, support and private receipt states are responsive and accessible", async ({ page }, testInfo) => {
  for (const route of ["/product", "/pricing", "/support"]) {
    await page.goto(route);
    await expect(page.getByRole("navigation", { name: "Public navigation" })).toBeVisible();
    await expectNoWcagViolations(page);
    const viewport = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    expect(viewport.scrollWidth, `${testInfo.project.name} ${route} has horizontal overflow`).toBeLessThanOrEqual(viewport.width + 1);
  }

  await page.goto("/pricing");
  await expect(page.getByText("Individually quoted", { exact: true })).toBeVisible();
  await expect(page.getByText("£39.99", { exact: true })).toBeVisible();
  await expect(page.getByText("£11.99 once. Purchased credits do not expire.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Request a Core quote" })).toHaveAttribute("href", /^mailto:support@gridflow\.test/);
  await expect(page.getByText(/no online checkout and no automatic renewal/i)).toBeVisible();
  await expect(page.getByLabel("Activation email")).toHaveCount(0);

  await page.goto("/receipt");
  await expect(page.getByText("This receipt link is incomplete.")).toBeVisible();
  await expectNoWcagViolations(page);
});

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
  test.setTimeout(90_000);
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
  await page.getByLabel(/I accept the Terms of Service/i).check();
  await page.getByLabel(/I have read the Privacy Policy/i).check();
  await page.getByLabel(/I confirm that I am at least 18/i).check();
  await page.getByLabel(/I have authority to create this organisation/i).check();
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
    await expect(page.getByRole("heading", { name: "Set up your commercial profile" })).toBeVisible();
    await expect(page.getByText(/progress saves automatically/i)).toBeVisible();
    await expectNoWcagViolations(page);
    await page.goto("/guide");
    await expect(page.getByRole("heading", { name: "Learn the workflow in ten steps" })).toBeVisible();
    await expectNoWcagViolations(page);
    await page.goto("/help");
    await expect(page.getByRole("heading", { name: "Help Centre", exact: true })).toBeVisible();
    await page.getByLabel("Search the GridFlow manual").fill("API keys");
    await expect(page.getByRole("button", { name: /Intelligence setup and keys/i })).toBeVisible();
    await page.getByLabel("Search the GridFlow manual").fill("live integration acceptance");
    await expect(page.getByRole("button", { name: /Live integration acceptance/i })).toBeVisible();
    await expectNoWcagViolations(page);
    await page.goto("/automation");
    await expect(page.getByRole("heading", { name: "Automation", exact: true })).toBeVisible();
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
    await page.goto("/launch");
    await expect(page.getByRole("heading", { name: "Evidence, not recollection" })).toBeVisible();
    await expect(page.getByText("Real provider events only")).toBeVisible();
    const evidenceProgress = page.getByRole("progressbar", { name: "Live integration evidence completion" });
    await expect(evidenceProgress).toHaveAttribute("aria-valuemin", "0");
    await expect(evidenceProgress).toHaveAttribute("aria-valuemax", "7");
    await expect(evidenceProgress).toHaveAttribute("aria-valuenow", "0");
    await expect(page.locator(".launch-check").filter({ hasText: "Atlas live acceptance" }).getByRole("button", { name: "Pass" })).toBeDisabled();
    const launchViewport = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    expect(launchViewport.scrollWidth, `${testInfo.project.name} live acceptance has horizontal overflow`).toBeLessThanOrEqual(launchViewport.width + 1);
    await expectNoWcagViolations(page);
    await page.goto("/platform/economics");
    await expect(page.getByRole("heading", { name: "Research economics", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Start the 100-run evidence window" })).toBeVisible();
    const economicsViewport = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    expect(economicsViewport.scrollWidth, `${testInfo.project.name} research economics has horizontal overflow`).toBeLessThanOrEqual(economicsViewport.width + 1);
    await expectNoWcagViolations(page);
    await page.goto("/platform/acceptance");
    await expect(page.getByRole("heading", { name: "Acceptance Lab", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Product acceptance is collecting" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create 22-step journey" })).toBeVisible();
    const acceptanceViewport = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    expect(acceptanceViewport.scrollWidth, `${testInfo.project.name} Acceptance Lab has horizontal overflow`).toBeLessThanOrEqual(acceptanceViewport.width + 1);
    await expectNoWcagViolations(page);
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Your three highest-leverage moves" })).toBeVisible();
    const searchCompany = `Search Sponsor ${suffix}`;
    const companyResponse = await page.request.post("/backend/companies", {
      data: { companyName: searchCompany, website: `https://${suffix}.search.example`, country: "United Kingdom", industries: "Technology" },
      headers: { Origin: "http://localhost:3000" },
    });
    expect(companyResponse.ok()).toBe(true);
    await page.keyboard.press("Control+K");
    const command = page.getByRole("dialog", { name: "Search GridFlow" });
    await expect(command).toBeVisible();
    await command.getByPlaceholder("Search records and workspaces…").fill(searchCompany);
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
    await expect(page.getByRole("heading", { name: "Contracts, signatures and payments" })).toBeVisible();
    await expect(page.getByText("No contracts in this view.")).toBeVisible();
    const sealViewport = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    expect(sealViewport.scrollWidth, `${testInfo.project.name} Seal cockpit has horizontal overflow`).toBeLessThanOrEqual(sealViewport.width + 1);
    await expectNoWcagViolations(page);
    await page.goto("/delivery");
    await expect(page.getByRole("heading", { name: "Partnership delivery" })).toBeVisible();
    await expect(page.getByText("No partnerships in this view.")).toBeVisible();
    const deliveryViewport = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    expect(deliveryViewport.scrollWidth, `${testInfo.project.name} Delivery cockpit has horizontal overflow`).toBeLessThanOrEqual(deliveryViewport.width + 1);
    await expectNoWcagViolations(page);
    await page.goto("/renewals");
    await expect(page.getByRole("heading", { name: "Renewal pipeline" })).toBeVisible();
    await expect(page.getByText("No renewals in this view.")).toBeVisible();
    const renewalViewport = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    expect(renewalViewport.scrollWidth, `${testInfo.project.name} Renewals cockpit has horizontal overflow`).toBeLessThanOrEqual(renewalViewport.width + 1);
    await expectNoWcagViolations(page);
  }
});
