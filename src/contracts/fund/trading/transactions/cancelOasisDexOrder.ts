import * as web3Utils from 'web3-utils';
import { Address } from '@melonproject/token-math';

import { CancelOasisDexOrderResult } from './cancelOasisDexOrder';
import {
  PrepareArgsFunction,
  GuardFunction,
  PostProcessFunction,
  transactionFactory,
} from '~/utils/solidity/transactionFactory';
import { getExchangeIndex } from '../calls/getExchangeIndex';
import { ensureFundOwner } from '~/contracts/fund/trading/guards/ensureFundOwner';
import { Exchanges, Contracts } from '~/Contracts';
import { FunctionSignatures } from '../utils/FunctionSignatures';
import { emptyAddress } from '~/utils/constants/emptyAddress';

export type CancelOasisDexOrderResult = any;

export interface CancelOasisDexOrderArgs {
  id?: string;
  maker: Address;
  makerAsset: Address;
  takerAsset: Address;
}

const guard: GuardFunction<CancelOasisDexOrderArgs> = async (
  environment,
  { id, maker, makerAsset, takerAsset },
  contractAddress,
) => {
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

  return [
    exchangeIndex,
    FunctionSignatures.cancelOrder,
    [
      maker.toString(),
      emptyAddress,
      makerAsset.toString(),
      takerAsset.toString(),
      emptyAddress,
      emptyAddress,
    ],
    ['0', '0', '0', '0', '0', '0', '0', 0],
    `0x${Number(id)
      .toString(16)
      .padStart(64, '0')}`,
    web3Utils.padLeft('0x0', 64),
    web3Utils.padLeft('0x0', 64),
    web3Utils.padLeft('0x0', 64),
  ];
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

const cancelOasisDexOrder = transactionFactory<
  CancelOasisDexOrderArgs,
  CancelOasisDexOrderResult
>(
  'callOnExchange',
  Contracts.Trading,
  guard,
  prepareArgs,
  postProcess,
  options,
);

export { cancelOasisDexOrder };
