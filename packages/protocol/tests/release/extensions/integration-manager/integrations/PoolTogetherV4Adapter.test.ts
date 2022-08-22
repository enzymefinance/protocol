import { randomAddress } from '@enzymefinance/ethers';
import {
  claimRewardsSelector,
  ITestStandardToken,
  lendSelector,
  PoolTogetherV4Adapter,
  poolTogetherV4ClaimRewardsArgs,
  poolTogetherV4LendArgs,
  poolTogetherV4RedeemArgs,
  redeemSelector,
  SpendAssetsHandleType,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import {
  createNewFund,
  deployProtocolFixture,
  getAssetBalances,
  poolTogetherV4Lend,
  poolTogetherV4Redeem,
  setAccountBalance,
} from '@enzymefinance/testutils';
import { utils } from 'ethers';

let fork: ProtocolDeployment;

beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('constructor', () => {
  it('sets state vars', async () => {
    const poolTogetherV4Adapter = fork.deployment.poolTogetherV4Adapter;

    expect(await poolTogetherV4Adapter.getPoolTogetherV4PriceFeed()).toMatchAddress(
      fork.deployment.poolTogetherV4PriceFeed,
    );

    expect(await poolTogetherV4Adapter.getIntegrationManager()).toMatchAddress(fork.deployment.integrationManager);
  });
});

describe('parseAssetsForAction', () => {
  it('does not allow a bad selector', async () => {
    const poolTogetherV4Adapter = new PoolTogetherV4Adapter(fork.deployment.poolTogetherV4Adapter, provider);
    const outgoingToken = new ITestStandardToken(fork.config.primitives.usdc, provider);
    const amount = utils.parseUnits('1', await outgoingToken.decimals());
    const ptToken = new ITestStandardToken(fork.config.poolTogetherV4.ptTokens.ptUsdc[0], provider);

    const args = poolTogetherV4LendArgs({
      amount,
      ptToken,
    });

    await expect(
      poolTogetherV4Adapter.parseAssetsForAction(randomAddress(), utils.randomBytes(4), args),
    ).rejects.toBeRevertedWith('_selector invalid');

    await expect(poolTogetherV4Adapter.parseAssetsForAction(randomAddress(), lendSelector, args)).resolves.toBeTruthy();
  });

  it('generates expected output for lending', async () => {
    const poolTogetherV4Adapter = new PoolTogetherV4Adapter(fork.deployment.poolTogetherV4Adapter, provider);
    const outgoingToken = new ITestStandardToken(fork.config.primitives.usdc, provider);
    const amount = utils.parseUnits('1', await outgoingToken.decimals());
    const ptToken = new ITestStandardToken(fork.config.poolTogetherV4.ptTokens.ptUsdc[0], provider);

    const args = poolTogetherV4LendArgs({
      amount,
      ptToken,
    });

    const result = await poolTogetherV4Adapter.parseAssetsForAction(randomAddress(), lendSelector, args);

    expect(result).toMatchFunctionOutput(poolTogetherV4Adapter.parseAssetsForAction, {
      incomingAssets_: [ptToken],
      minIncomingAssetAmounts_: [amount],
      spendAssetAmounts_: [amount],
      spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
      spendAssets_: [outgoingToken],
    });
  });

  it('generates expected output for redeeming', async () => {
    const poolTogetherV4Adapter = new PoolTogetherV4Adapter(fork.deployment.poolTogetherV4Adapter, provider);
    const ptToken = new ITestStandardToken(fork.config.poolTogetherV4.ptTokens.ptUsdc[0], provider);
    const amount = utils.parseUnits('1', await ptToken.decimals());
    const token = new ITestStandardToken(fork.config.primitives.usdc, provider);

    const args = poolTogetherV4RedeemArgs({
      amount,
      ptToken,
    });

    const result = await poolTogetherV4Adapter.parseAssetsForAction(randomAddress(), redeemSelector, args);

    expect(result).toMatchFunctionOutput(poolTogetherV4Adapter.parseAssetsForAction, {
      incomingAssets_: [token],
      minIncomingAssetAmounts_: [amount],
      spendAssetAmounts_: [amount],
      spendAssetsHandleType_: SpendAssetsHandleType.Approve,
      spendAssets_: [ptToken],
    });
  });

  it('generates expected output for claiming rewards', async () => {
    const poolTogetherV4Adapter = new PoolTogetherV4Adapter(fork.deployment.poolTogetherV4Adapter, provider);
    const prizeDistributor = randomAddress();
    const drawIds = [0];
    const winningPicks = '0x';

    const args = poolTogetherV4ClaimRewardsArgs({
      drawIds,
      prizeDistributor,
      winningPicks,
    });

    const result = await poolTogetherV4Adapter.parseAssetsForAction(randomAddress(), claimRewardsSelector, args);

    expect(result).toMatchFunctionOutput(poolTogetherV4Adapter.parseAssetsForAction, {
      incomingAssets_: [],
      minIncomingAssetAmounts_: [],
      spendAssetAmounts_: [],
      spendAssetsHandleType_: SpendAssetsHandleType.None,
      spendAssets_: [],
    });
  });
});

describe('lend', () => {
  it('works as expected when called for lending by a fund', async () => {
    const [fundOwner] = fork.accounts;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new ITestStandardToken(fork.config.primitives.usdc, fundOwner),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    const token = new ITestStandardToken(fork.config.primitives.usdc, provider);
    const amount = utils.parseUnits('1', await token.decimals());
    const ptToken = new ITestStandardToken(fork.config.poolTogetherV4.ptTokens.ptUsdc[0], provider);

    await setAccountBalance({ provider, account: vaultProxy, amount, token });

    const [preTxIncomingAssetBalance, preTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [ptToken, token],
    });

    const lendReceipt = await poolTogetherV4Lend({
      amount,
      comptrollerProxy,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      poolTogetherV4Adapter: fork.deployment.poolTogetherV4Adapter,
      ptToken,
    });

    const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [ptToken, token],
    });

    expect(postTxIncomingAssetBalance).toEqBigNumber(preTxIncomingAssetBalance.add(amount));
    expect(postTxOutgoingAssetBalance).toEqBigNumber(preTxOutgoingAssetBalance.sub(amount));

    expect(lendReceipt).toMatchInlineGasSnapshot(`584536`);
  });
});

