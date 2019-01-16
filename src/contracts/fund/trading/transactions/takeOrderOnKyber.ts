import * as web3Utils from 'web3-utils';
import { QuantityInterface } from '@melonproject/token-math';
import { Contracts, Exchanges } from '~/Contracts';
import { getExchangeIndex } from '../calls/getExchangeIndex';
import { emptyAddress } from '~/utils/constants/emptyAddress';
import {
  GuardFunction,
  PrepareArgsFunction,
  transactionFactory,
} from '~/utils/solidity/transactionFactory';
import { getHub } from '../../hub/calls/getHub';
import { getRoutes } from '../../hub/calls/getRoutes';
import { ensureSufficientBalance } from '~/contracts/dependencies/token/guards/ensureSufficientBalance';
import { ensureFundOwner } from '~/contracts/fund/trading/guards/ensureFundOwner';
import { ensureIsNotShutDown } from '~/contracts/fund/hub/guards/ensureIsNotShutDown';
import { ensureKyberTakePermitted } from '../guards/ensureKyberTakePermitted';
import { FunctionSignatures } from '../utils/FunctionSignatures';

// The order needs to be signed by the manager
export interface TakeOrderOnKyberArgs {
  makerQuantity: QuantityInterface;
  takerQuantity: QuantityInterface;
  fillTakerQuantity?: QuantityInterface;
}

const guard: GuardFunction<TakeOrderOnKyberArgs> = async (
  environment,
  { makerQuantity, takerQuantity, fillTakerQuantity = takerQuantity },
  contractAddress,
) => {
  const hubAddress = await getHub(environment, contractAddress);
  const { vaultAddress } = await getRoutes(environment, hubAddress);

  await ensureSufficientBalance(environment, takerQuantity, vaultAddress);
  await ensureFundOwner(environment, contractAddress);
  await ensureIsNotShutDown(environment, hubAddress);

  await ensureKyberTakePermitted(
    environment,
    contractAddress,
    makerQuantity,
    takerQuantity,
    fillTakerQuantity,
  );
};

const prepareArgs: PrepareArgsFunction<TakeOrderOnKyberArgs> = async (
  environment,
  { makerQuantity, takerQuantity, fillTakerQuantity = takerQuantity },
  contractAddress,
) => {
  const exchangeIndex = await getExchangeIndex(environment, contractAddress, {
    exchange: Exchanges.KyberNetwork,
  });

  const takerAddress = takerQuantity.token.address;
  const makerAddress = makerQuantity.token.address;
  const takerAmount = takerQuantity.quantity.toString();
  const makerAmount = makerQuantity.quantity.toString();
  const fillTakerAmount = fillTakerQuantity.quantity.toString();

  const args = [
    exchangeIndex,
    FunctionSignatures.takeOrder,
    [
      emptyAddress,
      emptyAddress,
      makerAddress,
      takerAddress,
      emptyAddress,
      emptyAddress,
    ],
    [makerAmount, takerAmount, 0, 0, 0, 0, fillTakerAmount, 0],
    web3Utils.padLeft('0x0', 64),
    web3Utils.padLeft('0x0', 64),
    web3Utils.padLeft('0x0', 64),
    web3Utils.padLeft('0x0', 64),
  ];

  return args;
};

const takeOrderOnKyber = transactionFactory(
  'callOnExchange',
  Contracts.Trading,
  guard,
  prepareArgs,
);

export { takeOrderOnKyber };
