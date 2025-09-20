import { describe, expect, it } from 'vitest';
import {
  MiniExprEvaluationError,
  MiniExprSyntaxError,
  compileExpression,
  evaluateExpression,
  listIdentifiers,
} from './index';
import { Xorshift128Plus } from '../rng/xorshift128plus';

const baseVariables = {
  ore: 5,
  crystal: 2,
  combo: 2,
  achievements: 0,
  roll_total: 11,
  roll_high: 6,
  roll_low: 5,
  roll_1: 6,
  roll_2: 5,
  turn: 3,
};

type EvalCase = { expr: string; expected: number | boolean; precision?: number };

const deterministicCases: EvalCase[] = [
  { expr: '1 + 2 * 3', expected: 7 },
  { expr: '(1 + 2) * 3', expected: 9 },
  { expr: '4 / 2 + 1', expected: 3 },
  { expr: '10 % 3', expected: 1 },
  { expr: '2 ^ 3', expected: 8 },
  { expr: '-(3 - 5)', expected: 2 },
  { expr: '!false', expected: true },
  { expr: 'true && false', expected: false },
  { expr: 'true || false', expected: true },
  { expr: '3 > 1 && 2 < 5', expected: true },
  { expr: '3 == 3', expected: true },
  { expr: '3 != 4', expected: true },
  { expr: 'CLAMP(10, 0, 5)', expected: 5 },
  { expr: 'CLAMP(-1, 0, 5)', expected: 0 },
  { expr: 'MAX(1, 7, 3)', expected: 7 },
  { expr: 'MIN(1, 7, 3)', expected: 1 },
  { expr: 'IF(1 < 2, 10, 20)', expected: 10 },
  { expr: 'IF(false, 1, 2)', expected: 2 },
  { expr: 'ABS(-3)', expected: 3 },
  { expr: 'FLOOR(3.9)', expected: 3 },
  { expr: 'CEIL(3.1)', expected: 4 },
  { expr: 'ROUND(3.456, 2)', expected: 3.46, precision: 2 },
  { expr: 'ROUND(3.456)', expected: 3 },
  { expr: 'ore + crystal', expected: 7 },
  { expr: 'ore * 3 + crystal * 5 + combo * 4', expected: 33 },
  { expr: 'roll_total >= 10', expected: true },
  { expr: 'roll_total == roll_1 + roll_2', expected: true },
  { expr: 'roll_high >= roll_low', expected: true },
  { expr: 'ore >= 3 && crystal >= 1', expected: true },
  { expr: 'MAX(ore, crystal, combo)', expected: 5 },
  { expr: 'MIN(ore, crystal, combo)', expected: 2 },
  { expr: 'roll_total / 2', expected: 5.5, precision: 5 },
  { expr: 'ore + -crystal', expected: 3 },
  { expr: '!(ore > crystal)', expected: false },
  { expr: 'IF(roll_total >= 10, ore + 5, ore)', expected: 10 },
  { expr: 'CLAMP(roll_total, 5, 9)', expected: 9 },
  { expr: 'ROUND(roll_total / 3, 1)', expected: 3.7, precision: 1 },
  { expr: 'ABS(combo - crystal)', expected: 0 },
  { expr: 'MAX(roll_1, roll_2, ore)', expected: 6 },
  { expr: 'MIN(roll_1, roll_2, ore)', expected: 5 },
  { expr: 'ROUND(-2.5)', expected: -2 },
  { expr: 'FLOOR(-1.2)', expected: -2 },
  { expr: 'CEIL(-1.2)', expected: -1 },
  { expr: 'MAX(1, MIN(2, 3))', expected: 2 },
  { expr: 'IF(roll_total > 7 && ore < 5, ore + 2, ore)', expected: 5 },
  { expr: '((ore + crystal) * combo) - achievements', expected: 14 },
  { expr: 'roll_1 ^ 2 + roll_2 ^ 2', expected: 61 },
  { expr: 'CLAMP(roll_total - ore, 0, 10)', expected: 6 },
  { expr: 'MIN(roll_total, MAX(ore, crystal))', expected: 5 },
  { expr: 'MIN(MAX(ore, 1), roll_total)', expected: 5 },
  { expr: 'turn + ore', expected: 8 },
  { expr: 'IF(turn >= 3, 1, 0)', expected: 1 },
];

describe('MiniExpr evaluation', () => {
  it('collects identifiers from expressions', () => {
    const compiled = compileExpression('ore + MAX(crystal, 3) - turn');
    expect(Array.from(listIdentifiers(compiled.ast).values()).sort()).toEqual(['crystal', 'ore', 'turn']);
  });

  it.each(deterministicCases)(
    'evaluates %s',
    ({ expr, expected, precision }) => {
      const compiled = compileExpression(expr);
      const result = evaluateExpression(compiled, { variables: baseVariables });
      if (typeof expected === 'boolean') {
        expect(result).toBe(expected);
      } else if (precision !== undefined) {
        expect(result).toBeCloseTo(expected, precision);
      } else {
        expect(result).toBe(expected);
      }
    },
  );

  it('evaluates dice helpers deterministically with RNG', () => {
    const rng = new Xorshift128Plus(99);
    const diceCases: Array<[string, number]> = [
      ['D6(3)', 0],
      ['D(4, 2)', 0],
      ['D(8)', 0],
    ];
    const results = diceCases.map(([expr]) => {
      const compiled = compileExpression(expr);
      const value = evaluateExpression(compiled, { variables: baseVariables, rng });
      if (typeof value !== 'number') {
        throw new Error('Dice evaluation should return a number');
      }
      return value;
    });
    expect(results).toMatchSnapshot('dice-rolls');
  });

  it('rejects invalid syntax', () => {
    expect(() => compileExpression('(')).toThrow(MiniExprSyntaxError);
    expect(() => compileExpression('1 +')).toThrow(MiniExprSyntaxError);
  });

  it('rejects evaluation errors', () => {
    const compiledUnknown = compileExpression('unknownVar');
    expect(() => evaluateExpression(compiledUnknown, { variables: baseVariables })).toThrow(MiniExprEvaluationError);
    const compiledClamp = compileExpression('CLAMP(1, 2, 1)');
    expect(() => evaluateExpression(compiledClamp, { variables: baseVariables })).toThrow(MiniExprEvaluationError);
    const compiledDivZero = compileExpression('1 / 0');
    expect(() => evaluateExpression(compiledDivZero, { variables: baseVariables })).toThrow(MiniExprEvaluationError);
    const compiledDice = compileExpression('D6()');
    expect(() => evaluateExpression(compiledDice, { variables: baseVariables })).toThrow(MiniExprEvaluationError);
  });
});
