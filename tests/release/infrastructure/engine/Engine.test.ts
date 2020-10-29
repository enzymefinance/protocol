import {
  EthereumTestnetProvider,
  randomAddress,
  resolveAddress,
} from '@crestproject/crestproject';
import { Engine, ValueInterpreter } from '@melonproject/protocol';
import {
  assertEvent,
  defaultTestDeployment,
  seedAndThawEngine,
  updateChainlinkAggregator,
  warpEngine,
} from '@melonproject/testutils';
import { BigNumber, utils } from 'ethers';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await defaultTestDeployment(
    provider,
  );

  // Create a mock value interpreter that returns (0, false) by default
  const mockValueInterpreter = await ValueInterpreter.mock(config.deployer);
  await mockValueInterpreter.calcCanonicalAssetValue.returns(0, false);

  return {
    accounts,
    deployment,
    config,
    mocks: { mockValueInterpreter },
  };
}

describe('constructor', () => {
  it('sets lastThaw to block.timestamp', async () => {
    const {
      config: { deployer },
    } = await provider.snapshot(snapshot);

    // Create a new engine to ensure it is created on the last block
    const engine = await Engine.deploy(
      deployer,
      randomAddress(),
      randomAddress(),
      randomAddress(),
      randomAddress(),
      randomAddress(),
      1,
    );

    const block = await provider.getBlock('latest');
    const lastThawCall = engine.getLastThaw();
    await expect(lastThawCall).resolves.toEqBigNumber(block.timestamp);
  });

  it('sets state vars', async () => {
    const {
      deployment: {
        engine,
        valueInterpreter,
        tokens: { mln, weth },
      },
      config: {
        mgm,
        deployer,
        engine: { thawDelay },
      },
    } = await provider.snapshot(snapshot);
    const getMGM = engine.getMGM();
    await expect(getMGM).resolves.toBe(await resolveAddress(mgm));

    // The deployer should initially be the dispatcher owner.
    const dispatcherOwner = engine.getOwner();
    await expect(dispatcherOwner).resolves.toBe(await resolveAddress(deployer));

    const getValueInterpreter = engine.getValueInterpreter();
    await expect(getValueInterpreter).resolves.toBe(valueInterpreter.address);

    const getMlnToken = engine.getMlnToken();
    await expect(getMlnToken).resolves.toBe(mln.address);

    const getWethToken = engine.getWethToken();
    await expect(getWethToken).resolves.toBe(weth.address);

    const getThawDelayCall = engine.getThawDelay();
    await expect(getThawDelayCall).resolves.toEqBigNumber(thawDelay);
  });
});

describe('setAmguPrice', () => {
  it('can only be called by MGM', async () => {
    const {
      deployment: { engine },
    } = await provider.snapshot(snapshot);

    const setAmguPriceTx = engine.setAmguPrice(1);
    await expect(setAmguPriceTx).rejects.toBeRevertedWith(
      'Only MGM can call this',
    );
  });

  it('sets amguPrice', async () => {
    const {
      config: { mgm },
      deployment: { engine },
    } = await provider.snapshot(snapshot);

    const preAmguPriceCall = await engine.getAmguPrice();
    const priceToBeSet = 1;

    const setAmguPriceTx = engine
      .connect(provider.getSigner(await resolveAddress(mgm)))
      .setAmguPrice(priceToBeSet);

    const postAmguGetPriceCall = engine.getAmguPrice();
    await expect(postAmguGetPriceCall).resolves.toEqBigNumber(priceToBeSet);

    await assertEvent(setAmguPriceTx, 'AmguPriceSet', {
      prevAmguPrice: preAmguPriceCall,
      nextAmguPrice: postAmguGetPriceCall,
    });
  });
});

describe('payAmguInEther', () => {
  it('pays for Amgu with ETH correctly', async () => {
    const {
      deployment: { engine },
    } = await provider.snapshot(snapshot);

    const amount = utils.parseEther('1');
    const payAmguTx = engine.payAmguInEther.value(amount).send();

    const frozenEtherAfter = engine.getFrozenEther();
    await expect(frozenEtherAfter).resolves.toEqBigNumber(amount);

    await assertEvent(payAmguTx, 'AmguPaidInEther', {
      amount: amount,
    });
  });
});

