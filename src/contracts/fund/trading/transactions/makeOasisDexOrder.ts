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
import { getSettings, getHub, ensureIsNotShutDown } from '~/contracts/fund/hub';
import { ensureFundOwner } from '~/contracts/fund/trading/guards/ensureFundOwner';
import * as web3Utils from 'web3-utils';

export type MakeOasisDexOrderResult = any;

export interface MakeOasisDexOrderArgs {
  makerQuantity: QuantityInterface;
  takerQuantity: QuantityInterface;
}

const guard: GuardFunction<MakeOasisDexOrderArgs> = async (
  { makerQuantity, takerQuantity },
  contractAddress,
  environment = getGlobalEnvironment(),
) => {
  const hubAddress = await getHub(contractAddress, environment);
  const { vaultAddress } = await getSettings(hubAddress);

  const minBalance = makerQuantity;
  await ensureSufficientBalance(minBalance, vaultAddress, environment);

  await ensureFundOwner(contractAddress, environment);

  await ensureIsNotShutDown(hubAddress, environment);

  // Ensure fund not shut down.
  // Ensure exchange method is allowed.
  // Ensure not buying/selling of own fund token.
  // Ensure price provided on this asset pair.
  // Ensure price feed data is not outdated.
  // Ensure there are no other open orders for the asset.

  // IF MATCHINGMARKET:
  // Ensure selling quantity is not too low.

  await ensureMakePermitted(
    contractAddress,
    makerQuantity,
    takerQuantity,
    environment,
  );
};

const prepareArgs: PrepareArgsFunction<MakeOasisDexOrderArgs> = async (
  { makerQuantity, takerQuantity },
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
      'makeOrder(address,address[6],uint256[8],bytes32,bytes,bytes,bytes)', // update if function signature changes
    maker: contractAddress,
    taker: '0x0000000000000000000000000000000000000000',
    makerAsset: makerQuantity.token.address,
    takerAsset: takerQuantity.token.address,
    feeRecipient: '0x0000000000000000000000000000000000000000',
    senderAddress: '0x0000000000000000000000000000000000000000',
    makerQuantity,
    takerQuantity,
    makerFee: '0',
    takerFee: '0',
    timestamp: '0',
    salt: '0',
    fillTakerTokenAmount: '0',
    dexySignatureMode: 0,
    identifier: web3Utils.padLeft('0x0', 64),
    makerAssetData: web3Utils.padLeft('0x0', 64),
    takerAssetData: web3Utils.padLeft('0x0', 64),
    signature: web3Utils.padLeft('0x0', 64),
  };
};

const postProcess: PostProcessFunction<
  MakeOasisDexOrderArgs,
  MakeOasisDexOrderResult
> = async receipt => {
  return receipt;
};

const options = { gas: '8000000' };

const makeOasisDexOrder = withTransactionDecorator(callOnExchange, {
  postProcess,
  prepareArgs,
  guard,
  options,
});

export { makeOasisDexOrder };
