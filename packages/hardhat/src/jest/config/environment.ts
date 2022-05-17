import { createCoverageCollector } from '@enzymefinance/coverage';
import deepmerge from 'deepmerge';
import type { EventEmitter } from 'events';
import fs from 'fs-extra';
import { HARDHAT_NETWORK_NAME } from 'hardhat/internal/constants';
import { HardhatContext } from 'hardhat/internal/context';
import { loadConfigAndTasks } from 'hardhat/internal/core/config/config-loading';
import { getEnvHardhatArguments } from 'hardhat/internal/core/params/env-variables';
import { HARDHAT_PARAM_DEFINITIONS } from 'hardhat/internal/core/params/hardhat-params';
import { Environment } from 'hardhat/internal/core/runtime-environment';
import { loadTsNode, willRunWithTypescript } from 'hardhat/internal/core/typescript-support';
import type { EthereumProvider, HardhatArguments, HardhatRuntimeEnvironment } from 'hardhat/types';
import NodeEnvironment from 'jest-environment-node';
import path from 'path';
import { v4 as uuid } from 'uuid';

import { EthereumTestnetProvider } from '../../provider';

export interface EnzymeHardhatEnvironmentOptions {
  history: boolean;
  coverage: boolean;
}

const defaults = {
  coverage: false,
  history: true,
};

export default class EnzymeHardhatEnvironment extends NodeEnvironment {
  private metadataFilePath = '';
  private tempDir = '';
  private codeCoverageRuntimeRecording: Record<string, number> = {};
  private recordCodeCoverage = false;
  private recordCallHistory = true;
  private runtimeEnvironment: HardhatRuntimeEnvironment;

  private removeCallHistoryListener?: () => void;
  private removeCodeCoverageListener?: () => void;

  constructor(config: any) {
    super(config);

    const options: EnzymeHardhatEnvironmentOptions = deepmerge(defaults, config.testEnvironmentOptions);

    this.recordCodeCoverage = options.coverage;
    this.recordCallHistory = options.history;

    this.tempDir = process.env.__HARDHAT_COVERAGE_TEMPDIR__ ?? '';

    if (this.recordCodeCoverage && !this.tempDir) {
      throw new Error('Missing shared temporary directory for code coverage data collection');
    }

    this.runtimeEnvironment = getRuntimeEnvironment(this.recordCodeCoverage);
    this.metadataFilePath = path.join((this.runtimeEnvironment.config as any).codeCoverage.path, 'metadata.json');
  }

  async setup() {
    await super.setup();

    const env = this.runtimeEnvironment;
    const provider = new EthereumTestnetProvider(env);

    this.global.hre = env;
    this.global.provider = provider;
    this.global.coverage = !!this.recordCodeCoverage;

    // Re-route call history recording to whatever is the currently
    // active history object. Required for making history and snapshoting
    // work nicely together.
    if (this.recordCallHistory) {
      this.removeCallHistoryListener = addListener(env.network.provider, 'beforeMessage', (message) => {
        provider.history.record(message);
      });
    }

    if (this.recordCodeCoverage) {
      const metadata = await fs.readJson(this.metadataFilePath);
      const collector = createCoverageCollector(metadata, this.codeCoverageRuntimeRecording);

      this.removeCodeCoverageListener = addListener(env.network.provider, 'step', collector);
    }
  }

  async teardown() {
    this.removeCodeCoverageListener?.();
    this.removeCallHistoryListener?.();

    if (this.recordCodeCoverage && Object.keys(this.codeCoverageRuntimeRecording).length) {
      const file = path.join(this.tempDir, `${uuid()}.json`);
      const output = {
        hits: this.codeCoverageRuntimeRecording,
        metadata: this.metadataFilePath,
      };

      await fs.outputJson(file, output, {
        spaces: 2,
      });
    }

    await super.teardown();
  }
}

let environment: HardhatRuntimeEnvironment;

export function getRuntimeEnvironment(coverage = false) {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition,eqeqeq
  if (environment != null) {
    return environment;
  }

  if (HardhatContext.isCreated()) {
    HardhatContext.deleteHardhatContext();
  }

  const context = HardhatContext.createHardhatContext();
  const args = deepmerge<HardhatArguments>(getEnvHardhatArguments(HARDHAT_PARAM_DEFINITIONS, process.env), {
    emoji: false,
    help: false,
    network: HARDHAT_NETWORK_NAME,
    version: false,
  });

  if (willRunWithTypescript(args.config)) {
    loadTsNode();
  }

  const config = loadConfigAndTasks(args);

  if (coverage) {
    // Allow contracts of any size during code coverage reporting.
    config.networks[HARDHAT_NETWORK_NAME].allowUnlimitedContractSize = true;
  }

  const extenders = context.extendersManager.getExtenders();

  environment = new Environment(config, args, {}, extenders) as unknown as HardhatRuntimeEnvironment;
  context.setHardhatRuntimeEnvironment(environment);

  return environment;
}

export function addListener(provider: EthereumProvider, event: string, handler: (...args: any) => void) {
  let inner: any = (provider as any)._provider;

  while (inner._wrapped) {
    inner = (inner as any)._wrapped;
  }

  const init = inner._init.bind(inner);

  let subscribed = false;
  let removed = false;

  inner._init = async () => {
    await init();

    if (!subscribed && !removed) {
      subscribed = true;
      const vm = inner._node._vm as EventEmitter;

      vm.on(event, handler);
    }
  };

  return () => {
    if (removed) {
      return;
    }

    removed = true;
    const vm = (inner as any)._node?._vm as EventEmitter;

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition,eqeqeq
    if (vm != null) {
      vm.off(event, handler);
    }
  };
}
