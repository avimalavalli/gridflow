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
  expect(motion.transitionDuration).toMatch(/0\.00001s|0\.01ms|0s/);
  await expectNoWcagViolations(page);

  const suffix = testInfo.project.name.replace(/[^a-z0-9]/gi, "-").toLowerCase();
  await page.getByLabel("Your name").fill(`Release ${suffix}`);
  await page.getByLabel("Email").fill(`phase51-${suffix}-${testInfo.retry}@example.test`);
  await page.getByLabel("Organisation name").fill(`GridFlow ${suffix} ${testInfo.retry}`);
  await page.getByLabel("Password").fill("GridFlow-browser-test-2026!");
  await page.getByRole("button", { name: "Create GridFlow account" }).click();
  await page.waitForURL(/\/(onboarding|pending-approval)/);
  await expect(page.locator("main")).toBeVisible();
  if (page.url().endsWith("/onboarding")) await expectNoWcagViolations(page);
});
