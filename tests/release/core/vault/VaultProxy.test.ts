import { extractEvent, randomAddress } from '@enzymefinance/ethers';
import { IMigrationHookHandler, StandardToken, VaultLib, WETH } from '@enzymefinance/protocol';
import { addNewAssetsToFund, assertEvent, createNewFund, deployProtocolFixture } from '@enzymefinance/testutils';
import { BigNumber, constants, utils } from 'ethers';

async function snapshot() {
  const {
    deployer,
    accounts: [fundOwner, ...accounts],
    deployment: { vaultLib, dispatcher, fundDeployer, integrationManager, trackedAssetsAdapter },
    config,
  } = await deployProtocolFixture();

  const weth = new WETH(config.weth, whales.weth);
  const fundName = 'VaultLib Test Fund';

  // Mock a FundDeployer to set as the current fund deployer
  const mockFundDeployer = await IMigrationHookHandler.mock(deployer);
  await dispatcher.setCurrentFundDeployer(mockFundDeployer);

  // Use a generic mock contract as the vault accessor
  const mockVaultAccessor = await IMigrationHookHandler.mock(deployer);

  // Deploy the VaultProxy via the Dispatcher
  const deployVaultProxyReceipt = await mockFundDeployer.forward(
    dispatcher.deployVaultProxy,
    vaultLib,
    fundOwner,
    mockVaultAccessor,
    fundName,
  );

  // Create a VaultLib instance with the deployed VaultProxy address, parsed from the deployment event
  const vaultProxyDeployedEvent = extractEvent(deployVaultProxyReceipt, 'VaultProxyDeployed')[0];
  const vaultProxy = new VaultLib(vaultProxyDeployedEvent.args.vaultProxy, provider);

  return {
    config,
    weth,
    accounts,
    fundName,
    fundOwner,
    mockFundDeployer,
    mockVaultAccessor,
    fundDeployer,
    integrationManager,
    trackedAssetsAdapter,
    dispatcher,
    vaultProxy,
  };
}

describe('init', () => {
  it('correctly sets initial proxy values', async () => {
    const { dispatcher, fundName, fundOwner, mockVaultAccessor, vaultProxy } = await provider.snapshot(snapshot);

    const accessorValue = await vaultProxy.getAccessor();
    expect(accessorValue).toMatchAddress(mockVaultAccessor);

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
    expect(symbolValue).toBe('ENZF');

    const decimalsValue = await vaultProxy.decimals();
    expect(decimalsValue).toBe(18);
  });
});

