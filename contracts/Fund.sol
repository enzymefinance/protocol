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
        uint lastDataFeedUpdateId; // Data feed module specifc id of last update
        uint lastDataFeedUpdateTime; // Data feed module specifc timestamp of last update
        uint timestamp; // Time of request creation
    }

    enum OrderStatus { active, partiallyFilled, fullyFilled, cancelled }
    enum OrderType { make, take }
    struct Order { // Describes and logs whenever assets enter and leave fund due to Manager
        uint exchangeId; // Id as returned from exchange
        OrderStatus status; // Enum: active, partiallyFilled, fullyFilled, cancelled
        OrderType orderType; // Enum: make, take
        address sellAsset; // Asset (as registred in Asset registrar) to be sold
        address buyAsset; // Asset (as registred in Asset registrar) to be bought
        uint sellQuantity; // Quantity of sellAsset to be sold
        uint buyQuantity; // Quantity of sellAsset to be bought
        uint timestamp; // Time in seconds when this order was created
        uint fillQuantity; // Buy quantity filled; Always less than buy_quantity
    }

    // FIELDS

    // Constant fields
    string constant SYMBOL = "MLN-Fund"; // Melon Fund Symbol
    uint256 public constant DECIMALS = 18; // Amount of deciamls sharePrice is denominated in
    uint public constant DIVISOR_FEE = 10 ** uint256(15); // Reward are divided by this number
    // Constructor fields
    string public NAME; // Name of this fund
    uint public CREATED; // Timestamp of Fund creation
    uint public MELON_IN_BASE_UNITS; // One unit of share equals 10 ** uint256(DECIMALS) of base unit of shares
    uint public MANAGEMENT_REWARD_RATE; // Reward rate in REFERENCE_ASSET per delta improvment
    uint public PERFORMANCE_REWARD_RATE; // Reward rate in REFERENCE_ASSET per managed seconds
    address public VERSION; // Address of Version contract
    address public EXCHANGE; // Other then redeem, assets can only be transferred to this, eg to an exchange
    address public MELON_ASSET; // Address of Melon asset contract
    ERC20 public MELON_CONTRACT; // Melon as ERC20 contract
    address public REFERENCE_ASSET; // Performance measured against value of this asset
    // Methods fields
    Modules public module; // Struct which holds all the initialised module instances
    Calculations public atLastConversion; // Calculation results at last convertUnclaimedRewards() call
    uint public openMakeOrderId; // exchange id of open make order, if no open make orders uint is zero
    bool public isShutDown; // Security features, if yes than investing, managing, convertUnclaimedRewards gets blocked
    Request[] public requests; // All the requests this fund received from participants
    bool public isSubscribeAllowed; // User option, if false fund rejects Melon investments
    bool public isRedeemAllowed; // User option, if false fund rejects Melon redeemals; Reedemal using slices always possible
    Order[] public orders; // All the orders this fund placed on exchanges

    // PRE, POST, INVARIANT CONDITIONS

    function isZero(uint x) internal returns (bool) { x == 0; }
    function isFalse(bool x) internal returns (bool) { return x == false; }
    function isPastZero(uint x) internal returns (bool) { return 0 < x; }
    function isLargerThan(uint x, uint y) internal returns (bool) { return x > y; }
    function isLessThan(uint x, uint y) internal returns (bool) { return x < y; }
    function notShutDown() internal returns (bool) { return !isShutDown; }
    function approveSpending(address ofAsset, uint quantity) internal returns (bool success) {
        success = ERC20(ofAsset).approve(EXCHANGE, quantity);
        SpendingApproved(EXCHANGE, ofAsset, quantity);
    }
    function balancesOfHolderAtLeast(address ofHolder, uint x) internal returns (bool) { return balances[ofHolder] >= x; }
    function isVersion() internal returns (bool) { return msg.sender == VERSION; }

    // CONSTANT METHODS

    function getName() constant returns (string) { return NAME; }
    function getSymbol() constant returns (string) { return SYMBOL; }
    function getDecimals() constant returns (uint) { return DECIMALS; }
    function getCreationTime() constant returns (uint) { return CREATED; }
    function getBaseUnits() constant returns (uint) { return MELON_IN_BASE_UNITS; }
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
    function quantityHeldInCustodyOfExchange(address ofAsset) constant returns (uint) {
        if (openMakeOrderId == 0) return 0;
        var ( , , sellQuantity, ) = exchangeAdapter.getOrder(EXCHANGE, openMakeOrderId);
        if (sellQuantity == 0) openMakeOrderId = 0;
        return sellQuantity;
    }

    // CONSTANT METHODS - ACCOUNTING

    /// @dev Decimals in assets must be equal to decimals in PriceFeed for all entries in Universe
    /// @return gav Gross asset value denominated in [base unit of melonAsset]
    function calcGav() constant returns (uint gav) {
        for (uint i = 0; i < module.datafeed.numRegisteredAssets(); ++i) {
            address ofAsset = address(module.datafeed.getRegisteredAssetAt(i));
            uint assetHoldings = uint(ERC20(ofAsset).balanceOf(this)) // Amount of asset base units this vault holds
                .add(quantityHeldInCustodyOfExchange(ofAsset));
            uint assetPrice = module.datafeed.getPrice(ofAsset);
            uint assetDecimals = module.datafeed.getDecimals(ofAsset);
            gav = gav.add(assetHoldings.mul(assetPrice).div(10 ** uint256(assetDecimals))); // Sum up product of asset holdings of this vault and asset prices
            PortfolioContent(assetHoldings, assetPrice, assetDecimals);
        }
    }

    /// @param gav gross asset value of this fund
    /// @return managementReward A time (seconds) based reward
    /// @return performanceReward A performance (rise of sharePrice measured in REFERENCE_ASSET) based reward
    /// @return unclaimedRewards The sum of above two rewards denominated in [base unit of melonAsset]
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
    /// @return nav net asset value denominated in [base unit of melonAsset]
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
        valuePerShare = value.mul(MELON_IN_BASE_UNITS).div(totalSupply);
    }

    /// @notice Calculates essential fund metrics
    /// @return gav gross asset value of this fund denominated in [base unit of melonAsset]
    /// @return managementReward A time (seconds) based reward
    /// @return performanceReward A performance (rise of sharePrice measured in REFERENCE_ASSET) based reward
    /// @return unclaimedRewards The sum of above two rewards denominated in [base unit of melonAsset]
    /// @return nav net asset value denominated in [base unit of melonAsset]
    /// @return sharePrice denominated in [base unit of melonAsset]
    function performCalculations() constant returns (uint, uint, uint, uint, uint, uint) {
        uint gav = calcGav(); // Reflects value indepentent of fees
        var (managementReward, performanceReward, unclaimedRewards) = calcUnclaimedRewards(gav);
        uint nav = calcNav(gav, unclaimedRewards);
        uint sharePrice = isPastZero(totalSupply) ? calcValuePerShare(nav) : MELON_IN_BASE_UNITS; // Handle potential division through zero by defining a default value
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

    /*/// @param ofManger owner of this fund, person who can manage asset holdings
    /// @param name human-readable describive name (not necessarily unique)
    /// @param ofReferenceAsset asset against which performance reward is measured against§
    /// @param ofManagementRewardRate
    /// @param ofPerformanceRewardRate
    /// @param ofMelonAsset
    /// @param ofParticipation
    /// @param ofRiskMgmt
    /// @param ofSphere*/
    function Fund(
        address ofManager,
        string withName,
        address ofReferenceAsset,
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
        REFERENCE_ASSET = ofReferenceAsset;
        MELON_CONTRACT = ERC20(MELON_ASSET);
        require(MELON_ASSET == module.datafeed.getQuoteAsset()); // Sanity check
        MELON_IN_BASE_UNITS = 10 ** uint256(module.datafeed.getDecimals(MELON_ASSET));
        module.participation = ParticipationInterface(ofParticipation);
        module.riskmgmt = RiskMgmtInterface(ofRiskMgmt);
        atLastConversion = Calculations({
            gav: 0,
            managementReward: 0,
            performanceReward: 0,
            unclaimedRewards: 0,
            nav: 0,
            sharePrice: MELON_IN_BASE_UNITS,
            totalSupply: totalSupply,
            timestamp: now
        });
        CREATED = now;
    }

    // NON-CONSTANT METHODS - ADMINISTRATION

    function toogleSubscription() external pre_cond(isOwner()) { isSubscribeAllowed = !isSubscribeAllowed; }
    function toggleRedemption() external pre_cond(isOwner()) { isRedeemAllowed = !isRedeemAllowed; }
    function shutDown() external pre_cond(isVersion() || isOwner()) { isShutDown = true; }

    // NON-CONSTANT METHODS - PARTICIPATION

    /// @notice Give melons to receive shares of this fund
    /// @dev Recommended to give some leeway in prices to account for possibly slightly changing prices
    /// @param giveQuantity Quantity of Melon token times 10 ** 18 offered to receive shareQuantity
    /// @param shareQuantity Quantity of shares times 10 ** 18 requested to be received
    /// @param incentiveQuantity Quantity in Melon asset to give to person executing request
    /// @return active subscription request
    function requestSubscription(
        uint giveQuantity,
        uint shareQuantity,
        uint incentiveQuantity
    )
        external
        pre_cond(notShutDown())
        returns(bool, string)
    {
        returnError(
            isSubscribeAllowed,
            "ERR: Subscription using Melon has been deactivated by Manager"
        );

        returnError(
            module.participation.isSubscriptionPermitted(
                msg.sender, // Address ofParticipant
                giveQuantity, // uint256 giveQuantity
                shareQuantity // uint256 shareQuantity
            ),
            "ERR: Participation Module: Subscription not permitted"
        );

        requests.push(Request({
            participant: msg.sender,
            status: RequestStatus.active,
            requestType: RequestType.subscribe,
            shareQuantity: shareQuantity,
            giveQuantity: giveQuantity,
            receiveQuantity: shareQuantity,
            incentiveQuantity: incentiveQuantity,
            lastDataFeedUpdateId: module.datafeed.getLastUpdateId(),
            lastDataFeedUpdateTime: module.datafeed.getLastUpdateTimestamp(),
            timestamp: now
        }));
        RequestUpdated(getLastRequestId());
    }

    /// @notice Give shares to receive melons of this fund
    /// @dev Recommended to give some leeway in prices to account for possibly slightly changing prices
    /// @param shareQuantity Quantity of shares times 10 ** 18 offered to redeem
    /// @param receiveQuantity Quantity of Melon token times 10 ** 18 requested to receive for shareQuantity
    /// @param incentiveQuantity Quantity in Melon asset to give to person executing request
    /// @return active redemption request
    function requestRedemption(
        uint shareQuantity,
        uint receiveQuantity,
        uint incentiveQuantity
      )
        external
        pre_cond(notShutDown())
        returns (bool, string)
    {
        returnError(
            isRedeemAllowed,
            "ERR: Redemption using Melon has been deactivated by Manager"
        );

        returnError(
            module.participation.isRedemptionPermitted(
                msg.sender, // Address ofParticipant
                shareQuantity, // uint256 giveQuantity
                receiveQuantity // uint256 receiveQuantity
            ),
            "ERR: Participation Module: Redemption not permitted"
        );

        requests.push(Request({
            participant: msg.sender,
            status: RequestStatus.active,
            requestType: RequestType.redeem,
            shareQuantity: shareQuantity,
            giveQuantity: shareQuantity,
            receiveQuantity: receiveQuantity,
            incentiveQuantity: incentiveQuantity,
            lastDataFeedUpdateId: module.datafeed.getLastUpdateId(),
            lastDataFeedUpdateTime: module.datafeed.getLastUpdateTimestamp(),
            timestamp: now
        }));
        RequestUpdated(getLastRequestId());
    }

    /// @notice Executes active subscription and redemption requests, in a way that minimizes information advantages of investor
    /// @dev Distributes melon and shares according to request
    /// @param id Index of request to be executed
    /// @dev active subscription or redemption request executed
    function executeRequest(uint id)
        external
        pre_cond(notShutDown())
        returns (bool, string)
    {
        Request request = requests[id];

        returnError(
            request.status == RequestStatus.active,
            "ERR: Request is not active"
        );

        returnError(
            request.timestamp.add(module.datafeed.getInterval()) <= now,
            "ERR: DataFeed Module: Wait at least one interval before continuing"
        );

        returnError(
            request.lastDataFeedUpdateId.add(2) <= module.datafeed.getLastUpdateId(),
            "ERR: DataFeed Module: Wait at least for two updates before continuing"
        );

        uint actualQuantity = request.shareQuantity
            .mul(calcSharePrice()) // denominated in [base unit of MELON_ASSET]
            .div(MELON_IN_BASE_UNITS);

        request.status = RequestStatus.executed;

        if (
            request.requestType == RequestType.subscribe &&
            actualQuantity <= request.giveQuantity
        ) {
            assert(MELON_CONTRACT.transferFrom(request.participant, msg.sender, request.incentiveQuantity)); // Reward Worker
            assert(MELON_CONTRACT.transferFrom(request.participant, this, actualQuantity)); // Allocate Value
            createShares(request.participant, request.shareQuantity); // Accounting
        } else if (
            request.requestType == RequestType.redeem &&
            request.receiveQuantity <= actualQuantity
        ) {
            assert(MELON_CONTRACT.transferFrom(request.participant, msg.sender, request.incentiveQuantity)); // Reward Worker
            assert(MELON_CONTRACT.transfer(request.participant, request.receiveQuantity)); // Return value
            annihilateShares(request.participant, request.shareQuantity); // Accounting
        }
    }

    /// @notice Cancelles active subscription and redemption requests
    /// @param id Index of request to be executed
    /// @return active subscription or redemption request cancelled
    function cancelRequest(uint id)
        external
        returns (bool, string)
    {
        Request request = requests[id];

        returnError(
            request.status == RequestStatus.active,
            "ERR: Request is not active"
        );

        returnError(
            request.participant == msg.sender ||
            isShutDown,
            "ERR: Neither request creator nor is fund shut down"
        );

        request.status = RequestStatus.cancelled;
    }

    /// @notice Redeems by allocating a ownership percentage of each asset to participant
    /// @dev Independent of running price feed! Contains evil for loop, module.datafeed.numRegisteredAssets() needs to be limited
    /// @param shareQuantity numer of shares owned by participant which participant would like to receive
    /// @return Transfer percentage of all assets from Fund to Investor and annihilate shareQuantity of shares.
    function redeemUsingSlice(uint shareQuantity)
        external
        returns (bool, string)
    {
        returnError(
            balancesOfHolderAtLeast(msg.sender, shareQuantity),
            "ERR: Sender does not own enough shares"
        );

        // Quantity of shares which belong to the investors
        var (gav, , , , nav, ) = performCalculations();
        uint participantsTotalSupplyBeforeRedeem = totalSupply.mul(nav).div(gav);

        returnError(
            isPastZero(participantsTotalSupplyBeforeRedeem),
            "ERR: Sender does not own enough shares"
        );

        annihilateShares(msg.sender, shareQuantity); // Annihilate shares before external calls to prevent reentrancy
        // Transfer ownershipQuantity of Assets
        for (uint i = 0; i < module.datafeed.numRegisteredAssets(); ++i) {
            address ofAsset = address(module.datafeed.getRegisteredAssetAt(i));
            uint assetHoldings = ERC20(ofAsset).balanceOf(this);
            if (assetHoldings == 0) continue;
            uint ownershipQuantity = assetHoldings // ownership percentage of participant of asset holdings
                .mul(shareQuantity)
                .div(participantsTotalSupplyBeforeRedeem);

            returnCriticalError(
                isLessThan(ownershipQuantity, assetHoldings), // Less available than what is owned - Eg in case of unreturned asset quantity at EXCHANGE address
                "CRITICAL ERR: Not enough assetHoldings for owed ownershipQuantitiy"
            );

            returnCriticalError(
                ERC20(ofAsset).transfer(msg.sender, ownershipQuantity), // Send funds from vault to investor
                "CRITICAL ERR: Transfer of an asset failed!"
            );
        }
        Redeemed(msg.sender, now, shareQuantity);
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
        returns (bool, string)
    {
        returnError(
            quantityHeldInCustodyOfExchange(sellAsset) == 0,
            "ERR: Curr only one make order per sellAsset allowed. Please wait or cancel existing make order."
        );

        returnError(
            module.datafeed.existsData(sellAsset, buyAsset),
            "ERR: DataFeed module: Requested asset pair not valid"
        );

        returnError(
            module.riskmgmt.isMakePermitted(
                module.datafeed.getOrderPrice(sellQuantity, buyQuantity),
                module.datafeed.getReferencePrice(sellAsset, buyAsset),
                sellAsset,
                buyAsset,
                sellQuantity,
                buyQuantity
            ),
            "ERR: RiskMgmt module: Make order not permitted"
        );

        returnError(
            approveSpending(sellAsset, sellQuantity),
            "ERR: Could not approve spending of sellQuantity of sellAsset"
        );

        uint id = exchangeAdapter.makeOrder(EXCHANGE, sellAsset, buyAsset, sellQuantity, buyQuantity);

        returnError(
            isPastZero(id),
            "ERR: Exchange Adapter: Failed to make order"
        );

        orders.push(Order({
            exchangeId: id,
            status: OrderStatus.active,
            orderType: OrderType.make,
            sellAsset: sellAsset,
            buyAsset: buyAsset,
            sellQuantity: sellQuantity,
            buyQuantity: buyQuantity,
            timestamp: now,
            fillQuantity: 0
        }));

        OrderUpdated(id);
    }

    /// @notice These are orders that are expected to settle immediately
    /// @param id Active order id
    /// @param quantity Buy quantity of what others are selling on selected Exchange
    /// @return Take offer on selected Exchange
    function takeOrder(uint id, uint quantity)
        external
        pre_cond(isOwner())
        pre_cond(notShutDown())
        returns (bool, string)
    {
        Order memory order; // Inverse variable terminology! Buying what another person is selling
        (
            order.sellAsset,
            order.buyAsset,
            order.sellQuantity,
            order.buyQuantity
        ) = exchangeAdapter.getOrder(EXCHANGE, id);

        returnError(
            module.datafeed.existsData(order.buyAsset, order.sellAsset),
            "ERR: DataFeed module: Requested asset pair not valid"
        );

        returnError(
            module.riskmgmt.isTakePermitted(
                module.datafeed.getOrderPrice(order.buyQuantity, order.sellQuantity), // TODO check: Buying what is being sold and selling what is being bought
                module.datafeed.getReferencePrice(order.buyAsset, order.sellAsset),
                order.sellAsset,
                order.buyAsset,
                order.sellQuantity,
                order.buyQuantity
            ),
            "ERR: RiskMgmt module: Take order not permitted"
        );

        returnError(
            quantity <= order.sellQuantity,
            "ERR: Not enough quantity of order for what is trying to be bhought"
        );

        uint spendQuantity = quantity.mul(order.buyQuantity).div(order.sellQuantity);

        returnError(
            approveSpending(order.buyAsset, spendQuantity),
            "ERR: Could not approve spending of spendQuantity of order.buyAsset"
        );

        bool success = exchangeAdapter.takeOrder(EXCHANGE, id, quantity);

        returnError(
            success,
            "ERR: Exchange Adapter: Failed to take order"
        );

        order.exchangeId = id;
        order.status = OrderStatus.fullyFilled;
        order.orderType = OrderType.take;
        order.timestamp = now;
        order.fillQuantity = quantity;
        orders.push(order);
        OrderUpdated(id);
    }

    /// @notice Reduce exposure with exchange interaction
    /// @dev Cancel orders that were not expected to settle immediately, i.e. makeOrders
    /// @param id Active order id of this order array with order owner of this contract on selected Exchange
    /// @return Whether order successfully cancelled on selected Exchange
    function cancelOrder(uint id)
        external
        pre_cond(isOwner() || isShutDown)
        returns (bool, string)
    {
        Order memory order = orders[id];

        bytes32 assetPair = sha3(order.sellAsset, order.buyAsset);
        bool success = exchangeAdapter.cancelOrder(EXCHANGE, order.exchangeId);

        returnError(
            success,
            "ERR: Exchange Adapter: Failed to cancel order"
        );

        OrderUpdated(id);
    }

    // NON-CONSTANT METHODS - REWARDS

    /// @dev Only Owner
    /// @return Unclaimed fees of manager are converted into shares of the Owner of this fund.
    function convertUnclaimedRewards()
        external
        pre_cond(isOwner())
        pre_cond(notShutDown())
        returns (bool, string)
    {
        var (
            gav,
            managementReward,
            performanceReward,
            unclaimedRewards,
            nav,
            sharePrice
        ) = performCalculations();

        returnError(
            isPastZero(gav),
            "ERR: Gross asset value can't be zero"
        );

        returnError(
            isPastZero(unclaimedRewards),
            "ERR: Nothing to convert as of now"
        );

        // Convert unclaimed rewards in form of ownerless shares into shares which belong to manager
        uint shareQuantity = totalSupply.mul(unclaimedRewards).div(gav);
        totalSupply = totalSupply.sub(shareQuantity); // Annihilate ownerless shares
        addShares(owner, shareQuantity); // Create shares and allocate them to manager
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

        RewardsConverted(now, shareQuantity, unclaimedRewards);
        CalculationUpdate(now, managementReward, performanceReward, nav, sharePrice, totalSupply);
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

    function returnError(bool requirement, string message) internal returns (bool, string) {
        if (isFalse(requirement)) {
            ErrorMessage(message);
            return (true, message);
        }
    }

    function returnCriticalError(bool requirement, string message) internal returns (bool, string) {
        if (isFalse(requirement)) {
            isShutDown = true;
            ErrorMessage(message);
            return (true, message);
        }
    }

}
