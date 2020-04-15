import { BN, toWei } from 'web3-utils';

import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import { call, send } from '~/deploy/utils/deploy-contract';
import getAccounts from '~/deploy/utils/getAccounts';
import web3 from '~/deploy/utils/get-web3';

import { CONTRACT_NAMES, EMPTY_ADDRESS } from '~/tests/utils/constants';
import { setupFundWithParams } from '~/tests/utils/fund';
import { delay } from '~/tests/utils/time';
import updateTestingPriceFeed from '~/tests/utils/updateTestingPriceFeed';

let deployer, investor, thirdPartyCaller;
let defaultTxOpts, investorTxOpts, gasPrice;
let mln, weth;
let priceSource, registry, sharesRequestor;
let basicRequest, basicTokenPriceData;

beforeAll(async () => {
  [deployer, investor, thirdPartyCaller] = await getAccounts();
  gasPrice = toWei('2', 'gwei');
  defaultTxOpts = { from: deployer, gas: 8000000, gasPrice };
  investorTxOpts = { ...defaultTxOpts, from: investor };

  const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY]);
  const contracts = deployed.contracts;

  priceSource = contracts[CONTRACT_NAMES.TESTING_PRICEFEED];
  registry = contracts[CONTRACT_NAMES.REGISTRY];
  sharesRequestor = contracts[CONTRACT_NAMES.SHARES_REQUESTOR];
  weth = contracts.WETH;
  mln = contracts.MLN;

  // Send a surplus of maxInvestmentAmount to ensure refund
  basicRequest = {
    owner: investor,
    investmentAssetContract: weth,
    maxInvestmentAmount: toWei('1.1', 'ether'),
    sharesQuantity: toWei('1', 'ether'),
    txOpts: investorTxOpts,
    amguValue: toWei('0.1', 'ether')
  };

  basicTokenPriceData = {
    priceSource,
    tokenAddresses: [weth.options.address, mln.options.address],
    tokenPrices: [toWei('1', 'ether'), toWei('2', 'ether')]
  };
});

