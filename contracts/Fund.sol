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
import './FundInterface.sol';
import './FundHistory.sol';

/// @title Fund Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Simple vault
contract Fund is DBC, Owned, Shares, FundHistory, FundInterface {
    using safeMath for uint;

    // TYPES

    enum FundStatus {
        setup,
        funding,
        staking,
        managing,
        locked,
        payout
    }

    struct Modules { // Can't be changed by Owner
        ParticipationInterface  participation;
        DataFeedInterface       pricefeed;
        ExchangeInterface       exchange;
        RiskMgmtInterface       riskmgmt;
    }

    struct Calculations {
        uint gav;
        uint managementReward;
        uint performanceReward;
        uint unclaimedRewards;
        uint nav;
        uint sharePrice;
        uint totalSupply;
        uint timestamp;
    }

    // FIELDS

    // Constant fields
    uint public constant DIVISOR_FEE = 10 ** 15; // Reward are divided by this number
    uint public constant MAX_OPEN_ORDERS = 6; // Maximum number of open orders
    // Constructor fields
    string public name;
    string public symbol;
    uint public decimals;
    uint public created; // Timestamp of Fund creation
    uint public MANAGEMENT_REWARD_RATE; // Reward rate in REFERENCE_ASSET per delta improvment
    uint public PERFORMANCE_REWARD_RATE; // Reward rate in REFERENCE_ASSET per managed seconds
    uint public VAULT_BASE_UNITS; // One unit of share equals 10 ** decimals of base unit of shares
    uint public MELON_BASE_UNITS; // One unit of share equals 10 ** decimals of base unit of shares
    address public VERSION; // Address of Version contract
    address public MELON_ASSET; // Address of Melon asset contract
    ERC20 public MELON_CONTRACT; // Melon as ERC20 contract
    address public REFERENCE_ASSET; // Performance measured against value of this asset
    SphereInterface public sphere;
    // Function fields
    uint[] openOrderIds = new uint[](MAX_OPEN_ORDERS);
    mapping (address => uint) public previousHoldings;
    FundStatus currentStatus;
    Modules public module;
    Calculations public atLastConversion;
    bool public isShutDown;
    bool public isSubscribeAllowed;
    bool public isRedeemAllowed;

    // EVENTS

    event PortfolioContent(uint holdings, uint price, uint decimals);
    event SubscribeRequest(address indexed byParticipant, uint atTimestamp, uint numShares);
    event RedeemRequest(address indexed byParticipant, uint atTimestamp, uint numShares);
    event Subscribed(address indexed byParticipant, uint atTimestamp, uint numShares);
    event Redeemed(address indexed byParticipant, uint atTimestamp, uint numShares);
    event SpendingApproved(address ofToken, address onExchange, uint amount);
    event RewardsConverted(uint atTimestamp, uint numSharesConverted, uint unclaimed);
    event CalculationUpdate(uint atTimestamp, uint managementReward, uint performanceReward, uint nav, uint sharePrice, uint totalSupply);

    // PRE, POST, INVARIANT CONDITIONS

    function isZero(uint x) internal returns (bool) { return 0 == x; }
    function isPastZero(uint x) internal returns (bool) { return 0 < x; }
    function isGreaterOrEqualThan(uint x, uint y) internal returns (bool) { return x >= y; }
    function isLessOrEqualThan(uint x, uint y) internal returns (bool) { return x <= y; }
    function isLargerThan(uint x, uint y) internal returns (bool) { return x > y; }
    function isLessThan(uint x, uint y) internal returns (bool) { return x < y; }
    function isEqualTo(uint x, uint y) internal returns (bool) { return x == y; }
    function isSubscribe(RequestType x) internal returns (bool) { return x == RequestType.subscribe; }
    function isRedeem(RequestType x) internal returns (bool) { return x == RequestType.redeem; }
    function noOpenOrders() internal returns (bool) { return nextOpenSlotOfArray() == 0; }
    function openOrdersNotFull() internal returns (bool) { return nextOpenSlotOfArray() == MAX_OPEN_ORDERS; }
    function balancesOfHolderAtLeast(address ofHolder, uint x) internal returns (bool) { return balances[ofHolder] >= x; }
    function isValidAssetPair(address sellAsset, address buyAsset)
        internal
        returns (bool)
    {
        return
            module.pricefeed.isValid(sellAsset) && // Is tradeable asset (TODO cleaner) and pricefeed delivering data
            module.pricefeed.isValid(buyAsset) && // Is tradeable asset (TODO cleaner) and pricefeed delivering data
            (buyAsset == MELON_ASSET || sellAsset == MELON_ASSET) && // One asset must be MELON_ASSET
            (buyAsset != MELON_ASSET || sellAsset != MELON_ASSET); // Pair must consists of diffrent assets
    }
    function isVersion() internal returns (bool) { return msg.sender == VERSION; }

    // CONSTANT METHODS

    function getDecimals() constant returns (uint) { return decimals; }
    function getMelonAssetBaseUnits() constant returns (uint) { return MELON_BASE_UNITS; }
    function getFundBaseUnits() constant returns (uint) { return VAULT_BASE_UNITS; }
    function getDataFeed() constant returns (address) { return address(module.pricefeed); }
    function getExchangeAdapter() constant returns (address) { return address(module.exchange); }
    function nextOpenSlotOfArray() internal returns (uint) {
        for (uint i = 0; i < openOrderIds.length; i++) {
            if (openOrderIds[i] != 0) return i;
        }
        return MAX_OPEN_ORDERS;
    }
    function getIndendedSellAmount(address ofAsset) constant returns(uint amount) {
        for (uint i = 0; i < openOrderIds.length; i++) {
            Order thisOrder = orders[openOrderIds[i]];
            if (thisOrder.sellAsset == ofAsset) {
                amount = amount + thisOrder.sellQuantity;
            }
        }
    }
    function getIndendedBuyAmount(address ofAsset) constant returns(uint amount) {
        for (uint i = 0; i < openOrderIds.length; i++) {
            Order thisOrder = orders[openOrderIds[i]];
            if (thisOrder.buyAsset == ofAsset) {
                amount = amount + thisOrder.buyQuantity;
            }
        }
    }
    function getStake() constant returns (uint) { return balanceOf(this); }

    // CONSTANT METHODS - ACCOUNTING

    /// @dev Pre: None
    /// @dev Post sharePrice denominated in [base unit of melonAsset]
    function calcSharePrice() constant returns (uint)
    {
        var (, , , , , sharePrice) = performCalculations();
        return sharePrice;
    }

    /// @dev Pre: None
    /// @dev Post Gav, managementReward, performanceReward, unclaimedRewards, nav, sharePrice denominated in [base unit of melonAsset]
    function performCalculations() constant returns (uint, uint, uint, uint, uint, uint) {
        uint gav = calcGav(); // Reflects value indepentent of fees
        var (managementReward, performanceReward, unclaimedRewards) = calcUnclaimedRewards(gav);
        uint nav = calcNav(gav, unclaimedRewards);
        uint sharePrice = isPastZero(totalSupply) ? calcValuePerShare(nav) : getMelonAssetBaseUnits(); // Handle potential division through zero by defining a default value
        return (gav, managementReward, performanceReward, unclaimedRewards, nav, sharePrice);
    }

    /// @dev Pre: Non-zero share supply; value denominated in [base unit of melonAsset]
    /// @dev Post Share price denominated in [base unit of melonAsset * base unit of share / base unit of share] == [base unit of melonAsset]
    function calcValuePerShare(uint value)
        constant
        pre_cond(isPastZero(totalSupply))
        returns (uint valuePerShare)
    {
        valuePerShare = value.mul(getMelonAssetBaseUnits()).div(totalSupply);
    }

    /// @dev Pre: Gross asset value and sum of all applicable and unclaimed fees has been calculated
    /// @dev Post Net asset value denominated in [base unit of melonAsset]
    function calcNav(uint gav, uint unclaimedRewards)
        constant
        returns (uint nav)
    {
        nav = gav.sub(unclaimedRewards);
    }

    /// @dev Pre: Gross asset value has been calculated
    /// @dev Post The sum and its individual parts of all applicable fees denominated in [base unit of melonAsset]
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

    /// @dev Pre: Decimals in assets must be equal to decimals in PriceFeed for all entries in Universe
    /// @dev Post Gross asset value denominated in [base unit of melonAsset]
    function calcGav() constant returns (uint gav) {
        for (uint i = 0; i < module.pricefeed.numRegisteredAssets(); ++i) {
            address ofAsset = address(module.pricefeed.getRegisteredAssetAt(i));
            uint assetHoldings = ERC20(ofAsset).balanceOf(this); // Amount of asset base units this vault holds
            assetHoldings = assetHoldings.add(getIndendedSellAmount(ofAsset));
            uint assetPrice = module.pricefeed.getPrice(ofAsset);
            uint assetDecimals = module.pricefeed.getDecimals(ofAsset);
            gav = gav.add(assetHoldings.mul(assetPrice).div(10 ** uint(assetDecimals))); // Sum up product of asset holdings of this vault and asset prices
            PortfolioContent(assetHoldings, assetPrice, assetDecimals);
        }
    }

    // NON-CONSTANT MANAGING

    //TODO: add previousHoldings
    function closeOpenOrders(address ofBase, address ofQuote)
        constant
    {
        for (uint i = 0; i < openOrderIds.length; i++) {
            Order thisOrder = orders[openOrderIds[i]];
            if (thisOrder.sellAsset == ofBase && thisOrder.buyAsset == ofQuote) {
                proofOfEmbezzlement(ofBase, ofQuote);
                delete openOrderIds[i]; // Free up open order slot
                // TODO: fix pot incorrect OrderStatus - partiallyFilled
                thisOrder.status = OrderStatus.fullyFilled;
                //  update previousHoldings
                // TODO: trigger for each proofOfEmbezzlement() call
                previousHoldings[ofBase] = ERC20(ofBase).balanceOf(this);
                previousHoldings[ofQuote] = ERC20(ofQuote).balanceOf(this);
            }
        }
    }

    //XXX: from perspective of vault
    /// @dev Pre: Specific asset pair (ofBase.ofQuote) where by convention ofBase is asset being sold and ofQuote asset being bhought
    /// @dev Post True if embezzled otherwise false
    function proofOfEmbezzlement(address ofBase, address ofQuote)
        constant
        returns (bool)
    {
        // Sold more than expected => Proof of Embezzlemnt
        uint totalIntendedSellAmount = getIndendedSellAmount(ofBase); // Trade intention
        if (isLargerThan(
            previousHoldings[ofBase].sub(totalIntendedSellAmount), // Intended amount sold
            ERC20(ofBase).balanceOf(this) // Actual amount sold
        )) {
            isShutDown = true;
            // TODO: Allocate staked shares from this to msg.sender
            return true;
        }
        // Sold less or equal than intended
        uint factor = 10000;
        uint divisor = factor;
        if (isLessThan(
            previousHoldings[ofBase].sub(totalIntendedSellAmount), // Intended amount sold
            ERC20(ofBase).balanceOf(this) // Actual amount sold
        )) { // Sold less than intended
            factor = divisor
                .mul(previousHoldings[ofBase].sub(ERC20(ofBase).balanceOf(this)))
                .div(totalIntendedSellAmount);
        }
        // Sold at a worse price than expected => Proof of Embezzlemnt
        uint totalIndendedBuyAmount = getIndendedBuyAmount(ofQuote); // Trade execution
        uint totalExpectedBuyAmount = totalIndendedBuyAmount.mul(factor).div(divisor);
        if (isLargerThan(
            previousHoldings[ofQuote].add(totalExpectedBuyAmount), // Expected amount bhought
            ERC20(ofQuote).balanceOf(this) // Actual amount sold
        )) {
            isShutDown = true;
            // TODO: Allocate staked shares from this to msg.sender
            return true;
        }
        return false;
    }

    // NON-CONSTANT METHODS

    function Fund(
        address ofManager,
        string withName,
        string withSymbol,
        uint withDecimals,
        uint ofManagementRewardRate,
        uint ofPerformanceRewardRate,
        address ofMelonAsset,
        address ofParticipation,
        address ofRiskMgmt,
        address ofSphere
    ) {
        sphere = SphereInterface(ofSphere);
        module.exchange = ExchangeInterface(sphere.getExchangeAdapter()); // Bridge thrid party exchange to Melon exchange interface
        module.pricefeed = DataFeedInterface(sphere.getDataFeed());
        isSubscribeAllowed = true;
        isRedeemAllowed = true;
        owner = ofManager;
        name = withName;
        symbol = withSymbol;
        decimals = withDecimals;
        MANAGEMENT_REWARD_RATE = ofManagementRewardRate;
        PERFORMANCE_REWARD_RATE = ofPerformanceRewardRate;
        VERSION = msg.sender;
        MELON_ASSET = ofMelonAsset;
        REFERENCE_ASSET = MELON_ASSET; // XXX let user decide
        MELON_CONTRACT = ERC20(MELON_ASSET);
        require(MELON_ASSET == module.pricefeed.getQuoteAsset()); // Sanity check
        MELON_BASE_UNITS = 10 ** uint(module.pricefeed.getDecimals(MELON_ASSET));
        VAULT_BASE_UNITS = 10 ** decimals;
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
        created = now;
        currentStatus = FundStatus.setup;
    }

    // NON-CONSTANT METHODS - ADMINISTRATION

    function increaseStake(uint numShares)
        external
        pre_cond(isOwner())
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
        pre_cond(isPastZero(numShares))
        pre_cond(!isShutDown)
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
        pre_cond(isVersion())
    {
        isShutDown == true;
    }

    // NON-CONSTANT METHODS - PARTICIPATION

    /// @dev Pre: offeredValue denominated in [base unit of MELON_ASSET]
    /// @dev Pre: Amount of shares for offered value; Non-zero incentive Value which is paid to workers
    /// @dev Post Pending subscription Request
    function requestSubscription(
        uint numShares,
        uint offeredValue,
        uint incentiveValue
    )
        external
        pre_cond(isSubscribeAllowed)
        pre_cond(isPastZero(incentiveValue))
        pre_cond(module.pricefeed.isValid(MELON_ASSET))
        pre_cond(module.participation.isSubscribeRequestPermitted(
            msg.sender,
            numShares,
            offeredValue
        ))
        returns(uint)
    {
        MELON_CONTRACT.transferFrom(msg.sender, this, offeredValue);
        uint thisId = nextRequestId;
        requests[thisId] = Request({
            owner: msg.sender,
            status: RequestStatus.open,
            requestType: RequestType.subscribe,
            numShares: numShares,
            offeredOrRequestedValue: offeredValue,
            incentive: incentiveValue,
            lastFeedUpdateId: module.pricefeed.getLastUpdateId(),
            lastFeedUpdateTime: module.pricefeed.getLastUpdateTimestamp(),
            timestamp: now
        });
        SubscribeRequest(msg.sender, now, numShares);
        nextRequestId++;
        return thisId;
    }

    /// @dev Pre: offeredValue denominated in [base unit of MELON_ASSET]
    /// @dev Pre: Amount of shares for offered value; Non-zero incentive Value which is paid to workers
    /// @dev Post Pending subscription Request

    /// @dev Pre:  Redeemer has at least `numShares` shares; redeemer approved this contract to handle shares
    /// @dev Post Redeemer lost `numShares`, and gained `numShares * value` reference tokens
    function requestRedemption(
        uint numShares,
        uint requestedValue,
        uint incentiveValue
      )
        external
        pre_cond(isRedeemAllowed)
        pre_cond(isPastZero(numShares))
        pre_cond(module.participation.isRedeemRequestPermitted(
            msg.sender,
            numShares,
            requestedValue
        ))
        returns (uint)
    {
        uint thisId = nextRequestId;
        requests[thisId] = Request({
            owner: msg.sender,
            status: RequestStatus.open,
            requestType: RequestType.redeem,
            numShares: numShares,
            offeredOrRequestedValue: requestedValue,
            incentive: incentiveValue,
            lastFeedUpdateId: module.pricefeed.getLastUpdateId(),
            lastFeedUpdateTime: module.pricefeed.getLastUpdateTimestamp(),
            timestamp: now
        });
        nextRequestId++;
        RedeemRequest(msg.sender, now, numShares);
        return thisId;
    }

    /// @dev Pre: Anyone can trigger this function; Id of request that is pending
    /// @dev Post Worker either cancelled or fullfilled request
    function executeRequest(uint requestId)
        external
        pre_cond(isSubscribe(requests[requestId].requestType) ||
            isRedeem(requests[requestId].requestType))
        pre_cond(isGreaterOrEqualThan(
                now,
                requests[requestId].timestamp.add(module.pricefeed.getInterval())
            ) || isShutDown
        )
        pre_cond(isGreaterOrEqualThan(
                module.pricefeed.getLastUpdateId(),
                requests[requestId].lastFeedUpdateId + 2
            ) || isShutDown
        )
    {
        // Time and updates have passed
        Request request = requests[requestId];
        uint actualValue = request.numShares.mul(calcSharePrice()).div(getFundBaseUnits()); // denominated in [base unit of MELON_ASSET]
        request.status = RequestStatus.executed;
        if (isSubscribe(requests[requestId].requestType) &&
            isGreaterOrEqualThan(request.offeredOrRequestedValue, actualValue) // Sanity Check
        ) { // Limit Order is OK
            assert(MELON_CONTRACT.transferFrom(request.owner, msg.sender, request.incentive)); // Reward Worker
            uint remainder = request.offeredOrRequestedValue.sub(actualValue);
            if(remainder > 0) assert(MELON_CONTRACT.transfer(request.owner, remainder)); // Return remainder
            createShares(request.owner, request.numShares); // Accounting
        } else if (isRedeem(requests[requestId].requestType) &&
            isLessOrEqualThan(request.offeredOrRequestedValue, actualValue) // Sanity Check
        ) {
            assert(MELON_CONTRACT.transferFrom(request.owner, msg.sender, request.incentive)); // Reward Worker
            assert(MELON_CONTRACT.transfer(request.owner, actualValue)); // Transfer value
            annihilateShares(request.owner, request.numShares); // Accounting
        }
    }

    function cancelRequest(uint requestId)
        external
        pre_cond(isSubscribe(requests[requestId].requestType) ||
            isRedeem(requests[requestId].requestType))
        pre_cond(requests[requestId].owner == msg.sender ||
            isShutDown)
    {
        Request request = requests[requestId];
        request.status = RequestStatus.cancelled;
        assert(MELON_CONTRACT.transfer(msg.sender, request.incentive));
        assert(MELON_CONTRACT.transfer(request.owner, request.offeredOrRequestedValue));
    }

    /// @dev Pre: Recipient owns shares
    /// @dev Post Transfer percentage of all assets from Fund to Investor and annihilate numShares of shares.
    /// Note: Independent of running price feed!
    function redeemUsingSlice(uint numShares)
        external
        pre_cond(balancesOfHolderAtLeast(msg.sender, numShares))
    {
        // Current Value
        uint prevTotalSupply = totalSupply.sub(atLastConversion.unclaimedRewards); // TODO Fix calculation
        assert(isPastZero(prevTotalSupply));
        annihilateShares(msg.sender, numShares); // Destroy _before_ external calls to prevent reentrancy
        // Transfer separationAmount of Assets
        for (uint i = 0; i < module.pricefeed.numRegisteredAssets(); ++i) {
            address ofAsset = address(module.pricefeed.getRegisteredAssetAt(i));
            uint assetHoldings = ERC20(ofAsset).balanceOf(this);
            if (assetHoldings == 0) continue;
            uint separationAmount = assetHoldings.mul(numShares).div(prevTotalSupply); // ownership percentage of msg.sender
            assert(ERC20(ofAsset).transfer(msg.sender, separationAmount)); // Send funds from vault to investor
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

    /// @dev Pre: Sufficient balance and spending has been approved
    /// @dev Post Make offer on selected Exchange
    function makeOrder(
        address sellAsset,
        address buyAsset,
        uint sellQuantity,
        uint buyQuantity
    )
        external
        pre_cond(isOwner())
        pre_cond(!isShutDown)
        pre_cond(isValidAssetPair(sellAsset, buyAsset))
        pre_cond(module.riskmgmt.isExchangeMakePermitted(
            module.pricefeed.getPriceOfOrder(
                sellAsset,
                buyAsset,
                sellQuantity,
                buyQuantity
            ),
            module.pricefeed.getReferencePrice(sellAsset, buyAsset),
            buyQuantity
        ))
        returns (uint id)
    {
        approveSpending(sellAsset, sellQuantity);
        id = module.exchange.makeOrder(sellAsset, buyAsset, sellQuantity, buyQuantity);
        orders[nextOrderId] = Order({
            sellAsset: sellAsset,
            buyAsset: buyAsset,
            sellQuantity: sellQuantity,
            buyQuantity: buyQuantity,
            timestamp: now,
            status: OrderStatus.open,
            orderType: OrderType.make,
            fillQuantity: 0
        });
        /*openOrderIds[nextOpenSlotOfArray()] = nextOrderId;*/ //TODO: out of gas error
        nextOrderId++;
    }

    /// @dev Pre: Active offer (id) and valid buy amount on selected Exchange
    /// @dev Post Take offer on selected Exchange
    function takeOrder(uint id, uint quantity)
        external
        pre_cond(isOwner())
        pre_cond(!isShutDown)
        returns (bool)
    {
        // Inverse variable terminology! Buying what another person is selling
        Order memory order;
        (
            order.sellAsset,
            order.buyAsset,
            order.sellQuantity,
            order.buyQuantity
        ) = module.exchange.getOrder(id);
        require(isValidAssetPair(order.buyAsset, order.sellAsset));
        require(order.buyQuantity <= quantity);
        require(module.riskmgmt.isExchangeTakePermitted(
            module.pricefeed.getPriceOfOrder(
                order.sellAsset, // I have what is being sold
                order.buyAsset, // I want what is being bhought
                order.buyQuantity,
                order.sellQuantity
            ),
            order.sellQuantity,
            module.pricefeed.getReferencePrice(order.buyAsset, order.sellAsset)
        ));
        uint wantedSellQuantity = quantity.mul(order.sellQuantity).div(order.buyQuantity); // <- Qunatity times price
        approveSpending(order.sellAsset, wantedSellQuantity);
        bool success = module.exchange.takeOrder(id, quantity);
        order.timestamp = now;
        order.status = OrderStatus.fullyFilled;
        order.orderType = OrderType.take;
        order.fillQuantity = quantity;
        orders[nextOrderId] = order;
        nextOrderId++;
        return success;
    }

    /// @dev Pre: Active offer (id) with owner of this contract on selected Exchange
    /// @dev Post Cancel offer on selected Exchange
    function cancelOrder(uint id)
        external
        pre_cond(isOwner())
        returns (bool)
    {
        return module.exchange.cancelOrder(id);
    }

    /// @dev Pre: To Exchange needs to be approved to spend Tokens on the Managers behalf
    /// @dev Post Approved to spend ofToken on Exchange
    function approveSpending(address ofToken, uint amount)
        internal
    {
        assert(ERC20(ofToken).approve(address(module.exchange), amount)); // TODO change to actual exchange
        SpendingApproved(ofToken, address(module.exchange), amount);
    }

    // NON-CONSTANT METHODS - REWARDS

    /// @dev Pre: Only Owner
    /// @dev Post Unclaimed fees of manager are converted into shares of the Owner of this fund.
    function convertUnclaimedRewards()
        external
        pre_cond(isOwner())
        pre_cond(!isShutDown)
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
