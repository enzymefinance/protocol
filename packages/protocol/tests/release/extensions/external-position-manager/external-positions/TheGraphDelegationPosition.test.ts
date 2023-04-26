import type { ComptrollerLib, VaultLib } from '@enzymefinance/protocol';
import {
  ITestStandardToken,
  ITestTheGraphEpochManager,
  ITestTheGraphStaking,
  ONE_HUNDRED_PERCENT_IN_BPS,
  TheGraphDelegationPositionLib,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment, SignerWithAddress } from '@enzymefinance/testutils';
import {
  assertEvent,
  assertExternalPositionAssetsToReceive,
  assertNoEvent,
  createNewFund,
  createTheGraphDelegationPosition,
  deployProtocolFixture,
  getAssetUnit,
  impersonateContractSigner,
  setAccountBalance,
  theGraphDelegationPositionDelegate,
  theGraphDelegationPositionUndelegate,
  theGraphDelegationPositionWithdraw,
} from '@enzymefinance/testutils';
import type { BigNumber } from 'ethers';
import { constants } from 'ethers';

// Sources: https://thegraph.com/explorer and https://graphscan.io/#indexers
const indexers = ['0x5a8904be09625965d9aec4bffd30d853438a053e', '0xb06071394531b63b0bac78f27e12dc2beaa913e4'];

let grt: ITestStandardToken;
let fundOwner: SignerWithAddress;
let delegationFee: BigNumber;

let vaultProxy: VaultLib;
let comptrollerProxy: ComptrollerLib;
let theGraphDelegationPosition: TheGraphDelegationPositionLib;
let theGraphStakingContract: ITestTheGraphStaking;

let fork: ProtocolDeployment;
let grtUnit: BigNumber, grtDelegationAmount: BigNumber, grtDelegationFees: BigNumber;

async function fastForwardEpoch() {
  // Impersonate epoch manager governor
  const governorSigner = await impersonateContractSigner({
    contractAddress: '0x48301fe520f72994d32ead72e2b6a8447873cf50',
    ethSeeder: fork.deployer,
    provider,
  });
  const epochManagerProxy = '0x64f990bf16552a693dcb043bb7bf3866c5e05ddb';
  const epochManager = new ITestTheGraphEpochManager(epochManagerProxy, governorSigner);

  // Reduce epoch length to minimum
  await epochManager.setEpochLength(1);
  // Mine a block to go beyond epoch
  await provider.send('evm_mine', []);
}

beforeEach(async () => {
  fork = await deployProtocolFixture();
  [fundOwner] = fork.accounts;

  // Initialize fund and external position
  const fund = await createNewFund({
    denominationAsset: new ITestStandardToken(fork.config.primitives.usdc, provider),
    fundDeployer: fork.deployment.fundDeployer,
    fundOwner,
    signer: fundOwner,
  });

  vaultProxy = fund.vaultProxy;
  comptrollerProxy = fund.comptrollerProxy;

  const { externalPositionProxy } = await createTheGraphDelegationPosition({
    comptrollerProxy,
    externalPositionManager: fork.deployment.externalPositionManager,
    signer: fundOwner,
  });

  theGraphDelegationPosition = new TheGraphDelegationPositionLib(externalPositionProxy, provider);
  theGraphStakingContract = new ITestTheGraphStaking(fork.config.theGraph.stakingProxy, provider);
  // Fee is given in hundreds of bps (so 1% = 10000)
  delegationFee = await theGraphStakingContract.delegationTaxPercentage();

  grt = new ITestStandardToken(fork.config.theGraph.grt, provider);
  grtUnit = await getAssetUnit(grt);
  grtDelegationAmount = grtUnit.mul(1000);
  // Adding 1 wei as there seems to be some rounding issue that causes fees to be 1 wei more than what's expected
  grtDelegationFees = grtDelegationAmount
    .mul(delegationFee)
    .div(ONE_HUNDRED_PERCENT_IN_BPS * 100)
    .add(1);

  await setAccountBalance({ provider, account: vaultProxy.address, amount: grtUnit.mul(100_000_000), token: grt });
});