describe('thaw', () => {
  it('cannot be called when thawingDelay has not elapsed since lastThaw', async () => {
    const {
      deployment: { engine },
    } = await provider.snapshot(snapshot);

    await engine.payAmguInEther.value(utils.parseEther('1')).send();

    const thawTx = engine.thaw();
    await expect(thawTx).rejects.toBeRevertedWith('Thaw delay has not passed');
  });

  it('cannot be called when frozenEther is 0', async () => {
    const {
      deployment: { engine, chainlinkAggregators },
    } = await provider.snapshot(snapshot);

    await warpEngine(provider, engine);
    await updateChainlinkAggregator(chainlinkAggregators.mln);

    const thawTx = engine.thaw();
    await expect(thawTx).rejects.toBeRevertedWith('No frozen ETH to thaw');
  });

  it('frozenEther is added to liquidEther', async () => {
    const {
      deployment: { engine, chainlinkAggregators },
    } = await provider.snapshot(snapshot);

    const amount = utils.parseEther('1');
    await engine.payAmguInEther.value(amount).send();
    await warpEngine(provider, engine);
    await updateChainlinkAggregator(chainlinkAggregators.mln);

    const preLiquidEther = await engine.getLiquidEther();
    const thawTx = engine.thaw();

    await assertEvent(thawTx, 'FrozenEtherThawed', {
      amount: amount,
    });

    const postLiquidEther = await engine.getLiquidEther();
    expect(postLiquidEther.sub(preLiquidEther)).toEqBigNumber(amount);

    const frozenEthCall = engine.getFrozenEther();
    await expect(frozenEthCall).resolves.toEqBigNumber(0);
  });
});

describe('etherTakers', () => {
  describe('addEtherTakers', () => {
    it('adds ether taker when called from the Dispatcher owner', async () => {
      const {
        deployment: { engine },
      } = await provider.snapshot(snapshot);

      const newEtherTaker = randomAddress();

      // Assuming the deployer is the Dispatcher owner
      const addEtherTakerTx = engine.addEtherTakers([newEtherTaker]);
      await assertEvent(addEtherTakerTx, 'EtherTakerAdded', {
        etherTaker: newEtherTaker,
      });

      const isEtherTakerCall = engine.isEtherTaker(newEtherTaker);
      await expect(isEtherTakerCall).resolves.toBeTruthy;
    });

    it('reverts when adding an account twice', async () => {
      const {
        deployment: { engine },
      } = await provider.snapshot(snapshot);
      const newEtherTaker = randomAddress();

      const firstAddEtherTakerTx = engine.addEtherTakers([newEtherTaker]);
      await expect(firstAddEtherTakerTx).resolves.toBeReceipt();

      const secondAddEtherTakerTx = engine.addEtherTakers([newEtherTaker]);
      await expect(secondAddEtherTakerTx).rejects.toBeRevertedWith(
        'Account has already been added',
      );
    });

    it('Can only be called by the dispatcher owner', async () => {
      const {
        accounts: { 0: randomUser },
        deployment: { engine },
      } = await provider.snapshot(snapshot);
      const newEtherTaker = randomAddress();

      const addEtherTakerTx = engine
        .connect(randomUser)
        .addEtherTakers([newEtherTaker]);
      await expect(addEtherTakerTx).rejects.toBeRevertedWith(
        'Only the Dispatcher owner can call this function',
      );
    });
  });

  describe('removeEtherTakers', () => {
    it('removes ether taker when called from the dispatcher owner', async () => {
      const {
        deployment: { engine },
      } = await provider.snapshot(snapshot);
      const newEtherTaker = randomAddress();

      await engine.addEtherTakers([newEtherTaker]);

      const removeEtherTakerTx = engine.removeEtherTakers([newEtherTaker]);
      const isEtherTakerCall = engine.isEtherTaker(newEtherTaker);
      await expect(isEtherTakerCall).resolves.toBeFalsy;

      await assertEvent(removeEtherTakerTx, 'EtherTakerRemoved', {
        etherTaker: newEtherTaker,
      });
    });

    it('reverts when removing a non existing account ', async () => {
      const {
        deployment: { engine },
      } = await provider.snapshot(snapshot);
      const newEtherTaker = randomAddress();

      const removeEtherTakerTx = engine.removeEtherTakers([newEtherTaker]);

      await expect(removeEtherTakerTx).rejects.toBeRevertedWith(
        'Account is not an etherTaker',
      );
    });

    it('Can only be called by the Dispatcher owner', async () => {
      const {
        accounts: { 0: randomUser },
        deployment: { engine },
      } = await provider.snapshot(snapshot);
      const newEtherTaker = randomAddress();

      const removeEtherTakersTx = engine
        .connect(randomUser)
        .removeEtherTakers([newEtherTaker]);

      await expect(removeEtherTakersTx).rejects.toBeRevertedWith(
        'Only the Dispatcher owner can call this function',
      );
    });
  });
});

