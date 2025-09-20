export type MiniValue = number | boolean | null;

export interface SourceSpan {
  start: number;
  end: number;
}

export interface NumberLiteral {
  type: 'NumberLiteral';
  value: number;
  span: SourceSpan;
}

export interface BooleanLiteral {
  type: 'BooleanLiteral';
  value: boolean;
  span: SourceSpan;
}

export interface NullLiteral {
  type: 'NullLiteral';
  span: SourceSpan;
}

export interface IdentifierNode {
  type: 'Identifier';
  name: string;
  span: SourceSpan;
}

export interface UnaryExpression {
  type: 'UnaryExpression';
  operator: '!' | '-';
  argument: ExpressionNode;
  span: SourceSpan;
}

export interface BinaryExpression {
  type: 'BinaryExpression';
  operator:
    | '||'
    | '&&'
    | '=='
    | '!='
    | '<'
    | '<='
    | '>'
    | '>='
    | '+'
    | '-'
    | '*'
    | '/'
    | '%'
    | '^';
  left: ExpressionNode;
  right: ExpressionNode;
  span: SourceSpan;
}

export interface CallExpression {
  type: 'CallExpression';
  callee: IdentifierNode;
  arguments: ExpressionNode[];
  span: SourceSpan;
}

export type ExpressionNode =
  | NumberLiteral
  | BooleanLiteral
  | NullLiteral
  | IdentifierNode
  | UnaryExpression
  | BinaryExpression
  | CallExpression;

export class MiniExprSyntaxError extends Error {
  constructor(message: string, public readonly span: SourceSpan) {
    super(message);
    this.name = 'MiniExprSyntaxError';
  }
}

export class MiniExprEvaluationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MiniExprEvaluationError';
  }
}

type TokenType =
  | 'number'
  | 'identifier'
  | 'operator'
  | 'paren'
  | 'comma'
  | 'eof';

interface Token {
  type: TokenType;
  value: string;
  span: SourceSpan;
}

const operatorTokens = new Set(['||', '&&', '==', '!=', '<=', '>=', '+', '-', '*', '/', '%', '^', '<', '>', '!']);

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  const length = source.length;
  const pushToken = (type: TokenType, value: string, start: number, end: number) => {
    tokens.push({ type, value, span: { start, end } });
  };

  while (index < length) {
    const char = source[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (/[0-9]/.test(char)) {
      const start = index;
      let hasDot = false;
      while (index < length) {
        const current = source[index];
        if (current === '.') {
          if (hasDot) break;
          hasDot = true;
          index += 1;
          continue;
        }
        if (!/[0-9]/.test(current)) break;
        index += 1;
      }
      const value = source.slice(start, index);
      pushToken('number', value, start, index);
      continue;
    }

    if (/[A-Za-z_]/.test(char)) {
      const start = index;
      index += 1;
      while (index < length && /[A-Za-z0-9_]/.test(source[index])) {
        index += 1;
      }
      const value = source.slice(start, index);
      pushToken('identifier', value, start, index);
      continue;
    }

    if (char === '(' || char === ')') {
      const start = index;
      index += 1;
      pushToken('paren', char, start, index);
      continue;
    }

    if (char === ',') {
      const start = index;
      index += 1;
      pushToken('comma', ',', start, index);
      continue;
    }

    const twoChar = source.slice(index, index + 2);
    if (operatorTokens.has(twoChar)) {
      pushToken('operator', twoChar, index, index + 2);
      index += 2;
      continue;
    }

    if (operatorTokens.has(char)) {
      const start = index;
      index += 1;
      pushToken('operator', char, start, index);
      continue;
    }

    throw new MiniExprSyntaxError(`Unexpected character '${char}'`, { start: index, end: index + 1 });
  }

  tokens.push({ type: 'eof', value: '', span: { start: length, end: length } });
  return tokens;
}

