import type { BranchMapping, FunctionMapping, Range } from 'istanbul-lib-coverage';

import type { Instrumentation, InstrumentationTarget } from './injector';
import { inject } from './injector';
import { parse } from './parser';

export interface InstrumentationMetadata {
  targets: Record<string, InstrumentationMetadataTarget>;
  instrumentations: Record<string, Instrumentation>;
}

export interface InstrumentationMetadataTarget {
  path: string;
  functions: FunctionMapping[];
  branches: BranchMapping[];
  statements: Range[];
}

export interface InstrumentedSources {
  instrumented: Record<string, InstrumentationTarget>;
  metadata: InstrumentationMetadata;
}

export function instrumentSource(source: string, file: string) {
  const parsed = parse(source);

  return inject(parsed, file);
}

export function instrumentSources(sources: Record<string, string>) {
  const instrumented = Object.entries(sources).reduce<Record<string, InstrumentationTarget>>(
    (carry, [path, source]) => {
      const instrumented = instrumentSource(source, path);

      return { ...carry, [path]: instrumented };
    },
    {},
  );

  const metadata = Object.entries(instrumented).reduce<InstrumentationMetadata>(
    (carry, [path, instrumented]) => {
      // Ignore metadata for all files with no instrumentation (e.g. interfaces).
      if (Object.keys(instrumented.instrumentations).length === 0) {
        return carry;
      }

      carry.instrumentations = {
        ...carry.instrumentations,
        ...instrumented.instrumentations,
      };

      carry.targets[path] = {
        branches: instrumented.branches,
        functions: instrumented.functions,
        path,
        statements: instrumented.statements,
      };

      return carry;
    },
    {
      instrumentations: {},
      targets: {},
    },
  );

  return { instrumented, metadata };
}
