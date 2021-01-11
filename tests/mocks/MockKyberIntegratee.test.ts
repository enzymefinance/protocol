import { EthereumTestnetProvider } from '@crestproject/crestproject';
import { createNewFund, kyberTakeOrder, randomizedTestDeployment } from '@enzymefinance/testutils';
import { BigNumber, utils } from 'ethers';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await randomizedTestDeployment(provider);
  return { accounts, deployment, config };
}

it('correctly retrieves expectedRate from an integratee', async () => {
  const {
    deployment: {
      centralizedRateProvider,
      tokens: { knc, mln },
      chainlinkAggregators: { knc: aggregatorKnc, mln: aggregatorMln },
      kyberIntegratee,
    },
  } = await provider.snapshot(snapshot);

  // Set initial rates for base and quote assets
  const answerKnc = utils.parseEther('500');
  const answerMln = utils.parseEther('1');

  await aggregatorKnc.setLatestAnswer(answerKnc, BigNumber.from('1'));
  await aggregatorMln.setLatestAnswer(answerMln, BigNumber.from('1'));

  const senderDeviation = await centralizedRateProvider.getMaxDeviationPerSender();
  const blockNumberDeviation = await kyberIntegratee.getBlockNumberDeviation();
  const worstCaseSlippage = blockNumberDeviation.add(senderDeviation);

  const amount = utils.parseEther('1');
  const { rate_ } = await kyberIntegratee.getExpectedRate.args(knc.address, mln.address, amount).call();

  const worstRateExpected = answerKnc
    .mul(utils.parseEther('1'))
    .div(answerMln)
    .mul(BigNumber.from('100').sub(worstCaseSlippage))
    .div(100);

  const bestRateExpected = answerKnc
    .mul(utils.parseEther('1'))
    .div(answerMln)
    .mul(BigNumber.from('100').add(worstCaseSlippage))
    .div(100);

  expect(rate_).toBeGteBigNumber(worstRateExpected);
  expect(rate_).toBeLteBigNumber(bestRateExpected);
});

it('receives the expected amount of assets from a kyber swap integration', async () => {
  const {
    config: { deployer },
    deployment: {
      tokens: { knc, mln },
      chainlinkAggregators: { knc: aggregatorKnc, mln: aggregatorMln },
      kyberIntegratee,
    },
  } = await provider.snapshot(snapshot);

  const answerKnc = utils.parseEther('500');
  const answerMln = utils.parseEther('1');

  await aggregatorKnc.setLatestAnswer(answerKnc, BigNumber.from('1'));
  await aggregatorMln.setLatestAnswer(answerMln, BigNumber.from('1'));

  await knc.approve(kyberIntegratee.address, utils.parseEther('1'));

  const { rate_, worstRate_ } = await kyberIntegratee.getExpectedRate
    .args(knc.address, mln.address, utils.parseEther('1'))
    .call();

  const preBalance = await mln.balanceOf(deployer.address);
  await kyberIntegratee.swapTokenToToken(knc.address, utils.parseEther('1'), mln.address, 1);
  const postBalance = await mln.balanceOf(deployer.address);
  const balanceDiff = postBalance.sub(preBalance);

  expect(balanceDiff).toBeGteBigNumber(worstRate_);
  expect(worstRate_).toEqBigNumber(rate_.mul(BigNumber.from('97')).div(BigNumber.from('100')));
  expect(balanceDiff).toBeLteBigNumber(rate_.mul(BigNumber.from('103')).div(BigNumber.from('100')));
});

it('receives the expected amount of assets from a kyber swap integration (ETH)', async () => {
  const {
    deployment: {
      tokens: { knc, weth },
      chainlinkEthUsdAggregator,
      chainlinkAggregators: { knc: aggregatorKnc },
      kyberIntegratee,
    },
  } = await provider.snapshot(snapshot);

  // Set initial rates for base and quote assets
  const answerKnc = utils.parseEther('500');
  const answerWeth = utils.parseEther('1');

  const ethKyberAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

  await aggregatorKnc.setLatestAnswer(answerKnc, BigNumber.from('1'));
  await chainlinkEthUsdAggregator.setLatestAnswer(answerWeth, BigNumber.from('1'));

  const amount = utils.parseEther('1');
  const { rate_: rateWeth } = await kyberIntegratee.getExpectedRate.args(knc.address, weth.address, amount).call();
  const { rate_: rateEthKyberAddress } = await kyberIntegratee.getExpectedRate
    .args(knc.address, ethKyberAddress, amount)
    .call();

  expect(rateWeth).toEqBigNumber(rateEthKyberAddress);
});

it('correctly integrates with kyberAdapter', async () => {
  const {
    accounts: [fundOwner],
    config: { deployer },
    deployment: {
      tokens: { dai: outgoingAsset, knc: incomingAsset, weth: denominationAsset },
      fundDeployer,
      kyberAdapter,
      integrationManager,
      centralizedRateProvider,
      kyberIntegratee,
    },
  } = await provider.snapshot(snapshot);

  // Set a high deviation per sender to test against edge case
  await centralizedRateProvider.setMaxDeviationPerSender(BigNumber.from('40'));
  await kyberIntegratee.setBlockNumberDeviation(BigNumber.from('40'));

  const { comptrollerProxy, vaultProxy } = await createNewFund({
    signer: deployer,
    fundOwner,
    fundDeployer,
    denominationAsset,
  });

  const outgoingAssetAmount = utils.parseEther('1');

  const { worstRate_: minIncomingAssetAmount } = await kyberIntegratee.getExpectedRate
    .args(outgoingAsset, incomingAsset, outgoingAssetAmount)
    .call();

  await kyberTakeOrder({
    comptrollerProxy,
    vaultProxy,
    integrationManager,
    fundOwner,
    kyberAdapter,
    outgoingAsset,
    outgoingAssetAmount,
    incomingAsset,
    minIncomingAssetAmount,
    seedFund: true,
  });
});
