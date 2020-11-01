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
    const lastThawCall = await engine.getLastThaw();
    expect(lastThawCall).toEqBigNumber(block.timestamp);
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
    const getMGM = await engine.getMGM();
    expect(getMGM).toMatchAddress(mgm);

    // The deployer should initially be the dispatcher owner.
    const getOwner = await engine.getOwner();
    expect(getOwner).toMatchAddress(deployer);

    const getValueInterpreter = await engine.getValueInterpreter();
    expect(getValueInterpreter).toMatchAddress(valueInterpreter);

    const getMlnToken = await engine.getMlnToken();
    expect(getMlnToken).toMatchAddress(mln);

    const getWethToken = await engine.getWethToken();
    expect(getWethToken).toMatchAddress(weth);

    const getThawDelayCall = await engine.getThawDelay();
    expect(getThawDelayCall).toEqBigNumber(thawDelay);
  });
});

describe('setAmguPrice', () => {
  it('can only be called by MGM', async () => {
    const {
      deployment: { engine },
    } = await provider.snapshot(snapshot);

    await expect(engine.setAmguPrice(1)).rejects.toBeRevertedWith(
      'Only MGM can call this',
    );
  });

  it('sets amguPrice', async () => {
    const {
      config: { mgm },
      deployment: { engine },
    } = await provider.snapshot(snapshot);

    const preAmguPriceCall = await engine.getAmguPrice();
    const priceToBeSet = 123456;

    const mgmSigner = await provider.getSignerWithAddress(resolveAddress(mgm));
    const receipt = await engine.connect(mgmSigner).setAmguPrice(priceToBeSet);
    assertEvent(receipt, 'AmguPriceSet', {
      prevAmguPrice: preAmguPriceCall,
      nextAmguPrice: priceToBeSet,
    });

    const postAmguGetPriceCall = await engine.getAmguPrice();
    expect(postAmguGetPriceCall).toEqBigNumber(priceToBeSet);
  });
});

describe('payAmguInEther', () => {
  it('pays for Amgu with ETH correctly', async () => {
    const {
      deployment: { engine },
    } = await provider.snapshot(snapshot);

    const amount = utils.parseEther('1');
    const receipt = await engine.payAmguInEther.value(amount).send();
    assertEvent(receipt, 'AmguPaidInEther', {
      amount: amount,
    });

    const frozenEtherAfter = await engine.getFrozenEther();
    expect(frozenEtherAfter).toEqBigNumber(amount);
  });
});

