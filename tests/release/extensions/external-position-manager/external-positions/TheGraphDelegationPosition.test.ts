import type { SignerWithAddress } from '@enzymefinance/hardhat';
import type { ComptrollerLib, VaultLib } from '@enzymefinance/protocol';
import {
  ITestTheGraphEpochManager,
  ITestTheGraphStaking,
  ONE_HUNDRED_PERCENT_IN_BPS,
  StandardToken,
  TheGraphDelegationPositionLib,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import {
  assertEvent,
  assertNoEvent,
  createNewFund,
  createTheGraphDelegationPosition,
  deployProtocolFixture,
  impersonateContractSigner,
  theGraphDelegationPositionDelegate,
  theGraphDelegationPositionUndelegate,
  theGraphDelegationPositionWithdraw,
} from '@enzymefinance/testutils';
import { BigNumber, constants, utils } from 'ethers';

// Sources: https://thegraph.com/explorer and https://graphscan.io/#indexers
const indexers = ['0xe992d67d0632027166140128f28eea9b4ca00f12', '0xe6368e677871b288294536c8fe6cb1bbeb19f7a2'];

let grt: StandardToken;
let fundOwner: SignerWithAddress;
let delegationFeeBps: BigNumber;

let vaultProxy: VaultLib;
let comptrollerProxy: ComptrollerLib;
let theGraphDelegationPosition: TheGraphDelegationPositionLib;
let theGraphStakingContract: ITestTheGraphStaking;

let fork: ProtocolDeployment;
const grtUnit = utils.parseUnits('1', 18);

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
    denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
    fundDeployer: fork.deployment.fundDeployer,
    fundOwner,
    signer: fundOwner as SignerWithAddress,
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
  const delegationFee = await theGraphStakingContract.delegationTaxPercentage();

  // Converting from 6 decimals to 4 decimals (bps)
  delegationFeeBps = BigNumber.from(delegationFee).div(100);

  grt = new StandardToken(fork.config.theGraph.grt, whales.grt);
});

describe('delegate', () => {
  it('works as expected when called to delegate', async () => {
    const grtDelegationAmount = grtUnit.mul(1000);
    const grtDelegationFees = grtDelegationAmount.mul(delegationFeeBps).div(ONE_HUNDRED_PERCENT_IN_BPS);

    // Seed vault with GRT
    await grt.transfer(vaultProxy, grtDelegationAmount);

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

    const delegationGrtValue = await theGraphDelegationPosition.getDelegationGrtValue(indexers[0]);

    // Assert that the delegation to the indexer is worth the delegated amount
    expect(delegationGrtValue).toEqBigNumber(grtDelegationAmount.sub(grtDelegationFees));

    expect(delegateReceipt).toMatchInlineGasSnapshot(`283286`);
  });

  it('works as expected when delegating to two indexers', async () => {
    const grtDelegationAmount = grtUnit.mul(1000);

    // Seed vault with GRT
    await grt.transfer(vaultProxy, grtDelegationAmount.mul(2));

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
    const grtDelegationAmount = grtUnit.mul(1000);
    const grtDelegationFees = grtDelegationAmount.mul(delegationFeeBps).div(ONE_HUNDRED_PERCENT_IN_BPS);

    // Seed vault with GRT
    await grt.transfer(vaultProxy, grtDelegationAmount.mul(2));

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

    // Assert that the external position is now worth the GRT delegation amount, net of fees
    expect(getManagedAssetsCall.amounts_[0]).toEqBigNumber(grtDelegationAmount.sub(grtDelegationFees).mul(2));
    expect(getManagedAssetsCall.assets_).toEqual([grt.address]);

    assertEvent(delegateReceipt1, theGraphDelegationPosition.abi.getEvent('IndexerAdded'), { indexer: indexers[0] });
    assertNoEvent(delegateReceipt2, theGraphDelegationPosition.abi.getEvent('IndexerAdded'));
  });
});

