import { instrumentSources } from '@enzymefinance/coverage';
import deepmerge from 'deepmerge';
import fs from 'fs-extra';
import glob from 'glob';
import { extendConfig, task } from 'hardhat/config';
import path from 'path';

import { regexOrString, validateDir } from '../utils';
import type { CodeCoverageConfig } from './types';

export * from './types';

extendConfig((config, userConfig) => {
  const defaults: CodeCoverageConfig = {
    clear: true,
    exclude: [],
    include: [],
    path: path.resolve(config.paths.cache, './coverage'),
  };

  const provided = userConfig.codeCoverage ?? {};

  config.codeCoverage = deepmerge<CodeCoverageConfig>(defaults, provided as any);
  config.codeCoverage.path = validateDir(config.paths.root, config.codeCoverage.path);

  config.codeCoverage.include = config.codeCoverage.include.map((item) => {
    return regexOrString(item);
  });

  config.codeCoverage.exclude = config.codeCoverage.exclude.map((item) => {
    return regexOrString(item);
  });
});

interface Arguments {
  force: boolean;
}

const description = 'Add code coverage instrumentations statements during compilation';

task<Arguments>('coverage', description, async (args, env) => {
  const config = env.config.codeCoverage;
  const dir = path.resolve(config.path, 'contracts');
  const files = glob.sync('**/*.sol', {
    cwd: env.config.paths.sources,
  });

  // First, grab alles files and their source and target locations.
  const sources = await Promise.all(
    files.map(async (file) => {
      const name = path.basename(file, '.sol');
      const origin = path.resolve(env.config.paths.sources, file);
      const destination = path.resolve(dir, file);
      const source = await fs.readFile(origin, 'utf8');

      const included = config.include.length
        ? config.include.some((rule) => name.match(rule) || file.match(rule))
        : true;

      const excluded = config.exclude.length
        ? config.exclude.some((rule) => name.match(rule) || file.match(rule))
        : false;

      const instrument = included && !excluded;

      return {
        destination,
        instrument,
        origin,
        source,
      };
    }),
  );

  // Then create the instrumentation metadata for all matched files.
  const instrumentation = instrumentSources(
    sources.reduce<Record<string, string>>((carry, current) => {
      if (!current.instrument) {
        return carry;
      }

      return { ...carry, [current.origin]: current.source };
    }, {}),
  );

  // Prepare the temporary instrumentation source & metadata directory.
  if (config.clear && (await fs.pathExists(config.path))) {
    await fs.remove(config.path);
  }

  // Save each file's instrumented source (or original source if excluded).
  await Promise.all(
    sources.map((file) => {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      const output = instrumentation.instrumented[file.origin].instrumented ?? file.source;

      return fs.outputFile(file.destination, output, 'utf8');
    }),
  );

  // Save the metadata for runtime hit collection.
  await fs.outputJson(path.resolve(config.path, 'metadata.json'), instrumentation.metadata, {
    spaces: 2,
  });

  // Move the original compilation cache file out of harms way.
  const cache = path.join(env.config.paths.cache, 'solidity-files-cache.json');

  if (await fs.pathExists(cache)) {
    await fs.move(cache, `${cache}.bkp`, {
      overwrite: true,
    });
  }

  // Override the contract source path & compiler config for the `compile` task.
  const originalSources = env.config.paths.sources;
  const originalCompilers = env.config.solidity.compilers;
  const clonedCompilers = JSON.parse(JSON.stringify(originalCompilers)) as typeof originalCompilers;

  env.config.paths.sources = dir;
  env.config.solidity.compilers = clonedCompilers.map((item) => {
    if (item.settings?.optimizer?.enabled) {
      item.settings.optimizer.enabled = false;
    }

    return item;
  });

  await env.run('compile', args);

  env.config.paths.sources = originalSources;

  // Restore the original compilation cache file.
  if (await fs.pathExists(`${cache}.bkp`)) {
    await fs.move(`${cache}.bkp`, cache, {
      overwrite: true,
    });
  }
}).addFlag('force', 'Force compilation ignoring cache');
