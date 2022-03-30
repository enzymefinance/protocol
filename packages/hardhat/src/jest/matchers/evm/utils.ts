import { Contract, ContractFunction } from '@enzymefinance/ethers';
import type { utils } from 'ethers';

import type { History } from '../../../history';
import type { EthereumTestnetProvider } from '../../../provider';
import { forceFail } from '../../utils';

export type MatcherCallback<TReturn extends jest.CustomMatcherResult | Promise<jest.CustomMatcherResult>> = (
  history: History,
  contract: Contract,
  fragment?: utils.FunctionFragment,
) => TReturn;

export function ensureParameters<
  TSubject extends Contract | ContractFunction<any> = any,
  TReturn extends jest.CustomMatcherResult | Promise<jest.CustomMatcherResult> = jest.CustomMatcherResult,
>(subject: TSubject, invert: boolean, callback: MatcherCallback<TReturn>): TReturn {
  const fn = ContractFunction.isContractFunction(subject)
    ? subject
    : typeof subject === 'function' && ContractFunction.isContractFunction((subject as ContractFunction).ref)
    ? (subject as ContractFunction).ref
    : undefined;

  const contract = ContractFunction.isContractFunction(fn)
    ? fn.contract
    : Contract.isContract(subject)
    ? subject
    : undefined;

  if (!contract) {
    const error = 'Missing contract instance for contract call history assertion';

    return forceFail(error, invert) as TReturn;
  }

  const history = (contract?.provider as EthereumTestnetProvider).history;

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!history) {
    const error = 'Invalid or unsupported provider for contract call history assertion';

    return forceFail(error, invert) as TReturn;
  }

  const fragment = ContractFunction.isContractFunction(fn) ? fn.fragment : undefined;

  return callback(history, contract, fragment);
}
