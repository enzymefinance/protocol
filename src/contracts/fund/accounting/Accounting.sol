pragma solidity ^0.4.21;

import "math.sol";
import "ERC20.i.sol";
import "Factory.sol";
import "CanonicalPriceFeed.sol";
import "FeeManager.sol";
import "Spoke.sol";
import "Shares.sol";
import "Trading.sol";
import "Vault.sol";
import "Accounting.i.sol";

contract Accounting is AccountingInterface, DSMath, Spoke {

    struct Calculations {
        uint gav;
        uint nav;
        uint allocatedFees;
        uint totalSupply;
        uint timestamp;
    }

    uint constant public MAX_OWNED_ASSETS = 50; // TODO: Analysis
    address[] public ownedAssets;
    mapping (address => bool) public isInAssetList;
    address public QUOTE_ASSET;
    address public NATIVE_ASSET;
    uint public DEFAULT_SHARE_PRICE;
    uint public SHARES_DECIMALS;
    Calculations public atLastAllocation;

    constructor(address _hub, address _quoteAsset, address _nativeAsset, address[] _defaultAssets)
        Spoke(_hub)
    {
        for (uint i = 0; i < _defaultAssets.length; i++) {
            _addAssetToOwnedAssets(_defaultAssets[i]);
        }
        QUOTE_ASSET = _quoteAsset;
        NATIVE_ASSET = _nativeAsset;
        SHARES_DECIMALS = 18;
        DEFAULT_SHARE_PRICE = 10 ** SHARES_DECIMALS;
    }

    function getOwnedAssetsLength() view returns (uint) {
        return ownedAssets.length;
    }

    function assetHoldings(address _asset) public returns (uint) {
        return add(
            uint(ERC20(_asset).balanceOf(Vault(routes.vault))),
            Trading(routes.trading).updateAndGetQuantityBeingTraded(_asset)
        );
    }

    /// @dev Returns sparse array
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

    function calcAssetGAV(address ofAsset) returns (uint) {
        uint quantityHeld = assetHoldings(ofAsset);
        // assetPrice formatting: mul(exchangePrice, 10 ** assetDecimal)
        bool isRecent;
        uint assetPrice;
        uint assetDecimals;
        (isRecent, assetPrice, assetDecimals) = CanonicalPriceFeed(routes.priceSource).getPriceInfo(ofAsset);
        require(isRecent, "Price is not recent");
        return mul(quantityHeld, assetPrice) / (10 ** uint(assetDecimals));
    }

    // prices quoted in QUOTE_ASSET and multiplied by 10 ** assetDecimal
    // NB: removed the in-line adding to and removing from ownedAssets so taht it can be a view function
    function calcGav() public returns (uint gav) {
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
            require(isRecent, "Price is not recent");
            // gav as sum of mul(assetHoldings, assetPrice) with formatting: mul(mul(exchangeHoldings, exchangePrice), 10 ** shareDecimals)
            gav = add(gav, mul(quantityHeld, assetPrice) / (10 ** uint(assetDecimals)));
        }
        return gav;
    }

    function calcNav(uint gav, uint unclaimedFees) public pure returns (uint) {
        return sub(gav, unclaimedFees);
    }

    function calcValuePerShare(uint totalValue, uint numShares) view returns (uint) {
        require(numShares > 0, "No shares to calculate value for");
        return (totalValue * 10 ** SHARES_DECIMALS) / numShares;
    }

    function performCalculations()
        returns (
            uint gav,
            uint unclaimedFees,
            uint feesInShares,
            uint nav,
            uint sharePrice
        )
    {
        gav = calcGav();
        unclaimedFees = FeeManager(routes.feeManager).totalFeeAmount();
        nav = calcNav(gav, unclaimedFees);

        uint totalSupply = Shares(routes.shares).totalSupply();
        // The value of unclaimedFees measured in shares of this fund at current value
        feesInShares = (gav == 0) ?
            0 :
            mul(totalSupply, unclaimedFees) / gav;
        // The total share supply including the value of unclaimedFees, measured in shares of this fund
        uint totalSupplyAccountingForFees = add(totalSupply, feesInShares);
        sharePrice = (totalSupply > 0) ?
            calcValuePerShare(gav, totalSupplyAccountingForFees) :
            DEFAULT_SHARE_PRICE;
    }

    function calcSharePrice() returns (uint sharePrice) {
        (,,,,sharePrice) = performCalculations();
        return sharePrice;
    }

    // calculates several metrics, updates stored calculation object and rewards fees
    function calcSharePriceAndAllocateFees() public returns (uint) {
        updateOwnedAssets();
        uint gav;
        uint unclaimedFees;
        uint feesInShares;
        uint nav;
        uint sharePrice;
        (gav, unclaimedFees, feesInShares, nav, sharePrice) = performCalculations();
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

    // TODO: maybe run as a "bump" or "stub" function, every state-changing method call
    // TODO: run on some state changes (from trading for example)
    /// @dev Check holdings for all assets, and adjust list
    function updateOwnedAssets() public {
        for (uint i = 0; i < ownedAssets.length; i++) {
            address ofAsset = ownedAssets[i];
            if (
                assetHoldings(ofAsset) > 0 ||
                ofAsset == address(QUOTE_ASSET)
            ) {
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

    /// @dev Just pass if asset already registered
    function _addAssetToOwnedAssets(address _asset) internal {
        if (!isInAssetList[_asset]) {
            require(
                ownedAssets.length < MAX_OWNED_ASSETS,
                "Max owned asset limit reached"
            );
            isInAssetList[_asset] = true;
            ownedAssets.push(_asset);
            emit AssetAddition(_asset);
        }
    }

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
        emit AssetRemoval(_asset);
    }
}

contract AccountingFactory is Factory {
    event NewInstance(
        address indexed hub,
        address indexed instance,
        address quoteAsset,
        address nativeAsset,
        address[] defaultAssets
    );

    function createInstance(address _hub, address _quoteAsset, address _nativeAsset, address[] _defaultAssets) public returns (address) {
        address accounting = new Accounting(_hub, _quoteAsset, _nativeAsset, _defaultAssets);
        childExists[accounting] = true;
        emit NewInstance(_hub, accounting, _quoteAsset, _nativeAsset, _defaultAssets);
        return accounting;
    }
}

