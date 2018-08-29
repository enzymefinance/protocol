pragma solidity ^0.4.21;


import "../../dependencies/ERC20.sol";

// NB: many functions simplified for now, not accounting for exchange-held assets
// TODO: remove any of these functions we don't use
contract Accounting {
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
        var (holdings, addresses) = getFundHoldings();
        return addresses.length;
    }

    /// TODO: is this needed? can we implement in the policy itself?
    function calcAssetGAV(address ofAsset) returns (uint) {
        uint assetHolding = add(
            uint(ERC20(ofAsset).balanceOf(this)), // asset base units held by fund
            quantityHeldInCustodyOfExchange(ofAsset)
        );
        // assetPrice formatting: mul(exchangePrice, 10 ** assetDecimal)
        var (isRecent, assetPrice, assetDecimals) = hub.priceSource.getPriceInfo(ofAsset);
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
                uint(ERC20(ofAsset).balanceOf(address(this)))
            );
            // assetPrice formatting: mul(exchangePrice, 10 ** assetDecimal)
            var (isRecent, assetPrice, assetDecimals) = hub.priceSource.getPriceInfo(ofAsset);
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
    function calcUnclaimedFees(uint gav) view returns (uint, uint, uint) {
        return feeManager.calculateTotalFees(hub);
    }

    // TODO: this view function calls a non-view function; adjust accordingly
    function calcNav(uint gav, uint unclaimedFees) view returns (uint) {
        uint gav = calcGav();
        uint (, , unclaimedFees) = calcUnclaimedFees();
        return sub(gav, unclaimedFees);
    }

    function calcValuePerShare(uint totalValue, uint numShares) view returns (uint);

    function calcSharePrice() view returns (uint) {
        uint sharePrice = _totalSupply > 0 ?
                            calcValuePerShare(gav, totalSupplyAccountingForFees) :
                            toSmallestShareUnit(1); // Handle potential division by zero with default
        return sharePrice;
    }

    function performCalculations() view returns (
        uint gav,
        uint managementFee,
        uint performanceFee,
        uint unclaimedFees,
        uint feesShareQuantity,
        uint nav,
        uint sharePrice
    );
}

