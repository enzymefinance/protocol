import type { FunctionFragment, Interface } from '@ethersproject/abi';
import { providers, Signer, utils } from 'ethers';

import type { ContractReceipt } from './function';
import { CallFunction, ConstructorFunction, ContractFunction, resolveFunctionOptions, SendFunction } from './function';
import type { AddressLike } from './types';
import type { PossibleInterface } from './utils/ensureInterface';
import { ensureInterface } from './utils/ensureInterface';
import { resolveAddress } from './utils/resolveAddress';

export function deploy<TContract extends Contract = Contract, TArgs extends any[] = any>(
  contract: TContract,
  bytecode: string,
  ...args: TArgs
): Promise<ContractReceipt<ConstructorFunction<TArgs, TContract>>> {
  const options = resolveFunctionOptions(...args);
  const constructor = contract.abi.deploy;
  const fn = new ConstructorFunction<TArgs, TContract>(contract, constructor, options);

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const hex = utils.hexlify(bytecode ?? '', {
    allowMissingPrefix: true,
  });

  return fn.bytecode(hex).send();
}

// TODO: Add types and proxies for event handling.
export class Contract<TContract extends Contract = any> {
  public readonly address: string;
  public readonly abi: Interface;
  public deployment?: ContractReceipt<ConstructorFunction<any, TContract>>;

  public readonly __TYPE__?: string = 'CONTRACT';
  public static isContract(contract: any): contract is Contract {
    return contract?.__TYPE__ === 'CONTRACT';
  }

  private readonly _signer?: Signer = undefined;
  public get signer() {
    return this._signer;
  }

  private readonly _provider?: providers.Provider = undefined;
  public get provider() {
    const provider = this._provider ?? this.signer?.provider;

    if (!provider) {
      throw new Error('Missing provider');
    }

    return provider;
  }

  constructor(abi: Interface | PossibleInterface, address: AddressLike, provider: providers.Provider | Signer) {
    this.address = resolveAddress(address);
    this.abi = ensureInterface(abi);
    if (Signer.isSigner(provider)) {
      this._signer = provider;
    } else if (providers.Provider.isProvider(provider)) {
      this._provider = provider;
    } else {
      throw new Error('Missing provider');
    }

    const names = Object.values(this.abi.functions).reduce<Record<string, FunctionFragment>>((carry, current) => {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!carry[current.name]) {
        carry[current.name] = current;
      }

      return carry;
    }, {});

    return new Proxy(this, {
      get: (target, prop: string, receiver) => {
        if (Reflect.has(target, prop)) {
          return Reflect.get(target, prop, receiver);
        }

        // Do not attempt to call `getFunction` for non-signatures.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (typeof prop !== 'string' || (!names[prop] && !prop.includes('('))) {
          return;
        }

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        const fragment = names[prop] ?? target.abi.getFunction(prop);
        const instance = ContractFunction.create(target, fragment);

        // eslint-disable-next-line @typescript-eslint/no-empty-function
        return new Proxy(() => {}, {
          apply: (_, __, args) => {
            // eslint-disable-next-line prefer-spread
            const fn = instance.args.apply(instance, args as any);

            if (ConstructorFunction.isConstructorFunction(fn)) {
              return fn.send();
            }

            if (SendFunction.isSendFunction(fn)) {
              return fn.send();
            }

            if (CallFunction.isCallFunction(fn)) {
              return fn.call();
            }

            throw new Error('Invalid function call');
          },
          get: (_, prop, receiver) => {
            return Reflect.get(instance, prop, receiver);
          },
          has: (_, prop) => {
            return Reflect.has(instance, prop);
          },
          set: (_, prop, receiver) => {
            return Reflect.set(instance, prop, receiver);
          },
        });
      },
    });
  }

  public clone(address: AddressLike, provider: providers.Provider | Signer): TContract {
    return new Contract(this.abi, address, provider) as any;
  }

  public attach(address: AddressLike) {
    const provider = this.signer ?? this.provider;

    return this.clone(address, provider);
  }

  public connect(provider: providers.Provider | Signer) {
    return this.clone(this.address, provider);
  }

  public toJSON() {
    return `<Contract ${this.address}>`;
  }
}
