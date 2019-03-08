import web3EthAbi from 'web3-eth-abi';
import { Address, toString } from '@melonproject/token-math';
import {
  transactionFactory,
  PrepareArgsFunction,
  EnhancedExecute,
} from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';
import { FunctionSignatures } from '../../trading/utils/FunctionSignatures';

interface Policy {
  method: FunctionSignatures;
  policy: Address;
}

type RegisterArgs = Policy | Policy[];

const prepareArgs: PrepareArgsFunction<RegisterArgs> = async (
  _,
  args: RegisterArgs,
) => {
  const methods = Array.isArray(args) ? args.map(a => a.method) : [args.method];
  const policies = Array.isArray(args)
    ? args.map(a => a.policy)
    : [args.policy];

  return [
    methods.map(web3EthAbi.encodeFunctionSignature),
    policies.map(toString),
  ];
};

const register: EnhancedExecute<RegisterArgs, boolean> = transactionFactory(
  'batchRegister',
  Contracts.PolicyManager,
  undefined,
  prepareArgs,
);

export { register };
