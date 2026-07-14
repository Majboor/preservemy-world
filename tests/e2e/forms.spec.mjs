import { test, expect } from "@playwright/test";

// The opportunity intake form is the site's main conversion surface. Selecting
// a program must (a) mark that button active and (b) repoint the embedded
// Google Form iframe at the matching program.
const PROGRAMS = [
  "creator-access",
  "internship",
  "campus-ambassador",
  "partnership",
  "support",
  "webinar",
];

async function dismissLoader(page) {
  await page.goto("/index.html");
  await expect(page.locator("body")).not.toHaveClass(/is-loading/, {
    timeout: 45_000,
  });
}

test.describe("opportunity form", () => {
  test("renders one button per program", async ({ page }) => {
    await dismissLoader(page);
    const buttons = page.locator(".form-option");
    await expect(buttons).toHaveCount(PROGRAMS.length);
    const active = page.locator(".form-option.is-active");
    await expect(active).toHaveCount(1);
  });

  test("selecting a program activates its button and repoints the iframe", async ({
    page,
  }) => {
    await dismissLoader(page);
    const iframe = page.locator("#programForm");

    for (const program of ["internship", "partnership", "webinar"]) {
      const button = page.locator(`.form-option[data-program="${program}"]`);
      await button.scrollIntoViewIfNeeded();
      await button.click();

      await expect(button).toHaveClass(/is-active/);
      // Exactly one button active at a time.
      await expect(page.locator(".form-option.is-active")).toHaveCount(1);

      await expect
        .poll(async () => {
          const src = await iframe.getAttribute("src");
          return new URL(src).searchParams.get("program");
        })
        .toBe(program);
    }
  });

  test("an 'Upload a memory' CTA jumps to the form and selects creator-access", async ({
    page,
  }) => {
    await dismissLoader(page);
    // Use the CTA inside the #submit section (stable, not the sticky header).
    const cta = page.locator('#submit a.form-jump[data-program="creator-access"]');
    await cta.click();

    await expect(page.locator('.form-option[data-program="creator-access"]')).toHaveClass(
      /is-active/,
    );
    // The forms section should now be in view.
    await expect(page.locator("#forms")).toBeInViewport({ ratio: 0.1 });
  });
});
