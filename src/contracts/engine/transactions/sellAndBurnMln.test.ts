import { appendDecimals } from '@melonproject/token-math/token';
import { createQuantity } from '@melonproject/token-math/quantity';
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
import {
  increaseTime,
  Contract,
  deployAndGetContract,
  getContract,
} from '~/utils/solidity';

const shared: any = {};

beforeAll(async () => {
  await initTestEnvironment();
  shared.env = getGlobalEnvironment();
  const mlnAddress = await deployToken('MLN');
  shared.mlnToken = await getToken(mlnAddress);
  shared.version = await deployAndGetContract('version/MockVersion');
  const feedAddress = await deployFeed(shared.mlnToken);
  shared.delay = 30 * 24 * 60 * 60;
  shared.engineAddress = await deployEngine(
    shared.version.options.address,
    feedAddress,
    shared.delay,
    mlnAddress,
  );
  shared.priceSource = getContract(
    Contract.TestingPriceFeed,
    shared.feedAddress,
  );
  shared.engine = getContract(Contract.Engine, shared.engineAddress);
  shared.quantity = createQuantity(
    shared.mlnToken,
    appendDecimals(shared.mlnToken, 1),
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

test('AMGU payment fails when sender not fund', async () => {
  const sender = shared.env.wallet.address;
  const isFund = await shared.version.methods.isFund(sender).call();

  expect(isFund).toBe(false);

  await expect(
    shared.engine.methods
      .payAmguInEther()
      .send({ from: sender, value: 1000000 }),
  ).rejects.toThrow('revert');
});

test('eth can be sent as AMGU from a fund, and it thaws', async () => {
  const sender = shared.env.wallet.address;
  console.log(Object.keys(shared.env.eth.currentProvider));
  const sendEth = 10000000;
  await shared.version.methods.setIsFund(sender).send({ from: sender });
  const isFund = await shared.version.methods.isFund(sender).call();

  expect(isFund).toBe(true);

  await shared.engine.methods
    .payAmguInEther()
    .send({ from: sender, value: sendEth });

  const frozenEth = await shared.engine.methods.frozenEther().call();
  const liquidEth = await shared.engine.methods.liquidEther().call();

  expect(Number(frozenEth)).toBe(sendEth);
  expect(Number(liquidEth)).toBe(0);

  increaseTime(shared.delay);

  await shared.engine.methods.stoke().send({ from: sender });
  const frozenEthPost = await shared.engine.methods.frozenEther().call();
  const liquidEthPost = await shared.engine.methods.liquidEther().call();

  expect(Number(frozenEthPost)).toBe(0);
  expect(Number(liquidEthPost)).toBe(sendEth);
});

test('stoke fails when called too early', async () => {}); // maybe can put this in test above

test('sell and burn', async () => {
  // await approve(shared.quantity, shared.env.wallet.address);
  // await sellAndBurnMln(shared.engineAddress, shared.quantity);
  // expect(true).toBe(true);
});
