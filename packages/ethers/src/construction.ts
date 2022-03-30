import type { JsonFragment } from '@ethersproject/abi';
import type { providers, Signer, utils } from 'ethers';
import { constants } from 'ethers';

import { Contract, deploy } from './contract';
import type { FunctionOptions } from './function';
import type { MockContract } from './mock';
import { mock } from './mock';
import type { AddressLike } from './types';
import { ensureInterface } from './utils/ensureInterface';

export interface SolidityCompilerOutput {
  abi: JsonFragment[];
  bytecode?: string;
}

export interface ContractFactory<TContract extends Contract = Contract, TConstructorArgs extends any[] = []> {
  abi: utils.Interface;
  mock: (signer: Signer) => Promise<MockContract<TContract>>;
  deploy: ((signer: Signer, ...args: TConstructorArgs) => Promise<TContract>) &
    ((signer: Signer, options: FunctionOptions<TConstructorArgs>) => Promise<TContract>);
  new (address: AddressLike, provider: providers.Provider | Signer): TContract;
}

// Expose a default contract factory for convenience.
export function contract<TContract extends Contract = Contract, TConstructorArgs extends any[] = never>(
  bytecode?: string,
) {
  return (signatures: TemplateStringsArray) => {
    let resolved: utils.Interface;

    class SpecializedContract extends Contract<TContract> {
      public static get bytecode() {
        return bytecode;
      }

      public static get abi() {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition,eqeqeq
        if (resolved == null) {
          const abi = signatures
            .join('')
            .trim()
            .split('\n')
            .map((item) => item.trim());

          resolved = ensureInterface(abi);
        }

        return resolved;
      }

      public static async deploy(signer: Signer, ...args: TConstructorArgs) {
        const address = constants.AddressZero;
        const contract = new SpecializedContract(address, signer) as TContract;
        const receipt = await deploy(contract, bytecode ?? '0x', ...args);
        const instance = contract.attach(receipt.contractAddress);

        instance.deployment = receipt;

        return instance;
      }

      public static mock(signer: Signer) {
        const address = constants.AddressZero;
        const contract = new SpecializedContract(address, signer) as TContract;

        return mock(contract);
      }

      constructor(address: AddressLike, provider: providers.Provider | Signer) {
        super(SpecializedContract.abi, address, provider);
      }

      public clone(address: AddressLike, provider: providers.Provider | Signer): TContract {
        return new SpecializedContract(address, provider) as TContract;
      }
    }

    return SpecializedContract as any as ContractFactory<TContract, TConstructorArgs>;
  };
}
