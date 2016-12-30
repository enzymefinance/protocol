pragma solidity ^0.4.4;

import "./tokens/EtherToken.sol";
import "./dependencies/ERC20.sol";
import "./dependencies/ERC20Protocol.sol";
import "./dependencies/Owned.sol";
import "./dependencies/SafeMath.sol";
import "./router/RegistrarProtocol.sol";
import "./router/PriceFeedProtocol.sol";
import "./router/ManagementFeeProtocol.sol";
import "./router/PerformanceFeeProtocol.sol";
import "./trading/TradingProtocol.sol";
import "./exchange/Exchange.sol";


contract Shares is ERC20 {}

/// @title Core Contract
/// @author Melonport AG <team@melonport.com>
contract Core is Shares, SafeMath, Owned {

    // TYPES

    struct Analytics { // last time creation/annihilation of shares happened.
        uint nav;
        uint delta;
        uint timestamp;
    }
    struct Modules {
        EtherToken ether_token;
        RegistrarProtocol registrar;
        ManagementFeeProtocol management_fee;
        PerformanceFeeProtocol performance_fee;
        TradingProtocol trading;
        Exchange exchange;
    }

    // FIELDS

    // Constant fields
    uint public constant ETHER_TOKEN_INDEX_IN_REGISTRAR = 0;

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
        assert(exchange == Exchange(module.registrar.assignedExchange(token)));
        _;
    }

    // CONSTANT METHDOS

    function getRegistrarAddress() constant returns (address) { return module.registrar; }

    // Post: Calculate Share Price in Wei
    function calcSharePrice() constant returns (uint) { return calcDelta(); }

    // Pre:
    // Post: Delta as a result of current and previous NAV
    function calcDelta() constant returns (uint delta) {
        uint nav = calcNAV();
        // Set delta
        if (analytics.nav == 0) {
            delta = 1 ether; // First investment not made
        } else if (nav == 0) {
            delta = 1 ether; // First investment made; All funds withdrawn
        } else {
            delta = (analytics.delta * nav) / analytics.nav; // First investment made; Not all funds withdrawn
        }
        // Update Analytics
        analytics.delta = delta;
        analytics.nav = nav;
        analytics.timestamp = now;
    }

    // Pre:
    // Post: Portfolio Net Asset Value in Wei, managment and performance fee allocated
    function calcNAV() constant returns (uint nav) {
        uint managementFee = 0;
        uint performanceFee = 0;
        nav = calcGAV() - managementFee - performanceFee;
    }

    // Pre: Precision in Token must be equal to precision in PriceFeed for all entries in Registrar
    // Post: Portfolio Gross Asset Value in Wei
    function calcGAV() constant returns (uint gav) {
        /* Rem:
         *  The current Investment (Withdrawal) is not yet stored in the
         *  sumInvested (sumWithdrawn) field.
         * Rem 2:
         *  Since by convention the first asset represents Ether, and the prices
         *  are given in Ether the first price is always equal to one.
         * Rem 3:
         *  Assets need to be linked to the right price feed
         * Rem 4:
         *  Price Input Unit: [Wei/(Asset * 10**(uint(precision)))]
         *  Holdings Input Unit: [Asset * 10**(uint(precision)))]
         *  with 0 <= precision <= 18 and precision is a natural number.
         */
        gav = module.ether_token.balanceOf(this) * 1; // EtherToken as Asset
        uint numAssignedAssets = module.registrar.numAssignedAssets();
        for (uint i = 0; i < numAssignedAssets; ++i) {
            if (i == ETHER_TOKEN_INDEX_IN_REGISTRAR) continue;
            ERC20Protocol ERC20 = ERC20Protocol(address(module.registrar.assetAt(i)));
            uint holdings = ERC20.balanceOf(this); // Asset holdings
            PriceFeedProtocol Price = PriceFeedProtocol(address(module.registrar.priceFeedsAt(i)));
            uint price = Price.getPrice(address(module.registrar.assetAt(i))); // Asset price
            gav += holdings * price; // Sum up product of asset holdings and asset prices
        }
    }

    // NON-CONSTANT METHODS

    function Core(
        address ofManager,
        address ofRegistrar,
        address ofTrading,
        address ofManagmentFee,
        address ofPerformanceFee
    ) {
        owner = ofManager;
        analytics.nav = 0;
        analytics.delta = 1 ether;
        analytics.timestamp = now;
        module.registrar = RegistrarProtocol(ofRegistrar);
        module.ether_token = EtherToken(address(module.registrar.assetAt(ETHER_TOKEN_INDEX_IN_REGISTRAR)));
        module.trading = TradingProtocol(ofTrading);
        module.management_fee = ManagementFeeProtocol(ofManagmentFee);
        module.performance_fee = PerformanceFeeProtocol(ofPerformanceFee);
    }

    // Pre: Needed to receive Ether from EtherToken Contract
    // Post: Receive Either directly
    function() payable {}

    // Pre: EtherToken as Asset in Registrar at index ETHER_TOKEN_INDEX_IN_REGISTRAR
    // Post: Invest in a fund by creating shares
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
        uint offeredValue = msg.value;
        // Check if enough funds sent for requested quantity of shares.
        uint wantedValue = sharePrice * wantedShares / (1 ether);
        if (wantedValue <= offeredValue) {
            // Acount for and deposit Ether
            sumInvested = safeAdd(sumInvested, wantedValue);
            analytics.nav = safeAdd(analytics.nav, wantedValue); // Bookkeeping
            assert(module.ether_token.deposit.value(wantedValue)()); // Deposit Ether in EtherToken contract
            // Create Shares
            balances[msg.sender] = safeAdd(balances[msg.sender], wantedShares);
            totalSupply = safeAdd(totalSupply, wantedShares);
            SharesCreated(msg.sender, wantedShares, sharePrice);
        }
        // Refund excessOfferedValue
        if (wantedValue < offeredValue) {
            uint excessOfferedValue = offeredValue - wantedValue;
            assert(msg.sender.send(excessOfferedValue));
            Refund(msg.sender, excessOfferedValue);
        }
    }

    // Pre: Investment made by msg sender
    // Post: Withdraw from a fund by annihilating shares
    function annihilateShares(uint offeredShares, uint wantedValue)
        balances_msg_sender_at_least(offeredShares)
        not_zero(offeredShares)
    {
        sharePrice = calcSharePrice();
        // Check if enough shares offered for requested amount of funds.
        uint offeredValue = sharePrice * offeredShares / (1 ether);
        if (wantedValue <= offeredValue) {
            // Acount for and withdraw Ether
            //  EtherToken as Asset
            uint totalEtherHoldings = module.ether_token.balanceOf(this); // Separate a portion of all EtherToken
            uint etherHoldings = totalEtherHoldings * offeredShares / totalSupply; // ownership percentage of total Ether holdings
            assert(module.ether_token.withdraw(etherHoldings)); // Withdraw Ether from EtherToken contract
            assert(msg.sender.send(etherHoldings)); // Send Ether from portfolio to investor
            // TODO iterate this overall assets of registrar
            /*assert(module.ether_token.transfer(msg.sender, etherHoldings)); // Transfer Ownership of EtherTokens from portfolio to investor*/
            // TODO replace etherHoldings with totalSumWithdrawn
            sumWithdrawn = safeAdd(sumWithdrawn, etherHoldings);
            // TODO replace etherHoldings with totalSumWithdrawn
            analytics.nav = safeSub(analytics.nav, etherHoldings); // Bookkeeping
            // Annihilate Shares
            balances[msg.sender] = safeSub(balances[msg.sender], offeredShares);
            totalSupply = safeSub(totalSupply, offeredShares);
            SharesAnnihilated(msg.sender, offeredShares, sharePrice);
      }
      // Refund excessOfferedValue
      if (wantedValue < offeredValue) {
          uint excessOfferedValue = offeredValue - wantedValue;
          Refund(msg.sender, excessOfferedValue);
      }
    }

    // Pre: To Exchange needs to be approved to spend Tokens on the Managers behalf
    // Post: Token specific exchange as registered in registrar, approved to spend ofToken
    function approveSpending(ERC20 ofToken, uint approvalAmount)
        only_owner
    {
        assert(module.registrar.availability(ofToken));
        ofToken.approve(module.registrar.assignedExchange(ofToken), approvalAmount);
    }

    /// Place an Order on the selected Exchange
    function offer(Exchange onExchange,
        uint sell_how_much, ERC20 sell_which_token,
        uint buy_how_much,  ERC20 buy_which_token
    )
        only_owner
        token_registered_to_exchange(sell_which_token, onExchange)
    {
        assert(module.registrar.availability(sell_which_token));
        assert(module.registrar.availability(buy_which_token));
        onExchange.offer(sell_how_much, sell_which_token, buy_how_much, buy_which_token);
    }

    function buy(Exchange onExchange, uint id, uint quantity)
        only_owner
    {
        // TODO: assert token of orderId is registred to onExchange
        onExchange.buy(id, quantity);
    }

    function cancel(Exchange onExchange, uint id)
        only_owner
    {
        // TODO: assert token of orderId is registred to onExchange
        onExchange.cancel(id);
    }
}
