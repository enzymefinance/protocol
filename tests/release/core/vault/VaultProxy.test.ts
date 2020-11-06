import { EthereumTestnetProvider, extractEvent, randomAddress } from '@crestproject/crestproject';
import { VaultLib } from '@melonproject/protocol';
import { assertEvent, defaultTestDeployment } from '@melonproject/testutils';
import { BigNumber, constants, utils } from 'ethers';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await defaultTestDeployment(provider);

  // Define the values to use in deploying the VaultProxy
  const [fundDeployerSigner, fundOwner, vaultAccessor, ...remainingAccounts] = accounts;
  const fundName = 'VaultLib Test Fund';

  // Set a fundDeployerSigner as the current FundDeployer to bypass the need to go via a real FundDeployer contract
  await deployment.dispatcher.setCurrentFundDeployer(fundDeployerSigner);

  // Deploy the VaultProxy via the Dispatcher
  const deployVaultProxyReceipt = await deployment.dispatcher
    .connect(fundDeployerSigner)
    .deployVaultProxy(deployment.vaultLib, fundOwner, vaultAccessor, fundName);

  // Create a VaultLib instance with the deployed VaultProxy address, parsed from the deployment event
  const vaultProxyDeployedEvent = extractEvent(deployVaultProxyReceipt, 'VaultProxyDeployed')[0];
  const vaultProxy = new VaultLib(vaultProxyDeployedEvent.args.vaultProxy, vaultAccessor);

  return {
    accounts: remainingAccounts,
    config,
    deployment,
    fundDeployerSigner,
    fundName,
    fundOwner,
    vaultAccessor,
    vaultProxy,
  };
}

describe('init', () => {
  it('correctly sets initial proxy values', async () => {
    const {
      deployment: { dispatcher },
      fundName,
      fundOwner,
      vaultAccessor,
      vaultProxy,
    } = await provider.snapshot(snapshot);

    const accessorValue = await vaultProxy.getAccessor();
    expect(accessorValue).toMatchAddress(vaultAccessor);

    const creatorValue = await vaultProxy.getCreator();
    expect(creatorValue).toMatchAddress(dispatcher);

    const migratorValue = await vaultProxy.getMigrator();
    expect(migratorValue).toMatchAddress(constants.AddressZero);

    const ownerValue = await vaultProxy.getOwner();
    expect(ownerValue).toMatchAddress(fundOwner);

    const trackedAssetsValue = await vaultProxy.getTrackedAssets();
    expect(trackedAssetsValue).toEqual([]);

    // SharesToken values

    const nameValue = await vaultProxy.name();
    expect(nameValue).toBe(fundName);

    const symbolValue = await vaultProxy.symbol();
    expect(symbolValue).toBe('MLNF');

    const decimalsValue = await vaultProxy.decimals();
    expect(decimalsValue).toBe(18);
  });
});

