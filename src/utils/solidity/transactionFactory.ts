import * as R from 'ramda';
import web3EthAbi from 'web3-eth-abi';
import {
  QuantityInterface,
  createQuantity,
} from '@melonproject/token-math/quantity';
import { Address } from '@melonproject/token-math/address';
import { Contracts, eventSignatureABIMap } from '~/Contracts';
import { Environment, LogLevels } from '~/utils/environment/Environment';
import { getContract } from '~/utils/solidity/getContract';
import {
  prepareTransaction,
  OptionsOrCallback,
  Options,
} from '~/utils/solidity/prepareTransaction';
import { ensure } from '~/utils/guards/ensure';
import { sign } from '../environment/sign';
import { EnsureError } from '../guards/EnsureError';

export type TransactionArg = number | number[] | string | string[];
// TODO: Remove this any!
export type TransactionArgs = TransactionArg[] | any;

// The raw unsigned transaction object from web3
// https://web3js.readthedocs.io/en/1.0/web3-eth.html#sendtransaction
export interface UnsignedRawTransaction {
  from: string;
  to?: string;
  value?: string;
  gas?: string;
  gasPrice?: string;
  data?: string;
  nonce?: string;
}

export interface MelonTransaction<Args> {
  amguInEth: QuantityInterface;
  params: Args;
  rawTransaction: UnsignedRawTransaction;
  // Already signed transaction in HEX as described here:
  // https://web3js.readthedocs.io/en/1.0/web3-eth.html#sendsignedtransaction
  // If not specified, signing will be done through web3.js
  signedTransaction?: string;
  transactionArgs: TransactionArgs;
}

// Guard check if the given transaction can run without errors
// They are crucial to spot "Transaction Execution Errors" before
// the transaction actually hit the nodes. They should throw Errors with
// meaningful messages
export type GuardFunction<Args> = (
  environment: Environment,
  params?: Args,
  contractAddress?: Address,
  options?: Options,
) => Promise<void>;

// Translates JavaScript/TypeScript params into the form that the EVM
// understands: token-math structs, ...
export type PrepareArgsFunction<Args> = (
  environment: Environment,
  params: Args,
  contractAddress?: Address,
) => Promise<TransactionArgs>;

// Takes the transaction receipt from the EVM, checks if everything is as
// expected and returns a meaningful object
export type PostProcessFunction<Args, Result> = (
  environment: Environment,
  receipt: any,
  params?: Args,
  contractAddress?: Address,
) => Promise<Result>;

export type TransactionFactory = <Args, Result>(
  name: string,
  contract: Contracts,
  guard?: GuardFunction<Args>,
  prepareArgs?: PrepareArgsFunction<Args>,
  postProcess?: PostProcessFunction<Args, Result>,
  defaultOptions?: OptionsOrCallback,
) => EnhancedExecute<Args, Result>;

type SendFunction<Args> = (
  environment: Environment,
  contractAddress: Address,
  // prepared: MelonTransaction<Args>,
  signedTransactionData: string,
  params: Args,
  options?: OptionsOrCallback,
) => Promise<any>;

type PrepareFunction<Args> = (
  environment: Environment,
  contractAddress: Address,
  params?: Args,
  options?: OptionsOrCallback,
) => Promise<MelonTransaction<Args>>;

type ExecuteFunction<Args, Result> = (
  environment: Environment,
  contractAddress: Address,
  params?: Args,
  options?: OptionsOrCallback,
) => Promise<Result>;

export interface ExecuteMixin<Args> {
  send: SendFunction<Args>;
  prepare: PrepareFunction<Args>;
}

export type EnhancedExecute<Args, Result> = ExecuteFunction<Args, Result> &
  ExecuteMixin<Args>;

export interface WithTransactionDecoratorOptions<Args, Result> {
  guard?: GuardFunction<Args>;
  prepareArgs?: PrepareArgsFunction<Args>;
  postProcess?: PostProcessFunction<Args, Result>;
  options?: OptionsOrCallback;
}

