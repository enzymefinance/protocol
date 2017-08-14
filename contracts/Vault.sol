pragma solidity ^0.4.11;

import './dependencies/ERC20.sol';
import {ERC20 as Shares} from './dependencies/ERC20.sol';
import './assets/AssetInterface.sol';
import './assets/AssetRegistrar.sol';
import './dependencies/DBC.sol';
import './dependencies/Owned.sol';
import './dependencies/Logger.sol';
import './libraries/safeMath.sol';
import './libraries/calculations.sol';
import './libraries/accounting.sol';
import './participation/ParticipationAdapter.sol';
import './datafeeds/PriceFeedInterface.sol';
import './riskmgmt/RiskMgmtInterface.sol';
import './exchange/ExchangeInterface.sol';
import './VaultInterface.sol';

/// @title Vault Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Simple vault
contract Vault is DBC, Owned, Shares, VaultInterface {
    using safeMath for uint256;

    // TYPES

    enum OrderStatus {
        open,
        closed,
        resolved
    }

    enum VaultStatus {
        setup,
        funding,
        managing,
        locked,
        payout
    }

    struct Order {
        uint256 sell_quantitiy;
        ERC20 sell_which_token;
        uint256 buy_quantity;
        ERC20 buy_which_token;
        uint256 timestamp;
        OrderStatus order_status;
        uint256 quantitiy_filled; // Buy quantitiy filled; Always less than buy_quantity
    }

    struct Information {
      VaultStatus vault_status;
      uint timestamp;
    }

    struct Modules { // Can't be changed by Owner
        ParticipationAdapter participation;
        PriceFeedInterface pricefeed;
        ExchangeInterface exchange;
        RiskMgmtInterface riskmgmt;
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

    struct Request {    // subscription request
        address owner;
        bool isOpen;
        uint256 numShares;
        uint256 offeredValue;
        uint256 incentive;
        uint256 lastFeedUpdateId;
        uint256 lastFeedUpdateTime;
        uint256 timestamp;
    }

    struct Asset {
        uint256 decimal;
        bytes32 chainId;
        address breakIn;
        address breakOut;
    }

    // FIELDS

    // Constant asset specific fields
    uint256 public constant MANAGEMENT_REWARD_RATE = 0; // Reward rate in REFERENCE_ASSET per delta improvment
    uint256 public constant PERFORMANCE_REWARD_RATE = 0; // Reward rate in REFERENCE_ASSET per managed seconds
    uint256 public constant DIVISOR_FEE = 10 ** 15; // Reward are divided by this number
    // Fields that are only changed in constructor
    string public name;
    string public symbol;
    uint public decimals;
    uint256 public BASE_UNITS; // One unit of share equals 10 ** decimals of base unit of shares
    address public MELON_ASSET; // Adresss of Melon asset contract
    address public REFERENCE_ASSET; // Performance measured against value of this asset
    Logger public LOGGER;
    address[] public TRADEABLE_ASSETS;
    // Fields that can be changed by functions
    mapping (address => Asset) public assets;
    mapping (uint256 => Request) public requests;
    mapping (uint256 => Order) public orders;
    uint256 lastRequestId;
    Information public info;
    Modules public module;
    Calculations public atLastPayout;

    // EVENTS

    // PRE, POST, INVARIANT CONDITIONS

    function isZero(uint256 x) internal returns (bool) { return 0 == x; }
    function isPastZero(uint256 x) internal returns (bool) { return 0 < x; }
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

    function getPriceFeedAddress() constant returns (address) { return address(module.pricefeed); }
    function getExchangeAddress() constant returns (address) { return address(module.exchange); }
    function getDecimals() constant returns (uint) { return decimals; }
    function getBaseUnitsPerShare() constant returns (uint256) { return BASE_UNITS; }

    // NON-CONSTANT METHODS

    function Vault(
        address ofManager,
        string withName,
        string withSymbol,
        uint withDecimals,
        address ofAssetRegistrar,
        address ofMelonAsset,
        address ofPriceFeed,
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
        module.pricefeed = PriceFeedInterface(ofPriceFeed);
        require(MELON_ASSET == module.pricefeed.getQuoteAsset());
        for (uint id = 0; id < module.pricefeed.numDeliverableAssets(); id++) {
          address ofAsset = module.pricefeed.getDeliverableAssetAt(id);
          // TODO add to assets mapping
          AssetRegistrar(ofAssetRegistrar).getSpecificInformation(ofAsset);
        }
        module.participation = ParticipationAdapter(ofParticipation);
        module.exchange = ExchangeInterface(ofExchange);
        module.riskmgmt = RiskMgmtInterface(ofRiskMgmt);
    }

    // NON-CONSTANT METHODS - PARTICIPATION

    function subscribeRequest(uint256 numShares, uint256 offeredValue)
        payable // TODO incentive in MLN
        pre_cond(module.participation.isSubscriberPermitted(msg.sender, numShares))
        pre_cond(module.participation.isSubscribePermitted(msg.sender, numShares))
        pre_cond(msg.value > offeredValue)
        returns(uint256)
    {
        uint256 incentive = uint256(msg.value).sub(offeredValue);
        AssetInterface(MELON_ASSET).transferFrom(msg.sender, this, msg.value);
        lastRequestId++;    // new ID
        requests[lastRequestId] = Request(
            msg.sender, true, numShares, offeredValue,
            incentive, module.pricefeed.getLatestUpdateId(),
            module.pricefeed.getLatestUpdateTimestamp(), now
        );
        LOGGER.logSubscribeRequested(msg.sender, now, numShares);
        return lastRequestId;
    }

    function checkRequest(uint256 requestId)
        pre_cond(requests[requestId].isOpen)
    {
        Request request = requests[requestId];
        AssetInterface mln = AssetInterface(MELON_ASSET);
        bool intervalPassed = now >= request.timestamp.add(module.pricefeed.getLatestUpdateId() * 2);
        bool updatesPassed = module.pricefeed.getLatestUpdateTimestamp() >= request.lastFeedUpdateId + 2;
        if(intervalPassed && updatesPassed){  // time and updates have passed
            uint256 actualValue = calculations.priceForNumBaseShares(
                request.numShares,
                BASE_UNITS,
                atLastPayout.nav,
                totalSupply
            ); // [base unit of MELON_ASSET]
            request.isOpen = false;
            assert(mln.transfer(msg.sender, request.incentive));
            if(request.offeredValue >= actualValue) { // limit OK
                subscribeAllocate(request.numShares, actualValue);
            } else {    // outside limit; cancel order and return funds
                assert(mln.transfer(request.owner, request.offeredValue));
            }
        }
    }

    /// Pre: Investor pre-approves spending of vault's reference asset to this contract, denominated in [base unit of MELON_ASSET]
    /// Post: Subscribe in this fund by creating shares
    // TODO check comment
    // TODO mitigate `spam` attack
    /* Rem:
     *  This can be seen as a non-persistent all or nothing limit order, where:
     *  amount == numShares and price == numShares/offeredAmount [Shares / Reference Asset]
     */
    function subscribeAllocate(uint256 numShares, uint256 actualValue)
        pre_cond(module.participation.isSubscriberPermitted(msg.sender, numShares))
        pre_cond(module.participation.isSubscribePermitted(msg.sender, numShares))
    {
        if (isZero(numShares)) {
            subscribeUsingSlice(numShares);
        } else {
            assert(AssetInterface(MELON_ASSET).transferFrom(msg.sender, this, actualValue));  // Transfer value
            createShares(msg.sender, numShares); // Accounting
            LOGGER.logSubscribed(msg.sender, now, numShares);
        }
    }

    function cancelRequest(uint requestId)
        pre_cond(requests[requestId].isOpen)
        pre_cond(requests[requestId].owner == msg.sender)
    {
        Request request = requests[requestId];
        AssetInterface mln = AssetInterface(MELON_ASSET);
        request.isOpen = false;
        assert(mln.transfer(msg.sender, request.incentive));
        assert(mln.transfer(request.owner, request.offeredValue));
    }

    /// Pre:  Redeemer has at least `numShares` shares; redeemer approved this contract to handle shares
    /// Post: Redeemer lost `numShares`, and gained `numShares * value` reference tokens
    // TODO mitigate `spam` attack
    function redeem(uint256 numShares, uint256 requestedValue)
        pre_cond(isPastZero(numShares))
        pre_cond(module.participation.isRedeemPermitted(msg.sender, numShares))

    {
        uint256 actualValue = calculations.priceForNumBaseShares(numShares, BASE_UNITS, atLastPayout.nav, totalSupply); // [base unit of MELON_ASSET]
        assert(requestedValue <= actualValue); // Sanity Check
        assert(AssetInterface(MELON_ASSET).transfer(msg.sender, actualValue)); // Transfer value
        annihilateShares(msg.sender, numShares); // Accounting
        LOGGER.logRedeemed(msg.sender, now, numShares);
    }

    /// Pre: Approved spending of all assets with non-empty asset holdings;
    /// Post: Transfer percentage of all assets from Vault to Investor and annihilate numShares of shares.
    /// Note: Independent of running price feed!
    function subscribeUsingSlice(uint256 numShares)
        pre_cond(isPastZero(totalSupply))
        pre_cond(isPastZero(numShares))
    {
        allocateSlice(numShares);
        LOGGER.logSubscribed(msg.sender, now, numShares);
    }

    /// Pre: Recipient owns shares
    /// Post: Transfer percentage of all assets from Vault to Investor and annihilate numShares of shares.
    /// Note: Independent of running price feed!
    function redeemUsingSlice(uint256 numShares)
        pre_cond(balancesOfHolderAtLeast(msg.sender, numShares))
    {
        separateSlice(numShares);
        LOGGER.logRedeemed(msg.sender, now, numShares);
    }

    /// Pre: Allocation: Pre-approve spending for all non empty vaultHoldings of Assets, numShares denominated in [base units ]
    /// Post: Transfer ownership percentage of all assets to/from Vault
    function allocateSlice(uint256 numShares)
        internal
    {
        uint256 numDeliverableAssets = module.pricefeed.numDeliverableAssets();
        for (uint256 i = 0; i < numDeliverableAssets; ++i) {
            AssetInterface Asset = AssetInterface(address(module.pricefeed.getDeliverableAssetAt(i)));
            uint256 vaultHoldings = Asset.balanceOf(this); // Amount of asset base units this vault holds
            if (vaultHoldings == 0) continue;
            uint256 allocationAmount = vaultHoldings.mul(numShares).div(totalSupply); // ownership percentage of msg.sender
            uint256 senderHoldings = Asset.balanceOf(msg.sender); // Amount of asset sender holds
            require(senderHoldings >= allocationAmount);
            // Transfer allocationAmount of Assets
            assert(Asset.transferFrom(msg.sender, this, allocationAmount)); // Send funds from investor to vault
        }
        // Issue _after_ external calls
        createShares(msg.sender, numShares);
    }

    /// Pre: Allocation: Approve spending for all non empty vaultHoldings of Assets
    /// Post: Transfer ownership percentage of all assets to/from Vault
    function separateSlice(uint256 numShares)
        internal
    {
        // Current Value
        uint256 prevTotalSupply = totalSupply.sub(atLastPayout.unclaimedRewards);
        assert(isPastZero(prevTotalSupply));
        // Destroy _before_ external calls to prevent reentrancy
        annihilateShares(msg.sender, numShares);
        // Transfer separationAmount of Assets
        uint256 numDeliverableAssets = module.pricefeed.numDeliverableAssets();
        for (uint256 i = 0; i < numDeliverableAssets; ++i) {
            AssetInterface Asset = AssetInterface(address(module.pricefeed.getDeliverableAssetAt(i)));
            uint256 vaultHoldings = Asset.balanceOf(this); // EXTERNAL CALL: Amount of asset base units this vault holds
            if (vaultHoldings == 0) continue;
            uint256 separationAmount = vaultHoldings.mul(numShares).div(prevTotalSupply); // ownership percentage of msg.sender
            // EXTERNAL CALL
            assert(Asset.transfer(msg.sender, separationAmount)); // EXTERNAL CALL: Send funds from vault to investor
        }
    }

    function createShares(address recipient, uint256 numShares)
        internal
    {
        totalSupply = totalSupply.add(numShares);
        addShares(recipient, numShares);
    }

    function annihilateShares(address recipient, uint256 numShares)
        internal
    {
        totalSupply = totalSupply.sub(numShares);
        subShares(recipient, numShares);
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
            wantAmount
        ))
        returns (bytes32 id)
    {
        approveSpending(haveToken, address(module.exchange), haveAmount);
        id = module.exchange.make(haveToken, wantToken, haveAmount, wantAmount);
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
            orderOwner)
        );
        uint256 wantedSellAmount = wantedBuyAmount.mul(offeredSellAmount).div(offeredBuyAmount);
        approveSpending(offeredSellToken, address(module.exchange), wantedSellAmount);
        return module.exchange.buy(id, wantedBuyAmount);
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
    /// Post: Token specific exchange as registered in universe, approved to spend ofToken
    function approveSpending(ERC20 ofToken, address onExchange, uint256 amount)
        internal
    {
        assert(ofToken.approve(onExchange, amount));
        LOGGER.logSpendingApproved(ofToken, onExchange, amount);
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
        ) = accounting.recalculationsAll(address(module.pricefeed));
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
