import {
  PrepareArgsFunction,
  withTransactionDecorator,
  getDeployment,
} from '~/utils/solidity';
import { QuantityInterface } from '@melonproject/token-math/quantity';
import { Address } from '@melonproject/token-math/address';
import { getFunctionSignature } from '~/utils/abi/getFunctionSignature';
import { Contracts, requireMap } from '~/Contracts';
import { getExchangeIndex } from '../calls/getExchangeIndex';

export interface MakeOrderOasisDexArgs {
  maker: Address;
  makerAssetSymbol: string;
  takerAssetSymbol: string;
  makerQuantity: QuantityInterface;
  takerQuantity: QuantityInterface;
}

const guard: GuardFunction = async (params, ContractAddress, environment) => {
  const deployment = await getDeployment();
  const exchangeAddress = deployment.find(o => o.name === 'MatchingMarket')
    .exchangeAddress;
  //TODO: preflights
  // const preflightCheck = await preflightMakeOrder(environment, {
  //   fundContract,
  //   exchangeAddress,
  //   makerAssetSymbol,
  //   takerAssetSymbol,
  //   makerQuantity,
  //   takerQuantity,
  // });

  // ensure(
  //   preflightCheck,
  //   'One of the pre-conditions of the function makeOrder failed on pre-flight.',
  //   );
};

const prepareArgs: PrepareArgsFunction<MakeOasisDexOrderArgs> = async (
  { maker, makerAssetSymbol, takerAssetSymbol, makerQuantity, takerQuantity },
  contractAddress,
  environment,
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
    dexySignatureMode = 0,
    identifier = 0,
    makerAssetData = '0',
    takerAssetData = '0',
    signature = '0x0',
  };
};

const postProcess = async (receipt, params, contractAddress, environment) => {
  return receipt;
};

const makeOasisDexOrder = withTransactionDecorator(callOnExchange, {
  postProcess,
  prepareArgs,
  guard,
});
