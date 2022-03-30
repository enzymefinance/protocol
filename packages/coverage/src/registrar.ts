/* eslint-disable @typescript-eslint/no-non-null-assertion */

import type {
  Expression,
  FunctionDefinition,
  IfStatement,
  ModifierDefinition,
  Statement,
} from '@solidity-parser/parser/dist/src/ast-types';

import type { Injection } from './injector';
import type { ParseState } from './parser';

/**
 * Adds injection point to injection points map
 */
export function createInjection(state: ParseState, key: number, value: Partial<Injection>) {
  const injection = {
    ...value,
    contract: state.contract,
  } as Injection;

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (state.injections[key]) {
    state.injections[key].push(injection);
  } else {
    state.injections[key] = [injection];
  }
}

/**
 * Registers injections for statement measurements
 */
export function registerStatement(state: ParseState, expression: Expression | Statement) {
  const startContract = state.source.slice(0, expression.range![0]);
  const startline = (startContract.match(/\n/g) || []).length + 1;
  const startcol = expression.range![0] - startContract.lastIndexOf('\n') - 1;

  const expressionContent = state.source.slice(expression.range![0], expression.range![1] + 1);
  const endline = startline + (expressionContent.match(/\n/g) || []).length;

  let endcol;

  if (expressionContent.lastIndexOf('\n') >= 0) {
    endcol = state.source.slice(expressionContent.lastIndexOf('\n'), expression.range![1]).length;
  } else {
    endcol = startcol + expressionContent.length + 1;
  }

  const id =
    state.statements.push({
      end: {
        column: endcol,
        line: endline,
      },
      start: {
        column: startcol,
        line: startline,
      },
    }) - 1;

  createInjection(state, expression.range![0], {
    id,
    type: 'Statement',
  });
}

/**
 * Registers injections for function measurements
 */
export function registerFunction(state: ParseState, expression: FunctionDefinition | ModifierDefinition) {
  const name =
    expression.type === 'FunctionDefinition' && expression.isConstructor ? 'constructor' : expression.name ?? '';

  // TODO: The `Location` type is wrongly typed in solidty-parser.
  const id =
    state.functions.push({
      decl: {
        end: (expression.body!.loc! as any).start,
        start: (expression.loc! as any).start,
      },
      line: (expression.loc! as any).start.line,
      loc: expression.loc! as any,
      name,
    }) - 1;

  createInjection(state, expression.body!.range![0] + 1, {
    id,
    type: 'Function',
  });
}

export function registerBranch(state: ParseState, expression: IfStatement) {
  const startContract = state.source.slice(0, expression.range![0]);
  const startline = (startContract.match(/\n/g) || []).length + 1;
  const startcol = expression.range![0] - startContract.lastIndexOf('\n') - 1;
  const loc = {
    end: {
      column: startcol,
      line: startline,
    },
    start: {
      column: startcol,
      line: startline,
    },
  };

  const id =
    state.branches.push({
      line: startline,
      loc,
      locations: [],
      type: 'if',
    }) - 1;

  return id;
}

export function registerBranchLocation(state: ParseState, expression: Statement) {
  const branch = state.branches[state.branch!].locations.length;
  const point = expression.range![0] + (expression.type === 'Block' ? 1 : 0);

  createInjection(state, point, {
    branch,
    id: state.branch!,
    type: 'Branch',
  });

  // TODO: The `Location` type is wrongly typed in solidty-parser.
  state.branches[state.branch!].locations.push(expression.loc! as any);
}
