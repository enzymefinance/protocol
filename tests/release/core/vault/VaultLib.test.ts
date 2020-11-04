import { EthereumTestnetProvider, randomAddress } from '@crestproject/crestproject';
import { assertEvent, defaultTestDeployment } from '@melonproject/testutils';
import { BigNumber, constants, utils } from 'ethers';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await defaultTestDeployment(provider);

  await deployment.vaultLib.init(config.deployer, config.deployer, 'Mock Fund');

  return {
    accounts,
    deployment,
    config,
  };
}

describe('constructor', () => {
  it('sets initial state for library', async () => {
    const {
      config: { deployer },
      deployment: { vaultLib },
    } = await provider.snapshot(snapshot);

    const accessor = await vaultLib.getAccessor();
    expect(accessor).toMatchAddress(deployer);

    const creator = await vaultLib.getCreator();
    expect(creator).toMatchAddress(deployer);

    const migrator = await vaultLib.getMigrator();
    expect(migrator).toMatchAddress(constants.AddressZero);

    const owner = await vaultLib.getOwner();
    expect(owner).toMatchAddress(deployer);

    const trackedAssets = await vaultLib.getTrackedAssets();
    expect(trackedAssets).toEqual([]);
  });
});

describe('addTrackedAsset', () => {
  it('can only be called by the accessor', async () => {
    const {
      accounts: [randomUser],
      deployment: { vaultLib },
      config: { weth },
    } = await provider.snapshot(snapshot);

    await expect(vaultLib.connect(randomUser).addTrackedAsset(weth)).rejects.toBeRevertedWith(
      'Only the designated accessor can make this call',
    );
  });

  it('skip if asset balance is 0', async () => {
    const {
      deployment: { vaultLib },
      config: { weth },
    } = await provider.snapshot(snapshot);

    await vaultLib.addTrackedAsset(weth);

    const trackedAssets = await vaultLib.getTrackedAssets();
    expect(trackedAssets).toEqual([]);

    const isTrackedAsset = await vaultLib.isTrackedAsset(weth);
    expect(isTrackedAsset).toBe(false);
  });

  it('skip if the asset already exists', async () => {
    const {
      deployment: {
        tokens: { weth },
        vaultLib,
      },
    } = await provider.snapshot(snapshot);

    await weth.transfer(vaultLib, utils.parseEther('1'));
    await vaultLib.addTrackedAsset(weth);
    await vaultLib.addTrackedAsset(weth);

    const trackedAssets = await vaultLib.getTrackedAssets();
    expect(trackedAssets).toMatchFunctionOutput(vaultLib.getTrackedAssets.fragment, [weth]);

    const isTrackedAsset = await vaultLib.isTrackedAsset(weth);
    expect(isTrackedAsset).toBe(true);
  });

  it('works as expected', async () => {
    const {
      deployment: {
        tokens: { weth },
        vaultLib,
      },
    } = await provider.snapshot(snapshot);

    await weth.transfer(vaultLib, utils.parseEther('1'));

    const receipt = await vaultLib.addTrackedAsset(weth);
    assertEvent(receipt, 'TrackedAssetAdded', {
      asset: weth,
    });

    const trackedAssets = await vaultLib.getTrackedAssets();
    expect(trackedAssets).toMatchFunctionOutput(vaultLib.getTrackedAssets.fragment, [weth]);

    const isTrackedAsset = await vaultLib.isTrackedAsset(weth);
    expect(isTrackedAsset).toBe(true);
  });
});

