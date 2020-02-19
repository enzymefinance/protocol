import { BN, toWei } from 'web3-utils';
import { deploy } from '~/deploy/utils/deploy-contract';
import web3 from '~/deploy/utils/get-web3';
import { BNExpDiv } from '~/tests/utils/BNmath';
import { CONTRACT_NAMES } from '~/tests/utils/constants';
import { increaseTime } from '~/tests/utils/rpc';

describe('sell-and-burn-mln', () => {
  let deployer, altUser;
  let defaultTxOpts, altUserTxOpts;
  let contracts;
  const delay = 30 * 24 * 60 * 60; // 30 days

  beforeAll(async () => {
    const accounts = await web3.eth.getAccounts();
    [deployer, altUser] = accounts;
    defaultTxOpts = { from: deployer, gas: 8000000 };
    altUserTxOpts = { ...defaultTxOpts, from: altUser };

    const weth = await deploy(CONTRACT_NAMES.PREMINED_TOKEN, ['WETH', 18, '']);
    const mln = await deploy(CONTRACT_NAMES.BURNABLE_TOKEN, ['MLN', 18, '']);
    const version = await deploy(CONTRACT_NAMES.MOCK_VERSION);
    const registry = await deploy(CONTRACT_NAMES.MOCK_REGISTRY);
    const priceSource = await deploy(
      CONTRACT_NAMES.TESTING_PRICEFEED,
      [weth.options.address, 18]
    );
    const engine = await deploy(
      CONTRACT_NAMES.ENGINE,
      [delay, registry.options.address]
    );
    contracts = { engine, mln, priceSource, registry, version }

    await registry.methods
      .setPriceSource(priceSource.options.address)
      .send(defaultTxOpts);
    await registry.methods
      .setMlnToken(mln.options.address)
      .send(defaultTxOpts);
    await engine.methods
      .setRegistry(registry.options.address)
      .send(defaultTxOpts);
    await priceSource.methods
      .update(
        [weth.options.address, mln.options.address],
        [toWei('1', 'ether'), toWei('2', 'ether')]
      )
      .send(defaultTxOpts);
  });

  test('directly sending eth fails', async () => {
    const { engine } = contracts;
    await expect(
      web3.eth
        .sendTransaction({
          from: deployer,
          to: engine.options.address,
          value: 1,
          gas: 8000000
        })
    ).rejects.toThrow('revert');
  });

  test('eth sent via contract selfdestruct is not tracked', async () => {
    const { engine } = contracts;

    const sendAmount = toWei('0.1', 'gwei');
    const selfDestructing = await deploy(CONTRACT_NAMES.SELF_DESTRUCTING);

    const preEthEngine = await web3.eth
      .getBalance(engine.options.address);
    expect(new BN(preEthEngine)).bigNumberEq(new BN(0));

    await web3.eth
      .sendTransaction({
        from: deployer,
        to: selfDestructing.options.address,
        value: sendAmount,
        gas: 8000000
      });
    await selfDestructing.methods
      .bequeath(engine.options.address)
      .send(defaultTxOpts);

    const postEthEngine = await web3.eth.getBalance(engine.options.address);
    const postFrozenEth = await engine.methods.frozenEther().call();
    const postLiquidEth = await engine.methods.liquidEther().call();

    expect(new BN(postEthEngine)).bigNumberEq(new BN(sendAmount));
    expect(new BN(postFrozenEth)).bigNumberEq(new BN(0));
    expect(new BN(postLiquidEth)).bigNumberEq(new BN(0));
  });

  test('AMGU payment fails when sender not fund', async () => {
    const { engine, registry } = contracts;
    const sendAmount = toWei('0.001', 'gwei');

    const isFund = await registry.methods.isFund(deployer).call();
    expect(isFund).toBe(false);

    await expect(
      engine.methods
        .payAmguInEther()
        .send({ ...defaultTxOpts, value: sendAmount })
    ).rejects.toThrow('revert');
  });

  test('eth sent as AMGU from a "fund" thaws and can be bought', async () => {
    const { engine, priceSource, mln, registry } = contracts;

    const sendAmountEth = '100000';

    await registry.methods.setIsFund(deployer).send(defaultTxOpts);
    const isFund = await registry.methods.isFund(deployer).call();
    expect(isFund).toBe(true);

    await engine.methods
      .payAmguInEther()
      .send({ ...defaultTxOpts, value: sendAmountEth });

    const preFrozenEth = new BN(await engine.methods.frozenEther().call());
    const preLiquidEth = new BN(await engine.methods.liquidEther().call());

    expect(preFrozenEth).bigNumberEq(new BN(sendAmountEth));
    expect(preLiquidEth).bigNumberEq(new BN(0));

    // early call to thaw fails
    await expect(
      engine.methods.thaw().send(altUserTxOpts),
    ).rejects.toThrow('revert');

    const enginePrice = new BN(await engine.methods.enginePrice().call());
    const premiumPercent = new BN(
      await engine.methods.premiumPercent().call()
    );
    const ethPerMln = new BN(
      (await priceSource.methods.getPrice(mln.options.address).call()).price,
    );
    const premiumPrice =
      ethPerMln.add(ethPerMln.mul(premiumPercent).div(new BN(100)));

    expect(enginePrice).bigNumberEq(premiumPrice);

    const sendAmountMln = BNExpDiv(
      new BN(sendAmountEth),
      premiumPrice
    ).toString();

    await mln.methods
      .approve(engine.options.address, sendAmountMln)
      .send(defaultTxOpts);

    await expect(
      // throws when trying to burn without liquid ETH
      engine.methods.sellAndBurnMln(sendAmountMln).send(defaultTxOpts)
    ).rejects.toThrow('revert');

    await increaseTime(delay);

    await engine.methods.thaw().send(altUserTxOpts);

    const postFrozenEth = new BN(await engine.methods.frozenEther().call());
    const postLiquidEth = new BN(await engine.methods.liquidEther().call());

    expect(postFrozenEth).bigNumberEq(new BN(0));
    expect(postLiquidEth).bigNumberEq(new BN(sendAmountEth));

    const preBurnerMln = new BN(await mln.methods.balanceOf(deployer).call());
    const preBurnerEth = new BN(await web3.eth.getBalance(deployer));
    const preEngineEth = new BN(
      await web3.eth.getBalance(engine.options.address)
    );
    const preMlnTotalSupply = new BN(await mln.methods.totalSupply().call());
    const expectedEthPurchased = new BN(
      await engine.methods.ethPayoutForMlnAmount(sendAmountMln).call()
    );

    const gasPrice = new BN(toWei('2', 'gwei'));
    const receipt = await engine.methods
      .sellAndBurnMln(sendAmountMln)
      .send({ ...defaultTxOpts, gasPrice });

    const gasUsedCost =
      new BN(receipt.gasUsed).mul(gasPrice);
    const postBurnerEth = new BN(await web3.eth.getBalance(deployer));
    const postBurnerMln = new BN(await mln.methods.balanceOf(deployer).call());
    const postEngineEth = new BN(
      await web3.eth.getBalance(engine.options.address)
    );
    const postEngineMln = new BN(
      await mln.methods.balanceOf(engine.options.address).call()
    );
    const postMlnTotalSupply = new BN(await mln.methods.totalSupply().call());

    expect(postBurnerMln).bigNumberEq(preBurnerMln.sub(new BN(sendAmountMln)));
    expect(postBurnerEth).bigNumberEq(
      preBurnerEth.sub(gasUsedCost).add(expectedEthPurchased)
    );
    expect(postEngineMln).bigNumberEq(new BN(0));
    expect(postEngineEth).bigNumberEq(preEngineEth.sub(expectedEthPurchased));

    expect(
      postMlnTotalSupply).bigNumberEq(preMlnTotalSupply.sub(new BN(sendAmountMln))
    );
  });

  // TODO:
  // test('Other contracts can pay amgu on function calls', async () => {});
  // test('Engine price and premium computes at multiple values', async () => {});
});
