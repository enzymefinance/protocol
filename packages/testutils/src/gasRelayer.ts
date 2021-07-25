import { BigNumber, BigNumberish, utils } from 'ethers';
import { ContractReceipt } from '@enzymefinance/ethers';
import {
  isTypedDataSigner,
  IGsnRelayHub,
  createSignedRelayRequest,
  CreateSignedRelayRequestOptions,
} from '@enzymefinance/protocol';
import { assertEvent } from './assertions';

export interface RelayTransactionOptions extends CreateSignedRelayRequestOptions {
  relayHub: string;
}

export async function relayTransaction(options: RelayTransactionOptions) {
  const signer = options.sendFunction.contract.signer;
  if (!(signer && isTypedDataSigner(signer))) {
    throw new Error('Missing or invalid signer');
  }

  const { relayData, relayRequest, signedRelayRequest } = await createSignedRelayRequest(options);

  // NOTE: In the real implementation, we fetch these from the relayer.
  const defaultGasLimit = 12450000;
  const defaultMaxAcceptance = BigNumber.from(150000);

  // NOTE: There is an inconsistency between how the typed data object shape and the relayCall argument.
  const mergedRelayRequest = {
    request: relayRequest,
    relayData,
  };

  const relayHub = new IGsnRelayHub(options.relayHub, provider.getSigner(options.relayWorker));
  return relayHub.relayCall
    .args(defaultMaxAcceptance, mergedRelayRequest, signedRelayRequest, '0x', defaultGasLimit)
    .gas(defaultGasLimit, relayData.gasPrice)
    .send();
}

const relayed = utils.EventFragment.fromString(
  'TransactionRelayed(address indexed relayManager, address indexed relayWorker, address indexed from, address to, address paymaster, bytes4 selector, uint8 status, uint256 charge)',
);

const rejected = utils.EventFragment.fromString(
  'TransactionRejectedByPaymaster(address indexed relayManager, address indexed paymaster, address indexed from, address to, address relayWorker, bytes4 selector, uint256 innerGasUsed, bytes reason)',
);

export function assertDidRelay(receipt: ContractReceipt<any>) {
  return assertEvent(receipt, relayed, {
    relayManager: expect.any(String),
    relayWorker: expect.any(String),
    from: expect.any(String),
    to: expect.any(String),
    paymaster: expect.any(String),
    selector: expect.any(String),
    status: expect.anything(),
    charge: expect.anything(),
  });
}

export function assertDidRelaySuccessfully(receipt: ContractReceipt<any>) {
  const result = assertDidRelay(receipt);
  expect(result.status).toEqBigNumber(0);
}

export function assertDidRelayWithError(receipt: ContractReceipt<any>) {
  const result = assertDidRelay(receipt);
  expect(result.status).toEqBigNumber(1);
}

export function assertDidRelayWithCharge(
  receipt: ContractReceipt<any>,
  amount: BigNumberish,
  tolerance?: BigNumberish,
) {
  const result = assertDidRelay(receipt);
  expect(result.charge).toBeAroundBigNumber(amount, tolerance);
}

export function assertPaymasterDidReject(receipt: ContractReceipt<any>) {
  return assertEvent(receipt, rejected, {
    relayManager: expect.any(String),
    paymaster: expect.any(String),
    from: expect.any(String),
    to: expect.any(String),
    relayWorker: expect.any(String),
    selector: expect.any(String),
    innerGasUsed: expect.anything(),
    reason: expect.any(String),
  });
}

export function assertPaymasterDidRejectForReason(receipt: ContractReceipt<any>, reason: string) {
  const params = assertPaymasterDidReject(receipt);
  expect(utils.toUtf8String('0x' + params.reason.substr(138))).toMatch(reason);
}
