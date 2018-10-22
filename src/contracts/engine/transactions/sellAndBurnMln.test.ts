import { Quantity, BigInteger, Token } from '@melonproject/token-math';
import { initTestEnvironment, getGlobalEnvironment } from '~/utils/environment';
import { Address } from '~/utils/types';
import { deploy as deployEngine, sellAndBurnMln } from '..';
import {
  deploy as deployToken,
  approve,
  getToken,
  balanceOf,
} from '~/contracts/dependencies/token';
import { deploy as deployFeed } from '~/contracts/prices';
import { Contract, deployAndGetContract, getContract } from '~/utils/solidity';

const shared: any = {};

beforeAll(async () => {
  await initTestEnvironment();
  shared.env = getGlobalEnvironment();
  const mlnAddress = await deployToken('MLN');
  shared.mlnToken = await getToken(mlnAddress);
  const version = await deployAndGetContract('version/MockVersion');
  const feedAddress = await deployFeed(shared.mlnToken);
  shared.delay = 30 * 24 * 60 * 60;
  shared.engineAddress = await deployEngine(
    version.options.address,
    feedAddress,
    shared.delay,
    mlnAddress,
  );
  shared.priceSource = getContract(
    Contract.TestingPriceFeed,
    shared.feedAddress,
  );
  shared.engine = getContract(Contract.Engine, shared.engineAddress);
  shared.quantity = Quantity.createQuantity(
    shared.mlnToken,
    Token.appendDecimals(shared.mlnToken, 1),
  );
});

test('directly sending eth fails', async () => {
  await expect(
    shared.env.eth.sendTransaction({
      from: shared.env.wallet.address,
      to: shared.engine.options.address,
      value: 1000000,
    }),
  ).rejects.toThrow('revert');
});

test('eth sent via contract selfdestruct is not tracked', async () => {
  const sendEth = 10 ** 18;
  const destructing = await deployAndGetContract('testing/SelfDestructing');
  const preHeldEth = await shared.env.eth.getBalance(
    shared.engine.options.address,
  );

  expect(Number(preHeldEth)).toBe(0);

  await shared.env.eth.sendTransaction({
    from: shared.env.wallet.address,
    to: destructing.options.address,
    value: sendEth,
  });
  await destructing.methods
    .bequeath(shared.engine.options.address)
    .send({ from: shared.env.wallet.address });
  const postHeldEth = await shared.env.eth.getBalance(
    shared.engine.options.address,
  );
  const frozenEth = await shared.engine.methods.frozenEther().call();
  const liquidEth = await shared.engine.methods.liquidEther().call();

  expect(Number(postHeldEth)).toBe(sendEth);
  expect(Number(frozenEth)).toBe(0);
  expect(Number(liquidEth)).toBe(0);
});

test('AMGU payment fails when sender not fund', async () => {});
test('eth can be sent as AMGU from a fund', async () => {});
test('eth sent as AMGU is frozen and thaws', async () => {});
test('sell and burn', async () => {
  // await approve(shared.quantity, shared.env.wallet.address);
  // await sellAndBurnMln(shared.engineAddress, shared.quantity);
  // expect(true).toBe(true);
});
