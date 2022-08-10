import type { EnvironmentContext, JestEnvironmentConfig } from '@jest/environment';
import type { EventEmitter } from 'events';
import { HARDHAT_NETWORK_NAME } from 'hardhat/internal/constants';
import { HardhatContext } from 'hardhat/internal/context';
import { loadConfigAndTasks } from 'hardhat/internal/core/config/config-loading';
import { getEnvHardhatArguments } from 'hardhat/internal/core/params/env-variables';
import { HARDHAT_PARAM_DEFINITIONS } from 'hardhat/internal/core/params/hardhat-params';
import { Environment } from 'hardhat/internal/core/runtime-environment';
import { loadTsNode, willRunWithTypescript } from 'hardhat/internal/core/typescript-support';
import type { EthereumProvider, HardhatArguments, HardhatRuntimeEnvironment } from 'hardhat/types';
import NodeEnvironment from 'jest-environment-node';

import { EthereumTestnetProvider } from './tests/utils/jest/environment';

export default class EnzymeHardhatEnvironment extends NodeEnvironment {
  private runtimeEnvironment: HardhatRuntimeEnvironment;
  private removeCallHistoryListener?: () => void;

  constructor(config: JestEnvironmentConfig, context: EnvironmentContext) {
    super(config, context);

    this.runtimeEnvironment = getRuntimeEnvironment();
  }

  async setup() {
    await super.setup();

    const env = this.runtimeEnvironment;
    const provider = new EthereumTestnetProvider(env);

    this.global.hre = env;
    this.global.provider = provider;

    // Re-route call history recording to whatever is the currently
    // active history object. Required for making history and snapshoting
    // work nicely together.
    this.removeCallHistoryListener = addListener(env.network.provider, 'beforeMessage', (message) => {
      provider.history.record(message);
    });
  }

  async teardown() {
    this.removeCallHistoryListener?.();

    await super.teardown();
  }
}

let environment: HardhatRuntimeEnvironment;

export function getRuntimeEnvironment() {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition,eqeqeq
  if (environment != null) {
    return environment;
  }

  if (HardhatContext.isCreated()) {
    HardhatContext.deleteHardhatContext();
  }

  const context = HardhatContext.createHardhatContext();
  const args = <HardhatArguments>(getEnvHardhatArguments(HARDHAT_PARAM_DEFINITIONS, process.env),
  {
    emoji: false,
    help: false,
    network: HARDHAT_NETWORK_NAME,
    version: false,
  });

  if (willRunWithTypescript(args.config)) {
    loadTsNode();
  }

  const config = loadConfigAndTasks(args);
  const extenders = context.extendersManager.getExtenders();

  environment = new Environment(config.resolvedConfig, args, {}, extenders) as unknown as HardhatRuntimeEnvironment;
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
