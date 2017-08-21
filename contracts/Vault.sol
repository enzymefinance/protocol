pragma solidity ^0.4.11;

import './dependencies/ERC20.sol';
import {ERC20 as Shares} from './dependencies/ERC20.sol';
import './assets/AssetRegistrar.sol';
import './dependencies/DBC.sol';
import './dependencies/Owned.sol';
import './dependencies/Logger.sol';
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

    // TYPES

    enum RequestStatus {
        subscribe,
        redeem,
        cancelled,
        executed
    }

    enum OrderStatus {
        open,
        closed,
        executed
    }

    enum VaultStatus {
        setup,
        funding,
        managing,
        locked,
        payout
    }

    struct Information {
        VaultStatus vaultStatus;
    }

    struct Modules { // Can't be changed by Owner
        ParticipationInterface  participation;
        DataFeedInterface       pricefeed;
        ExchangeInterface       exchange;
        RiskMgmtInterface       riskmgmt;
    }

    struct Request { // subscription request
        address owner;
        RequestStatus request_status;
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
        uint256     quantitiy_filled; // Buy quantitiy filled; Always less than buy_quantity
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

    // Constant asset specific fields
    uint256 public constant MANAGEMENT_REWARD_RATE = 0; // Reward rate in REFERENCE_ASSET per delta improvment
    uint256 public constant PERFORMANCE_REWARD_RATE = 0; // Reward rate in REFERENCE_ASSET per managed seconds
    uint256 public constant DIVISOR_FEE = 10 ** 15; // Reward are divided by this number
    uint256 public constant MAX_OPEN_ORDERS = 6; // Maximum number of open orders
    // Fields that are only changed in constructor
    string public name;
    string public symbol;
    uint public decimals;
    uint256 public BASE_UNITS; // One unit of share equals 10 ** decimals of base unit of shares
    address public MELON_ASSET; // Adresss of Melon asset contract
    ERC20 public MELON_CONTRACT;
    address public REFERENCE_ASSET; // Performance measured against value of this asset
    Logger public LOGGER;
    // Fields that can be changed by functions
    Information public info;
    Modules public module;
    mapping (uint256 => Request) public requests;
    uint256 lastRequestId;
    mapping (uint256 => Order) public orders;
    uint256[] openOrderIds = new uint256[](MAX_OPEN_ORDERS);
    uint256 lastOrderId;
    Calculations public atLastPayout;
    bool public isDecommissioned;

    // EVENTS

    // PRE, POST, INVARIANT CONDITIONS

    function isZero(uint256 x) internal returns (bool) { return 0 == x; }
    function isPastZero(uint256 x) internal returns (bool) { return 0 < x; }
    function isGreaterOrEqualThan(uint256 x, uint256 y) internal returns (bool) { return x >= y; }
    function isLessOrEqualThan(uint256 x, uint256 y) internal returns (bool) { return x <= y; }
    function isSubscribe(RequestStatus x) internal returns (bool) { return x == RequestStatus.subscribe; }
    function isRedeem(RequestStatus x) internal returns (bool) { return x == RequestStatus.redeem; }
    function balancesOfHolderAtLeast(address ofHolder, uint256 x) internal returns (bool) { return balances[ofHolder] >= x; }
    function isValidAssetPair(address sell_which_token, address buy_which_token)
        internal returns (bool)
    {
        return
            module.pricefeed.isValid(sell_which_token) && // Is tradeable asset (TODO cleaner) and pricefeed delivering data
            module.pricefeed.isValid(buy_which_token) && // Is tradeable asset (TODO cleaner) and pricefeed delivering data
            (buy_which_token == MELON_ASSET || sell_which_token == MELON_ASSET) && // One asset must be MELON_ASSET
            (buy_which_token != MELON_ASSET || sell_which_token != MELON_ASSET); // Pair must consists of diffrent assets
    }

    // CONSTANT METHODS

    function getDecimals() constant returns (uint) { return decimals; }
    function getBaseUnitsPerShare() constant returns (uint256) { return BASE_UNITS; }
    function getDataFeedAddress() constant returns (address) { return address(module.pricefeed); }
    function getExchangeAddress() constant returns (address) { return address(module.exchange); }

    // CONSTANT METHODS - ACCOUNTING

    /// Pre: None
    /// Post: sharePrice denominated in [base unit of referenceAsset]
    function calcSharePrice() constant returns (uint256)
    {
        var (, , , , , sharePrice) = performCalculations();
        return sharePrice;
    }

    /// Pre: None
    /// Post: Gav, managementReward, performanceReward, unclaimedRewards, nav, sharePrice denominated in [base unit of referenceAsset]
    function performCalculations() constant returns (uint, uint, uint, uint, uint, uint) {
        uint256 gav = calcGav(); // Reflects value indepentent of fees
        var (managementReward, performanceReward, unclaimedRewards) = calcUnclaimedRewards(gav);
        uint256 nav = calcNav(gav, unclaimedRewards);
        uint256 sharePrice = isPastZero(totalSupply) ? calcValuePerShare(nav) : getBaseUnitsPerShare(); // Handle potential division through zero by defining a default value
        return (gav, managementReward, performanceReward, unclaimedRewards, nav, sharePrice);
    }

    /// Pre: Non-zero share supply; value denominated in [base unit of referenceAsset]
    /// Post: Share price denominated in [base unit of referenceAsset * base unit of share / base unit of share] == [base unit of referenceAsset]
    function calcValuePerShare(uint256 value)
        constant
        pre_cond(isPastZero(totalSupply))
        returns (uint256 valuePerShare)
    {
        valuePerShare = value.mul(getBaseUnitsPerShare()).div(totalSupply);
    }

    /// Pre: Gross asset value and sum of all applicable and unclaimed fees has been calculated
    /// Post: Net asset value denominated in [base unit of referenceAsset]
    function calcNav(uint256 gav, uint256 unclaimedRewards)
        constant
        returns (uint256 nav)
    {
        nav = gav.sub(unclaimedRewards);
    }

    /// Pre: Gross asset value has been calculated
    /// Post: The sum and its individual parts of all applicable fees denominated in [base unit of referenceAsset]
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
    /// Post: Gross asset value denominated in [base unit of referenceAsset]
    function calcGav() constant returns (uint256 gav) {
        for (uint256 i = 0; i < module.pricefeed.numRegisteredAssets(); ++i) {
            address ofAsset = address(module.pricefeed.getRegisteredAssetAt(i));
            uint256 assetHoldings = ERC20(ofAsset).balanceOf(this); // Amount of asset base units this vault holds
            uint256 assetPrice = module.pricefeed.getPrice(ofAsset);
            uint256 assetDecimals = module.pricefeed.getDecimals(ofAsset);
            gav = gav.add(assetHoldings.mul(assetPrice).div(10 ** uint(assetDecimals))); // Sum up product of asset holdings of this vault and asset prices
            LOGGER.logPortfolioContent(assetHoldings, assetPrice, assetDecimals);
        }
    }

    // NON-CONSTANT INTERNAL METHODS

    function nextRequestId() internal returns (uint) { lastRequestId++; return lastRequestId; }
    function nextOrderId() internal returns (uint) { lastOrderId++; return lastOrderId; }

    // NON-CONSTANT METHODS

    function Vault(
        address ofManager,
        string withName,
        string withSymbol,
        uint withDecimals,
        address ofAssetRegistrar,
        address ofMelonAsset,
        address ofDataFeed,
        address ofParticipation,
        address ofExchange,
        address ofRiskMgmt,
        address ofLogger
    ) {
        LOGGER = Logger(ofLogger);
        LOGGER.addPermission(this);
        owner = ofManager;
        name = withName;
        symbol = withSymbol;
        decimals = withDecimals;
        MELON_ASSET = ofMelonAsset;
        MELON_CONTRACT = ERC20(MELON_ASSET);
        BASE_UNITS = 10 ** decimals;
        atLastPayout = Calculations({
            gav: 0,
            managementReward: 0,
            performanceReward: 0,
            unclaimedRewards: 0,
            nav: 0,
            sharePrice: BASE_UNITS,
            totalSupply: totalSupply,
            timestamp: now
        });
        // Init module struct
        module.pricefeed = DataFeedInterface(ofDataFeed);
        require(MELON_ASSET == module.pricefeed.getQuoteAsset()); // Sanity check
        require(module.pricefeed.isSet(MELON_ASSET));
        module.participation = ParticipationInterface(ofParticipation);
        module.exchange = ExchangeInterface(ofExchange);
        module.riskmgmt = RiskMgmtInterface(ofRiskMgmt);
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
        pre_cond(isPastZero(incentiveValue))
        pre_cond(module.participation.isSubscribeRequestPermitted(
            msg.sender,
            numShares,
            offeredValue
        ))
        returns(uint256)
    {
        MELON_CONTRACT.transferFrom(msg.sender, this, offeredValue);
        uint256 newId = nextRequestId();
        requests[newId] = Request({
            owner: msg.sender,
            request_status: RequestStatus.subscribe,
            numShares: numShares,
            offeredOrRequestedValue: offeredValue,
            incentive: incentiveValue,
            lastFeedUpdateId: module.pricefeed.getLatestUpdateId(),
            lastFeedUpdateTime: module.pricefeed.getLatestUpdateTimestamp(),
            timestamp: now
        });
        LOGGER.logSubscribeRequested(msg.sender, now, numShares);
        return newId;
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
        pre_cond(isPastZero(numShares))
        pre_cond(module.participation.isRedeemRequestPermitted(
            msg.sender,
            numShares,
            requestedValue
        ))
        returns (uint256)
    {
        uint256 newId = nextRequestId();
        requests[newId] = Request({
            owner: msg.sender,
            request_status: RequestStatus.redeem,
            numShares: numShares,
            offeredOrRequestedValue: requestedValue,
            incentive: incentiveValue,
            lastFeedUpdateId: module.pricefeed.getLatestUpdateId(),
            lastFeedUpdateTime: module.pricefeed.getLatestUpdateTimestamp(),
            timestamp: now
        });
        LOGGER.logRedeemRequested(msg.sender, now, numShares);
        return newId;
    }

    /// Pre: Anyone can trigger this function; Id of request that is pending
    /// Post: Worker either cancelled or fullfilled request
    function executeRequest(uint256 requestId)
        public
        pre_cond(isSubscribe(requests[requestId].request_status) ||
            isRedeem(requests[requestId].request_status))
        pre_cond(isGreaterOrEqualThan(
                now,
                requests[requestId].timestamp.add(module.pricefeed.getInterval())
            ) || isDecommissioned
        )
        pre_cond(isGreaterOrEqualThan(
                module.pricefeed.getLatestUpdateId(),
                requests[requestId].lastFeedUpdateId + 2
            ) || isDecommissioned
        )
    {
        // Time and updates have passed
        Request request = requests[requestId];
        uint256 actualValue = request.numShares.mul(calcSharePrice()); // denominated in [base unit of MELON_ASSET]
        request.request_status = RequestStatus.executed;
        if (isSubscribe(requests[requestId].request_status) &&
            isGreaterOrEqualThan(request.offeredOrRequestedValue, actualValue) // Sanity Check
        ) { // Limit Order is OK
            assert(MELON_CONTRACT.transferFrom(request.owner, msg.sender, request.incentive)); // Reward Worker
            assert(MELON_CONTRACT.transferFrom(request.owner, this, actualValue)); // Value tranfer
            assert(MELON_CONTRACT.transfer(request.owner, request.offeredOrRequestedValue.sub(actualValue))); // Return remainder
            createShares(msg.sender, request.numShares); // Accounting
        } else if (isRedeem(requests[requestId].request_status) &&
            isLessOrEqualThan(request.offeredOrRequestedValue, actualValue) // Sanity Check
        ) {// Limit Order is OK
            assert(MELON_CONTRACT.transferFrom(request.owner, msg.sender, request.incentive)); // Reward Worker
            assert(MELON_CONTRACT.transfer(msg.sender, actualValue)); // Transfer value
            // No remainder to return
            annihilateShares(msg.sender, request.numShares); // Accounting
        }
    }

    function cancelRequest(uint requestId)
        pre_cond(isSubscribe(requests[requestId].request_status) ||
            isRedeem(requests[requestId].request_status))
        pre_cond(requests[requestId].owner == msg.sender ||
            isDecommissioned)
    {
        Request request = requests[requestId];
        request.request_status = RequestStatus.cancelled;
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
        LOGGER.logRedeemed(msg.sender, now, numShares);
    }

    function createShares(address recipient, uint256 numShares)
        internal
    {
        totalSupply = totalSupply.add(numShares);
        addShares(recipient, numShares);
        LOGGER.logSubscribed(msg.sender, now, numShares);
    }

    function annihilateShares(address recipient, uint256 numShares)
        internal
    {
        totalSupply = totalSupply.sub(numShares);
        subShares(recipient, numShares);
        LOGGER.logRedeemed(msg.sender, now, numShares);
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
        pre_cond(isValidAssetPair(haveToken, wantToken))
        pre_cond(module.riskmgmt.isExchangeMakePermitted(
            haveToken,
            wantToken,
            haveAmount,
            wantAmount,
            0 // Insert assetpair specific price
        ))
        returns (uint id)
    {
        approveSpending(haveToken, haveAmount);
        id = module.exchange.make(haveToken, wantToken, haveAmount, wantAmount);
        uint256 newId = nextOrderId();
        orders[newId] = Order({
            haveToken: haveToken,
            wantToken: wantToken,
            haveAmount: haveAmount,
            wantAmount: wantAmount,
            timestamp: now,
            order_status: OrderStatus.open,
            quantitiy_filled: 0
        });
    }

    /// Pre: Active offer (id) and valid buy amount on selected Exchange
    /// Post: Take offer on selected Exchange
    function takeOrder(uint256 id, uint256 wantedBuyAmount)
        pre_cond(isOwner())
        returns (bool)
    {
        // Inverse variable terminology! Buying what another person is selling
        // TODO uncomment
        var (
            offeredBuyAmount, offeredBuyToken,
            offeredSellAmount, offeredSellToken
        ) = module.exchange.getOffer(id);
        require(isValidAssetPair(offeredBuyToken, offeredSellToken));
        require(wantedBuyAmount <= offeredBuyAmount);
        var orderOwner = module.exchange.getOwner(id);
        require(module.riskmgmt.isExchangeTakePermitted(
            offeredSellToken,
            offeredBuyToken,
            offeredSellAmount,
            offeredBuyAmount,
            0, // Insert assetpair specific price
            orderOwner)
        );
        uint256 wantedSellAmount = wantedBuyAmount.mul(offeredSellAmount).div(offeredBuyAmount);
        approveSpending(offeredSellToken, wantedSellAmount);
        bool success = module.exchange.buy(id, wantedBuyAmount);
        uint256 newId = nextOrderId();
        orders[newId] = Order({
            haveToken: offeredBuyToken,
            wantToken: offeredSellToken,
            haveAmount: uint128(offeredBuyAmount),
            wantAmount: uint128(wantedBuyAmount),
            timestamp: now,
            order_status: OrderStatus.executed,
            quantitiy_filled: wantedBuyAmount
        });
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
        LOGGER.logSpendingApproved(ofToken, address(module.exchange), amount);
    }

    // NON-CONSTANT METHODS - REWARDS

    /// Pre: Only Owner
    /// Post: Unclaimed fees of manager are converted into shares of the Owner of this fund.
    function convertUnclaimedRewards()
        pre_cond(isOwner())
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

        LOGGER.logRewardsConverted(now, numShares, unclaimedRewards);
        LOGGER.logCalculationUpdate(now, managementReward, performanceReward, nav, sharePrice, totalSupply);
    }
}
