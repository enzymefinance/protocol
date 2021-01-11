import { EthereumTestnetProvider } from '@crestproject/crestproject';
import { ISynthetixExchanger, StandardToken } from '@enzymefinance/protocol';
import {
  createNewFund,
  defaultForkDeployment,
  getAssetBalances,
  synthetixAssignExchangeDelegate,
  synthetixResolveAddress,
  synthetixTakeOrder,
} from '@enzymefinance/testutils';
import { BigNumber, utils } from 'ethers';

async function snapshot(provider: EthereumTestnetProvider) {
  const {
    accounts: [fundOwner, ...remainingAccounts],
    deployment,
    config,
  } = await provider.snapshot(defaultForkDeployment);

  const { comptrollerProxy, vaultProxy } = await createNewFund({
    signer: config.deployer,
    fundOwner,
    fundDeployer: deployment.fundDeployer,
    denominationAsset: config.tokens.susd,
  });

  const exchangerAddress = await synthetixResolveAddress({
    addressResolver: config.integratees.synthetix.addressResolver,
    name: 'Exchanger',
  });

  return {
    accounts: remainingAccounts,
    deployment,
    config,
    fund: {
      comptrollerProxy,
      fundOwner,
      vaultProxy,
    },
    sbtcCurrencyKey: utils.formatBytes32String('sBTC'),
    susdCurrencyKey: utils.formatBytes32String('sUSD'),
    synthetixExchanger: new ISynthetixExchanger(exchangerAddress, provider),
  };
}

// HAPPY PATHS

it('works as expected when called by a fund (synth to synth)', async () => {
  const {
    config: {
      deployer,
      derivatives: {
        synthetix: { sbtc },
      },
      integratees: {
        synthetix: { addressResolver, susd },
      },
    },
    deployment: { synthetixAdapter, integrationManager },
    fund: { comptrollerProxy, fundOwner, vaultProxy },
    sbtcCurrencyKey,
    susdCurrencyKey,
    synthetixExchanger,
  } = await provider.snapshot(snapshot);

  // Delegate SynthetixAdapter to exchangeOnBehalf of VaultProxy
  await synthetixAssignExchangeDelegate({
    comptrollerProxy,
    addressResolver,
    fundOwner,
    delegate: synthetixAdapter.address,
  });

  // Define order params
  const incomingAsset = new StandardToken(sbtc, deployer);
  const outgoingAsset = new StandardToken(susd, deployer);
  const outgoingAssetAmount = utils.parseEther('100');
  const { 0: minIncomingAssetAmount } = await synthetixExchanger.getAmountsForExchange(
    outgoingAssetAmount,
    susdCurrencyKey,
    sbtcCurrencyKey,
  );

  // Get incoming asset balance prior to tx
  const [preTxIncomingAssetBalance] = await getAssetBalances({
    account: vaultProxy,
    assets: [incomingAsset],
  });

  // Execute Synthetix order
  await synthetixTakeOrder({
    comptrollerProxy,
    vaultProxy,
    integrationManager,
    fundOwner,
    synthetixAdapter,
    outgoingAsset,
    outgoingAssetAmount,
    incomingAsset,
    minIncomingAssetAmount,
    seedFund: true,
  });

  // Get incoming and outgoing asset balances after the tx
  const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
    account: vaultProxy,
    assets: [incomingAsset, outgoingAsset],
  });

  // Assert the expected final token balances of the VaultProxy
  const incomingAssetAmount = postTxIncomingAssetBalance.sub(preTxIncomingAssetBalance);
  expect(incomingAssetAmount).toEqBigNumber(minIncomingAssetAmount);
  expect(postTxOutgoingAssetBalance).toEqBigNumber(BigNumber.from(0));
});