export function parseExpression(source: string): ExpressionNode {
  const tokens = tokenize(source);
  let current = 0;

  const peek = () => tokens[current];
  const previous = () => tokens[current - 1];

  const match = (...types: TokenType[]) => {
    const token = peek();
    if (types.includes(token.type)) {
      current += 1;
      return true;
    }
    return false;
  };

  const checkOperator = (operator: string) => {
    const token = peek();
    if (token.type === 'operator' && token.value === operator) {
      current += 1;
      return true;
    }
    return false;
  };

  const checkParen = (paren: '(' | ')') => {
    const token = peek();
    if (token.type === 'paren' && token.value === paren) {
      current += 1;
      return true;
    }
    return false;
  };

  const parseExpressionInner = (): ExpressionNode => parseLogicalOr();

  const parsePrimary = (): ExpressionNode => {
    const token = peek();
    switch (token.type) {
      case 'number': {
        current += 1;
        return { type: 'NumberLiteral', value: Number(token.value), span: token.span };
      }
      case 'identifier': {
        current += 1;
        if (token.value === 'true') {
          return { type: 'BooleanLiteral', value: true, span: token.span };
        }
        if (token.value === 'false') {
          return { type: 'BooleanLiteral', value: false, span: token.span };
        }
        if (token.value === 'null') {
          return { type: 'NullLiteral', span: token.span };
        }
        if (checkParen('(')) {
          const args: ExpressionNode[] = [];
          if (peek().type !== 'paren' || peek().value !== ')') {
            do {
              args.push(parseExpressionInner());
            } while (match('comma'));
          }
          if (!checkParen(')')) {
            throw new MiniExprSyntaxError('Expected closing parenthesis', peek().span);
          }
          return {
            type: 'CallExpression',
            callee: { type: 'Identifier', name: token.value, span: token.span },
            arguments: args,
            span: { start: token.span.start, end: previous().span.end },
          };
        }
        return { type: 'Identifier', name: token.value, span: token.span };
      }
      case 'paren': {
        if (token.value !== '(') {
          throw new MiniExprSyntaxError(`Unexpected token '${token.value}'`, token.span);
        }
        current += 1;
        const expr = parseExpressionInner();
        const closing = peek();
        if (closing.type === 'paren' && closing.value === ')') {
          current += 1;
          return expr;
        }
        throw new MiniExprSyntaxError('Expected closing parenthesis', closing.span);
      }
      default:
        throw new MiniExprSyntaxError(`Unexpected token '${token.value}'`, token.span);
    }
  };

  const parseUnary = (): ExpressionNode => {
    const token = peek();
    if (token.type === 'operator' && (token.value === '!' || token.value === '-')) {
      current += 1;
      const argument = parseUnary();
      return {
        type: 'UnaryExpression',
        operator: token.value as '!' | '-',
        argument,
        span: { start: token.span.start, end: argument.span.end },
      };
    }
    return parsePrimary();
  };

  const parseExponent = (): ExpressionNode => {
    let expr = parseUnary();
    while (peek().type === 'operator' && peek().value === '^') {
      const operator = peek();
      current += 1;
      const right = parseUnary();
      expr = {
        type: 'BinaryExpression',
        operator: '^',
        left: expr,
        right,
        span: { start: expr.span.start, end: right.span.end },
      };
    }
    return expr;
  };

  const parseMultiplicative = (): ExpressionNode => {
    let expr = parseExponent();
    while (true) {
      const token = peek();
      if (token.type === 'operator' && (token.value === '*' || token.value === '/' || token.value === '%')) {
        current += 1;
        const right = parseExponent();
        expr = {
          type: 'BinaryExpression',
          operator: token.value as '*' | '/' | '%',
          left: expr,
          right,
          span: { start: expr.span.start, end: right.span.end },
        };
        continue;
      }
      break;
    }
    return expr;
  };

  const parseAdditive = (): ExpressionNode => {
    let expr = parseMultiplicative();
    while (true) {
      const token = peek();
      if (token.type === 'operator' && (token.value === '+' || token.value === '-')) {
        current += 1;
        const right = parseMultiplicative();
        expr = {
          type: 'BinaryExpression',
          operator: token.value as '+' | '-',
          left: expr,
          right,
          span: { start: expr.span.start, end: right.span.end },
        };
        continue;
      }
      break;
    }
    return expr;
  };

  const parseComparison = (): ExpressionNode => {
    let expr = parseAdditive();
    while (true) {
      const token = peek();
      if (
        token.type === 'operator' &&
        (token.value === '<' || token.value === '<=' || token.value === '>' || token.value === '>=')
      ) {
        current += 1;
        const right = parseAdditive();
        expr = {
          type: 'BinaryExpression',
          operator: token.value as '<' | '<=' | '>' | '>=',
          left: expr,
          right,
          span: { start: expr.span.start, end: right.span.end },
        };
        continue;
      }
      break;
    }
    return expr;
  };

  const parseEquality = (): ExpressionNode => {
    let expr = parseComparison();
    while (true) {
      const token = peek();
      if (token.type === 'operator' && (token.value === '==' || token.value === '!=')) {
        current += 1;
        const right = parseComparison();
        expr = {
          type: 'BinaryExpression',
          operator: token.value as '==' | '!=',
          left: expr,
          right,
          span: { start: expr.span.start, end: right.span.end },
        };
        continue;
      }
      break;
    }
    return expr;
  };

  const parseLogicalAnd = (): ExpressionNode => {
    let expr = parseEquality();
    while (checkOperator('&&')) {
      const right = parseEquality();
      expr = {
        type: 'BinaryExpression',
        operator: '&&',
        left: expr,
        right,
        span: { start: expr.span.start, end: right.span.end },
      };
    }
    return expr;
  };

  const parseLogicalOr = (): ExpressionNode => {
    let expr = parseLogicalAnd();
    while (checkOperator('||')) {
      const right = parseLogicalAnd();
      expr = {
        type: 'BinaryExpression',
        operator: '||',
        left: expr,
        right,
        span: { start: expr.span.start, end: right.span.end },
      };
    }
    return expr;
  };

  const expr = parseExpressionInner();
  const token = peek();
  if (token.type !== 'eof') {
    throw new MiniExprSyntaxError('Unexpected input after expression', token.span);
  }
  return expr;
}

