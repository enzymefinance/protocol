import { BN, randomHex, toWei } from 'web3-utils';

import web3 from '~/deploy/utils/get-web3';
import { BNExpDiv } from '~/tests/utils/BNmath';
import getFundComponents from '~/tests/utils/getFundComponents';

export const setupFundWithParams = async ({
  defaultTokens,
  exchanges = [],
  exchangeAdapters = [],
  initialInvestment = {
    contribAmount: 0,
    investor: undefined,
    tokenContract: undefined
  },
  manager,
  name = randomHex(32),
  quoteToken,
  version
}) => {
  const managerTxOpts = { from: manager, gas: 8000000 };
  await version.methods
    .beginSetup(
      name,
      [],
      [],
      [],
      exchanges,
      exchangeAdapters,
      quoteToken,
      defaultTokens,
    ).send(managerTxOpts);

  await version.methods.createAccounting().send(managerTxOpts);
  await version.methods.createFeeManager().send(managerTxOpts);
  await version.methods.createParticipation().send(managerTxOpts);
  await version.methods.createPolicyManager().send(managerTxOpts);
  await version.methods.createShares().send(managerTxOpts);
  await version.methods.createTrading().send(managerTxOpts);
  await version.methods.createVault().send(managerTxOpts);
  const res = await version.methods.completeSetup().send(managerTxOpts);
  const hubAddress = res.events.NewFund.returnValues.hub;
  const fund = await getFundComponents(hubAddress);

  // Make initial investment, if applicable
  if (new BN(initialInvestment.contribAmount).gt(new BN(0))) {
    const investorTxOpts = { ...managerTxOpts, from: initialInvestment.investor };
    const amguAmount = toWei('.01', 'ether');

    // Calculate amount of shares to buy with contribution
    const shareCost = new BN(
      await fund.accounting.methods
        .getShareCostInAsset(toWei('1', 'ether'), initialInvestment.tokenContract.options.address)
        .call()
    );
    const wantedShares = BNExpDiv(new BN(initialInvestment.contribAmount), shareCost).toString();

    // Fund investor with contribution token, if necessary
    const investorTokenBalance = new BN(
      await initialInvestment.tokenContract.methods
        .balanceOf(initialInvestment.investor)
        .call()
    );
    const investorTokenShortfall =
      new BN(initialInvestment.contribAmount).sub(investorTokenBalance);
    if (investorTokenShortfall.gt(new BN(0))) {
      const [deployer] = await web3.eth.getAccounts();
      await initialInvestment.tokenContract.methods
        .transfer(initialInvestment.investor, investorTokenShortfall.toString())
        .send({ ...managerTxOpts, from: deployer });
    }

    // Invest in fund
    await initialInvestment.tokenContract.methods
      .approve(fund.participation.options.address, initialInvestment.contribAmount)
      .send(investorTxOpts);
    await fund.participation.methods
      .requestInvestment(
        wantedShares,
        initialInvestment.contribAmount,
        initialInvestment.tokenContract.options.address
      )
      .send({ ...investorTxOpts, value: amguAmount });
    await fund.participation.methods
      .executeRequestFor(initialInvestment.investor)
      .send(investorTxOpts);
  }

  return fund;
}