describe('__cancelRequestFor', () => {
  describe('cancelRequestFor (third party)', () => {
    let fundFactory;
    let fund;
  
    beforeAll(async () => {
      const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY], true);
      const contracts = deployed.contracts;
      fundFactory = contracts[CONTRACT_NAMES.FUND_FACTORY];
  
      // @dev include initial investment so test doesn't bypass Request creation
      fund = await setupFundWithParams({
        defaultTokens: [weth.options.address],
        initialInvestment: {
          contribAmount: toWei('1', 'ether'),
          investor: deployer,
          tokenContract: weth
        },
        quoteToken: weth.options.address,
        fundFactory
      });
  
      await createRequest(fund.hub.options.address, basicRequest);
    });

    it('does NOT allow cancellation when a cancellation condition is not met', async () => {
      await expect(
        send(
          sharesRequestor,
          'cancelRequestFor',
          [basicRequest.owner, fund.hub.options.address],
          { ...defaultTxOpts, from: thirdPartyCaller }
        )
      ).rejects.toThrowFlexible("No cancellation condition was met");
    });
  
    it('allows cancellation when a fund is shutdown', async () => {
      await send(fundFactory, 'shutDownFund', [fund.hub.options.address], defaultTxOpts);

      await expect(
        send(
          sharesRequestor,
          'cancelRequestFor',
          [basicRequest.owner, fund.hub.options.address],
          { ...defaultTxOpts, from: thirdPartyCaller }
        )
      ).resolves.not.toThrow();
    });
  });

  describe('cancellation condition', () => {
    describe('healthy fund', () => {
      let fundFactory;
      let fund;
    
      beforeAll(async () => {
        const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY], true);
        const contracts = deployed.contracts;
        fundFactory = contracts[CONTRACT_NAMES.FUND_FACTORY];
    
        // @dev include initial investment so test doesn't bypass Request creation
        fund = await setupFundWithParams({
          defaultTokens: [weth.options.address],
          initialInvestment: {
            contribAmount: toWei('1', 'ether'),
            investor: deployer,
            tokenContract: weth
          },
          quoteToken: weth.options.address,
          fundFactory
        });
    
        await createRequest(fund.hub.options.address, basicRequest);
      });

      it('does NOT allow cancellation when a cancellation condition is not met', async () => {
        await expect(
          send(sharesRequestor, 'cancelRequest', [fund.hub.options.address], basicRequest.txOpts)
        ).rejects.toThrowFlexible("No cancellation condition was met");
      });
    });
  
    describe('fund shutdown', () => {
      let fundFactory;
      let fund;
    
      beforeAll(async () => {
        const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY], true);
        const contracts = deployed.contracts;
        fundFactory = contracts[CONTRACT_NAMES.FUND_FACTORY];
    
        // @dev include initial investment so test doesn't bypass Request creation
        fund = await setupFundWithParams({
          defaultTokens: [weth.options.address],
          initialInvestment: {
            contribAmount: toWei('1', 'ether'),
            investor: deployer,
            tokenContract: weth
          },
          quoteToken: weth.options.address,
          fundFactory
        });
    
        await createRequest(fund.hub.options.address, basicRequest);
      });

      it('does NOT allow cancellation when a cancellation condition is not met', async () => {
        await expect(
          send(sharesRequestor, 'cancelRequest', [fund.hub.options.address], basicRequest.txOpts)
        ).rejects.toThrowFlexible("No cancellation condition was met");
      });

      it('allows cancellation when a fund is shutdown', async () => {
        await send(fundFactory, 'shutDownFund', [fund.hub.options.address], defaultTxOpts);
  
        await expect(
          send(sharesRequestor, 'cancelRequest', [fund.hub.options.address], basicRequest.txOpts)
        ).resolves.not.toThrow();
      });  
    })

    describe('invalid price of investment asset', () => {
      let fundFactory;
      let fund;
    
      beforeAll(async () => {
        const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY], true);
        const contracts = deployed.contracts;
        fundFactory = contracts[CONTRACT_NAMES.FUND_FACTORY];
    
        // @dev include initial investment so test doesn't bypass Request creation
        fund = await setupFundWithParams({
          defaultTokens: [weth.options.address, mln.options.address],
          initialInvestment: {
            contribAmount: toWei('1', 'ether'),
            investor: deployer,
            tokenContract: weth
          },
          quoteToken: weth.options.address,
          fundFactory
        });
    
        await createRequest(fund.hub.options.address, basicRequest);
      });

      it('does NOT allow cancellation when a cancellation condition is not met', async () => {
        await expect(
          send(sharesRequestor, 'cancelRequest', [fund.hub.options.address], basicRequest.txOpts)
        ).rejects.toThrowFlexible("No cancellation condition was met");
      });

      it('does NOT allow cancellation when a NON-investmentAsset has an invalid price', async () => {
        await send(
          priceSource,
          'update',
          [
            [weth.options.address, mln.options.address],
            [toWei('1', 'ether'), '0'],
          ],
          defaultTxOpts
        );

        await expect(
          send(sharesRequestor, 'cancelRequest', [fund.hub.options.address], basicRequest.txOpts)
        ).rejects.toThrowFlexible("No cancellation condition was met");
      });

      it('allows cancellation when an investmentAsset has an invalid price', async () => {
        await send(
          priceSource,
          'update',
          [
            [weth.options.address, mln.options.address],
            [0, toWei('1', 'ether')],
          ],
          defaultTxOpts
        );
  
        await expect(
          send(sharesRequestor, 'cancelRequest', [fund.hub.options.address], basicRequest.txOpts)
        ).resolves.not.toThrow();
      });
    })
  });

  describe('cancelRequest for self', () => {
    let fundFactory;
    let fund;
    let incentiveFee;
    let requestTxBlock, cancelTxBlock;
  
    beforeAll(async () => {
      const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY], true);
      const contracts = deployed.contracts;
      fundFactory = contracts[CONTRACT_NAMES.FUND_FACTORY];
  
      // @dev include initial investment so test doesn't bypass Request creation
      fund = await setupFundWithParams({
        defaultTokens: [weth.options.address],
        initialInvestment: {
          contribAmount: toWei('1', 'ether'),
          investor: deployer,
          tokenContract: weth
        },
        quoteToken: weth.options.address,
        fundFactory
      });
  
      await createRequest(fund.hub.options.address, basicRequest);
      requestTxBlock = await web3.eth.getBlockNumber();

      incentiveFee = await call(registry, 'incentive');

      // Shut down the fund so cancellation condition passes
      await send(fundFactory, 'shutDownFund', [fund.hub.options.address], defaultTxOpts);
    });
  
    it('succeeds', async () => {  
      await expect(
        send(sharesRequestor, 'cancelRequest', [fund.hub.options.address], basicRequest.txOpts)
      ).resolves.not.toThrow();

      cancelTxBlock = await web3.eth.getBlockNumber();
    });
  
    it('removes request from state', async () => {
      const requestInMapping = await call(
        sharesRequestor,
        'ownerToRequestByFund',
        [basicRequest.owner, fund.hub.options.address]
      );
      expect(requestInMapping.investmentAsset).toBe(EMPTY_ADDRESS);

      const requestInSet = await call(
        sharesRequestor,
        'requestExists',
        [basicRequest.owner, fund.hub.options.address]
      );
      expect(requestInSet).toBe(false);
    });

    it('emits correct RequestCancelled event', async() => {
      const events = await sharesRequestor.getPastEvents(
        'RequestCancelled',
        {
          fromBlock: cancelTxBlock,
          toBlock: 'latest'
        }
      );
      expect(events.length).toBe(1);

      const eventValues = events[0].returnValues;
      expect(eventValues.caller).toBe(basicRequest.owner);
      expect(eventValues.requestOwner).toBe(basicRequest.owner);
      expect(eventValues.hub).toBe(fund.hub.options.address);
      expect(eventValues.investmentAsset).toBe(
        basicRequest.investmentAssetContract.options.address
      );
      expect(eventValues.maxInvestmentAmount).toBe(basicRequest.maxInvestmentAmount);
      expect(eventValues.sharesQuantity).toBe(basicRequest.sharesQuantity);
      expect(Number(eventValues.createdTimestamp)).toBe(
        Number((await web3.eth.getBlock(requestTxBlock)).timestamp)
      );
      expect(eventValues.incentiveFee).toBe(incentiveFee);
    });
  });
});

