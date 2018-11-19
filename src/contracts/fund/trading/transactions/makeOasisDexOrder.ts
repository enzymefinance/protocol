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

export type MakeOasisDexOrderResult = any;

export interface MakeOasisDexOrderArgs {
  maker: Address;
  makerAssetSymbol: string;
  takerAssetSymbol: string;
  makerQuantity: QuantityInterface;
  takerQuantity: QuantityInterface;
}

const guard: GuardFunction<MakeOasisDexOrderArgs> = async (
  { maker, makerAssetSymbol, takerAssetSymbol, makerQuantity, takerQuantity },
  contractAddress,
  environment = getGlobalEnvironment(),
) => {
  const hubAddress = await getHub(contractAddress, environment);
  const { vaultAddress } = await getSettings(hubAddress);

  const minBalance = createQuantity(makerAssetSymbol, makerQuantity.quantity);
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

  ensureMakePermitted(
    contractAddress,
    makerQuantity,
    takerQuantity,
    environment,
  );
};

const prepareArgs: PrepareArgsFunction<MakeOasisDexOrderArgs> = async (
  { maker, makerAssetSymbol, takerAssetSymbol, makerQuantity, takerQuantity },
  contractAddress,
  environment = getGlobalEnvironment(),
) => {
  const matchingMarketAbi = requireMap[Contracts.MatchingMarket];
  const method = await getFunctionSignature(matchingMarketAbi, 'makeOrder');
  const deployment = await getDeployment();
  const matchingMarketAddress = deployment.find(
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
    maker,
    taker: '0x0000000000000000000000000000000000000000',
    makerAssetSymbol,
    takerAssetSymbol,
    feeRecipient: '0x0000000000000000000000000000000000000000',
    senderAddress: '0x0000000000000000000000000000000000000000',
    makerQuantity,
    takerQuantity,
    makerFee: '0',
    takerFee: '0',
    timestamp: '0',
    salt: '0x0',
    fillTakerTokenAmount: '0',
    dexySignatureMode: 0,
    identifier: 0,
    makerAssetData: '0',
    takerAssetData: '0',
    signature: '0x0',
  };
};

const postProcess: PostProcessFunction<
  MakeOasisDexOrderArgs,
  MakeOasisDexOrderResult
> = async receipt => {
  return receipt;
};

const makeOasisDexOrder = withTransactionDecorator(callOnExchange, {
  postProcess,
  prepareArgs,
  guard,
});

export { makeOasisDexOrder };