describe('thaw', () => {
  it('cannot be called when thawingDelay has not elapsed since lastThaw', async () => {
    const {
      deployment: { engine },
    } = await provider.snapshot(snapshot);

    await engine.payAmguInEther.value(utils.parseEther('1')).send();

    await expect(engine.thaw()).rejects.toBeRevertedWith(
      'Thaw delay has not passed',
    );
  });

  it('cannot be called when frozenEther is 0', async () => {
    const {
      deployment: { engine, chainlinkAggregators },
    } = await provider.snapshot(snapshot);

    await warpEngine(provider, engine);
    await updateChainlinkAggregator(chainlinkAggregators.mln);

    await expect(engine.thaw()).rejects.toBeRevertedWith(
      'No frozen ETH to thaw',
    );
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
    const receipt = await engine.thaw();
    assertEvent(receipt, 'FrozenEtherThawed', {
      amount: amount,
    });

    const postLiquidEther = await engine.getLiquidEther();
    expect(postLiquidEther.sub(preLiquidEther)).toEqBigNumber(amount);

    const frozenEthCall = await engine.getFrozenEther();
    expect(frozenEthCall).toEqBigNumber(0);
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
      const receipt = await engine.addEtherTakers([newEtherTaker]);
      assertEvent(receipt, 'EtherTakerAdded', {
        etherTaker: newEtherTaker,
      });

      const isEtherTakerCall = await engine.isEtherTaker(newEtherTaker);
      expect(isEtherTakerCall).toBeTruthy;
    });

    it('reverts when adding an account twice', async () => {
      const {
        deployment: { engine },
      } = await provider.snapshot(snapshot);
      const newEtherTaker = randomAddress();

      await expect(
        engine.addEtherTakers([newEtherTaker]),
      ).resolves.toBeReceipt();

      await expect(
        engine.addEtherTakers([newEtherTaker]),
      ).rejects.toBeRevertedWith('Account has already been added');
    });

    it('Can only be called by the dispatcher owner', async () => {
      const {
        accounts: { 0: randomUser },
        deployment: { engine },
      } = await provider.snapshot(snapshot);
      const newEtherTaker = randomAddress();

      await expect(
        engine.connect(randomUser).addEtherTakers([newEtherTaker]),
      ).rejects.toBeRevertedWith(
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

      const receipt = await engine.removeEtherTakers([newEtherTaker]);
      assertEvent(receipt, 'EtherTakerRemoved', {
        etherTaker: newEtherTaker,
      });

      const isEtherTakerCall = await engine.isEtherTaker(newEtherTaker);
      expect(isEtherTakerCall).toBeFalsy;
    });

    it('reverts when removing a non existing account ', async () => {
      const {
        deployment: { engine },
      } = await provider.snapshot(snapshot);
      const newEtherTaker = randomAddress();

      await expect(
        engine.removeEtherTakers([newEtherTaker]),
      ).rejects.toBeRevertedWith('Account is not an etherTaker');
    });

    it('Can only be called by the Dispatcher owner', async () => {
      const {
        accounts: { 0: randomUser },
        deployment: { engine },
      } = await provider.snapshot(snapshot);
      const newEtherTaker = randomAddress();

      await expect(
        engine.connect(randomUser).removeEtherTakers([newEtherTaker]),
      ).rejects.toBeRevertedWith(
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

    const premiumPercentCall = await engine.calcPremiumPercent();
    expect(premiumPercentCall).toEqBigNumber(0);
  });

  it('returns 5 if liquidEther is 1 ether', async () => {
    const {
      deployment: { engine, chainlinkAggregators },
    } = await provider.snapshot(snapshot);

    await seedAndThawEngine(provider, engine, utils.parseEther('1'));
    await updateChainlinkAggregator(chainlinkAggregators.mln);

    const premiumPercentCall = await engine.calcPremiumPercent();
    expect(premiumPercentCall).toEqBigNumber(5);
  });

  it('returns 10 if liquidEther is 5 ether', async () => {
    const {
      deployment: { engine, chainlinkAggregators },
    } = await provider.snapshot(snapshot);

    await seedAndThawEngine(provider, engine, utils.parseEther('5'));
    await updateChainlinkAggregator(chainlinkAggregators.mln);

    const premiumPercentCall = await engine.calcPremiumPercent();
    expect(premiumPercentCall).toEqBigNumber(10);
  });

  it('returns 15 if liquidEther is >= 10 ether', async () => {
    const {
      deployment: { engine, chainlinkAggregators },
    } = await provider.snapshot(snapshot);

    await seedAndThawEngine(provider, engine, utils.parseEther('10'));
    await updateChainlinkAggregator(chainlinkAggregators.mln);

    const premiumPercentCall = await engine.calcPremiumPercent();
    expect(premiumPercentCall).toEqBigNumber(15);
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

    const calcEthOutput = await engine.calcEthOutputForMlnInput
      .args(expectedOutput)
      .call();
    expect(calcEthOutput).toMatchFunctionOutput(
      engine.calcEthOutputForMlnInput.fragment,
      {
        ethAmount_: expectedOutput,
        isValidRate_: true,
      },
    );
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

    await engine.addEtherTakers([deployer]);
    await seedAndThawEngine(provider, engine, ethAmountWithPremium);
    await updateChainlinkAggregator(chainlinkAggregators.mln);

    const preMlnBalance = await mln.balanceOf(deployer);
    await mln.approve(engine, mlnAmount);

    // Check ETH balance right before doing the tx
    const preEthBalance = await deployer.getBalance();
    const receipt = await engine.sellAndBurnMln(mlnAmount);
    assertEvent(receipt, 'MlnSoldAndBurned', {
      mlnAmount: mlnAmount,
      ethAmount: ethAmountWithPremium,
    });

    // Check ETH Balance was received as expected (taking gas into account)
    const ethGasSpent = receipt.gasUsed.mul(await deployer.getGasPrice());
    const postSellEthBalance = await deployer.getBalance();
    expect(postSellEthBalance).toEqBigNumber(
      preEthBalance.sub(ethGasSpent).add(ethAmountWithPremium),
    );

    // Check MLN Balance was spent
    const postMlnBalance = await mln.balanceOf(deployer);
    expect(postMlnBalance).toEqBigNumber(preMlnBalance.sub(mlnAmount));
  });

  it('reverts if sender is not an authorized ether taker', async () => {
    const {
      deployment: { engine },
    } = await provider.snapshot(snapshot);

    await expect(
      engine.sellAndBurnMln(utils.parseEther('1')),
    ).rejects.toBeRevertedWith('Unauthorized');
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
    await expect(
      engine.sellAndBurnMln(utils.parseEther('1')),
    ).rejects.toBeRevertedWith('Invalid rate');
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

    await expect(engine.sellAndBurnMln(mlnAmount)).rejects.toBeRevertedWith(
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
    await engine.addEtherTakers([deployer]);
    await expect(engine.sellAndBurnMln(mlnAmount)).rejects.toBeRevertedWith(
      'MLN quantity too low',
    );
  });
});

describe('setValueInterpreter', () => {
  it.todo('Does not allow a random caller');

  it.todo('Does not allow an already-set value');

  it.todo('Correctly handles a valid call');
});
