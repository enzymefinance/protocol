import { SignerWithAddress } from '@enzymefinance/hardhat';
import { Dispatcher } from '@enzymefinance/protocol';
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
