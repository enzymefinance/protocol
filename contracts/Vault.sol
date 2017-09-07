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
import './VaultInterface.sol';

/// @title Vault Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Simple vault
contract Vault is DBC, Owned, Shares, VaultInterface {
    using safeMath for uint256;

    // EVENTS
    event PortfolioContent(uint holdings, uint price, uint decimals);
    event SubscribeRequest(address indexed byParticipant, uint atTimestamp, uint numShares);
    event RedeemRequest(address indexed byParticipant, uint atTimestamp, uint numShares);
    event Subscribed(address indexed byParticipant, uint atTimestamp, uint numShares);
    event Redeemed(address indexed byParticipant, uint atTimestamp, uint numShares);
    event SpendingApproved(address ofToken, address onExchange, uint amount);
    event RewardsConverted(uint atTimestamp, uint numSharesConverted, uint unclaimed);
    event CalculationUpdate(uint atTimestamp, uint managementReward, uint performanceReward, uint nav, uint sharePrice, uint totalSupply);

    // TYPES

    enum RequestStatus {
        open,
        cancelled,
        executed
    }

     enum RequestType {
        subscribe,
        redeem
     }

    enum OrderStatus {
        open,
        partiallyFilled,
        fullyFilled,
        cancelled
    }

    enum OrderType {
        make,
        take
    }

    enum VaultStatus {
        setup,
        funding,
        staking,
        managing,
        locked,
        payout
    }

    struct Information {
        address owner;
        string name;
        string symbol;
        uint decimals;
        uint created;
        VaultStatus status;
    }

    struct Modules { // Can't be changed by Owner
        ParticipationInterface  participation;
        DataFeedInterface       pricefeed;
        ExchangeInterface       exchange;
        RiskMgmtInterface       riskmgmt;
    }

    struct Request { // subscription request
        address owner;
        RequestStatus status;
        RequestType requestType;
        uint256 numShares;
        uint256 offeredOrRequestedValue;
        uint256 incentive;
        uint256 lastFeedUpdateId;
        uint256 lastFeedUpdateTime;
        uint256 timestamp;
    }

    struct Order {
        ERC20       haveToken;
        ERC20       wantToken;
        uint128     haveAmount;
        uint128     wantAmount;
        uint256     timestamp;
        OrderStatus order_status;
        OrderType   orderType;
        uint256     quantity_filled; // Buy quantity filled; Always less than buy_quantity
    }

    struct Calculations {
        uint256 gav;
        uint256 managementReward;
        uint256 performanceReward;
        uint256 unclaimedRewards;
        uint256 nav;
        uint256 sharePrice;
        uint256 totalSupply;
        uint256 timestamp;
    }

    // FIELDS

    // Constant fields
    uint256 public constant MANAGEMENT_REWARD_RATE = 0; // Reward rate in REFERENCE_ASSET per delta improvment
    uint256 public constant PERFORMANCE_REWARD_RATE = 0; // Reward rate in REFERENCE_ASSET per managed seconds
    uint256 public constant DIVISOR_FEE = 10 ** 15; // Reward are divided by this number
    uint256 public constant MAX_OPEN_ORDERS = 6; // Maximum number of open orders
    // Constructor fields
    string public name;
    string public symbol;
    uint public decimals;
    uint256 public VAULT_BASE_UNITS; // One unit of share equals 10 ** decimals of base unit of shares
    uint256 public MELON_BASE_UNITS; // One unit of share equals 10 ** decimals of base unit of shares
    address public VERSION; // Adress of Version contract
    address public MELON_ASSET; // Adresss of Melon asset contract
    ERC20 public MELON_CONTRACT;
    address public REFERENCE_ASSET; // Performance measured against value of this asset
    SphereInterface public sphere;
    // Function fields
    Information public info;
    Modules public module;
    mapping (uint256 => Request) public requests;
    uint256 public nextRequestId;
    mapping (uint256 => Order) public orders;
    uint256[] openOrderIds = new uint256[](MAX_OPEN_ORDERS);
    uint256 public nextOrderId;
    Calculations public atLastPayout;
    bool public isShutDown;
    mapping (address => uint256) public previousHoldings;
    bool public isSubscribeAllowed;
    bool public isRedeemAllowed;

    // EVENTS

    // PRE, POST, INVARIANT CONDITIONS

    function isZero(uint256 x) internal returns (bool) { return 0 == x; }
    function isPastZero(uint256 x) internal returns (bool) { return 0 < x; }
    function isGreaterOrEqualThan(uint256 x, uint256 y) internal returns (bool) { return x >= y; }
    function isLessOrEqualThan(uint256 x, uint256 y) internal returns (bool) { return x <= y; }
    function isLargerThan(uint256 x, uint256 y) internal returns (bool) { return x > y; }
    function isLessThan(uint256 x, uint256 y) internal returns (bool) { return x < y; }
    function isEqualTo(uint256 x, uint256 y) internal returns (bool) { return x == y; }
    function isSubscribe(RequestType x) internal returns (bool) { return x == RequestType.subscribe; }
    function isRedeem(RequestType x) internal returns (bool) { return x == RequestType.redeem; }
    function noOpenOrders()
        internal
        returns (bool) {
        for (uint256 i = 0; i < openOrderIds.length; i++) {
            if (openOrderIds[i] != 0) return false;
        }
        return true;
    }
    function balancesOfHolderAtLeast(address ofHolder, uint256 x) internal returns (bool) { return balances[ofHolder] >= x; }
    function isValidAssetPair(address sell_which_token, address buy_which_token)
        internal
        returns (bool)
    {
        return
            module.pricefeed.isValid(sell_which_token) && // Is tradeable asset (TODO cleaner) and pricefeed delivering data
            module.pricefeed.isValid(buy_which_token) && // Is tradeable asset (TODO cleaner) and pricefeed delivering data
            (buy_which_token == MELON_ASSET || sell_which_token == MELON_ASSET) && // One asset must be MELON_ASSET
            (buy_which_token != MELON_ASSET || sell_which_token != MELON_ASSET); // Pair must consists of diffrent assets
    }
    function isVersion() internal returns (bool) { return msg.sender == VERSION; }

    // CONSTANT METHODS

    function getDecimals() constant returns (uint) { return decimals; }
    function getMelonAssetBaseUnits() constant returns (uint256) { return MELON_BASE_UNITS; }
    function getVaultBaseUnits() constant returns (uint256) { return VAULT_BASE_UNITS; }
    function getDataFeedAddress() constant returns (address) { return address(module.pricefeed); }
    function getExchangeAddress() constant returns (address) { return address(module.exchange); }
    function getLastRequestId() constant returns (uint) {
        require(nextRequestId > 0);
        return nextRequestId - 1;
    }
    function getLastOrderId() constant returns (uint) {
        require(nextOrderId > 0);
        return nextOrderId - 1;
    }

    // CONSTANT METHODS - ACCOUNTING

    /// Pre: None
    /// Post: sharePrice denominated in [base unit of melonAsset]
    function calcSharePrice() constant returns (uint256)
    {
        var (, , , , , sharePrice) = performCalculations();
        return sharePrice;
    }

    /// Pre: None
    /// Post: Gav, managementReward, performanceReward, unclaimedRewards, nav, sharePrice denominated in [base unit of melonAsset]
    function performCalculations() constant returns (uint, uint, uint, uint, uint, uint) {
        uint256 gav = calcGav(); // Reflects value indepentent of fees
        var (managementReward, performanceReward, unclaimedRewards) = calcUnclaimedRewards(gav);
        uint256 nav = calcNav(gav, unclaimedRewards);
        uint256 sharePrice = isPastZero(totalSupply) ? calcValuePerShare(nav) : getMelonAssetBaseUnits(); // Handle potential division through zero by defining a default value
        return (gav, managementReward, performanceReward, unclaimedRewards, nav, sharePrice);
    }

    /// Pre: Non-zero share supply; value denominated in [base unit of melonAsset]
    /// Post: Share price denominated in [base unit of melonAsset * base unit of share / base unit of share] == [base unit of melonAsset]
    function calcValuePerShare(uint256 value)
        constant
        pre_cond(isPastZero(totalSupply))
        returns (uint256 valuePerShare)
    {
        valuePerShare = value.mul(getMelonAssetBaseUnits()).div(totalSupply);
    }

    /// Pre: Gross asset value and sum of all applicable and unclaimed fees has been calculated
    /// Post: Net asset value denominated in [base unit of melonAsset]
    function calcNav(uint256 gav, uint256 unclaimedRewards)
        constant
        returns (uint256 nav)
    {
        nav = gav.sub(unclaimedRewards);
    }

    /// Pre: Gross asset value has been calculated
    /// Post: The sum and its individual parts of all applicable fees denominated in [base unit of melonAsset]
    function calcUnclaimedRewards(uint256 gav)
        constant
        returns (
            uint256 managementReward,
            uint256 performanceReward,
            uint256 unclaimedRewards
        )
    {
        uint256 timeDifference = now.sub(atLastPayout.timestamp);
        managementReward = rewards.managementReward(
            MANAGEMENT_REWARD_RATE,
            timeDifference,
            gav,
            DIVISOR_FEE
        );
        performanceReward = 0;
        if (totalSupply != 0) {
            uint256 currSharePrice = calcValuePerShare(gav); // TODO Multiply w getInvertedPrice(ofReferenceAsset)
            if (currSharePrice > atLastPayout.sharePrice) {
              performanceReward = rewards.performanceReward(
                  PERFORMANCE_REWARD_RATE,
                  int(currSharePrice - atLastPayout.sharePrice),
                  totalSupply,
                  DIVISOR_FEE
              );
            }
        }
        unclaimedRewards = managementReward.add(performanceReward);
    }

    /// Pre: Decimals in assets must be equal to decimals in PriceFeed for all entries in Universe
    /// Post: Gross asset value denominated in [base unit of melonAsset]
    function calcGav() constant returns (uint256 gav) {
        for (uint256 i = 0; i < module.pricefeed.numRegisteredAssets(); ++i) {
            address ofAsset = address(module.pricefeed.getRegisteredAssetAt(i));
            uint256 assetHoldings = ERC20(ofAsset).balanceOf(this); // Amount of asset base units this vault holds
            assetHoldings = assetHoldings.add(getIntededSellAmount(ofAsset));
            uint256 assetPrice = module.pricefeed.getPrice(ofAsset);
            uint256 assetDecimals = module.pricefeed.getDecimals(ofAsset);
            gav = gav.add(assetHoldings.mul(assetPrice).div(10 ** uint(assetDecimals))); // Sum up product of asset holdings of this vault and asset prices
            PortfolioContent(assetHoldings, assetPrice, assetDecimals);
        }
    }

    //TODO: add previousHoldings
    function closeOpenOrders(address ofBase, address ofQuote)
        constant
    {
        for (uint i = 0; i < openOrderIds.length; i++) {
            Order thisOrder = orders[openOrderIds[i]];
            if (thisOrder.haveToken == ofBase && thisOrder.wantToken == ofQuote) {
                proofOfEmbezzlement(ofBase, ofQuote);
                delete openOrderIds[i]; // Free up open order slot
                // TODO: fix pot incorrect OrderStatus - partiallyFilled
                thisOrder.order_status = OrderStatus.fullyFilled;
                //  update previousHoldings
                // TODO: trigger for each proofOfEmbezzlement() call
                previousHoldings[ofBase] = ERC20(ofBase).balanceOf(this);
                previousHoldings[ofQuote] = ERC20(ofQuote).balanceOf(this);
            }
        }
    }

    //XXX: from perspective of vault
    /// Pre: Specific asset pair (ofBase.ofQuote) where by convention ofBase is asset being sold and ofQuote asset being bhought
    /// Post: True if embezzled otherwise false
    function proofOfEmbezzlement(address ofBase, address ofQuote)
        constant
        returns (bool)
    {
        // Sold more than expected => Proof of Embezzlemnt
        uint256 totalIntededSellAmount = getIntededSellAmount(ofBase); // Trade intention
        if (isLargerThan(
            previousHoldings[ofBase].sub(totalIntededSellAmount), // Intended amount sold
            ERC20(ofBase).balanceOf(this) // Actual amount sold
        )) {
            isShutDown = true;
            // Allocate staked shares from this to msg.sender
            return true;
        }
        // Sold less or equal than intended
        uint256 factor = 10000;
        uint256 divisor = factor;
        if (isLessThan(
            previousHoldings[ofBase].sub(totalIntededSellAmount), // Intended amount sold
            ERC20(ofBase).balanceOf(this) // Actual amount sold
        )) { // Sold less than intended
            factor = divisor
                .mul(previousHoldings[ofBase].sub(ERC20(ofBase).balanceOf(this)))
                .div(totalIntededSellAmount);
        }

        // Sold at a worse price than expected => Proof of Embezzlemnt
        uint256 totalIntededBuyAmount = getIntededBuyAmount(ofQuote); // Trade execution
        uint256 totalExpectedBuyAmount = totalIntededBuyAmount.mul(factor).div(divisor);
        if (isLargerThan(
            previousHoldings[ofQuote].add(totalExpectedBuyAmount), // Expected amount bhought
            ERC20(ofQuote).balanceOf(this) // Actual amount sold
        )) {
            isShutDown = true;
            // Allocate staked shares from this to msg.sender
            return true;
        }
        return false;
    }

    // NON-CONSTANT METHODS

    function Vault(
        address ofManager,
        string withName,
        string withSymbol,
        uint withDecimals,
        address ofMelonAsset,
        address ofParticipation,
        address ofRiskMgmt,
        address ofSphere
    ) {
        sphere = SphereInterface(ofSphere);
        module.exchange = ExchangeInterface(sphere.getExchange());
        module.pricefeed = DataFeedInterface(sphere.getDataFeed());
        isSubscribeAllowed = true;
        isRedeemAllowed = true;
        owner = ofManager;
        name = withName;
        symbol = withSymbol;
        decimals = withDecimals;
        VERSION = msg.sender;
        MELON_ASSET = ofMelonAsset;
        MELON_CONTRACT = ERC20(MELON_ASSET);
        require(MELON_ASSET == module.pricefeed.getQuoteAsset()); // Sanity check
        MELON_BASE_UNITS = 10 ** uint256(module.pricefeed.getDecimals(MELON_ASSET));
        VAULT_BASE_UNITS = 10 ** decimals;
        module.participation = ParticipationInterface(ofParticipation);
        module.riskmgmt = RiskMgmtInterface(ofRiskMgmt);
        atLastPayout = Calculations({
            gav: 0,
            managementReward: 0,
            performanceReward: 0,
            unclaimedRewards: 0,
            nav: 0,
            sharePrice: MELON_BASE_UNITS,
            totalSupply: totalSupply,
            timestamp: now
        });
        info = Information({
            owner: ofManager,
            name: withName,
            symbol: withSymbol,
            decimals: withDecimals,
            created: now,
            status: VaultStatus.setup
        });
    }

    // NON-CONSTANT METHODS - ADMINISTRATION

    function increaseStake(uint256 numShares)
        pre_cond(isOwner())
        pre_cond(isPastZero(numShares))
        pre_cond(balancesOfHolderAtLeast(msg.sender, numShares))
        pre_cond(noOpenOrders())
        post_cond(prevTotalSupply == totalSupply)
    {
        uint256 prevTotalSupply = totalSupply;
        subShares(msg.sender, numShares);
        addShares(this, numShares);
    }

    function decreaseStake(uint256 numShares)
        pre_cond(isOwner())
        pre_cond(isPastZero(numShares))
        pre_cond(!isShutDown)
        pre_cond(balancesOfHolderAtLeast(this, numShares))
        pre_cond(noOpenOrders())
        post_cond(prevTotalSupply == totalSupply)
    {
        uint256 prevTotalSupply = totalSupply;
        subShares(this, numShares);
        addShares(msg.sender, numShares);
    }

    function getStake() constant returns (uint256) { return balanceOf(this); }

    function toggleSubscribe()
        pre_cond(isOwner())
    {
        isSubscribeAllowed = !isSubscribeAllowed;
    }

    function toggleRedeem()
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

    /// Pre: offeredValue denominated in [base unit of MELON_ASSET]
    /// Pre: Amount of shares for offered value; Non-zero incentive Value which is paid to workers
    /// Post: Pending subscription Request
    function subscribe(
        uint256 numShares,
        uint256 offeredValue,
        uint256 incentiveValue
    )
        public
        pre_cond(isSubscribeAllowed)
        pre_cond(isPastZero(incentiveValue))
        pre_cond(module.pricefeed.isDataValid(MELON_ASSET))
        pre_cond(module.participation.isSubscribeRequestPermitted(
            msg.sender,
            numShares,
            offeredValue
        ))
        returns(uint256)
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

    /// Pre: offeredValue denominated in [base unit of MELON_ASSET]
    /// Pre: Amount of shares for offered value; Non-zero incentive Value which is paid to workers
    /// Post: Pending subscription Request

    /// Pre:  Redeemer has at least `numShares` shares; redeemer approved this contract to handle shares
    /// Post: Redeemer lost `numShares`, and gained `numShares * value` reference tokens
    function redeem(
        uint256 numShares,
        uint256 requestedValue,
        uint256 incentiveValue
      )
        public
        pre_cond(isRedeemAllowed)
        pre_cond(isPastZero(numShares))
        pre_cond(module.participation.isRedeemRequestPermitted(
            msg.sender,
            numShares,
            requestedValue
        ))
        returns (uint256)
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

    /// Pre: Anyone can trigger this function; Id of request that is pending
    /// Post: Worker either cancelled or fullfilled request
    function executeRequest(uint256 requestId)
        public
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
        uint256 actualValue = request.numShares.mul(calcSharePrice()).div(getVaultBaseUnits()); // denominated in [base unit of MELON_ASSET]
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

    /// Pre: Recipient owns shares
    /// Post: Transfer percentage of all assets from Vault to Investor and annihilate numShares of shares.
    /// Note: Independent of running price feed!
    function redeemUsingSlice(uint256 numShares)
        pre_cond(balancesOfHolderAtLeast(msg.sender, numShares))
    {
        // Current Value
        uint256 prevTotalSupply = totalSupply.sub(atLastPayout.unclaimedRewards); // TODO Fix calculation
        assert(isPastZero(prevTotalSupply));
        annihilateShares(msg.sender, numShares); // Destroy _before_ external calls to prevent reentrancy
        // Transfer separationAmount of Assets
        for (uint256 i = 0; i < module.pricefeed.numRegisteredAssets(); ++i) {
            address ofAsset = address(module.pricefeed.getRegisteredAssetAt(i));
            uint256 assetHoldings = ERC20(ofAsset).balanceOf(this);
            if (assetHoldings == 0) continue;
            uint256 separationAmount = assetHoldings.mul(numShares).div(prevTotalSupply); // ownership percentage of msg.sender
            assert(ERC20(ofAsset).transfer(msg.sender, separationAmount)); // Send funds from vault to investor
        }
        Redeemed(msg.sender, now, numShares);
    }

    function createShares(address recipient, uint256 numShares) internal {
        totalSupply = totalSupply.add(numShares);
        addShares(recipient, numShares);
        Subscribed(msg.sender, now, numShares);
    }

    function annihilateShares(address recipient, uint256 numShares) internal {
        totalSupply = totalSupply.sub(numShares);
        subShares(recipient, numShares);
        Redeemed(msg.sender, now, numShares);
    }

    function addShares(address recipient, uint256 numShares) internal {
        balances[recipient] = balances[recipient].add(numShares);
    }

    function subShares(address recipient, uint256 numShares) internal {
        balances[recipient] = balances[recipient].sub(numShares);
    }

    // NON-CONSTANT METHODS - MANAGING

    /// Pre: Sufficient balance and spending has been approved
    /// Post: Make offer on selected Exchange
    function makeOrder(
        ERC20    haveToken,
        ERC20    wantToken,
        uint128  haveAmount,
        uint128  wantAmount
    )
        pre_cond(isOwner())
        pre_cond(!isShutDown)
        pre_cond(isValidAssetPair(haveToken, wantToken))
        pre_cond(module.riskmgmt.isExchangeMakePermitted(
            0, // TODO Insert assetpair actual price (formatted the same way as reference price)
            module.pricefeed.getReferencePrice(haveToken, wantToken),
            wantAmount
        ))
        returns (uint id)
    {
        approveSpending(haveToken, haveAmount);
        id = module.exchange.make(haveToken, wantToken, haveAmount, wantAmount);
        orders[nextOrderId] = Order({
            haveToken: haveToken,
            wantToken: wantToken,
            haveAmount: haveAmount,
            wantAmount: wantAmount,
            timestamp: now,
            order_status: OrderStatus.open,
            orderType: OrderType.make,
            quantity_filled: 0
        });
        nextOrderId++;
    }

    function getIntededSellAmount(address ofAsset) constant returns(uint amt) {
        for (uint i = 0; i < openOrderIds.length; i++) {
            Order thisOrder = orders[openOrderIds[i]];
            if (thisOrder.haveToken == ofAsset) {
                amt = amt + thisOrder.haveAmount;
            }
        }
    }

    function getIntededBuyAmount(address ofAsset) constant returns(uint amt) {
        for (uint i = 0; i < openOrderIds.length; i++) {
            Order thisOrder = orders[openOrderIds[i]];
            if (thisOrder.wantToken == ofAsset) {
                amt = amt + thisOrder.wantAmount;
            }
        }
    }

    /// Pre: Active offer (id) and valid buy amount on selected Exchange
    /// Post: Take offer on selected Exchange
    function takeOrder(uint256 id, uint256 wantedBuyAmount)
        pre_cond(isOwner())
        pre_cond(!isShutDown)
        returns (bool)
    {
        // Inverse variable terminology! Buying what another person is selling
        var (
            offeredBuyAmount, offeredBuyToken,
            offeredSellAmount, offeredSellToken
        ) = module.exchange.getOffer(id);
        require(isValidAssetPair(offeredBuyToken, offeredSellToken));
        require(wantedBuyAmount <= offeredBuyAmount);
        var orderOwner = module.exchange.getOwner(id);
        require(module.riskmgmt.isExchangeTakePermitted(
            0, // TODO Insert assetpair actual price (formatted the same way as reference price)
            module.pricefeed.getReferencePrice(offeredBuyToken, offeredSellToken),
            offeredSellAmount
        ));
        uint256 wantedSellAmount = wantedBuyAmount.mul(offeredSellAmount).div(offeredBuyAmount);
        approveSpending(offeredSellToken, wantedSellAmount);
        bool success = module.exchange.buy(id, wantedBuyAmount);
        orders[nextOrderId] = Order({
            haveToken: offeredBuyToken,
            wantToken: offeredSellToken,
            haveAmount: uint128(offeredBuyAmount),
            wantAmount: uint128(wantedBuyAmount),
            timestamp: now,
            order_status: OrderStatus.fullyFilled,
            orderType: OrderType.take,
            quantity_filled: wantedBuyAmount
        });
        nextOrderId++;
        return success;
    }

    /// Pre: Active offer (id) with owner of this contract on selected Exchange
    /// Post: Cancel offer on selected Exchange
    function cancelOrder(uint256 id)
        pre_cond(isOwner())
        returns (bool)
    {
        return module.exchange.cancel(id);
    }

    /// Pre: To Exchange needs to be approved to spend Tokens on the Managers behalf
    /// Post: Approved to spend ofToken on Exchange
    function approveSpending(ERC20 ofToken, uint256 amount)
        internal
    {
        assert(ofToken.approve(address(module.exchange), amount));
        SpendingApproved(ofToken, address(module.exchange), amount);
    }

    // NON-CONSTANT METHODS - REWARDS

    /// Pre: Only Owner
    /// Post: Unclaimed fees of manager are converted into shares of the Owner of this fund.
    function convertUnclaimedRewards()
        pre_cond(isOwner())
        pre_cond(!isShutDown)
        pre_cond(noOpenOrders())
    {
        // TODO Assert that all open orders are closed
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
        uint256 numShares = totalSupply.mul(unclaimedRewards).div(gav);
        addShares(owner, numShares);
        addShares(owner, numShares);
        // Update Calculations
        atLastPayout = Calculations({
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

  	// CONSTANT METHODS

    function getRequestHistory(uint start)
    		constant
    		returns (
      			address[1024] owners, uint[1024] statuses, uint[1024] requestTypes,
                  uint[1024] numShares, uint[1024] offered, uint[1024] incentive,
      			uint[1024] lastFeedId, uint[1024] lastFeedTime, uint[1024] timestamp
    		)
  	{
    		for(uint ii = 0; ii < 1024; ii++){
      			if(start + ii >= nextRequestId) break;
      			owners[ii] = requests[start + ii].owner;
      			statuses[ii] = uint(requests[start + ii].status);
      			requestTypes[ii] = uint(requests[start + ii].requestType);
      			numShares[ii] = requests[start + ii].numShares;
      			offered[ii] = requests[start + ii].offeredOrRequestedValue;
      			incentive[ii] = requests[start + ii].incentive;
      			lastFeedId[ii] = requests[start + ii].lastFeedUpdateId;
      			lastFeedTime[ii] = requests[start + ii].lastFeedUpdateTime;
      			timestamp[ii] = requests[start + ii].timestamp;
    		}
  	}

  	function getOrderHistory(uint start)
    		constant
    		returns (
      			uint[1024] haveAmount, address[1024] haveToken,
      			uint[1024] wantAmount, address[1024] wantToken,
      			uint[1024] timestamps, uint[1024] statuses,
      			uint[1024] types, uint[1024] buyQuantityFilled
    		)
  	{
    		for(uint ii = 0; ii < 1024; ii++){
      			if(start + ii >= nextOrderId) break;
      			haveAmount[ii] = orders[start + ii].haveAmount;
      			haveToken[ii] = orders[start + ii].haveToken;
      			wantAmount[ii] = orders[start + ii].wantAmount;
      			wantToken[ii] = orders[start + ii].wantToken;
      			timestamps[ii] = orders[start + ii].timestamp;
      			statuses[ii] = uint(orders[start + ii].order_status);   // cast enum
      			types[ii] = uint(orders[start + ii].orderType);
      			buyQuantityFilled[ii] = orders[start + ii].quantity_filled;
    		}
  	}
}
