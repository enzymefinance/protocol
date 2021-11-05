import { randomAddress } from '@enzymefinance/ethers';
import {
  claimRewardsSelector,
  lendSelector,
  PoolTogetherV4Adapter,
  poolTogetherV4ClaimRewardsArgs,
  poolTogetherV4LendArgs,
  poolTogetherV4RedeemArgs,
  redeemSelector,
  SpendAssetsHandleType,
  StandardToken,
} from '@enzymefinance/protocol';
import {
  createNewFund,
  deployProtocolFixture,
  getAssetBalances,
  poolTogetherV4Lend,
  poolTogetherV4Redeem,
  ProtocolDeployment,
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
    const outgoingToken = new StandardToken(fork.config.primitives.usdc, provider);
    const amount = utils.parseUnits('1', await outgoingToken.decimals());
    const ptToken = new StandardToken(fork.config.poolTogetherV4.ptTokens.ptUsdc[0], provider);

    const args = poolTogetherV4LendArgs({
      ptToken,
      amount,
    });

    await expect(
      poolTogetherV4Adapter.parseAssetsForAction(randomAddress(), utils.randomBytes(4), args),
    ).rejects.toBeRevertedWith('_selector invalid');

    await expect(poolTogetherV4Adapter.parseAssetsForAction(randomAddress(), lendSelector, args)).resolves.toBeTruthy();
  });

  it('generates expected output for lending', async () => {
    const poolTogetherV4Adapter = new PoolTogetherV4Adapter(fork.deployment.poolTogetherV4Adapter, provider);
    const outgoingToken = new StandardToken(fork.config.primitives.usdc, provider);
    const amount = utils.parseUnits('1', await outgoingToken.decimals());
    const ptToken = new StandardToken(fork.config.poolTogetherV4.ptTokens.ptUsdc[0], provider);

    const args = poolTogetherV4LendArgs({
      ptToken,
      amount,
    });

    const result = await poolTogetherV4Adapter.parseAssetsForAction(randomAddress(), lendSelector, args);

    expect(result).toMatchFunctionOutput(poolTogetherV4Adapter.parseAssetsForAction, {
      spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
      incomingAssets_: [ptToken],
      spendAssets_: [outgoingToken],
      spendAssetAmounts_: [amount],
      minIncomingAssetAmounts_: [amount],
    });
  });

  it('generates expected output for redeeming', async () => {
    const poolTogetherV4Adapter = new PoolTogetherV4Adapter(fork.deployment.poolTogetherV4Adapter, provider);
    const ptToken = new StandardToken(fork.config.poolTogetherV4.ptTokens.ptUsdc[0], provider);
    const amount = utils.parseUnits('1', await ptToken.decimals());
    const token = new StandardToken(fork.config.primitives.usdc, provider);

    const args = poolTogetherV4RedeemArgs({
      ptToken,
      amount,
    });

    const result = await poolTogetherV4Adapter.parseAssetsForAction(randomAddress(), redeemSelector, args);

    expect(result).toMatchFunctionOutput(poolTogetherV4Adapter.parseAssetsForAction, {
      spendAssetsHandleType_: SpendAssetsHandleType.Approve,
      incomingAssets_: [token],
      spendAssets_: [ptToken],
      spendAssetAmounts_: [amount],
      minIncomingAssetAmounts_: [amount],
    });
  });

  it('generates expected output for claiming rewards', async () => {
    const poolTogetherV4Adapter = new PoolTogetherV4Adapter(fork.deployment.poolTogetherV4Adapter, provider);
    const prizeDistributor = randomAddress();
    const drawIds = [0];
    const winningPicks = '0x';

    const args = poolTogetherV4ClaimRewardsArgs({
      prizeDistributor,
      drawIds,
      winningPicks,
    });

    const result = await poolTogetherV4Adapter.parseAssetsForAction(randomAddress(), claimRewardsSelector, args);

    expect(result).toMatchFunctionOutput(poolTogetherV4Adapter.parseAssetsForAction, {
      spendAssetsHandleType_: SpendAssetsHandleType.None,
      incomingAssets_: [],
      spendAssets_: [],
      spendAssetAmounts_: [],
      minIncomingAssetAmounts_: [],
    });
  });
});

describe('lend', () => {
  it('works as expected when called for lending by a fund', async () => {
    const [fundOwner] = fork.accounts;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: new StandardToken(fork.config.primitives.usdc, fundOwner),
    });

    const token = new StandardToken(fork.config.primitives.usdc, whales.usdc);
    const amount = utils.parseUnits('1', await token.decimals());
    const ptToken = new StandardToken(fork.config.poolTogetherV4.ptTokens.ptUsdc[0], provider);

    await token.transfer(vaultProxy, amount);

    const [preTxIncomingAssetBalance, preTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [ptToken, token],
    });

    const lendReceipt = await poolTogetherV4Lend({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      poolTogetherV4Adapter: fork.deployment.poolTogetherV4Adapter,
      ptToken,
      amount,
    });

    const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [ptToken, token],
    });

    expect(postTxIncomingAssetBalance).toEqBigNumber(preTxIncomingAssetBalance.add(amount));
    expect(postTxOutgoingAssetBalance).toEqBigNumber(preTxOutgoingAssetBalance.sub(amount));

    expect(lendReceipt).toCostAround('610421');
  });
});

describe('redeem', () => {
  it('works as expected when called for redeeming by a fund', async () => {
    const [fundOwner] = fork.accounts;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: new StandardToken(fork.config.primitives.usdc, fundOwner),
    });

    const ptToken = new StandardToken(fork.config.poolTogetherV4.ptTokens.ptUsdc[0], whales.ptUsdc);
    const amount = utils.parseUnits('1', await ptToken.decimals());
    const token = new StandardToken(fork.config.primitives.usdc, provider);

    await ptToken.transfer(vaultProxy, amount);

    const [preTxIncomingAssetBalance, preTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [token, ptToken],
    });

    const redeemReceipt = await poolTogetherV4Redeem({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      poolTogetherV4Adapter: fork.deployment.poolTogetherV4Adapter,
      ptToken,
      amount,
    });

    const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [token, ptToken],
    });

    expect(postTxIncomingAssetBalance).toEqBigNumber(preTxIncomingAssetBalance.add(amount));
    expect(postTxOutgoingAssetBalance).toEqBigNumber(preTxOutgoingAssetBalance.sub(amount));

    expect(redeemReceipt).toCostAround('494913');
  });
});

describe('claimRewards', () => {
  // Properly testing this function requires delegating winning odds from the whale to the vault
  // Then triggering a new draw from PoolTogether, and computing winning picks for the vault
  // This is not trivial and also not critical since anyone can claim on behalf of the vault
  // So leaving it as a todo for now
  it.todo('works as expected when called for claiming rewards by a fund');
});
