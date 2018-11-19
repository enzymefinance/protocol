import {
  PrepareArgsFunction,
  withTransactionDecorator,
  getDeployment,
  GuardFunction,
  PostProcessFunction,
} from '~/utils/solidity';
import { QuantityInterface } from '@melonproject/token-math/quantity';
import { Address } from '@melonproject/token-math/address';
import { getFunctionSignature } from '~/utils/abi/getFunctionSignature';
import { Contracts, requireMap } from '~/Contracts';
import { getExchangeIndex } from '../calls/getExchangeIndex';
import { callOnExchange } from '~/contracts/fund/trading/transactions/callOnExchange';
import { ensureMakePermitted } from '~/contracts/fund/trading/guards/ensureMakePermitted';
import { getGlobalEnvironment } from '~/utils/environment';

export type MakeOasisDexOrderResult = any;

export interface MakeOasisDexOrderArgs {
  maker: Address;
  makerAssetSymbol: string;
  takerAssetSymbol: string;
  makerQuantity: QuantityInterface;
  takerQuantity: QuantityInterface;
}

const guard: GuardFunction<MakeOasisDexOrderArgs> = async (
  { makerQuantity, takerQuantity },
  contractAddress,
  environment = getGlobalEnvironment(),
) => {
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
> = async (receipt, params, contractAddress, environment) => {
  return receipt;
};

const makeOasisDexOrder = withTransactionDecorator(callOnExchange, {
  postProcess,
  prepareArgs,
  guard,
});

export { makeOasisDexOrder };
