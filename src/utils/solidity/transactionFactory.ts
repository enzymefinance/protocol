import {
  add,
  Address,
  createQuantity,
  greaterThan,
  multiply,
  QuantityInterface,
  toBI,
  toFixed,
} from '@melonproject/token-math';

import { Contracts } from '~/Contracts';
import { Environment } from '~/utils/environment/Environment';
import { getContract } from '~/utils/solidity/getContract';
import {
  prepareTransaction,
  OptionsOrCallback,
  Options,
} from '~/utils/solidity/prepareTransaction';
import { ensure } from '~/utils/guards/ensure';
import { signTransaction } from '../environment/signTransaction';
import { EnsureError } from '../guards/EnsureError';
import { getBalance } from '../evm/getBalance';
import { getLogCurried } from '../environment/getLogCurried';
import { parseReceiptLogs } from './parseReceiptLogs';

const getLog = getLogCurried(
  'melon:protocol:utils:solidity:transactionFactory',
);

const TRANSACTION_POLL_INTERVAL = 15 * 1000;
const TRANSACTION_TIMEOUT = 10 * 60 * 1000;

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
  incentiveInEth: QuantityInterface;
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
  signedTransactionData: string,
  params?: Args,
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
) =>
  Object.values(params || {}).map(v => {
    if (!Array.isArray(v)) {
      return v.toString();
    } else {
      return v.map(x => x.toString());
    }
  });

export const defaultPostProcess: PostProcessFunction<any, any> = async () =>
  true;

/**
 * If the TX is signed, it comes as the raw signed string
 * (result.rawTransaction) as in:
 * https://web3js.readthedocs.io/en/1.0/web3-eth-accounts.html#id5
 *
 * Otherwise, we assume it is a tx-object like:
 * https://web3js.readthedocs.io/en/1.0/web3-eth-accounts.html#id4
 * ```
 *  {
 *    to: '0xF0109fC8DF283027b6285cc889F5aA624EaC1F55',
 *    value: '1000000000',
 *    gas: 2000000
 *  }
 * ```
 */
const isSignedTx = signedOrNotTx => typeof signedOrNotTx === 'string';

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
    const log = getLog(environment);

    const options: Options =
      typeof optionsOrCallback === 'function'
        ? optionsOrCallback(environment)
        : optionsOrCallback;

    if (!options.skipGuards) {
      await guard(environment, params, contractAddress, options);
    }

    const args = await prepareArgs(environment, params, contractAddress);
    const txId = `${contract}@${contractAddress}.${name}(${args
      .map(JSON.stringify)
      .join(',')})`;
    log.info('Prepare transaction', txId);

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

      const incentiveInEth = options.incentive
        ? createQuantity('eth', '10000000000000000')
        : createQuantity('eth', '0');

      const melonTransaction = {
        amguInEth,
        contract,
        incentiveInEth,
        name,
        params,
        rawTransaction: {
          data: prepared.encoded,
          from: `${options.from || environment.wallet.address}`,
          gas: `${options.gas || prepared.gasEstimation}`,
          gasPrice: `${options.gasPrice || environment.options.gasPrice}`,
          to: `${contractAddress}`,
          value: `${options.value ||
            add(amguInEth.quantity, incentiveInEth.quantity)}`,
        },
        transactionArgs: prepared.transaction.arguments,
      };

      const totalCost = createQuantity(
        'ETH',
        add(
          toBI(melonTransaction.rawTransaction.value),
          multiply(
            toBI(melonTransaction.rawTransaction.gas),
            toBI(melonTransaction.rawTransaction.gasPrice),
          ),
        ),
      );

      const balance = await getBalance(environment);

      ensure(
        greaterThan(balance, totalCost),
        `Insufficent balance. Got: ${toFixed(balance)}, need: ${toFixed(
          totalCost,
        )}`,
      );

      log.debug('Transaction prepared', melonTransaction);

      return melonTransaction;
    } catch (e) {
      log.error(txId, e, args);

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

  /**
   * - Wait for receipt
   * - Poll for receipt
   * - Reject after 10 minutes
   */
  const send: SendFunction<Args> = (
    environment,
    contractAddress,
    signedOrNotTx,
    // prepared,
    params,
  ) =>
    new Promise((resolve, reject) => {
      let transactionHash;
      let pollInterval;

      const log = getLog(environment);

      const receiptPromiEvent = isSignedTx(signedOrNotTx)
        ? environment.eth.sendSignedTransaction(signedOrNotTx)
        : environment.eth.sendTransaction(signedOrNotTx);

      const transactionTimeout = setTimeout(() => {
        if (pollInterval) clearInterval(pollInterval);
        log.error('Transaction timed out', name);
        reject(
          // tslint:disable-next-line: max-line-length
          `Transaction ${name} with transaction hash: ${transactionHash} not mined after ${TRANSACTION_TIMEOUT /
            1000 /
            60} minutes. It might get mined eventually.`,
        );
      }, TRANSACTION_TIMEOUT);

      const processReceipt = async receipt => {
        try {
          const receiptWithEvents = parseReceiptLogs(receipt, log);

          log.debug(`Receipt for ${name}`, receiptWithEvents);
          const postprocessed = await postProcess(
            environment,
            receiptWithEvents,
            params,
            contractAddress,
          );

          clearTimeout(transactionTimeout);
          if (pollInterval) clearInterval(pollInterval);
          resolve(postprocessed);
        } catch (error) {
          reject('Transaction error in postprocess ***');
        }
      };

      receiptPromiEvent.on('receipt', receipt => {
        processReceipt(receipt);
      });
      receiptPromiEvent.on('transactionHash', txHash => {
        transactionHash = txHash;
        pollInterval = setInterval(async () => {
          const receipt = await environment.eth.getTransactionReceipt(
            transactionHash,
          );
          if (receipt) {
            log.debug('Got TX hash from polling');
            await processReceipt(receipt);
          }
        }, TRANSACTION_POLL_INTERVAL);
      });

      receiptPromiEvent.on('error', error => {
        log.error('Transaction error', name, error);
        // throw error;
        // new Error(`Transaction error ${name}: ${error.message}`);
        reject(`Transaction error ${name}: ${error.message}`);
      });
    });

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

    const signedTransactionData = await signTransaction(
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

export { transactionFactory };