describe('addTrackedAsset', () => {
  it('can only be called by the accessor', async () => {
    const {
      accounts: [arbitraryUser],
      weth,
      vaultProxy,
    } = await provider.snapshot(snapshot);

    await expect(vaultProxy.connect(arbitraryUser).addTrackedAsset(weth)).rejects.toBeRevertedWith(
      'Only the designated accessor can make this call',
    );
  });

  it('skip if the asset already exists', async () => {
    const { weth, mockVaultAccessor, vaultProxy } = await provider.snapshot(snapshot);

    await weth.transfer(vaultProxy, utils.parseEther('1'));
    await mockVaultAccessor.forward(vaultProxy.addTrackedAsset, weth);

    const trackedAssets = await vaultProxy.getTrackedAssets();
    expect(trackedAssets).toMatchFunctionOutput(vaultProxy.getTrackedAssets, [weth]);

    const isTrackedAsset = await vaultProxy.isTrackedAsset(weth);
    expect(isTrackedAsset).toBe(true);
  });

  it('does not allow exceeding the tracked assets limit', async () => {
    const { fundOwner, weth, dispatcher, fundDeployer, integrationManager, trackedAssetsAdapter, config } =
      await provider.snapshot(snapshot);

    // Reset the deployed FundDeployer as the currentFundDeployer
    await dispatcher.setCurrentFundDeployer(fundDeployer);

    // Create a new fund
    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer,
      denominationAsset: weth,
    });

    const assets = [
      new StandardToken(config.primitives.bat, whales.bat),
      new StandardToken(config.primitives.bnb, whales.bnb),
      new StandardToken(config.primitives.bnt, whales.bnt),
      new StandardToken(config.primitives.comp, whales.comp),
      new StandardToken(config.primitives.dai, whales.dai),
      new StandardToken(config.primitives.knc, whales.knc),
      new StandardToken(config.primitives.link, whales.link),
      new StandardToken(config.primitives.mana, whales.mana),
      new StandardToken(config.primitives.mln, whales.mln),
      new StandardToken(config.primitives.repv2, whales.repv2),
      new StandardToken(config.primitives.ren, whales.ren),
      new StandardToken(config.primitives.uni, whales.uni),
      new StandardToken(config.primitives.usdc, whales.usdc),
      new StandardToken(config.primitives.usdt, whales.usdt),
      new StandardToken(config.primitives.zrx, whales.zrx),
      new StandardToken(config.compound.ctokens.czrx, whales.czrx),
      new StandardToken(config.compound.ctokens.ccomp, whales.ccomp),
      new StandardToken(config.compound.ctokens.cusdc, whales.cusdc),
      new StandardToken(config.synthetix.susd, whales.susd),
    ];

    const extra = new StandardToken(config.compound.ctokens.cuni, whales.cuni);

    // Seed with 19 assets to reach the max assets limit
    // (since the denomination asset is already tracked).
    await addNewAssetsToFund({
      fundOwner,
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      trackedAssetsAdapter,
      assets,
    });

    // Adding a new asset should fail
    await expect(
      addNewAssetsToFund({
        fundOwner,
        comptrollerProxy,
        vaultProxy,
        integrationManager,
        trackedAssetsAdapter,
        assets: [extra],
      }),
    ).rejects.toBeRevertedWith('Limit exceeded');
  });

  it('works as expected', async () => {
    const { weth, mockVaultAccessor, vaultProxy } = await provider.snapshot(snapshot);

    await weth.transfer(vaultProxy, utils.parseEther('1'));

    const receipt = await mockVaultAccessor.forward(vaultProxy.addTrackedAsset, weth);
    assertEvent(receipt, 'TrackedAssetAdded', {
      asset: weth,
    });

    const trackedAssets = await vaultProxy.getTrackedAssets();
    expect(trackedAssets).toMatchFunctionOutput(vaultProxy.getTrackedAssets, [weth]);

    const isTrackedAsset = await vaultProxy.isTrackedAsset(weth);
    expect(isTrackedAsset).toBe(true);
  });
});

describe('removeTrackedAsset', () => {
  it('can only be called by the accessor', async () => {
    const {
      accounts: [arbitraryUser],
      weth,
      vaultProxy,
    } = await provider.snapshot(snapshot);

    await expect(vaultProxy.connect(arbitraryUser).removeTrackedAsset(weth)).rejects.toBeRevertedWith(
      'Only the designated accessor can make this call',
    );
  });

  it('skip if removing a non-tracked asset', async () => {
    const { weth, mockVaultAccessor, vaultProxy } = await provider.snapshot(snapshot);

    await mockVaultAccessor.forward(vaultProxy.removeTrackedAsset, weth);

    const trackedAssets = await vaultProxy.getTrackedAssets();
    expect(trackedAssets).toEqual([]);
  });

  it('works as expected', async () => {
    const { weth, config, mockVaultAccessor, vaultProxy } = await provider.snapshot(snapshot);

    const mln = new StandardToken(config.primitives.mln, whales.mln);
    const knc = new StandardToken(config.primitives.knc, whales.knc);

    await weth.transfer(vaultProxy, utils.parseEther('1'));
    await mln.transfer(vaultProxy, utils.parseEther('1'));
    await knc.transfer(vaultProxy, utils.parseEther('1'));
    await mockVaultAccessor.forward(vaultProxy.addTrackedAsset, weth);
    await mockVaultAccessor.forward(vaultProxy.addTrackedAsset, mln);
    await mockVaultAccessor.forward(vaultProxy.addTrackedAsset, knc);

    const receipt1 = await mockVaultAccessor.forward(vaultProxy.removeTrackedAsset, mln);
    assertEvent(receipt1, 'TrackedAssetRemoved', {
      asset: mln,
    });

    const trackedAssets1 = await vaultProxy.getTrackedAssets();
    expect(trackedAssets1).toMatchFunctionOutput(vaultProxy.getTrackedAssets, [weth, knc]);
  });
});

