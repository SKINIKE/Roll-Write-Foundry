import { expect, test } from '@playwright/test';

test('auto play with seed 1337 completes 12 turns and preserves the snapshot', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-play').click();
  const playArea = page.locator('[aria-label="Playground"]');
  await expect(playArea).toBeVisible();
  const seedInput = playArea.getByTestId('seed-input');
  await seedInput.fill('1337');
  await playArea.getByTestId('apply-seed').click();
  await playArea.getByTestId('auto-play').click();
  const playLog = playArea.getByTestId('play-log');
  await expect(playLog).toContainText('Game complete');
  const scoreCard = playArea.locator('.score-board').first();
  const scoreText = await scoreCard.textContent();
  await expect(playLog).toContainText('End turn 12');
  await expect(playLog).toContainText('Game complete');
  const replayList = playArea.getByTestId('replay-list');
  await expect(replayList).toBeVisible();
  const firstReplayButton = replayList.locator('button').first();
  await firstReplayButton.click();
  const replayScoreText = await scoreCard.textContent();
  const normalize = (value: string | null | undefined) =>
    (value ?? '').replace(/\s+/g, ' ').trim();
  expect(normalize(replayScoreText)).toBe(normalize(scoreText));
  const logItems = playLog.locator('li');
  const count = await logItems.count();
  expect(count).toBeGreaterThan(0);
  await expect(logItems.nth(count - 1)).toContainText('Game complete');
});
