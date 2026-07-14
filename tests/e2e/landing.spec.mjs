import { test, expect } from "@playwright/test";

// Core landing-page smoke: the page loads, the intro loader clears, primary
// navigation resolves, and no uncaught page errors are thrown.
test.describe("landing page", () => {
  test("loads, clears the loader and shows the hero", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.goto("/index.html");

    await expect(page).toHaveTitle(/preservemy\.world/i);

    // The intro loader removes the is-loading class from <body> once the door
    // frames (or, in lite mode, the first hero video) are ready. The script has
    // a hard 28s fallback, so allow generous time.
    await expect(page.locator("body")).not.toHaveClass(/is-loading/, {
      timeout: 45_000,
    });
    await expect(page.locator("#loader")).toHaveClass(/is-hidden/);

    // Hero and the primary sections are present.
    await expect(page.locator("#home")).toBeVisible();
    for (const id of ["worlds", "how", "capabilities", "forms"]) {
      await expect(page.locator(`#${id}`)).toHaveCount(1);
    }

    expect(pageErrors, `page threw: ${pageErrors.join(" | ")}`).toEqual([]);
  });

  test("primary nav links all resolve to real sections", async ({ page }) => {
    await page.goto("/index.html");
    const hrefs = await page
      .locator('nav.nav-links a[href^="#"]')
      .evaluateAll((els) => els.map((e) => e.getAttribute("href")));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      const id = href.slice(1);
      await expect(page.locator(`[id="${id}"]`)).toHaveCount(1);
    }
  });

  test("footer exposes the four social links", async ({ page }) => {
    await page.goto("/index.html");
    const social = page.locator('.footer-social a[target="_blank"]');
    await expect(social).toHaveCount(4);
    for (const rel of await social.evaluateAll((els) =>
      els.map((e) => e.getAttribute("rel")),
    )) {
      expect(rel).toContain("noopener");
    }
  });
});
