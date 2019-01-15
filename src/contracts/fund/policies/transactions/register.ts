import web3EthAbi from 'web3-eth-abi';
import { Address } from '@melonproject/token-math';
import {
  transactionFactory,
  PrepareArgsFunction,
  EnhancedExecute,
} from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';
import { FunctionSignatures } from '../../trading/utils/FunctionSignatures';
interface RegisterArgs {
  method: FunctionSignatures;
  policy: Address;
}

const prepareArgs: PrepareArgsFunction<RegisterArgs> = async (
  _,
  { method, policy }: RegisterArgs,
) => [web3EthAbi.encodeFunctionSignature(method), `${policy}`];

const register: EnhancedExecute<RegisterArgs, boolean> = transactionFactory(
  'register',
  Contracts.PolicyManager,
  undefined,
  prepareArgs,
);

export { register };
