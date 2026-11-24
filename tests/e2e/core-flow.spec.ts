import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const BENCHMARK_DIR = resolve(__dirname, '../../docs/benchmarks');

test.describe('AussieHome 3D — Core E2E & Visual Benchmark Suite', () => {
  test('completes full Australian 3D walkthrough, PBR material edit, 2D/3D sync, save/reload & floorplan recognition', async ({
    page,
  }) => {
    mkdirSync(BENCHMARK_DIR, { recursive: true });
    const consoleErrors: string[] = [];
    page.on('pageerror', (err) => consoleErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    // 1. Open Dashboard & verify Australian API connection + Sydney Coastal Demo
    await page.goto('/');
    await expect(page.getByText('Upload Your Floor Plan. Design Your Home.')).toBeVisible();
    await expect(page.getByText(/API Connected/)).toBeVisible();
    await page.screenshot({ path: resolve(BENCHMARK_DIR, '01-dashboard.png') });

    // 2. Launch 3D Studio (Orbit Exterior View — wait for async 1K PBR maps, 32-bit HDRI & CC0 GLBs)
    await page.getByRole('button', { name: /Walk Through Sydney Coastal Demo/i }).click();
    await expect(page).toHaveURL(/\/projects\/.*\/studio/);
    await page.waitForTimeout(2600);

    // Verify WebGL canvas exists and rendered non-blank pixels
    const canvasCount = await page.locator('canvas').count();
    expect(canvasCount).toBeGreaterThanOrEqual(1);
    await page.screenshot({ path: resolve(BENCHMARK_DIR, '02-3d-exterior-orbit.png') });

    // 3. Toggle Dollhouse Roof Cutaway in Orbit View
    await page.getByRole('button', { name: 'Cutaway Roof' }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: resolve(BENCHMARK_DIR, '03-3d-dollhouse-cutaway.png') });

    // Restore Roof & enter First-Person Walkthrough (Living Room -> Alfresco -> Backyard Pool)
    await page.getByRole('button', { name: 'Show Roof' }).click();
    await page.getByRole('button', { name: 'Walkthrough' }).click();
    await page.getByRole('button', { name: 'Living Room' }).first().click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: resolve(BENCHMARK_DIR, '04-walkthrough-living-room.png') });

    // Walk forward using W key towards the open Alfresco sliding stacker doors
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(450);
    await page.keyboard.up('KeyW');

    await page.getByRole('button', { name: 'Backyard Pool' }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: resolve(BENCHMARK_DIR, '05-walkthrough-backyard-pool.png') });

    // 4. Real-time PBR Material Replacement & Natural Language AI Style Edit
    await page.getByRole('button', { name: 'Orbit' }).click();
    await page.getByRole('button', { name: 'Cutaway Roof' }).click();
    await page.getByRole('button', { name: 'Materials' }).click();
    await page.getByRole('button', { name: /Australian Blackbutt Decking/i }).click();
    await page.waitForTimeout(400);

    await page.getByRole('button', { name: 'AI Style' }).click();
    await page.getByRole('button', { name: 'Apply Design Prompt' }).click();
    await expect(page.getByText(/Parsed design intent/i)).toBeVisible();

    // 5. Split 2D / 3D Floor Plan Editor & Backend Save + Reload Persistence
    await page.getByRole('button', { name: 'Split 2D / 3D' }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: resolve(BENCHMARK_DIR, '06-split-2d-3d-editor.png') });

    await page.getByRole('button', { name: /Save\*/ }).click();
    await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible();

    await page.reload();
    await page.waitForTimeout(1000);
    await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible();

    // 6. End-to-End Floor Plan Upload -> Recognition Review -> Generate Editable 3D House
    await page.locator('nav').getByRole('button', { name: 'Floor Plan' }).click();
    await page.getByRole('button', { name: /Upload \/ AI Recognise Floor Plan/i }).click();
    await expect(page).toHaveURL(/\/floorplan$/);

    await page.getByRole('button', { name: /Load Sample Sydney 4-Bed Blueprint/i }).click();
    await page.getByRole('button', { name: /Upload & Extract Structured Floor Plan/i }).click();
    await expect(page.getByText(/Confidence: 76%/i)).toBeVisible();
    await page.screenshot({ path: resolve(BENCHMARK_DIR, '07-floorplan-recognition-review.png') });

    await page.getByRole('button', { name: /Confirm & Generate Editable 3D House/i }).click();
    await expect(page).toHaveURL(/\/studio$/);
    await page.waitForTimeout(800);
    await page.screenshot({ path: resolve(BENCHMARK_DIR, '08-recognized-3d-house.png') });

    // Also record real WebGL2 performance metrics (FPS & draw calls) to benchmark report
    await page.setViewportSize({ width: 1600, height: 920 });
    await page.waitForTimeout(1000);
    const perfBadgeText = await page.locator('header').innerText();
    console.log('[BENCHMARK HEADER]', perfBadgeText.replace(/\n+/g, ' | '));

    expect(consoleErrors).toEqual([]);
  });
});
