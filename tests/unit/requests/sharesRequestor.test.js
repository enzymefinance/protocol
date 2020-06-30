import { BN, toWei } from 'web3-utils';
import { call, send } from '~/utils/deploy-contract';
import { BNExpDiv } from '~/utils/BNmath';
import { CONTRACT_NAMES, EMPTY_ADDRESS } from '~/utils/constants';
import { setupFundWithParams } from '~/utils/fund';
import { delay } from '~/utils/time';
import { getDeployed } from '~/utils/getDeployed';
import { updateKyberPriceFeed } from '~/utils/updateKyberPriceFeed';
import mainnetAddrs from '~/config';

let web3;
let deployer, investor, thirdPartyCaller;
let defaultTxOpts, investorTxOpts, gasPrice;
let weth, fundFactory;
let priceSource, registry, sharesRequestor;
let basicRequest;

beforeAll(async () => {
  web3 = await startChain();
  [deployer, investor, thirdPartyCaller] = await web3.eth.getAccounts();
  gasPrice = toWei('2', 'gwei');
  defaultTxOpts = { from: deployer, gas: 8000000, gasPrice };
  investorTxOpts = { ...defaultTxOpts, from: investor };

  fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY, web3);
  priceSource = getDeployed(CONTRACT_NAMES.KYBER_PRICEFEED, web3);
  weth = getDeployed(CONTRACT_NAMES.WETH, web3, mainnetAddrs.tokens.WETH);
  registry = getDeployed(CONTRACT_NAMES.REGISTRY, web3);
  sharesRequestor = getDeployed(CONTRACT_NAMES.SHARES_REQUESTOR, web3);

  basicRequest = {
    owner: investor,
    investmentAssetContract: weth,
    investmentAmount: toWei('1', 'ether'),
    minSharesQuantity: "0",
    txOpts: investorTxOpts,
    amguValue: toWei('0.1', 'ether')
  };
});

describe('cancelRequest', () => {
  let fund;
  let incentiveFee;
  let requestTxBlock, cancelTxBlock;

  beforeAll(async () => {
    // @dev include initial investment so test doesn't bypass Request creation
    fund = await setupFundWithParams({
      initialInvestment: {
        contribAmount: toWei('1', 'ether'),
        investor: deployer,
        tokenContract: weth
      },
      quoteToken: weth.options.address,
      manager: deployer,
      fundFactory,
      web3
    });

    await createRequest(fund.hub.options.address, basicRequest);
    requestTxBlock = await web3.eth.getBlockNumber();

    incentiveFee = await call(registry, 'incentive');
  });

  it('does NOT allow cancellation when a cancellation condition is not met', async () => {
    await expect(
      send(sharesRequestor, 'cancelRequest', [fund.hub.options.address], basicRequest.txOpts, web3)
    ).rejects.toThrowFlexible("No cancellation condition was met");
  });

  it('succeeds when cancellation condition is met', async () => {
    // Shut down the fund so cancellation condition passes
    await send(fund.hub, 'shutDownFund', [], defaultTxOpts, web3);

    await expect(
      send(sharesRequestor, 'cancelRequest', [fund.hub.options.address], basicRequest.txOpts, web3)
    ).resolves.not.toThrow();

    cancelTxBlock = await web3.eth.getBlockNumber();
  });

  it('removes request from state', async () => {
    const request = await call(
      sharesRequestor,
      'ownerToRequestByFund',
      [basicRequest.owner, fund.hub.options.address]
    );
    expect(request.timestamp).toBe("0");
  });

  it('emits correct RequestCanceled event', async() => {
    const events = await sharesRequestor.getPastEvents(
      'RequestCanceled',
      {
        fromBlock: cancelTxBlock,
        toBlock: 'latest'
      }
    );
    expect(events.length).toBe(1);

    const eventValues = events[0].returnValues;
    expect(eventValues.requestOwner).toBe(basicRequest.owner);
    expect(eventValues.hub).toBe(fund.hub.options.address);
    expect(eventValues.investmentAmount).toBe(basicRequest.investmentAmount);
    expect(eventValues.minSharesQuantity).toBe(basicRequest.minSharesQuantity);
    expect(Number(eventValues.createdTimestamp)).toBe(
      Number((await web3.eth.getBlock(requestTxBlock)).timestamp)
    );
    expect(eventValues.incentiveFee).toBe(incentiveFee);
  });
});