export interface EvaluationContext {
  variables?: Record<string, MiniValue>;
  functions?: Record<string, (args: MiniValue[]) => MiniValue>;
  rng?: { nextInt(maxExclusive: number): number };
}

export interface CompiledExpression {
  source: string;
  ast: ExpressionNode;
}

export function compileExpression(source: string): CompiledExpression {
  return { source, ast: parseExpression(source) };
}

function asNumber(value: MiniValue, message: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  throw new MiniExprEvaluationError(message);
}

function asBoolean(value: MiniValue, message: string): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  throw new MiniExprEvaluationError(message);
}

const builtinFunctions: Record<
  string,
  (args: ExpressionNode[], evaluate: (expr: ExpressionNode) => MiniValue, context: EvaluationContext) => MiniValue
> = {
  IF(args, evaluate) {
    if (args.length !== 3) {
      throw new MiniExprEvaluationError('IF expects exactly three arguments');
    }
    const condition = evaluate(args[0]);
    const result = condition ? evaluate(args[1]) : evaluate(args[2]);
    return result as MiniValue;
  },
  MIN(args, evaluate) {
    if (args.length === 0) {
      throw new MiniExprEvaluationError('MIN expects at least one argument');
    }
    let min = Number.POSITIVE_INFINITY;
    for (const arg of args) {
      const value = asNumber(evaluate(arg), 'MIN arguments must be numbers');
      if (value < min) min = value;
    }
    return min;
  },
  MAX(args, evaluate) {
    if (args.length === 0) {
      throw new MiniExprEvaluationError('MAX expects at least one argument');
    }
    let max = Number.NEGATIVE_INFINITY;
    for (const arg of args) {
      const value = asNumber(evaluate(arg), 'MAX arguments must be numbers');
      if (value > max) max = value;
    }
    return max;
  },
  CLAMP(args, evaluate) {
    if (args.length !== 3) {
      throw new MiniExprEvaluationError('CLAMP expects exactly three arguments');
    }
    const value = asNumber(evaluate(args[0]), 'CLAMP value must be a number');
    const min = asNumber(evaluate(args[1]), 'CLAMP minimum must be a number');
    const max = asNumber(evaluate(args[2]), 'CLAMP maximum must be a number');
    if (min > max) {
      throw new MiniExprEvaluationError('CLAMP minimum cannot exceed maximum');
    }
    return Math.min(Math.max(value, min), max);
  },
  ABS(args, evaluate) {
    if (args.length !== 1) {
      throw new MiniExprEvaluationError('ABS expects exactly one argument');
    }
    return Math.abs(asNumber(evaluate(args[0]), 'ABS argument must be a number'));
  },
  FLOOR(args, evaluate) {
    if (args.length !== 1) {
      throw new MiniExprEvaluationError('FLOOR expects exactly one argument');
    }
    return Math.floor(asNumber(evaluate(args[0]), 'FLOOR argument must be a number'));
  },
  CEIL(args, evaluate) {
    if (args.length !== 1) {
      throw new MiniExprEvaluationError('CEIL expects exactly one argument');
    }
    return Math.ceil(asNumber(evaluate(args[0]), 'CEIL argument must be a number'));
  },
  ROUND(args, evaluate) {
    if (args.length < 1 || args.length > 2) {
      throw new MiniExprEvaluationError('ROUND expects one or two arguments');
    }
    const value = asNumber(evaluate(args[0]), 'ROUND value must be a number');
    if (args.length === 1) {
      return Math.round(value);
    }
    const precision = asNumber(evaluate(args[1]), 'ROUND precision must be a number');
    const factor = 10 ** precision;
    return Math.round(value * factor) / factor;
  },
  D6(args, evaluate, context) {
    const count = args.length === 0 ? 1 : asNumber(evaluate(args[0]), 'D6 argument must be a number');
    return rollDice(6, count, context);
  },
  D(args, evaluate, context) {
    if (args.length === 0) {
      throw new MiniExprEvaluationError('D expects at least one argument');
    }
    const sides = asNumber(evaluate(args[0]), 'D sides must be a number');
    const count = args.length > 1 ? asNumber(evaluate(args[1]), 'D count must be a number') : 1;
    return rollDice(sides, count, context);
  },
};