describe('calcPremiumPercent', () => {
  it('returns 0 if liquidEther is under 1 ether', async () => {
    const {
      deployment: { engine, chainlinkAggregators },
    } = await provider.snapshot(snapshot);

    await seedAndThawEngine(provider, engine, utils.parseEther('0.99'));
    await updateChainlinkAggregator(chainlinkAggregators.mln);
    const premiumPercentCall = engine.calcPremiumPercent();

    await expect(premiumPercentCall).resolves.toEqBigNumber(0);
  });

  it('returns 5 if liquidEther is 1 ether', async () => {
    const {
      deployment: { engine, chainlinkAggregators },
    } = await provider.snapshot(snapshot);

    await seedAndThawEngine(provider, engine, utils.parseEther('1'));
    await updateChainlinkAggregator(chainlinkAggregators.mln);
    const premiumPercentCall = engine.calcPremiumPercent();

    await expect(premiumPercentCall).resolves.toEqBigNumber(5);
  });

  it('returns 10 if liquidEther is 5 ether', async () => {
    const {
      deployment: { engine, chainlinkAggregators },
    } = await provider.snapshot(snapshot);

    await seedAndThawEngine(provider, engine, utils.parseEther('5'));
    await updateChainlinkAggregator(chainlinkAggregators.mln);
    const premiumPercentCall = engine.calcPremiumPercent();

    await expect(premiumPercentCall).resolves.toEqBigNumber(10);
  });

  it('returns 15 if liquidEther is >= 10 ether', async () => {
    const {
      deployment: { engine, chainlinkAggregators },
    } = await provider.snapshot(snapshot);

    await seedAndThawEngine(provider, engine, utils.parseEther('10'));
    await updateChainlinkAggregator(chainlinkAggregators.mln);
    const premiumPercentCall = engine.calcPremiumPercent();

    await expect(premiumPercentCall).resolves.toEqBigNumber(15);
  });
});

describe('calcEthOutputForMlnInput', () => {
  it('returns the expected value', async () => {
    const {
      deployment: { engine },
      mocks: { mockValueInterpreter },
    } = await snapshot(provider);

    // Update the valueInterpreter used by the Engine to a mock and set expected return values
    await engine.setValueInterpreter(mockValueInterpreter);
    const expectedOutput = BigNumber.from('1');
    await mockValueInterpreter.calcCanonicalAssetValue.returns(
      expectedOutput,
      true,
    );

    const calcEthOutput = engine.calcEthOutputForMlnInput
      .args(expectedOutput)
      .call();
    await expect(calcEthOutput).resolves.toMatchObject({
      ethAmount_: expectedOutput,
      isValidRate_: true,
    });
  });
});

