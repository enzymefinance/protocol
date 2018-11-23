import { transactionFactory, PrepareArgsFunction } from '~/utils/solidity';
import { ensure } from '~/utils/guards';
import { Address } from '@melonproject/token-math/address';
import { Contracts } from '~/Contracts';
import { getToken, balanceOf } from '~/contracts/dependencies/token';
import { getHub, getManager, ensureIsNotShutDown } from '~/contracts/fund/hub';

export interface Make0xOrderArgs {
  targetExchange: Address;
  orderAddresses: Address[];
  orderValues: number[];
  identifier: string[];
  makerAssetData: string[];
  takerAssetData: string[];
  signature: string[];
}

const guard = async (params, contractAddress, environment) => {
  const hub = await getHub(contractAddress, environment);
  await ensureIsNotShutDown(hub, environment);

  ensure(
    params.orderAddresses.length <= 6 && params.orderValues.length <= 8,
    'Array size out of bounds',
  );

  const manager = getManager(contractAddress, environment);
  ensure(manager === environment.wallet.address, 'Sender is not a manager');

  // TODO: construct Order and check if signature is valid
};

const prepareArgs: PrepareArgsFunction<Make0xOrderArgs> = async ({
  targetExchange,
  orderAddresses,
  orderValues,
  identifier,
  makerAssetData,
  takerAssetData,
  signature,
}) => [
  `${targetExchange}`,
  orderAddresses.map(addr => `${addr}`),
  orderValues,
  identifier,
  makerAssetData,
  takerAssetData,
  signature,
];

const make0xOrder = transactionFactory<Make0xOrderArgs, undefined>(
  'makeOrder',
  Contracts.ZeroExAdapter,
  guard,
  prepareArgs,
  undefined,
);

export { make0xOrder };