export type WithTransactionDecorator = <Args, Result>(
  transaction: EnhancedExecute<Args, Result>,
  decorator: WithTransactionDecoratorOptions<Args, Result>,
) => EnhancedExecute<Args, Result>;

export const defaultGuard: GuardFunction<any> = async () => {};

export const defaultPrepareArgs: PrepareArgsFunction<any> = async (
  environment,
  params,
  contractAddress,
) => Object.values(params || {}).map(v => v.toString());

export const defaultPostProcess: PostProcessFunction<any, any> = async () =>
  true;

/**
 * The transaction factory returns a function "execute" (You have to rename it
 * to the actual name of the transaction, for example: "transfer"). As a
 * minimum, one needs to provide the transaction name and the contract path:
 *
 * ```typescript
 * const transfer = transactionFactory('transfer', Contract.Token);
 * ```
 *
 * This transfer function can then be executed directly:
 *
 * ```typescript
 * await transfer(new Address('0xdeadbeef'));
 * ```
 *
 * Or sliced into a prepare and a send part:
 * ```typescript
 * const preparedTransaction: PreparedTransaction =
 *    await transfer.prepare(new Address('0xdeadbeef'));
 *
 * // pass that prepared transaction to the signer
 * const result = await transfer.send(new Address('0xdeadbeef'),
 *    preparedTransaction);
 * ```
 */
const transactionFactory: TransactionFactory = <Args, Result>(
  name,
  contract,
  guard = defaultGuard,
  prepareArgs = defaultPrepareArgs,
  postProcess = defaultPostProcess,
  defaultOptions = {},
) => {
  const prepare: PrepareFunction<Args> = async (
    environment,
    contractAddress,
    params,
    optionsOrCallback = defaultOptions,
  ) => {
    const log = environment.logger('melon:protocol:utils:solidity');

    const options: Options =
      typeof optionsOrCallback === 'function'
        ? optionsOrCallback(environment)
        : optionsOrCallback;

    if (!options.skipGuards) {
      await guard(environment, params, contractAddress, options);
    }

    const args = await prepareArgs(environment, params, contractAddress);
    const txId = `${contract}@${contractAddress}.${name}(${args.join(',')})`;
    log(LogLevels.INFO, 'Prepare transaction', txId);

    try {
      const contractInstance = getContract(
        environment,
        contract,
        contractAddress,
      );
      ensure(
        !!contractInstance.methods[name],
        `Method ${name} does not exist on contract ${contract}`,
      );
      const transaction = contractInstance.methods[name](...args);

      transaction.name = name;
      const prepared = await prepareTransaction(
        environment,
        transaction,
        options,
      );

      // HACK: To avoid circular dependencies (?)
      const {
        calcAmguInEth,
      } = await import('~/contracts/engine/calls/calcAmguInEth');

      const amguInEth = options.amguPayable
        ? await calcAmguInEth(
            environment,
            contractAddress,
            prepared.gasEstimation,
          )
        : createQuantity('eth', '0'); /*;*/

      const melonTransaction = {
        amguInEth,
        contract,
        name,
        params,
        rawTransaction: {
          data: prepared.encoded,
          from: `${options.from || environment.wallet.address}`,
          gas: `${options.gas || prepared.gasEstimation}`,
          gasPrice: `${options.gasPrice || environment.options.gasPrice}`,
          to: `${contractAddress}`,
          value: `${options.value || amguInEth.quantity}`,
        },
        transactionArgs: prepared.transaction.arguments,
      };

      log(LogLevels.DEBUG, 'Transaction prepared', melonTransaction);

      return melonTransaction;
    } catch (e) {
      log(LogLevels.ERROR, txId, e);

      if (e instanceof EnsureError) {
        throw e;
      } else {
        throw new Error(
          // tslint:disable-next-line:max-line-length
          `Error in prepare transaction ${txId}): ${e.message}`,
        );
      }
    }
  };

  const send: SendFunction<Args> = async (
    environment,
    contractAddress,
    signedTransactionData,
    // prepared,
    params,
  ) => {
    const log = environment.logger('melon:protocol:utils:solidity');

    const receipt = await environment.eth
      .sendSignedTransaction(signedTransactionData)
      // .sendTransaction(prepared.rawTransaction)
      .then(null, error => {
        throw new Error(`Transaction failed for ${name}: ${error.message}`);
      });

    log(LogLevels.DEBUG, `Receipt for ${name}`, receipt);

    const events = receipt.logs.reduce((carry, log) => {
      const eventABI = eventSignatureABIMap[log.topics[0]];

      // Ignore event if not found in eventSignaturesABI map;
      if (!eventABI) {
        return carry;
      }

      try {
        const decoded = web3EthAbi.decodeLog(
          eventABI.inputs,
          log.data !== '0x' && log.data,
          eventABI.anonymous ? log.topics : log.topics.slice(1),
        );
        const keys = R.map(R.prop('name'), eventABI.inputs);
        const picked = R.pick(keys, decoded);

        return {
          ...carry,
          [eventABI.name]: {
            returnValues: picked,
          },
        };
      } catch (e) {
        log(LogLevels.WARN, 'Error with parsing logs', eventABI, log, e);
        return carry;
      }
    }, {});

    receipt.events = events;

    const postprocessed = await postProcess(
      environment,
      receipt,
      params,
      contractAddress,
    );

    return postprocessed;
  };

  const execute: ExecuteFunction<Args, Result> = async (
    environment,
    contractAddress,
    params,
    options = defaultOptions,
  ) => {
    const prepared = await prepare(
      environment,
      contractAddress,
      params,
      options,
    );

    const signedTransactionData = await sign(
      environment,
      prepared.rawTransaction,
    );

    const result = await send(
      environment,
      contractAddress,
      signedTransactionData,
      // prepared,
      params,
      options,
    );

    return result;
  };

  (execute as EnhancedExecute<Args, Result>).prepare = prepare;
  (execute as EnhancedExecute<Args, Result>).send = send;

  return execute as EnhancedExecute<Args, Result>;
};

