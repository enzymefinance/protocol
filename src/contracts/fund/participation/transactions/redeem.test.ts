// import {
//   BigInteger,
//   add,
//   subtract,
//   divide,
//   multiply,
//   isEqual,
// } from '@melonproject/token-math/bigInteger';
import { createQuantity } from '@melonproject/token-math/quantity';
import { getPrice } from '@melonproject/token-math/price';
import { initTestEnvironment } from '~/utils/environment';
import {
  deploy as deployToken,
  getToken,
} from '~/contracts/dependencies/token';
import { deploy as deployFeed, update } from '~/contracts/prices';
import { getContract, deploy as deployContract } from '~/utils/solidity';
import { Contracts } from '~/Contracts';
import { deployMockSystem } from '~/utils';
import { redeem } from '..';

let shared: any = {};

beforeAll(async () => {
  shared.env = await initTestEnvironment();
  shared = Object.assign(shared, await deployMockSystem());
  shared.accounts = await shared.env.eth.getAccounts();
  // const wethAddress = await deployToken('ETH');
  // shared.mln = getContract(
  //   Contracts.BurnableToken,
  //   await deployContract(Contracts.BurnableToken, ['MLN', 18, '']),
  // );
  // shared.weth = await getContract(Contracts.StandardToken, wethAddress);
  // const newPrice = getPrice(
  //   createQuantity(await getToken(shared.mln.options.address), 1),
  //   createQuantity(await getToken(wethAddress), 2.94),
  //   true,
  // );
  // await update(feedAddress, [newPrice], true);
});

test('Redeem with no shares fails', async () => {
  const errorMessage = 'Sender does not have enough shares to fulfill request';

  await expect(redeem(shared.participation.options.address)).rejects.toThrow(
    'does not own shares of the fund',
  );

  await expect(
    shared.participation.methods
      .redeem()
      .send({ from: shared.env.wallet.address }),
  ).rejects.toThrow(errorMessage);
});

test('', async () => {});
