pragma solidity ^0.4.25;

import "StandardToken.sol";
import "Factory.sol";
import "PriceSource.i.sol";
import "FeeManager.sol";
import "Spoke.sol";
import "Shares.sol";
import "Trading.sol";
import "Vault.sol";
import "Accounting.i.sol";
import "AmguConsumer.sol";

contract Accounting is AccountingInterface, AmguConsumer, Spoke {

    struct Calculations {
        uint gav;
        uint nav;
        uint allocatedFees;
        uint totalSupply;
        uint timestamp;
    }

    uint constant public MAX_OWNED_ASSETS = 20;
    address[] public ownedAssets;
    mapping (address => bool) public isInAssetList;
    uint public constant SHARES_DECIMALS = 18;
    address public NATIVE_ASSET;
    address public DENOMINATION_ASSET;
    uint public DENOMINATION_ASSET_DECIMALS;
    uint public DEFAULT_SHARE_PRICE;
    Calculations public atLastAllocation;

    constructor(address _hub, address _denominationAsset, address _nativeAsset, address[] _defaultAssets)
        Spoke(_hub)
    {
        for (uint i = 0; i < _defaultAssets.length; i++) {
            _addAssetToOwnedAssets(_defaultAssets[i]);
        }
        DENOMINATION_ASSET = _denominationAsset;
        NATIVE_ASSET = _nativeAsset;
        DENOMINATION_ASSET_DECIMALS = ERC20WithFields(DENOMINATION_ASSET).decimals();
        DEFAULT_SHARE_PRICE = 10 ** uint(DENOMINATION_ASSET_DECIMALS);
    }

    function getOwnedAssetsLength() external view returns (uint) {
        return ownedAssets.length;
    }

    function assetHoldings(address _asset) public returns (uint) {
        return add(
            uint(ERC20WithFields(_asset).balanceOf(Vault(routes.vault))),
            Trading(routes.trading).updateAndGetQuantityBeingTraded(_asset)
        );
    }

    /// @dev Returns sparse array
    function getFundHoldings() external returns (uint[], address[]) {
        uint[] memory _quantities = new uint[](ownedAssets.length);
        address[] memory _assets = new address[](ownedAssets.length);
        for (uint i = 0; i < ownedAssets.length; i++) {
            address ofAsset = ownedAssets[i];
            // assetHoldings formatting: mul(exchangeHoldings, 10 ** assetDecimal)
            uint quantityHeld = assetHoldings(ofAsset);
            _assets[i] = ofAsset;
            _quantities[i] = quantityHeld;
        }
        return (_quantities, _assets);
    }

    function calcAssetGAV(address _queryAsset) external returns (uint) {
        uint queryAssetQuantityHeld = assetHoldings(_queryAsset);
        return PriceSourceInterface(routes.priceSource).convertQuantity(
            queryAssetQuantityHeld, _queryAsset, DENOMINATION_ASSET
        );
    }

    // prices are quoted in DENOMINATION_ASSET so they use denominationDecimals
    function calcGav() public returns (uint gav) {
        for (uint i = 0; i < ownedAssets.length; ++i) {
            address asset = ownedAssets[i];
            // assetHoldings formatting: mul(exchangeHoldings, 10 ** assetDecimals)
            uint quantityHeld = assetHoldings(asset);
            // Dont bother with the calculations if the balance of the asset is 0
            if (quantityHeld == 0) {
                continue;
            }
            // gav as sum of mul(assetHoldings, assetPrice) with formatting: mul(mul(exchangeHoldings, exchangePrice), 10 ** shareDecimals)
            gav = add(
                gav,
                PriceSourceInterface(routes.priceSource).convertQuantity(
                    quantityHeld, asset, DENOMINATION_ASSET
                )
            );
        }
        return gav;
    }

    function calcNav(uint gav, uint unclaimedFeesInDenominationAsset) public pure returns (uint) {
        return sub(gav, unclaimedFeesInDenominationAsset);
    }

    function valuePerShare(uint totalValue, uint numShares) public view returns (uint) {
        require(numShares > 0, "No shares to calculate value for");
        return (totalValue * 10 ** uint(SHARES_DECIMALS)) / numShares;
    }

    function performCalculations()
        public
        returns (
            uint gav,
            uint feesInDenominationAsset,  // unclaimed amount
            uint feesInShares,             // unclaimed amount
            uint nav,
            uint sharePrice,
            uint gavPerShareNetManagementFee
        )
    {
        gav = calcGav();
        uint totalSupply = Shares(routes.shares).totalSupply();
        feesInShares = FeeManager(routes.feeManager).totalFeeAmount();
        feesInDenominationAsset = (totalSupply == 0) ?
            0 :
            mul(feesInShares, gav) / add(totalSupply, feesInShares);
        nav = calcNav(gav, feesInDenominationAsset);

        // The total share supply including the value of feesInDenominationAsset, measured in shares of this fund
        uint totalSupplyAccountingForFees = add(totalSupply, feesInShares);
        sharePrice = (totalSupply > 0) ?
            valuePerShare(gav, totalSupplyAccountingForFees) :
            DEFAULT_SHARE_PRICE;
        gavPerShareNetManagementFee = (totalSupply > 0) ?
            valuePerShare(gav, add(totalSupply, FeeManager(routes.feeManager).managementFeeAmount())) :
            DEFAULT_SHARE_PRICE;
        return (gav, feesInDenominationAsset, feesInShares, nav, sharePrice, gavPerShareNetManagementFee);
    }

    function calcSharePrice() external returns (uint sharePrice) {
        (,,,,sharePrice,) = performCalculations();
        return sharePrice;
    }

    function calcGavPerShareNetManagementFee()
        public
        returns (uint gavPerShareNetManagementFee)
    {
        (,,,,,gavPerShareNetManagementFee) = performCalculations();
        return gavPerShareNetManagementFee;
    }

    function getShareCostInAsset(uint _numShares, address _altAsset)
        external
        returns (uint)
    {
        uint denominationAssetQuantity = mul(
            _numShares,
            calcGavPerShareNetManagementFee()
        ) / 10 ** uint(SHARES_DECIMALS);
        return PriceSourceInterface(routes.priceSource).convertQuantity(
            denominationAssetQuantity, DENOMINATION_ASSET, _altAsset
        );
    }

    /// @notice Reward all fees and perform some updates
    /// @dev Anyone can call this
    function triggerRewardAllFees()
        external
        amguPayable(false)
        payable
    {
        updateOwnedAssets();
        uint gav;
        uint feesInDenomination;
        uint feesInShares;
        uint nav;
        (gav, feesInDenomination, feesInShares, nav, ) = performCalculations();
        uint totalSupply = Shares(routes.shares).totalSupply();
        FeeManager(routes.feeManager).rewardAllFees();
        atLastAllocation = Calculations({
            gav: gav,
            nav: nav,
            allocatedFees: feesInDenomination,
            totalSupply: totalSupply,
            timestamp: block.timestamp
        });
    }

    /// @dev Check holdings for all assets, and adjust list
    function updateOwnedAssets() public {
        for (uint i = 0; i < ownedAssets.length; i++) {
            address asset = ownedAssets[i];
            if (
                assetHoldings(asset) == 0 &&
                !(asset == address(DENOMINATION_ASSET)) &&
                Trading(routes.trading).openMakeOrdersAgainstAsset(asset) == 0
            ) {
                _removeFromOwnedAssets(asset);
            }
        }
    }

    function addAssetToOwnedAssets(address _asset) external auth {
        _addAssetToOwnedAssets(_asset);
    }

    function removeFromOwnedAssets(address _asset) external auth {
        _removeFromOwnedAssets(_asset);
    }

    /// @dev Just pass if asset already in list
    function _addAssetToOwnedAssets(address _asset) internal {
        if (isInAssetList[_asset]) { return; }

        require(
            ownedAssets.length < MAX_OWNED_ASSETS,
            "Max owned asset limit reached"
        );
        isInAssetList[_asset] = true;
        ownedAssets.push(_asset);
        emit AssetAddition(_asset);
    }

    /// @dev Just pass if asset not in list
    function _removeFromOwnedAssets(address _asset) internal {
        if (!isInAssetList[_asset]) { return; }

        isInAssetList[_asset] = false;
        for (uint i; i < ownedAssets.length; i++) {
            if (ownedAssets[i] == _asset) {
                ownedAssets[i] = ownedAssets[ownedAssets.length - 1];
                ownedAssets.length--;
                break;
            }
        }
        emit AssetRemoval(_asset);
    }
}

contract AccountingFactory is Factory {
    event NewInstance(
        address indexed hub,
        address indexed instance,
        address denominationAsset,
        address nativeAsset,
        address[] defaultAssets
    );

    function createInstance(address _hub, address _denominationAsset, address _nativeAsset, address[] _defaultAssets) external returns (address) {
        address accounting = new Accounting(_hub, _denominationAsset, _nativeAsset, _defaultAssets);
        childExists[accounting] = true;
        emit NewInstance(_hub, accounting, _denominationAsset, _nativeAsset, _defaultAssets);
        return accounting;
    }
}

