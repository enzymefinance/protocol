import { BigNumber } from 'bignumber.js';
import { appendDecimals } from '@melonproject/token-math/token';
import { createQuantity } from '@melonproject/token-math/quantity';
import { getPrice } from '@melonproject/token-math/price';
import { initTestEnvironment, getGlobalEnvironment } from '~/utils/environment';
import { Address } from '~/utils/types';
import { deploy as deployEngine, sellAndBurnMln } from '..';
import {
  deploy as deployToken,
  approve,
  getToken,
  balanceOf,
} from '~/contracts/dependencies/token';
import { deploy as deployFeed, update } from '~/contracts/prices';
import {
  increaseTime,
  deployAndGetContract,
  getContract,
} from '~/utils/solidity';
import { Contracts } from '~/Contracts';

const shared: any = {};

// TODO: use the actual sellAndBurnMln typescript function rather than testing like this
beforeAll(async () => {
  await initTestEnvironment();
  shared.env = getGlobalEnvironment();
  shared.accounts = await shared.env.eth.getAccounts();
  const wethAddress = await deployToken('ETH');
  shared.mln = await deployAndGetContract('dependencies/token/BurnableToken', [
    'MLN',
    18,
    '',
  ]);
  shared.weth = await getContract(Contracts.StandardToken, wethAddress);
  shared.version = await deployAndGetContract('version/MockVersion');
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
  await shared.feed.methods
    .update(
      [shared.weth.options.address, shared.mln.options.address],
      [
        new BigNumber(10 ** 18).toFixed(),
        new BigNumber(0.0588 * 10 ** 18).toFixed(),
      ],
    )
    .send({ from: shared.env.wallet.address, gas: 8000000 });
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

test('eth sent as AMGU from a "fund" thaws and can be bought', async () => {
  const sender = shared.env.wallet.address;
  const sendEth = 1000000794359;
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

  await expect(
    // early call to stoke fails
    shared.engine.methods.stoke().send({ from: shared.accounts[1] }),
  ).rejects.toThrow('revert');

  const enginePrice = await shared.engine.methods.enginePrice().call();
  const premiumPercent = new BigNumber(
    await shared.engine.methods.premiumPercent().call(),
  );
  const ethPerMln = new BigNumber(
    (await shared.feed.methods
      .getPrice(shared.mln.options.address)
      .call()).price,
  );
  const premiumPrice = ethPerMln
    .plus(ethPerMln.times(premiumPercent).dividedBy(100))
    .floor();

  expect(Number(enginePrice)).toBe(Number(premiumPrice));

  const sendMln = new BigNumber(sendEth)
    .times(10 ** 18)
    .dividedBy(premiumPrice)
    .ceil();
  await shared.mln.methods
    .approve(shared.engine.options.address, sendMln.toFixed())
    .send({ from: sender });

  await expect(
    // throws when trying to burn without liquid ETH
    shared.engine.methods
      .sellAndBurnMln(sendMln.toFixed())
      .send({ from: sender }),
  ).rejects.toThrow('revert');

  increaseTime(shared.delay);
  await shared.engine.methods.stoke().send({ from: shared.accounts[1] });
  const frozenEthPost = await shared.engine.methods.frozenEther().call();
  const liquidEthPost = await shared.engine.methods.liquidEther().call();

  expect(Number(frozenEthPost)).toBe(0);
  expect(Number(liquidEthPost)).toBe(sendEth);

  const burnerPreMln = await shared.mln.methods.balanceOf(sender).call();
  const burnerPreEth = await shared.env.eth.getBalance(sender);
  const enginePreMln = await shared.mln.methods
    .balanceOf(shared.engine.options.address)
    .call();
  const enginePreEth = await shared.env.eth.getBalance(
    shared.engine.options.address,
  );
  const preMlnTotalSupply = await shared.mln.methods.totalSupply().call();
  const receipt = await shared.engine.methods
    .sellAndBurnMln(sendMln.toFixed())
    .send({ from: sender, gasPrice: 1 });
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

  expect(burnerPostMln).toBe(
    new BigNumber(burnerPreMln).minus(sendMln).toFixed(),
  );
  expect(burnerPostEth).toBe(
    new BigNumber(burnerPreEth)
      .plus(sendEth)
      .minus(gasUsed)
      .toFixed(),
  );
  expect(enginePostMln).toBe(enginePostMln);
  expect(Number(enginePostMln)).toBe(0);
  expect(new BigNumber(enginePostEth).toFixed()).toBe(
    new BigNumber(enginePreEth).minus(sendEth).toFixed(),
  );
  expect(postMlnTotalSupply).toBe(
    new BigNumber(preMlnTotalSupply).minus(sendMln).toFixed(),
  );
});

test('Other contracts can pay amgu on function calls', async () => {});
test('Engine price and premium computes at multiple values', async () => {});
