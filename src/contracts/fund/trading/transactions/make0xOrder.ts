import * as web3Utils from 'web3-utils';
import { assetDataUtils, SignedOrder } from '0x.js';
import { createQuantity } from '@melonproject/token-math/quantity';

import { Contracts } from '~/Contracts';

// tslint:disable:max-line-length
import { getExchangeIndex } from '../calls/getExchangeIndex';
import { NULL_ADDRESS } from './take0xOrder';
import {
  GuardFunction,
  PrepareArgsFunction,
  PostProcessFunction,
  transactionFactory,
} from '~/utils/solidity/transactionFactory';
import { getHub } from '../../hub/calls/getHub';
import { getSettings } from '../../hub/calls/getSettings';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { ensureSufficientBalance } from '~/contracts/dependencies/token/guards/ensureSufficientBalance';
import { getDeployment } from '~/utils/solidity/getDeployment';
// tslint:enable:max-line-length

// The order needs to be signed by the manager
interface Make0xOrderArgs {
  signedOrder: SignedOrder;
}

const guard: GuardFunction<Make0xOrderArgs> = async (
  { signedOrder },
  contractAddress,
  environment,
) => {
  const hubAddress = await getHub(contractAddress, environment);
  const { vaultAddress } = await getSettings(hubAddress);
  const makerTokenAddress = assetDataUtils.decodeERC20AssetData(
    signedOrder.makerAssetData,
  ).tokenAddress;
  const makerToken = await getToken(makerTokenAddress);

  const makerQuantity = createQuantity(
    makerToken,
    signedOrder.makerAssetAmount.toString(),
  );

  await ensureSufficientBalance(makerQuantity, vaultAddress, environment);
};

const prepareArgs: PrepareArgsFunction<Make0xOrderArgs> = async (
  { signedOrder },
  contractAddress,
  environment,
) => {
  const deployment = await getDeployment(environment);

  const zeroExAddress = deployment.exchangeConfigs.find(
    o => o.name === 'ZeroEx',
  ).exchangeAddress;

  const exchangeIndex = await getExchangeIndex(
    zeroExAddress,
    contractAddress,
    environment,
  );

  const makerTokenAddress = assetDataUtils.decodeERC20AssetData(
    signedOrder.makerAssetData,
  ).tokenAddress;
  const takerTokenAddress = assetDataUtils.decodeERC20AssetData(
    signedOrder.takerAssetData,
  ).tokenAddress;

  const args = [
    exchangeIndex,
    'makeOrder(address,address[6],uint256[8],bytes32,bytes,bytes,bytes)',
    [
      contractAddress.toString(),
      NULL_ADDRESS,
      makerTokenAddress,
      takerTokenAddress,
      signedOrder.feeRecipientAddress,
      NULL_ADDRESS,
    ],
    [
      signedOrder.makerAssetAmount.toFixed(),
      signedOrder.takerAssetAmount.toFixed(),
      signedOrder.makerFee.toFixed(),
      signedOrder.takerFee.toFixed(),
      signedOrder.expirationTimeSeconds.toFixed(),
      signedOrder.salt.toFixed(),
      0,
      0,
    ],
    web3Utils.padLeft('0x0', 64),
    signedOrder.makerAssetData,
    signedOrder.takerAssetData,
    `${signedOrder.signature}`,
  ];

  return args;
};

const postProcess: PostProcessFunction<
  Make0xOrderArgs,
  boolean
> = async receipt => {
  // console.log(JSON.stringify(receipt, null, 2));
  return true;
};

const make0xOrder = transactionFactory(
  'callOnExchange',
  Contracts.Trading,
  guard,
  prepareArgs,
  postProcess,
);

export { make0xOrder };
