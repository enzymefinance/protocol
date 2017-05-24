pragma solidity ^0.4.11;

import "./dependencies/ERC20.sol";
import {ERC20 as Shares} from "./dependencies/ERC20.sol";
import "./assets/AssetProtocol.sol";
import "./dependencies/DBC.sol";
import "./dependencies/Owned.sol";
import "./dependencies/SafeMath.sol";
import "./universe/UniverseProtocol.sol";
import "./participation/SubscribeProtocol.sol";
import "./participation/RedeemProtocol.sol";
import "./datafeeds/PriceFeedProtocol.sol";
import "./fees/ManagementFeeProtocol.sol";
import "./fees/PerformanceFeeProtocol.sol";
import "./riskmgmt/RiskMgmtProtocol.sol";
import "./exchange/ExchangeProtocol.sol";
import "./CoreProtocol.sol";

/// @title Core Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Simple core
contract Core is DBC, Owned, Shares, SafeMath, CoreProtocol {

    // TYPES

    struct Calculations {
        uint gav;
        uint managementFee;
        uint performanceFee;
        uint unclaimedFees;
        uint nav;
        uint sharePrice;
        uint totalSupply;
        uint timestamp;
    }

    struct Modules {
        UniverseProtocol universe;
        SubscribeProtocol subscribe;
        RedeemProtocol redeem;
        RiskMgmtProtocol riskmgmt;
        ManagementFeeProtocol management_fee;
        PerformanceFeeProtocol performance_fee;
    }

    // FIELDS

    // Constant asset specific fields
    string public name;
    string public symbol;
    uint public decimals;
    // Fields that are only changed in constructor
    address public referenceAsset;
    address public melonAsset;
    // Fields that can be changed by functions
    Modules public module;
    Calculations public atLastPayout;

    // EVENTS

    event SharesCreated(address indexed byParticipant, uint atTimestamp, uint numShares); // Participation
    event SharesAnnihilated(address indexed byParticipant, uint atTimestamp, uint numShares);
    event PortfolioContent(uint assetHoldings, uint assetPrice, uint assetDecimals); // Calcualtions
    event SpendingApproved(address ofToken, address onExchange, uint amount); // Managing
    event FeeUpdate(uint atTimestamp, uint managementFee, uint performanceFee);
    event CalculationUpdate(uint atTimestamp, uint nav, uint sharePrice);

    // PRE, POST, INVARIANT CONDITIONS

    function notZero(uint x) internal returns (bool) { return x != 0; }
    function balancesOfHolderAtLeast(address ofHolder, uint x) internal returns (bool) { return balances[ofHolder] >= x; }

    // CONSTANT METHDOS

    function getReferenceAsset() constant returns (address) { return referenceAsset; }
    function getUniverseAddress() constant returns (address) { return module.universe; }
    function getDecimals() constant returns (uint) { return decimals; }

    // CONSTANT METHODS - ACCOUNTING

    /// Pre: Decimals in assets must be equal to decimals in PriceFeed for all entries in Universe
    /// Post: Gross asset value denominated in referenceAsset in baseunit of [10 ** decimals]
    function calcGav() constant returns (uint gav) {
        /* Rem 1:
         *  All prices are relative to the referenceAsset price. The referenceAsset must be
         *  equal to quoteAsset of corresponding PriceFeed.
         * Rem 2:
         *  For this version, the referenceAsset is set as EtherToken.
         *  The price of the EtherToken relative to Ether is defined to always be equal to one.
         * Rem 3:
         *  price input unit: [Wei / ( Asset * 10**decimals )] == Base unit amount of referenceAsset per base unit of asset
         *  coreHoldings input unit: [Asset * 10**decimals] == Base unit amount of asset this core holds
         *    ==> coreHoldings * price == value of asset holdings of this core relative to referenceAsset price.
         *  where 0 <= decimals <= 18 and decimals is a natural number.
         */
        uint numAssignedAssets = module.universe.numAssignedAssets();
        for (uint i = 0; i < numAssignedAssets; ++i) {
            // Holdings
            address ofAsset = address(module.universe.assetAt(i));
            AssetProtocol Asset = AssetProtocol(ofAsset);
            uint assetHoldings = Asset.balanceOf(this); // Amount of asset base units this core holds
            uint assetDecimals = Asset.getDecimals();
            // Price
            PriceFeedProtocol Price = PriceFeedProtocol(address(module.universe.priceFeedAt(i)));
            address quoteAsset = Price.getQuoteAsset();
            assert(referenceAsset == quoteAsset); // See Remark 1
            uint assetPrice;
            if (ofAsset == quoteAsset) {
              assetPrice = 1 * 10 ** assetDecimals; // See Remark 2
            } else {
              assetPrice = Price.getPrice(ofAsset); // Asset price given quoted to referenceAsset (and 'quoteAsset') price
            }
            gav = safeAdd(gav, assetHoldings * assetPrice / (10 ** assetDecimals)); // Sum up product of asset holdings of this core and asset prices
            PortfolioContent(assetHoldings, assetPrice, assetDecimals);
        }
    }

    /// Pre: Non-zero share supply,
    /// Post: Share price denominated in referenceAsset in baseunit of [10 ** decimals] per Share
    function calcValuePerShare(uint value)
        constant
        pre_cond(notZero(totalSupply))
        returns (uint sharePrice)
    {
        sharePrice = 10 ** decimals * value / totalSupply;
    }

    /// Pre: Gross asset value has been calculated
    /// Post: The sum and its individual parts of all applicable fees denominated in referenceAsset in baseunit of [10 ** decimals]
    function calcUnclaimedFees(uint gav) constant returns (uint managementFee, uint performanceFee, uint unclaimedFees) {
        uint timeDifference = safeSub(now, atLastPayout.timestamp);
        managementFee = module.management_fee.calculateFee(timeDifference, gav);
        performanceFee = 0;
        if (totalSupply != 0) {
            uint currSharePrice = calcValuePerShare(gav);
            if (currSharePrice - atLastPayout.sharePrice > 0)
              performanceFee = module.performance_fee.calculateFee(currSharePrice - atLastPayout.sharePrice, totalSupply);
        }
        unclaimedFees = safeAdd(managementFee, performanceFee);
    }

    /// Pre: Gross asset value and sum of all applicable and unclaimed fees has been calculated
    /// Post: Net asset value denominated in referenceAsset in baseunit of [10 ** decimals]
    function calcNav(uint gav, uint unclaimedFees) constant returns (uint nav) { nav = safeSub(gav, unclaimedFees); }

    /// Pre: Non-zero share supply,
    /// Post: Gav, managementFee, performanceFee, unclaimedFees, nav, sharePrice denominated in referenceAsset in baseunit of [10 ** decimals]
    function performCalculations() constant returns (uint, uint, uint, uint, uint, uint) {
        uint gav = calcGav(); // Reflects value indepentent of fees
        var (managementFee, performanceFee, unclaimedFees) = calcUnclaimedFees(gav);
        uint nav = calcNav(gav, unclaimedFees);
        uint sharePrice = calcValuePerShare(nav);
        return (gav, managementFee, performanceFee, unclaimedFees, nav, sharePrice);
    }

    // NON-CONSTANT METHODS

    function Core(
        address ofManager,
        string withName,
        string withSymbol,
        uint withDecimals,
        address ofUniverse,
        address ofSubscribe,
        address ofRedeem,
        address ofRiskMgmt,
        address ofManagmentFee,
        address ofPerformanceFee
    ) {
        owner = ofManager;
        name = withName;
        symbol = withSymbol;
        decimals = withDecimals;
        atLastPayout = Calculations({
            gav: 0,
            managementFee: 0,
            performanceFee: 0,
            unclaimedFees: 0,
            nav: 0,
            sharePrice: 10 ** decimals, // initialSharePrice
            totalSupply: totalSupply,
            timestamp: now,
        });
        module.universe = UniverseProtocol(ofUniverse);
        referenceAsset = module.universe.getReferenceAsset();
        melonAsset = module.universe.getMelonAsset();
        // Assert referenceAsset is equal to quoteAsset in all assigned PriceFeeds
        uint numAssignedAssets = module.universe.numAssignedAssets();
        for (uint i = 0; i < numAssignedAssets; ++i) {
            PriceFeedProtocol Price = PriceFeedProtocol(address(module.universe.priceFeedAt(i)));
            address quoteAsset = Price.getQuoteAsset();
            require(referenceAsset == quoteAsset);
        }
        module.subscribe = SubscribeProtocol(ofSubscribe);
        module.redeem = RedeemProtocol(ofRedeem);
        module.riskmgmt = RiskMgmtProtocol(ofRiskMgmt);
        module.management_fee = ManagementFeeProtocol(ofManagmentFee);
        module.performance_fee = PerformanceFeeProtocol(ofPerformanceFee);
    }

    // NON-CONSTANT METHODS - PARTICIPATION

    /// Pre: Approved spending of all assets with non-empty asset holdings; Independent of running price feed!
    /// Post: Transfer ownership percentage of all assets from Investor to Core and create shareAmount.
    function createShares(uint shareAmount) { createSharesOnBehalf(msg.sender, shareAmount); }

    /// Pre: Every holder of shares at any time; Independent of running price feed!
    /// Post: Transfer percentage of all assets from Core to Investor and annihilate shareAmount of shares.
    function annihilateShares(uint shareAmount) { annihilateSharesOnBehalf(msg.sender, shareAmount); }

    /// Pre: Approved spending of all assets with non-empty asset holdings;
    /// Post: Transfer percentage of all assets from Core to Investor and annihilate shareAmount of shares.
    function createSharesOnBehalf(address recipient, uint shareAmount)
        pre_cond(notZero(shareAmount))
    {
        allocateSlice(recipient, shareAmount);
        SharesCreated(recipient, now, shareAmount);
    }

    /// Pre: Recipient owns shares
    /// Post: Transfer percentage of all assets from Core to Investor and annihilate shareAmount of shares.
    function annihilateSharesOnBehalf(address recipient, uint shareAmount)
        pre_cond(balancesOfHolderAtLeast(recipient, shareAmount))
    {
        separateSlice(recipient, shareAmount);
        SharesAnnihilated(recipient, now, shareAmount);
    }

    /// Pre: Allocation: Approve spending for all non empty coreHoldings of Assets
    /// Post: Transfer ownership percentage of all assets to/from Core
    function allocateSlice(address recipient, uint shareAmount)
        internal
    {
        if (totalSupply == 0) { // Iff all coreHoldings are zero
            /* By definition for zero totalSupply of shares:
             *  sharePrice == initialSharePrice (1)
             *  hence for actualValue == sharePrice * shareAmount / initialSharePrice == shareAmount unsing (1) above
             */
            assert(AssetProtocol(referenceAsset).transferFrom(msg.sender, this, shareAmount)); // Send msg.sender to this core
        } else {
            uint numAssignedAssets = module.universe.numAssignedAssets();
            for (uint i = 0; i < numAssignedAssets; ++i) {
                AssetProtocol Asset = AssetProtocol(address(module.universe.assetAt(i)));
                uint coreHoldings = Asset.balanceOf(this); // Amount of asset base units this core holds
                if (coreHoldings == 0) continue;
                uint allocationAmount = coreHoldings * shareAmount / totalSupply; // ownership percentage of msg.sender
                uint investorHoldings = Asset.balanceOf(msg.sender); // Amount of asset base units this core holds
                require(investorHoldings >= allocationAmount);
                // Transfer allocationAmount of Assets
                assert(Asset.transferFrom(msg.sender, this, allocationAmount)); // Send funds from investor to core
            }
        }
        // Accounting
        balances[recipient] = safeAdd(balances[recipient], shareAmount);
        totalSupply = safeAdd(totalSupply, shareAmount);
    }

    /// Pre: Allocation: Approve spending for all non empty coreHoldings of Assets
    /// Post: Transfer ownership percentage of all assets to/from Core
    function separateSlice(address recipient, uint shareAmount)
        internal
    {
        // Current Value
        uint oldTotalSupply = totalSupply;
        // Update accounting before external calls to prevent reentrancy
        balances[recipient] = safeSub(balances[recipient], shareAmount);
        totalSupply = safeSub(totalSupply, shareAmount);
        // Transfer separationAmount of Assets
        uint numAssignedAssets = module.universe.numAssignedAssets();
        for (uint i = 0; i < numAssignedAssets; ++i) {
            AssetProtocol Asset = AssetProtocol(address(module.universe.assetAt(i)));
            uint coreHoldings = Asset.balanceOf(this); // EXTERNAL CALL: Amount of asset base units this core holds
            uint separationAmount = coreHoldings * shareAmount / oldTotalSupply; // ownership percentage of msg.sender
            if (coreHoldings == 0) continue;
            // EXTERNAL CALL
            assert(Asset.transfer(recipient, separationAmount)); // EXTERNAL CALL: Send funds from core to investor
        }
    }

    // NON-CONSTANT METHODS - EXCHANGE

    /// Pre: Sufficient balance and spending has been approved
    /// Post: Make offer on selected Exchange
    function makeOrder(ExchangeProtocol onExchange,
        uint sell_how_much, ERC20 sell_which_token,
        uint buy_how_much,  ERC20 buy_which_token
    )
        pre_cond(isOwner())
        pre_cond(module.riskmgmt.isExchangeMakePermitted(onExchange,
            sell_how_much, sell_which_token,
            buy_how_much, buy_which_token)
        )
        returns (uint id)
    {
        requireIsWithinKnownUniverse(onExchange, sell_which_token, buy_which_token);
        approveSpending(sell_which_token, onExchange, sell_how_much);
        id = onExchange.make(sell_how_much, sell_which_token, buy_how_much, buy_which_token);
    }

    /// Pre: Active offer (id) and valid buy amount on selected Exchange
    /// Post: Take offer on selected Exchange
    function takeOrder(ExchangeProtocol onExchange, uint id, uint wantedBuyAmount)
        pre_cond(isOwner())
        returns (bool)
    {
        // Inverse variable terminology! Buying what another person is selling
        var (
            offeredBuyAmount, offeredBuyToken,
            offeredSellAmount, offeredSellToken
        ) = onExchange.getOrder(id);
        require(wantedBuyAmount <= offeredBuyAmount);
        requireIsWithinKnownUniverse(onExchange, offeredSellToken, offeredBuyToken);
        var orderOwner = onExchange.getOwner(id);
        require(module.riskmgmt.isExchangeTakePermitted(onExchange,
            offeredSellAmount, offeredSellToken,
            offeredBuyAmount, offeredBuyToken,
            orderOwner)
        );
        uint wantedSellAmount = safeMul(wantedBuyAmount, offeredSellAmount) / offeredBuyAmount;
        approveSpending(offeredSellToken, onExchange, wantedSellAmount);
        return onExchange.take(id, wantedBuyAmount);
    }

    /// Pre: Active offer (id) with owner of this contract on selected Exchange
    /// Post: Cancel offer on selected Exchange
    function cancelOrder(ExchangeProtocol onExchange, uint id)
        pre_cond(isOwner())
        returns (bool)
    {
        return onExchange.cancel(id);
    }

    /// Pre: Universe has been defined
    /// Post: Whether buying and selling of tokens are allowed at given exchange
    function requireIsWithinKnownUniverse(address onExchange, address sell_which_token, address buy_which_token)
        internal
    {
        // Asset pair defined in Universe and contains referenceAsset
        require(module.universe.assetAvailability(buy_which_token));
        require(module.universe.assetAvailability(sell_which_token));
        require(buy_which_token != referenceAsset); // Pair must consists of diffrent assets
        require(buy_which_token == referenceAsset || sell_which_token == referenceAsset); // One asset must be referenceAsset
        // Exchange assigned to tokens in Universe
        require(onExchange == module.universe.assignedExchange(buy_which_token));
        require(onExchange == module.universe.assignedExchange(sell_which_token));
    }

    /// Pre: To Exchange needs to be approved to spend Tokens on the Managers behalf
    /// Post: Token specific exchange as registered in universe, approved to spend ofToken
    function approveSpending(ERC20 ofToken, address onExchange, uint amount)
        internal
    {
        assert(ofToken.approve(onExchange, amount));
        SpendingApproved(ofToken, onExchange, amount);
    }

    // NON-CONSTANT METHODS - FEES

    /// Pre: Only owner
    /// Post: Unclaimed fees of manager are converted into shares of this fund.
    function convertUnclaimedFees()
        pre_cond(isOwner())
    {
        var (gav, managementFee, performanceFee, unclaimedFees, nav, sharePrice) = performCalculations();

        // Accounting: Allocate unclaimedFees to owner
        uint shareAmount = totalSupply * unclaimedFees / gav;
        balances[owner] = safeAdd(balances[owner], shareAmount);
        totalSupply = safeAdd(totalSupply, shareAmount);

        // Update Calculations
        atLastPayout = Calculations({
          gav: gav,
          managementFee: managementFee,
          performanceFee: managementFee,
          unclaimedFees: unclaimedFees,
          nav: nav,
          sharePrice: sharePrice,
          totalSupply: totalSupply,
          timestamp: now,
        });


        FeeUpdate(now, managementFee, performanceFee);
        CalculationUpdate(now, nav, sharePrice);
    }
}
