import { SignerWithAddress } from '@enzymefinance/hardhat';
import { AddressLike, randomAddress } from '@enzymefinance/ethers';
import { StandardToken, VaultLib, VaultProxy, encodeFunctionData } from '@enzymefinance/protocol';
import {
  ProtocolDeployment,
  addNewAssetsToFund,
  addTrackedAssets,
  assertEvent,
  createNewFund,
  deployProtocolFixture,
} from '@enzymefinance/testutils';
import { BigNumber, constants, utils } from 'ethers';

async function createVaultProxy({
  signer,
  vaultLib,
  fundOwner,
  fundAccessor,
  fundName = 'My Fund',
}: {
  signer: SignerWithAddress;
  vaultLib: VaultLib;
  fundOwner: AddressLike;
  fundAccessor: SignerWithAddress;
  fundName?: string;
}) {
  const constructData = encodeFunctionData(vaultLib.init.fragment, [fundOwner, fundAccessor, fundName]);

  const vaultProxyContract = await VaultProxy.deploy(signer, constructData, vaultLib);

  return new VaultLib(vaultProxyContract, fundAccessor);
}

let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('receive', () => {
  it('immediately wraps ETH as WETH', async () => {
    const [fundOwner] = fork.accounts;
    const weth = new StandardToken(fork.config.weth, provider);

    const { vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      denominationAsset: weth,
      fundDeployer: fork.deployment.fundDeployer,
    });

    // Send ETH to the VaultProxy
    const ethAmount = utils.parseEther('2');
    await fundOwner.sendTransaction({
      to: vaultProxy.address,
      value: ethAmount,
    });

    // VaultProxy ETH balance should be 0 and WETH balance should be the sent ETH amount
    expect(await provider.getBalance(vaultProxy.address)).toEqBigNumber(0);
    expect(await weth.balanceOf(vaultProxy)).toEqBigNumber(ethAmount);
  });
});

describe('init', () => {
  it('correctly sets initial proxy values', async () => {
    const [fundOwner] = fork.accounts;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundName: 'My Fund',
    });

    const accessorValue = await vaultProxy.getAccessor();
    expect(accessorValue).toMatchAddress(comptrollerProxy);

    const creatorValue = await vaultProxy.getCreator();
    expect(creatorValue).toMatchAddress(fork.deployment.dispatcher);

    const migratorValue = await vaultProxy.getMigrator();
    expect(migratorValue).toMatchAddress(constants.AddressZero);

    const ownerValue = await vaultProxy.getOwner();
    expect(ownerValue).toMatchAddress(fundOwner);

    const trackedAssetsValue = await vaultProxy.getTrackedAssets();
    expect(trackedAssetsValue).toMatchFunctionOutput(vaultProxy.getTrackedAssets, [fork.config.weth]);

    // SharesToken values

    const nameValue = await vaultProxy.name();
    expect(nameValue).toBe('My Fund');

    const symbolValue = await vaultProxy.symbol();
    expect(symbolValue).toBe('ENZF');

    const decimalsValue = await vaultProxy.decimals();
    expect(decimalsValue).toBe(18);
  });
});