describe('redeem', () => {
  it('works as expected when called for redeeming by a fund', async () => {
    const [fundOwner] = fork.accounts;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new ITestStandardToken(fork.config.primitives.usdc, fundOwner),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    const ptToken = new ITestStandardToken(fork.config.poolTogetherV4.ptTokens.ptUsdc[0], provider);
    const amount = utils.parseUnits('1', await ptToken.decimals());
    const token = new ITestStandardToken(fork.config.primitives.usdc, provider);

    await setAccountBalance({ provider, account: vaultProxy, amount, token: ptToken });

    const [preTxIncomingAssetBalance, preTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [token, ptToken],
    });

    const redeemReceipt = await poolTogetherV4Redeem({
      amount,
      comptrollerProxy,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      poolTogetherV4Adapter: fork.deployment.poolTogetherV4Adapter,
      ptToken,
    });

    const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [token, ptToken],
    });

    expect(postTxIncomingAssetBalance).toEqBigNumber(preTxIncomingAssetBalance.add(amount));
    expect(postTxOutgoingAssetBalance).toEqBigNumber(preTxOutgoingAssetBalance.sub(amount));

    expect(redeemReceipt).toMatchInlineGasSnapshot(`469004`);
  });
});

describe('claimRewards', () => {
  // Properly testing this function requires delegating winning odds from the whale to the vault
  // Then triggering a new draw from PoolTogether, and computing winning picks for the vault
  // This is not trivial and also not critical since anyone can claim on behalf of the vault
  // So leaving it as a todo for now
  it.todo('works as expected when called for claiming rewards by a fund');
});
