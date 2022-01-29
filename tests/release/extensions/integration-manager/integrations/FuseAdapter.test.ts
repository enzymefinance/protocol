import { ICERC20, StandardToken } from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import {
  assertCompoundLend,
  assertCompoundRedeem,
  compoundClaim,
  createNewFund,
  deployProtocolFixture,
} from '@enzymefinance/testutils';
import { utils } from 'ethers';

let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('lend', () => {
  it('works as expected when called for lending by a fund', async () => {
    const [fundOwner] = fork.accounts;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    const lendReceipt = await assertCompoundLend({
      cToken: new ICERC20(fork.config.fuse.ftokens.fdai7, provider),
      compoundAdapter: fork.deployment.fuseAdapter,
      compoundPriceFeed: fork.deployment.fusePriceFeed,
      comptrollerProxy,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      tokenAmount: utils.parseEther('1'),
      tokenWhale: whales.dai,
      vaultProxy,
    });

    expect(lendReceipt).toCostAround('393945');
  });

  it('works as expected when called for lending by a fund (ETH)', async () => {
    const [fundOwner] = fork.accounts;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    const lendReceipt = await assertCompoundLend({
      cToken: new ICERC20(fork.config.fuse.fetherTokens.feth7, provider),
      compoundAdapter: fork.deployment.fuseAdapter,
      compoundPriceFeed: fork.deployment.fusePriceFeed,
      comptrollerProxy,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      tokenAmount: utils.parseEther('1'),
      tokenWhale: whales.weth,
      vaultProxy,
    });

    expect(lendReceipt).toCostAround('364177');
  });
});

describe('redeem', () => {
  it('works as expected when called for redeeming by a fund', async () => {
    const [fundOwner] = fork.accounts;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    const redeemReceipt = await assertCompoundRedeem({
      cToken: new ICERC20(fork.config.fuse.ftokens.fdai7, whales.fdai7),
      compoundAdapter: fork.deployment.fuseAdapter,
      compoundPriceFeed: fork.deployment.fusePriceFeed,
      comptrollerProxy,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      vaultProxy,
    });

    expect(redeemReceipt).toCostAround('332667');
  });

  it('works as expected when called for redeeming by a fund (ETH)', async () => {
    const [fundOwner] = fork.accounts;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    const redeemReceipt = await assertCompoundRedeem({
      cToken: new ICERC20(fork.config.fuse.fetherTokens.feth7, whales.feth7),
      compoundAdapter: fork.deployment.fuseAdapter,
      compoundPriceFeed: fork.deployment.fusePriceFeed,
      comptrollerProxy,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      vaultProxy,
    });

    expect(redeemReceipt).toCostAround('279729');
  });
});

describe('claimComp', () => {
  it('should accrue rewards on the fund after lending, adapter', async () => {
    const [fundOwner] = fork.accounts;
    const tribe = new StandardToken('0xc7283b66eb1eb5fb86327f08e1b5816b0720212b', provider);
    const fTribe8 = new StandardToken(fork.config.fuse.ftokens.ftribe8, whales.ftribe8);
    const fuseComptroller8Address = '0xc54172e34046c1653d1920d40333Dd358c7a1aF4';

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Transfer fTribe to vault to start accruing rewards
    await fTribe8.transfer(vaultProxy.address, utils.parseUnits('10000', 8));
    expect(await fTribe8.balanceOf(vaultProxy)).toBeGtBigNumber(0);

    await provider.send('evm_increaseTime', [60 * 60 * 24]);
    await provider.send('evm_mine', []);

    await compoundClaim({
      cTokens: [fTribe8],
      compoundAdapter: fork.deployment.fuseAdapter,
      compoundComptroller: fuseComptroller8Address,
      comptrollerProxy,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
    });

    const compVaultBalance = await tribe.balanceOf(vaultProxy);
    const compAdapterBalance = await tribe.balanceOf(fork.deployment.fuseAdapter);

    expect(compVaultBalance).toBeGtBigNumber(0);
    expect(compAdapterBalance).toEqBigNumber(0);
  });
});
