pragma solidity ^0.4.8;

import "./assets/EtherToken.sol";
import "./dependencies/ERC20.sol";
import {ERC20 as Shares} from "./dependencies/ERC20.sol";
import "./dependencies/AssetProtocol.sol";
import "./dependencies/Owned.sol";
import "./dependencies/SafeMath.sol";
import "./datafeeds/UniverseProtocol.sol";
import "./datafeeds/PriceFeedProtocol.sol";
import "./calculations/ManagementFeeProtocol.sol";
import "./calculations/PerformanceFeeProtocol.sol";
import "./riskmgmt/RiskMgmtProtocol.sol";
import "./exchange/Exchange.sol";


/// @title Core Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Simple core where REFERENCE_ASSET_INDEX_IN_REGISTRAR is EtherToken and
///   Creation and Annihilation of Shares is done with Ether
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
    // TODO set in constructor - similar to EtherToken
    string public constant name = "Melon Portfolio";
    string public constant symbol = "MLN-P";
    uint public constant decimals = 18;

    // Constant fields
    uint public constant REFERENCE_ASSET_INDEX_IN_REGISTRAR = 0; // Needs to be equal as set in Universe Module
    uint public constant PRICE_OF_ETHER_RELATIVE_TO_REFERENCE_ASSET = 1; // By definition always equal one
    uint public constant BASE_UNIT_OF_SHARES = 1 ether;

    // Fields that can be changed by functions
    Analytics analytics;
    Modules module;
    uint public sumInvested; // Sum of all investments in Ether
    uint public sumWithdrawn; // Sum of all withdrawals in Ether
    uint public sharePrice = 1 ether;

    // EVENTS

    event SharesCreated(address buyer, uint numShares, uint sharePrice);
    event SharesAnnihilated(address seller, uint numShares, uint sharePrice);
    event Refund(address to, uint value);
    event NotAllocated(address to, uint value);

    // MODIFIERS

    modifier msg_value_at_least(uint x) {
        assert(msg.value >= x);
        _;
    }

    modifier msg_value_past(uint x) {
        assert(msg.value > x);
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

    modifier token_registered_to_exchange(ERC20 token, Exchange exchange) {
        assert(exchange == Exchange(module.universe.assignedExchange(token)));
        _;
    }

    // CONSTANT METHDOS

    function getUniverseAddress() constant returns (address) { return module.universe; }

    /// Post: Calculate Share Price in Wei
    function calcSharePrice() constant returns (uint) { return calcDelta(); }

    /// Pre:
    /// Post: Delta as a result of current and previous NAV
    function calcDelta() constant returns (uint delta) {
        uint nav = calcNAV();
        // Set Delta
        if (analytics.nav == 0) {
            delta = 1 ether; // First investment not made
        } else if (nav == 0) {
            delta = 1 ether; // First investment made; All funds withdrawn
        } else {
            delta = (analytics.delta * nav) / analytics.nav; // First investment made; Not all funds withdrawn
        }
        // Update Analytics
        analytics = Analytics({ nav: nav, delta: delta, timestamp: now });
    }

    /// Pre:
    /// Post: Portfolio Net Asset Value in Wei, managment and performance fee allocated
    function calcNAV() constant returns (uint nav) {
        uint managementFee = 0;
        uint performanceFee = 0;
        nav = calcGAV() - managementFee - performanceFee;
    }

    /// Pre: Decimals in Token must be equal to decimals in PriceFeed for all entries in Universe
    /// Post: Portfolio Gross Asset Value in Wei
    function calcGAV() constant returns (uint gav) {
        /* Rem 1:
         *  All prices are relative to the reference asset price. For this version,
         *  the reference asset is set as the EtherToken. The price of the EtherToken
         *  relative to Ether is defined to always be equal to one.
         * Rem 2:
         *  All assets need to be linked to the right price feed
         * Rem 3:
         *  Price Input Unit: [Wei/(Asset * 10**(uint(decimals)))] == Base unit amount of reference asset per base unit amout of asset
         *  Holdings Input Unit: [Asset * 10**(uint(decimals)))] == Base unit amount of asset this core holds
         *    ==> coreHoldings * price == value of asset holdings of this core relative to reference asset price.
         *  where 0 <= decimals <= 18 and decimals is a natural number.
         */
        uint numAssignedAssets = module.universe.numAssignedAssets();
        for (uint i = 0; i < numAssignedAssets; ++i) {
            AssetProtocol Asset = AssetProtocol(address(module.universe.assetAt(i)));
            uint assetHoldings = Asset.balanceOf(this); // Amount of asset base units this core holds
            uint assetDecimals = Asset.getDecimals();
            PriceFeedProtocol Price = PriceFeedProtocol(address(module.universe.priceFeedsAt(i)));
            uint assetPrice = Price.getPrice(address(module.universe.assetAt(i))); // Asset price relative to reference asset price
            gav = safeAdd(gav, assetHoldings * assetPrice / (10 ** assetDecimals)); // Sum up product of asset holdings of this core and asset prices
        }
    }

    // NON-CONSTANT METHODS

    function Core(
        address ofManager,
        address ofUniverse,
        address ofRiskMgmt,
        address ofManagmentFee,
        address ofPerformanceFee
    ) {
        owner = ofManager;
        analytics = Analytics({ nav: 0, delta: 1 ether, timestamp: now });
        module.universe = UniverseProtocol(ofUniverse);
        module.ether_token = EtherToken(address(module.universe.assetAt(REFERENCE_ASSET_INDEX_IN_REGISTRAR)));
        module.riskmgmt = RiskMgmtProtocol(ofRiskMgmt);
        module.management_fee = ManagementFeeProtocol(ofManagmentFee);
        module.performance_fee = PerformanceFeeProtocol(ofPerformanceFee);
    }

    /// Pre: Needed to receive Ether from EtherToken Contract
    /// Post: Receive Either directly
    function() payable {}

    /// Pre: EtherToken as Asset in Universe at index REFERENCE_ASSET_INDEX_IN_REGISTRAR
    //  Creating Shares only possible with Ether
    /// Post: Invest in a fund by creating shares
    function createShares(uint wantedShares)
        payable
        msg_value_past(0)
        not_zero(wantedShares)
    {
        /* Rem:
         *  This is can be seen as a none persistent all or nothing limit order, where:
         *  quantity == quantitiyShares and
         *  amount == msg.value (amount investor is willing to pay for the req. quantity)
         */
        sharePrice = calcSharePrice();
        uint offeredValue = msg.value * PRICE_OF_ETHER_RELATIVE_TO_REFERENCE_ASSET; // Offered value relative to reference token
        // Check if enough funds sent for requested quantity of shares.
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

    /// Pre: Investment made by msg sender
    /// Post: Transfer ownership percentage of all assets from Core to Investor and annihilate offered shares.
    function annihilateShares(uint offeredShares, uint wantedValue)
        balances_msg_sender_at_least(offeredShares)
        not_zero(offeredShares)
    {
        sharePrice = calcSharePrice();
        // Check if enough shares offered for requested amount of funds.
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
      // Refund excessOfferedValue
      else if (offeredValue > wantedValue) {
          uint excessOfferedValue = offeredValue - wantedValue;
          NotAllocated(msg.sender, excessOfferedValue);
      // Valuation of Shares to low, refund all
      } else {
          NotAllocated(msg.sender, offeredValue);
      }
    }

    /// Pre: To Exchange needs to be approved to spend Tokens on the Managers behalf
    /// Post: Token specific exchange as registered in universe, approved to spend ofToken
    function approveSpending(uint approvalAmount, ERC20 ofToken)
        internal
        only_owner
    {
        assert(module.universe.availability(ofToken));
        ofToken.approve(module.universe.assignedExchange(ofToken), approvalAmount);
    }

    /// Place an Order on the selected Exchange
    function offer(Exchange onExchange,
        uint sell_how_much, ERC20 sell_which_token,
        uint buy_how_much,  ERC20 buy_which_token
    )
        only_owner
        token_registered_to_exchange(sell_which_token, onExchange)
    {
        assert(module.universe.availability(sell_which_token));
        assert(module.universe.availability(buy_which_token));
        onExchange.offer(sell_how_much, sell_which_token, buy_how_much, buy_which_token);
    }

    function buy(Exchange onExchange, uint id, uint quantity)
        only_owner
    {
        // Buying what another person is selling. Inverse variable terminology!
        var (buy_how_much, buy_which_token,
                sell_how_much, sell_which_token) = onExchange.getOffer(id);
        approveSpending(sell_how_much, sell_which_token);
        // TODO: assert token of orderId is registred to onExchange
        onExchange.buy(id, quantity);
    }

    function cancel(Exchange onExchange, uint id)
        only_owner
    {
        // TODO: assert token of orderId is registered to onExchange
        onExchange.cancel(id);
    }
}
