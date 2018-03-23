pragma solidity ^0.4.19;

import "./assets/RestrictedShares.sol";
import "./assets/ERC223ReceivingContract.sol";
import "./dependencies/DBC.sol";
import "./dependencies/Owned.sol";
import "./compliance/ComplianceInterface.sol";
import "./pricefeeds/CanonicalPriceFeed.sol";
import "./riskmgmt/RiskMgmtInterface.sol";
import "./exchange/ExchangeInterface.sol";
import "./FundInterface.sol";
import "ds-weth/weth9.sol";
import "ds-math/math.sol";

/// @title Melon Fund Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Simple Melon Fund
contract Fund is DSMath, DBC, Owned, RestrictedShares, FundInterface, ERC223ReceivingContract {
    // TYPES

    struct Modules { // Describes all modular parts, standardised through an interface
        CanonicalPriceFeed pricefeed; // Provides all external data
        ComplianceInterface compliance; // Boolean functions regarding invest/redeem
        RiskMgmtInterface riskmgmt; // Boolean functions regarding make/take orders
    }

    struct Calculations { // List of internal calculations
        uint gav; // Gross asset value
        uint managementFee; // Time based fee
        uint performanceFee; // Performance based fee measured against QUOTE_ASSET
        uint unclaimedFees; // Fees not yet allocated to the fund manager
        uint nav; // Net asset value
        uint highWaterMark; // A record of best all-time fund performance
        uint totalSupply; // Total supply of shares
        uint timestamp; // Time when calculations are performed in seconds
    }

    enum RequestStatus { active, cancelled, executed }
    enum RequestType { invest, redeem, tokenFallbackRedeem }
    struct Request { // Describes and logs whenever asset enter and leave fund due to Participants
        address participant; // Participant in Melon fund requesting investment or redemption
        RequestStatus status; // Enum: active, cancelled, executed; Status of request
        RequestType requestType; // Enum: invest, redeem, tokenFallbackRedeem
        address requestAsset; // Address of the asset being requested
        uint shareQuantity; // Quantity of Melon fund shares
        uint giveQuantity; // Quantity in Melon asset to give to Melon fund to receive shareQuantity
        uint receiveQuantity; // Quantity in Melon asset to receive from Melon fund for given shareQuantity
        uint timestamp;     // Time of request creation in seconds
        uint atUpdateId;    // Pricefeed updateId when this request was created
    }

    struct Exchange {
        address exchange; // Address of the exchange
        ExchangeInterface exchangeAdapter; //Exchange adapter contracts respective to the exchange
        bool isApproveOnly; // True in case of exchange implementation which requires  are approved when an order is made instead of transfer
    }

    struct Order {
        uint id; // Order Id
        uint expiresAt; // Timestamp when the order expires
    }

    // FIELDS

    // Constant fields
    uint public constant MAX_FUND_ASSETS = 4; // Max ownable assets by the fund supported by gas limits
    uint public constant ORDER_EXPIRATION_TIME = 86400; // Expiration time for make orders
    // Constructor fields
    uint public MANAGEMENT_FEE_RATE; // Fee rate in QUOTE_ASSET per delta improvement in WAD
    uint public PERFORMANCE_FEE_RATE; // Fee rate in QUOTE_ASSET per managed seconds in WAD
    address public VERSION; // Address of Version contract
    Asset public QUOTE_ASSET; // QUOTE asset as ERC20 contract
    // Methods fields
    Modules public module; // Struct which holds all the initialised module instances
    Exchange[] public exchanges; // Array containing exchanges this fund supports
    Calculations public atLastUnclaimedFeeAllocation; // Calculation results at last allocateUnclaimedFees() call
    bool public isShutDown; // Security feature, if yes than investing, managing, allocateUnclaimedFees gets blocked
    Request[] public requests; // All the requests this fund received from participants
    mapping (address => bool) public isInvestAllowed; // If false, fund rejects investments from the key asset
    mapping (address => bool) public isRedeemAllowed; // If false, fund rejects redemptions in the key asset
    mapping (uint => mapping(address => Order)) public exchangeIdsToOpenMakeOrders; // exchangeIndex to: asset to open make orders
    address[] public ownedAssets; // List of all assets owned by the fund or for which the fund has open make orders
    mapping (address => bool) public isInAssetList; // Mapping from asset to whether the asset exists in ownedAssets
    mapping (address => bool) public isInOpenMakeOrder; // Mapping from asset to whether the asset is in a open make order as buy asset

    // METHODS

    // CONSTRUCTOR

    /// @dev Should only be called via Version.setupFund(..)
    /// @param withName human-readable descriptive name (not necessarily unique)
    /// @param ofQuoteAsset Asset against which mgmt and performance fee is measured against and which can be used to invest/redeem using this single asset
    /// @param ofManagementFee A time based fee expressed, given in a number which is divided by 1 WAD
    /// @param ofPerformanceFee A time performance based fee, performance relative to ofQuoteAsset, given in a number which is divided by 1 WAD
    /// @param ofCompliance Address of compliance module
    /// @param ofRiskMgmt Address of risk management module
    /// @param ofPriceFeed Address of price feed module
    /// @param ofExchanges Addresses of exchange on which this fund can trade
    /// @param ofExchangeAdapters Addresses of exchange adapters
    /// @return Deployed Fund with manager set as ofManager
    function Fund(
        address ofManager,
        bytes32 withName,
        address ofQuoteAsset,
        uint ofManagementFee,
        uint ofPerformanceFee,
        address ofCompliance,
        address ofRiskMgmt,
        address ofPriceFeed,
        address[] ofExchanges,
        address[] ofExchangeAdapters
    )
        RestrictedShares(withName, "MLNF", 18, now)
    {
        isInvestAllowed[ofQuoteAsset] = true;
        isRedeemAllowed[ofQuoteAsset] = true;
        owner = ofManager;
        require(ofManagementFee < 10 ** 18); // Require management fee to be less than 100 percent
        MANAGEMENT_FEE_RATE = ofManagementFee; // 1 percent is expressed as 0.01 * 10 ** 18
        require(ofPerformanceFee < 10 ** 18); // Require performance fee to be less than 100 percent
        PERFORMANCE_FEE_RATE = ofPerformanceFee; // 1 percent is expressed as 0.01 * 10 ** 18
        VERSION = msg.sender;
        module.compliance = ComplianceInterface(ofCompliance);
        module.riskmgmt = RiskMgmtInterface(ofRiskMgmt);
        module.pricefeed = CanonicalPriceFeed(ofPriceFeed);
        // Bridged to Melon exchange interface by exchangeAdapter library
        for (uint i = 0; i < ofExchanges.length; ++i) {
            ExchangeInterface adapter = ExchangeInterface(ofExchangeAdapters[i]);
            bool isApproveOnly = adapter.isApproveOnly();
            exchanges.push(Exchange({
                exchange: ofExchanges[i],
                exchangeAdapter: adapter,
                isApproveOnly: isApproveOnly
            }));
        }
        // Require Quote assets exists in pricefeed
        QUOTE_ASSET = Asset(ofQuoteAsset);
        // Quote Asset always in owned assets list
        ownedAssets.push(ofQuoteAsset);
        isInAssetList[ofQuoteAsset] = true;
        require(address(QUOTE_ASSET) == module.pricefeed.getQuoteAsset()); // Sanity check
        atLastUnclaimedFeeAllocation = Calculations({
            gav: 0,
            managementFee: 0,
            performanceFee: 0,
            unclaimedFees: 0,
            nav: 0,
            highWaterMark: 10 ** getDecimals(),
            totalSupply: totalSupply,
            timestamp: now
        });
    }

    // EXTERNAL METHODS

    // EXTERNAL : ADMINISTRATION

    /// @notice Enable investment in specified assets
    /// @param ofAssets Array of assets to enable investment in
    function enableInvestment(address[] ofAssets)
        external
        pre_cond(isOwner())
    {
        for (uint i = 0; i < ofAssets.length; ++i) {
            isInvestAllowed[ofAssets[i]] = true;
        }
    }

    /// @notice Disable investment in specified assets
    /// @param ofAssets Array of assets to disable investment in
    function disableInvestment(address[] ofAssets)
        external
        pre_cond(isOwner())
    {
        for (uint i = 0; i < ofAssets.length; ++i) {
            isInvestAllowed[ofAssets[i]] = false;
        }
    }

    /// @notice Enable redemption in specified assets
    /// @param ofAssets Array of assets to enable redemption in
    function enableRedemption(address[] ofAssets)
        external
        pre_cond(isOwner())
    {
        for (uint i = 0; i < ofAssets.length; ++i) {
            isRedeemAllowed[ofAssets[i]] = true;
        }
    }

    /// @notice Disable redemption in specified assets
    /// @param ofAssets Array of assets to disable redemption in
    function disableRedemption(address[] ofAssets)
        external
        pre_cond(isOwner())
    {
        for (uint i = 0; i < ofAssets.length; ++i) {
            isRedeemAllowed[ofAssets[i]] = false;
        }
    }

    function shutDown() external pre_cond(msg.sender == VERSION) { isShutDown = true; }

    // EXTERNAL : PARTICIPATION

    /// @notice Give melon tokens to receive shares of this fund
    /// @dev Recommended to give some leeway in prices to account for possibly slightly changing prices
    /// @param giveQuantity Quantity of Melon token times 10 ** 18 offered to receive shareQuantity
    /// @param shareQuantity Quantity of shares times 10 ** 18 requested to be received
    /// @param investmentAsset Address of asset to invest in
    function requestInvestment(
        uint giveQuantity,
        uint shareQuantity,
        address investmentAsset
    )
        external
        pre_cond(!isShutDown)
        pre_cond(isInvestAllowed[investmentAsset]) // investment using investmentAsset has not been deactivated by the Manager
        pre_cond(module.compliance.isInvestmentPermitted(msg.sender, giveQuantity, shareQuantity))    // Compliance Module: Investment permitted
    {
        requests.push(Request({
            participant: msg.sender,
            status: RequestStatus.active,
            requestType: RequestType.invest,
            requestAsset: investmentAsset,
            shareQuantity: shareQuantity,
            giveQuantity: giveQuantity,
            receiveQuantity: shareQuantity,
            timestamp: now,
            atUpdateId: module.pricefeed.getLastUpdateId()
        }));
        RequestUpdated(getLastRequestId());
    }

    /// @notice Give shares of this fund to receive melon tokens
    /// @dev Recommended to give some leeway in prices to account for possibly slightly changing prices
    /// @param shareQuantity Quantity of shares times 10 ** 18 offered to redeem
    /// @param receiveQuantity Quantity of Melon token times 10 ** 18 requested to receive for shareQuantity
    /// @param redemptionAsset Address of asset to redeem in
    function requestRedemption(
        uint shareQuantity,
        uint receiveQuantity,
        address redemptionAsset
      )
        external
        pre_cond(!isShutDown)
        pre_cond(isRedeemAllowed[redemptionAsset]) // Redemption using the redemptionAsset has not been deactivated by Manager
        pre_cond(module.compliance.isRedemptionPermitted(msg.sender, shareQuantity, receiveQuantity)) // Compliance Module: Redemption permitted
    {
        requests.push(Request({
            participant: msg.sender,
            status: RequestStatus.active,
            requestType: RequestType.redeem,
            requestAsset: redemptionAsset,
            shareQuantity: shareQuantity,
            giveQuantity: shareQuantity,
            receiveQuantity: receiveQuantity,
            timestamp: now,
            atUpdateId: module.pricefeed.getLastUpdateId()
        }));
        RequestUpdated(getLastRequestId());
    }

    /// @notice Executes active investment and redemption requests, in a way that minimises information advantages of investor
    /// @dev Distributes melon and shares according to the request
    /// @param id Index of request to be executed
    /// @dev Active investment or redemption request executed
    function executeRequest(uint id)
        external
        pre_cond(!isShutDown)
        pre_cond(requests[id].status == RequestStatus.active)
        pre_cond(requests[id].requestType != RequestType.redeem || requests[id].shareQuantity <= balances[requests[id].participant]) // request owner does not own enough shares
        pre_cond(
            totalSupply == 0 ||
            (
                now >= add(requests[id].timestamp, module.pricefeed.getInterval()) &&
                module.pricefeed.getLastUpdateId() >= add(requests[id].atUpdateId, 2)
            )
        )   // PriceFeed Module: Wait at least one interval time and two updates before continuing (unless it is the first investment)

    {
        Request request = requests[id];
        require(module.pricefeed.hasRecentPrice(address(request.requestAsset)));

        // sharePrice quoted in QUOTE_ASSET and multiplied by 10 ** fundDecimals
        uint costQuantity = toWholeShareUnit(mul(request.shareQuantity, calcSharePriceAndAllocateFees())); // By definition quoteDecimals == fundDecimals
        if (request.requestAsset != address(QUOTE_ASSET)) {
            var (isPriceRecent, invertedRequestAssetPrice, requestAssetDecimal) = module.pricefeed.getInvertedPriceInfo(request.requestAsset);
            if (!isPriceRecent) {
                revert();
            }
            costQuantity = mul(costQuantity, invertedRequestAssetPrice) / 10 ** requestAssetDecimal;
        }

        if (
            isInvestAllowed[request.requestAsset] &&
            request.requestType == RequestType.invest &&
            costQuantity <= request.giveQuantity
        ) {
            request.status = RequestStatus.executed;
            assert(AssetInterface(request.requestAsset).transferFrom(request.participant, this, costQuantity)); // Allocate Value
            createShares(request.participant, request.shareQuantity); // Accounting
            if (!isInAssetList[request.requestAsset]) {
                ownedAssets.push(request.requestAsset);
                isInAssetList[request.requestAsset] = true;
            }
        } else if (
            isRedeemAllowed[request.requestAsset] &&
            request.requestType == RequestType.redeem &&
            request.receiveQuantity <= costQuantity
        ) {
            request.status = RequestStatus.executed;
            assert(AssetInterface(request.requestAsset).transfer(request.participant, costQuantity)); // Return value
            annihilateShares(request.participant, request.shareQuantity); // Accounting
        } else if (
            isRedeemAllowed[request.requestAsset] &&
            request.requestType == RequestType.tokenFallbackRedeem &&
            request.receiveQuantity <= costQuantity
        ) {
            request.status = RequestStatus.executed;
            assert(AssetInterface(request.requestAsset).transfer(request.participant, costQuantity)); // Return value
            annihilateShares(this, request.shareQuantity); // Accounting
        } else {
            revert(); // Invalid Request or invalid giveQuantity / receiveQuantity
        }
    }

    /// @notice Cancels active investment and redemption requests
    /// @param id Index of request to be executed
    function cancelRequest(uint id)
        external
        pre_cond(requests[id].status == RequestStatus.active) // Request is active
        pre_cond(requests[id].participant == msg.sender || isShutDown) // Either request creator or fund is shut down
    {
        requests[id].status = RequestStatus.cancelled;
    }

    /// @notice Redeems by allocating an ownership percentage of each asset to the participant
    /// @dev Independent of running price feed!
    /// @param shareQuantity Number of shares owned by the participant, which the participant would like to redeem for individual assets
    /// @return Whether all assets sent to shareholder or not
    function redeemAllOwnedAssets(uint shareQuantity)
        external
        returns (bool success)
    {
        return emergencyRedeem(shareQuantity, ownedAssets);
    }

    // EXTERNAL : MANAGING

    /// @notice Makes an order on the selected exchange
    /// @dev These are orders that are not expected to settle immediately.  Sufficient balance (== sellQuantity) of sellAsset
    /// @param sellAsset Asset (as registered in Asset registrar) to be sold
    /// @param buyAsset Asset (as registered in Asset registrar) to be bought
    /// @param sellQuantity Quantity of sellAsset to be sold
    /// @param buyQuantity Quantity of buyAsset to be bought
    function makeOrder(
        uint exchangeId,
        address sellAsset,
        address buyAsset,
        uint sellQuantity,
        uint buyQuantity
    )
        external
        pre_cond(isOwner())
        pre_cond(!isShutDown)
    {
        require(buyAsset != address(this)); // Prevent buying of own fund token
        require(quantityHeldInCustodyOfExchange(sellAsset) == 0); // Curr only one make order per sellAsset allowed. Please wait or cancel existing make order.
        require(module.pricefeed.existsPriceOnAssetPair(sellAsset, buyAsset)); // PriceFeed module: Requested asset pair not valid
        var (isRecent, referencePrice, ) = module.pricefeed.getReferencePriceInfo(sellAsset, buyAsset);
        require(isRecent);  // Reference price is required to be recent
        require(
            module.riskmgmt.isMakePermitted(
                module.pricefeed.getOrderPriceInfo(
                    sellAsset,
                    buyAsset,
                    sellQuantity,
                    buyQuantity
                ),
                referencePrice,
                sellAsset,
                buyAsset,
                sellQuantity,
                buyQuantity
            )
        ); // RiskMgmt module: Make order not permitted
        require(isInAssetList[buyAsset] || ownedAssets.length < MAX_FUND_ASSETS); // Limit for max ownable assets by the fund reached
        require(AssetInterface(sellAsset).approve(exchanges[exchangeId].exchange, sellQuantity)); // Approve exchange to spend assets

        // Since there is only one openMakeOrder allowed for each asset, we can assume that openMakeOrderId is set as zero by quantityHeldInCustodyOfExchange() function
        require(address(exchanges[exchangeId].exchangeAdapter).delegatecall(bytes4(keccak256("makeOrder(address,address,address,uint256,uint256)")), exchanges[exchangeId].exchange, sellAsset, buyAsset, sellQuantity, buyQuantity));
        exchangeIdsToOpenMakeOrders[exchangeId][sellAsset].id = exchanges[exchangeId].exchangeAdapter.getLastOrderId(exchanges[exchangeId].exchange);
        exchangeIdsToOpenMakeOrders[exchangeId][sellAsset].expiresAt = add(now, ORDER_EXPIRATION_TIME);

        // Success defined as non-zero order id
        require(exchangeIdsToOpenMakeOrders[exchangeId][sellAsset].id != 0);

        // Update ownedAssets array and isInAssetList, isInOpenMakeOrder mapping
        isInOpenMakeOrder[buyAsset] = true;
        if (!isInAssetList[buyAsset]) {
            ownedAssets.push(buyAsset);
            isInAssetList[buyAsset] = true;
        }

        OrderUpdated(exchangeId, exchangeIdsToOpenMakeOrders[exchangeId][sellAsset].id);
    }

    /// @notice Takes an active order on the selected exchange
    /// @dev These are orders that are expected to settle immediately
    /// @param id Active order id
    /// @param receiveQuantity Buy quantity of what others are selling on selected Exchange
    function takeOrder(uint exchangeId, uint id, uint receiveQuantity)
        external
        pre_cond(isOwner())
        pre_cond(!isShutDown)
    {
        // Get information of order by order id
        var (
            sellAsset,
            buyAsset,
            sellQuantity,
            buyQuantity
        ) = exchanges[exchangeId].exchangeAdapter.getOrder(exchanges[exchangeId].exchange, id);
        // Check pre conditions
        require(sellAsset != address(this)); // Prevent buying of own fund token
        require(module.pricefeed.existsPriceOnAssetPair(buyAsset, sellAsset)); // PriceFeed module: Requested asset pair not valid
        require(isInAssetList[sellAsset] || ownedAssets.length < MAX_FUND_ASSETS); // Limit for max ownable assets by the fund reached
        var (isRecent, referencePrice, ) = module.pricefeed.getReferencePriceInfo(buyAsset, sellAsset);
        require(isRecent); // Reference price is required to be recent
        require(receiveQuantity <= sellQuantity); // Not enough quantity of order for what is trying to be bought
        uint spendQuantity = mul(receiveQuantity, buyQuantity) / sellQuantity;
        require(AssetInterface(buyAsset).approve(exchanges[exchangeId].exchange, spendQuantity)); // Could not approve spending of spendQuantity of buyAsset
        require(
            module.riskmgmt.isTakePermitted(
            module.pricefeed.getOrderPriceInfo(
                buyAsset,
                sellAsset,
                buyQuantity, // spendQuantity
                sellQuantity // receiveQuantity
            ),
            referencePrice,
            buyAsset,
            sellAsset,
            buyQuantity,
            sellQuantity
        )); // RiskMgmt module: Take order not permitted

        // Execute request
        require(address(exchanges[exchangeId].exchangeAdapter).delegatecall(bytes4(keccak256("takeOrder(address,uint256,uint256)")), exchanges[exchangeId].exchange, id, receiveQuantity));

        // Update ownedAssets array and isInAssetList mapping
        if (!isInAssetList[sellAsset]) {
            ownedAssets.push(sellAsset);
            isInAssetList[sellAsset] = true;
        }

        OrderUpdated(exchangeId, id);
    }

    /// @notice Cancels orders that were not expected to settle immediately, i.e. makeOrders
    /// @dev Reduce exposure with exchange interaction
    /// @param exchangeId Number of the exchange
    /// @param ofAsset Asset for which we want to cancel an order
    function cancelOrder(uint exchangeId, address ofAsset)
        external
        pre_cond(isOwner() || isShutDown || block.timestamp >= exchangeIdsToOpenMakeOrders[exchangeId][ofAsset].expiresAt)
    {
        uint orderId = exchangeIdsToOpenMakeOrders[exchangeId][ofAsset].id;
        require(orderId != 0); // ensure this order exists
        // Execute request
        require(address(exchanges[exchangeId].exchangeAdapter).delegatecall(bytes4(keccak256("cancelOrder(address,uint256)")), exchanges[exchangeId].exchange, orderId));
        delete exchangeIdsToOpenMakeOrders[exchangeId][ofAsset];

        OrderUpdated(exchangeId, orderId);
    }


    // PUBLIC METHODS

    // PUBLIC METHODS : ERC223

    /// @dev Standard ERC223 function that handles incoming token transfers.
    /// @dev This type of redemption can be seen as a "market order", where price is calculated at execution time
    /// @param ofSender  Token sender address.
    /// @param tokenAmount Amount of tokens sent.
    /// @param metadata  Transaction metadata.
    function tokenFallback(
        address ofSender,
        uint tokenAmount,
        bytes metadata
    ) {
        if (msg.sender != address(this)) {
            // when ofSender is a recognized exchange, receive tokens, otherwise revert
            for (uint i; i < exchanges.length; i++) {
                if (exchanges[i].exchange == ofSender) return; // receive tokens and do nothing
            }
            revert();
        } else {    // otherwise, make a redemption request
            requests.push(Request({
                participant: ofSender,
                status: RequestStatus.active,
                requestType: RequestType.tokenFallbackRedeem,
                requestAsset: address(QUOTE_ASSET), // redeem in QUOTE_ASSET
                shareQuantity: tokenAmount,
                giveQuantity: tokenAmount,              // shares being sent
                receiveQuantity: 0,          // value of the shares at request time
                timestamp: now,
                atUpdateId: module.pricefeed.getLastUpdateId()
            }));
            RequestUpdated(getLastRequestId());
        }
    }


    // PUBLIC METHODS : ACCOUNTING

    /// @notice Calculates gross asset value of the fund
    /// @dev Decimals in assets must be equal to decimals in PriceFeed for all entries in AssetRegistrar
    /// @dev Assumes that module.pricefeed.getPriceInfo(..) returns recent prices
    /// @return gav Gross asset value quoted in QUOTE_ASSET and multiplied by 10 ** shareDecimals
    function calcGav() returns (uint gav) {
        // prices quoted in QUOTE_ASSET and multiplied by 10 ** assetDecimal
        uint[] memory allAssetHoldings = new uint[](ownedAssets.length);
        uint[] memory allAssetPrices = new uint[](ownedAssets.length);
        address[] memory tempOwnedAssets;
        tempOwnedAssets = ownedAssets;
        delete ownedAssets;
        for (uint i = 0; i < tempOwnedAssets.length; ++i) {
            address ofAsset = tempOwnedAssets[i];
            // assetHoldings formatting: mul(exchangeHoldings, 10 ** assetDecimal)
            uint assetHoldings = add(
                uint(AssetInterface(ofAsset).balanceOf(this)), // asset base units held by fund
                quantityHeldInCustodyOfExchange(ofAsset)
            );
            // assetPrice formatting: mul(exchangePrice, 10 ** assetDecimal)
            var (isRecent, assetPrice, assetDecimals) = module.pricefeed.getPriceInfo(ofAsset);
            if (!isRecent) {
                revert();
            }
            allAssetHoldings[i] = assetHoldings;
            allAssetPrices[i] = assetPrice;
            // gav as sum of mul(assetHoldings, assetPrice) with formatting: mul(mul(exchangeHoldings, exchangePrice), 10 ** shareDecimals)
            gav = add(gav, mul(assetHoldings, assetPrice) / (10 ** uint256(assetDecimals)));   // Sum up product of asset holdings of this vault and asset prices
            if (assetHoldings != 0 || ofAsset == address(QUOTE_ASSET) || isInOpenMakeOrder[ofAsset]) { // Check if asset holdings is not zero or is address(QUOTE_ASSET) or in open make order
                ownedAssets.push(ofAsset);
            } else {
                isInAssetList[ofAsset] = false; // Remove from ownedAssets if asset holdings are zero
            }
        }
        PortfolioContent(tempOwnedAssets, allAssetHoldings, allAssetPrices);
    }

    /**
    @notice Calculates unclaimed fees of the fund manager
    @param gav Gross asset value in QUOTE_ASSET and multiplied by 10 ** shareDecimals
    @return {
      "managementFees": "A time (seconds) based fee in QUOTE_ASSET and multiplied by 10 ** shareDecimals",
      "performanceFees": "A performance (rise of sharePrice measured in QUOTE_ASSET) based fee in QUOTE_ASSET and multiplied by 10 ** shareDecimals",
      "unclaimedfees": "The sum of both managementfee and performancefee in QUOTE_ASSET and multiplied by 10 ** shareDecimals"
    }
    */
    function calcUnclaimedFees(uint gav)
        view
        returns (
            uint managementFee,
            uint performanceFee,
            uint unclaimedFees)
    {
        // Management fee calculation
        uint timePassed = sub(now, atLastUnclaimedFeeAllocation.timestamp);
        uint gavPercentage = mul(timePassed, gav) / (1 years);
        managementFee = wmul(gavPercentage, MANAGEMENT_FEE_RATE);

        // Performance fee calculation
        // Handle potential division through zero by defining a default value
        uint valuePerShareExclMgmtFees = totalSupply > 0 ? calcValuePerShare(sub(gav, managementFee), totalSupply) : toSmallestShareUnit(1);
        if (valuePerShareExclMgmtFees > atLastUnclaimedFeeAllocation.highWaterMark) {
            uint gainInSharePrice = sub(valuePerShareExclMgmtFees, atLastUnclaimedFeeAllocation.highWaterMark);
            uint investmentProfits = wmul(gainInSharePrice, totalSupply);
            performanceFee = wmul(investmentProfits, PERFORMANCE_FEE_RATE);
        }

        // Sum of all FEES
        unclaimedFees = add(managementFee, performanceFee);
    }

    /// @notice Calculates the Net asset value of this fund
    /// @param gav Gross asset value of this fund in QUOTE_ASSET and multiplied by 10 ** shareDecimals
    /// @param unclaimedFees The sum of both managementFee and performanceFee in QUOTE_ASSET and multiplied by 10 ** shareDecimals
    /// @return nav Net asset value in QUOTE_ASSET and multiplied by 10 ** shareDecimals
    function calcNav(uint gav, uint unclaimedFees)
        view
        returns (uint nav)
    {
        nav = sub(gav, unclaimedFees);
    }

    /// @notice Calculates the share price of the fund
    /// @dev Convention for valuePerShare (== sharePrice) formatting: mul(totalValue / numShares, 10 ** decimal), to avoid floating numbers
    /// @dev Non-zero share supply; value denominated in [base unit of melonAsset]
    /// @param totalValue the total value in QUOTE_ASSET and multiplied by 10 ** shareDecimals
    /// @param numShares the number of shares multiplied by 10 ** shareDecimals
    /// @return valuePerShare Share price denominated in QUOTE_ASSET and multiplied by 10 ** shareDecimals
    function calcValuePerShare(uint totalValue, uint numShares)
        view
        pre_cond(numShares > 0)
        returns (uint valuePerShare)
    {
        valuePerShare = toSmallestShareUnit(totalValue) / numShares;
    }

    /**
    @notice Calculates essential fund metrics
    @return {
      "gav": "Gross asset value of this fund denominated in [base unit of melonAsset]",
      "managementFee": "A time (seconds) based fee",
      "performanceFee": "A performance (rise of sharePrice measured in QUOTE_ASSET) based fee",
      "unclaimedFees": "The sum of both managementFee and performanceFee denominated in [base unit of melonAsset]",
      "feesShareQuantity": "The number of shares to be given as fees to the manager",
      "nav": "Net asset value denominated in [base unit of melonAsset]",
      "sharePrice": "Share price denominated in [base unit of melonAsset]"
    }
    */
    function performCalculations()
        view
        returns (
            uint gav,
            uint managementFee,
            uint performanceFee,
            uint unclaimedFees,
            uint feesShareQuantity,
            uint nav,
            uint sharePrice
        )
    {
        gav = calcGav(); // Reflects value independent of fees
        (managementFee, performanceFee, unclaimedFees) = calcUnclaimedFees(gav);
        nav = calcNav(gav, unclaimedFees);

        // The value of unclaimedFees measured in shares of this fund at current value
        feesShareQuantity = (gav == 0) ? 0 : mul(totalSupply, unclaimedFees) / gav;
        // The total share supply including the value of unclaimedFees, measured in shares of this fund
        uint totalSupplyAccountingForFees = add(totalSupply, feesShareQuantity);
        sharePrice = nav > 0 ? calcValuePerShare(gav, totalSupplyAccountingForFees) : toSmallestShareUnit(1); // Handle potential division through zero by defining a default value
    }

    /// @notice Converts unclaimed fees of the manager into fund shares
    /// @return sharePrice Share price denominated in [base unit of melonAsset]
    function calcSharePriceAndAllocateFees() public returns (uint)
    {
        var (
            gav,
            managementFee,
            performanceFee,
            unclaimedFees,
            feesShareQuantity,
            nav,
            sharePrice
        ) = performCalculations();

        createShares(owner, feesShareQuantity); // Updates totalSupply by creating shares allocated to manager

        // Update Calculations
        uint highWaterMark = atLastUnclaimedFeeAllocation.highWaterMark >= sharePrice ? atLastUnclaimedFeeAllocation.highWaterMark : sharePrice;
        atLastUnclaimedFeeAllocation = Calculations({
            gav: gav,
            managementFee: managementFee,
            performanceFee: performanceFee,
            unclaimedFees: unclaimedFees,
            nav: nav,
            highWaterMark: highWaterMark,
            totalSupply: totalSupply,
            timestamp: now
        });

        FeesConverted(now, feesShareQuantity, unclaimedFees);
        CalculationUpdate(now, managementFee, performanceFee, nav, sharePrice, totalSupply);

        return sharePrice;
    }

    // PUBLIC : REDEEMING

    /// @notice Redeems by allocating an ownership percentage only of requestedAssets to the participant
    /// @dev This works, but with loops, so only up to a certain number of assets (right now the max is 4)
    /// @dev Independent of running price feed! Note: if requestedAssets != ownedAssets then participant misses out on some owned value
    /// @param shareQuantity Number of shares owned by the participant, which the participant would like to redeem for individual assets
    /// @param requestedAssets List of addresses that consitute a subset of ownedAssets.
    /// @return Whether all assets sent to shareholder or not
    function emergencyRedeem(uint shareQuantity, address[] requestedAssets)
        public
        pre_cond(balances[msg.sender] >= shareQuantity)  // sender owns enough shares
        returns (bool)
    {
        address ofAsset;
        uint[] memory ownershipQuantities = new uint[](requestedAssets.length);
        address[] memory redeemedAssets = new address[](requestedAssets.length);

        // Check whether enough assets held by fund
        for (uint i = 0; i < requestedAssets.length; ++i) {
            ofAsset = requestedAssets[i];
            for (uint j = 0; j < redeemedAssets.length; j++) {
                if (ofAsset == redeemedAssets[j]) {
                    revert();
                }
            }
            redeemedAssets[i] = ofAsset;
            uint assetHoldings = add(
                uint(AssetInterface(ofAsset).balanceOf(this)),
                quantityHeldInCustodyOfExchange(ofAsset)
            );

            if (assetHoldings == 0) continue;

            // participant's ownership percentage of asset holdings
            ownershipQuantities[i] = mul(assetHoldings, shareQuantity) / totalSupply;

            // CRITICAL ERR: Not enough fund asset balance for owed ownershipQuantitiy, eg in case of unreturned asset quantity at address(exchanges[i].exchange) address
            if (uint(AssetInterface(ofAsset).balanceOf(this)) < ownershipQuantities[i]) {
                isShutDown = true;
                ErrorMessage("CRITICAL ERR: Not enough assetHoldings for owed ownershipQuantitiy");
                return false;
            }
        }

        // Annihilate shares before external calls to prevent reentrancy
        annihilateShares(msg.sender, shareQuantity);

        // Transfer ownershipQuantity of Assets
        for (uint k = 0; k < requestedAssets.length; ++k) {
            // Failed to send owed ownershipQuantity from fund to participant
            ofAsset = requestedAssets[k];
            if (ownershipQuantities[k] == 0) {
                continue;
            } else if (!AssetInterface(ofAsset).transfer(msg.sender, ownershipQuantities[k])) {
                revert();
            }
        }
        Redeemed(msg.sender, now, shareQuantity);
        return true;
    }

    // PUBLIC : FEES

    /// @dev Quantity of asset held in exchange according to associated order id
    /// @param ofAsset Address of asset
    /// @return Quantity of input asset held in exchange
    function quantityHeldInCustodyOfExchange(address ofAsset) returns (uint) {
        uint totalSellQuantity;     // quantity in custody across exchanges
        uint totalSellQuantityInApprove; // quantity of asset in approve (allowance) but not custody of exchange
        for (uint i; i < exchanges.length; i++) {
            if (exchangeIdsToOpenMakeOrders[i][ofAsset].id == 0) {
                continue;
            }
            var (sellAsset, , sellQuantity, ) = exchanges[i].exchangeAdapter.getOrder(exchanges[i].exchange, exchangeIdsToOpenMakeOrders[i][ofAsset].id);
            if (sellQuantity == 0) {    // remove id if remaining sell quantity zero (closed)
                delete exchangeIdsToOpenMakeOrders[i][ofAsset];
            }
            totalSellQuantity = add(totalSellQuantity, sellQuantity);
            if (exchanges[i].isApproveOnly) {
                totalSellQuantityInApprove += sellQuantity;
            }
        }
        if (totalSellQuantity == 0) {
            isInOpenMakeOrder[sellAsset] = false;
        }
        return sub(totalSellQuantity, totalSellQuantityInApprove); // Since quantity in approve is not actually in custody
    }

    // PUBLIC VIEW METHODS

    /// @notice Calculates sharePrice denominated in [base unit of melonAsset]
    /// @return sharePrice Share price denominated in [base unit of melonAsset]
    function calcSharePrice() view returns (uint sharePrice) {
        (, , , , , sharePrice) = performCalculations();
        return sharePrice;
    }

    function getModules() view returns (address, address, address) {
        return (
            address(module.pricefeed),
            address(module.compliance),
            address(module.riskmgmt)
        );
    }

    function getLastRequestId() view returns (uint) { return requests.length - 1; }
    function getManager() view returns (address) { return owner; }
}