describe('withdrawAssetTo', () => {
  it('can only be called by the accessor', async () => {
    const {
      accounts: [arbitraryUser],
      weth,
      vaultProxy,
    } = await provider.snapshot(snapshot);

    await expect(
      vaultProxy.connect(arbitraryUser).withdrawAssetTo(weth, randomAddress(), utils.parseEther('2')),
    ).rejects.toBeRevertedWith('Only the designated accessor can make this call');
  });

  it('partially withdraw an asset balance', async () => {
    const {
      accounts: [investor],
      weth,
      mockVaultAccessor,
      vaultProxy,
    } = await provider.snapshot(snapshot);

    await weth.transfer(vaultProxy, utils.parseEther('1'));

    const preTxInvestorBalance = await weth.balanceOf(investor);
    const preTxVaultBalance = await weth.balanceOf(vaultProxy);
    const withdrawAmount = utils.parseEther('0.5');

    await mockVaultAccessor.forward(vaultProxy.addTrackedAsset, weth);

    const trackedAssets1 = await vaultProxy.getTrackedAssets();
    expect(trackedAssets1).toMatchFunctionOutput(vaultProxy.getTrackedAssets, [weth]);

    const receipt = await mockVaultAccessor.forward(vaultProxy.withdrawAssetTo, weth, investor, withdrawAmount);
    assertEvent(receipt, 'AssetWithdrawn', {
      asset: weth,
      target: investor,
      amount: withdrawAmount,
    });

    const trackedAssets2 = await vaultProxy.getTrackedAssets();
    expect(trackedAssets2).toMatchFunctionOutput(vaultProxy.getTrackedAssets, [weth]);

    const postTxInvestorBalance = await weth.balanceOf(investor);
    expect(postTxInvestorBalance).toEqBigNumber(preTxInvestorBalance.add(withdrawAmount));

    const postTxVaultBalance = await weth.balanceOf(vaultProxy);
    expect(postTxVaultBalance).toEqBigNumber(preTxVaultBalance.sub(withdrawAmount));
  });
});

