import { BN, toWei } from 'web3-utils';
import { BNExpDiv } from '~/tests/utils/new/BNmath';
import { CONTRACT_NAMES } from '~/tests/utils/new/constants';
const web3 = require('../../../../deploy/utils/get-web3');
const {deploy} = require('../../../../deploy/utils/deploy-contract');

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

  it('directly sending eth fails', async () => {
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

  it('eth sent via contract selfdestruct is not tracked', async () => {
    const { engine } = contracts;

    const sendAmount = toWei('0.1', 'gwei');
    const selfDestructing = await deploy(CONTRACT_NAMES.SELF_DESTRUCTING);

    const preEthEngine = await web3.eth
      .getBalance(engine.options.address);
    expect(new BN(preEthEngine)).toEqualBN(new BN(0));

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

    expect(new BN(postEthEngine)).toEqualBN(new BN(sendAmount));
    expect(new BN(postFrozenEth)).toEqualBN(new BN(0));
    expect(new BN(postLiquidEth)).toEqualBN(new BN(0));
  });

  it('AMGU payment fails when sender not fund', async () => {
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

  it('eth sent as AMGU from a "fund" thaws and can be bought', async () => {
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

    expect(preFrozenEth).toEqualBN(new BN(sendAmountEth));
    expect(preLiquidEth).toEqualBN(new BN(0));

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

    expect(enginePrice).toEqualBN(premiumPrice);

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

    // Increment next block time and mine block
    web3.eth.currentProvider.send(
      {
        id: 123,
        jsonrpc: '2.0',
        method: 'evm_increaseTime',
        params: [delay], // 30 days
      },
      (err, res) => {},
    );

    await engine.methods.thaw().send(altUserTxOpts);

    const postFrozenEth = new BN(await engine.methods.frozenEther().call());
    const postLiquidEth = new BN(await engine.methods.liquidEther().call());

    expect(postFrozenEth).toEqualBN(new BN(0));
    expect(postLiquidEth).toEqualBN(new BN(sendAmountEth));

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

    expect(postBurnerMln).toEqualBN(preBurnerMln.sub(new BN(sendAmountMln)));
    expect(postBurnerEth).toEqualBN(
      preBurnerEth.sub(gasUsedCost).add(expectedEthPurchased)
    );
    expect(postEngineMln).toEqualBN(new BN(0));
    expect(postEngineEth).toEqualBN(preEngineEth.sub(expectedEthPurchased));

    expect(
      postMlnTotalSupply).toEqualBN(preMlnTotalSupply.sub(new BN(sendAmountMln))
    );
  });

  // it('Other contracts can pay amgu on function calls', async () => {});
  // it('Engine price and premium computes at multiple values', async () => {});
});