describe('undelegate', () => {
  it('works as expected when called to undelegate', async () => {
    const grtDelegationAmount = grtUnit.mul(1000);
    const grtDelegationFees = grtDelegationAmount.mul(delegationFeeBps).div(ONE_HUNDRED_PERCENT_IN_BPS);

    // Seed vault with GRT
    await grt.transfer(vaultProxy, grtDelegationAmount);

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

    const getManagedAssetsCall = await theGraphDelegationPosition.getManagedAssets.call();

    // Assert that the external position is now worth the GRT delegation amount, net of fees
    expect(getManagedAssetsCall.amounts_[0]).toEqBigNumber(grtDelegationAmount.sub(grtDelegationFees));
    expect(getManagedAssetsCall.assets_).toEqual([grt.address]);

    const delegationGrtValue = await theGraphDelegationPosition.getDelegationGrtValue(indexers[0]);

    // Assert that the delegation to the indexer is still worth the delegated amount
    expect(delegationGrtValue).toEqBigNumber(grtDelegationAmount.sub(grtDelegationFees));

    const lockedGrtTokens = (await theGraphStakingContract.getDelegation(indexers[0], theGraphDelegationPosition))[1];

    // Assert that the GRT is locked
    expect(lockedGrtTokens).toEqBigNumber(1);

    expect(undelegateReceipt).toMatchInlineGasSnapshot(`269891`);
  });
});

