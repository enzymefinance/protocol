import { Dispatcher } from '@melonproject/protocol';
import { SignerWithAddress } from '@crestproject/crestproject';
import { describeDeployment } from '../deployment';

export interface PersistentDeploymentConfig {
  deployer: SignerWithAddress;
}

export interface PersistentDeploymentOutput {
  dispatcher: Promise<Dispatcher>;
}

export const deployPersistent = describeDeployment<PersistentDeploymentConfig, PersistentDeploymentOutput>({
  dispatcher(config) {
    return Dispatcher.deploy(config.deployer);
  },
});
