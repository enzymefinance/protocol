import { BN, toWei } from 'web3-utils';
import { call, send } from '~/deploy/utils/deploy-contract';
import { CONTRACT_NAMES, EMPTY_ADDRESS } from '~/tests/utils/constants';
import { setupFundWithParams } from '~/tests/utils/fund';
import { delay } from '~/tests/utils/time';
import { getDeployed } from '~/tests/utils/getDeployed';
import { updateKyberPriceFeed } from '~/tests/utils/updateKyberPriceFeed';
import * as mainnetAddrs from '~/mainnet_thirdparty_contracts';

let web3;
let deployer, investor, thirdPartyCaller;
let defaultTxOpts, investorTxOpts, gasPrice;
let mln, weth, fundFactory;
let priceSource, registry, sharesRequestor;
let basicRequest;
let kyberProxy;

beforeAll(async () => {
  web3 = await startChain();
  [deployer, investor, thirdPartyCaller] = await web3.eth.getAccounts();
  gasPrice = toWei('2', 'gwei');
  defaultTxOpts = { from: deployer, gas: 8000000, gasPrice };
  investorTxOpts = { ...defaultTxOpts, from: investor };

  fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY, web3);
  priceSource = getDeployed(CONTRACT_NAMES.KYBER_PRICEFEED, web3);
  kyberProxy = getDeployed(CONTRACT_NAMES.KYBER_NETWORK_PROXY, web3, mainnetAddrs.kyber.KyberNetworkProxy);
  weth = getDeployed(CONTRACT_NAMES.WETH, web3, mainnetAddrs.tokens.WETH);
  mln = getDeployed(CONTRACT_NAMES.MLN, web3, mainnetAddrs.tokens.MLN);
  registry = getDeployed(CONTRACT_NAMES.REGISTRY, web3);
  sharesRequestor = getDeployed(CONTRACT_NAMES.SHARES_REQUESTOR, web3);

  // Send a surplus of maxInvestmentAmount to ensure refund
  basicRequest = {
    owner: investor,
    investmentAssetContract: weth,
    maxInvestmentAmount: toWei('1.1', 'ether'),
    sharesQuantity: toWei('1', 'ether'),
    txOpts: investorTxOpts,
    amguValue: toWei('0.1', 'ether')
  };
});