const withTransactionDecorator: WithTransactionDecorator = <Args, Result>(
  transaction,
  decorator,
) => {
  const prepare: PrepareFunction<Args> = async (
    environment,
    contractAddress,
    params,
    options = decorator.options,
  ) => {
    if (typeof decorator.guard !== 'undefined') {
      await decorator.guard(environment, params, contractAddress);
    }

    let processedParams = params;
    if (typeof decorator.prepareArgs !== 'undefined') {
      processedParams = await decorator.prepareArgs(
        environment,
        params,
        contractAddress,
      );
    }

    return transaction.prepare(
      environment,
      contractAddress,
      processedParams,
      options,
    );
  };

  const send: SendFunction<Args> = async (
    environment,
    contractAddress,
    prepared,
    params,
    options = decorator.options,
  ) => {
    const result = await transaction.send(
      environment,
      contractAddress,
      prepared,
      params,
      options,
    );
    if (typeof decorator.postProcess !== 'undefined') {
      return decorator.postProcess(
        environment,
        result,
        params,
        contractAddress,
      );
    }

    return result;
  };

  const execute: ExecuteFunction<Args, Result> = async (
    environment,
    contractAddress,
    params,
  ) => {
    const prepared = await prepare(
      environment,
      contractAddress,
      params,
      decorator.options,
    );

    const signedTransactionData = await sign(
      environment,
      prepared.rawTransaction,
    );

    const result = await send(
      environment,
      contractAddress,
      signedTransactionData,
      // prepared,
      params,
      decorator.options,
    );

    return result;
  };

  (execute as EnhancedExecute<Args, Result>).prepare = prepare;
  (execute as EnhancedExecute<Args, Result>).send = send;

  return execute as EnhancedExecute<Args, Result>;
};

export { transactionFactory, withTransactionDecorator };
