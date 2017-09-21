pragma solidity ^0.4.11;

import {ERC20 as Shares} from './dependencies/ERC20.sol';
import './dependencies/DBC.sol';
import './dependencies/Owned.sol';
import './sphere/SphereInterface.sol';
import './libraries/safeMath.sol';
import './libraries/rewards.sol';
import './participation/ParticipationInterface.sol';
import './datafeeds/DataFeedInterface.sol';
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

    struct Modules { // Describes all modular parts, standardized through an interface
        DataFeedInterface datafeed; // Provides all external data
        ExchangeInterface exchange; // Wrapes exchange adapter into exchange interface
        ParticipationInterface participation; // Boolean functions regarding invest/redeem
        RiskMgmtInterface riskmgmt; // Boolean functions regarding make/take orders
    }

    struct Calculations { // List of internal calculations
        uint gav; // Gross asset value
        uint managementReward; // Time based reward
        uint performanceReward; // Performance based reward measured against REFERENCE_ASSET
        uint unclaimedRewards; // Rewards not yet allocated to fund manager
        uint nav; // Net asset value
        uint sharePrice; // A measure of fund performance
        uint totalSupply; // Total supply of shares
        uint timestamp; // When above has been calculated
    }

    struct InternalAccounting {
        uint numberOfMakeOrders; // Number of potentially unsettled orders
        mapping (address => uint) quantitySentToExchange;
        mapping (address => uint) quantityExpectedToReceive;
    }

    enum RequestStatus { open, cancelled, executed }
    enum RequestType { subscribe, redeem }
    struct Request { // Describes and logs whenever asset enter this fund
        address owner;
        RequestStatus status;
        RequestType requestType;
        uint numShares;
        uint offeredValue; // if requestType is subscribe
        uint requestedValue; // if requestType is redeem
        uint incentive;
        uint lastFeedUpdateId;
        uint lastFeedUpdateTime;
        uint timestamp;
    }

    enum OrderStatus { open, partiallyFilled, fullyFilled, cancelled }
    enum OrderType { make, take }
    struct Order { // Describes and logs whenever assets leave this fund
        uint exchangeId; // Id as returned from exchange
        address sellAsset; // Asset (as registred in Asset registrar) to be sold
        address buyAsset; // Asset (as registred in Asset registrar) to be bought
        uint sellQuantity; // Quantity of sellAsset to be sold
        uint buyQuantity; // Quantity of sellAsset to be bought
        uint timestamp; // Time in seconds when this order was created
        OrderStatus status; // Enum: open, partiallyFilled, fullyFilled, cancelled
        OrderType orderType; // Enum: make, take
        uint fillQuantity; // Buy quantity filled; Always less than buy_quantity
    }

    // FIELDS

    // Constant fields
    string constant SYMBOL = "MLN-Fund"; // Melon Fund Symbol
    uint256 public constant DECIMALS = 18; // Amount of deciamls sharePrice is denominated in
    uint public constant DIVISOR_FEE = 10 ** 15; // Reward are divided by this number
    uint public constant MAX_OPEN_ORDERS = 6; // Maximum number of open orders
    // Constructor fields
    string public NAME; // Name of this fund
    uint public CREATED; // Timestamp of Fund creation
    uint public MELON_BASE_UNITS; // One unit of share equals 10 ** DECIMALS of base unit of shares
    uint public MANAGEMENT_REWARD_RATE; // Reward rate in REFERENCE_ASSET per delta improvment
    uint public PERFORMANCE_REWARD_RATE; // Reward rate in REFERENCE_ASSET per managed seconds
    address public VERSION; // Address of Version contract
    address public EXCHANGE; // Other then redeem, assets can only be transferred to this, eg to an exchange
    address public MELON_ASSET; // Address of Melon asset contract
    ERC20 public MELON_CONTRACT; // Melon as ERC20 contract
    address public REFERENCE_ASSET; // Performance measured against value of this asset
    // Function fields
    Modules public module; // Struct which holds all the initialised module instances
    Calculations public atLastConversion; // Calculation results at last convertUnclaimedRewards() call
    InternalAccounting public internalAccounting; // Accounts for assets not held in custody of fund
    bool public isShutDown; // Security features, if yes than investing, managing, convertUnclaimedRewards gets blocked
    Request[] public requests; // All the requests this fund received from participants
    bool public isSubscribeAllowed; // User option, if false fund rejects Melon investments
    bool public isRedeemAllowed; // User option, if false fund rejects Melon redeemals; Reedemal using slices always possible
    Order[] public orders; // All the orders this fund placed on exchanges

    uint[] openOrderIds = new uint[](MAX_OPEN_ORDERS);
    mapping (address => uint) public previousHoldings; // Maps assets to holdings, needed for internal accounting

    // PRE, POST, INVARIANT CONDITIONS

    function isZero(uint x) internal returns (bool) { return x == 0; }
    function isFalse(bool x) internal returns (bool) { return x == false; }
    function isPastZero(uint x) internal returns (bool) { return 0 < x; }
    function notLessThan(uint x, uint y) internal returns (bool) { return x >= y; }
    function notGreaterThan(uint x, uint y) internal returns (bool) { return x <= y; }
    function isLargerThan(uint x, uint y) internal returns (bool) { return x > y; }
    function isLessThan(uint x, uint y) internal returns (bool) { return x < y; }
    function isEqualTo(uint x, uint y) internal returns (bool) { return x == y; }
    function isSubscribe(RequestType x) internal returns (bool) { return x == RequestType.subscribe; }
    function isRedeem(RequestType x) internal returns (bool) { return x == RequestType.redeem; }
    function notShutDown() internal returns (bool) { return !isShutDown; }
    function approveSpending(address ofAsset, uint quantity) internal returns (bool success)
    {
        success = ERC20(ofAsset).approve(EXCHANGE, quantity);
        SpendingApproved(EXCHANGE, ofAsset, quantity);
    }
    function balancesOfHolderAtLeast(address ofHolder, uint x) internal returns (bool) { return balances[ofHolder] >= x; }
    function isVersion() internal returns (bool) { return msg.sender == VERSION; }

    // CONSTANT METHODS

    function getName() constant returns (string) { return NAME; }
    function getSymbol() constant returns (string) { return SYMBOL; }
    function getDecimals() constant returns (uint) { return DECIMALS; }
    function getBaseUnits() constant returns (uint) { return MELON_BASE_UNITS; }
    function getModules() constant returns (address ,address, address, address) {
        return (
            address(module.datafeed),
            address(EXCHANGE),
            address(module.participation),
            address(module.riskmgmt)
        );
    }
    function getStake() constant returns (uint) { return balanceOf(this); }
    function getLastOrderId() constant returns (uint) { return orders.length - 1; }
    function getLastRequestId() constant returns (uint) { return requests.length - 1; }
    function noOpenOrders() internal returns (bool) { return isZero(internalAccounting.numberOfMakeOrders); }
    function quantitySentToExchange(address ofAsset) constant returns (uint) {
        internalAccounting.quantitySentToExchange[ofAsset];
    }
    function quantityExpectedToReceive(address ofAsset) constant returns (uint) {
        internalAccounting.quantityExpectedToReceive[ofAsset];
    }

    // CONSTANT METHODS - ACCOUNTING

    /// @dev Decimals in assets must be equal to decimals in PriceFeed for all entries in Universe
    /// @return Gross asset value denominated in [base unit of melonAsset]
    function calcGav() constant returns (uint gav) {
        for (uint i = 0; i < module.datafeed.numRegisteredAssets(); ++i) {
            address ofAsset = address(module.datafeed.getRegisteredAssetAt(i));
            uint assetHoldings = uint(ERC20(ofAsset).balanceOf(this)) // Amount of asset base units this vault holds
                .add(quantitySentToExchange(ofAsset));
            uint assetPrice = module.datafeed.getPrice(ofAsset);
            uint assetDecimals = module.datafeed.getDecimals(ofAsset);
            gav = gav.add(assetHoldings.mul(assetPrice).div(10 ** uint(assetDecimals))); // Sum up product of asset holdings of this vault and asset prices
            PortfolioContent(assetHoldings, assetPrice, assetDecimals);
        }
    }

    /// @param gav gross asset value of this fund
    /// @return The sum and its individual parts of all earned rewards denominated in [base unit of melonAsset]
    function calcUnclaimedRewards(uint gav)
        constant
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
            uint currSharePrice = calcValuePerShare(gav); // TODO Multiply w getInvertedPrice(ofReferenceAsset)
            if (currSharePrice > atLastConversion.sharePrice) {
              performanceReward = rewards.performanceReward(
                  PERFORMANCE_REWARD_RATE,
                  int(currSharePrice - atLastConversion.sharePrice),
                  totalSupply,
                  DIVISOR_FEE
              );
            }
        }
        unclaimedRewards = managementReward.add(performanceReward);
    }

    /// @dev Calculates the Net Asset Value
    /// @param gav gross asset value of this fund denominated in [base unit of melonAsset]
    /// @param unclaimedRewards the sum of all earned rewards denominated in [base unit of melonAsset]
    /// @return Net asset value denominated in [base unit of melonAsset]
    function calcNav(uint gav, uint unclaimedRewards)
        constant
        returns (uint nav)
    {
        nav = gav.sub(unclaimedRewards);
    }

    /// @dev Non-zero share supply; value denominated in [base unit of melonAsset]
    /// @return Share price denominated in [base unit of melonAsset * base unit of share / base unit of share] == [base unit of melonAsset]
    function calcValuePerShare(uint value)
        constant
        pre_cond(isPastZero(totalSupply))
        returns (uint valuePerShare)
    {
        valuePerShare = value.mul(MELON_BASE_UNITS).div(totalSupply);
    }

    /// @notice Calculates essential fund metrics
    /// @return Gav, managementReward, performanceReward, unclaimedRewards, nav, sharePrice denominated in [base unit of melonAsset]
    function performCalculations() constant returns (uint, uint, uint, uint, uint, uint) {
        uint gav = calcGav(); // Reflects value indepentent of fees
        var (managementReward, performanceReward, unclaimedRewards) = calcUnclaimedRewards(gav);
        uint nav = calcNav(gav, unclaimedRewards);
        uint sharePrice = isPastZero(totalSupply) ? calcValuePerShare(nav) : MELON_BASE_UNITS; // Handle potential division through zero by defining a default value
        return (gav, managementReward, performanceReward, unclaimedRewards, nav, sharePrice);
    }

    /// @notice Calculates sharePrice denominated in [base unit of melonAsset]
    /// @return sharePrice denominated in [base unit of melonAsset]
    function calcSharePrice() constant returns (uint)
    {
        var (, , , , , sharePrice) = performCalculations();
        return sharePrice;
    }

    // NON-CONSTANT METHODS

    function Fund(
        address ofManager,
        string withName,
        string withSymbol, // TODO remove
        uint withDecimals, // TODO remove
        uint ofManagementRewardRate,
        uint ofPerformanceRewardRate,
        address ofMelonAsset,
        address ofParticipation,
        address ofRiskMgmt,
        address ofSphere
    ) {
        SphereInterface sphere = SphereInterface(ofSphere);
        module.datafeed = DataFeedInterface(sphere.getDataFeed());
        // For later release initiate exchangeAdapter here: eg as exchangeAdapter = ExchangeInterface(sphere.getExchangeAdapter());
        isSubscribeAllowed = true;
        isRedeemAllowed = true;
        owner = ofManager;
        NAME = withName;
        MANAGEMENT_REWARD_RATE = ofManagementRewardRate;
        PERFORMANCE_REWARD_RATE = ofPerformanceRewardRate;
        VERSION = msg.sender;
        EXCHANGE = sphere.getExchange(); // Bridged to Melon exchange interface by exchangeAdapter library
        MELON_ASSET = ofMelonAsset;
        REFERENCE_ASSET = MELON_ASSET; // TODO let user decide
        MELON_CONTRACT = ERC20(MELON_ASSET);
        require(MELON_ASSET == module.datafeed.getQuoteAsset()); // Sanity check
        MELON_BASE_UNITS = 10 ** uint256(module.datafeed.getDecimals(MELON_ASSET));
        module.participation = ParticipationInterface(ofParticipation);
        module.riskmgmt = RiskMgmtInterface(ofRiskMgmt);
        atLastConversion = Calculations({
            gav: 0,
            managementReward: 0,
            performanceReward: 0,
            unclaimedRewards: 0,
            nav: 0,
            sharePrice: MELON_BASE_UNITS,
            totalSupply: totalSupply,
            timestamp: now
        });
        CREATED = now;
    }

    // NON-CONSTANT METHODS - ADMINISTRATION

    function increaseStake(uint numShares)
        external
        pre_cond(isOwner())
        pre_cond(notShutDown())
        pre_cond(isPastZero(numShares))
        pre_cond(balancesOfHolderAtLeast(msg.sender, numShares))
        pre_cond(noOpenOrders())
        post_cond(prevTotalSupply == totalSupply)
    {
        uint prevTotalSupply = totalSupply;
        subShares(msg.sender, numShares);
        addShares(this, numShares);
    }

    function decreaseStake(uint numShares)
        external
        pre_cond(isOwner())
        pre_cond(notShutDown())
        pre_cond(isPastZero(numShares))
        pre_cond(balancesOfHolderAtLeast(this, numShares))
        pre_cond(noOpenOrders())
        post_cond(prevTotalSupply == totalSupply)
    {
        uint prevTotalSupply = totalSupply;
        subShares(this, numShares);
        addShares(msg.sender, numShares);
    }

    function toogleSubscription()
        external
        pre_cond(isOwner())
    {
        isSubscribeAllowed = !isSubscribeAllowed;
    }

    function toggleRedemption()
        external
        pre_cond(isOwner())
    {
        isRedeemAllowed = !isRedeemAllowed;
    }

    function shutDown()
        pre_cond(isVersion() || isOwner())
    {
        isShutDown = true;
    }

    // NON-CONSTANT METHODS - PARTICIPATION

    /// @param numShares number of shares for offered value
    /// @param offeredValue denominated in [base unit of MELON_ASSET]
    /// @param incentiveValue non-zero incentive Value which is paid to workers for triggering executeRequest
    /// @return Pending subscription Request
    function requestSubscription(
        uint numShares,
        uint offeredValue,
        uint incentiveValue
    )
        external
        pre_cond(notShutDown())
        pre_cond(isSubscribeAllowed)
        pre_cond(isPastZero(incentiveValue))
        pre_cond(module.datafeed.isValid(MELON_ASSET))
        pre_cond(module.participation.isSubscriptionPermitted(
            msg.sender,
            numShares,
            offeredValue
        ))
        returns(uint id)
    {
        MELON_CONTRACT.transferFrom(msg.sender, this, offeredValue.add(incentiveValue));
        requests.push(Request({
            owner: msg.sender,
            status: RequestStatus.open,
            requestType: RequestType.subscribe,
            numShares: numShares,
            offeredValue: offeredValue,
            requestedValue: 0,
            incentive: incentiveValue,
            lastFeedUpdateId: module.datafeed.getLastUpdateId(),
            lastFeedUpdateTime: module.datafeed.getLastUpdateTimestamp(),
            timestamp: now
        }));
        id = getLastRequestId();
        SubscribeRequest(id, msg.sender, now, numShares);
    }

    /// @dev Pre:  Redeemer has at least `numShares` shares; redeemer approved this contract to handle shares
    /// @return Redeemer lost `numShares`, and gained `numShares * value` of Melon asset
    function requestRedemption(
        uint numShares,
        uint requestedValue,
        uint incentiveValue
      )
        external
        pre_cond(notShutDown())
        pre_cond(isRedeemAllowed)
        pre_cond(isPastZero(numShares))
        pre_cond(module.participation.isRedemptionPermitted(
            msg.sender,
            numShares,
            requestedValue
        ))
        returns (uint id)
    {
        requests.push(Request({
            owner: msg.sender,
            status: RequestStatus.open,
            requestType: RequestType.redeem,
            numShares: numShares,
            offeredValue: 0,
            requestedValue: requestedValue,
            incentive: incentiveValue,
            lastFeedUpdateId: module.datafeed.getLastUpdateId(),
            lastFeedUpdateTime: module.datafeed.getLastUpdateTimestamp(),
            timestamp: now
        }));
        id = getLastRequestId();
        RedeemRequest(id, msg.sender, now, numShares);
    }

    /// @dev Pre: Anyone can trigger this function; Id of request that is pending
    /// @return Worker either cancelled or fullfilled request
    function executeRequest(uint requestId)
        external
        pre_cond(notShutDown())
        pre_cond(isSubscribe(requests[requestId].requestType) || isRedeem(requests[requestId].requestType))
        pre_cond(notLessThan(now, requests[requestId].timestamp.add(module.datafeed.getInterval())))
        pre_cond(notLessThan(module.datafeed.getLastUpdateId(), requests[requestId].lastFeedUpdateId + 2))
    {
        // Time and updates have passed
        Request request = requests[requestId];
        uint actualValue = request.numShares.mul(calcSharePrice()).div(MELON_BASE_UNITS); // denominated in [base unit of MELON_ASSET]
        request.status = RequestStatus.executed;
        if (isSubscribe(request.requestType) && notLessThan(request.offeredValue, actualValue)) { // Limit Order is OK
            assert(MELON_CONTRACT.transfer(msg.sender, request.incentive)); // Reward Worker
            uint remainder = request.offeredValue.sub(actualValue);
            if(isPastZero(remainder)) {
                assert(MELON_CONTRACT.transfer(request.owner, remainder)); // Return remainder
            }
            createShares(request.owner, request.numShares); // Accounting
        } else if (isRedeem(request.requestType) && notGreaterThan(request.requestedValue, actualValue)) {
            assert(MELON_CONTRACT.transfer(msg.sender, request.incentive)); // Reward Worker
            assert(MELON_CONTRACT.transfer(request.owner, request.requestedValue)); // Transfer value
            annihilateShares(request.owner, request.numShares); // Accounting
        }
    }

    function cancelRequest(uint requestId)
        external
        pre_cond(isSubscribe(requests[requestId].requestType) || isRedeem(requests[requestId].requestType))
        pre_cond(requests[requestId].owner == msg.sender || isShutDown)
    {
        Request request = requests[requestId];
        request.status = RequestStatus.cancelled;
        assert(MELON_CONTRACT.transfer(msg.sender, request.incentive));
        if (isSubscribe(request.requestType)) {
            assert(MELON_CONTRACT.transfer(request.owner, request.offeredValue));
        }
    }

    /// @dev Independent of running price feed! Contains evil for loop, module.datafeed.numRegisteredAssets() needs to be limited
    /// @param numShares numer of shares owned by msg.sender which msg.sender would like to receive
    /// @return Transfer percentage of all assets from Fund to Investor and annihilate numShares of shares.
    function redeemUsingSlice(uint numShares)
        external
        pre_cond(balancesOfHolderAtLeast(msg.sender, numShares))
    {
        // Current Value
        uint prevTotalSupply = totalSupply.sub(atLastConversion.unclaimedRewards); // TODO Fix calculation
        assert(isPastZero(prevTotalSupply));
        annihilateShares(msg.sender, numShares); // Destroy _before_ external calls to prevent reentrancy
        // Transfer ownershipQuantity of Assets
        for (uint i = 0; i < module.datafeed.numRegisteredAssets(); ++i) {
            address ofAsset = address(module.datafeed.getRegisteredAssetAt(i));
            uint assetHoldings = ERC20(ofAsset).balanceOf(this);
            if (assetHoldings == 0) continue;
            uint ownershipQuantity = assetHoldings.mul(numShares).div(prevTotalSupply); // ownership percentage of msg.sender
            if (isLessThan(ownershipQuantity, assetHoldings)) { // Less available than what is owned - Eg in case of unreturned asset quantity at EXCHANGE address
                isShutDown = true; // Shutdown allows open orders to be cancelled, eg. to return
            }
            assert(ERC20(ofAsset).transfer(msg.sender, ownershipQuantity)); // Send funds from vault to investor
        }
        Redeemed(msg.sender, now, numShares);
    }

    function createShares(address recipient, uint numShares) internal {
        totalSupply = totalSupply.add(numShares);
        addShares(recipient, numShares);
        Subscribed(msg.sender, now, numShares);
    }

    function annihilateShares(address recipient, uint numShares) internal {
        totalSupply = totalSupply.sub(numShares);
        subShares(recipient, numShares);
        Redeemed(msg.sender, now, numShares);
    }

    function addShares(address recipient, uint numShares) internal {
        balances[recipient] = balances[recipient].add(numShares);
    }

    function subShares(address recipient, uint numShares) internal {
        balances[recipient] = balances[recipient].sub(numShares);
    }

    // NON-CONSTANT METHODS - MANAGING

    /// @notice These are orders that are not expected to settle immediately
    /// @dev Sufficient balance (== sellQuantity) of sellAsset
    /// @param sellAsset Asset (as registred in Asset registrar) to be sold
    /// @param buyAsset Asset (as registred in Asset registrar) to be bought
    /// @param sellQuantity Quantity of sellAsset to be sold
    /// @param buyQuantity Quantity of sellAsset to be bought
    /// @return Make offer on selected Exchange
    function makeOrder(
        address sellAsset,
        address buyAsset,
        uint sellQuantity,
        uint buyQuantity
    )
        external
        pre_cond(isOwner())
        pre_cond(notShutDown())
        returns (uint id)
    {
        if (isFalse(module.datafeed.existsData(sellAsset, buyAsset))) { LogError(0); return; }
        if (isFalse(module.riskmgmt.isMakePermitted(
            module.datafeed.getOrderPrice(sellQuantity, buyQuantity),
            module.datafeed.getReferencePrice(sellAsset, buyAsset),
            buyQuantity
        ))) { LogError(1); return; }
        if (isFalse(approveSpending(sellAsset, sellQuantity))) { LogError(2); return; }
        id = exchangeAdapter.makeOrder(EXCHANGE, sellAsset, buyAsset, sellQuantity, buyQuantity);
        if (isZero(id)) { LogError(3); return; } // TODO: check accuracy of this
        orders.push(Order({
            exchangeId: id,
            sellAsset: sellAsset,
            buyAsset: buyAsset,
            sellQuantity: sellQuantity,
            buyQuantity: buyQuantity,
            timestamp: now,
            status: OrderStatus.open,
            orderType: OrderType.make,
            fillQuantity: 0
        }));
        internalAccounting.quantitySentToExchange[sellAsset] =
            quantitySentToExchange(sellAsset)
            .add(sellQuantity);
        internalAccounting.quantityExpectedToReceive[buyAsset] =
            quantityExpectedToReceive(buyAsset)
            .add(buyQuantity);
        OrderUpdated(id);
    }

    /// @notice These are orders that are expected to settle immediately
    /// @param id Active order id
    /// @param quantity valid buy quantity of what others are selling on selected Exchange
    /// @return Take offer on selected Exchange
    function takeOrder(uint id, uint quantity)
        external
        pre_cond(isOwner())
        pre_cond(notShutDown())
        returns (bool success)
    {
        Order memory order; // Inverse variable terminology! Buying what another person is selling
        (
            order.sellAsset,
            order.buyAsset,
            order.sellQuantity,
            order.buyQuantity
        ) = exchangeAdapter.getOrder(EXCHANGE, id);
        if (isFalse(module.datafeed.existsData(order.buyAsset, order.sellAsset))) { LogError(0); return; }
        if (isFalse(module.riskmgmt.isTakePermitted(
            // TODO check: Buying what is being sold and selling what is being bought
            module.datafeed.getOrderPrice(order.buyQuantity, order.sellQuantity),
            module.datafeed.getReferencePrice(order.buyAsset, order.sellAsset),
            order.sellQuantity // Quantity about to be received
        ))) { LogError(1); return; }
        if (isFalse(quantity <= order.sellQuantity)) { LogError(2); return; }
        if (isFalse(approveSpending(order.buyAsset, quantity))) { LogError(3); return; }
        success = exchangeAdapter.takeOrder(EXCHANGE, id, quantity);
        if (isFalse(success)) { LogError(4); return; }
        order.exchangeId = id;
        order.timestamp = now;
        order.status = OrderStatus.fullyFilled;
        order.orderType = OrderType.take;
        order.fillQuantity = quantity;
        orders.push(order);
        OrderUpdated(id);
    }

    /// @notice Cancel orders that were not expected to settle immediately, i.e. makeOrders
    /// @param id Active order id with order owner of this contract on selected Exchange
    /// @return Whether order successfully cancelled on selected Exchange
    function cancelOrder(uint id)
        external
        pre_cond(isOwner() || isShutDown)
        returns (bool success)
    {
        Order memory order = orders[id];
        success = exchangeAdapter.cancelOrder(EXCHANGE, order.exchangeId);
        if (isFalse(success)) { LogError(0); return; }
        internalAccounting.quantitySentToExchange[order.sellAsset] =
            quantitySentToExchange(order.sellAsset)
            .sub(order.sellQuantity);
        internalAccounting.quantityExpectedToReceive[order.buyAsset] =
            quantityExpectedToReceive(order.buyAsset)
            .sub(order.buyQuantity);
        OrderUpdated(id);
    }

    //TODO: add previousHoldings
    /// @param sellAsset Asset (as registred in Asset registrar) to be sold
    /// @param buyAsset Asset (as registred in Asset registrar) to be bought
    function closeOpenOrders(address sellAsset, address buyAsset)
        constant
    {
        for (uint i = 0; i < openOrderIds.length; i++) {
            Order thisOrder = orders[openOrderIds[i]];
            if (thisOrder.sellAsset == sellAsset && thisOrder.buyAsset == buyAsset) {
                proofOfEmbezzlement(sellAsset, buyAsset);
                delete openOrderIds[i]; // Free up open order slot
                // TODO: fix pot incorrect OrderStatus - partiallyFilled
                thisOrder.status = OrderStatus.fullyFilled;
                //  update previousHoldings
                // TODO: trigger for each proofOfEmbezzlement() call
                previousHoldings[sellAsset] = ERC20(sellAsset).balanceOf(this);
                previousHoldings[buyAsset] = ERC20(buyAsset).balanceOf(this);
            }
        }
    }

    /// @notice Whether embezzlement happened
    /// @dev Specific asset pair (ofBase.ofQuote) where by convention ofBase is asset being sold and ofQuote asset being bought
    /// @return True if embezzled otherwise false
    function proofOfEmbezzlement(address sellAsset, address buyAsset)
        constant
        returns (bool)
    {
        // Sold more than expected => Proof of Embezzlemnt
        uint totalIntendedSellQty = quantitySentToExchange(sellAsset); // Trade intention
        if (isLargerThan(
            previousHoldings[sellAsset].sub(totalIntendedSellQty), // Intended qty sold
            ERC20(sellAsset).balanceOf(this) // Actual qty sold
        )) {
            isShutDown = true;
            // TODO: Allocate staked shares from this to msg.sender
            return true;
        }
        // Sold less or equal than intended
        uint factor = 10000;
        uint divisor = factor;
        if (isLessThan(
            previousHoldings[sellAsset].sub(totalIntendedSellQty), // Intended qty sold
            ERC20(sellAsset).balanceOf(this) // Actual qty sold
        )) { // Sold less than intended
            factor = divisor
                .mul(previousHoldings[sellAsset].sub(ERC20(sellAsset).balanceOf(this)))
                .div(totalIntendedSellQty);
        }
        // Sold at a worse price than expected => Proof of Embezzlemnt
        uint totalIntendedBuyQty = quantityExpectedToReceive(buyAsset); // Trade execution
        uint totalExpectedBuyQty = totalIntendedBuyQty.mul(factor).div(divisor);
        if (isLargerThan(
            previousHoldings[buyAsset].add(totalExpectedBuyQty), // Expected qty bought
            ERC20(buyAsset).balanceOf(this) // Actual qty sold
        )) {
            isShutDown = true;
            // TODO: Allocate staked shares from this to msg.sender
            return true;
        }
        return false;
    }

    // NON-CONSTANT METHODS - REWARDS

    /// @dev Only Owner
    /// @return Unclaimed fees of manager are converted into shares of the Owner of this fund.
    function convertUnclaimedRewards()
        external
        pre_cond(isOwner())
        pre_cond(notShutDown())
        pre_cond(noOpenOrders())
    {
        var (
            gav,
            managementReward,
            performanceReward,
            unclaimedRewards,
            nav,
            sharePrice
        ) = performCalculations();
        assert(isPastZero(gav));

        // Accounting: Allocate unclaimedRewards to this fund
        uint numShares = totalSupply.mul(unclaimedRewards).div(gav);
        addShares(owner, numShares);
        // Update Calculations
        atLastConversion = Calculations({
            gav: gav,
            managementReward: managementReward,
            performanceReward: performanceReward,
            unclaimedRewards: unclaimedRewards,
            nav: nav,
            sharePrice: sharePrice,
            totalSupply: totalSupply,
            timestamp: now
        });

        RewardsConverted(now, numShares, unclaimedRewards);
        CalculationUpdate(now, managementReward, performanceReward, nav, sharePrice, totalSupply);
    }
}