describe('removeTrackedAsset', () => {
  it('can only be called by the accessor', async () => {
    const {
      accounts: [randomUser],
      deployment: { vaultLib },
      config: { weth },
    } = await provider.snapshot(snapshot);

    await expect(vaultLib.connect(randomUser).removeTrackedAsset(weth)).rejects.toBeRevertedWith(
      'Only the designated accessor can make this call',
    );
  });

  it('skip if removing a non-tracked asset', async () => {
    const {
      config: { weth },
      deployment: { vaultLib },
    } = await provider.snapshot(snapshot);

    await vaultLib.removeTrackedAsset(weth);

    const trackedAssets = await vaultLib.getTrackedAssets();
    expect(trackedAssets).toEqual([]);
  });

  it('works as expected', async () => {
    const {
      deployment: {
        tokens: { weth, mln, knc },
        vaultLib,
      },
    } = await provider.snapshot(snapshot);

    await weth.transfer(vaultLib, utils.parseEther('1'));
    await mln.transfer(vaultLib, utils.parseEther('1'));
    await knc.transfer(vaultLib, utils.parseEther('1'));
    await vaultLib.addTrackedAsset(weth);
    await vaultLib.addTrackedAsset(mln);
    await vaultLib.addTrackedAsset(knc);

    const receipt1 = await vaultLib.removeTrackedAsset(mln);
    assertEvent(receipt1, 'TrackedAssetRemoved', {
      asset: mln,
    });

    const trackedAssets1 = await vaultLib.getTrackedAssets();
    expect(trackedAssets1).toMatchFunctionOutput(vaultLib.getTrackedAssets.fragment, [weth, knc]);

    const receipt2 = await vaultLib.removeTrackedAsset(weth);
    assertEvent(receipt2, 'TrackedAssetRemoved', {
      asset: weth,
    });

    const trackedAssets2 = await vaultLib.getTrackedAssets();
    expect(trackedAssets2).toMatchFunctionOutput(vaultLib.getTrackedAssets.fragment, [knc]);

    const receipt3 = await vaultLib.removeTrackedAsset(knc);
    assertEvent(receipt3, 'TrackedAssetRemoved', {
      asset: knc,
    });

    const trackedAssets3 = await vaultLib.getTrackedAssets();
    expect(trackedAssets3).toEqual([]);
  });
});

describe('withdrawAssetTo', () => {
  it('can only be called by the accessor', async () => {
    const {
      accounts: [randomUser],
      deployment: { vaultLib },
      config: { weth },
    } = await provider.snapshot(snapshot);

    await expect(
      vaultLib.connect(randomUser).withdrawAssetTo(weth, randomAddress(), utils.parseEther('2')),
    ).rejects.toBeRevertedWith('Only the designated accessor can make this call');
  });

  it('insufficient balance', async () => {
    const {
      deployment: {
        tokens: { weth },
        vaultLib,
      },
    } = await provider.snapshot(snapshot);

    await weth.transfer(vaultLib, utils.parseEther('1'));
    await expect(vaultLib.withdrawAssetTo(weth, randomAddress(), utils.parseEther('2'))).rejects.toBeRevertedWith(
      'Insufficient balance',
    );
  });

  it('completely withdraw an asset balance and remove tracked asset', async () => {
    const {
      accounts: [investor],
      deployment: {
        tokens: { weth },
        vaultLib,
      },
    } = await provider.snapshot(snapshot);

    const preTxInvestorBalance = await weth.balanceOf(investor);
    const amount = utils.parseEther('1');

    await weth.transfer(vaultLib, amount);
    await vaultLib.addTrackedAsset(weth);
    const trackedAssets1 = await vaultLib.getTrackedAssets();
    expect(trackedAssets1).toMatchFunctionOutput(vaultLib.getTrackedAssets.fragment, [weth]);

    const receipt = await vaultLib.withdrawAssetTo(weth, investor, amount);
    assertEvent(receipt, 'AssetWithdrawn', {
      asset: weth,
      target: investor,
      amount,
    });

    const trackedAssets2 = await vaultLib.getTrackedAssets();
    expect(trackedAssets2).toEqual([]);

    const postTxInvestorBalance = await weth.balanceOf(investor);
    expect(postTxInvestorBalance).toEqBigNumber(preTxInvestorBalance.add(amount));
  });

  it('partially withdraw an asset balance', async () => {
    const {
      accounts: [investor],
      deployment: {
        tokens: { weth },
        vaultLib,
      },
    } = await provider.snapshot(snapshot);

    await weth.transfer(vaultLib, utils.parseEther('1'));

    const preTxInvestorBalance = await weth.balanceOf(investor);
    const preTxVaultBalance = await weth.balanceOf(vaultLib);
    const withdrawAmount = utils.parseEther('0.5');

    await vaultLib.addTrackedAsset(weth);
    const trackedAssets1 = await vaultLib.getTrackedAssets();
    expect(trackedAssets1).toMatchFunctionOutput(vaultLib.getTrackedAssets.fragment, [weth]);

    const receipt = await vaultLib.withdrawAssetTo(weth, investor, withdrawAmount);
    assertEvent(receipt, 'AssetWithdrawn', {
      asset: weth,
      target: investor,
      amount: withdrawAmount,
    });

    const trackedAssets2 = await vaultLib.getTrackedAssets();
    expect(trackedAssets2).toMatchFunctionOutput(vaultLib.getTrackedAssets.fragment, [weth]);

    const postTxInvestorBalance = await weth.balanceOf(investor);
    expect(postTxInvestorBalance).toEqBigNumber(preTxInvestorBalance.add(withdrawAmount));

    const postTxVaultBalance = await weth.balanceOf(vaultLib);
    expect(postTxVaultBalance).toEqBigNumber(preTxVaultBalance.sub(withdrawAmount));
  });
});

