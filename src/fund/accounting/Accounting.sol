pragma solidity 0.6.1;

import "../../factory/Factory.sol";
import "../../prices/IPriceSource.sol";
import "../fees/FeeManager.sol";
import "../hub/Spoke.sol";
import "../shares/Shares.sol";
import "../trading/ITrading.sol";
import "../../engine/AmguConsumer.sol";

contract Accounting is AmguConsumer, Spoke {

    event AssetAddition(address indexed asset);
    event AssetRemoval(address indexed asset);

    struct Calculations {
        uint256 gav;
        uint256 nav;
        uint256 allocatedFees;
        uint256 totalSupply;
        uint256 timestamp;
    }

    uint8 constant public MAX_OWNED_ASSETS = 20;
    uint8 constant public SHARES_DECIMALS = 18;
    uint8 public DENOMINATION_ASSET_DECIMALS;
    uint256 public DEFAULT_SHARE_PRICE;
    address public DENOMINATION_ASSET;
    address public NATIVE_ASSET;
    address[] public ownedAssets;
    Calculations public atLastAllocation;

    mapping (address => bool) public isInAssetList;

    constructor(address _hub, address _denominationAsset, address _nativeAsset)
        public
        Spoke(_hub)
    {
        DENOMINATION_ASSET = _denominationAsset;
        NATIVE_ASSET = _nativeAsset;
        DENOMINATION_ASSET_DECIMALS = ERC20WithFields(DENOMINATION_ASSET).decimals();
        DEFAULT_SHARE_PRICE = 10 ** uint256(DENOMINATION_ASSET_DECIMALS);
    }

    function getOwnedAssetsLength() external view returns (uint256) {
        return ownedAssets.length;
    }

    function getOwnedAssets() external view returns (address[] memory) {
        return ownedAssets;
    }

    function assetHoldings(address _asset) public returns (uint256) {
        return add(
            uint256(ERC20WithFields(_asset).balanceOf(routes.vault)),
            ITrading(routes.trading).updateAndGetQuantityBeingTraded(_asset)
        );
    }

    /// @dev Returns sparse array
    function getFundHoldings() external returns (uint256[] memory, address[] memory) {
        uint256[] memory _quantities = new uint256[](ownedAssets.length);
        address[] memory _assets = new address[](ownedAssets.length);
        for (uint256 i = 0; i < ownedAssets.length; i++) {
            address ofAsset = ownedAssets[i];
            // assetHoldings formatting: mul(exchangeHoldings, 10 ** assetDecimal)
            uint256 quantityHeld = assetHoldings(ofAsset);
            _assets[i] = ofAsset;
            _quantities[i] = quantityHeld;
        }
        return (_quantities, _assets);
    }

    function calcAssetGAV(address _queryAsset) external returns (uint256) {
        uint256 queryAssetQuantityHeld = assetHoldings(_queryAsset);
        return IPriceSource(priceSource()).convertQuantity(
            queryAssetQuantityHeld, _queryAsset, DENOMINATION_ASSET
        );
    }

    // prices are quoted in DENOMINATION_ASSET so they use denominationDecimals
    function calcGav() public returns (uint256) {
        uint256 gav;
        for (uint256 i = 0; i < ownedAssets.length; ++i) {
            address asset = ownedAssets[i];
            // assetHoldings formatting: mul(exchangeHoldings, 10 ** assetDecimals)
            uint256 quantityHeld = assetHoldings(asset);
            // Dont bother with the calculations if the balance of the asset is 0
            if (quantityHeld == 0) {
                continue;
            }
            // gav as sum of mul(assetHoldings, assetPrice) with formatting:
            // mul(mul(exchangeHoldings, exchangePrice), 10 ** shareDecimals)
            gav = add(
                gav,
                IPriceSource(priceSource()).convertQuantity(
                    quantityHeld,
                    asset,
                    DENOMINATION_ASSET
                )
            );
        }
        return gav;
    }

    function calcNav(uint256 _gav, uint256 _unclaimedFeesInDenominationAsset)
        public
        pure
        returns (uint256)
    {
        return sub(_gav, _unclaimedFeesInDenominationAsset);
    }

    function valuePerShare(uint256 _totalValue, uint256 _numShares) public pure returns (uint256) {
        require(_numShares > 0, "No shares to calculate value for");
        return (_totalValue * 10 ** uint256(SHARES_DECIMALS)) / _numShares;
    }

    function performCalculations()
        public
        returns (
            uint256 gav_,
            uint256 feesInDenominationAsset_,  // unclaimed amount
            uint256 feesInShares_,             // unclaimed amount
            uint256 nav_,
            uint256 sharePrice_,
            uint256 gavPerShareNetManagementFee_
        )
    {
        gav_ = calcGav();
        uint256 totalSupply = Shares(routes.shares).totalSupply();
        feesInShares_ = FeeManager(routes.feeManager).totalFeeAmount();
        feesInDenominationAsset_ = (totalSupply == 0) ?
            0 :
            mul(feesInShares_, gav_) / add(totalSupply, feesInShares_);
        nav_ = calcNav(gav_, feesInDenominationAsset_);

        // The total share supply including the value of feesInDenominationAsset_,
        // measured in shares of this fund
        uint256 totalSupplyAccountingForFees = add(totalSupply, feesInShares_);
        sharePrice_ = (totalSupply > 0) ?
            valuePerShare(gav_, totalSupplyAccountingForFees) :
            DEFAULT_SHARE_PRICE;
        gavPerShareNetManagementFee_ = (totalSupply > 0) ?
            valuePerShare(
                gav_,
                add(totalSupply, FeeManager(routes.feeManager).managementFeeAmount())
            ) :
            DEFAULT_SHARE_PRICE;
    }

    function calcGavPerShareNetManagementFee()
        public
        returns (uint256 gavPerShareNetManagementFee_)
    {
        (,,,,,gavPerShareNetManagementFee_) = performCalculations();
    }

    function getShareCostInAsset(uint256 _numShares, address _altAsset)
        external
        returns (uint256)
    {
        uint256 denominationAssetQuantity = mul(
            _numShares,
            calcGavPerShareNetManagementFee()
        ) / 10 ** uint256(SHARES_DECIMALS);
        return IPriceSource(priceSource()).convertQuantity(
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
        uint256 gav;
        uint256 feesInDenomination;
        uint256 feesInShares;
        uint256 nav;
        (gav, feesInDenomination, feesInShares, nav,,) = performCalculations();
        uint256 totalSupply = Shares(routes.shares).totalSupply();
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
        for (uint256 i = 0; i < ownedAssets.length; i++) {
            address asset = ownedAssets[i];
            if (
                assetHoldings(asset) == 0 &&
                !(asset == address(DENOMINATION_ASSET)) &&
                ITrading(routes.trading).getOpenMakeOrdersAgainstAsset(asset) == 0
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
        for (uint256 i; i < ownedAssets.length; i++) {
            if (ownedAssets[i] == _asset) {
                ownedAssets[i] = ownedAssets[ownedAssets.length - 1];
                ownedAssets.pop();
                break;
            }
        }
        emit AssetRemoval(_asset);
    }

    function engine() public view override(AmguConsumer, Spoke) returns (address) {
        return Spoke.engine();
    }
    function mlnToken() public view override(AmguConsumer, Spoke) returns (address) {
        return Spoke.mlnToken();
    }
    function priceSource() public view override(AmguConsumer, Spoke) returns (address) {
        return Spoke.priceSource();
    }
    function registry() public view override(AmguConsumer, Spoke) returns (address) {
        return Spoke.registry();
    }
}

contract AccountingFactory is Factory {
    event NewInstance(
        address indexed hub,
        address indexed instance,
        address denominationAsset,
        address nativeAsset
    );

    function createInstance(address _hub, address _denominationAsset, address _nativeAsset)
        external
        returns (address)
    {
        address accounting = address(new Accounting(_hub, _denominationAsset, _nativeAsset));
        childExists[accounting] = true;
        emit NewInstance(_hub, accounting, _denominationAsset, _nativeAsset);
        return accounting;
    }
}