describe('addTrackedAsset', () => {
  it('can only be called by the accessor', async () => {
    const {
      accounts: [randomUser],
      config: { weth },
      vaultProxy,
    } = await provider.snapshot(snapshot);

    await expect(vaultProxy.connect(randomUser).addTrackedAsset(weth)).rejects.toBeRevertedWith(
      'Only the designated accessor can make this call',
    );
  });

  it('skip if asset balance is 0', async () => {
    const {
      config: { weth },
      vaultProxy,
    } = await provider.snapshot(snapshot);

    await vaultProxy.addTrackedAsset(weth);

    const trackedAssets = await vaultProxy.getTrackedAssets();
    expect(trackedAssets).toEqual([]);

    const isTrackedAsset = await vaultProxy.isTrackedAsset(weth);
    expect(isTrackedAsset).toBe(false);
  });

  it('skip if the asset already exists', async () => {
    const {
      deployment: {
        tokens: { weth },
      },
      vaultProxy,
    } = await provider.snapshot(snapshot);

    await weth.transfer(vaultProxy, utils.parseEther('1'));
    await vaultProxy.addTrackedAsset(weth);
    await vaultProxy.addTrackedAsset(weth);

    const trackedAssets = await vaultProxy.getTrackedAssets();
    expect(trackedAssets).toMatchFunctionOutput(vaultProxy.getTrackedAssets.fragment, [weth]);

    const isTrackedAsset = await vaultProxy.isTrackedAsset(weth);
    expect(isTrackedAsset).toBe(true);
  });

  it('works as expected', async () => {
    const {
      deployment: {
        tokens: { weth },
      },
      vaultProxy,
    } = await provider.snapshot(snapshot);

    await weth.transfer(vaultProxy, utils.parseEther('1'));

    const receipt = await vaultProxy.addTrackedAsset(weth);
    assertEvent(receipt, 'TrackedAssetAdded', {
      asset: weth,
    });

    const trackedAssets = await vaultProxy.getTrackedAssets();
    expect(trackedAssets).toMatchFunctionOutput(vaultProxy.getTrackedAssets.fragment, [weth]);

    const isTrackedAsset = await vaultProxy.isTrackedAsset(weth);
    expect(isTrackedAsset).toBe(true);
  });
});

describe('removeTrackedAsset', () => {
  it('can only be called by the accessor', async () => {
    const {
      accounts: [randomUser],
      config: { weth },
      vaultProxy,
    } = await provider.snapshot(snapshot);

    await expect(vaultProxy.connect(randomUser).removeTrackedAsset(weth)).rejects.toBeRevertedWith(
      'Only the designated accessor can make this call',
    );
  });

  it('skip if removing a non-tracked asset', async () => {
    const {
      config: { weth },
      vaultProxy,
    } = await provider.snapshot(snapshot);

    await vaultProxy.removeTrackedAsset(weth);

    const trackedAssets = await vaultProxy.getTrackedAssets();
    expect(trackedAssets).toEqual([]);
  });

  it('works as expected', async () => {
    const {
      deployment: {
        tokens: { weth, mln, knc },
      },
      vaultProxy,
    } = await provider.snapshot(snapshot);

    await weth.transfer(vaultProxy, utils.parseEther('1'));
    await mln.transfer(vaultProxy, utils.parseEther('1'));
    await knc.transfer(vaultProxy, utils.parseEther('1'));
    await vaultProxy.addTrackedAsset(weth);
    await vaultProxy.addTrackedAsset(mln);
    await vaultProxy.addTrackedAsset(knc);

    const receipt1 = await vaultProxy.removeTrackedAsset(mln);
    assertEvent(receipt1, 'TrackedAssetRemoved', {
      asset: mln,
    });

    const trackedAssets1 = await vaultProxy.getTrackedAssets();
    expect(trackedAssets1).toMatchFunctionOutput(vaultProxy.getTrackedAssets.fragment, [weth, knc]);

    const receipt2 = await vaultProxy.removeTrackedAsset(weth);
    assertEvent(receipt2, 'TrackedAssetRemoved', {
      asset: weth,
    });

    const trackedAssets2 = await vaultProxy.getTrackedAssets();
    expect(trackedAssets2).toMatchFunctionOutput(vaultProxy.getTrackedAssets.fragment, [knc]);

    const receipt3 = await vaultProxy.removeTrackedAsset(knc);
    assertEvent(receipt3, 'TrackedAssetRemoved', {
      asset: knc,
    });

    const trackedAssets3 = await vaultProxy.getTrackedAssets();
    expect(trackedAssets3).toEqual([]);
  });
});

