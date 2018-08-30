pragma solidity ^0.4.21;


import "../hub/Spoke.sol";
import "../trading/Trading.sol";
import "../fees/FeeManager.sol";
import "../shares/Shares.sol";
import "../../dependencies/ERC20.sol";
import "../../../src/dependencies/math.sol";
import "../../../src/pricefeeds/CanonicalPriceFeed.sol";

// NB: many functions simplified for now, not accounting for exchange-held assets
// TODO: remove any of these functions we don't use; a lot of this can be trimmed down
contract Accounting is DSMath, Spoke {

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

    address[] public ownedAssets;   // TODO: should this be here or in vault, or somewhere else?
    Trading public trading;
    CanonicalPriceFeed public canonicalPriceFeed;
    FeeManager public feeManager;
    Shares public shares;

    constructor(address _trading) { // TODO: for *all* components; find better way to instantiate related components for each spoke, instead of in constructor (if possible)
        trading = Trading(hub.trading());
        canonicalPriceFeed = CanonicalPriceFeed(hub.priceSource());
        feeManager = FeeManager(hub.feeManager());
        shares = Shares(hub.shares());
    }

    function getFundHoldings() returns (uint[], address[]) {
        uint[] memory _quantities = new uint[](ownedAssets.length);
        address[] memory _assets = new address[](ownedAssets.length);
        for (uint i = 0; i < ownedAssets.length; i++) {
            address ofAsset = ownedAssets[i];
            // assetHoldings formatting: mul(exchangeHoldings, 10 ** assetDecimal)
            uint assetHoldings = uint(ERC20(ofAsset).balanceOf(address(this)));

            if (assetHoldings != 0) {
                _assets[i] = ofAsset;
                _quantities[i] = assetHoldings;
            }
        }
        return (_quantities, _assets);
    }

    /// TODO: is this needed? can we just return the array?
    function getFundHoldingsLength() view returns (uint) {
        address[] memory addresses;
        (, addresses) = getFundHoldings();
        return addresses.length;
    }

    /// TODO: is this needed? can we implement in the policy itself?
    function calcAssetGAV(address ofAsset) returns (uint) {
        uint assetHolding = add(
            uint(ERC20(ofAsset).balanceOf(this)), // asset base units held by fund
            trading.quantityHeldInCustodyOfExchange(ofAsset)
        );
        // assetPrice formatting: mul(exchangePrice, 10 ** assetDecimal)
        bool isRecent;
        uint assetPrice;
        uint assetDecimals;
        (isRecent, assetPrice, assetDecimals) = canonicalPriceFeed.getPriceInfo(ofAsset);
        if (!isRecent) {
            revert();
        }
        return mul(assetHolding, assetPrice) / (10 ** uint256(assetDecimals));
    }

    // prices quoted in QUOTE_ASSET and multiplied by 10 ** assetDecimal
    // NB: removed the in-line adding to ownedAssets
    // NB: simplified for now, not accounting for exchange-held assets
    function calcGav() view returns (uint gav) {
        for (uint i = 0; i < ownedAssets.length; ++i) {
            address ofAsset = ownedAssets[i];
            // assetHoldings formatting: mul(exchangeHoldings, 10 ** assetDecimal)
            uint assetHoldings = add(
                uint(ERC20(ofAsset).balanceOf(address(this))),
                0
                // TODO: add back quantityHeldInCustodyOfExchange
            );
            // assetPrice formatting: mul(exchangePrice, 10 ** assetDecimal)
            bool isRecent;
            uint assetPrice;
            uint assetDecimals;
            (isRecent, assetPrice, assetDecimals) = canonicalPriceFeed.getPriceInfo(ofAsset);
            // NB: should we revert inside this view function, or just calculate it optimistically?
            //     maybe it should be left to consumers to decide whether to use older prices?
            //     or perhaps even source's job not to give untrustworthy prices?
            if (!isRecent) {
                revert();
            }
            // gav as sum of mul(assetHoldings, assetPrice) with formatting: mul(mul(exchangeHoldings, exchangePrice), 10 ** shareDecimals)
            gav = add(gav, mul(assetHoldings, assetPrice) / (10 ** uint(assetDecimals)));
        }
        return gav;
    }

    // TODO: this view function calls a non-view function; adjust accordingly
    function calcUnclaimedFees(uint gav) view returns (uint) {
        return feeManager.calculateTotalFees();
    }

    // TODO: this view function calls a non-view function; adjust accordingly
    function calcNav(uint gav, uint unclaimedFees) view returns (uint) {
        return sub(gav, unclaimedFees);
    }

    function calcValuePerShare(uint totalValue, uint numShares) view returns (uint) {
        require(numShares > 0);
        return (totalValue * 10 ** 18) / numShares;    // TODO: handle other decimals (decide if we will introduce that)
    }

    function performCalculations()
        view
        returns (
            uint gav,
            uint unclaimedFees,
            uint feesShareQuantity,
            uint nav,
            uint sharePrice
        )
    {
        gav = calcGav();
        unclaimedFees = feeManager.calculateTotalFees();    //TODO: fix; this is a state-modifying function right now
        nav = calcNav(gav, unclaimedFees);

        uint totalSupply = shares.totalSupply();
        // The value of unclaimedFees measured in shares of this fund at current value
        feesShareQuantity = (gav == 0) ? 0 : mul(totalSupply, unclaimedFees) / gav;
        // The total share supply including the value of unclaimedFees, measured in shares of this fund
        uint totalSupplyAccountingForFees = add(totalSupply, feesShareQuantity);
        sharePrice = totalSupply > 0 ?
            calcValuePerShare(gav, totalSupplyAccountingForFees) :
            10 ** 18; // TODO: handle other decimals (decide if we will introduce that)
    }
}

