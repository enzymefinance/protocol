import { CancelOasisDexOrderResult } from './cancelOasisDexOrder';
import {
  PrepareArgsFunction,
  withTransactionDecorator,
  GuardFunction,
  PostProcessFunction,
} from '~/utils/solidity/transactionFactory';
import { Address } from '@melonproject/token-math/address';
import { getExchangeIndex } from '../calls/getExchangeIndex';
import { callOnExchange } from '~/contracts/fund/trading/transactions/callOnExchange';
import { ensureFundOwner } from '~/contracts/fund/trading/guards/ensureFundOwner';
import * as web3Utils from 'web3-utils';
import { Exchanges } from '~/Contracts';
import { FunctionSignatures } from '../utils/FunctionSignatures';

export type CancelOasisDexOrderResult = any;

export interface CancelOasisDexOrderArgs {
  id?: number;
  maker: Address;
  makerAsset: Address;
  takerAsset: Address;
}

const guard: GuardFunction<CancelOasisDexOrderArgs> = async (
  environment,
  { id, maker, makerAsset, takerAsset },
  contractAddress,
) => {
  // const hubAddress = await getHub(environment, contractAddress);
  // const { vaultAddress } = await getSettings(environment, hubAddress);

  await ensureFundOwner(environment, contractAddress);
};

const prepareArgs: PrepareArgsFunction<CancelOasisDexOrderArgs> = async (
  environment,
  { id, maker, makerAsset, takerAsset },
  contractAddress,
) => {
  const exchangeIndex = await getExchangeIndex(environment, contractAddress, {
    exchange: Exchanges.MatchingMarket,
  });

  return {
    dexySignatureMode: 0,
    exchangeIndex,
    feeRecipient: '0x0000000000000000000000000000000000000000',
    fillTakerTokenAmount: '0',
    identifier: id,
    maker: maker.toString(),
    makerAsset,
    makerAssetData: web3Utils.padLeft('0x0', 64),
    makerFee: '0',
    makerQuantity: '0',
    method: FunctionSignatures.cancelOrder,
    salt: '0',
    senderAddress: '0x0000000000000000000000000000000000000000',
    signature: web3Utils.padLeft('0x0', 64),
    taker: '0x0000000000000000000000000000000000000000',
    takerAsset,
    takerAssetData: web3Utils.padLeft('0x0', 64),
    takerFee: '0',
    takerQuantity: '0',
    timestamp: '0',
  };
};

const postProcess: PostProcessFunction<
  CancelOasisDexOrderArgs,
  CancelOasisDexOrderResult
> = async (_, receipt) => {
  return {
    id: web3Utils.toDecimal(receipt.events.LogKill.returnValues.id),
  };
};

const options = { gas: '8000000' };

const cancelOasisDexOrder = withTransactionDecorator<
  CancelOasisDexOrderArgs,
  CancelOasisDexOrderResult
>(callOnExchange, {
  guard,
  options,
  postProcess,
  prepareArgs,
});

export { cancelOasisDexOrder };
