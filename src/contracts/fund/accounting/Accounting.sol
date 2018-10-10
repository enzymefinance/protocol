pragma solidity ^0.4.21;


import "../hub/Spoke.sol";
import "../trading/Trading.sol";
import "../fees/FeeManager.sol";
import "../shares/Shares.sol";
import "../vault/Vault.sol";
import "../../dependencies/ERC20.sol";
import "../../factory/Factory.sol";
import "../../dependencies/math.sol";
import "../../prices/CanonicalPriceFeed.sol";

// NB: many functions simplified for now
// TODO: remove any of these functions we don't use; a lot of this can be trimmed down
contract Accounting is DSMath, Spoke {

    struct Calculations {
        uint gav;
        uint nav;
        uint allocatedFees;
        uint totalSupply;
        uint timestamp;
    }

    address[] public ownedAssets;   // TODO: should this be here or in vault, or somewhere else?
    mapping (address => bool) public isInAssetList; // TODO: same as above
    address public QUOTE_ASSET;
    Calculations public atLastAllocation;

    constructor(address _hub, address[] _defaultAssets)
        Spoke(_hub)
    {
        for (uint i = 0; i < _defaultAssets.length; i++) {
            _addAssetToOwnedAssets(_defaultAssets[i]);
        }
        QUOTE_ASSET = _defaultAssets[0]; // TODO: clean this up; maybe another parameter, or document and leave this convention intact
    }

    function getFundHoldings() returns (uint[], address[]) {
        uint[] memory _quantities = new uint[](ownedAssets.length);
        address[] memory _assets = new address[](ownedAssets.length);
        for (uint i = 0; i < ownedAssets.length; i++) {
            address ofAsset = ownedAssets[i];
            // assetHoldings formatting: mul(exchangeHoldings, 10 ** assetDecimal)
            uint quantityHeld = assetHoldings(ofAsset);

            if (quantityHeld != 0) {
                _assets[i] = ofAsset;
                _quantities[i] = quantityHeld;
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
        uint quantityHeld = assetHoldings(ofAsset);
        // assetPrice formatting: mul(exchangePrice, 10 ** assetDecimal)
        bool isRecent;
        uint assetPrice;
        uint assetDecimals;
        (isRecent, assetPrice, assetDecimals) = CanonicalPriceFeed(routes.priceSource).getPriceInfo(ofAsset);
        if (!isRecent) {
            revert();
        }
        return mul(quantityHeld, assetPrice) / (10 ** uint(assetDecimals));
    }

    function assetHoldings(address _asset) returns (uint) {
        return add(
            uint(ERC20(_asset).balanceOf(Vault(routes.vault))),
            Trading(routes.trading).quantityBeingTraded(_asset)
        );
    }

    // prices quoted in QUOTE_ASSET and multiplied by 10 ** assetDecimal
    // NB: removed the in-line adding to and removing from ownedAssets so taht it can be a view function
    function calcGav() view returns (uint gav) {
        for (uint i = 0; i < ownedAssets.length; ++i) {
            address ofAsset = ownedAssets[i];
            // assetHoldings formatting: mul(exchangeHoldings, 10 ** assetDecimal)
            uint quantityHeld = assetHoldings(ofAsset);
            // assetPrice formatting: mul(exchangePrice, 10 ** assetDecimal)
            bool isRecent;
            uint assetPrice;
            uint assetDecimals;
            (isRecent, assetPrice, assetDecimals) = CanonicalPriceFeed(routes.priceSource).getPriceInfo(ofAsset);
            // NB: should we revert inside this view function, or just calculate it optimistically?
            //     maybe it should be left to consumers to decide whether to use older prices?
            //     or perhaps even source's job not to give untrustworthy prices?
            if (!isRecent) {
                revert();
            }
            // gav as sum of mul(assetHoldings, assetPrice) with formatting: mul(mul(exchangeHoldings, exchangePrice), 10 ** shareDecimals)
            gav = add(gav, mul(quantityHeld, assetPrice) / (10 ** uint(assetDecimals)));
        }
        return gav;
    }

    // TODO: this view function calls a non-view function; adjust accordingly
    // TODO: this may be redundant, and does not use its input parameter now
    function calcUnclaimedFees(uint gav) view returns (uint) {
        return FeeManager(routes.feeManager).totalFeeAmount();
    }

    // TODO: this view function calls a non-view function; adjust accordingly
    function calcNav(uint gav, uint unclaimedFees) view returns (uint) {
        return sub(gav, unclaimedFees);
    }

    function calcValuePerShare(uint totalValue, uint numShares) view returns (uint) {
        require(numShares > 0);
        return (totalValue * 10 **18) / numShares;    // TODO: handle other decimals (decide if we will introduce that)
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
        unclaimedFees = FeeManager(routes.feeManager).totalFeeAmount();
        nav = calcNav(gav, unclaimedFees);

        uint totalSupply = Shares(routes.shares).totalSupply();
        // The value of unclaimedFees measured in shares of this fund at current value
        feesShareQuantity = (gav == 0) ? 0 : mul(totalSupply, unclaimedFees) / gav;
        // The total share supply including the value of unclaimedFees, measured in shares of this fund
        uint totalSupplyAccountingForFees = add(totalSupply, feesShareQuantity);
        sharePrice = totalSupply > 0 ?
            calcValuePerShare(gav, totalSupplyAccountingForFees) :
            10 ** 18; // TODO: handle other decimals (decide if we will introduce that)
    }

    // TODO: delete if possible, or revise implementation
    function calcSharePrice() view returns (uint sharePrice) {
        (,,,,sharePrice) = performCalculations();
        return sharePrice;
    }

    // calculates several metrics, updates stored calculation object and rewards fees
    // TODO: find a better way to do these things without this exact method
    // TODO: math is off here (need to check fees, when they are calculated, quantity in exchanges and trading module, etc.)
    function calcSharePriceAndAllocateFees() public returns (uint) {
        updateOwnedAssets();
        uint gav;
        uint unclaimedFees;
        uint feesShareQuantity;
        uint nav;
        uint sharePrice;
        (gav, unclaimedFees, feesShareQuantity, nav, sharePrice) = performCalculations();
        uint totalSupply = Shares(routes.shares).totalSupply();
        FeeManager(routes.feeManager).rewardAllFees();
        atLastAllocation = Calculations({
            gav: gav,
            nav: nav,
            allocatedFees: unclaimedFees,
            totalSupply: totalSupply,
            timestamp: block.timestamp
        });
        return sharePrice;
    }

    // TODO: maybe run as a "bump" function, every state-changing method call
    function updateOwnedAssets() public {
        for (uint i = 0; i < ownedAssets.length; i++) {
            address ofAsset = ownedAssets[i];
            // TODO: verify commented condition is redundant and remove if so
            // (i.e. it is always the case when `assetHoldings > 0` is true)
            // || Trading(routes.trading).isInOpenMakeOrder(ofAsset)
            if (assetHoldings(ofAsset) > 0 || ofAsset == address(QUOTE_ASSET)) {
                _addAssetToOwnedAssets(ofAsset);
            } else {
                _removeFromOwnedAssets(ofAsset);
            }
        }
    }

    function addAssetToOwnedAssets(address _asset) public auth {
        _addAssetToOwnedAssets(_asset);
    }

    function removeFromOwnedAssets(address _asset) public auth {
        _removeFromOwnedAssets(_asset);
    }

    // needed for constructor to be able to call
    // TODO: consider redesign of this approach; does it work now that we've introduced auth?
    function _addAssetToOwnedAssets(address _asset) internal {
        if (!isInAssetList[_asset]) {
            isInAssetList[_asset] = true;
            ownedAssets.push(_asset);
        }
    }

    // TODO: ownedAssets length needs upper limit due to iteration here and elsewhere
    function _removeFromOwnedAssets(address _asset) internal {
        if (isInAssetList[_asset]) {
            isInAssetList[_asset] = false;
            for (uint i; i < ownedAssets.length; i++) {
                if (ownedAssets[i] == _asset) {
                    ownedAssets[i] = ownedAssets[ownedAssets.length - 1];
                    ownedAssets.length--;
                    break;
                }
            }
        }
    }
}

contract AccountingFactory is Factory {
    function createInstance(address _hub, address[] _defaultAssets) public returns (address) {
        address accounting = new Accounting(_hub, _defaultAssets);
        childExists[accounting] = true;
        return accounting;
    }
}

