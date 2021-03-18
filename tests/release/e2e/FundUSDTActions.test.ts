import { StandardToken, UniswapV2Router } from '@enzymefinance/protocol';
import {
  createNewFund,
  ProtocolDeployment,
  getAssetBalances,
  deployProtocolFixture,
  uniswapV2TakeOrder,
} from '@enzymefinance/testutils';
import { BigNumber, utils } from 'ethers';

let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
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
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
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
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      uniswapV2Adapter: fork.deployment.uniswapV2Adapter,
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
