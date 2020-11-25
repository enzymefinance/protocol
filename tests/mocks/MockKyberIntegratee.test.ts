import { EthereumTestnetProvider } from '@crestproject/crestproject';
import { randomizedTestDeployment } from '@melonproject/testutils';
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

  expect(rate_).toBeGteBigNumber(worstRateExpected);
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

  const preBalance = await mln.balanceOf(deployer.address);
  await kyberIntegratee.swapTokenToToken(knc.address, utils.parseEther('1'), mln.address, 1);
  const postBalance = await mln.balanceOf(deployer.address);
  const balanceDiff = postBalance.sub(preBalance);

  const { rate_, worstRate_ } = await kyberIntegratee.getExpectedRate
    .args(knc.address, mln.address, utils.parseEther('1'))
    .call();

  expect(balanceDiff).toEqBigNumber(rate_);
  expect(worstRate_).toEqBigNumber(rate_.mul(BigNumber.from('97')).div(BigNumber.from('100')));
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
