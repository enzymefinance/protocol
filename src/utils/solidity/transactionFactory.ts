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
export type GuardFunction = (
  params,
  contractAddress?: Address,
  environment?: Environment,
) => Promise<void>;

// Translates JavaScript/TypeScript params into the form that the EVM
// understands: token-math structs, ...
export type PrepareArgsFunction = (
  params,
  contractAddress?: Address,
  environment?: Environment,
) => Promise<TransactionArgs>;

// Takes the transaction receipt from the EVM, checks if everything is as
// expected and returns a meaningful object
export type PostProcessFunction = (
  receipt,
  params,
  contractAddress?: Address,
  environment?: Environment,
) => Promise<any>;

//  <P> //  params: P
export type TransactionFactory = (
  name: string,
  contract: Contract,
  guard: GuardFunction,
  prepareArgs: PrepareArgsFunction,
  postProcess: PostProcessFunction,
) => EnhancedExecute;

type SendFunction = (
  contractAddress: Address,
  params,
  prepared: PreparedTransaction,
  environment: Environment,
) => Promise<any>;

type PrepareFunction = (
  contractAddress: Address,
  params,
  environment: Environment,
) => Promise<PreparedTransaction>;

type ExecuteFunction = (
  contractAddress: Address,
  params,
  environment: Environment,
) => Promise<any>;

export interface ExecuteMixin {
  send: SendFunction;
  prepare: PrepareFunction;
}

export type EnhancedExecute = ExecuteFunction & ExecuteMixin;

const transactionFactory: TransactionFactory = (
  name,
  contract,
  guard,
  prepareArgs,
  postProcess,
) => {
  const prepare = async (
    contractAddress: Address,
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

  const send: SendFunction = async (
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

  const execute = async (
    contractAddress: Address,
    params,
    environment: Environment = getGlobalEnvironment(),
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