describe('approveAssetSpender', () => {
  it('can only be called by the accessor', async () => {
    const {
      accounts: [randomUser, investor],
      deployment: { vaultLib },
      config: { weth },
    } = await provider.snapshot(snapshot);

    await expect(
      vaultLib.connect(randomUser).approveAssetSpender(weth, investor, utils.parseEther('1')),
    ).rejects.toBeRevertedWith('Only the designated accessor can make this call');
  });

  it('works as expected', async () => {
    const {
      accounts: [investor],
      deployment: {
        tokens: { weth },
        vaultLib,
      },
    } = await provider.snapshot(snapshot);

    const amount = utils.parseEther('1');

    const receipt = await vaultLib.approveAssetSpender(weth, investor, amount);
    assertEvent(receipt, 'Approval', {
      owner: vaultLib,
      spender: investor,
      value: amount,
    });

    const allowance = await weth.allowance(vaultLib, investor);
    expect(allowance).toEqBigNumber(amount);
  });
});

describe('mintShares', () => {
  it('can only be called by the accessor', async () => {
    const {
      accounts: [randomUser, investor],
      deployment: { vaultLib },
    } = await provider.snapshot(snapshot);

    await expect(vaultLib.connect(randomUser).mintShares(investor, utils.parseEther('1'))).rejects.toBeRevertedWith(
      'Only the designated accessor can make this call',
    );
  });

  it('does not allow mint to a zero address', async () => {
    const {
      deployment: { vaultLib },
    } = await provider.snapshot(snapshot);

    await expect(vaultLib.mintShares(constants.AddressZero, utils.parseEther('1'))).rejects.toBeRevertedWith(
      'mint to the zero address',
    );
  });

  it('works as expected', async () => {
    const {
      accounts: [investor],
      deployment: { vaultLib },
    } = await provider.snapshot(snapshot);

    const preTxTotalSupply = await vaultLib.totalSupply();
    expect(preTxTotalSupply).toEqBigNumber(utils.parseEther('0'));

    const amount = utils.parseEther('1');

    const receipt = await vaultLib.mintShares(investor, amount);
    assertEvent(receipt, 'Transfer', {
      from: constants.AddressZero,
      to: investor,
      value: amount,
    });

    const postTxTotalSupply = await vaultLib.totalSupply();
    expect(postTxTotalSupply).toEqBigNumber(amount);

    const investorShares = await vaultLib.balanceOf(investor);
    expect(investorShares).toEqBigNumber(amount);
  });
});

describe('burnShares', () => {
  it('can only be called by the accessor', async () => {
    const {
      accounts: [randomUser, investor],
      deployment: { vaultLib },
    } = await provider.snapshot(snapshot);

    await expect(vaultLib.connect(randomUser).burnShares(investor, utils.parseEther('1'))).rejects.toBeRevertedWith(
      'Only the designated accessor can make this call',
    );
  });

  it('does not allow burn from a zero address', async () => {
    const {
      deployment: { vaultLib },
    } = await provider.snapshot(snapshot);

    await expect(vaultLib.burnShares(constants.AddressZero, utils.parseEther('1'))).rejects.toBeRevertedWith(
      'burn from the zero address',
    );
  });

  it('does not allow burn amount exceeds balance', async () => {
    const {
      accounts: [investor],
      deployment: { vaultLib },
    } = await provider.snapshot(snapshot);

    const amount = utils.parseEther('1');

    // mint shares
    {
      const preTxTotalSupply = await vaultLib.totalSupply();
      expect(preTxTotalSupply).toEqBigNumber(utils.parseEther('0'));

      await vaultLib.mintShares(investor, amount);

      const postTxTotalSupply = await vaultLib.totalSupply();
      expect(postTxTotalSupply).toEqBigNumber(amount);

      const investorShares = await vaultLib.balanceOf(investor);
      expect(investorShares).toEqBigNumber(amount);
    }

    // burn shares
    await expect(vaultLib.burnShares(investor, amount.add(BigNumber.from(1)))).rejects.toBeRevertedWith(
      'burn amount exceeds balance',
    );
  });

  it('works as expected', async () => {
    const {
      accounts: [investor],
      deployment: { vaultLib },
    } = await provider.snapshot(snapshot);

    const amount = utils.parseEther('1');

    // mint shares
    {
      const preTxTotalSupply = await vaultLib.totalSupply();
      expect(preTxTotalSupply).toEqBigNumber(utils.parseEther('0'));

      await vaultLib.mintShares(investor, amount);

      const postTxTotalSupply = await vaultLib.totalSupply();
      expect(postTxTotalSupply).toEqBigNumber(amount);

      const investorShares = await vaultLib.balanceOf(investor);
      expect(investorShares).toEqBigNumber(amount);
    }

    // burn shares
    const receipt = await vaultLib.burnShares(investor, amount);
    assertEvent(receipt, 'Transfer', {
      from: investor,
      to: constants.AddressZero,
      value: amount,
    });

    const totalSupply = await vaultLib.totalSupply();
    expect(totalSupply).toEqBigNumber(utils.parseEther('0'));

    const investorShares = await vaultLib.balanceOf(investor);
    expect(investorShares).toEqBigNumber(utils.parseEther('0'));
  });
});

