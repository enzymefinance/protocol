import {
  PrepareArgsFunction,
  withTransactionDecorator,
  getDeployment,
  GuardFunction,
  PostProcessFunction,
} from '~/utils/solidity';
import {
  QuantityInterface,
  createQuantity,
} from '@melonproject/token-math/quantity';
import { Address } from '@melonproject/token-math/address';
import { getFunctionSignature } from '~/utils/abi/getFunctionSignature';
import { Contracts, requireMap } from '~/Contracts';
import { getExchangeIndex } from '../calls/getExchangeIndex';
import { callOnExchange } from '~/contracts/fund/trading/transactions/callOnExchange';
import { ensureMakePermitted } from '~/contracts/fund/trading/guards/ensureMakePermitted';
import { getGlobalEnvironment } from '~/utils/environment';
import { ensureSufficientBalance } from '~/contracts/dependencies/token';
import { getSettings, getHub } from '~/contracts/fund/hub';
import { ensureFundOwner } from '~/contracts/fund/trading/guards/ensureFundOwner';
import { ensureTakePermitted } from '../guards/ensureTakePermitted';

export type TakeOasisDexOrderResult = any;

export interface TakeOasisDexOrderArgs {
  id: number;
  makerQuantity: QuantityInterface;
  takerQuantity: QuantityInterface;
  fillTakerTokenAmount: QuantityInterface;
}

const guard: GuardFunction<TakeOasisDexOrderArgs> = async (
  { id, makerQuantity, takerQuantity, fillTakerTokenAmount = takerQuantity },
  contractAddress,
  environment = getGlobalEnvironment(),
) => {
  const hubAddress = await getHub(contractAddress, environment);
  const { vaultAddress } = await getSettings(hubAddress);

  const minBalance = fillTakerTokenAmount;
  ensureSufficientBalance(minBalance, vaultAddress, environment);

  ensureFundOwner(contractAddress, environment);

  // Ensure fund not shut down.
  // Ensure exchange method is allowed.
  // Ensure not buying/selling of own fund token.
  // Ensure price provided on this asset pair.
  // Ensure price feed data is not outdated.
  // Ensure there are no other open orders for the asset.

  // IF MATCHINGMARKET:
  // Ensure selling quantity is not too low.

  // ensyre take permited
  ensureTakePermitted(
    contractAddress,
    id,
    makerQuantity,
    takerQuantity,
    fillTakerTokenAmount,
    environment,
  );
};

const prepareArgs: PrepareArgsFunction<TakeOasisDexOrderArgs> = async (
  { id, makerQuantity, takerQuantity, fillTakerTokenAmount },
  contractAddress,
  environment = getGlobalEnvironment(),
) => {
  const matchingMarketAdapterAbi = requireMap[Contracts.MatchingMarketAdapter];
  const method = await getFunctionSignature(
    matchingMarketAdapterAbi,
    'takeOrder',
  );
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
    method,
    maker: '0x0000000000000000000000000000000000000000',
    taker: contractAddress,
    makerAssetSymbol: makerQuantity.token.address,
    takerAssetSymbol: takerQuantity.token.address,
    feeRecipient: '0x0000000000000000000000000000000000000000',
    senderAddress: '0x0000000000000000000000000000000000000000',
    makerQuantity,
    takerQuantity,
    makerFee: '0',
    takerFee: '0',
    timestamp: '0',
    salt: '0x0',
    fillTakerTokenAmount,
    dexySignatureMode: 0,
    identifier: id,
    makerAssetData: '0',
    takerAssetData: '0',
    signature: '0x0',
  };
};

const postProcess: PostProcessFunction<
  TakeOasisDexOrderArgs,
  TakeOasisDexOrderResult
> = async receipt => {
  return receipt;
};

const takeOasisDexOrder = withTransactionDecorator(callOnExchange, {
  postProcess,
  prepareArgs,
  guard,
});

export { takeOasisDexOrder };