describe('withdrawAssetTo', () => {
  it('can only be called by the accessor', async () => {
    const {
      accounts: [randomUser],
      config: { weth },
      vaultProxy,
    } = await provider.snapshot(snapshot);

    await expect(
      vaultProxy.connect(randomUser).withdrawAssetTo(weth, randomAddress(), utils.parseEther('2')),
    ).rejects.toBeRevertedWith('Only the designated accessor can make this call');
  });

  it('insufficient balance', async () => {
    const {
      deployment: {
        tokens: { weth },
      },
      vaultProxy,
    } = await provider.snapshot(snapshot);

    await weth.transfer(vaultProxy, utils.parseEther('1'));
    await expect(vaultProxy.withdrawAssetTo(weth, randomAddress(), utils.parseEther('2'))).rejects.toBeRevertedWith(
      'Insufficient balance',
    );
  });

  it('completely withdraw an asset balance and remove tracked asset', async () => {
    const {
      accounts: [investor],
      deployment: {
        tokens: { weth },
      },
      vaultProxy,
    } = await provider.snapshot(snapshot);

    const preTxInvestorBalance = await weth.balanceOf(investor);
    const amount = utils.parseEther('1');

    await weth.transfer(vaultProxy, amount);
    await vaultProxy.addTrackedAsset(weth);
    const trackedAssets1 = await vaultProxy.getTrackedAssets();
    expect(trackedAssets1).toMatchFunctionOutput(vaultProxy.getTrackedAssets.fragment, [weth]);

    const receipt = await vaultProxy.withdrawAssetTo(weth, investor, amount);
    assertEvent(receipt, 'AssetWithdrawn', {
      asset: weth,
      target: investor,
      amount,
    });

    const trackedAssets2 = await vaultProxy.getTrackedAssets();
    expect(trackedAssets2).toEqual([]);

    const postTxInvestorBalance = await weth.balanceOf(investor);
    expect(postTxInvestorBalance).toEqBigNumber(preTxInvestorBalance.add(amount));
  });

  it('partially withdraw an asset balance', async () => {
    const {
      accounts: [investor],
      deployment: {
        tokens: { weth },
      },
      vaultProxy,
    } = await provider.snapshot(snapshot);

    await weth.transfer(vaultProxy, utils.parseEther('1'));

    const preTxInvestorBalance = await weth.balanceOf(investor);
    const preTxVaultBalance = await weth.balanceOf(vaultProxy);
    const withdrawAmount = utils.parseEther('0.5');

    await vaultProxy.addTrackedAsset(weth);
    const trackedAssets1 = await vaultProxy.getTrackedAssets();
    expect(trackedAssets1).toMatchFunctionOutput(vaultProxy.getTrackedAssets.fragment, [weth]);

    const receipt = await vaultProxy.withdrawAssetTo(weth, investor, withdrawAmount);
    assertEvent(receipt, 'AssetWithdrawn', {
      asset: weth,
      target: investor,
      amount: withdrawAmount,
    });

    const trackedAssets2 = await vaultProxy.getTrackedAssets();
    expect(trackedAssets2).toMatchFunctionOutput(vaultProxy.getTrackedAssets.fragment, [weth]);

    const postTxInvestorBalance = await weth.balanceOf(investor);
    expect(postTxInvestorBalance).toEqBigNumber(preTxInvestorBalance.add(withdrawAmount));

    const postTxVaultBalance = await weth.balanceOf(vaultProxy);
    expect(postTxVaultBalance).toEqBigNumber(preTxVaultBalance.sub(withdrawAmount));
  });
});

describe('approveAssetSpender', () => {
  it('can only be called by the accessor', async () => {
    const {
      accounts: [randomUser, investor],
      config: { weth },
      vaultProxy,
    } = await provider.snapshot(snapshot);

    await expect(
      vaultProxy.connect(randomUser).approveAssetSpender(weth, investor, utils.parseEther('1')),
    ).rejects.toBeRevertedWith('Only the designated accessor can make this call');
  });

  it('works as expected', async () => {
    const {
      accounts: [investor],
      deployment: {
        tokens: { weth },
      },
      vaultProxy,
    } = await provider.snapshot(snapshot);

    const amount = utils.parseEther('1');

    const receipt = await vaultProxy.approveAssetSpender(weth, investor, amount);
    assertEvent(receipt, 'Approval', {
      owner: vaultProxy,
      spender: investor,
      value: amount,
    });

    const allowance = await weth.allowance(vaultProxy, investor);
    expect(allowance).toEqBigNumber(amount);
  });
});

