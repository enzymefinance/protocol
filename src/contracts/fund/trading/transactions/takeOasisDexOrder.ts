import { QuantityInterface, Address } from '@melonproject/token-math';
import * as web3Utils from 'web3-utils';

import { transactionFactory } from '~/utils/solidity/transactionFactory';
import { getExchangeIndex } from '../calls/getExchangeIndex';
import { ensureSufficientBalance } from '~/contracts/dependencies/token/guards/ensureSufficientBalance';
import { getRoutes } from '~/contracts/fund/hub/calls/getRoutes';
import { getHub } from '~/contracts/fund/hub/calls/getHub';
import { ensureFundOwner } from '~/contracts/fund/trading/guards/ensureFundOwner';
import { ensureTakePermitted } from '../guards/ensureTakePermitted';
import { Exchanges, Contracts } from '~/Contracts';
import { FunctionSignatures } from '../utils/FunctionSignatures';
import { emptyAddress } from '~/utils/constants/emptyAddress';

export type TakeOasisDexOrderResult = any;

export interface TakeOasisDexOrderArgs {
  id: number;
  makerQuantity: QuantityInterface;
  takerQuantity: QuantityInterface;
  maker: Address;
  fillTakerTokenAmount?: QuantityInterface;
}

const guard = async (
  environment,
  { id, makerQuantity, takerQuantity, fillTakerTokenAmount = takerQuantity },
  contractAddress,
) => {
  const hubAddress = await getHub(environment, contractAddress);
  const { vaultAddress } = await getRoutes(environment, hubAddress);

  const minBalance = fillTakerTokenAmount;

  await ensureSufficientBalance(environment, minBalance, vaultAddress);
  await ensureFundOwner(environment, contractAddress);

  // TODO: add all preflights

  await ensureTakePermitted(
    environment,
    contractAddress,
    id,
    makerQuantity,
    takerQuantity,
    fillTakerTokenAmount,
  );
};

const prepareArgs = async (
  environment,
  {
    id,
    makerQuantity,
    takerQuantity,
    maker,
    fillTakerTokenAmount = takerQuantity,
  },
  contractAddress,
) => {
  const exchangeIndex = await getExchangeIndex(environment, contractAddress, {
    exchange: Exchanges.MatchingMarket,
  });

  return [
    exchangeIndex,
    FunctionSignatures.takeOrder,
    [
      maker.toString(),
      contractAddress.toString(),
      makerQuantity.token.address.toString(),
      takerQuantity.token.address.toString(),
      emptyAddress,
      emptyAddress,
    ],
    [
      makerQuantity.quantity.toString(),
      takerQuantity.quantity.toString(),
      '0',
      '0',
      '0',
      '0',
      fillTakerTokenAmount.quantity.toString(),
      0,
    ],
    `0x${Number(id)
      .toString(16)
      .padStart(64, '0')}`,
    web3Utils.padLeft('0x0', 64),
    web3Utils.padLeft('0x0', 64),
    web3Utils.padLeft('0x0', 64),
  ];
};

const postProcess = async (_, receipt) => {
  return {
    id: web3Utils.toDecimal(receipt.events.LogTake.returnValues.id),
    timestamp: receipt.events.LogTake.returnValues.timestamp,
  };
};

const options = { gas: '8000000' };

const takeOasisDexOrder = transactionFactory<
  TakeOasisDexOrderArgs,
  TakeOasisDexOrderResult
>(
  'callOnExchange',
  Contracts.Trading,
  guard,
  prepareArgs,
  postProcess,
  options,
);

export { takeOasisDexOrder };
