import { Environment, getGlobalEnvironment } from '../environment';
import {
  Contract,
  getContract,
  prepareTransaction,
  PreparedTransaction,
  sendTransaction,
} from '../solidity';
import { Address } from '../types';

type TransactionArg = number | string;
type TransactionArgs = TransactionArg[];

// Guard check if the given transaction can run without errors
// They are crucial to spot "Transaction Execution Errors" before
// the transaction actually hit the nodes. They should throw Errors with
// meaningfull messages
export type GuardFunction<Args> = (
  params: Args,
  contractAddress?: Address,
  environment?: Environment,
) => Promise<void>;

// Translates JavaScript/TypeScript params into the form that the EVM
// understands: token-math structs, ...
export type PrepareArgsFunction<Args> = (
  params: Args,
  contractAddress?: Address,
  environment?: Environment,
) => Promise<TransactionArgs>;

// Takes the transaction receipt from the EVM, checks if everything is as
// expected and returns a meaningful object
export type PostProcessFunction<Args, Result> = (
  receipt,
  params: Args,
  contractAddress?: Address,
  environment?: Environment,
) => Promise<Result>;

export type TransactionFactory = <Args, Result>(
  name: string,
  contract: Contract,
  guard: GuardFunction<Args>,
  prepareArgs: PrepareArgsFunction<Args>,
  postProcess: PostProcessFunction<Args, Result>,
) => EnhancedExecute<Args, Result>;

type SendFunction<Args> = (
  contractAddress: Address,
  params: Args,
  prepared: PreparedTransaction,
  environment: Environment,
) => Promise<any>;

type PrepareFunction<Args> = (
  contractAddress: Address,
  params: Args,
  environment: Environment,
) => Promise<PreparedTransaction>;

type ExecuteFunction<Args, Result> = (
  contractAddress: Address,
  params: Args,
  environment?: Environment,
) => Promise<Result>;

export interface ExecuteMixin<Args> {
  send: SendFunction<Args>;
  prepare: PrepareFunction<Args>;
}

export type EnhancedExecute<Args, Result> = ExecuteFunction<Args, Result> &
  ExecuteMixin<Args>;

const transactionFactory: TransactionFactory = <Args, Result>(
  name,
  contract,
  guard,
  prepareArgs,
  postProcess,
) => {
  const prepare: PrepareFunction<Args> = async (
    contractAddress,
    params,
    environment: Environment = getGlobalEnvironment(),
  ) => {
    await guard(params, contractAddress, environment);
    const args = await prepareArgs(params, contractAddress, environment);
    const contractInstance = getContract(contract, contractAddress);
    const transaction = contractInstance.methods[name](...args);
    transaction.name = name;
    const prepared = await prepareTransaction(transaction, environment);
    return prepared;
  };

  const send: SendFunction<Args> = async (
    contractAddress,
    params,
    prepared,
    environment = getGlobalEnvironment(),
  ) => {
    const receipt = sendTransaction(prepared, environment);
    const postprocessed = await postProcess(
      receipt,
      params,
      contractAddress,
      environment,
    );
    return postprocessed;
  };

  const execute: EnhancedExecute<Args, Result> = async (
    contractAddress,
    params,
    environment = getGlobalEnvironment(),
  ) => {
    const prepared = await prepare(contractAddress, params, environment);
    const result = await send(contractAddress, params, prepared, environment);
    return result;
  };

  execute.prepare = prepare;
  execute.send = send;

  return execute;
};

export { transactionFactory };
