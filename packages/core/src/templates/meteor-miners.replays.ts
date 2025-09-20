import { autoplay, highestPriorityPolicy } from '../session';
import type { GameTemplate, ReplayRecord } from '../types';
import rawMeteorMiners from './meteor-miners.json';

const replaySeeds = [42, 1337, 20250920] as const;

const template = rawMeteorMiners as GameTemplate;

export const meteorMinersReplays: Record<(typeof replaySeeds)[number], ReplayRecord> = replaySeeds.reduce(
  (acc, seed) => {
    acc[seed] = autoplay(template, highestPriorityPolicy, { seed });
    return acc;
  },
  {} as Record<number, ReplayRecord>,
);