describe('delegate', () => {
  it('works as expected when called to delegate', async () => {
    const delegateReceipt = await theGraphDelegationPositionDelegate({
      comptrollerProxy,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: theGraphDelegationPosition,
      indexer: indexers[0],
      signer: fundOwner,
      tokens: grtDelegationAmount,
    });

    const getManagedAssetsCall = await theGraphDelegationPosition.getManagedAssets.call();

    // Assert that the external position is now worth the GRT delegation amount, net of fees
    expect(getManagedAssetsCall.amounts_[0]).toEqBigNumber(grtDelegationAmount.sub(grtDelegationFees));
    expect(getManagedAssetsCall.assets_).toEqual([grt.address]);

    // Assert the event was emitted
    assertEvent(delegateReceipt, theGraphDelegationPosition.abi.getEvent('IndexerAdded'), {
      indexer: indexers[0],
    });

    assertExternalPositionAssetsToReceive({ receipt: delegateReceipt, assets: [] });

    const delegationGrtValue = await theGraphDelegationPosition.getDelegationGrtValue(indexers[0]);

    // Assert that the delegation to the indexer is worth the delegated amount
    expect(delegationGrtValue).toEqBigNumber(grtDelegationAmount.sub(grtDelegationFees));

    expect(delegateReceipt).toMatchInlineGasSnapshot(`254117`);
  });

  it('works as expected when delegating to two indexers', async () => {
    const delegateReceipt1 = await theGraphDelegationPositionDelegate({
      comptrollerProxy,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: theGraphDelegationPosition,
      indexer: indexers[0],
      signer: fundOwner,
      tokens: grtDelegationAmount,
    });

    const delegateReceipt2 = await theGraphDelegationPositionDelegate({
      comptrollerProxy,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: theGraphDelegationPosition,
      indexer: indexers[1],
      signer: fundOwner,
      tokens: grtDelegationAmount,
    });

    // Assert that the two indexers have been added
    assertEvent(delegateReceipt1, theGraphDelegationPosition.abi.getEvent('IndexerAdded'), { indexer: indexers[0] });
    assertEvent(delegateReceipt2, theGraphDelegationPosition.abi.getEvent('IndexerAdded'), { indexer: indexers[1] });
  });

  it('works as expected when delegating twice to the same indexer', async () => {
    const delegateReceipt1 = await theGraphDelegationPositionDelegate({
      comptrollerProxy,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: theGraphDelegationPosition,
      indexer: indexers[0],
      signer: fundOwner,
      tokens: grtDelegationAmount,
    });

    const delegateReceipt2 = await theGraphDelegationPositionDelegate({
      comptrollerProxy,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: theGraphDelegationPosition,
      indexer: indexers[0],
      signer: fundOwner,
      tokens: grtDelegationAmount,
    });

    const getManagedAssetsCall = await theGraphDelegationPosition.getManagedAssets.call();

    // Assert that the external position is now worth the GRT delegation amount, net of fees. Adding 1 wei for rounding error.
    expect(getManagedAssetsCall.amounts_[0]).toEqBigNumber(grtDelegationAmount.sub(grtDelegationFees).mul(2).add(1));
    expect(getManagedAssetsCall.assets_).toEqual([grt.address]);

    assertEvent(delegateReceipt1, theGraphDelegationPosition.abi.getEvent('IndexerAdded'), { indexer: indexers[0] });
    assertNoEvent(delegateReceipt2, theGraphDelegationPosition.abi.getEvent('IndexerAdded'));
  });
});

describe('undelegate', () => {
  it('works as expected when called to undelegate', async () => {
    await theGraphDelegationPositionDelegate({
      comptrollerProxy,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: theGraphDelegationPosition,
      indexer: indexers[0],
      signer: fundOwner,
      tokens: grtDelegationAmount,
    });

    const undelegateReceipt = await theGraphDelegationPositionUndelegate({
      comptrollerProxy,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: theGraphDelegationPosition,
      indexer: indexers[0],
      shares: 1,
      signer: fundOwner,
    });

    assertExternalPositionAssetsToReceive({ receipt: undelegateReceipt, assets: [grt] });

    const getManagedAssetsCall = await theGraphDelegationPosition.getManagedAssets.call();

    // Assert that the external position is now worth the GRT delegation amount, net of fees
    expect(getManagedAssetsCall.amounts_[0]).toEqBigNumber(grtDelegationAmount.sub(grtDelegationFees));
    expect(getManagedAssetsCall.assets_).toEqual([grt.address]);

    const delegationGrtValue = await theGraphDelegationPosition.getDelegationGrtValue(indexers[0]);

    // Assert that the delegation to the indexer is still worth the delegated amount
    expect(delegationGrtValue).toEqBigNumber(grtDelegationAmount.sub(grtDelegationFees));

    const lockedGrtTokens = (await theGraphStakingContract.getDelegation(indexers[0], theGraphDelegationPosition))
      .tokensLocked_;

    // Assert that the GRT is locked
    expect(lockedGrtTokens).toEqBigNumber(1);

    expect(undelegateReceipt).toMatchInlineGasSnapshot(`269891`);
  });
});