function rollDice(sides: number, count: number, context: EvaluationContext): number {
  if (!context.rng) {
    throw new MiniExprEvaluationError('Dice functions require an RNG in the evaluation context');
  }
  if (!Number.isInteger(sides) || sides < 1) {
    throw new MiniExprEvaluationError('Dice sides must be a positive integer');
  }
  if (!Number.isInteger(count) || count < 1) {
    throw new MiniExprEvaluationError('Dice count must be a positive integer');
  }
  let total = 0;
  for (let i = 0; i < count; i += 1) {
    const roll = context.rng.nextInt(sides) + 1;
    total += roll;
  }
  return total;
}

export function evaluateExpression(compiled: CompiledExpression, context: EvaluationContext = {}): MiniValue {
  const evaluateNode = (node: ExpressionNode): MiniValue => {
    switch (node.type) {
      case 'NumberLiteral':
        return node.value;
      case 'BooleanLiteral':
        return node.value;
      case 'NullLiteral':
        return null;
      case 'Identifier': {
        const variables = context.variables ?? {};
        if (!(node.name in variables)) {
          throw new MiniExprEvaluationError(`Unknown identifier '${node.name}'`);
        }
        return variables[node.name] as MiniValue;
      }
      case 'UnaryExpression': {
        const argument = evaluateNode(node.argument);
        if (node.operator === '!') {
          return !asBoolean(argument, 'Logical not expects a boolean operand');
        }
        return -asNumber(argument, 'Unary minus expects a numeric operand');
      }
      case 'BinaryExpression': {
        switch (node.operator) {
          case '||': {
            const left = evaluateNode(node.left);
            if (left) return true;
            const right = evaluateNode(node.right);
            return Boolean(right);
          }
          case '&&': {
            const left = evaluateNode(node.left);
            if (!left) return false;
            const right = evaluateNode(node.right);
            return Boolean(right);
          }
          case '==': {
            const left = evaluateNode(node.left);
            const right = evaluateNode(node.right);
            return left === right;
          }
          case '!=': {
            const left = evaluateNode(node.left);
            const right = evaluateNode(node.right);
            return left !== right;
          }
          case '<':
          case '<=':
          case '>':
          case '>=': {
            const left = asNumber(evaluateNode(node.left), 'Comparison operands must be numbers');
            const right = asNumber(evaluateNode(node.right), 'Comparison operands must be numbers');
            switch (node.operator) {
              case '<':
                return left < right;
              case '<=':
                return left <= right;
              case '>':
                return left > right;
              case '>=':
                return left >= right;
            }
            break;
          }
          case '+': {
            const left = asNumber(evaluateNode(node.left), 'Addition operands must be numbers');
            const right = asNumber(evaluateNode(node.right), 'Addition operands must be numbers');
            return left + right;
          }
          case '-': {
            const left = asNumber(evaluateNode(node.left), 'Subtraction operands must be numbers');
            const right = asNumber(evaluateNode(node.right), 'Subtraction operands must be numbers');
            return left - right;
          }
          case '*': {
            const left = asNumber(evaluateNode(node.left), 'Multiplication operands must be numbers');
            const right = asNumber(evaluateNode(node.right), 'Multiplication operands must be numbers');
            return left * right;
          }
          case '/': {
            const left = asNumber(evaluateNode(node.left), 'Division operands must be numbers');
            const right = asNumber(evaluateNode(node.right), 'Division operands must be numbers');
            if (right === 0) {
              throw new MiniExprEvaluationError('Division by zero');
            }
            return left / right;
          }
          case '%': {
            const left = asNumber(evaluateNode(node.left), 'Modulo operands must be numbers');
            const right = asNumber(evaluateNode(node.right), 'Modulo operands must be numbers');
            if (right === 0) {
              throw new MiniExprEvaluationError('Modulo by zero');
            }
            return left % right;
          }
          case '^': {
            const left = asNumber(evaluateNode(node.left), 'Exponentiation operands must be numbers');
            const right = asNumber(evaluateNode(node.right), 'Exponentiation operands must be numbers');
            return left ** right;
          }
        }
        throw new MiniExprEvaluationError(`Unsupported operator '${node.operator}'`);
      }
      case 'CallExpression': {
        const userHandler = context.functions?.[node.callee.name];
        if (userHandler) {
          const values = node.arguments.map((arg) => evaluateNode(arg));
          return userHandler(values);
        }
        const builtin = builtinFunctions[node.callee.name];
        if (!builtin) {
          throw new MiniExprEvaluationError(`Unknown function '${node.callee.name}'`);
        }
        return builtin(node.arguments, evaluateNode, context);
      }
      default:
        throw new MiniExprEvaluationError('Unsupported expression node');
    }
  };

  return evaluateNode(compiled.ast);
}

export function listIdentifiers(node: ExpressionNode, identifiers: Set<string> = new Set()): Set<string> {
  switch (node.type) {
    case 'Identifier':
      identifiers.add(node.name);
      break;
    case 'UnaryExpression':
      listIdentifiers(node.argument, identifiers);
      break;
    case 'BinaryExpression':
      listIdentifiers(node.left, identifiers);
      listIdentifiers(node.right, identifiers);
      break;
    case 'CallExpression':
      node.arguments.forEach((arg) => listIdentifiers(arg, identifiers));
      break;
    default:
      break;
  }
  return identifiers;
}