describe('sellAndBurnMln', () => {
  it('correctly handles selling and burning melon', async () => {
    const {
      config: { deployer },
      deployment: {
        engine,
        chainlinkAggregators,
        tokens: { mln },
      },
    } = await provider.snapshot(snapshot);

    const mlnAmount = utils.parseEther('1');
    const ethAmountWithPremium = utils.parseEther('1.05');
    const deployerAddress = await resolveAddress(deployer);

    await engine.addEtherTakers([deployer]);
    await seedAndThawEngine(provider, engine, ethAmountWithPremium);
    await updateChainlinkAggregator(chainlinkAggregators.mln);

    const preMlnBalance = await mln.balanceOf(deployerAddress);
    await mln.approve(engine.address, mlnAmount);

    // Check ETH balance right before doing the tx
    const preEthBalance = await deployer.getBalance();
    const sellAndBurnMlnTx = engine.sellAndBurnMln(mlnAmount);

    const ethGasSpent = (await sellAndBurnMlnTx).gasUsed.mul(
      await deployer.getGasPrice(),
    );

    // Check ETH Balance was received as expected (taking gas into account)
    const postSellEthBalance = await deployer.getBalance();
    expect(postSellEthBalance).toEqBigNumber(
      preEthBalance.sub(ethGasSpent).add(ethAmountWithPremium),
    );

    // Check MLN Balance was spent
    const postMlnBalance = await mln.balanceOf(deployerAddress);
    await expect(postMlnBalance).toEqBigNumber(preMlnBalance.sub(mlnAmount));

    await assertEvent(sellAndBurnMlnTx, 'MlnSoldAndBurned', {
      mlnAmount: mlnAmount,
      ethAmount: ethAmountWithPremium,
    });
  });

  it('reverts if sender is not an authorized ether taker', async () => {
    const {
      deployment: { engine },
    } = await provider.snapshot(snapshot);

    const failSellBurnTx = engine.sellAndBurnMln(utils.parseEther('1'));

    await expect(failSellBurnTx).rejects.toBeRevertedWith('Unauthorized');
  });

  it('reverts if MLN/ETH received from ValueInterpreter is not valid rate', async () => {
    const {
      config: { deployer },
      deployment: { engine },
      mocks: { mockValueInterpreter },
    } = await snapshot(provider);

    await engine.addEtherTakers([deployer]);

    // Update the valueInterpreter used by the Engine to a mock and set expected return values
    await engine.setValueInterpreter(mockValueInterpreter);
    await mockValueInterpreter.calcCanonicalAssetValue.returns(
      utils.parseEther('1'),
      false,
    );

    // Returning an invalid rate should cause the tx to fail
    const failSellBurnTx = engine.sellAndBurnMln(utils.parseEther('1'));
    await expect(failSellBurnTx).rejects.toBeRevertedWith('Invalid rate');
  });

  it('reverts if mlnAmount value is greater than available liquidEther', async () => {
    const {
      config: { deployer },
      deployment: { engine, chainlinkAggregators },
    } = await provider.snapshot(snapshot);

    const mlnAmount = utils.parseEther('1');
    const ethAmountWithPremium = utils.parseEther('1.04');

    await seedAndThawEngine(provider, engine, ethAmountWithPremium);
    await updateChainlinkAggregator(chainlinkAggregators.mln);
    await engine.addEtherTakers([deployer]);

    const failSellBurnTx = engine.sellAndBurnMln(mlnAmount);

    await expect(failSellBurnTx).rejects.toBeRevertedWith(
      'Not enough liquid ether',
    );
  });

  it('reverts if the ETH amount to be sent to the user is zero', async () => {
    const {
      config: { deployer },
      deployment: { engine },
      mocks: { mockValueInterpreter },
    } = await provider.snapshot(snapshot);

    // Update the valueInterpreter used by the Engine to a mock and set expected return values
    await engine.setValueInterpreter(mockValueInterpreter);
    await mockValueInterpreter.calcCanonicalAssetValue.returns(0, true);

    const mlnAmount = utils.parseEther('1');
    const deployerAddress = await resolveAddress(deployer);

    await engine.addEtherTakers([deployerAddress]);
    const failSellBurnTx = engine.sellAndBurnMln(mlnAmount);

    await expect(failSellBurnTx).rejects.toBeRevertedWith(
      'MLN quantity too low',
    );
  });
});

describe('setValueInterpreter', () => {
  it.todo('Does not allow a random caller');

  it.todo('Does not allow an already-set value');

  it.todo('Correctly handles a valid call');
});
