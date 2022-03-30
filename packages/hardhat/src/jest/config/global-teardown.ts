import { mergeCoverageReports } from '@enzymefinance/coverage';
import type { Config } from '@jest/types';
import fs from 'fs-extra';
import glob from 'glob';
import Reporter from 'istanbul-lib-report';
import Reports from 'istanbul-reports';
import path from 'path';

export default async (config: Config.GlobalConfig) => {
  if (!process.env.__HARDHAT_COVERAGE_TEMPDIR__) {
    return;
  }

  const tmp = process.env.__HARDHAT_COVERAGE_TEMPDIR__ as string;

  if (!(await fs.pathExists(tmp))) {
    return;
  }

  const files = glob.sync(path.join(tmp, '*.json'));
  const outputs = await Promise.all(files.map((file) => fs.readJson(file)));

  if (!outputs.length) {
    return;
  }

  const unique = outputs.map((item) => item.metadata).filter((item, index, array) => array.indexOf(item) === index);

  if (unique.length !== 1) {
    throw new Error('Mismatching code coverage metadata');
  }

  // Retrieve the metadata and flatten & merge the hits from all emitted outputs.
  const metadata = await fs.readJson(unique[0]);
  const hits = outputs.reduce<Record<string, number>>((carry, current) => {
    Object.entries(current.hits).forEach(([hash, hits]) => {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      carry[hash] = (carry[hash] ?? 0) + (hits as number);
    });

    return carry;
  }, {});

  const coverage = mergeCoverageReports(hits, metadata);
  const context = Reporter.createContext({
    coverageMap: coverage,
    dir: config.coverageDirectory,
    watermarks: {
      branches: [50, 80],
      functions: [50, 80],
      lines: [50, 80],
      statements: [50, 80],
    },
  });

  config.coverageReporters.forEach((reporter) => {
    const report = Reports.create(reporter as any);

    (report as any).execute(context);
  });

  await fs.emptyDir(tmp);
};
