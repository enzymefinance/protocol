pragma solidity ^0.4.8;

import "./SubscribeProtocol.sol";
import "../dependencies/Owned.sol";
import "../dependencies/SafeMath.sol";


/// @title Subscribe Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Simple and static Subscribe Module.
contract Subscribe is SubscribeProtocol, SafeMath, Owned {

    // FIELDS

    // EVENTS

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

    modifier this_balance_at_least(uint x) {
        assert(this.balance >= x);
        _;
    }

    modifier less_than_or_equl_to(uint x, uint y) {
        assert(x <= y);
        _;
    }

    // CONSTANT METHODS

    // NON-CONSTANT METHODS

    function Subscribe() {}

    // Limit order
    function createSharesOnBehalf(address recipient, uint shareAmount, uint wantedValue)
    {
        /*sharePrice = calcSharePrice(); // TODO Request delivery of new price, instead of historical data
        uint actualValue = sharePrice * shareAmount / BASE_UNIT_OF_SHARES;
        assert(actualValue <= wantedValue); // Protection against price movement/manipulation
        allocateSlice(shareAmount);
        accounting(actualValue, shareAmount, true);
        SharesCreated(msg.sender, shareAmount, sharePrice);*/
    }

    /// Pre: EtherToken as Asset in Universe
    /// Post: Invest in a fund by creating shares
    /* Rem:
     *  This is can be seen as a none persistent all or nothing limit order, where:
     *  amount == amountShares and price == amountShares/msg.value [Shares/ETH]
     */
    function createSharesWithEther(uint wantedShares)
        payable
        msg_value_past_zero
    {
        /*sharePrice = calcSharePrice();
        uint offeredValue = msg.value * PRICE_OF_ETHER_RELATIVE_TO_REFERENCE_ASSET; // Offered value relative to reference token
        uint actualValue = sharePrice * wantedShares / BASE_UNIT_OF_SHARES; // Price for wantedShares of shares
        allocateEtherInvestment(actualValue, offeredValue, wantedShares);*/
    }

    /// Pre: EtherToken as Asset in Universe
    /// Post: Invest in a fund by creating shares
    function allocateEtherInvestment(uint actualValue, uint offeredValue, uint wantedShares)
        internal
        less_than_or_equl_to(actualValue, offeredValue)
        not_zero(wantedShares)
    {
        /*assert(module.ether_token.deposit.value(actualValue)()); // Deposit Ether in EtherToken contract
        // Acount for investment amount and deposit Ether
        sumInvested = safeAdd(sumInvested, actualValue);
        analytics.nav = safeAdd(analytics.nav, actualValue); // Bookkeeping
        // Create Shares
        balances[msg.sender] = safeAdd(balances[msg.sender], wantedShares);
        totalSupply = safeAdd(totalSupply, wantedShares);
        // Refund excessOfferedValue
        if (actualValue < offeredValue) {
            uint excessOfferedValue = offeredValue - actualValue;
            assert(msg.sender.send(excessOfferedValue));
            Refund(msg.sender, excessOfferedValue);
        }
        SharesCreated(msg.sender, wantedShares, sharePrice);*/
    }
}
