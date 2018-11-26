import {
  PrepareArgsFunction,
  withTransactionDecorator,
  getDeployment,
  GuardFunction,
  PostProcessFunction,
} from '~/utils/solidity';
import { QuantityInterface } from '@melonproject/token-math/quantity';
import { Address } from '@melonproject/token-math/address';
import { getExchangeIndex } from '../calls/getExchangeIndex';
import { callOnExchange } from '~/contracts/fund/trading/transactions/callOnExchange';
import { getGlobalEnvironment } from '~/utils/environment';
import { ensureSufficientBalance } from '~/contracts/dependencies/token';
import { getSettings, getHub } from '~/contracts/fund/hub';
import { ensureFundOwner } from '~/contracts/fund/trading/guards/ensureFundOwner';
import { ensureTakePermitted } from '../guards/ensureTakePermitted';
import * as web3Utils from 'web3-utils';

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
  { id, makerQuantity, takerQuantity, maker, fillTakerTokenAmount },
  contractAddress,
  environment = getGlobalEnvironment(),
) => {
  const deployment = await getDeployment();

  const matchingMarketAddress = deployment.exchangeConfigs.find(
    o => o.name === 'MatchingMarket',
  ).exchangeAddress;

  const exchangeIndex = await getExchangeIndex(
    matchingMarketAddress,
    contractAddress,
    environment,
  );

  return {
    exchangeIndex,
    method:
      'takeOrder(address,address[6],uint256[8],bytes32,bytes,bytes,bytes)', // update when function signature changes
    maker,
    taker: contractAddress,
    makerAsset: makerQuantity.token.address,
    takerAsset: takerQuantity.token.address,
    feeRecipient: '0x0000000000000000000000000000000000000000',
    senderAddress: '0x0000000000000000000000000000000000000000',
    makerQuantity: makerQuantity.quantity,
    takerQuantity: takerQuantity.quantity,
    makerFee: '0',
    takerFee: '0',
    timestamp: '0',
    salt: '0',
    fillTakerTokenAmount: fillTakerTokenAmount.quantity,
    dexySignatureMode: 0,
    identifier: id,
    makerAssetData: web3Utils.padLeft('0x0', 64),
    takerAssetData: web3Utils.padLeft('0x0', 64),
    signature: web3Utils.padLeft('0x0', 64),
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
  postProcess,
  prepareArgs,
  guard,
  options,
});

export { takeOasisDexOrder };
