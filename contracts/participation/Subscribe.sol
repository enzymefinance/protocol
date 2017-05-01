pragma solidity ^0.4.8;

import "./SubscribeProtocol.sol";
import "../dependencies/Owned.sol";
import "../dependencies/SafeMath.sol";
import "../assets/EtherToken.sol";
import "../CoreProtocol.sol";



/// @title Subscribe Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Simple and static Subscribe Module.
contract Subscribe is SubscribeProtocol, SafeMath, Owned {

    // FIELDS

    // Constant fields
    uint public constant decimals = 18;
    uint public constant PRICE_OF_ETHER_RELATIVE_TO_REFERENCE_ASSET = 1;
    uint public constant BASE_UNIT_OF_SHARES = 1;
    uint public constant INITIAL_SHARE_PRICE = 10 ** decimals;
    // Fields that can be changed by functions
    EtherToken etherToken;

    // EVENTS

    event SharesCreated(address indexed byParticipant, uint atTimestamp, uint numShares); // Participation
    event SharesAnnihilated(address indexed byParticipant, uint atTimestamp, uint numShares);
    event Refund(address to, uint value);

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

    function Subscribe(address setEtherToken)
    {
        etherToken = EtherToken(setEtherToken);
    }

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
    function createSharesWithEther(uint wantedShares, address ofCore)
        payable
        msg_value_past_zero
    {
        //TODO implement using current shareprice
        CoreProtocol Core = CoreProtocol(ofCore);
        uint sharePrice = Core.getSharePrice();
        uint offeredValue = msg.value * PRICE_OF_ETHER_RELATIVE_TO_REFERENCE_ASSET; // Offered value relative to reference token
        uint actualValue = sharePrice * wantedShares / BASE_UNIT_OF_SHARES; // Price for wantedShares of shares
        assert(offeredValue >= actualValue);
        allocateEtherInvestment(actualValue, offeredValue, wantedShares, ofCore);
    }

    /// Pre: EtherToken as Asset in Universe
    /// Post: Invest in a fund by creating shares
    function allocateEtherInvestment(
        uint actualValue,
        uint offeredValue,
        uint wantedShares,
        address ofCore
    )
        internal
        less_than_or_equl_to(actualValue, offeredValue)
        not_zero(wantedShares)
    {
        assert(etherToken.deposit.value(actualValue)()); // Deposit Ether in EtherToken contract
        CoreProtocol Core = CoreProtocol(ofCore);
        Core.createSharesViaSubscribeModule(msg.sender, wantedShares);
        // Refund excessOfferedValue
        if (actualValue < offeredValue) {
            uint excessOfferedValue = offeredValue - actualValue;
            assert(msg.sender.send(excessOfferedValue));
            Refund(msg.sender, excessOfferedValue);
        }
        SharesCreated(msg.sender, now, wantedShares);
    }
}
