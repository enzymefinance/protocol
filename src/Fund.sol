pragma solidity ^0.4.19;

import {ERC20 as Shares} from './dependencies/ERC20.sol';
import './dependencies/DBC.sol';
import './dependencies/Owned.sol';
import './libraries/safeMath.sol';
import './libraries/rewards.sol';
import './compliance/ComplianceInterface.sol';
import './pricefeeds/PriceFeedInterface.sol';
import './riskmgmt/RiskMgmtInterface.sol';
import './exchange/ExchangeInterface.sol';
import {simpleAdapter as exchangeAdapter} from './exchange/adapter/simpleAdapter.sol';
import './FundInterface.sol';

/// @title Melon Fund Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Simple Melon Fund
contract Fund is DBC, Owned, Shares, FundInterface {
    using safeMath for uint;

    // TYPES

    struct Modules { // Describes all modular parts, standardised through an interface
        PriceFeedInterface pricefeed; // Provides all external data
        ExchangeInterface exchange; // Wraps exchange adapter into exchange interface
        ComplianceInterface compliance; // Boolean functions regarding invest/redeem
        RiskMgmtInterface riskmgmt; // Boolean functions regarding make/take orders
    }

    struct Calculations { // List of internal calculations
        uint gav; // Gross asset value
        uint managementReward; // Time based reward
        uint performanceReward; // Performance based reward measured against REFERENCE_ASSET
        uint unclaimedRewards; // Rewards not yet allocated to the fund manager
        uint nav; // Net asset value
        uint highWaterMark; // A record of best all-time fund performance
        uint totalSupply; // Total supply of shares
        uint timestamp; // Time when calculations are performed in seconds
    }

    enum RequestStatus { active, cancelled, executed }
    enum RequestType { subscribe, redeem }
    struct Request { // Describes and logs whenever asset enter and leave fund due to Participants
        address participant; // Participant in Melon fund requesting subscription or redemption
        RequestStatus status; // Enum: active, cancelled, executed; Status of request
        RequestType requestType; // Enum: subscribe, redeem
        uint shareQuantity; // Quantity of Melon fund shares
        uint giveQuantity; // Quantity in Melon asset to give to Melon fund to receive shareQuantity
        uint receiveQuantity; // Quantity in Melon asset to receive from Melon fund for given shareQuantity
        uint incentiveQuantity; // Quantity in Melon asset to give to person executing request
        uint timestamp; // Time of request creation in seconds
    }

    enum OrderStatus { active, partiallyFilled, fullyFilled, cancelled }
    enum OrderType { make, take }
    struct Order { // Describes and logs whenever assets enter and leave fund due to Manager
        uint exchangeId; // Id as returned from exchange
        OrderStatus status; // Enum: active, partiallyFilled, fullyFilled, cancelled
        OrderType orderType; // Enum: make, take
        address sellAsset; // Asset (as registered in Asset registrar) to be sold
        address buyAsset; // Asset (as registered in Asset registrar) to be bought
        uint sellQuantity; // Quantity of sellAsset to be sold
        uint buyQuantity; // Quantity of sellAsset to be bought
        uint timestamp; // Time of order creation in seconds
        uint fillQuantity; // Buy quantity filled; Always less than buy_quantity
    }

    // FIELDS

    // Constant fields
    string constant SYMBOL = "MLN-Fund"; // Melon Fund Symbol
    uint256 public constant DECIMALS = 18; // Amount of decimals sharePrice is denominated in
    uint public constant DIVISOR_FEE = 10 ** uint256(15); // Reward are divided by this number
    uint public constant MAX_FUND_ASSETS = 90; // Max ownable assets by the fund supported by gas limits
    // Constructor fields
    string public NAME; // Name of this fund
    uint public CREATED; // Timestamp of Fund creation
    uint public MELON_IN_BASE_UNITS; // One unit of share equals 10 ** uint256(DECIMALS) of base unit of shares
    uint public MANAGEMENT_REWARD_RATE; // Reward rate in REFERENCE_ASSET per delta improvement
    uint public PERFORMANCE_REWARD_RATE; // Reward rate in REFERENCE_ASSET per managed seconds
    address public VERSION; // Address of Version contract
    address public MELON_ASSET; // Address of Melon asset contract
    ERC20 public MELON_CONTRACT; // Melon as ERC20 contract
    address public REFERENCE_ASSET; // Performance measured against value of this asset
    // Methods fields
    Modules public module; // Struct which holds all the initialised module instances
    Calculations public atLastConversion; // Calculation results at last convertUnclaimedRewards() call
    bool public isShutDown; // Security feature, if yes than investing, managing, convertUnclaimedRewards gets blocked
    Request[] public requests; // All the requests this fund received from participants
    bool public isSubscribeAllowed; // User option, if false fund rejects Melon investments
    bool public isRedeemAllowed; // User option, if false fund rejects Melon redemptions; Redemptions using slices always possible
    Order[] public orders; // All the orders this fund placed on exchanges
    mapping (address => uint) public assetsToOpenMakeOrderIds; // Mapping from asset to exchange id of open make order for the asset, if no open make orders uint is zero
    address[] public ownedAssets; // List of all assets owned by the fund
    mapping (address => bool) public isInAssetList; // Mapping from asset to whether the asset exists in ownedAssets
    mapping (address => bool) public isInOpenMakeOrder; // Mapping from asset to whether the asset is in a open make order as buy asset

    // PRE, POST, INVARIANT CONDITIONS

    function isZero(uint x) internal returns (bool) { x == 0; }
    function isFalse(bool x) internal returns (bool) { return x == false; }
    function isPastZero(uint x) internal returns (bool) { return 0 < x; }
    function isLessThan(uint x, uint y) internal returns (bool) { return x < y; }
    function notShutDown() internal returns (bool) { return !isShutDown; }
    function approveSpending(address ofAsset, uint quantity) internal returns (bool success) {
        success = ERC20(ofAsset).approve(address(module.exchange), quantity);
        SpendingApproved(address(module.exchange), ofAsset, quantity);
    }
    function isVersion() internal returns (bool) { return msg.sender == VERSION; }

    // CONSTANT METHODS

    function getName() view returns (string) { return NAME; }
    function getSymbol() view returns (string) { return SYMBOL; }
    function getDecimals() view returns (uint) { return DECIMALS; }
    function getCreationTime() view returns (uint) { return CREATED; }
    function getBaseUnits() view returns (uint) { return MELON_IN_BASE_UNITS; }
    function getModules() view returns (address ,address, address, address) {
        return (
            address(module.pricefeed),
            address(module.exchange),
            address(module.compliance),
            address(module.riskmgmt)
        );
    }
    function getStake() view returns (uint) { return balanceOf(this); }
    function getLastOrderId() view returns (uint) { return orders.length - 1; }
    function getLastRequestId() view returns (uint) { return requests.length - 1; }

    // CONSTANT METHODS - ACCOUNTING

    /// @notice Calculates unclaimed rewards of the fund manager
    /// @param gav Gross asset value denominated in [base unit of melonAsset] of this fund
    /**
    @return {
      "managementReward": "A time (seconds) based reward",
      "performanceReward": "A performance (rise of sharePrice measured in REFERENCE_ASSET) based reward",
      "unclaimedRewards": "The sum of both managementReward and performanceReward denominated in [base unit of melonAsset]"
    }
    */
    function calcUnclaimedRewards(uint gav)
        view
        returns (
            uint managementReward,
            uint performanceReward,
            uint unclaimedRewards
        )
    {
        uint timeDifference = now.sub(atLastConversion.timestamp);
        managementReward = rewards.managementReward(
            MANAGEMENT_REWARD_RATE,
            timeDifference,
            gav,
            DIVISOR_FEE
        );
        performanceReward = 0;
        if (totalSupply != 0) {
            uint currSharePrice = calcValuePerShare(gav).mul(module.pricefeed.getInvertedPrice(REFERENCE_ASSET));
            if (currSharePrice > atLastConversion.highWaterMark) {
              performanceReward = rewards.performanceReward(
                  PERFORMANCE_REWARD_RATE,
                  int(currSharePrice - atLastConversion.highWaterMark),
                  totalSupply,
                  DIVISOR_FEE
              );
            }
        }
        unclaimedRewards = managementReward.add(performanceReward);
    }

    /// @notice Calculates the Net asset value of this fund
    /// @param gav Gross asset value of this fund denominated in [base unit of melonAsset]
    /// @param unclaimedRewards The sum of both managementReward and performanceReward denominated in [base unit of melonAsset]
    /// @return nav Net asset value denominated in [base unit of melonAsset]
    function calcNav(uint gav, uint unclaimedRewards)
        view
        returns (uint nav)
    {
        nav = gav.sub(unclaimedRewards);
    }

    /// @notice Calculates the share price of the fund
    /// @dev Non-zero share supply; value denominated in [base unit of melonAsset]
    /// @return valuePerShare Share price denominated in [base unit of melonAsset * base unit of share / base unit of share] == [base unit of melonAsset]
    function calcValuePerShare(uint value)
        view
        pre_cond(isPastZero(totalSupply))
        returns (uint valuePerShare)
    {
        valuePerShare = value.mul(MELON_IN_BASE_UNITS).div(totalSupply);
    }

    /// @notice Calculates essential fund metrics
    /**
    @return {
      "gav": "Gross asset value of this fund denominated in [base unit of melonAsset]",
      "managementReward": "A time (seconds) based reward",
      "performanceReward": "A performance (rise of sharePrice measured in REFERENCE_ASSET) based reward",
      "unclaimedRewards": "The sum of both managementReward and performanceReward denominated in [base unit of melonAsset]",
      "nav": "Net asset value denominated in [base unit of melonAsset]",
      "sharePrice": "Share price denominated in [base unit of melonAsset]"
    }
    */
    function performCalculations()
        view
        returns (
            uint gav,
            uint managementReward,
            uint performanceReward,
            uint unclaimedRewards,
            uint nav,
            uint sharePrice
        )
    {
        gav = calcGav(); // Reflects value independent of fees
        (managementReward, performanceReward, unclaimedRewards) = calcUnclaimedRewards(gav);
        nav = calcNav(gav, unclaimedRewards);
        sharePrice = isPastZero(totalSupply) ? calcValuePerShare(nav) : MELON_IN_BASE_UNITS; // Handle potential division through zero by defining a default value
        return (gav, managementReward, performanceReward, unclaimedRewards, nav, sharePrice);
    }

    /// @notice Calculates sharePrice denominated in [base unit of melonAsset]
    /// @return sharePrice Share price denominated in [base unit of melonAsset]
    function calcSharePrice() view returns (uint sharePrice)
    {
        (, , , , , sharePrice) = performCalculations();
        return sharePrice;
    }

    // NON-CONSTANT METHODS

    /// @dev Should only be called via Version.setupFund(..)
    /// @param withName human-readable descriptive name (not necessarily unique)
    /// @param ofReferenceAsset asset against which performance reward is measured against
    /// @param ofManagementRewardRate A time based reward, given in a number which is divided by DIVISOR_FEE
    /// @param ofPerformanceRewardRate A time performance based reward, performance relative to ofReferenceAsset, given in a number which is divided by DIVISOR_FEE
    /// @param ofMelonAsset Address of Melon asset contract
    /// @param ofCompliance Address of compliance module
    /// @param ofRiskMgmt Address of risk management module
    /// @param ofPriceFeed Address of price feed module
    /// @param ofExchange Address of exchange on which this fund can trade
    /// @return Deployed Fund with manager set as ofManager
    function Fund(
        address ofManager,
        string withName,
        address ofReferenceAsset,
        uint ofManagementRewardRate,
        uint ofPerformanceRewardRate,
        address ofMelonAsset,
        address ofCompliance,
        address ofRiskMgmt,
        address ofPriceFeed,
        address ofExchange
    ) {
        isSubscribeAllowed = true;
        isRedeemAllowed = true;
        owner = ofManager;
        NAME = withName;
        MANAGEMENT_REWARD_RATE = ofManagementRewardRate;
        PERFORMANCE_REWARD_RATE = ofPerformanceRewardRate;
        VERSION = msg.sender;
        MELON_ASSET = ofMelonAsset;
        REFERENCE_ASSET = ofReferenceAsset;
        // Require reference assets exists in pricefeed
        MELON_CONTRACT = ERC20(MELON_ASSET);
        require(MELON_ASSET == module.pricefeed.getQuoteAsset()); // Sanity check
        ownedAssets.push(MELON_ASSET);
        isInAssetList[MELON_ASSET] = true;
        MELON_IN_BASE_UNITS = 10 ** uint256(module.pricefeed.getDecimals(MELON_ASSET));
        module.compliance = ComplianceInterface(ofCompliance);
        module.riskmgmt = RiskMgmtInterface(ofRiskMgmt);
        module.pricefeed = PriceFeedInterface(ofPriceFeed);
        // Bridged to Melon exchange interface by exchangeAdapter library
        module.exchange = ExchangeInterface(ofExchange);
        atLastConversion = Calculations({
            gav: 0,
            managementReward: 0,
            performanceReward: 0,
            unclaimedRewards: 0,
            nav: 0,
            highWaterMark: MELON_IN_BASE_UNITS,
            totalSupply: totalSupply,
            timestamp: now
        });
        CREATED = now;
    }

    // NON-CONSTANT METHODS - ADMINISTRATION

    function enableSubscription() external pre_cond(isOwner()) { isSubscribeAllowed = true; }
    function disableSubscription() external pre_cond(isOwner()) { isSubscribeAllowed = false; }
    function enableRedemption() external pre_cond(isOwner()) { isRedeemAllowed = true; }
    function disableRedemption() external pre_cond(isOwner()) { isRedeemAllowed = false; }
    function shutDown() external pre_cond(isVersion() || isOwner()) { isShutDown = true; }

    // NON-CONSTANT METHODS - PARTICIPATION

    /// @notice Give melon tokens to receive shares of this fund
    /// @dev Recommended to give some leeway in prices to account for possibly slightly changing prices
    /// @param giveQuantity Quantity of Melon token times 10 ** 18 offered to receive shareQuantity
    /// @param shareQuantity Quantity of shares times 10 ** 18 requested to be received
    /// @param incentiveQuantity Quantity in Melon asset to give to the person executing the request
    /**
    @return {
      "err": "If there is an error",
      "errMsg": "Error message"
    }
    */
    function requestSubscription(
        uint giveQuantity,
        uint shareQuantity,
        uint incentiveQuantity
    )
        external
        pre_cond(notShutDown())
        returns (bool err, string errMsg)
    {
        if (!isSubscribeAllowed) {
            return logError("ERR: Subscription using Melon has been deactivated by the Manager");
        }

        if (!module.compliance.isSubscriptionPermitted(msg.sender, giveQuantity, shareQuantity)) {
            return logError("ERR: Compliance Module: Subscription not permitted");
        }

        requests.push(Request({
            participant: msg.sender,
            status: RequestStatus.active,
            requestType: RequestType.subscribe,
            shareQuantity: shareQuantity,
            giveQuantity: giveQuantity,
            receiveQuantity: shareQuantity,
            incentiveQuantity: incentiveQuantity,
            timestamp: now
        }));
        RequestUpdated(getLastRequestId());
    }

    /// @notice Give shares of this fund to receive melon tokens
    /// @dev Recommended to give some leeway in prices to account for possibly slightly changing prices
    /// @param shareQuantity Quantity of shares times 10 ** 18 offered to redeem
    /// @param receiveQuantity Quantity of Melon token times 10 ** 18 requested to receive for shareQuantity
    /// @param incentiveQuantity Quantity in Melon asset to give to the person executing the request
    /**
    @return {
      "err": "If there is an error",
      "errMsg": "Error message"
    }
    */
    function requestRedemption(
        uint shareQuantity,
        uint receiveQuantity,
        uint incentiveQuantity
      )
        external
        pre_cond(notShutDown())
        returns (bool err, string errMsg)
    {
        if (!isRedeemAllowed) {
            return logError("ERR: Redemption using Melon has been deactivated by Manager");
        }

        if (!module.compliance.isRedemptionPermitted(msg.sender, shareQuantity, receiveQuantity)) {
            return logError("ERR: Compliance Module: Redemption not permitted");
        }

        requests.push(Request({
            participant: msg.sender,
            status: RequestStatus.active,
            requestType: RequestType.redeem,
            shareQuantity: shareQuantity,
            giveQuantity: shareQuantity,
            receiveQuantity: receiveQuantity,
            incentiveQuantity: incentiveQuantity,
            timestamp: now
        }));
        RequestUpdated(getLastRequestId());
    }

    /// @notice Executes active subscription and redemption requests, in a way that minimises information advantages of investor
    /// @dev Distributes melon and shares according to the request
    /// @param id Index of request to be executed
    /// @dev Active subscription or redemption request executed
    /**
    @return {
      "err": "If there is an error",
      "errMsg": "Error message"
    }
    */
    function executeRequest(uint id)
        external
        pre_cond(notShutDown())
        pre_cond(requests[id].status != RequestStatus.active)
        pre_cond(requests[id].requestType == RequestType.redeem && balances[request.participant] < requests[id].shareQuantity) // Sender does not own enough shares
        pre_cond(0 < totalSupply && now < requests[id].timestamp.add(uint(2).mul(module.pricefeed.getInterval()))) // PriceFeed Module: Wait at least one interval before continuing unless its the first supscription
        pre_cond(module.pricefeed.hasRecentPrices(ownedAssets)) // PriceFeed Module: No recent updates for fund asset list
        returns (bool err, string errMsg)
    {
        uint costQuantity = request.shareQuantity
            .mul(calcSharePrice()) // denominated in [base unit of MELON_ASSET]
            .div(MELON_IN_BASE_UNITS);

        Request request = requests[id];

        if (
            request.requestType == RequestType.subscribe &&
            costQuantity <= request.giveQuantity
        ) {
            request.status = RequestStatus.executed;
            assert(MELON_CONTRACT.transferFrom(request.participant, this, costQuantity)); // Allocate Value
            assert(MELON_CONTRACT.transferFrom(request.participant, msg.sender, request.incentiveQuantity)); // Reward Worker
            createShares(request.participant, request.shareQuantity); // Accounting
        } else if (
            request.requestType == RequestType.redeem &&
            request.receiveQuantity <= costQuantity
        ) {
            request.status = RequestStatus.executed;
            assert(MELON_CONTRACT.transfer(request.participant, request.receiveQuantity)); // Return value
            assert(MELON_CONTRACT.transferFrom(request.participant, msg.sender, request.incentiveQuantity)); // Reward Worker
            annihilateShares(request.participant, request.shareQuantity); // Accounting
        } else {
            return logError("ERR: Invalid Request or invalid giveQuantity / receiveQuantity");
        }
    }

    /// @notice Cancels active subscription and redemption requests
    /// @param id Index of request to be executed
    /**
    @return {
      "err": "If there is an error",
      "errMsg": "Error message"
    }
    */
    function cancelRequest(uint id)
        external
        returns (bool err, string errMsg)
    {
        Request request = requests[id];

        if (request.status != RequestStatus.active) {
            return logError("ERR: Request is not active");
        }

        if (request.participant != msg.sender && notShutDown()) {
            return logError("ERR: Neither request creator nor is fund shut down");
        }

        request.status = RequestStatus.cancelled;
    }

    /// @notice Redeems by allocating an ownership percentage of each asset to the participant
    /// @dev Independent of running price feed!
    /// @param shareQuantity Number of shares owned by the participant, which the participant would like to redeem for individual assets
    /**
    @return {
      "err": "If there is an error",
      "errMsg": "Error message"
    }
    */
    function redeemOwnedAssets(uint shareQuantity)
        external
        returns (bool err, string errMsg)
    {
        if (balances[msg.sender] < shareQuantity && balances[msg.sender] > 0) {
            return logError("ERR: Sender does not own enough shares");
        }

        // Quantity of shares which belong to the investors
        uint participantsTotalSupplyBeforeRedeem = totalSupply;
        if (module.pricefeed.hasRecentPrices(ownedAssets)) {
            var (gav, , , , nav, ) = performCalculations();
            participantsTotalSupplyBeforeRedeem = totalSupply.mul(nav).div(gav);
        }

        if (isZero(participantsTotalSupplyBeforeRedeem)) {
            return logError("ERR: Zero participants total supply");
        }

        // Check whether enough assets held by fund
        uint[] memory ownershipQuantities;
        for (uint i = 0; i < ownedAssets.length; ++i) {
            address ofAsset = ownedAssets[i];
            uint assetHoldings = ERC20(ofAsset).balanceOf(this);
            if (assetHoldings == 0) continue;

            ownershipQuantities[i] = assetHoldings // ownership percentage of participant of asset holdings
                .mul(shareQuantity)
                .div(participantsTotalSupplyBeforeRedeem);

            // Less available than what is owed - Eg in case of unreturned asset quantity at address(module.exchange) address
            if (isLessThan(assetHoldings, ownershipQuantities[i])) {
                return shutDownAndLogError("CRITICAL ERR: Not enough assetHoldings for owed ownershipQuantitiy");
            }
        }

        // Annihilate shares before external calls to prevent reentrancy
        annihilateShares(msg.sender, shareQuantity);

        // Transfer ownershipQuantity of Assets
        for (uint j = 0; j < ownershipQuantities.length; ++j) {
            // Failed to send owed ownershipQuantity from fund to participant
            if (!ERC20(ofAsset).transfer(msg.sender, ownershipQuantities[j])) {
                revert();
            }
        }
        Redeemed(msg.sender, now, shareQuantity);
    }

    // NON-CONSTANT METHODS - MANAGING

    /// @notice Makes an order on the selected exchange
    /// @dev These are orders that are not expected to settle immediately.  Sufficient balance (== sellQuantity) of sellAsset
    /// @param sellAsset Asset (as registered in Asset registrar) to be sold
    /// @param buyAsset Asset (as registered in Asset registrar) to be bought
    /// @param sellQuantity Quantity of sellAsset to be sold
    /// @param buyQuantity Quantity of buyAsset to be bought
    /**
    @return {
      "err": "If there is an error",
      "errMsg": "Error message"
    }
    */
    function makeOrder(
        address sellAsset,
        address buyAsset,
        uint sellQuantity,
        uint buyQuantity
    )
        external
        pre_cond(isOwner())
        pre_cond(notShutDown())
        returns (bool err, string errMsg)
    {
        require(0 < quantityHeldInCustodyOfExchange(sellAsset)); // Curr only one make order per sellAsset allowed. Please wait or cancel existing make order.
        require(!module.pricefeed.existsPriceOnAssetPair(sellAsset, buyAsset)); // PriceFeed module: Requested asset pair not valid
        require(!module.riskmgmt.isMakePermitted(
                module.pricefeed.getOrderPrice(sellAsset, sellQuantity, buyQuantity),
                module.pricefeed.getReferencePrice(sellAsset, buyAsset),
                sellAsset, buyAsset, sellQuantity, buyQuantity
        )); // RiskMgmt module: Make order not permitted
        require(isInAssetList[buyAsset] || ownedAssets.length < MAX_FUND_ASSETS); // Limit for max ownable assets by the fund reached
        require(!approveSpending(sellAsset, sellQuantity)); // Approve exchange to spend assets

        // Since there is only one openMakeOrder allowed for each asset, we can assume that openMakeOrderId is set as zero by quantityHeldInCustodyOfExchange() function
        assetsToOpenMakeOrderIds[sellAsset] = exchangeAdapter.makeOrder(address(module.exchange), sellAsset, buyAsset, sellQuantity, buyQuantity);

        // Success defined as non-zero order id
        require(assetsToOpenMakeOrderIds[sellAsset] != 0);

        // Update ownedAssets array and isInAssetList, isInOpenMakeOrder mapping
        isInOpenMakeOrder[buyAsset] = true;
        if (!isInAssetList[buyAsset]) {
            ownedAssets.push(buyAsset);
            isInAssetList[buyAsset] = true;
        }

        orders.push(Order({
            exchangeId: assetsToOpenMakeOrderIds[sellAsset],
            status: OrderStatus.active,
            orderType: OrderType.make,
            sellAsset: sellAsset,
            buyAsset: buyAsset,
            sellQuantity: sellQuantity,
            buyQuantity: buyQuantity,
            timestamp: now,
            fillQuantity: 0
        }));

        OrderUpdated(assetsToOpenMakeOrderIds[sellAsset]);
    }

    /// @notice Takes an active order on the selected exchange
    /// @dev These are orders that are expected to settle immediately
    /// @param id Active order id
    /// @param quantity Buy quantity of what others are selling on selected Exchange
    /**
    @return {
      "err": "If there is an error",
      "errMsg": "Error message"
    }
    */
    function takeOrder(uint id, uint quantity)
        external
        pre_cond(isOwner())
        pre_cond(notShutDown())

        returns (bool err, string errMsg)
    {
        // Get information of order by order id
        Order memory order; // Inverse variable terminology! Buying what another person is selling
        (
            order.sellAsset,
            order.buyAsset,
            order.sellQuantity,
            order.buyQuantity
        ) = exchangeAdapter.getOrder(address(module.exchange), id);
        // Check pre conditions
        require(module.pricefeed.existsPriceOnAssetPair(order.buyAsset, order.sellAsset)); // PriceFeed module: Requested asset pair not valid
        require(isInAssetList[order.sellAsset] || ownedAssets.length < MAX_FUND_ASSETS); // Limit for max ownable assets by the fund reached
        require(module.riskmgmt.isTakePermitted(
            module.pricefeed.getOrderPrice(order.sellAsset, order.buyQuantity, order.sellQuantity),
            module.pricefeed.getReferencePrice(order.buyAsset, order.sellAsset),
            order.sellAsset, order.buyAsset, order.sellQuantity, order.buyQuantity
        )); // RiskMgmt module: Take order not permitted
        require(quantity <= order.sellQuantity); // Not enough quantity of order for what is trying to be bought
        uint spendQuantity = quantity.mul(order.buyQuantity).div(order.sellQuantity);
        require(approveSpending(order.buyAsset, spendQuantity)); // Could not approve spending of spendQuantity of order.buyAsset

        // Execute request
        require(exchangeAdapter.takeOrder(address(module.exchange), id, quantity));

        // Update ownedAssets array and isInAssetList mapping
        if (!isInAssetList[order.sellAsset]) {
            ownedAssets.push(order.sellAsset);
            isInAssetList[order.sellAsset] = true;
        }

        order.exchangeId = id;
        order.status = OrderStatus.fullyFilled;
        order.orderType = OrderType.take;
        order.timestamp = now;
        order.fillQuantity = quantity;
        orders.push(order);
        OrderUpdated(id);
    }

    /// @notice Cancels orders that were not expected to settle immediately, i.e. makeOrders
    /// @dev Reduce exposure with exchange interaction
    /// @param id Active order id of this order array with order owner of this contract on selected Exchange
    /**
    @return {
      "err": "If there is an error",
      "errMsg": "Error message"
    }
    */
    function cancelOrder(uint id)
        external
        pre_cond(isOwner() || isShutDown)
        returns (bool err, string errMsg)
    {
        // Get information of fund order by order id
        Order memory order = orders[id];

        require(exchangeAdapter.cancelOrder(address(module.exchange), order.exchangeId)); // Exchange Adapter: Failed to cancel order

        order.status = OrderStatus.cancelled;

        OrderUpdated(id);
    }

    // NON-CONSTANT METHODS - REWARDS

    /// @notice Converts unclaimed fees of the manager into fund shares
    /// @dev Only Owner
    /**
    @return {
      "err": "If there is an error",
      "errMsg": "Error message"
    }
    */
    function convertUnclaimedRewards()
        external
        pre_cond(isOwner())
        pre_cond(notShutDown())
        returns (bool err, string errMsg)
    {
        var (
            gav,
            managementReward,
            performanceReward,
            unclaimedRewards,
            nav,
            sharePrice
        ) = performCalculations();

        if (isZero(gav)) {
            return logError("ERR: Gross asset value can't be zero");
        }

        if (isZero(unclaimedRewards)) {
            return logError("ERR: Nothing to convert as of now");
        }

        // Convert unclaimed rewards in form of ownerless shares into shares which belong to manager
        uint rewardsShareQuantity = totalSupply.mul(unclaimedRewards).div(gav);
        createShares(owner, rewardsShareQuantity); // Create shares and allocate them to manager

        // Update Calculations
        uint updatedHighWaterMark = atLastConversion.highWaterMark >= sharePrice ? atLastConversion.highWaterMark : sharePrice;
        atLastConversion = Calculations({
            gav: gav,
            managementReward: managementReward,
            performanceReward: performanceReward,
            unclaimedRewards: unclaimedRewards,
            nav: nav,
            highWaterMark: updatedHighWaterMark,
            totalSupply: totalSupply,
            timestamp: now
        });

        RewardsConverted(now, rewardsShareQuantity, unclaimedRewards);
        CalculationUpdate(now, managementReward, performanceReward, nav, sharePrice, totalSupply);
    }

    /// @notice Calculates gross asset value of the fund
    /// @dev Decimals in assets must be equal to decimals in PriceFeed for all entries in Universe
    /// @return gav Gross asset value denominated in [base unit of melonAsset]
    function calcGav() returns (uint gav) {
        address[] updatedOwnedAssets;
        for (uint i = 0; i < ownedAssets.length; ++i) {
            address ofAsset = ownedAssets[i];
            uint assetHoldings = uint(ERC20(ofAsset).balanceOf(this)) // Amount of asset base units this vault holds
                .add(quantityHeldInCustodyOfExchange(ofAsset));
            uint assetPrice = module.pricefeed.getPrice(ofAsset);
            uint assetDecimals = module.pricefeed.getDecimals(ofAsset);
            gav = gav.add(assetHoldings.mul(assetPrice).div(10 ** uint256(assetDecimals))); // Sum up product of asset holdings of this vault and asset prices
            if (assetHoldings != 0 || ofAsset == MELON_ASSET || isInOpenMakeOrder[ofAsset]) { // Check if asset holdings is not zero or is MELON_ASSET or in open make order
                updatedOwnedAssets.push(ofAsset);
            } else {
                isInAssetList[ofAsset] = false; // Remove from ownedAssets if asset holdings are zero
            }
            PortfolioContent(assetHoldings, assetPrice, assetDecimals);
        }
        // If some asset has been deleted from the list
        if (updatedOwnedAssets.length != ownedAssets.length) {
            ownedAssets = updatedOwnedAssets;
        }
    }

    /// @dev Quantity of asset held in exchange according to associated order id
    /// @param ofAsset Address of asset
    /// @return Quantity of input asset held in exchange
    function quantityHeldInCustodyOfExchange(address ofAsset) returns (uint) {
        if (assetsToOpenMakeOrderIds[ofAsset] == 0)
            return 0;
        var ( , buyAsset, sellQuantity, ) = exchangeAdapter.getOrder(address(module.exchange), assetsToOpenMakeOrderIds[ofAsset]);
        if (sellQuantity == 0) {
            assetsToOpenMakeOrderIds[ofAsset] = 0;
            isInOpenMakeOrder[buyAsset] = false;
        }
        return sellQuantity;
    }

    // INTERNAL METHODS

    function createShares(address recipient, uint shareQuantity) internal {
        totalSupply = totalSupply.add(shareQuantity);
        addShares(recipient, shareQuantity);
        Subscribed(msg.sender, now, shareQuantity);
    }

    function annihilateShares(address recipient, uint shareQuantity) internal {
        totalSupply = totalSupply.sub(shareQuantity);
        subShares(recipient, shareQuantity);
        Redeemed(msg.sender, now, shareQuantity);
    }

    function addShares(address recipient, uint shareQuantity) internal { balances[recipient] = balances[recipient].add(shareQuantity); }

    function subShares(address recipient, uint shareQuantity) internal { balances[recipient] = balances[recipient].sub(shareQuantity); }

    function logError(string message) internal returns (bool, string) {
        ErrorMessage(message);
        return (true, message);
    }

    function shutDownAndLogError(string message) internal returns (bool, string) {
        isShutDown = true;
        ErrorMessage(message);
        return (true, message);
    }
}