describe('executeRequestFor', () => {
  describe('Bad Requests', () => {
    let fund;

    beforeAll(async () => {
      const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY], true);
      const contracts = deployed.contracts;
      const fundFactory = contracts[CONTRACT_NAMES.FUND_FACTORY];
  
      fund = await setupFundWithParams({
        defaultTokens: [weth.options.address],
        quoteToken: weth.options.address,
        fundFactory,
        initialInvestment: {
          contribAmount: toWei('1', 'ether'),
          investor: deployer,
          tokenContract: weth
        }
      });
    });

    it('does NOT allow non-existing Request', async () => {
      await expect(
        send(
          sharesRequestor,
          'executeRequestFor',
          [basicRequest.owner, fund.hub.options.address],
          { ...basicRequest.txOpts, value: basicRequest.amguValue }
        )
      ).rejects.toThrowFlexible("No request exists for fund");
    });

    it('does NOT allow request execution without a price update', async () => {
      await createRequest(fund.hub.options.address, basicRequest);

      await expect (
        send(
          sharesRequestor,
          'executeRequestFor',
          [basicRequest.owner, fund.hub.options.address],
          { ...basicRequest.txOpts, value: basicRequest.amguValue }
        )
      ).rejects.toThrowFlexible("Price has not updated since request");      
    });

    it('does NOT allow request execution when investment asset price is 0', async () => {
      await expect(
        executeRequest(
          fund.hub.options.address,
          basicRequest,
          { ...basicTokenPriceData, tokenPrices: ["0", toWei('2', 'ether')] }
        )        
      ).rejects.toThrowFlexible("Price not valid");      
    });
  });

  describe('executeRequestFor (third party)', () => {
    let fund;
    let request, txReceipt;
    let expectedSharesCost;
    let preTxBlock, preCallerEth, postCallerEth, preOwnerShares, postOwnerShares;
    let preOwnerInvestmentAssetBalance, postOwnerInvestmentAssetBalance;

    beforeAll(async () => {
      const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY], true);
      const contracts = deployed.contracts;
      const fundFactory = contracts[CONTRACT_NAMES.FUND_FACTORY];

      // @dev include initial investment so test doesn't bypass Request creation
      fund = await setupFundWithParams({
        defaultTokens: [weth.options.address],
        initialInvestment: {
          contribAmount: toWei('1', 'ether'),
          investor: deployer,
          tokenContract: weth
        },
        quoteToken: weth.options.address,
        fundFactory
      });

      // Create request and update price
      await createRequest(fund.hub.options.address, basicRequest);
      request = await call(
        sharesRequestor,
        'ownerToRequestByFund',
        [basicRequest.owner, fund.hub.options.address]
      );

      expectedSharesCost = new BN(
        await call(
          fund.shares,
          'getSharesCostInAsset',
          [request.sharesQuantity, request.investmentAsset]
        )
      );
    });

    it('succeeds', async() => {
      preTxBlock = await web3.eth.getBlockNumber();
      preCallerEth = new BN(await web3.eth.getBalance(thirdPartyCaller));
      preOwnerInvestmentAssetBalance = new BN(
        await call(basicRequest.investmentAssetContract, 'balanceOf', [basicRequest.owner])
      );
      preOwnerShares = new BN(await call(fund.shares, 'balanceOf', [basicRequest.owner]));

      const thirdPartyCallerTxOpts = { ...basicRequest.txOpts, from: thirdPartyCaller };

      txReceipt = await executeRequest(
        fund.hub.options.address,
        {...basicRequest, txOpts: thirdPartyCallerTxOpts},
        basicTokenPriceData
      );

      postCallerEth = new BN(await web3.eth.getBalance(thirdPartyCaller));
      postOwnerInvestmentAssetBalance = new BN(
        await call(basicRequest.investmentAssetContract, 'balanceOf', [basicRequest.owner])
      );
      postOwnerShares = new BN(await call(fund.shares, 'balanceOf', [basicRequest.owner]));
    });

    it('returns surplus investment asset to request owner', async() => {
      const surplus = new BN(request.maxInvestmentAmount).sub(expectedSharesCost);
      expect(surplus).bigNumberEq(
        postOwnerInvestmentAssetBalance.sub(preOwnerInvestmentAssetBalance)
      );
    });

    it('issues correct shares to request owner', async() => {
      expect(postOwnerShares.sub(preOwnerShares)).bigNumberEq(new BN(request.sharesQuantity));
    });

    it('removes Request', async() => {
      await expect(
        call(sharesRequestor, 'requestExists', [basicRequest.owner, fund.hub.options.address])
      ).resolves.toBeFalsy();
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
      expect(eventValues.investmentAsset).toBe(request.investmentAsset);
      expect(eventValues.investmentAmountFilled).toBe(expectedSharesCost.toString());
      expect(eventValues.sharesQuantity).toBe(request.sharesQuantity);
      expect(eventValues.createdTimestamp).toBe(request.timestamp);
      expect(eventValues.incentiveFee).toBe(request.incentiveFee);
    });
  });

  describe('executeRequestFor (self)', () => {
    let fund;
    let request, txReceipt;
    let expectedSharesCost;
    let preTxBlock, preOwnerEth, postOwnerEth, preOwnerShares, postOwnerShares;
    let preOwnerInvestmentAssetBalance, postOwnerInvestmentAssetBalance;

    beforeAll(async () => {
      const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY], true);
      const contracts = deployed.contracts;
      const fundFactory = contracts[CONTRACT_NAMES.FUND_FACTORY];

      // @dev include initial investment so test doesn't bypass Request creation
      fund = await setupFundWithParams({
        defaultTokens: [weth.options.address],
        initialInvestment: {
          contribAmount: toWei('1', 'ether'),
          investor: deployer,
          tokenContract: weth
        },
        quoteToken: weth.options.address,
        fundFactory
      });

      // Create request and update price
      await createRequest(fund.hub.options.address, basicRequest);
      request = await call(
        sharesRequestor,
        'ownerToRequestByFund',
        [basicRequest.owner, fund.hub.options.address]
      );

      expectedSharesCost = new BN(
        await call(
          fund.shares,
          'getSharesCostInAsset',
          [request.sharesQuantity, request.investmentAsset]
        )
      );
    });

    it('succeeds', async() => {
      preTxBlock = await web3.eth.getBlockNumber();
      preOwnerEth = new BN(await web3.eth.getBalance(basicRequest.owner));
      preOwnerInvestmentAssetBalance = new BN(
        await call(basicRequest.investmentAssetContract, 'balanceOf', [basicRequest.owner])
      );
      preOwnerShares = new BN(await call(fund.shares, 'balanceOf', [basicRequest.owner]));

      txReceipt = await executeRequest(
        fund.hub.options.address,
        basicRequest,
        basicTokenPriceData
      );

      postOwnerEth = new BN(await web3.eth.getBalance(basicRequest.owner));
      postOwnerInvestmentAssetBalance = new BN(
        await call(basicRequest.investmentAssetContract, 'balanceOf', [basicRequest.owner])
      );
      postOwnerShares = new BN(await call(fund.shares, 'balanceOf', [basicRequest.owner]));
    });

    it('returns surplus investment asset to request owner', async() => {
      const surplus = new BN(request.maxInvestmentAmount).sub(expectedSharesCost);
      expect(surplus).bigNumberEq(
        postOwnerInvestmentAssetBalance.sub(preOwnerInvestmentAssetBalance)
      );
    });

    it('issues correct shares to request owner', async() => {
      expect(postOwnerShares.sub(preOwnerShares)).bigNumberEq(new BN(request.sharesQuantity));
    });

    it('removes Request', async() => {
      await expect(
        call(sharesRequestor, 'requestExists', [basicRequest.owner, fund.hub.options.address])
      ).resolves.toBeFalsy();
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
      expect(eventValues.investmentAsset).toBe(request.investmentAsset);
      expect(eventValues.investmentAmountFilled).toBe(expectedSharesCost.toString());
      expect(eventValues.sharesQuantity).toBe(request.sharesQuantity);
      expect(eventValues.createdTimestamp).toBe(request.timestamp);
      expect(eventValues.incentiveFee).toBe(request.incentiveFee);
    });
  });
});