describe('executeRequestFor', () => {
  describe('Bad Requests', () => {
    let fund;

    beforeAll(async () => {
      fund = await setupFundWithParams({
        quoteToken: weth.options.address,
        fundFactory,
        initialInvestment: {
          contribAmount: toWei('1', 'ether'),
          investor: deployer,
          tokenContract: weth
        },
        manager: deployer,
        web3
      });
    });

    it('does NOT allow non-existing Request', async () => {
      await expect(
        send(
          sharesRequestor,
          'executeRequestFor',
          [basicRequest.owner, fund.hub.options.address],
          basicRequest.txOpts,
          web3
        )
      ).rejects.toThrowFlexible("Request does not exist");
    });

    it('does NOT allow request execution without a price update', async () => {
      await createRequest(fund.hub.options.address, basicRequest);

      await expect (
        send(
          sharesRequestor,
          'executeRequestFor',
          [basicRequest.owner, fund.hub.options.address],
          basicRequest.txOpts,
          web3
        )
      ).rejects.toThrowFlexible('Price has not updated since request');      
    });
  });

  describe('executeRequestFor (third party)', () => {
    let fund;
    let request, txReceipt;
    let expectedShares;
    let preTxBlock, preCallerEth, postCallerEth, preOwnerShares, postOwnerShares;

    beforeAll(async () => {
      // @dev include initial investment so test doesn't bypass Request creation
      fund = await setupFundWithParams({
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

      // Create request and update price
      await createRequest(fund.hub.options.address, basicRequest);
      request = await call(
        sharesRequestor,
        'ownerToRequestByFund',
        [basicRequest.owner, fund.hub.options.address]
      );

      const sharePrice = new BN(await call(fund.shares, 'calcSharePrice'));
      expectedShares = BNExpDiv(new BN(request.investmentAmount), sharePrice);
    });

    it('succeeds', async() => {
      preTxBlock = await web3.eth.getBlockNumber();
      preCallerEth = new BN(await web3.eth.getBalance(thirdPartyCaller));
      preOwnerShares = new BN(await call(fund.shares, 'balanceOf', [basicRequest.owner]));

      const thirdPartyCallerTxOpts = { ...basicRequest.txOpts, from: thirdPartyCaller };

      txReceipt = await executeRequest(
        fund.hub.options.address,
        {...basicRequest, txOpts: thirdPartyCallerTxOpts}
      );

      postCallerEth = new BN(await web3.eth.getBalance(thirdPartyCaller));
      postOwnerShares = new BN(await call(fund.shares, 'balanceOf', [basicRequest.owner]));
    });

    it('issues correct shares to request owner', async() => {
      expect(postOwnerShares.sub(preOwnerShares)).bigNumberEq(expectedShares);
    });

    it('removes Request', async() => {
      const request = await call(
        sharesRequestor,
        'ownerToRequestByFund',
        [basicRequest.owner, fund.hub.options.address]
      );
      expect(request.timestamp).toBe("0");
    });

    // @dev This works right now because amgu is set to 0
    it('sends incentive fee to caller', async() => {
      const gasSpent = new BN(txReceipt.gasUsed).mul(new BN(gasPrice));
      expect(new BN(request.incentiveFee).sub(gasSpent)).bigNumberEq(
        postCallerEth.sub(preCallerEth)
      );
    });

    it('emits correct RequestExecuted event', async() => {
      const events = await sharesRequestor.getPastEvents(
        'RequestExecuted',
        {
          fromBlock: Number(preTxBlock)+1,
          toBlock: 'latest'
        }
      );
      expect(events.length).toBe(1);

      const eventValues = events[0].returnValues;
      expect(eventValues.caller).toBe(thirdPartyCaller);
      expect(eventValues.requestOwner).toBe(basicRequest.owner);
      expect(eventValues.investmentAmount).toBe(request.investmentAmount);
      expect(eventValues.minSharesQuantity).toBe(request.minSharesQuantity);
      expect(eventValues.createdTimestamp).toBe(request.timestamp);
      expect(eventValues.incentiveFee).toBe(request.incentiveFee);
      expect(eventValues.sharesBought).toBe(expectedShares.toString());
    });
  });

  describe('executeRequestFor (self)', () => {
    let fund;
    let request, txReceipt;
    let expectedShares;
    let preTxBlock, preOwnerEth, postOwnerEth, preOwnerShares, postOwnerShares;

    beforeAll(async () => {
      // @dev include initial investment so test doesn't bypass Request creation
      fund = await setupFundWithParams({
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

      // Create request and update price
      await createRequest(fund.hub.options.address, basicRequest);
      request = await call(
        sharesRequestor,
        'ownerToRequestByFund',
        [basicRequest.owner, fund.hub.options.address]
      );

      const sharePrice = new BN(await call(fund.shares, 'calcSharePrice'));
      expectedShares = BNExpDiv(new BN(request.investmentAmount), sharePrice);
    });

    it('succeeds', async() => {
      preTxBlock = await web3.eth.getBlockNumber();
      preOwnerEth = new BN(await web3.eth.getBalance(basicRequest.owner));
      preOwnerShares = new BN(await call(fund.shares, 'balanceOf', [basicRequest.owner]));

      txReceipt = await executeRequest(
        fund.hub.options.address,
        basicRequest
      );

      postOwnerEth = new BN(await web3.eth.getBalance(basicRequest.owner));
      postOwnerShares = new BN(await call(fund.shares, 'balanceOf', [basicRequest.owner]));
    });

    it('issues correct shares to request owner', async() => {
      expect(postOwnerShares.sub(preOwnerShares)).bigNumberEq(expectedShares);
    });

    it('removes Request', async() => {
      const request = await call(
        sharesRequestor,
        'ownerToRequestByFund',
        [basicRequest.owner, fund.hub.options.address]
      );
      expect(request.timestamp).toBe("0");
    });

    // @dev This works right now because amgu is set to 0
    it('sends incentive fee to request owner', async() => {
      const gasSpent = new BN(txReceipt.gasUsed).mul(new BN(gasPrice));
      expect(new BN(request.incentiveFee).sub(gasSpent)).bigNumberEq(
        postOwnerEth.sub(preOwnerEth)
      );
    });

    it('emits correct RequestExecuted event', async() => {
      const events = await sharesRequestor.getPastEvents(
        'RequestExecuted',
        {
          fromBlock: Number(preTxBlock)+1,
          toBlock: 'latest'
        }
      );
      expect(events.length).toBe(1);

      const eventValues = events[0].returnValues;
      expect(eventValues.caller).toBe(basicRequest.owner);
      expect(eventValues.requestOwner).toBe(basicRequest.owner);
      expect(eventValues.investmentAmount).toBe(request.investmentAmount);
      expect(eventValues.minSharesQuantity).toBe(request.minSharesQuantity);
      expect(eventValues.createdTimestamp).toBe(request.timestamp);
      expect(eventValues.incentiveFee).toBe(request.incentiveFee);
      expect(eventValues.sharesBought).toBe(expectedShares.toString());
    });
  });
});

describe('requestShares', () => {
  describe('Bad Requests', () => {
    let fund;

    beforeAll(async () => {
      fund = await setupFundWithParams({
        quoteToken: weth.options.address,
        fundFactory,
        manager: deployer,
        web3
      });
    });

    it('does NOT allow empty param values', async() => {
      const badRequestInvestmentAmount = { ...basicRequest, investmentAmount: "0" };

      // Empty hub
      await expect(
        send(
          sharesRequestor,
          'requestShares',
          [
            EMPTY_ADDRESS,
            basicRequest.investmentAmount,
            basicRequest.minSharesQuantity
          ],
          { ...basicRequest.txOpts, value: basicRequest.amguValue },
          web3
        )
      ).rejects.toThrowFlexible("_hub cannot be empty");

      await expect(
        createRequest(fund.hub.options.address, badRequestInvestmentAmount)
      ).rejects.toThrowFlexible("_investmentAmount must be > 0");
    });

    it('does NOT allow request with insufficient token allowance', async() => {
      const badApprovalAmount = new BN(basicRequest.investmentAmount).sub(new BN(1)).toString();
      await send(
        basicRequest.investmentAssetContract,
        'approve',
        [sharesRequestor.options.address, badApprovalAmount],
        basicRequest.txOpts,
        web3
      );
      await expect(
        send(
          sharesRequestor,
          'requestShares',
          [
            fund.hub.options.address,
            basicRequest.investmentAmount,
            basicRequest.minSharesQuantity
          ],
          { ...basicRequest.txOpts, value: basicRequest.amguValue },
          web3
        )
      ).rejects.toThrow();
    });

    it('does NOT allow request for a shutdown fund', async() => {
      await send(fund.hub, 'shutDownFund', [], defaultTxOpts, web3);
      await expect(
        createRequest(fund.hub.options.address, basicRequest)
      ).rejects.toThrowFlexible("Fund is not active");
    });
  });

  describe('Good Request: nth investment', () => {
    let fund;
    let incentiveFee;
    let preTxBlock, preSharesRequestorEth, postSharesRequestorEth;

    beforeAll(async () => {
      // @dev include initial investment so test doesn't bypass Request creation
      fund = await setupFundWithParams({
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

      incentiveFee = await call(registry, 'incentive');
    });

    it('succeeds', async() => {
      await send(
        basicRequest.investmentAssetContract,
        'approve',
        [sharesRequestor.options.address, basicRequest.investmentAmount],
        basicRequest.txOpts,
        web3
      );

      preTxBlock = await web3.eth.getBlockNumber();

      preSharesRequestorEth = new BN(await web3.eth.getBalance(sharesRequestor.options.address));

      await expect(
        send(
          sharesRequestor,
          'requestShares',
          [
            fund.hub.options.address,
            basicRequest.investmentAmount,
            basicRequest.minSharesQuantity
          ],
          { ...basicRequest.txOpts, value: basicRequest.amguValue },
          web3
        )
      ).resolves.not.toThrow();

      postSharesRequestorEth = new BN(await web3.eth.getBalance(sharesRequestor.options.address));
    });

    it('adds correct Request', async() => {
      const request = await call(
        sharesRequestor,
        'ownerToRequestByFund',
        [basicRequest.owner, fund.hub.options.address]
      );
      expect(request.investmentAmount).toBe(basicRequest.investmentAmount);
      expect(request.minSharesQuantity).toBe(basicRequest.minSharesQuantity);
      expect(Number(request.timestamp)).toBe((await web3.eth.getBlock('latest')).timestamp);
      expect(request.incentiveFee).toBe(incentiveFee);
    });

    it('custodies incentive fee', async() => {
      const sharesRequestEthBalanceDiff = postSharesRequestorEth.sub(preSharesRequestorEth);
      expect(sharesRequestEthBalanceDiff).bigNumberEq(new BN(incentiveFee));
    });

    it('emits correct RequestCreated event', async() => {
      const events = await sharesRequestor.getPastEvents(
        'RequestCreated',
        {
          fromBlock: Number(preTxBlock)+1,
          toBlock: 'latest'
        }
      );
      expect(events.length).toBe(1);

      const eventValues = events[0].returnValues;
      expect(eventValues.requestOwner).toBe(basicRequest.owner);
      expect(eventValues.hub).toBe(fund.hub.options.address);
      expect(eventValues.investmentAmount).toBe(basicRequest.investmentAmount);
      expect(eventValues.minSharesQuantity).toBe(basicRequest.minSharesQuantity);
      expect(eventValues.incentiveFee).toBe(incentiveFee);
    });
  });

  describe('Multiple requests', () => {
    let fund;

    beforeAll(async () => {
      // @dev include initial investment so test doesn't bypass Request creation
      fund = await setupFundWithParams({
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

    it('does NOT allow more than one request per fund', async() => {
      await expect(
        createRequest(fund.hub.options.address, basicRequest)
      ).rejects.toThrowFlexible("Only one request can exist (per fund)");
    });

    it('allows requests for multiple funds', async() => {
      const fund2 = await setupFundWithParams({
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

      await expect(
        createRequest(fund2.hub.options.address, basicRequest)
      ).resolves.not.toThrow();
    });
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
    new BN(request.investmentAmount).sub(investorTokenBalance);
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
    [sharesRequestor.options.address, request.investmentAmount],
    request.txOpts,
    web3
  );
  return send(
    sharesRequestor,
    'requestShares',
    [
      fundAddress,
      request.investmentAmount,
      request.minSharesQuantity
    ],
    { ...request.txOpts, value: request.amguValue },
    web3
  );
};

const executeRequest = async (fundAddress, request) => {
  await delay(1000);
  await updateKyberPriceFeed(priceSource, web3);
  return send(
    sharesRequestor,
    'executeRequestFor',
    [request.owner, fundAddress],
    request.txOpts,
    web3
  );
};