describe('withdraw', () => {
  it('works as expected when called to partially withdraw', async () => {
    const grtDelegationAmount = grtUnit.mul(1000);
    const grtDelegationFees = grtDelegationAmount.mul(delegationFeeBps).div(ONE_HUNDRED_PERCENT_IN_BPS);

    // Seed vault with GRT
    await grt.transfer(vaultProxy, grtDelegationAmount);

    await theGraphDelegationPositionDelegate({
      comptrollerProxy,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: theGraphDelegationPosition,
      indexer: indexers[0],
      signer: fundOwner,
      tokens: grtDelegationAmount,
    });

    const delegationShares = (await theGraphStakingContract.getDelegation(indexers[0], theGraphDelegationPosition))[0];

    await theGraphDelegationPositionUndelegate({
      comptrollerProxy,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: theGraphDelegationPosition,
      indexer: indexers[0],
      shares: delegationShares.div(2),
      signer: fundOwner,
    });

    await fastForwardEpoch();

    const withdrawReceipt = await theGraphDelegationPositionWithdraw({
      comptrollerProxy,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: theGraphDelegationPosition,
      indexer: indexers[0],
      nextIndexer: constants.AddressZero,
      signer: fundOwner,
    });

    const getManagedAssetsCall = await theGraphDelegationPosition.getManagedAssets.call();

    // Assert that the external position is now worth the GRT delegation amount, net of fees
    expect(getManagedAssetsCall.amounts_[0]).toEqBigNumber(grtDelegationAmount.sub(grtDelegationFees).div(2));

    const vaultProxyGrtBalance = await grt.balanceOf(vaultProxy);

    // Assert that the vault proxy now holds the withdrawn GRT amount
    expect(vaultProxyGrtBalance).toEqBigNumber(grtDelegationAmount.sub(grtDelegationFees).div(2));

    // Assert that no IndexerRemoved event was emitted
    assertNoEvent(withdrawReceipt, theGraphDelegationPosition.abi.getEvent('IndexerRemoved'));

    expect(withdrawReceipt).toMatchInlineGasSnapshot(`195460`);
  });

  it('works as expected when called to fully withdraw', async () => {
    const grtDelegationAmount = grtUnit.mul(1000);
    const grtDelegationFees = grtDelegationAmount.mul(delegationFeeBps).div(ONE_HUNDRED_PERCENT_IN_BPS);

    // Seed vault with GRT
    await grt.transfer(vaultProxy, grtDelegationAmount);

    await theGraphDelegationPositionDelegate({
      comptrollerProxy,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: theGraphDelegationPosition,
      indexer: indexers[0],
      signer: fundOwner,
      tokens: grtDelegationAmount,
    });

    const delegationShares = (await theGraphStakingContract.getDelegation(indexers[0], theGraphDelegationPosition))[0];

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
      nextIndexer: constants.AddressZero,
      signer: fundOwner,
    });

    const getManagedAssetsCall = await theGraphDelegationPosition.getManagedAssets.call();

    // Assert that the external position is now worth 0
    expect(getManagedAssetsCall.amounts_.length).toEqual(0);

    const vaultProxyGrtBalance = await grt.balanceOf(vaultProxy);

    // Assert that the vault proxy now holds the withdrawn grt amount
    expect(vaultProxyGrtBalance).toEqBigNumber(grtDelegationAmount.sub(grtDelegationFees));

    // Assert the IndexerRemoved event was emitted
    assertEvent(withdrawReceipt, theGraphDelegationPosition.abi.getEvent('IndexerRemoved'), {
      indexer: indexers[0],
    });

    expect(withdrawReceipt).toMatchInlineGasSnapshot(`197749`);
  });

  it('works as expected when called to partially redelegate', async () => {
    const grtDelegationAmount = grtUnit.mul(1000);
    const grtDelegationFees = grtDelegationAmount.mul(delegationFeeBps).div(ONE_HUNDRED_PERCENT_IN_BPS);

    // Seed vault with GRT
    await grt.transfer(vaultProxy, grtDelegationAmount);

    await theGraphDelegationPositionDelegate({
      comptrollerProxy,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: theGraphDelegationPosition,
      indexer: indexers[0],
      signer: fundOwner,
      tokens: grtDelegationAmount,
    });

    const delegationShares = (await theGraphStakingContract.getDelegation(indexers[0], theGraphDelegationPosition))[0];

    await theGraphDelegationPositionUndelegate({
      comptrollerProxy,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: theGraphDelegationPosition,
      indexer: indexers[0],
      shares: delegationShares.div(2),
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

    const getManagedAssetsCall = await theGraphDelegationPosition.getManagedAssets.call();

    const redelegationAmount = grtDelegationAmount.sub(grtDelegationFees).div(2);
    const redelegationFees = redelegationAmount.mul(delegationFeeBps).div(ONE_HUNDRED_PERCENT_IN_BPS);

    // Assert that the external position is still worth the GRT delegation amount, minus the delegation and redelegation fees
    expect(getManagedAssetsCall.amounts_[0]).toEqBigNumber(
      grtDelegationAmount.sub(grtDelegationFees).sub(redelegationFees),
    );

    const redelegationGrtValue = await theGraphDelegationPosition.getDelegationGrtValue(indexers[1]);

    // Assert that the redelegation is properly delegated to the second indexer
    expect(redelegationGrtValue).toEqBigNumber(redelegationAmount.sub(redelegationFees));

    const vaultProxyGrtBalance = await grt.balanceOf(vaultProxy);

    // Assert that the vault proxy does not hold any grt
    expect(vaultProxyGrtBalance).toEqBigNumber(0);

    // Assert the IndexerRemoved event was not emitted
    assertNoEvent(withdrawReceipt, theGraphDelegationPosition.abi.getEvent('IndexerRemoved'));

    // Assert the IndexerAdded event was emitted
    assertEvent(withdrawReceipt, theGraphDelegationPosition.abi.getEvent('IndexerAdded'), {
      indexer: indexers[1],
    });

    expect(withdrawReceipt).toMatchInlineGasSnapshot(`241980`);
  });

  it('works as expected when called to fully redelegate', async () => {
    const grtDelegationAmount = grtUnit.mul(1000);
    const grtDelegationFees = grtDelegationAmount.mul(delegationFeeBps).div(ONE_HUNDRED_PERCENT_IN_BPS);

    // Seed vault with GRT
    await grt.transfer(vaultProxy, grtDelegationAmount);

    await theGraphDelegationPositionDelegate({
      comptrollerProxy,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: theGraphDelegationPosition,
      indexer: indexers[0],
      signer: fundOwner,
      tokens: grtDelegationAmount,
    });

    const delegationShares = (await theGraphStakingContract.getDelegation(indexers[0], theGraphDelegationPosition))[0];

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
    const redelegationFees = redelegationAmount.mul(delegationFeeBps).div(ONE_HUNDRED_PERCENT_IN_BPS);

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

    expect(withdrawReceipt).toMatchInlineGasSnapshot(`221970`);
  });
});
