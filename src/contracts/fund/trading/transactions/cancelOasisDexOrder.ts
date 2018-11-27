import {
  PrepareArgsFunction,
  withTransactionDecorator,
  GuardFunction,
  PostProcessFunction,
} from '~/utils/solidity/transactionFactory';
import { getDeployment } from '~/utils/solidity/getDeployment';
import { Address } from '@melonproject/token-math/address';
import { getExchangeIndex } from '../calls/getExchangeIndex';
import { callOnExchange } from '~/contracts/fund/trading/transactions/callOnExchange';
import { getGlobalEnvironment } from '~/utils/environment/globalEnvironment';
import { ensureFundOwner } from '~/contracts/fund/trading/guards/ensureFundOwner';
import * as web3Utils from 'web3-utils';

export type CancelOasisDexOrderResult = any;

export interface CancelOasisDexOrderArgs {
  id: number;
  maker: Address;
  makerAsset: Address;
  takerAsset: Address;
}

const guard: GuardFunction<CancelOasisDexOrderArgs> = async (
  { id, maker, makerAsset, takerAsset },
  contractAddress,
  environment = getGlobalEnvironment(),
) => {
  // const hubAddress = await getHub(contractAddress, environment);
  // const { vaultAddress } = await getSettings(hubAddress);

  await ensureFundOwner(contractAddress, environment);
};

const prepareArgs: PrepareArgsFunction<CancelOasisDexOrderArgs> = async (
  { id, maker, makerAsset, takerAsset },
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
      'cancelOrder(address,address[6],uint256[8],bytes32,bytes,bytes,bytes)', // update when function signature changes
    maker,
    taker: '0x0000000000000000000000000000000000000000',
    makerAsset,
    takerAsset,
    feeRecipient: '0x0000000000000000000000000000000000000000',
    senderAddress: '0x0000000000000000000000000000000000000000',
    makerQuantity: '0',
    takerQuantity: '0',
    makerFee: '0',
    takerFee: '0',
    timestamp: '0',
    salt: '0',
    fillTakerTokenAmount: '0',
    dexySignatureMode: 0,
    identifier: id,
    makerAssetData: web3Utils.padLeft('0x0', 64),
    takerAssetData: web3Utils.padLeft('0x0', 64),
    signature: web3Utils.padLeft('0x0', 64),
  };
};

const postProcess: PostProcessFunction<
  CancelOasisDexOrderArgs,
  CancelOasisDexOrderResult
> = async receipt => {
  return {
    id: web3Utils.toDecimal(receipt.events.LogKill.returnValues.id),
  };
};

const options = { gas: '8000000' };

const cancelOasisDexOrder = withTransactionDecorator(callOnExchange, {
  postProcess,
  prepareArgs,
  guard,
  options,
});

export { cancelOasisDexOrder };