describe('withdraw', () => {
  it('works as expected when called to partially withdraw', async () => {
    await theGraphDelegationPositionDelegate({
      comptrollerProxy,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: theGraphDelegationPosition,
      indexer: indexers[0],
      signer: fundOwner,
      tokens: grtDelegationAmount,
    });

    const delegationShares = (await theGraphStakingContract.getDelegation(indexers[0], theGraphDelegationPosition))
      .shares_;

    await theGraphDelegationPositionUndelegate({
      comptrollerProxy,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: theGraphDelegationPosition,
      indexer: indexers[0],
      shares: delegationShares.div(2),
      signer: fundOwner,
    });

    await fastForwardEpoch();

    const vaultProxyGrtBalanceBefore = await grt.balanceOf(vaultProxy);

    const withdrawReceipt = await theGraphDelegationPositionWithdraw({
      comptrollerProxy,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: theGraphDelegationPosition,
      indexer: indexers[0],
      nextIndexer: constants.AddressZero,
      signer: fundOwner,
    });

    assertExternalPositionAssetsToReceive({ receipt: withdrawReceipt, assets: [grt] });

    const getManagedAssetsCall = await theGraphDelegationPosition.getManagedAssets.call();

    // Assert that the external position is now worth the GRT delegation amount, net of fees
    expect(getManagedAssetsCall.amounts_[0]).toEqBigNumber(grtDelegationAmount.sub(grtDelegationFees).div(2));

    const vaultProxyGrtBalanceAfter = await grt.balanceOf(vaultProxy);

    // Assert that the vault proxy GRt balance has increased
    expect(vaultProxyGrtBalanceAfter).toBeGtBigNumber(vaultProxyGrtBalanceBefore);

    // Assert that no IndexerRemoved event was emitted
    assertNoEvent(withdrawReceipt, theGraphDelegationPosition.abi.getEvent('IndexerRemoved'));

    expect(withdrawReceipt).toMatchInlineGasSnapshot(`178360`);
  });

  it('works as expected when called to fully withdraw', async () => {
    const grtDelegationAmount = grtUnit.mul(1000);

    await theGraphDelegationPositionDelegate({
      comptrollerProxy,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: theGraphDelegationPosition,
      indexer: indexers[0],
      signer: fundOwner,
      tokens: grtDelegationAmount,
    });

    const delegationShares = (await theGraphStakingContract.getDelegation(indexers[0], theGraphDelegationPosition))
      .shares_;

    await theGraphDelegationPositionUndelegate({
      comptrollerProxy,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: theGraphDelegationPosition,
      indexer: indexers[0],
      shares: delegationShares,
      signer: fundOwner,
    });

    await fastForwardEpoch();

    const vaultProxyGrtBalanceBefore = await grt.balanceOf(vaultProxy);

    const withdrawReceipt = await theGraphDelegationPositionWithdraw({
      comptrollerProxy,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: theGraphDelegationPosition,
      indexer: indexers[0],
      nextIndexer: constants.AddressZero,
      signer: fundOwner,
    });

    const getManagedAssetsCall = await theGraphDelegationPosition.getManagedAssets.call();

    // Assert that the external position is now worth 0
    expect(getManagedAssetsCall.amounts_.length).toEqual(0);

    const vaultProxyGrtBalanceAfter = await grt.balanceOf(vaultProxy);

    // Assert that the vault proxy GRT balance has increased
    expect(vaultProxyGrtBalanceAfter).toBeGtBigNumber(vaultProxyGrtBalanceBefore);

    // Assert the IndexerRemoved event was emitted
    assertEvent(withdrawReceipt, theGraphDelegationPosition.abi.getEvent('IndexerRemoved'), {
      indexer: indexers[0],
    });

    expect(withdrawReceipt).toMatchInlineGasSnapshot(`180649`);
  });

  it('works as expected when called to partially redelegate', async () => {
    await theGraphDelegationPositionDelegate({
      comptrollerProxy,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: theGraphDelegationPosition,
      indexer: indexers[0],
      signer: fundOwner,
      tokens: grtDelegationAmount,
    });

    const delegationShares = (await theGraphStakingContract.getDelegation(indexers[0], theGraphDelegationPosition))
      .shares_;

    await theGraphDelegationPositionUndelegate({
      comptrollerProxy,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: theGraphDelegationPosition,
      indexer: indexers[0],
      shares: delegationShares.div(2),
      signer: fundOwner,
    });

    await fastForwardEpoch();

    const vaultProxyGrtBalanceBefore = await grt.balanceOf(vaultProxy);

    const withdrawReceipt = await theGraphDelegationPositionWithdraw({
      comptrollerProxy,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: theGraphDelegationPosition,
      indexer: indexers[0],
      nextIndexer: indexers[1],
      signer: fundOwner,
    });

    const getManagedAssetsCall = await theGraphDelegationPosition.getManagedAssets.call();

    const redelegationAmount = grtDelegationAmount.sub(grtDelegationFees).div(2);
    const redelegationFees = redelegationAmount
      .mul(delegationFee)
      .div(ONE_HUNDRED_PERCENT_IN_BPS * 100)
      .add(1);

    // Assert that the external position is still worth the GRT delegation amount, minus the delegation and redelegation fees
    expect(getManagedAssetsCall.amounts_[0]).toBeAroundBigNumber(
      grtDelegationAmount.sub(grtDelegationFees).sub(redelegationFees),
      1,
    );

    const redelegationGrtValue = await theGraphDelegationPosition.getDelegationGrtValue(indexers[1]);

    // Assert that the redelegation is properly delegated to the second indexer
    expect(redelegationGrtValue).toEqBigNumber(redelegationAmount.sub(redelegationFees));

    const vaultProxyGrtBalanceAfter = await grt.balanceOf(vaultProxy);

    // Assert that the vault proxy GRT balance has not changed
    expect(vaultProxyGrtBalanceBefore).toEqBigNumber(vaultProxyGrtBalanceAfter);

    // Assert the IndexerRemoved event was not emitted
    assertNoEvent(withdrawReceipt, theGraphDelegationPosition.abi.getEvent('IndexerRemoved'));

    // Assert the IndexerAdded event was emitted
    assertEvent(withdrawReceipt, theGraphDelegationPosition.abi.getEvent('IndexerAdded'), {
      indexer: indexers[1],
    });

    expect(withdrawReceipt).toMatchInlineGasSnapshot(`241746`);
  });

  it('works as expected when called to fully redelegate', async () => {
    await theGraphDelegationPositionDelegate({
      comptrollerProxy,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: theGraphDelegationPosition,
      indexer: indexers[0],
      signer: fundOwner,
      tokens: grtDelegationAmount,
    });

    const delegationShares = (await theGraphStakingContract.getDelegation(indexers[0], theGraphDelegationPosition))
      .shares_;

    await theGraphDelegationPositionUndelegate({
      comptrollerProxy,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: theGraphDelegationPosition,
      indexer: indexers[0],
      shares: delegationShares,
      signer: fundOwner,
    });

    await fastForwardEpoch();

    const withdrawReceipt = await theGraphDelegationPositionWithdraw({
      comptrollerProxy,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: theGraphDelegationPosition,
      indexer: indexers[0],
      nextIndexer: indexers[1],
      signer: fundOwner,
    });

    const redelegationAmount = grtDelegationAmount.sub(grtDelegationFees);
    const redelegationFees = redelegationAmount
      .mul(delegationFee)
      .div(ONE_HUNDRED_PERCENT_IN_BPS * 100)
      .add(1);

    // Assert that the redelegation amount is delegated to the second indexer
    const redelegationGrtValue = await theGraphDelegationPosition.getDelegationGrtValue(indexers[1]);

    // Assert that the redelegation is properly delegated to the second indexer
    expect(redelegationGrtValue).toEqBigNumber(redelegationAmount.sub(redelegationFees));

    // Assert the IndexerRemoved event was emitted
    assertEvent(withdrawReceipt, theGraphDelegationPosition.abi.getEvent('IndexerRemoved'), {
      indexer: indexers[0],
    });

    // Assert the IndexerAdded event was emitted
    assertEvent(withdrawReceipt, theGraphDelegationPosition.abi.getEvent('IndexerAdded'), {
      indexer: indexers[1],
    });

    expect(withdrawReceipt).toMatchInlineGasSnapshot(`221753`);
  });
});