describe('__cancelRequestFor', () => {
  describe('cancelRequestFor (third party)', () => {
    let fund;
  
    beforeAll(async () => {
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

    it('does NOT allow cancellation when no cancellation condition is met', async () => {
      await expect(
        send(
          sharesRequestor,
          'cancelRequestFor',
          [basicRequest.owner, fund.hub.options.address],
          { ...defaultTxOpts, from: thirdPartyCaller },
          web3
        )
      ).rejects.toThrowFlexible('No cancellation condition was met');
    });
  
    it('allows cancellation when a fund is shutdown', async () => {
      await send(fund.hub, 'shutDownFund', [], defaultTxOpts, web3);

      await expect(
        send(
          sharesRequestor,
          'cancelRequestFor',
          [basicRequest.owner, fund.hub.options.address],
          { ...defaultTxOpts, from: thirdPartyCaller },
          web3
        )
      ).resolves.not.toThrow();
    });
  });

  describe('cancellation condition', () => {
    describe('healthy fund', () => {
      let fund;
    
      beforeAll(async () => {
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
          web3
        });
    
        await createRequest(fund.hub.options.address, basicRequest);
      });

      it('does NOT allow cancellation when a cancellation condition is not met', async () => {
        await expect(
          send(
            sharesRequestor,
            'cancelRequest',
            [fund.hub.options.address],
            basicRequest.txOpts,
            web3
          )
        ).rejects.toThrowFlexible('No cancellation condition was met');
      });
    });
  
    describe('fund shutdown', () => {
      let fund;
    
      beforeAll(async () => {
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

      it('does NOT allow cancellation when a cancellation condition is not met', async () => {
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

      it('allows cancellation when a fund is shutdown', async () => {
        await send(fund.hub, 'shutDownFund', [], defaultTxOpts, web3);
  
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
    })

    describe('invalid price of investment asset', () => {
      let fund;
    
      beforeAll(async () => {
        // @dev include initial investment so test doesn't bypass Request creation
        fund = await setupFundWithParams({
          defaultTokens: [weth.options.address, mln.options.address],
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

      it('does NOT allow cancellation when a cancellation condition is not met', async () => {
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

      it('does NOT allow cancellation when a NON-investmentAsset has an invalid price', async () => {
        await updateKyberPriceFeed(priceSource, web3);
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

      it.only('allows cancellation when an investmentAsset has an invalid price', async () => {
        // TODO: set an invalid price here
        await send(
          kyberProxy,
          'swapEtherToToken',
          [mln.options.address, '1'],
          { ...defaultTxOpts, value: toWei('10', 'ether'), gas: 8000000 },
          web3
        );
        await updateKyberPriceFeed(priceSource, web3);
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
    })
  });

  describe('cancelRequest for self', () => {
    let fund;
    let incentiveFee;
    let requestTxBlock, cancelTxBlock;
  
    beforeAll(async () => {
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
      requestTxBlock = await web3.eth.getBlockNumber();

      incentiveFee = await call(registry, 'incentive');

      // Shut down the fund so cancellation condition passes
      await send(fund.hub, 'shutDownFund', [], defaultTxOpts, web3);
    });
  
    it('succeeds', async () => {  
      await expect(
        send(
          sharesRequestor,
          'cancelRequest',
          [fund.hub.options.address],
          basicRequest.txOpts,
          web3
        )
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
      fund = await setupFundWithParams({
        defaultTokens: [weth.options.address],
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
          { ...basicRequest.txOpts, value: basicRequest.amguValue },
          web3
        )
      ).rejects.toThrowFlexible('No request exists for fund');
    });

    it('does NOT allow request execution without a price update', async () => {
      await createRequest(fund.hub.options.address, basicRequest);

      await expect (
        send(
          sharesRequestor,
          'executeRequestFor',
          [basicRequest.owner, fund.hub.options.address],
          { ...basicRequest.txOpts, value: basicRequest.amguValue },
          web3
        )
      ).rejects.toThrowFlexible('Price has not updated since request');      
    });

    it('does NOT allow request execution when investment asset price is 0', async () => {
      // TODO: set price of investment asset to zero
      await expect(
        executeRequest(
          fund.hub.options.address,
          basicRequest
        )        
      ).rejects.toThrowFlexible('Price not valid');      
    });
  });

  describe('executeRequestFor (third party)', () => {
    let fund;
    let request, txReceipt;
    let expectedSharesCost;
    let preTxBlock, preCallerEth, postCallerEth, preOwnerShares, postOwnerShares;
    let preOwnerInvestmentAssetBalance, postOwnerInvestmentAssetBalance;

    beforeAll(async () => {
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
        {...basicRequest, txOpts: thirdPartyCallerTxOpts}
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
        basicRequest
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
    let fund;

    beforeAll(async () => {
      fund = await setupFundWithParams({
        defaultTokens: [weth.options.address],
        quoteToken: weth.options.address,
        fundFactory,
        manager: deployer,
        web3
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
          { ...basicRequest.txOpts, value: basicRequest.amguValue },
          web3
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
          { ...basicRequest.txOpts, value: basicRequest.amguValue },
          web3
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
        basicRequest.txOpts,
        web3
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
          { ...basicRequest.txOpts, value: basicRequest.amguValue },
          web3
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
      await send(fund.hub, 'shutDownFund', [], defaultTxOpts, web3);
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

      incentiveFee = await call(registry, 'incentive');
    });

    it('succeeds', async() => {
      await send(
        basicRequest.investmentAssetContract,
        'approve',
        [sharesRequestor.options.address, basicRequest.maxInvestmentAmount],
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
            basicRequest.investmentAssetContract.options.address,
            basicRequest.maxInvestmentAmount,
            basicRequest.sharesQuantity
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

      preRequestCount = (await call(sharesRequestor, 'getFundsRequestedSet', [basicRequest.owner])).length;
      await createRequest(fund.hub.options.address, basicRequest);
    });

    it('does NOT allow more than one request per fund', async() => {
      await expect(
        createRequest(fund.hub.options.address, basicRequest)
      ).rejects.toThrowFlexible("Only one request can exist (per fund)");
    });

    it('allows requests for multiple funds', async() => {
      const fund2 = await setupFundWithParams({
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

const executeRequest = async (fundAddress, request) => {
  await delay(1000);
  await updateKyberPriceFeed(priceSource, web3);
  return send(
    sharesRequestor,
    'executeRequestFor',
    [request.owner, fundAddress],
    { ...request.txOpts, value: request.amguValue },
    web3
  );
};
