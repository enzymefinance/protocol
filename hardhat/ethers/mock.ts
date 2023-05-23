import type { ContractReceipt as EthersContractReceipt } from 'ethers';
import { utils } from 'ethers';

import type { Contract } from './contract';
import { Doppelganger } from './doppelganger';
import type { CallFunction, ContractReceipt } from './function';
import { ConstructorFunction, ContractFunction, SendFunction } from './function';
import type { ProxiedFunction } from './types';
import { resolveArguments } from './utils/resolveArguments';

function stub<TContract extends Contract = Contract>(
  doppelganger: Doppelganger,
  contract: TContract,
  func: utils.FunctionFragment,
  params?: any[],
) {
  const encoder = utils.defaultAbiCoder;

  return {
    given: (...input: any) => stub(doppelganger, contract, func, input),
    reset: async () => {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      const args = params ? resolveArguments(func.inputs ?? [], params) : undefined;

      const data = args ? contract.abi.encodeFunctionData(func, args) : contract.abi.getSighash(func);

      return doppelganger.__doppelganger__mockReset(data);
    },
    returns: async (...output: any) => {
      if (!func.outputs) {
        const formatted = func.format();

        throw new Error(`Attempting to mock return value of function with no outputs: ${formatted}`);
      }

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      const args = params ? resolveArguments(func.inputs ?? [], params) : undefined;

      const data = args ? contract.abi.encodeFunctionData(func, args) : contract.abi.getSighash(func);

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      const resolved = output?.length ? resolveArguments(func.outputs ?? [], output) : undefined;

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      const encoded = encoder.encode(func.outputs ?? [], resolved);

      return doppelganger.__doppelganger__mockReturns(data, encoded);
    },
    reverts: async (reason: string) => {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      const args = params ? resolveArguments(func.inputs ?? [], params) : undefined;

      const data = args ? contract.abi.encodeFunctionData(func, args) : contract.abi.getSighash(func);

      return doppelganger.__doppelganger__mockReverts(data, reason);
    },
  };
}

export async function mock<TContract extends Contract = Contract>(
  contract: TContract,
): Promise<MockContract<TContract>> {
  if (!contract.signer) {
    throw new Error('Missing signer');
  }

  const functions = Object.values(contract.abi.functions);
  const hashes = functions.map((fragment) => contract.abi.getSighash(fragment));
  const signatures = functions.map((fragment) => fragment.format());
  const doppelganger = await Doppelganger.deploy(contract.signer, hashes, signatures);

  const forward = async <TArgs extends any[] = any, TReturn = any, TContract extends Contract = Contract>(
    subject: CallFunction<TArgs, TReturn, TContract> | SendFunction<TArgs, TReturn, TContract>,
    ...params: any
  ): Promise<any> => {
    const fn = ContractFunction.isContractFunction(subject)
      ? subject
      : typeof subject === 'function' && ContractFunction.isContractFunction(subject as ContractFunction)
      ? (subject as ContractFunction).ref
      : undefined;

    // eslint-disable-next-line eqeqeq
    if (fn == null) {
      throw new Error('Not a valid contract function');
    }

    if (ConstructorFunction.isConstructorFunction(fn)) {
      throw new Error('Constructor functions are not supported');
    }

    const fragment = fn.fragment as utils.FunctionFragment;
    const callee = fn.contract;

    const args = params ? resolveArguments(fragment.inputs, params) : undefined;

    const data = args ? fn.contract.abi.encodeFunctionData(fragment, args) : fn.contract.abi.getSighash(fragment);

    const forward = doppelganger.__doppelganger__mockForward.args(data, callee);

    if (SendFunction.isSendFunction(fn)) {
      const receipt = (await forward.send()) as any;
      const refined: ContractReceipt<SendFunction<TArgs, TReturn, TContract>> = receipt;

      refined.function = fn;

      return refined;
    }

    const result = await forward.call();
    const decoded = fn.contract.abi.decodeFunctionResult(fragment, result);

    if (fragment.outputs?.length === 1) {
      return decoded[0];
    }

    return decoded;
  };

  const mocked = contract.attach(doppelganger.address);

  mocked.forward = forward;

  const proxy = new Proxy(mocked, {
    get: (target, prop: string, receiver) => {
      const value = Reflect.get(target, prop, receiver);
      const fn = value?.ref;

      if (!ContractFunction.isContractFunction(fn)) {
        return value;
      }

      const extend = stub(doppelganger, mocked, fn.fragment);

      return new Proxy(value, {
        get: (target, prop, receiver) => {
          if (Reflect.has(target, prop)) {
            return Reflect.get(target, prop, receiver);
          }

          return Reflect.get(extend, prop, receiver);
        },
      });
    },
  });

  return proxy as MockContract<TContract>;
}

export type MockContract<TContract extends Contract = Contract> = {
  [TKey in keyof TContract]: TContract[TKey] extends ProxiedFunction<any>
    ? RefinableStub<Parameters<TContract[TKey]['args']>> & TContract[TKey]
    : TContract[TKey];
} & {
  forward: (<TArgs extends any[] = any, TReturn = any, TContract extends Contract = Contract>(
    send: SendFunction<TArgs, TReturn, TContract>,
    ...args: TArgs
  ) => Promise<ContractReceipt<SendFunction<TArgs, TReturn, TContract>>>) &
    (<TArgs extends any[] = any, TReturn = any>(
      call: CallFunction<TArgs, TReturn>,
      ...args: TArgs
    ) => Promise<TReturn>);
};

export interface Stub<TOutput extends any[] = any[]> {
  returns: (...args: TOutput) => Promise<EthersContractReceipt>;
  reverts: (reason: string) => Promise<EthersContractReceipt>;
  reset: () => Promise<EthersContractReceipt>;
}

export type RefinableStub<TInput extends any[] = any[], TOutput extends any[] = any[]> = Stub<TOutput> & {
  given: (...args: TInput) => Stub<TOutput>;
  reset: () => Promise<EthersContractReceipt>;
};
