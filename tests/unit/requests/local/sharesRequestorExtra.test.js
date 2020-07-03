/*
 * @file Tests SharesRequestor scenarios that require EVM manipulation
 */

import { BN, toWei, isTopic } from 'web3-utils';
import { call, send } from '~/utils/deploy-contract';
import { CONTRACT_NAMES } from '~/utils/constants';
import { setupFundWithParams } from '~/utils/fund';
import { increaseTime } from '~/utils/rpc';
import { getDeployed } from '~/utils/getDeployed';
import mainnetAddrs from '~/config';

let deployer;
let defaultTxOpts;
let weth;
let sharesRequestor;
let basicRequest;
let fundFactory;

beforeAll(async () => {
    [deployer] = await web3.eth.getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };

  fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY);
  sharesRequestor = getDeployed(CONTRACT_NAMES.SHARES_REQUESTOR)
  weth = getDeployed(CONTRACT_NAMES.WETH, mainnetAddrs.tokens.WETH);

  basicRequest = {
    owner: deployer,
    investmentAssetContract: weth,
    investmentAmount: toWei('1', 'ether'),
    minSharesQuantity: "0",
    txOpts: defaultTxOpts,
    amguValue: toWei('0.1', 'ether')
  };
});

// TODO: implement new cancellation conditions tests, similar to old commented out tests below
describe('cancellation conditions', () => {
  it('has todos', () => {});
});

// describe('requestHasExpired', () => {
//   let fundFactory;
//   let fund;

//   beforeAll(async () => {
//     const contracts = deployed.contracts;
//     fundFactory = contracts[CONTRACT_NAMES.FUND_FACTORY];

//     // @dev include initial investment so test doesn't bypass Request creation
//     fund = await setupFundWithParams({
//       initialInvestment: {
//         contribAmount: toWei('1', 'ether'),
//         investor: deployer,
//         tokenContract: weth
//       },
//       quoteToken: weth.options.address,
//       fundFactory
//     });

//     await createRequest(fund.hub.options.address, basicRequest);
//   });

//   it('returns false after creating a request', async () => {
//     await expect(
//       call(
//         sharesRequestor,
//         'requestHasExpired',
//         [basicRequest.owner, fund.hub.options.address]
//       )
//     ).resolves.toBeFalsy()
//   });

//   it('does NOT allow order cancellation after creating a request', async () => {
//     await expect(
//       send(sharesRequestor, 'cancelRequest', [fund.hub.options.address], basicRequest.txOpts)
//     ).rejects.toThrowFlexible("No cancellation condition was met");
//   });

//   it('returns true after expiry time passes', async () => {
//     await increaseTime(86401); // 1 day + 1 second
//     await expect(
//       call(
//         sharesRequestor,
//         'requestHasExpired',
//         [basicRequest.owner, fund.hub.options.address]
//       )
//     ).resolves.toBeTruthy()
//   });

//   it('does NOT allow order execution after creating a request', async () => {
//     await expect(
//       send(
//         sharesRequestor,
//         'executeRequestFor',
//         [basicRequest.owner, fund.hub.options.address],
//         basicRequest.txOpts
//       )
//     ).rejects.toThrowFlexible("Request has expired");
//   });

//   it('allows order cancellation after expiry time passes', async () => {
//     await expect(
//       send(sharesRequestor, 'cancelRequest', [fund.hub.options.address], basicRequest.txOpts)
//     ).resolves.not.toThrow();
//   });
// });

const createRequest = async (fundAddress, request) => {
  // Fund investor with contribution token, if necessary
  const investorTokenBalance = new BN(
    await call(
      request.investmentAssetContract,
      'balanceOf',
      [request.owner]
    )
  );
  const investorTokenShortfall =
    new BN(request.investmentAmount).sub(investorTokenBalance);
  if (investorTokenShortfall.gt(new BN(0))) {
    await send(
      request.investmentAssetContract,
      'transfer',
      [request.owner, investorTokenShortfall.toString()],
      defaultTxOpts
    )
  }

  // Approve and send request
  await send(
    request.investmentAssetContract,
    'approve',
    [sharesRequestor.options.address, request.investmentAmount],
    request.txOpts
  );
  return send(
    sharesRequestor,
    'requestShares',
    [
      fundAddress,
      request.investmentAmount,
      request.minSharesQuantity
    ],
    { ...request.txOpts, value: request.amguValue }
  );
};