describe('requestShares', () => {
  describe('Bad Requests', () => {
    let fundFactory;
    let fund;

    beforeAll(async () => {
      const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY], true);
      const contracts = deployed.contracts;
      fundFactory = contracts[CONTRACT_NAMES.FUND_FACTORY];

      fund = await setupFundWithParams({
        defaultTokens: [weth.options.address],
        quoteToken: weth.options.address,
        fundFactory
      });
    });

    it('does NOT allow empty param values', async() => {
      const badRequestMaxInvestmentAmount = { ...basicRequest, maxInvestmentAmount: "0" };
      const badRequestSharesQuantity = { ...basicRequest, sharesQuantity: "0" };

      // Empty hub
      await expect(
        send(
          sharesRequestor,
          'requestShares',
          [
            EMPTY_ADDRESS,
            basicRequest.investmentAssetContract.options.address,
            basicRequest.maxInvestmentAmount,
            basicRequest.sharesQuantity
          ],
          { ...basicRequest.txOpts, value: basicRequest.amguValue }
        )
      ).rejects.toThrowFlexible("_hub cannot be empty");

      // Empty investment asset
      await expect(
        send(
          sharesRequestor,
          'requestShares',
          [
            fund.hub.options.address,
            EMPTY_ADDRESS,
            basicRequest.maxInvestmentAmount,
            basicRequest.sharesQuantity
          ],
          { ...basicRequest.txOpts, value: basicRequest.amguValue }
        )
      ).rejects.toThrowFlexible("_investmentAsset cannot be empty");

      await expect(
        createRequest(fund.hub.options.address, badRequestMaxInvestmentAmount)
      ).rejects.toThrowFlexible("_maxInvestmentAmount must be > 0");
      await expect(
        createRequest(fund.hub.options.address, badRequestSharesQuantity)
      ).rejects.toThrowFlexible("_sharesQuantity must be > 0");
    });

    it('does NOT allow request with insufficient token allowance', async() => {
      const badApprovalAmount = new BN(basicRequest.maxInvestmentAmount).sub(new BN(1)).toString();
      await send(
        basicRequest.investmentAssetContract,
        'approve',
        [sharesRequestor.options.address, badApprovalAmount],
        basicRequest.txOpts
      );
      await expect(
        send(
          sharesRequestor,
          'requestShares',
          [
            fund.hub.options.address,
            basicRequest.investmentAssetContract.options.address,
            basicRequest.maxInvestmentAmount,
            basicRequest.sharesQuantity
          ],
          { ...basicRequest.txOpts, value: basicRequest.amguValue }
        )
      ).rejects.toThrow();
    });

    it('does NOT allow request for an unallowed investment asset', async() => {
      const request = { ...basicRequest, investmentAssetContract: mln };
      await expect(
        createRequest(fund.hub.options.address, request)
      ).rejects.toThrowFlexible("_investmentAsset not allowed");
    });

    it('does NOT allow request for a shutdown fund', async() => {
      await send(fundFactory, 'shutDownFund', [fund.hub.options.address], defaultTxOpts);
      await expect(
        createRequest(fund.hub.options.address, basicRequest)
      ).rejects.toThrowFlexible("Fund is not active");
    });
  });

  // describe('Good Request: initial investment', () => {})

  describe('Good Request: nth investment', () => {
    let fund;
    let incentiveFee;
    let preTxBlock, preSharesRequestorEth, postSharesRequestorEth;

    beforeAll(async () => {
      const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY], true);
      const contracts = deployed.contracts;
      const fundFactory = contracts[CONTRACT_NAMES.FUND_FACTORY];

      // @dev include initial investment so test doesn't bypass Request creation
      fund = await setupFundWithParams({
        defaultTokens: [weth.options.address],
        initialInvestment: {
          contribAmount: toWei('1', 'ether'),
          investor: deployer,
          tokenContract: weth
        },
        quoteToken: weth.options.address,
        fundFactory
      });

      incentiveFee = await call(registry, 'incentive');
    });

    it('succeeds', async() => {
      await send(
        basicRequest.investmentAssetContract,
        'approve',
        [sharesRequestor.options.address, basicRequest.maxInvestmentAmount],
        basicRequest.txOpts
      );

      preTxBlock = await web3.eth.getBlockNumber();

      preSharesRequestorEth = new BN(await web3.eth.getBalance(sharesRequestor.options.address));

      await expect(
        send(
          sharesRequestor,
          'requestShares',
          [
            fund.hub.options.address,
            basicRequest.investmentAssetContract.options.address,
            basicRequest.maxInvestmentAmount,
            basicRequest.sharesQuantity
          ],
          { ...basicRequest.txOpts, value: basicRequest.amguValue }
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
      expect(request.investmentAsset).toBe(basicRequest.investmentAssetContract.options.address);
      expect(request.maxInvestmentAmount).toBe(basicRequest.maxInvestmentAmount);
      expect(request.sharesQuantity).toBe(basicRequest.sharesQuantity);
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
      expect(eventValues.investmentAsset).toBe(
        basicRequest.investmentAssetContract.options.address
      );
      expect(eventValues.maxInvestmentAmount).toBe(basicRequest.maxInvestmentAmount);
      expect(eventValues.sharesQuantity).toBe(basicRequest.sharesQuantity);
      expect(eventValues.incentiveFee).toBe(incentiveFee);
    });
  });

  describe('Multiple requests', () => {
    let fund;
    let preRequestCount;

    beforeAll(async () => {
      const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY], true);
      const contracts = deployed.contracts;
      const fundFactory = contracts[CONTRACT_NAMES.FUND_FACTORY];

      // @dev include initial investment so test doesn't bypass Request creation
      fund = await setupFundWithParams({
        defaultTokens: [weth.options.address],
        initialInvestment: {
          contribAmount: toWei('1', 'ether'),
          investor: deployer,
          tokenContract: weth
        },
        quoteToken: weth.options.address,
        fundFactory
      });

      preRequestCount = (await call(sharesRequestor, 'getFundsRequestedSet', [basicRequest.owner])).length;
      await createRequest(fund.hub.options.address, basicRequest);
    });

    it('does NOT allow more than one request per fund', async() => {
      await expect(
        createRequest(fund.hub.options.address, basicRequest)
      ).rejects.toThrowFlexible("Only one request can exist (per fund)");
    });

    it('allows requests for multiple funds', async() => {
      const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY], true);
      const contracts = deployed.contracts;
      const fundFactory = contracts[CONTRACT_NAMES.FUND_FACTORY];

      const fund2 = await setupFundWithParams({
        defaultTokens: [weth.options.address],
        initialInvestment: {
          contribAmount: toWei('1', 'ether'),
          investor: deployer,
          tokenContract: weth
        },
        quoteToken: weth.options.address,
        fundFactory
      });

      await expect(
        createRequest(fund2.hub.options.address, basicRequest)
      ).resolves.not.toThrow();

      const requestCount = (
        await call(sharesRequestor, 'getFundsRequestedSet', [basicRequest.owner])
      ).length;
      expect(Number(requestCount)).toBe(Number(preRequestCount) + 2);
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
    new BN(request.maxInvestmentAmount).sub(investorTokenBalance);
  if (investorTokenShortfall.gt(new BN(0))) {
    await send(
      request.investmentAssetContract,
      'transfer',
      [request.owner, investorTokenShortfall.toString()]
    )
  }

  // Approve and send request
  await send(
    request.investmentAssetContract,
    'approve',
    [sharesRequestor.options.address, request.maxInvestmentAmount],
    request.txOpts
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
    { ...request.txOpts, value: request.amguValue }
  );
};

const executeRequest = async (fundAddress, request, tokenPriceData) => {
  await delay(1000);
  await updateTestingPriceFeed(
    tokenPriceData.priceSource,
    tokenPriceData.tokenAddresses,
    tokenPriceData.tokenPrices
  );
  return send(
    sharesRequestor,
    'executeRequestFor',
    [request.owner, fundAddress],
    { ...request.txOpts, value: request.amguValue }
  );
};