describe('mintShares', () => {
  it('can only be called by the accessor', async () => {
    const {
      accounts: [randomUser, investor],
      vaultProxy,
    } = await provider.snapshot(snapshot);

    await expect(vaultProxy.connect(randomUser).mintShares(investor, utils.parseEther('1'))).rejects.toBeRevertedWith(
      'Only the designated accessor can make this call',
    );
  });

  it('does not allow mint to a zero address', async () => {
    const { vaultProxy } = await provider.snapshot(snapshot);

    await expect(vaultProxy.mintShares(constants.AddressZero, utils.parseEther('1'))).rejects.toBeRevertedWith(
      'mint to the zero address',
    );
  });

  it('works as expected', async () => {
    const {
      accounts: [investor],
      vaultProxy,
    } = await provider.snapshot(snapshot);

    const preTxTotalSupply = await vaultProxy.totalSupply();
    expect(preTxTotalSupply).toEqBigNumber(utils.parseEther('0'));

    const amount = utils.parseEther('1');

    const receipt = await vaultProxy.mintShares(investor, amount);
    assertEvent(receipt, 'Transfer', {
      from: constants.AddressZero,
      to: investor,
      value: amount,
    });

    const postTxTotalSupply = await vaultProxy.totalSupply();
    expect(postTxTotalSupply).toEqBigNumber(amount);

    const investorShares = await vaultProxy.balanceOf(investor);
    expect(investorShares).toEqBigNumber(amount);
  });
});

describe('burnShares', () => {
  it('can only be called by the accessor', async () => {
    const {
      accounts: [randomUser, investor],
      vaultProxy,
    } = await provider.snapshot(snapshot);

    await expect(vaultProxy.connect(randomUser).burnShares(investor, utils.parseEther('1'))).rejects.toBeRevertedWith(
      'Only the designated accessor can make this call',
    );
  });

  it('does not allow burn from a zero address', async () => {
    const { vaultProxy } = await provider.snapshot(snapshot);

    await expect(vaultProxy.burnShares(constants.AddressZero, utils.parseEther('1'))).rejects.toBeRevertedWith(
      'burn from the zero address',
    );
  });

  it('does not allow burn amount exceeds balance', async () => {
    const {
      accounts: [investor],
      vaultProxy,
    } = await provider.snapshot(snapshot);

    const amount = utils.parseEther('1');

    // mint shares
    {
      const preTxTotalSupply = await vaultProxy.totalSupply();
      expect(preTxTotalSupply).toEqBigNumber(utils.parseEther('0'));

      await vaultProxy.mintShares(investor, amount);

      const postTxTotalSupply = await vaultProxy.totalSupply();
      expect(postTxTotalSupply).toEqBigNumber(amount);

      const investorShares = await vaultProxy.balanceOf(investor);
      expect(investorShares).toEqBigNumber(amount);
    }

    // burn shares
    await expect(vaultProxy.burnShares(investor, amount.add(BigNumber.from(1)))).rejects.toBeRevertedWith(
      'burn amount exceeds balance',
    );
  });

  it('works as expected', async () => {
    const {
      accounts: [investor],
      vaultProxy,
    } = await provider.snapshot(snapshot);

    const amount = utils.parseEther('1');

    // mint shares
    {
      const preTxTotalSupply = await vaultProxy.totalSupply();
      expect(preTxTotalSupply).toEqBigNumber(utils.parseEther('0'));

      await vaultProxy.mintShares(investor, amount);

      const postTxTotalSupply = await vaultProxy.totalSupply();
      expect(postTxTotalSupply).toEqBigNumber(amount);

      const investorShares = await vaultProxy.balanceOf(investor);
      expect(investorShares).toEqBigNumber(amount);
    }

    // burn shares
    const receipt = await vaultProxy.burnShares(investor, amount);
    assertEvent(receipt, 'Transfer', {
      from: investor,
      to: constants.AddressZero,
      value: amount,
    });

    const totalSupply = await vaultProxy.totalSupply();
    expect(totalSupply).toEqBigNumber(utils.parseEther('0'));

    const investorShares = await vaultProxy.balanceOf(investor);
    expect(investorShares).toEqBigNumber(utils.parseEther('0'));
  });
});

