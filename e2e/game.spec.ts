import { expect, test } from '@playwright/test';
import { El, elementByName } from '../src/sim/elements';

const MATERIALS = [
  'Water', 'Hydrochloric acid', 'Sodium hydroxide', 'Glass',
  'Fire', 'Smoke', 'Metal', 'Molten metal', 'Molten glass', 'Ice', 'Steam', 'Lava', 'Stone', 'Wall',
] as const;

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await page.locator('#world').waitFor();
  await page.waitForFunction(() => window.__PIXEL_SANDBOX__ !== undefined);
});

test('phone screen shows the sandbox, picker, and temperature', async ({ page }) => {
  await page.evaluate(() => window.__PIXEL_SANDBOX__!.setPaused(true));
  await page.screenshot({ path: '/opt/cursor/artifacts/pixel-sandbox-main.png' });

  await page.getByRole('button', { name: 'ALL', exact: true }).click();
  await expect(page.locator('.sheettitle')).toHaveText('ELEMENTS');
  await expect(page.locator('.sheet').getByRole('button', { name: 'Water (H2O)' })).toBeVisible();
  await expect(page.locator('.sheet').getByRole('button', { name: 'Hydrochloric acid (HCl)' })).toBeVisible();
  await expect(page.locator('.sheet').getByRole('button', { name: 'Sodium hydroxide (NaOH)' })).toBeVisible();
  await expect(page.locator('.sheet').getByRole('button', { name: 'Glass (SiO2)' })).toBeVisible();
  await expect(page.locator('.sheet').getByRole('button', { name: 'Lava' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'GOALS' })).toHaveCount(0);
  await expect(page.getByText('Seed')).toHaveCount(0);
  await expect(page.getByText('Hydrogen peroxide')).toHaveCount(0);
  await page.screenshot({ path: '/opt/cursor/artifacts/pixel-sandbox-picker.png' });
  await page.getByRole('button', { name: 'CLOSE' }).click();

  await page.getByRole('button', { name: 'HEAT' }).click();
  await expect(page.getByRole('button', { name: 'HEAT' })).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: '/opt/cursor/artifacts/pixel-sandbox-temperature.png' });
  await page.getByRole('button', { name: 'HEAT' }).click();
});

test('paints every element by touch and runs a water-lava reaction', async ({ page }) => {
  await page.evaluate(() => {
    const api = window.__PIXEL_SANDBOX__!;
    api.setPaused(true);
    api.setBrush(1, 'circle');
    api.clear();
  });

  for (const name of MATERIALS) {
    const id = elementByName(name)!.id;
    await page.evaluate((tool) => {
      const api = window.__PIXEL_SANDBOX__!;
      api.clear();
      api.select(tool);
    }, name);
    const spot = await page.evaluate(() => window.__PIXEL_SANDBOX__!.aim());
    await page.touchscreen.tap(spot.clientX, spot.clientY);
    const painted = await page.evaluate(({ x, y, elementId }) => {
      return window.__PIXEL_SANDBOX__!.sim.get(x, y) === elementId;
    }, { x: spot.x, y: spot.y, elementId: id });
    expect(painted, name).toBe(true);
  }

  for (const name of ['Box', 'Ball', 'Plank'] as const) {
    await page.evaluate((tool) => {
      const api = window.__PIXEL_SANDBOX__!;
      api.clear();
      api.select(tool);
    }, name);
    const spot = await page.evaluate(() => window.__PIXEL_SANDBOX__!.aim());
    await page.touchscreen.tap(spot.clientX, spot.clientY);
    const count = await page.evaluate(() => window.__PIXEL_SANDBOX__!.sim.bodies.length);
    expect(count, name).toBe(1);
  }

  await page.evaluate(() => {
    const api = window.__PIXEL_SANDBOX__!;
    api.clear();
    api.select('Lava');
  });
  const lava = await page.evaluate(() => window.__PIXEL_SANDBOX__!.aim());
  await page.touchscreen.tap(lava.clientX, lava.clientY);
  await page.evaluate(() => window.__PIXEL_SANDBOX__!.select('Water'));
  await page.touchscreen.tap(lava.clientX, lava.clientY);
  const result = await page.evaluate(({ x, y, ids }) => {
    const sim = window.__PIXEL_SANDBOX__!.sim;
    return { cell: sim.get(x, y), stone: sim.count(ids.stone), steam: sim.count(ids.steam) };
  }, { x: lava.x, y: lava.y, ids: { stone: El.Stone, steam: El.Steam } });
  expect(result.cell).toBe(El.Stone);
  expect(result.stone).toBeGreaterThan(0);
  expect(result.steam).toBeGreaterThan(0);
});

test('keeps a playable frame rate on the demo scene', async ({ page }) => {
  await page.evaluate(() => {
    const api = window.__PIXEL_SANDBOX__!;
    api.resetDemo();
    api.setPaused(false);
  });
  await page.waitForTimeout(1500);
  const fps = await page.evaluate(() => window.__PIXEL_SANDBOX__!.getFps());
  expect(fps).toBeGreaterThan(30);
});

test('is installable at the project path and reloads offline', async ({ page, context }) => {
  const manifest = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]');
    if (!(link instanceof HTMLLinkElement)) throw new Error('missing manifest link');
    const response = await fetch(link.href);
    return response.json() as Promise<{
      start_url: string;
      scope: string;
      id: string;
      display: string;
      name: string;
      icons: Array<{ sizes: string; src: string; purpose?: string }>;
    }>;
  });
  expect(manifest.name).toBe('Pixel Sandbox');
  expect(manifest.display).toBe('standalone');
  expect(manifest.start_url).toBe('/pixel-sandbox/');
  expect(manifest.scope).toBe('/pixel-sandbox/');
  expect(manifest.id).toBe('/pixel-sandbox/');
  const sizes = manifest.icons.map((icon) => icon.sizes);
  expect(sizes).toContain('192x192');
  expect(sizes).toContain('512x512');
  expect(manifest.icons.some((icon) => icon.purpose?.includes('maskable'))).toBe(true);
  for (const icon of manifest.icons) {
    const response = await page.request.get(new URL(icon.src, page.url()).toString());
    expect(response.status(), icon.src).toBe(200);
  }

  await page.waitForFunction(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return Boolean(registration?.active);
  });
  if (!(await page.evaluate(() => navigator.serviceWorker.controller))) {
    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  }
  expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? '')).toContain('/pixel-sandbox/');

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#world')).toBeVisible();
  await expect(page.locator('.title')).toHaveText('PIXEL SANDBOX');
  const offlineManifest = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]');
    if (!(link instanceof HTMLLinkElement)) return null;
    const response = await fetch(link.href);
    return response.ok;
  });
  expect(offlineManifest).toBe(true);
});