describe('transferShares', () => {
  it('can only be called by the accessor', async () => {
    const {
      accounts: [randomUser, investor1, investor2],
      deployment: { vaultLib },
    } = await provider.snapshot(snapshot);

    await expect(
      vaultLib.connect(randomUser).transferShares(investor1, investor2, utils.parseEther('1')),
    ).rejects.toBeRevertedWith('Only the designated accessor can make this call');
  });

  it('does not allow sender is an zero address', async () => {
    const {
      deployment: { vaultLib },
    } = await provider.snapshot(snapshot);

    await expect(
      vaultLib.transferShares(constants.AddressZero, randomAddress(), BigNumber.from(1)),
    ).rejects.toBeRevertedWith('transfer from the zero address');
  });

  it('does not allow recipient is an zero address', async () => {
    const {
      deployment: { vaultLib },
    } = await provider.snapshot(snapshot);

    await expect(
      vaultLib.transferShares(randomAddress(), constants.AddressZero, BigNumber.from(1)),
    ).rejects.toBeRevertedWith('transfer to the zero address');
  });

  it('does not allow transfer amount to exceed balance', async () => {
    const {
      accounts: [investor1, investor2],
      deployment: { vaultLib },
    } = await provider.snapshot(snapshot);

    const amount = utils.parseEther('1');

    // mint shares to investor1
    {
      const preTxTotalSupply = await vaultLib.totalSupply();
      expect(preTxTotalSupply).toEqBigNumber(utils.parseEther('0'));

      await vaultLib.mintShares(investor1, amount);

      const postTxTotalSupply = await vaultLib.totalSupply();
      expect(postTxTotalSupply).toEqBigNumber(amount);

      const investorShares = await vaultLib.balanceOf(investor1);
      expect(investorShares).toEqBigNumber(amount);
    }

    // transfer shares
    await expect(vaultLib.transferShares(investor1, investor2, amount.add(BigNumber.from(1)))).rejects.toBeRevertedWith(
      'transfer amount exceeds balance',
    );
  });

  it('works as expected', async () => {
    const {
      accounts: [investor1, investor2],
      deployment: { vaultLib },
    } = await provider.snapshot(snapshot);

    const amount = utils.parseEther('1');

    // mint shares to investor1
    {
      const preTxTotalSupply = await vaultLib.totalSupply();
      expect(preTxTotalSupply).toEqBigNumber(utils.parseEther('0'));

      await vaultLib.mintShares(investor1, amount);

      const postTxTotalSupply = await vaultLib.totalSupply();
      expect(postTxTotalSupply).toEqBigNumber(amount);

      const investorShares = await vaultLib.balanceOf(investor1);
      expect(investorShares).toEqBigNumber(amount);
    }

    // transfer shares
    const receipt = await vaultLib.transferShares(investor1, investor2, amount);
    assertEvent(receipt, 'Transfer', {
      from: investor1,
      to: investor2,
      value: amount,
    });

    const investor1Shares = await vaultLib.balanceOf(investor1);
    expect(investor1Shares).toEqBigNumber(BigNumber.from(0));

    const investor2Shares = await vaultLib.balanceOf(investor2);
    expect(investor2Shares).toEqBigNumber(amount);
  });
});

// TODO: callOnContract
