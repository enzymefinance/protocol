import {
  PrepareArgsFunction,
  withTransactionDecorator,
  GuardFunction,
  PostProcessFunction,
} from '~/utils/solidity/transactionFactory';
import { QuantityInterface } from '@melonproject/token-math/quantity';
import { Address } from '@melonproject/token-math/address';
import { getExchangeIndex } from '../calls/getExchangeIndex';
import { callOnExchange } from '~/contracts/fund/trading/transactions/callOnExchange';
import { getGlobalEnvironment } from '~/utils/environment/globalEnvironment';
import { ensureSufficientBalance } from '~/contracts/dependencies/token/guards/ensureSufficientBalance';
import { getSettings } from '~/contracts/fund/hub/calls/getSettings';
import { getHub } from '~/contracts/fund/hub/calls/getHub';
import { ensureFundOwner } from '~/contracts/fund/trading/guards/ensureFundOwner';
import { ensureTakePermitted } from '../guards/ensureTakePermitted';
import * as web3Utils from 'web3-utils';
import { Exchanges } from '~/Contracts';
import { FunctionSignatures } from '../utils/FunctionSignatures';

export type TakeOasisDexOrderResult = any;

export interface TakeOasisDexOrderArgs {
  id: number;
  makerQuantity: QuantityInterface;
  takerQuantity: QuantityInterface;
  maker: Address;
  fillTakerTokenAmount: QuantityInterface;
}

const guard: GuardFunction<TakeOasisDexOrderArgs> = async (
  {
    id,
    makerQuantity,
    takerQuantity,
    maker,
    fillTakerTokenAmount = takerQuantity,
  },
  contractAddress,
  environment = getGlobalEnvironment(),
) => {
  const hubAddress = await getHub(contractAddress, environment);
  const { vaultAddress } = await getSettings(hubAddress);

  const minBalance = fillTakerTokenAmount;

  await ensureSufficientBalance(minBalance, vaultAddress, environment);

  await ensureFundOwner(contractAddress, environment);

  // TODO: add all preflights

  await ensureTakePermitted(
    contractAddress,
    id,
    makerQuantity,
    takerQuantity,
    fillTakerTokenAmount,
    environment,
  );
};

const prepareArgs: PrepareArgsFunction<TakeOasisDexOrderArgs> = async (
  {
    id,
    makerQuantity,
    takerQuantity,
    maker,
    fillTakerTokenAmount = takerQuantity,
  },
  contractAddress,
  environment = getGlobalEnvironment(),
) => {
  const exchangeIndex = await getExchangeIndex(
    contractAddress,
    {
      exchange: Exchanges.MatchingMarket,
    },
    environment,
  );

  return {
    dexySignatureMode: 0,
    exchangeIndex,
    feeRecipient: '0x0000000000000000000000000000000000000000',
    fillTakerTokenAmount: fillTakerTokenAmount.quantity,
    identifier: id,
    maker,
    makerAsset: makerQuantity.token.address,
    makerAssetData: web3Utils.padLeft('0x0', 64),
    makerFee: '0',
    makerQuantity: makerQuantity.quantity,
    method: FunctionSignatures.takeOrder,
    salt: '0',
    senderAddress: '0x0000000000000000000000000000000000000000',
    signature: web3Utils.padLeft('0x0', 64),
    taker: contractAddress,
    takerAsset: takerQuantity.token.address,
    takerAssetData: web3Utils.padLeft('0x0', 64),
    takerFee: '0',
    takerQuantity: takerQuantity.quantity,
    timestamp: '0',
  };
};

const postProcess: PostProcessFunction<
  TakeOasisDexOrderArgs,
  TakeOasisDexOrderResult
> = async receipt => {
  return {
    id: web3Utils.toDecimal(receipt.events.LogTake.returnValues.id),
    timestamp: receipt.events.LogTake.returnValues.timestamp,
  };
};

const options = { gas: '8000000' };

const takeOasisDexOrder = withTransactionDecorator(callOnExchange, {
  guard,
  options,
  postProcess,
  prepareArgs,
});

export { takeOasisDexOrder };
