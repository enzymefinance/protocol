import { ICERC20, ONE_DAY_IN_SECONDS, StandardToken } from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import {
  assertCompoundLend,
  assertCompoundRedeem,
  compoundClaim,
  createNewFund,
  deployProtocolFixture,
  getAssetUnit,
  seedAccount,
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
      provider,
      tokenAmount: utils.parseEther('1'),
      vaultProxy,
    });

    expect(lendReceipt).toMatchInlineGasSnapshot(`436876`);
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
      provider,
      tokenAmount: utils.parseEther('1'),
      vaultProxy,
    });

    expect(lendReceipt).toMatchInlineGasSnapshot(`370765`);
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
      cToken: new ICERC20(fork.config.fuse.ftokens.fdai7, provider),
      compoundAdapter: fork.deployment.fuseAdapter,
      compoundPriceFeed: fork.deployment.fusePriceFeed,
      comptrollerProxy,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      provider,
      vaultProxy,
    });

    expect(redeemReceipt).toMatchInlineGasSnapshot(`377482`);
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
      cToken: new ICERC20(fork.config.fuse.fetherTokens.feth7, provider),
      compoundAdapter: fork.deployment.fuseAdapter,
      compoundPriceFeed: fork.deployment.fusePriceFeed,
      comptrollerProxy,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      provider,
      vaultProxy,
    });

    expect(redeemReceipt).toMatchInlineGasSnapshot(`288415`);
  });
});

describe('claimComp', () => {
  it('should accrue rewards on the fund after lending, adapter', async () => {
    const [fundOwner] = fork.accounts;
    const tribe = new StandardToken('0xc7283b66eb1eb5fb86327f08e1b5816b0720212b', provider);
    const fTribe8 = new StandardToken(fork.config.fuse.ftokens.ftribe8, provider);
    const fuseComptroller8Address = '0xc54172e34046c1653d1920d40333Dd358c7a1aF4';

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Seed vault with fTribe to start accruing rewards
    await seedAccount({ provider, account: vaultProxy, amount: await getAssetUnit(fTribe8), token: fTribe8 });

    await provider.send('evm_increaseTime', [ONE_DAY_IN_SECONDS]);
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
