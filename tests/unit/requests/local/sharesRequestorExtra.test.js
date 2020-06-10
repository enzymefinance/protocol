/*
 * @file Tests SharesRequestor scenarios that require EVM manipulation
 */

import { BN, toWei } from 'web3-utils';
import { call, send } from '~/deploy/utils/deploy-contract';
import { CONTRACT_NAMES } from '~/tests/utils/constants';
import { setupFundWithParams } from '~/tests/utils/fund';
import { increaseTime } from '~/tests/utils/rpc';
import { getDeployed } from '~/tests/utils/getDeployed';
import * as mainnetAddrs from '~/mainnet_thirdparty_contracts';

let web3;
let deployer;
let defaultTxOpts;
let weth;
let sharesRequestor;
let basicRequest;
let fundFactory;

beforeAll(async () => {
  web3 = await startChain();
  [deployer] = await web3.eth.getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };

  fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY, web3);
  sharesRequestor = getDeployed(CONTRACT_NAMES.SHARES_REQUESTOR, web3)
  weth = getDeployed(CONTRACT_NAMES.WETH, web3, mainnetAddrs.tokens.WETH);

  // Send a surplus of maxInvestmentAmount to ensure refund
  basicRequest = {
    owner: deployer,
    investmentAssetContract: weth,
    maxInvestmentAmount: toWei('1.1', 'ether'),
    sharesQuantity: toWei('1', 'ether'),
    txOpts: defaultTxOpts,
    amguValue: toWei('0.1', 'ether')
  };
});

describe('requestHasExpired', () => {
  let fund;

  beforeAll(async () => {
    fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY, web3);

    // @dev include initial investment so test doesn't bypass Request creation
    fund = await setupFundWithParams({
      defaultTokens: [weth.options.address],
      initialInvestment: {
        contribAmount: toWei('1', 'ether'),
        investor: deployer,
        tokenContract: weth
      },
      quoteToken: weth.options.address,
      fundFactory,
      manager: deployer,
      web3
    });

    await createRequest(fund.hub.options.address, basicRequest);
  });

  it('returns false after creating a request', async () => {
    await expect(
      call(
        sharesRequestor,
        'requestHasExpired',
        [basicRequest.owner, fund.hub.options.address]
      )
    ).resolves.toBeFalsy()
  });

  it('does NOT allow order cancellation after creating a request', async () => {
    await expect(
      send(
        sharesRequestor,
        'cancelRequest',
        [fund.hub.options.address],
        basicRequest.txOpts,
        web3
      )
    ).rejects.toThrowFlexible("No cancellation condition was met");
  });

  it('returns true after expiry time passes', async () => {
    await increaseTime(86401, web3); // 1 day + 1 second
    await expect(
      call(
        sharesRequestor,
        'requestHasExpired',
        [basicRequest.owner, fund.hub.options.address]
      )
    ).resolves.toBeTruthy()
  });

  it('does NOT allow order execution after creating a request', async () => {
    await expect(
      send(
        sharesRequestor,
        'executeRequestFor',
        [basicRequest.owner, fund.hub.options.address],
        { ...basicRequest.txOpts, value: basicRequest.amguValue },
        web3
      )
    ).rejects.toThrowFlexible("Request has expired");
  });

  it('allows order cancellation after expiry time passes', async () => {
    await expect(
      send(
        sharesRequestor,
        'cancelRequest',
        [fund.hub.options.address],
        basicRequest.txOpts,
        web3
      )
    ).resolves.not.toThrow();
  });
});

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
    new BN(request.maxInvestmentAmount).sub(investorTokenBalance);
  if (investorTokenShortfall.gt(new BN(0))) {
    await send(
      request.investmentAssetContract,
      'transfer',
      [request.owner, investorTokenShortfall.toString()],
      defaultTxOpts,
      web3
    )
  }

  // Approve and send request
  await send(
    request.investmentAssetContract,
    'approve',
    [sharesRequestor.options.address, request.maxInvestmentAmount],
    request.txOpts,
    web3
  );
  return send(
    sharesRequestor,
    'requestShares',
    [
      fundAddress,
      request.investmentAssetContract.options.address,
      request.maxInvestmentAmount,
      request.sharesQuantity
    ],
    { ...request.txOpts, value: request.amguValue },
    web3
  );
};
