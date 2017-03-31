pragma solidity ^0.4.8;

import "./assets/EtherToken.sol";
import "./dependencies/ERC20.sol";
import {ERC20 as Shares} from "./dependencies/ERC20.sol";
import "./assets/AssetProtocol.sol";
import "./dependencies/Owned.sol";
import "./dependencies/SafeMath.sol";
import "./universe/UniverseProtocol.sol";
import "./datafeeds/PriceFeedProtocol.sol";
import "./fees/ManagementFeeProtocol.sol";
import "./fees/PerformanceFeeProtocol.sol";
import "./riskmgmt/RiskMgmtProtocol.sol";
import "./exchange/Exchange.sol";

/// @title Core Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Simple core where referenceAsset is EtherToken and
///   Creation of Shares is done with Ether
contract Core is Shares, SafeMath, Owned {

    // TYPES

    struct Analytics { // last time creation/annihilation of shares happened.
        uint nav;
        uint delta;
        uint timestamp;
    }

    struct Modules {
        EtherToken ether_token;
        UniverseProtocol universe;
        ManagementFeeProtocol management_fee;
        PerformanceFeeProtocol performance_fee;
        RiskMgmtProtocol riskmgmt;
        Exchange exchange;
    }

    // FIELDS

    // Constant token specific fields
    string public name;
    string public constant symbol = "MLN-P";
    uint public constant decimals = 18;
    // Constant fields
    uint public constant PRICE_OF_ETHER_RELATIVE_TO_REFERENCE_ASSET = 1; // By definition always equal one
    uint public constant BASE_UNIT_OF_SHARES = 10 ** decimals;
    // Fields that are only changed in constructor
    address referenceAsset;
    // Fields that can be changed by functions
    Analytics analytics;
    Modules module;
    uint public sumInvested; // Sum of all investments in Ether
    uint public sumWithdrawn; // Sum of all withdrawals in Ether
    uint public sharePrice = 1 * BASE_UNIT_OF_SHARES;

    // EVENTS

    event SharesCreated(address buyer, uint numShares, uint sharePrice); // Participation
    event SharesAnnihilated(address seller, uint numShares, uint sharePrice);
    event Refund(address to, uint value);
    event NotAllocated(address to, uint value);
    event PortfolioContent(uint assetHoldings, uint assetPrice, uint assetDecimals); // Calcualtions
    event AnalyticsUpdated(uint timestamp, uint nav, uint delta);
    event NetAssetValueCalculated(uint nav, uint managementFee, uint performanceFee);
    event SpendingApproved(address ofToken, address onExchange, uint amount); // Managing

    // MODIFIERS

    modifier msg_value_at_least(uint x) {
        assert(msg.value >= x);
        _;
    }

    modifier msg_value_past_zero() {
        assert(msg.value > 0);
        _;
    }

    modifier not_zero(uint x) {
        assert(x != 0);
        _;
    }

    modifier balances_msg_sender_at_least(uint x) {
        assert(balances[msg.sender] >= x);
        _;
    }

    modifier this_balance_at_least(uint x) {
        assert(this.balance >= x);
        _;
    }

    // CONSTANT METHDOS

    function getReferenceAsset() constant returns (address) { return referenceAsset; }
    function getUniverseAddress() constant returns (address) { return module.universe; }
    function getSharePrice() constant returns (uint) { return sharePrice; }

    // NON-CONSTANT METHODS

    function Core(
        string withName,
        address ofManager,
        address ofUniverse,
        address ofRiskMgmt,
        address ofManagmentFee,
        address ofPerformanceFee
    ) {
        name = withName;
        owner = ofManager;
        analytics = Analytics({ nav: 0, delta: 1 ether, timestamp: now });
        module.universe = UniverseProtocol(ofUniverse);
        uint etherTokenIndex = module.universe.etherTokenAtIndex();
        address etherToken = address(module.universe.assetAt(etherTokenIndex));
        module.ether_token = EtherToken(etherToken);
        module.riskmgmt = RiskMgmtProtocol(ofRiskMgmt);
        module.management_fee = ManagementFeeProtocol(ofManagmentFee);
        module.performance_fee = PerformanceFeeProtocol(ofPerformanceFee);
        referenceAsset = etherToken; // By definition initial version of core has EtherToken as ReferenceAsset
    }

    /// Pre: Needed to receive Ether from EtherToken Contract
    /// Post: Receive Either directly
    function() payable {}

    // NON-CONSTANT METHODS - PARTICIPATION

    /// Pre: EtherToken as Asset in Universe
    /// Post: Invest in a fund by creating shares
    /* Rem:
     *  This is can be seen as a none persistent all or nothing limit order, where:
     *  amount == amountShares and amount == msg.value
     */
    function createShares(uint wantedShares)
        payable
    {
        sharePrice = calcSharePrice();
        uint offeredValue = msg.value * PRICE_OF_ETHER_RELATIVE_TO_REFERENCE_ASSET; // Offered value relative to reference token
        createSharesAt(sharePrice, offeredValue, wantedShares);
    }

    /// Pre: EtherToken as Asset in Universe
    /// Post: Invest in a fund by creating shares
    function createSharesAt(uint sharePrice, uint offeredValue, uint wantedShares)
        internal
        msg_value_past_zero
        not_zero(wantedShares)
    {
        // Check if enough value sent for wanted amount of shares.
        uint wantedValue = sharePrice * wantedShares / BASE_UNIT_OF_SHARES;
        if (wantedValue <= offeredValue) {
            // Acount for investment amount and deposit Ether
            sumInvested = safeAdd(sumInvested, wantedValue);
            analytics.nav = safeAdd(analytics.nav, wantedValue); // Bookkeeping
            assert(module.ether_token.deposit.value(wantedValue)()); // Deposit Ether in EtherToken contract
            // Create Shares
            balances[msg.sender] = safeAdd(balances[msg.sender], wantedShares);
            totalSupply = safeAdd(totalSupply, wantedShares);
            SharesCreated(msg.sender, wantedShares, sharePrice);
        }
        // Refund excessOfferedValue
        else if (wantedValue < offeredValue) {
            uint excessOfferedValue = offeredValue - wantedValue;
            assert(msg.sender.send(excessOfferedValue));
            Refund(msg.sender, excessOfferedValue);
        // Valuation of Shares to low, refund all
        } else {
            assert(msg.sender.send(offeredValue));
            Refund(msg.sender, offeredValue);
        }
    }

    /// Pre: Sender owns shares, actively running price feed
    /// Post: Transfer ownership percentage of all assets from Core to Investor and annihilate offered shares.
    function annihilateShares(uint offeredShares, uint wantedValue)
    {
        sharePrice = calcSharePrice();
        annihilateSharesAt(sharePrice, offeredShares, wantedValue);
    }

    /// Pre: Sender owns shares, sharePrice input only needed for accounting purposes, redeem indepent of actively running price feed
    /// Post: Transfer ownership percentage of all assets from Core to Investor and annihilate offered shares.
    function annihilateSharesAt(uint sharePrice, uint offeredShares, uint wantedValue)
        internal
        balances_msg_sender_at_least(offeredShares)
    {
        // Check if enough shares offered for wanted value.
        uint offeredValue = sharePrice * offeredShares / BASE_UNIT_OF_SHARES;
        if (offeredValue >= wantedValue) {
            // Transfer ownedHoldings of Assets
            uint numAssignedAssets = module.universe.numAssignedAssets();
            for (uint i = 0; i < numAssignedAssets; ++i) {
                AssetProtocol Asset = AssetProtocol(address(module.universe.assetAt(i)));
                uint coreHoldings = Asset.balanceOf(this); // Amount of asset base units this core holds
                if (coreHoldings == 0) continue;
                uint ownedHoldings = coreHoldings * offeredShares / totalSupply; // ownership amount of msg.sender
                assert(Asset.transfer(msg.sender, ownedHoldings)); // Transfer Ownership of Asset from core to investor
            }
            // Acount for withdrawal amount
            sumWithdrawn = safeAdd(sumWithdrawn, offeredValue);
            analytics.nav = safeSub(analytics.nav, offeredValue); // Bookkeeping
            // Annihilate Shares
            balances[msg.sender] = safeSub(balances[msg.sender], offeredShares);
            totalSupply = safeSub(totalSupply, offeredShares);
            SharesAnnihilated(msg.sender, offeredShares, sharePrice);
      }
    }

    // NON-CONSTANT METHODS - EXCHANGE

    /// Pre: Sufficient balance and spending has been approved
    /// Post: Make offer on selected Exchange
    function makeOffer(Exchange onExchange,
        uint sell_how_much, ERC20 sell_which_token,
        uint buy_how_much,  ERC20 buy_which_token
    )
        only_owner
    {
        assert(isWithinKnownUniverse(onExchange, sell_which_token, buy_which_token));
        assert(module.riskmgmt.isExchangeOfferPermitted(onExchange, sell_how_much, sell_which_token, buy_how_much, buy_which_token));
        approveSpending(sell_which_token, onExchange, sell_how_much);
        onExchange.offer(sell_how_much, sell_which_token, buy_how_much, buy_which_token);
    }

    /// Pre: Active offer (id) and valid buy amount on selected Exchange
    /// Post: Take offer on selected Exchange
    function takeOffer(Exchange onExchange, uint id, uint wantedBuyAmount)
        only_owner
    {
        // Inverse variable terminology! Buying what another person is selling
        var (offeredBuyAmount, offeredBuyToken, offeredSellAmount, offeredSellToken) = onExchange.getOffer(id);
        uint wantedSellAmount = safeMul(wantedBuyAmount, offeredSellAmount) / offeredBuyAmount;
        assert(wantedBuyAmount <= offeredBuyAmount);
        assert(isWithinKnownUniverse(onExchange, offeredSellToken, offeredBuyToken));
        assert(module.riskmgmt.isExchangeBuyPermitted(onExchange, offeredSellAmount, offeredSellToken, offeredBuyAmount, offeredBuyToken));
        approveSpending(offeredSellToken, onExchange, wantedSellAmount);
        onExchange.buy(id, wantedBuyAmount);
    }

    /// Pre: Active offer (id) with owner of this contract on selected Exchange
    /// Post: Cancel offer on selected Exchange
    function cancel(Exchange onExchange, uint id) only_owner { onExchange.cancel(id); }

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

    // NON-CONSTANT METHODS - CORE

    /// Pre: Valid price feed data
    /// Post: Calculate Share Price in Wei and update analytics struct
    function calcSharePrice() returns (uint) { return calcDelta(); }

    /// Pre: Valid price feed data
    /// Post: Delta as a result of current and previous NAV
    function calcDelta() internal returns (uint delta) {
        uint nav = calcNAV();
        // Define or calcualte delta
        if (analytics.nav == 0) { // First investment not made
            delta = 1 ether; // By definition
        } else if (nav == 0) { // First investment made; All funds withdrawn
            delta = 1 ether; // By definition
        } else { // First investment made; Not all funds withdrawn
            delta = (analytics.delta * nav) / analytics.nav;
        }
        // Update Analytics
        analytics = Analytics({ nav: nav, delta: delta, timestamp: now });
        AnalyticsUpdated(now, nav, delta);
    }

    /// Pre: Valid price feed data
    /// Post: Portfolio Net Asset Value in Wei, managment and performance fee allocated
    function calcNAV() internal returns (uint nav) {
        uint timeDifference = now - analytics.timestamp;
        uint managementFee = module.management_fee.calculateFee(timeDifference);
        uint performanceFee = 0;
        uint gav = calcGAV(); // Reflects performance indepentent of previously taken management and performance fee
        if (analytics.nav != 0) {
          uint deltaGross = (analytics.delta * gav) / analytics.nav; // Performance (delta) before fees are taken
          uint relativeDeltaGross = (deltaGross - analytics.delta) / analytics.delta;
          performanceFee = module.performance_fee.calculateFee(relativeDeltaGross);
        }
        nav = gav - managementFee - performanceFee;
        NetAssetValueCalculated(nav, managementFee, performanceFee);
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
     *  price input unit: [Wei / ( Asset * 10**decimals )] == Base unit amount of referenceAsset per base unit amout of asset
     *  coreHoldings input unit: [Asset * 10**decimals] == Base unit amount of asset this core holds
     *    ==> coreHoldings * price == value of asset holdings of this core relative to referenceAsset price.
     *  where 0 <= decimals <= 18 and decimals is a natural number.
     */
    function calcGAV() internal returns (uint gav) {
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
