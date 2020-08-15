import { Signer, providers } from 'ethers';
import { Contract } from '@crestproject/crestproject';
import * as contracts from './contracts';

export interface Token {
  name: string;
  symbol: string;
  decimals: number;
}

export type ContractConstructor<TContract extends Contract> = (
  config: DeploymentConfig,
  deployment: PendingDeployment,
) => Promise<TContract>;

export interface DeploymentConfig {
  deployer: Signer;
  owners: {
    mgm: string;
    mtc: string;
  };
  constructors?: Partial<ContractConstructors>;
}

export type ResolvePromise<T> = T extends Promise<infer R> ? R : T;
export type PendingDeployment = {
  [TKey in keyof ContractConstructors]: ReturnType<ContractConstructors[TKey]>;
};

export type Deployment = {
  [TKey in keyof PendingDeployment]: ResolvePromise<PendingDeployment[TKey]>;
};

export interface ContractConstructors {
  persistentTopLevel: ContractConstructor<contracts.PersistentTopLevel>;
}

const constructors: ContractConstructors = {
  persistentTopLevel: (config) => {
    return contracts.PersistentTopLevel.deploy(
      config.deployer,
      config.owners.mtc,
      config.owners.mgm,
    );
  },
};

export function createDeployment(config: DeploymentConfig) {
  function deploy<TKey extends keyof ContractConstructors>(
    name: TKey,
    deployment: PendingDeployment,
  ): ReturnType<ContractConstructors[TKey]> {
    const ctor = config.constructors?.[name] ?? constructors[name];
    return ctor(config, deployment) as ReturnType<ContractConstructors[TKey]>;
  }

  const deployment = {} as PendingDeployment;
  const proxy = new Proxy(deployment, {
    ownKeys: () => Object.keys(constructors),
    get: (target, prop, receiver) => {
      // TODO: Prevent recursive dependencies?
      if (constructors.hasOwnProperty(prop) && !Reflect.has(target, prop)) {
        const promise = deploy(prop as any, proxy);
        Reflect.set(target, prop, promise, receiver);
      }

      return Reflect.get(target, prop, receiver);
    },
  });

  return proxy;
}

export async function resolveDeployment(pending: PendingDeployment) {
  const keys = Object.getOwnPropertyNames(pending);
  const deployed = await Promise.all(
    keys.map((contract: any) => (pending as any)[contract]),
  );

  const deployment = keys.reduce((carry, current, index) => {
    return { ...carry, [current]: deployed[index] };
  }, {} as Deployment);

  return deployment;
}

export async function deployProtocol(config: DeploymentConfig) {
  const pending = createDeployment(config);
  const deployment = await resolveDeployment(pending);

  return deployment;
}

export async function defaultTestConfig(
  provider: providers.JsonRpcProvider,
): Promise<DeploymentConfig> {
  const accounts = await provider.listAccounts();
  const [deployerAddress, mtcAddress, mgmAddress] = accounts;

  const deployer = provider.getSigner(deployerAddress);

  return {
    deployer,
    owners: {
      mgm: mgmAddress,
      mtc: mtcAddress,
    },
  };
}
