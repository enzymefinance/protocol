import {
  BigInteger,
  add,
  subtract,
  divide,
  multiply,
  isEqual,
} from '@melonproject/token-math/bigInteger';
import { createQuantity } from '@melonproject/token-math/quantity';
import { getPrice } from '@melonproject/token-math/price';
import { initTestEnvironment } from '~/utils/environment';
import { deploy as deployEngine, sellAndBurnMln } from '..';
import {
  deploy as deployToken,
  approve,
  getToken,
} from '~/contracts/dependencies/token';
import { deploy as deployFeed, update } from '~/contracts/prices';
import {
  increaseTime,
  getContract,
  deploy as deployContract,
} from '~/utils/solidity';
import { Contracts } from '~/Contracts';
import { thaw } from './thaw';

const shared: any = {};

beforeAll(async () => {
  shared.env = await initTestEnvironment();
  shared.accounts = await shared.env.eth.getAccounts();
  const wethAddress = await deployToken('ETH');
  shared.mln = getContract(
    Contracts.BurnableToken,
    await deployContract(Contracts.BurnableToken, ['MLN', 18, '']),
  );
  shared.weth = await getContract(Contracts.StandardToken, wethAddress);
  shared.version = getContract(
    Contracts.MockVersion,
    await deployContract(Contracts.MockVersion),
  );
  const feedAddress = await deployFeed(await getToken(wethAddress));
  shared.feed = await getContract(Contracts.TestingPriceFeed, feedAddress);
  shared.delay = 30 * 24 * 60 * 60;
  shared.engineAddress = await deployEngine(
    shared.version.options.address,
    feedAddress,
    shared.delay,
    shared.mln.options.address,
  );
  shared.priceSource = await getContract(
    Contracts.TestingPriceFeed,
    feedAddress,
  );
  shared.engine = getContract(Contracts.Engine, shared.engineAddress);
  const newPrice = getPrice(
    createQuantity(await getToken(shared.mln.options.address), 1),
    createQuantity(await getToken(wethAddress), 2.94),
    true,
  );
  await update(feedAddress, [newPrice], true);
});

test('directly sending eth fails', async () => {
  await expect(
    shared.env.eth.sendTransaction({
      from: shared.env.wallet.address,
      to: shared.engine.options.address,
      value: 1,
    }),
  ).rejects.toThrow('revert');
});

test('eth sent via contract selfdestruct is not tracked', async () => {
  const sendEth = new BigInteger('100000000');
  const destructing = getContract(
    Contracts.SelfDestructing,
    await deployContract(Contracts.SelfDestructing),
  );
  const preHeldEth = await shared.env.eth.getBalance(
    shared.engine.options.address,
  );

  expect(Number(preHeldEth)).toBe(0);

  await shared.env.eth.sendTransaction({
    from: shared.env.wallet.address,
    to: destructing.options.address,
    value: Number(sendEth),
  });
  await destructing.methods
    .bequeath(shared.engine.options.address)
    .send({ from: shared.env.wallet.address });
  const postHeldEth = await shared.env.eth.getBalance(
    shared.engine.options.address,
  );
  const frozenEth = await shared.engine.methods.frozenEther().call();
  const liquidEth = await shared.engine.methods.liquidEther().call();

  expect(isEqual(new BigInteger(postHeldEth), sendEth));
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

test('eth sent as AMGU from a "fund" thaws and can be bought', async () => {
  const sender = shared.env.wallet.address;
  const sendEth = new BigInteger('100000');
  await shared.version.methods.setIsFund(sender).send({ from: sender });
  const isFund = await shared.version.methods.isFund(sender).call();

  expect(isFund).toBe(true);

  await shared.engine.methods
    .payAmguInEther()
    .send({ from: sender, value: Number(sendEth) });

  const frozenEth = await shared.engine.methods.frozenEther().call();
  const liquidEth = await shared.engine.methods.liquidEther().call();

  expect(isEqual(new BigInteger(frozenEth), sendEth));
  expect(Number(liquidEth)).toBe(0);

  await expect(
    // early call to thaw fails
    shared.engine.methods.thaw().send({ from: shared.accounts[1] }),
  ).rejects.toThrow('revert');

  const enginePrice = await shared.engine.methods.enginePrice().call();

  const premiumPercent = new BigInteger(
    await shared.engine.methods.premiumPercent().call(),
  );

  const ethPerMln = new BigInteger(
    (await shared.feed.methods
      .getPrice(shared.mln.options.address)
      .call()).price,
  );

  const premiumPrice = add(
    ethPerMln,
    divide(multiply(ethPerMln, premiumPercent), new BigInteger(100)),
  );

  expect(`${enginePrice}`).toBe(`${premiumPrice}`);

  const sendMln = createQuantity(
    await getToken(shared.mln.options.address),
    divide(
      multiply(sendEth, new BigInteger('1000000000000000000')),
      premiumPrice,
    ),
  );

  await approve({
    howMuch: sendMln,
    spender: shared.engine.options.address,
  });

  await expect(
    // throws when trying to burn without liquid ETH
    sellAndBurnMln(shared.engine.options.address, { quantity: sendMln }),
  ).rejects.toThrow('revert');

  await increaseTime(shared.delay);

  await thaw(shared.engine.options.address);
  const frozenEthPost = await shared.engine.methods.frozenEther().call();
  const liquidEthPost = await shared.engine.methods.liquidEther().call();

  expect(Number(frozenEthPost)).toBe(0);
  expect(isEqual(new BigInteger(liquidEthPost), sendEth));

  const burnerPreMln = await shared.mln.methods.balanceOf(sender).call();
  const burnerPreEth = await shared.env.eth.getBalance(sender);
  const enginePreEth = await shared.env.eth.getBalance(
    shared.engine.options.address,
  );
  const preMlnTotalSupply = await shared.mln.methods.totalSupply().call();
  const ethPurchased = await shared.engine.methods
    .ethPayoutForMlnAmount(`${sendMln.quantity}`)
    .call();

  const receipt = await sellAndBurnMln(shared.engine.options.address, {
    quantity: sendMln,
  });

  const gasUsed = receipt.gasUsed;
  const burnerPostMln = await shared.mln.methods.balanceOf(sender).call();
  const burnerPostEth = await shared.env.eth.getBalance(sender);
  const enginePostMln = await shared.mln.methods
    .balanceOf(shared.engine.options.address)
    .call();
  const enginePostEth = await shared.env.eth.getBalance(
    shared.engine.options.address,
  );
  const postMlnTotalSupply = await shared.mln.methods.totalSupply().call();

  expect(burnerPostMln).toBe(`${subtract(burnerPreMln, sendMln.quantity)}`);
  expect(burnerPostEth).toBe(
    `${subtract(
      add(burnerPreEth, ethPurchased),
      multiply(gasUsed, shared.env.options.gasPrice),
    )}`,
  );
  expect(enginePostMln).toBe(enginePostMln);
  expect(`${enginePostMln}`).toBe('0');
  expect(enginePostEth).toBe(`${subtract(enginePreEth, ethPurchased)}`);
  expect(postMlnTotalSupply).toBe(
    `${subtract(preMlnTotalSupply, sendMln.quantity)}`,
  );
});

test('Other contracts can pay amgu on function calls', async () => {});
test('Engine price and premium computes at multiple values', async () => {});
