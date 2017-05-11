pragma solidity ^0.4.11;

import "./dependencies/ERC20.sol";
import {ERC20 as Shares} from "./dependencies/ERC20.sol";
import "./assets/AssetProtocol.sol";
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
contract Core is Shares, SafeMath, Owned, CoreProtocol {

    // TYPES

    struct Calculations { // last time creation/annihilation of shares happened.
        uint nav;
        uint delta;
        uint sharePrice;
        uint sharesSupply;
        uint atTimestamp;
    }

    struct Modules {
        UniverseProtocol universe;
        SubscribeProtocol subscribe;
        RedeemProtocol redeem;
        RiskMgmtProtocol riskmgmt;
        ManagementFeeProtocol management_fee;
        PerformanceFeeProtocol performance_fee;
    }

    struct Properties {}

    // FIELDS

    // Constant token specific fields
    string public name;
    string public symbol;
    uint public decimals;
    uint public initialSharePrice;
    uint public sharePrice;
    uint public unclaimedFees; // Combined total of Management and Performance fees earned by portfolio manager
    // Fields that are only changed in constructor
    address referenceAsset;
    address melonAsset;
    // Fields that can be changed by functions
    Modules module;
    Properties properties;
    Calculations calculated;

    // EVENTS

    event SharesCreated(address indexed byParticipant, uint atTimestamp, uint numShares); // Participation
    event SharesAnnihilated(address indexed byParticipant, uint atTimestamp, uint numShares);
    event Refund(address to, uint value);
    event NotAllocated(address to, uint value);
    event PortfolioContent(uint assetHoldings, uint assetPrice, uint assetDecimals); // Calcualtions
    event CalculationUpdate(uint atTimestamp, uint nav, uint delta);
    event FeeUpdate(uint atTimestamp, uint managementFee, uint performanceFee);
    event SpendingApproved(address ofToken, address onExchange, uint amount); // Managing

    // MODIFIERS

    modifier not_zero(uint x) {
        assert(x != 0);
        _;
    }

    modifier balances_of_holder_at_least(address ofHolder, uint x) {
        assert(balances[ofHolder] >= x);
        _;
    }

    modifier only_subscribe_module() {
        assert(msg.sender == address(module.subscribe));
        _;
    }

    modifier only_redeem_module() {
        assert(msg.sender == address(module.redeem));
        _;
    }

    // CONSTANT METHDOS

    function getReferenceAsset() constant returns (address) { return referenceAsset; }
    function getUniverseAddress() constant returns (address) { return module.universe; }
    function getDecimals() constant returns (uint) { return decimals; }
    function getLastCalculations() constant returns (uint, uint, uint, uint, uint) {
        return (calculated.nav, calculated.delta, calculated.sharePrice, calculated.sharesSupply, calculated.atTimestamp);
    }

    UniverseProtocol universe;
    SubscribeProtocol subscribe;
    RedeemProtocol redeem;
    RiskMgmtProtocol riskmgmt;
    ManagementFeeProtocol management_fee;
    PerformanceFeeProtocol performance_fee;

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
        initialSharePrice = 10 ** decimals;
        sharePrice = initialSharePrice;
        calculated = Calculations({ nav: 0, delta: initialSharePrice, sharePrice: initialSharePrice, sharesSupply: totalSupply, atTimestamp: now });
        module.universe = UniverseProtocol(ofUniverse);
        referenceAsset = module.universe.getReferenceAsset();
        melonAsset = module.universe.getMelonAsset();
        // Assert referenceAsset is equal to quoteAsset in all assigned PriceFeeds
        uint numAssignedAssets = module.universe.numAssignedAssets();
        for (uint i = 0; i < numAssignedAssets; ++i) {
            PriceFeedProtocol Price = PriceFeedProtocol(address(module.universe.priceFeedAt(i)));
            address quoteAsset = Price.getQuoteAsset();
            assert(referenceAsset == quoteAsset);
        }
        module.subscribe = SubscribeProtocol(ofSubscribe);
        module.redeem = RedeemProtocol(ofRedeem);
        module.riskmgmt = RiskMgmtProtocol(ofRiskMgmt);
        module.management_fee = ManagementFeeProtocol(ofManagmentFee);
        module.performance_fee = PerformanceFeeProtocol(ofPerformanceFee);
    }

    /// Pre: Needed to receive Ether from EtherToken Contract
    /// Post: Receive Either directly
    function() payable {}

    // NON-CONSTANT METHODS - PARTICIPATION

    /// Pre: Approved spending of all assets with non-empty asset holdings; Independent of running price feed!
    /// Post: Transfer ownership percentage of all assets from Investor to Core and create shareAmount.
    function createShares(uint shareAmount) { createSharesOnBehalf(msg.sender, shareAmount); }

    /// Pre: Approved spending of all assets with non-empty asset holdings;
    /// Post: Transfer percentage of all assets from Core to Investor and annihilate shareAmount of shares.
    function createSharesOnBehalf(address recipient, uint shareAmount)
        not_zero(shareAmount)
    {
        allocateSlice(recipient, shareAmount);
        SharesCreated(recipient, now, shareAmount);
    }

    /// Pre: Allocation: Approve spending for all non empty coreHoldings of Assets
    /// Post: Transfer ownership percentage of all assets to/from Core
    function allocateSlice(address recipient, uint shareAmount)
        internal
    {
        calcSharePrice();
        if (calculated.nav == 0 && calculated.delta == initialSharePrice) { // Iff all coreHoldings are zero
            // Assumption sharePrice === initialSharePrice
            //  hence actualValue == shareAmount with actualValue = sharePrice * shareAmount / initialSharePrice
            assert(AssetProtocol(referenceAsset).transferFrom(msg.sender, this, shareAmount)); // Send funds from core to investor
        } else {
            // Transfer ownershipPercentage of Assets
            uint numAssignedAssets = module.universe.numAssignedAssets();
            for (uint i = 0; i < numAssignedAssets; ++i) {
                AssetProtocol Asset = AssetProtocol(address(module.universe.assetAt(i)));
                uint coreHoldings = Asset.balanceOf(this); // Amount of asset base units this core holds
                uint allocationPercentage = coreHoldings * shareAmount / totalSupply; // ownership percentage of msg.sender
                if (coreHoldings == 0) continue;
                assert(Asset.transferFrom(msg.sender, this, allocationPercentage)); // Send funds from investor to core
            }
        }
        // Accounting
        balances[recipient] = safeAdd(balances[recipient], shareAmount);
        totalSupply = safeAdd(totalSupply, shareAmount);
    }

    /// Pre: Every holder of shares at any time; Independent of running price feed!
    /// Post: Transfer percentage of all assets from Core to Investor and annihilate shareAmount of shares.
    function annihilateShares(uint shareAmount) { annihilateSharesOnBehalf(msg.sender, shareAmount); }

    /// Pre: Recipient owns shares
    /// Post: Transfer percentage of all assets from Core to Investor and annihilate shareAmount of shares.
    function annihilateSharesOnBehalf(address recipient, uint shareAmount)
        balances_of_holder_at_least(recipient, shareAmount)
    {
        separateSlice(recipient, shareAmount);
        SharesAnnihilated(recipient, now, shareAmount);
    }

    /// Pre: Allocation: Approve spending for all non empty coreHoldings of Assets
    /// Post: Transfer ownership percentage of all assets to/from Core
    function separateSlice(address recipient, uint shareAmount)
        internal
    {
        calcSharePrice();
        // Transfer ownershipPercentage of Assets
        uint numAssignedAssets = module.universe.numAssignedAssets();
        for (uint i = 0; i < numAssignedAssets; ++i) {
            AssetProtocol Asset = AssetProtocol(address(module.universe.assetAt(i)));
            uint coreHoldings = Asset.balanceOf(this); // Amount of asset base units this core holds
            uint ownershipPercentage = coreHoldings * shareAmount / totalSupply; // ownership percentage of msg.sender
            if (coreHoldings == 0) continue;
            assert(Asset.transfer(recipient, ownershipPercentage)); // Send funds from core to investor
        }
        // Accounting
        balances[recipient] = safeSub(balances[recipient], shareAmount);
        totalSupply = safeSub(totalSupply, shareAmount);
    }

    // NON-CONSTANT METHODS - EXCHANGE

    /// Pre: Sufficient balance and spending has been approved
    /// Post: Make offer on selected Exchange
    function makeOrder(ExchangeProtocol onExchange,
        uint sell_how_much, ERC20 sell_which_token,
        uint buy_how_much,  ERC20 buy_which_token
    )
        only_owner
        returns (uint id)
    {
        assert(isWithinKnownUniverse(onExchange, sell_which_token, buy_which_token));
        assert(module.riskmgmt.isExchangeMakePermitted(onExchange,
            sell_how_much, sell_which_token,
            buy_how_much, buy_which_token)
        );
        approveSpending(sell_which_token, onExchange, sell_how_much);
        id = onExchange.make(sell_how_much, sell_which_token, buy_how_much, buy_which_token);
    }

    /// Pre: Active offer (id) and valid buy amount on selected Exchange
    /// Post: Take offer on selected Exchange
    function takeOrder(ExchangeProtocol onExchange, uint id, uint wantedBuyAmount)
        only_owner
        returns (bool)
    {
        // Inverse variable terminology! Buying what another person is selling
        var (
            offeredBuyAmount, offeredBuyToken,
            offeredSellAmount, offeredSellToken
        ) = onExchange.getOrder(id);
        assert(wantedBuyAmount <= offeredBuyAmount);
        assert(isWithinKnownUniverse(onExchange, offeredSellToken, offeredBuyToken));
        assert(module.riskmgmt.isExchangeTakePermitted(onExchange,
            offeredSellAmount, offeredSellToken,
            offeredBuyAmount, offeredBuyToken)
        );
        uint wantedSellAmount = safeMul(wantedBuyAmount, offeredSellAmount) / offeredBuyAmount;
        approveSpending(offeredSellToken, onExchange, wantedSellAmount);
        return onExchange.take(id, wantedBuyAmount);
    }

    /// Pre: Active offer (id) with owner of this contract on selected Exchange
    /// Post: Cancel offer on selected Exchange
    function cancelOrder(ExchangeProtocol onExchange, uint id)
        only_owner
        returns (bool)
    {
        return onExchange.cancel(id);
    }

    /// Pre: Universe has been defined
    /// Post: Whether buying and selling of tokens are allowed at given exchange
    function isWithinKnownUniverse(address onExchange, address sell_which_token, address buy_which_token)
        internal
        returns (bool)
    {
        // Asset pair defined in Universe and contains referenceAsset
        assert(module.universe.assetAvailability(buy_which_token));
        assert(module.universe.assetAvailability(sell_which_token));
        assert(buy_which_token == referenceAsset || sell_which_token == referenceAsset);
        // Exchange assigned to tokens in Universe
        assert(onExchange == module.universe.assignedExchange(buy_which_token));
        assert(onExchange == module.universe.assignedExchange(sell_which_token));
        return true;
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

    /// Pre: Price of referenceAsset to melonAsset defined; Manager generated fees
    /// Post: Equivalent value of unclaimedFees sent in MelonToken to Manager
    function payoutEarnings()
        only_owner
        not_zero(unclaimedFees)
    {
        // Price of referenceAsset to melonAsset
        PriceFeedProtocol Price = PriceFeedProtocol(address(module.universe.assignedPriceFeed(melonAsset)));
        uint assetPrice = Price.getPrice(melonAsset); // Asset price given quoted in referenceAsset / melonAsset
        assert(assetPrice != 0);
        // Earnings in referenceAsset, hence unclaimedFees / assetPrice = [melonAsset]
        uint feesToBePaid = unclaimedFees;
        unclaimedFees = 0; // Accounting
        // TODO Payout Earnings
        // Payout earnings in the form a Slice
        // call separateSlice
        assert(AssetProtocol(melonAsset).transfer(msg.sender, feesToBePaid / assetPrice)); // Transfer Ownership of Melon from core to manager
    }

    // NON-CONSTANT METHODS - CORE

    /// Pre: Valid price feed data
    /// Post: Calculate Share Price in Wei and update calculated struct
    function calcSharePrice() returns (uint) {
        return calcDelta();
    }

    /// Pre: Valid price feed data
    /// Post: Delta as a result of current and previous NAV
    function calcDelta() returns (uint delta) {
        var (nav, managementFee, performanceFee, unclaimedFees) = calcNAV();
        // Define or calcualte delta
        if (calculated.nav == 0 || nav == 0) { // First investment not made || First investment made; All funds withdrawn
            delta = 1 ether; // By definition
        } else { // First investment made; Not all funds withdrawn
            delta = calculated.delta * (calculated.sharesSupply * nav) / (calculated.nav * totalSupply);
        }
        // Update Calculations
        // TODO fix sharePrice
        calculated = Calculations({ nav: nav, delta: delta, sharePrice: delta, sharesSupply: totalSupply, atTimestamp: now });
        // Logs
        FeeUpdate(now, managementFee, performanceFee);
        CalculationUpdate(now, nav, delta);
    }

    /// Pre: Valid price feed data
    /// Post: Portfolio Net Asset Value in Wei, managment and performance fee allocated
    function calcNAV() constant returns (uint nav, uint managementFee, uint performanceFee, uint unclaimedFees) {
        uint gav = calcGAV(); // Reflects value indepentent of managment and performance fee
        uint timeDifference = now - calculated.atTimestamp;
        managementFee = module.management_fee.calculateFee(timeDifference, gav);
        performanceFee = 0;
        if (calculated.nav != 0) {
            uint deltaGross = (calculated.delta * gav) / calculated.nav; // Performance (delta) indepentent of managment and performance fees
            uint deltaDifference = deltaGross - calculated.delta;
            performanceFee = module.performance_fee.calculateFee(deltaDifference, gav);
        }
        unclaimedFees = safeAdd(unclaimedFees, safeAdd(managementFee, performanceFee));
        nav = gav - unclaimedFees;
        return (nav, managementFee, performanceFee, unclaimedFees);
    }

    /// Pre: Decimals in Token must be equal to decimals in PriceFeed for all entries in Universe
    /// Post: Portfolio Gross Asset Value in Wei
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
    function calcGAV() constant returns (uint gav) {
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
}
