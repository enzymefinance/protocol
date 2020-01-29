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

    event AssetBalanceUpdated(
        address indexed asset,
        address hub,
        uint256 oldBalance,
        uint256 newBalance
    );

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

    mapping(address => uint256) public assetBalances;

    constructor(address _hub, address _denominationAsset, address _nativeAsset)
        public
        Spoke(_hub)
    {
        DENOMINATION_ASSET = _denominationAsset;
        NATIVE_ASSET = _nativeAsset;
        DENOMINATION_ASSET_DECIMALS = ERC20WithFields(DENOMINATION_ASSET).decimals();
        DEFAULT_SHARE_PRICE = 10 ** uint256(DENOMINATION_ASSET_DECIMALS);
    }

    // EXTERNAL FUNCTIONS
    function calcAssetGAV(address _asset) external returns (uint256) {
        uint256 quantityHeld = assetBalances[_asset];
        return IPriceSource(priceSource()).convertQuantity(
            quantityHeld, _asset, DENOMINATION_ASSET
        );
    }

    function getFundHoldings()
        external
        view
        returns (uint256[] memory balances_, address[] memory assets_)
    {
        (assets_, balances_) = getAllAssetBalances();
    }

    function getOwnedAssetsLength() external view returns (uint256) {
        return ownedAssets.length;
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

    // PUBLIC FUNCTIONS

    // prices are quoted in DENOMINATION_ASSET so they use denominationDecimals
    function calcGav() public returns (uint256) {
        uint256 gav;
        for (uint256 i = 0; i < ownedAssets.length; ++i) {
            address asset = ownedAssets[i];
            uint256 quantityHeld = assetBalances[asset];
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

    function calcGavPerShareNetManagementFee()
        public
        returns (uint256 gavPerShareNetManagementFee_)
    {
        (,,,,,gavPerShareNetManagementFee_) = performCalculations();
    }

    function calcNav(uint256 _gav, uint256 _unclaimedFeesInDenominationAsset)
        public
        pure
        returns (uint256)
    {
        return sub(_gav, _unclaimedFeesInDenominationAsset);
    }

    function calcSharePrice() external returns (uint256 sharePrice_) {
        (,,,,sharePrice_,) = performCalculations();
    }

    function decreaseAssetBalance(address _asset, uint256 _amount) public auth {
        uint256 oldBalance = assetBalances[_asset];
        require(
            oldBalance >= _amount,
            "decreaseAssetBalance: new balance cannot be less than 0"
        );

        uint256 newBalance = sub(oldBalance, _amount);
        if (newBalance == 0) removeFromOwnedAssets(_asset);
        assetBalances[_asset] = newBalance;

        emit AssetBalanceUpdated(_asset, address(hub), oldBalance, newBalance);
    }

    function engine() public view override(AmguConsumer, Spoke) returns (address) {
        return Spoke.engine();
    }

    function increaseAssetBalance(address _asset, uint256 _amount) public auth {
        uint256 oldBalance = assetBalances[_asset];
        if (oldBalance == 0) addAssetToOwnedAssets(_asset);
        uint256 newBalance = add(oldBalance, _amount);
        assetBalances[_asset] = newBalance;

        emit AssetBalanceUpdated(_asset, address(hub), oldBalance, newBalance);
    }

    function getAllAssetBalances()
        view
        public
        returns(address[] memory assets_, uint256[] memory balances_)
    {
        assets_ = ownedAssets;
        balances_ = getAssetBalances(ownedAssets);
    }

    function getAssetBalances(address[] memory _assets)
        view
        public
        returns(uint256[] memory)
    {
        uint256[] memory balances = new uint256[](_assets.length);
        for (uint256 i = 0; i < _assets.length; i++) {
            balances[i] = assetBalances[_assets[i]];
        }
        assert(balances.length == _assets.length);
        return balances;
    }

    // @dev Access assetBalances via assetHoldings, because eventually there could be other
    // types of balances added in; e.g., balances of collateral in loans or non-atomic settlements
    function assetHoldings(address _asset) public view returns (uint256) {
        return assetBalances[_asset];
    }

    function mlnToken() public view override(AmguConsumer, Spoke) returns (address) {
        return Spoke.mlnToken();
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

    function priceSource() public view override(AmguConsumer, Spoke) returns (address) {
        return Spoke.priceSource();
    }

    function registry() public view override(AmguConsumer, Spoke) returns (address) {
        return Spoke.registry();
    }

    /// @notice Reward all fees and perform some updates
    /// @dev Anyone can call this
    function triggerRewardAllFees()
        external
        amguPayable(false)
        payable
    {
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

    function valuePerShare(uint256 _totalValue, uint256 _numShares) public pure returns (uint256) {
        require(_numShares > 0, "No shares to calculate value for");
        return (_totalValue * 10 ** uint256(SHARES_DECIMALS)) / _numShares;
    }

    // INTERNAL FUNCTIONS
    function addAssetToOwnedAssets(address _asset) internal {
        require(
            ownedAssets.length < MAX_OWNED_ASSETS,
            "Max owned asset limit reached"
        );
        ownedAssets.push(_asset);
        emit AssetAddition(_asset);
    }

    function removeFromOwnedAssets(address _asset) internal {
        for (uint256 i; i < ownedAssets.length; i++) {
            if (ownedAssets[i] == _asset) {
                ownedAssets[i] = ownedAssets[ownedAssets.length - 1];
                ownedAssets.pop();
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
