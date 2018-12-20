import { withTransactionDecorator } from '~/utils/solidity/transactionFactory';
import { getExchangeIndex } from '../calls/getExchangeIndex';
import { callOnExchange } from '~/contracts/fund/trading/transactions/callOnExchange';
import { ensureSufficientBalance } from '~/contracts/dependencies/token/guards/ensureSufficientBalance';
import { getRoutes } from '~/contracts/fund/hub/calls/getRoutes';
import { getHub } from '~/contracts/fund/hub/calls/getHub';
import { ensureFundOwner } from '~/contracts/fund/trading/guards/ensureFundOwner';
import { ensureTakePermitted } from '../guards/ensureTakePermitted';
import * as web3Utils from 'web3-utils';
import { Exchanges } from '~/Contracts';
import { FunctionSignatures } from '../utils/FunctionSignatures';
import { QuantityInterface } from '@melonproject/token-math/quantity';
import { Address } from '@melonproject/token-math/address';

export type TakeOasisDexOrderResult = any;

export interface TakeOasisDexOrderArgs {
  id?: number;
  makerQuantity: QuantityInterface;
  takerQuantity: QuantityInterface;
  maker: Address;
  fillTakerTokenAmount?: QuantityInterface;
}

const guard = async (
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

  return {
    dexySignatureMode: 0,
    exchangeIndex,
    feeRecipient: '0x0000000000000000000000000000000000000000',
    fillTakerTokenAmount: fillTakerTokenAmount.quantity,
    identifier: id,
    maker: maker.toString(),
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

const postProcess = async (_, receipt) => {
  return {
    id: web3Utils.toDecimal(receipt.events.LogTake.returnValues.id),
    timestamp: receipt.events.LogTake.returnValues.timestamp,
  };
};

const options = { gas: '8000000' };

const takeOasisDexOrder = withTransactionDecorator<
  TakeOasisDexOrderArgs,
  TakeOasisDexOrderResult
>(callOnExchange, {
  guard,
  options,
  postProcess,
  prepareArgs,
});

export { takeOasisDexOrder };
