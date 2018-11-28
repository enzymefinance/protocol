// tslint:disable:max-line-length
import {
  PrepareArgsFunction,
  withTransactionDecorator,
  GuardFunction,
  PostProcessFunction,
} from '~/utils/solidity/transactionFactory';
import { getDeployment } from '~/utils/solidity/getDeployment';
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
// tslint:enable:max-line-length

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

  console.log(makerQuantity, takerQuantity, fillTakerTokenAmount);

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
    method:
      'takeOrder(address,address[6],uint256[8],bytes32,bytes,bytes,bytes)',
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
  postProcess,
  prepareArgs,
  guard,
  options,
});

export { takeOasisDexOrder };