describe('approveAssetSpender', () => {
  it('can only be called by the accessor', async () => {
    const {
      accounts: [arbitraryUser, investor],
      weth,
      vaultProxy,
    } = await provider.snapshot(snapshot);

    await expect(
      vaultProxy.connect(arbitraryUser).approveAssetSpender(weth, investor, utils.parseEther('1')),
    ).rejects.toBeRevertedWith('Only the designated accessor can make this call');
  });

  it('works as expected', async () => {
    const {
      accounts: [investor],
      weth,
      mockVaultAccessor,
      vaultProxy,
    } = await provider.snapshot(snapshot);

    const amount = utils.parseEther('1');

    const receipt = await mockVaultAccessor.forward(vaultProxy.approveAssetSpender, weth, investor, amount);
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
      accounts: [arbitraryUser, investor],
      vaultProxy,
    } = await provider.snapshot(snapshot);

    await expect(
      vaultProxy.connect(arbitraryUser).mintShares(investor, utils.parseEther('1')),
    ).rejects.toBeRevertedWith('Only the designated accessor can make this call');
  });

  it('does not allow mint to a zero address', async () => {
    const { mockVaultAccessor, vaultProxy } = await provider.snapshot(snapshot);

    await expect(
      mockVaultAccessor.forward(vaultProxy.mintShares, constants.AddressZero, utils.parseEther('1')),
    ).rejects.toBeRevertedWith('mint to the zero address');
  });

  it('works as expected', async () => {
    const {
      accounts: [investor],
      mockVaultAccessor,
      vaultProxy,
    } = await provider.snapshot(snapshot);

    const preTxTotalSupply = await vaultProxy.totalSupply();
    expect(preTxTotalSupply).toEqBigNumber(utils.parseEther('0'));

    const amount = utils.parseEther('1');

    const receipt = await mockVaultAccessor.forward(vaultProxy.mintShares, investor, amount);
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
      accounts: [arbitraryUser, investor],
      vaultProxy,
    } = await provider.snapshot(snapshot);

    await expect(
      vaultProxy.connect(arbitraryUser).burnShares(investor, utils.parseEther('1')),
    ).rejects.toBeRevertedWith('Only the designated accessor can make this call');
  });

  it('does not allow burn from a zero address', async () => {
    const { mockVaultAccessor, vaultProxy } = await provider.snapshot(snapshot);

    await expect(
      mockVaultAccessor.forward(vaultProxy.burnShares, constants.AddressZero, utils.parseEther('1')),
    ).rejects.toBeRevertedWith('burn from the zero address');
  });

  it('does not allow burn amount exceeds balance', async () => {
    const {
      accounts: [investor],
      mockVaultAccessor,
      vaultProxy,
    } = await provider.snapshot(snapshot);

    const amount = utils.parseEther('1');

    // mint shares
    {
      const preTxTotalSupply = await vaultProxy.totalSupply();
      expect(preTxTotalSupply).toEqBigNumber(utils.parseEther('0'));

      await mockVaultAccessor.forward(vaultProxy.mintShares, investor, amount);

      const postTxTotalSupply = await vaultProxy.totalSupply();
      expect(postTxTotalSupply).toEqBigNumber(amount);

      const investorShares = await vaultProxy.balanceOf(investor);
      expect(investorShares).toEqBigNumber(amount);
    }

    // burn shares
    await expect(
      mockVaultAccessor.forward(vaultProxy.burnShares, investor, amount.add(BigNumber.from(1))),
    ).rejects.toBeRevertedWith('burn amount exceeds balance');
  });

  it('works as expected', async () => {
    const {
      accounts: [investor],
      mockVaultAccessor,
      vaultProxy,
    } = await provider.snapshot(snapshot);

    const amount = utils.parseEther('1');

    // mint shares
    {
      const preTxTotalSupply = await vaultProxy.totalSupply();
      expect(preTxTotalSupply).toEqBigNumber(utils.parseEther('0'));

      await mockVaultAccessor.forward(vaultProxy.mintShares, investor, amount);

      const postTxTotalSupply = await vaultProxy.totalSupply();
      expect(postTxTotalSupply).toEqBigNumber(amount);

      const investorShares = await vaultProxy.balanceOf(investor);
      expect(investorShares).toEqBigNumber(amount);
    }

    // burn shares
    const receipt = await mockVaultAccessor.forward(vaultProxy.burnShares, investor, amount);
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
      accounts: [arbitraryUser, investor1, investor2],
      vaultProxy,
    } = await provider.snapshot(snapshot);

    await expect(
      vaultProxy.connect(arbitraryUser).transferShares(investor1, investor2, utils.parseEther('1')),
    ).rejects.toBeRevertedWith('Only the designated accessor can make this call');
  });

  it('does not allow sender is an zero address', async () => {
    const { mockVaultAccessor, vaultProxy } = await provider.snapshot(snapshot);

    await expect(
      mockVaultAccessor.forward(vaultProxy.transferShares, constants.AddressZero, randomAddress(), BigNumber.from(1)),
    ).rejects.toBeRevertedWith('transfer from the zero address');
  });

  it('does not allow recipient is an zero address', async () => {
    const { mockVaultAccessor, vaultProxy } = await provider.snapshot(snapshot);

    await expect(
      mockVaultAccessor.forward(vaultProxy.transferShares, randomAddress(), constants.AddressZero, BigNumber.from(1)),
    ).rejects.toBeRevertedWith('transfer to the zero address');
  });

  it('does not allow transfer amount to exceed balance', async () => {
    const {
      accounts: [investor1, investor2],
      mockVaultAccessor,
      vaultProxy,
    } = await provider.snapshot(snapshot);

    const amount = utils.parseEther('1');

    // mint shares to investor1
    {
      const preTxTotalSupply = await vaultProxy.totalSupply();
      expect(preTxTotalSupply).toEqBigNumber(utils.parseEther('0'));

      await mockVaultAccessor.forward(vaultProxy.mintShares, investor1, amount);

      const postTxTotalSupply = await vaultProxy.totalSupply();
      expect(postTxTotalSupply).toEqBigNumber(amount);

      const investorShares = await vaultProxy.balanceOf(investor1);
      expect(investorShares).toEqBigNumber(amount);
    }

    // transfer shares
    await expect(
      mockVaultAccessor.forward(vaultProxy.transferShares, investor1, investor2, amount.add(BigNumber.from(1))),
    ).rejects.toBeRevertedWith('transfer amount exceeds balance');
  });

  it('works as expected', async () => {
    const {
      accounts: [investor1, investor2],
      mockVaultAccessor,
      vaultProxy,
    } = await provider.snapshot(snapshot);

    const amount = utils.parseEther('1');

    // mint shares to investor1
    {
      const preTxTotalSupply = await vaultProxy.totalSupply();
      expect(preTxTotalSupply).toEqBigNumber(utils.parseEther('0'));

      await mockVaultAccessor.forward(vaultProxy.mintShares, investor1, amount);

      const postTxTotalSupply = await vaultProxy.totalSupply();
      expect(postTxTotalSupply).toEqBigNumber(amount);

      const investorShares = await vaultProxy.balanceOf(investor1);
      expect(investorShares).toEqBigNumber(amount);
    }

    // transfer shares
    const receipt = await mockVaultAccessor.forward(vaultProxy.transferShares, investor1, investor2, amount);
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
