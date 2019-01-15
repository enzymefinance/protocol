import {
  add,
  BigInteger,
  createPrice,
  createQuantity,
  divide,
  isEqual,
  multiply,
  subtract,
  toBI,
} from '@melonproject/token-math';

import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { deployToken } from '~/contracts/dependencies/token/transactions/deploy';
import { approve } from '~/contracts/dependencies/token/transactions/approve';
import { deployTestingPriceFeed } from '~/contracts/prices/transactions/deployTestingPriceFeed';
import { update } from '~/contracts/prices/transactions/update';
import { getContract } from '~/utils/solidity/getContract';
import { deployContract } from '~/utils/solidity/deployContract';
import { Contracts } from '~/Contracts';
import { increaseTime } from '~/utils/evm';

import { thaw } from './thaw';
import { sellAndBurnMln } from './sellAndBurnMln';
import { deployEngine } from './deployEngine';

describe('sellAndBurnMln', () => {
  const shared: any = {};

  beforeAll(async () => {
    shared.env = await initTestEnvironment();
    shared.accounts = await shared.env.eth.getAccounts();
    const wethAddress = await deployToken(shared.env, 'ETH');
    shared.mln = getContract(
      shared.env,
      Contracts.BurnableToken,
      await deployContract(shared.env, Contracts.BurnableToken, [
        'MLN',
        18,
        '',
      ]),
    );

    shared.weth = await getContract(
      shared.env,
      Contracts.StandardToken,
      wethAddress,
    );
    shared.version = getContract(
      shared.env,
      Contracts.MockVersion,
      await deployContract(shared.env, Contracts.MockVersion),
    );
    shared.registry = getContract(
      shared.env,
      Contracts.MockRegistry,
      await deployContract(shared.env, Contracts.MockRegistry),
    );
    const feedAddress = await deployTestingPriceFeed(
      shared.env,
      await getToken(shared.env, wethAddress),
    );
    shared.feed = await getContract(
      shared.env,
      Contracts.TestingPriceFeed,
      feedAddress,
    );
    shared.delay = 30 * 24 * 60 * 60;
    shared.engineAddress = await deployEngine(shared.env, {
      delay: shared.delay,
    });
    shared.priceSource = await getContract(
      shared.env,
      Contracts.TestingPriceFeed,
      feedAddress,
    );
    shared.engine = getContract(
      shared.env,
      Contracts.Engine,
      shared.engineAddress,
    );
    await shared.registry.methods
      .setPriceSource(shared.priceSource.options.address)
      .send({ from: shared.accounts[0] });
    await shared.registry.methods
      .setMlnToken(shared.mln.options.address)
      .send({ from: shared.accounts[0] });
    await shared.engine.methods
      .setRegistry(shared.registry.options.address)
      .send({ from: shared.accounts[0], gas: 8000000 });

    await update(shared.env, feedAddress, [
      createPrice(
        createQuantity(await getToken(shared.env, wethAddress), 1),
        createQuantity(await getToken(shared.env, wethAddress), 1),
      ),
      createPrice(
        createQuantity(
          await getToken(shared.env, shared.mln.options.address),
          1,
        ),
        createQuantity(await getToken(shared.env, wethAddress), 2.94),
      ),
    ]);
  });

  it('directly sending eth fails', async () => {
    await expect(
      shared.env.eth.sendTransaction({
        from: shared.env.wallet.address,
        to: shared.engine.options.address,
        value: 1,
      }),
    ).rejects.toThrow('revert');
  });

  it('eth sent via contract selfdestruct is not tracked', async () => {
    const sendEth = new BigInteger('100000000');
    const destructing = getContract(
      shared.env,
      Contracts.SelfDestructing,
      await deployContract(shared.env, Contracts.SelfDestructing),
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

  it('AMGU payment fails when sender not fund', async () => {
    const sender = shared.env.wallet.address;
    const isFund = await shared.registry.methods.isFund(sender).call();

    expect(isFund).toBe(false);

    await expect(
      shared.engine.methods
        .payAmguInEther()
        .send({ from: sender, value: 1000000 }),
    ).rejects.toThrow('revert');
  });

  it('eth sent as AMGU from a "fund" thaws and can be bought', async () => {
    const sender = shared.env.wallet.address;
    const sendEth = new BigInteger('100000');
    await shared.registry.methods.setIsFund(sender).send({ from: sender });
    const isFund = await shared.registry.methods.isFund(sender).call();

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
      await getToken(shared.env, shared.mln.options.address),
      divide(
        multiply(sendEth, new BigInteger('1000000000000000000')),
        premiumPrice,
      ),
    );

    await approve(shared.env, {
      howMuch: sendMln,
      spender: shared.engine.options.address,
    });

    await expect(
      // throws when trying to burn without liquid ETH
      sellAndBurnMln(shared.env, shared.engine.options.address, {
        quantity: sendMln,
      }),
    ).rejects.toThrow('revert');

    await increaseTime(shared.env, shared.delay);

    await thaw(shared.env, shared.engine.options.address);
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

    const receipt = await sellAndBurnMln(
      shared.env,
      shared.engine.options.address,
      {
        quantity: sendMln,
      },
    );

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
      `${subtract(toBI(burnerPreMln), sendMln.quantity)}`,
    );
    expect(burnerPostEth).toBe(
      `${subtract(
        add(toBI(burnerPreEth), toBI(ethPurchased)),
        multiply(toBI(gasUsed), toBI(shared.env.options.gasPrice)),
      )}`,
    );
    expect(enginePostMln).toBe(enginePostMln);
    expect(`${enginePostMln}`).toBe('0');
    expect(enginePostEth).toBe(
      `${subtract(toBI(enginePreEth), toBI(ethPurchased))}`,
    );
    expect(postMlnTotalSupply).toBe(
      `${subtract(toBI(preMlnTotalSupply), sendMln.quantity)}`,
    );
  });

  it('Other contracts can pay amgu on function calls', async () => {});
  it('Engine price and premium computes at multiple values', async () => {});
});
