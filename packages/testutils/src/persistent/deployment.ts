import { Signer } from 'ethers';
import { Dispatcher } from '@melonproject/protocol';
import { describeDeployment } from '../utils';

export interface PersistentDeploymentConfig {
  deployer: Signer;
}

export interface PersistentDeploymentOutput {
  dispatcher: Promise<Dispatcher>;
}

export const deployPersistent = describeDeployment<
  PersistentDeploymentConfig,
  PersistentDeploymentOutput
>({
  dispatcher(config) {
    return Dispatcher.deploy(config.deployer);
  },
});