describe('transferShares', () => {
  it('can only be called by the accessor', async () => {
    const {
      accounts: [randomUser, investor1, investor2],
      vaultProxy,
    } = await provider.snapshot(snapshot);

    await expect(
      vaultProxy.connect(randomUser).transferShares(investor1, investor2, utils.parseEther('1')),
    ).rejects.toBeRevertedWith('Only the designated accessor can make this call');
  });

  it('does not allow sender is an zero address', async () => {
    const { vaultProxy } = await provider.snapshot(snapshot);

    await expect(
      vaultProxy.transferShares(constants.AddressZero, randomAddress(), BigNumber.from(1)),
    ).rejects.toBeRevertedWith('transfer from the zero address');
  });

  it('does not allow recipient is an zero address', async () => {
    const { vaultProxy } = await provider.snapshot(snapshot);

    await expect(
      vaultProxy.transferShares(randomAddress(), constants.AddressZero, BigNumber.from(1)),
    ).rejects.toBeRevertedWith('transfer to the zero address');
  });

  it('does not allow transfer amount to exceed balance', async () => {
    const {
      accounts: [investor1, investor2],
      vaultProxy,
    } = await provider.snapshot(snapshot);

    const amount = utils.parseEther('1');

    // mint shares to investor1
    {
      const preTxTotalSupply = await vaultProxy.totalSupply();
      expect(preTxTotalSupply).toEqBigNumber(utils.parseEther('0'));

      await vaultProxy.mintShares(investor1, amount);

      const postTxTotalSupply = await vaultProxy.totalSupply();
      expect(postTxTotalSupply).toEqBigNumber(amount);

      const investorShares = await vaultProxy.balanceOf(investor1);
      expect(investorShares).toEqBigNumber(amount);
    }

    // transfer shares
    await expect(
      vaultProxy.transferShares(investor1, investor2, amount.add(BigNumber.from(1))),
    ).rejects.toBeRevertedWith('transfer amount exceeds balance');
  });

  it('works as expected', async () => {
    const {
      accounts: [investor1, investor2],
      vaultProxy,
    } = await provider.snapshot(snapshot);

    const amount = utils.parseEther('1');

    // mint shares to investor1
    {
      const preTxTotalSupply = await vaultProxy.totalSupply();
      expect(preTxTotalSupply).toEqBigNumber(utils.parseEther('0'));

      await vaultProxy.mintShares(investor1, amount);

      const postTxTotalSupply = await vaultProxy.totalSupply();
      expect(postTxTotalSupply).toEqBigNumber(amount);

      const investorShares = await vaultProxy.balanceOf(investor1);
      expect(investorShares).toEqBigNumber(amount);
    }

    // transfer shares
    const receipt = await vaultProxy.transferShares(investor1, investor2, amount);
    assertEvent(receipt, 'Transfer', {
      from: investor1,
      to: investor2,
      value: amount,
    });

    const investor1Shares = await vaultProxy.balanceOf(investor1);
    expect(investor1Shares).toEqBigNumber(BigNumber.from(0));

    const investor2Shares = await vaultProxy.balanceOf(investor2);
    expect(investor2Shares).toEqBigNumber(amount);
  });
});

// TODO: callOnContract