describe('addTrackedAsset', () => {
  it('can only be called by the accessor', async () => {
    const [fundOwner, arbitraryUser] = fork.accounts;

    const { vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: new StandardToken(fork.config.weth, provider),
    });

    await expect(vaultProxy.connect(arbitraryUser).addTrackedAsset(fork.config.weth)).rejects.toBeRevertedWith(
      'Only the designated accessor can make this call',
    );
  });

  it('cannot specify shares as the asset', async () => {
    const [fundOwner, fundAccessor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    await expect(vaultProxy.addTrackedAsset(vaultProxy)).rejects.toBeRevertedWith('Cannot act on shares');
  });

  it('skip if the asset already exists', async () => {
    const [fundOwner, fundAccessor] = fork.accounts;
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    await vaultProxy.addTrackedAsset(weth);
    await vaultProxy.addTrackedAsset(weth);

    const trackedAssets = await vaultProxy.getTrackedAssets();
    expect(trackedAssets).toMatchFunctionOutput(vaultProxy.getTrackedAssets, [weth]);

    const isTrackedAsset = await vaultProxy.isTrackedAsset(weth);
    expect(isTrackedAsset).toBe(true);
  });

  it('does not allow exceeding the tracked assets limit', async () => {
    const [fundOwner] = fork.accounts;
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const integrationManager = fork.deployment.integrationManager;
    const trackedAssetsAdapter = fork.deployment.trackedAssetsAdapter;

    // Create a new fund
    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: weth,
    });

    const assets = [
      new StandardToken(fork.config.primitives.bat, whales.bat),
      new StandardToken(fork.config.primitives.bnb, whales.bnb),
      new StandardToken(fork.config.primitives.bnt, whales.bnt),
      new StandardToken(fork.config.primitives.comp, whales.comp),
      new StandardToken(fork.config.primitives.dai, whales.dai),
      new StandardToken(fork.config.primitives.knc, whales.knc),
      new StandardToken(fork.config.primitives.link, whales.link),
      new StandardToken(fork.config.primitives.mana, whales.mana),
      new StandardToken(fork.config.primitives.mln, whales.mln),
      new StandardToken(fork.config.primitives.rep, whales.rep),
      new StandardToken(fork.config.primitives.ren, whales.ren),
      new StandardToken(fork.config.primitives.uni, whales.uni),
      new StandardToken(fork.config.primitives.usdc, whales.usdc),
      new StandardToken(fork.config.primitives.usdt, whales.usdt),
      new StandardToken(fork.config.primitives.zrx, whales.zrx),
      new StandardToken(fork.config.compound.ctokens.czrx, whales.czrx),
      new StandardToken(fork.config.compound.ctokens.ccomp, whales.ccomp),
      new StandardToken(fork.config.compound.ctokens.cusdc, whales.cusdc),
      new StandardToken(fork.config.synthetix.susd, whales.susd),
    ];

    const extra = new StandardToken(fork.config.compound.ctokens.cuni, whales.cuni);

    // Seed with 19 assets to reach the max assets limit
    // (since the denomination asset is already tracked).
    // Use this loop instead of addNewAssetsToFund() to make debugging easier
    // when a whale changes.
    for (const asset of Object.values(assets)) {
      const decimals = await asset.decimals();
      const transferAmount = utils.parseUnits('1', decimals);
      await asset.transfer(vaultProxy, transferAmount);

      const balance = await asset.balanceOf(vaultProxy);
      expect(balance).toBeGteBigNumber(transferAmount);
    }
    await addTrackedAssets({
      comptrollerProxy,
      fundOwner,
      integrationManager,
      trackedAssetsAdapter,
      incomingAssets: assets,
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
    const [fundOwner, fundAccessor] = fork.accounts;
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    const receipt = await vaultProxy.addTrackedAsset(weth);
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
    const [fundOwner, arbitraryUser] = fork.accounts;

    const { vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: new StandardToken(fork.config.weth, provider),
    });

    await expect(vaultProxy.connect(arbitraryUser).removeTrackedAsset(fork.config.weth)).rejects.toBeRevertedWith(
      'Only the designated accessor can make this call',
    );
  });

  it('skip if removing a non-tracked asset', async () => {
    const [fundOwner, fundAccessor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    await vaultProxy.removeTrackedAsset(fork.config.weth);

    const trackedAssets = await vaultProxy.getTrackedAssets();
    expect(trackedAssets).toEqual([]);
  });

  it('works as expected', async () => {
    const [fundOwner, fundAccessor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    const mln = new StandardToken(fork.config.primitives.mln, whales.mln);
    const knc = new StandardToken(fork.config.primitives.knc, whales.knc);

    await vaultProxy.addTrackedAsset(mln);
    await vaultProxy.addTrackedAsset(knc);

    const receipt1 = await vaultProxy.removeTrackedAsset(mln);
    assertEvent(receipt1, 'TrackedAssetRemoved', {
      asset: mln,
    });

    const trackedAssets1 = await vaultProxy.getTrackedAssets();
    expect(trackedAssets1).toMatchFunctionOutput(vaultProxy.getTrackedAssets, [knc]);
  });
});

describe('withdrawAssetTo', () => {
  it('can only be called by the accessor', async () => {
    const [fundOwner, fundAccessor, arbitraryUser] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    await expect(
      vaultProxy.connect(arbitraryUser).withdrawAssetTo(fork.config.weth, randomAddress(), utils.parseEther('2')),
    ).rejects.toBeRevertedWith('Only the designated accessor can make this call');
  });

  it('cannot specify shares as the asset', async () => {
    const [fundOwner, fundAccessor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    await expect(vaultProxy.withdrawAssetTo(vaultProxy, randomAddress(), 1)).rejects.toBeRevertedWith(
      'Cannot act on shares',
    );
  });

  //TODO: should be moved to integration test like redeemShares
  xit('partially withdraw an asset balance', async () => {
    const [fundOwner, fundAccessor, investor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);
    const weth = new StandardToken(fork.config.weth, whales.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    await weth.transfer(vaultProxy, utils.parseEther('1'));

    const preTxInvestorBalance = await weth.balanceOf(investor);
    const preTxVaultBalance = await weth.balanceOf(vaultProxy);
    const withdrawAmount = utils.parseEther('0.5');

    const trackedAssets1 = await vaultProxy.getTrackedAssets();
    expect(trackedAssets1).toMatchFunctionOutput(vaultProxy.getTrackedAssets, [weth]);

    const receipt = await vaultProxy.withdrawAssetTo(weth, investor, withdrawAmount);
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
    const [arbitraryUser, fundOwner, fundAccessor, investor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    await expect(
      vaultProxy.connect(arbitraryUser).approveAssetSpender(fork.config.weth, investor, utils.parseEther('1')),
    ).rejects.toBeRevertedWith('Only the designated accessor can make this call');
  });

  it('cannot specify shares as the asset', async () => {
    const [fundOwner, fundAccessor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    await expect(vaultProxy.approveAssetSpender(vaultProxy, randomAddress(), 1)).rejects.toBeRevertedWith(
      'Cannot act on shares',
    );
  });

  it('works as expected', async () => {
    const [fundOwner, fundAccessor, investor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);
    const weth = new StandardToken(fork.config.weth, whales.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

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
    const [arbitraryUser, fundOwner, fundAccessor, investor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    await expect(
      vaultProxy.connect(arbitraryUser).mintShares(investor, utils.parseEther('1')),
    ).rejects.toBeRevertedWith('Only the designated accessor can make this call');
  });

  it('does not allow mint to a zero address', async () => {
    const [fundOwner, fundAccessor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    await expect(vaultProxy.mintShares(constants.AddressZero, utils.parseEther('1'))).rejects.toBeRevertedWith(
      'mint to the zero address',
    );
  });

  it('works as expected', async () => {
    const [fundOwner, fundAccessor, investor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

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
    const [arbitraryUser, fundOwner, fundAccessor, investor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    await expect(
      vaultProxy.connect(arbitraryUser).burnShares(investor, utils.parseEther('1')),
    ).rejects.toBeRevertedWith('Only the designated accessor can make this call');
  });

  it('does not allow burn from a zero address', async () => {
    const [fundOwner, fundAccessor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    await expect(vaultProxy.burnShares(constants.AddressZero, utils.parseEther('1'))).rejects.toBeRevertedWith(
      'burn from the zero address',
    );
  });

  it('does not allow burn amount exceeds balance', async () => {
    const [fundOwner, fundAccessor, investor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

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
    const [fundOwner, fundAccessor, investor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

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
    const [arbitraryUser, fundOwner, investor1, investor2] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor: fork.deployer,
    });

    await expect(
      vaultProxy.connect(arbitraryUser).transferShares(investor1, investor2, utils.parseEther('1')),
    ).rejects.toBeRevertedWith('Only the designated accessor can make this call');
  });

  it('does not allow sender is an zero address', async () => {
    const [fundOwner, fundAccessor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    await expect(
      vaultProxy.transferShares(constants.AddressZero, randomAddress(), BigNumber.from(1)),
    ).rejects.toBeRevertedWith('transfer from the zero address');
  });

  it('does not allow recipient is an zero address', async () => {
    const [fundOwner, fundAccessor] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

    await expect(
      vaultProxy.transferShares(randomAddress(), constants.AddressZero, BigNumber.from(1)),
    ).rejects.toBeRevertedWith('transfer to the zero address');
  });

  it('does not allow transfer amount to exceed balance', async () => {
    const [fundOwner, fundAccessor, investor1, investor2] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

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
    const [fundOwner, fundAccessor, investor1, investor2] = fork.accounts;
    const vaultLib = await VaultLib.deploy(fork.deployer, fork.config.weth);

    const vaultProxy = await createVaultProxy({
      signer: fork.deployer,
      vaultLib,
      fundOwner,
      fundAccessor,
    });

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

describe('setNominatedOwner', () => {
  it('can only be called by the contract owner', async () => {
    const [fundOwner, randomUser] = fork.accounts;

    const { vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
    });

    await expect(vaultProxy.connect(randomUser).setNominatedOwner(randomAddress())).rejects.toBeRevertedWith(
      'Only the owner can call this function',
    );
  });

  it('does not allow an empty next owner address', async () => {
    const [fundOwner] = fork.accounts;

    const { vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
    });

    await expect(vaultProxy.setNominatedOwner(constants.AddressZero)).rejects.toBeRevertedWith(
      '_nextNominatedOwner cannot be empty',
    );
  });

  it('does not allow the next owner to be the current owner', async () => {
    const [fundOwner] = fork.accounts;

    const { vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
    });

    await expect(vaultProxy.setNominatedOwner(fundOwner)).rejects.toBeRevertedWith(
      '_nextNominatedOwner is already the owner',
    );
  });

  it('does not allow the next owner to already be nominated', async () => {
    const [fundOwner] = fork.accounts;

    const { vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
    });

    // Nominate the nextOwner a first time
    const nextOwner = randomAddress();
    await vaultProxy.setNominatedOwner(nextOwner);

    // Attempt to nominate the same nextOwner a second time
    await expect(vaultProxy.setNominatedOwner(nextOwner)).rejects.toBeRevertedWith(
      '_nextNominatedOwner is already nominated',
    );
  });

  it('correctly handles nominating a new owner', async () => {
    const [fundOwner] = fork.accounts;

    const { vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
    });

    // Nominate the nextOwner a first time
    const nextOwnerAddress = randomAddress();
    const receipt = await vaultProxy.setNominatedOwner(nextOwnerAddress);

    // NominatedOwnerSet event properly emitted
    assertEvent(receipt, 'NominatedOwnerSet', {
      nominatedOwner: nextOwnerAddress,
    });

    // New owner should have been nominated
    const getNominatedOwnerCall = await vaultProxy.getNominatedOwner();
    expect(getNominatedOwnerCall).toMatchAddress(nextOwnerAddress);

    // Ownership should not have changed
    const getOwnerCall = await vaultProxy.getOwner();
    expect(getOwnerCall).toMatchAddress(fundOwner);
  });
});

describe('removeNominatedOwner', () => {
  it('can only be called by the contract owner', async () => {
    const [fundOwner, randomUser] = fork.accounts;

    const { vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
    });

    // Set nominated owner
    await vaultProxy.setNominatedOwner(randomAddress());

    // Attempt by a random user to remove nominated owner should fail
    await expect(vaultProxy.connect(randomUser).removeNominatedOwner()).rejects.toBeRevertedWith(
      'Only the owner can call this function',
    );
  });

  it('correctly handles removing the nomination', async () => {
    const [fundOwner] = fork.accounts;

    const { vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
    });

    // Set nominated owner
    const nextOwnerAddress = randomAddress();
    await vaultProxy.setNominatedOwner(nextOwnerAddress);

    // Attempt by a random user to remove nominated owner should fail
    const receipt = await vaultProxy.removeNominatedOwner();

    // NominatedOwnerRemoved event properly emitted
    assertEvent(receipt, 'NominatedOwnerRemoved', {
      nominatedOwner: nextOwnerAddress,
    });

    // Nomination should have been removed
    const getNominatedOwnerCall = await vaultProxy.getNominatedOwner();
    expect(getNominatedOwnerCall).toMatchAddress(constants.AddressZero);

    // Ownership should not have changed
    const getOwnerCall = await vaultProxy.getOwner();
    expect(getOwnerCall).toMatchAddress(fundOwner);
  });
});

describe('claimOwnership', () => {
  it('can only be called by the nominatedOwner', async () => {
    const [fundOwner, randomUser] = fork.accounts;

    const { vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
    });

    // Set nominated owner
    await vaultProxy.setNominatedOwner(randomAddress());

    // Attempt by a random user to claim ownership should fail
    await expect(vaultProxy.connect(randomUser).claimOwnership()).rejects.toBeRevertedWith(
      'Only the nominatedOwner can call this function',
    );
  });

  it('correctly handles transferring ownership', async () => {
    const [fundOwner, nominatedOwner] = fork.accounts;

    const { vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
    });

    // Set nominated owner
    await vaultProxy.setNominatedOwner(nominatedOwner);

    // Claim ownership
    const receipt = await vaultProxy.connect(nominatedOwner).claimOwnership();

    // OwnershipTransferred event properly emitted
    assertEvent(receipt, 'OwnershipTransferred', {
      prevOwner: fundOwner,
      nextOwner: nominatedOwner,
    });

    // Owner should now be the nominatedOwner
    const getOwnerCall = await vaultProxy.getOwner();
    expect(getOwnerCall).toMatchAddress(nominatedOwner);

    // nominatedOwner should be empty
    const getNominatedOwnerCall = await vaultProxy.getNominatedOwner();
    expect(getNominatedOwnerCall).toMatchAddress(constants.AddressZero);
  });
});

// TODO: callOnContract
