/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { utils } from 'ethers';
import { v4 as uuid } from 'uuid';

import type { ParseResult } from './parser';

export interface InstrumentationBase {
  type: string;
  id: number;
  target: string;
}

export interface StatementInstrumentation extends InstrumentationBase {
  type: 'statement';
}

export interface BranchInstrumentation extends InstrumentationBase {
  type: 'branch';
  branch: number;
}

export interface FunctionInstrumentation extends InstrumentationBase {
  type: 'function';
}

export type Instrumentation = BranchInstrumentation | FunctionInstrumentation | StatementInstrumentation;

export interface InjectionBase {
  type: string;
  contract: string;
}

export interface HashMethodInjection extends InjectionBase {
  type: 'HashMethod';
}

export interface FunctionInjection extends InjectionBase {
  type: 'Function';
  id: number;
}

export interface StatementInjection extends InjectionBase {
  type: 'Statement';
  id: number;
}

export interface BranchInjection extends InjectionBase {
  type: 'Branch';
  id: number;
  branch: number;
}

export enum BlockDelimiter {
  OPEN = '{',
  CLOSE = '}',
}

export interface BlockDelimiterInjection extends InjectionBase {
  type: 'BlockDelimiter';
  delimiter: BlockDelimiter;
}

export type InstrumentationInjection = BranchInjection | FunctionInjection | StatementInjection;
export type Injection = BlockDelimiterInjection | HashMethodInjection | InstrumentationInjection;

export interface InstrumentationTarget extends ParseResult {
  target: string;
  instrumented: string;
  instrumentations: Record<string, Instrumentation>;
}

export function inject(parsed: ParseResult, path: string) {
  const state: InstrumentationTarget = {
    ...parsed,
    instrumentations: {},
    instrumented: parsed.source,
    target: path,
  };

  const points = (Object.keys(state.injections) as any as number[]).sort((a, b) => b - a);

  points.forEach((point) => {
    state.injections[point].forEach((injection) => {
      switch (injection.type) {
        case 'Statement':
          return injectStatement(state, point, injection);
        case 'Function':
          return injectFunction(state, point, injection);
        case 'Branch':
          return injectBranch(state, point, injection);
        case 'HashMethod':
          return injectHashMethod(state, point, injection);
        case 'BlockDelimiter':
          return injectBlockDelimiter(state, point, injection);
      }
    });
  });

  return state;
}

function split(state: InstrumentationTarget, point: number) {
  return {
    end: state.instrumented.slice(point),
    start: state.instrumented.slice(0, point),
  };
}

function getHash(id: string) {
  return utils.id(`${id}:${uuid()}`);
}

function getMethodIdentifier(id: string) {
  return `c_${utils.id(id).slice(0, 10)}`;
}

function getHashMethodDefinition(id: string) {
  const hash = utils.id(id).slice(0, 10);
  const method = getMethodIdentifier(id);

  return `function ${method}(bytes32 c__${hash}) private pure {} /* hash method */`;
}

function getInjectable(id: string, hash: string, type: string) {
  return `${getMethodIdentifier(id)}(${hash});/* ${type} */`;
}

function getInjectionComponents(state: InstrumentationTarget, point: number, id: string, type: string) {
  const { start, end } = split(state, point);
  const hash = getHash(id);
  const injectable = getInjectable(id, hash, type);

  return {
    end,
    hash,
    injectable,
    start,
  };
}

function injectStatement(state: InstrumentationTarget, point: number, injection: StatementInjection) {
  const type = `statement(${injection.id})`;
  const id = `${state.target}:${injection.contract}`;

  const { start, end, hash, injectable } = getInjectionComponents(state, point, id, type);

  state.instrumentations[hash] = {
    id: injection.id!,
    target: state.target,
    type: 'statement',
  };

  state.instrumented = `${start}${injectable}${end}`;
}

function injectFunction(state: InstrumentationTarget, point: number, injection: FunctionInjection) {
  const label = `function(${injection.id})`;
  const id = `${state.target}:${injection.contract}`;

  const { start, end, hash, injectable } = getInjectionComponents(state, point, id, label);

  state.instrumentations[hash] = {
    id: injection.id!,
    target: state.target,
    type: 'function',
  };

  state.instrumented = `${start}${injectable}${end}`;
}

function injectBranch(state: InstrumentationTarget, point: number, injection: BranchInjection) {
  const label = `branch(${injection.id}:${injection.branch})`;
  const id = `${state.target}:${injection.contract}`;

  const { start, end, hash, injectable } = getInjectionComponents(state, point, id, label);

  state.instrumentations[hash] = {
    branch: injection.branch,
    id: injection.id!,
    target: state.target,
    type: 'branch',
  };

  state.instrumented = `${start}${injectable}${end}`;
}

function injectHashMethod(state: InstrumentationTarget, point: number, injection: HashMethodInjection) {
  const { start, end } = split(state, point);
  const id = `${state.target}:${injection.contract}`;

  state.instrumented = `${start}${getHashMethodDefinition(id)}${end}`;
}

function injectBlockDelimiter(state: InstrumentationTarget, point: number, injection: BlockDelimiterInjection) {
  const { start, end } = split(state, point);

  state.instrumented = `${start}${injection.delimiter}${end}`;
}
