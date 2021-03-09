import { SignerWithAddress } from '@enzymefinance/hardhat';
import { StandardToken, UniswapV2Router } from '@enzymefinance/protocol';
import {
  createNewFund,
  ForkDeployment,
  getAssetBalances,
  loadForkDeployment,
  uniswapV2TakeOrder,
  unlockWhales,
} from '@enzymefinance/testutils';
import { BigNumber, utils } from 'ethers';

let whales: Record<string, SignerWithAddress>;
beforeAll(async () => {
  whales = await unlockWhales('usdt');
});

let fork: ForkDeployment;
beforeEach(async () => {
  fork = await loadForkDeployment();
});

describe('adapters', () => {
  // Confirms that approvals from adapters to external protocols work as expected
  it('can swap USDT for WETH via Uniswap', async () => {
    const weth = new StandardToken(fork.config.weth, provider);
    const outgoingAsset = new StandardToken(fork.config.primitives.usdt, whales.usdt);
    const incomingAsset = weth;
    const uniswapRouter = new UniswapV2Router(fork.config.uniswap.router, provider);
    const [fundOwner] = fork.accounts;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner as SignerWithAddress,
      fundOwner,
      fundDeployer: fork.deployment.FundDeployer,
      denominationAsset: weth,
    });

    const path = [outgoingAsset, incomingAsset];
    const outgoingAssetAmount = utils.parseUnits('1', await outgoingAsset.decimals());
    const amountsOut = await uniswapRouter.getAmountsOut(outgoingAssetAmount, path);

    const [preTxIncomingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset],
    });

    // Seed fund and take order
    await outgoingAsset.transfer(vaultProxy, outgoingAssetAmount);
    await uniswapV2TakeOrder({
      comptrollerProxy,
      vaultProxy,
      integrationManager: fork.deployment.IntegrationManager,
      fundOwner,
      uniswapV2Adapter: fork.deployment.UniswapV2Adapter,
      path,
      outgoingAssetAmount,
      minIncomingAssetAmount: amountsOut[1],
    });

    const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, outgoingAsset],
    });

    const incomingAssetAmount = postTxIncomingAssetBalance.sub(preTxIncomingAssetBalance);
    expect(incomingAssetAmount).toEqBigNumber(amountsOut[1]);
    expect(postTxOutgoingAssetBalance).toEqBigNumber(BigNumber.from(0));
  });
});
