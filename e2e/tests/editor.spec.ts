import path from 'path';
import { fileURLToPath } from 'url';
import { expect, test } from '@playwright/test';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const invalidTemplatePath = path.resolve(currentDir, '../fixtures/invalid-template.json');

test('invalid template upload surfaces validation guidance', async ({ page }) => {
  await page.goto('/');
  const upload = page.getByTestId('template-upload');
  await upload.setInputFiles(invalidTemplatePath);
  await expect(page.getByTestId('mode-json')).toHaveAttribute('aria-pressed', 'true');
  const issues = page.locator('[data-testid="validation-issues"] li');
  await expect(issues.first()).toBeVisible();
  await expect(issues.first()).toContainText('required');
});

test('editing via the form updates the preview snapshot', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Ore \(ore\)/i }).click();
  const labelField = page.getByLabel('Label');
  await labelField.fill('Refined Ore');
  const oreCard = page.getByTestId('resource-card-ore');
  await expect(oreCard).toContainText('Refined Ore');
});
