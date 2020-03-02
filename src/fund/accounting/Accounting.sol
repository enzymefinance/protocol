pragma solidity 0.6.1;

import "../../factory/Factory.sol";
import "../../prices/IPriceSource.sol";
import "../fees/IFeeManager.sol";
import "../hub/Spoke.sol";
import "../shares/IShares.sol";
import "../../engine/AmguConsumer.sol";

contract Accounting is AmguConsumer, Spoke {

    event AssetAddition(address indexed asset);

    event AssetBalanceUpdated(address indexed asset, uint256 oldBalance, uint256 newBalance);

    event AssetRemoval(address indexed asset);

    uint8 constant public MAX_OWNED_ASSETS = 20;
    uint8 constant public SHARES_DECIMALS = 18;
    uint256 public DEFAULT_SHARE_PRICE;
    address public DENOMINATION_ASSET;
    address[] public ownedAssets;

    mapping(address => uint256) public assetBalances;

    /// @param _hub The fund's primary address
    /// @param _denominationAsset The asset in which to denominate fund metrics and values
    constructor(address _hub, address _denominationAsset) public Spoke(_hub) {
        DENOMINATION_ASSET = _denominationAsset;
        DEFAULT_SHARE_PRICE = 10 ** uint256(ERC20WithFields(DENOMINATION_ASSET).decimals());
    }

    // EXTERNAL FUNCTIONS

    /// @notice Calculates the GAV for an asset held by the fund
    /// @param _asset The ERC20 token for which to calculate the GAV
    /// @return The GAV of the _asset
    function calcAssetGav(address _asset) external view returns (uint256) {
        uint256 quantityHeld = assetBalances[_asset];
        return IPriceSource(priceSource()).convertQuantity(
            quantityHeld, _asset, DENOMINATION_ASSET
        );
    }

    /// @notice Retrieves the balances of all holdings of the fund
    /// @dev Use this as the canonical function for retrieving total balances,
    /// not only balances currently in the contract (e.g., includes lending balances)
    /// @return assets_ The owned assets
    /// @return balances_ The balances of owned assets
    function getFundHoldings()
        external
        view
        returns (address[] memory assets_, uint256[] memory balances_)
    {
        (assets_, balances_) = getAllAssetBalances();
    }

    /// @notice Retrieves the balance of a particular asset holding of the fund
    /// @dev Use this as the canonical function for retrieving a single asset's total balance
    /// @param _asset The asset for which to retrieve the fund's balance
    /// @return The fund's balance of the _asset
    function getFundHoldingsForAsset(address _asset) external view returns (uint256) {
        return assetBalances[_asset];
    }

    /// @notice Retrieves the number of owned assets in this fund
    /// @return The number of owned assets
    function getOwnedAssetsLength() external view returns (uint256) {
        return ownedAssets.length;
    }

    /// @notice Calculate the cost for a given number of shares this fund,
    /// in an asset other than the fund's denomination asset
    /// @param _numShares Number of shares
    /// @param _altAsset Alternative asset in which to calculate share cost
    /// @return The cost of _numShares in the _altAsset
    function getShareCostInAsset(uint256 _numShares, address _altAsset)
        external
        returns (uint256)
    {
        (,,,,, uint256 gavPerShareNetManagementFee) = calcFundMetrics();
        uint256 denominationAssetQuantity = mul(
            _numShares,
            gavPerShareNetManagementFee
        ) / 10 ** uint256(SHARES_DECIMALS);
        return IPriceSource(priceSource()).convertQuantity(
            denominationAssetQuantity, DENOMINATION_ASSET, _altAsset
        );
    }

    /// @notice Triggers FeeManager's rewardAllFees(), allocating fees (in shares) to the fund manager
    /// @dev Anyone can call this
    function triggerRewardAllFees()
        external
        amguPayable(false)
        payable
    {
        IFeeManager(routes.feeManager).rewardAllFees();
    }

    // PUBLIC FUNCTIONS

    /// @notice Calculates fund metrics
    /// @return gav_ The fund GAV
    /// @return feesInDenominationAsset_ The outstanding fees, in the fund's denomination asset
    /// @return feesInShares_ The outstanding fees, in fund shares
    /// @return nav_ The fund NAV
    /// @return sharePrice_ The price of one unit of fund shares,
    /// relative to the denomination asset decimals
    /// @return gavPerShareNetManagementFee_ The fund GAV per one unit of shares,
    /// less the fund's management fee
    function calcFundMetrics()
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
        uint256 totalSupply = IShares(routes.shares).totalSupply();
        feesInShares_ = IFeeManager(routes.feeManager).totalFeeAmount();
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
                add(totalSupply, IFeeManager(routes.feeManager).managementFeeAmount())
            ) :
            DEFAULT_SHARE_PRICE;
    }

    /// @notice Calculate the overall GAV of the fund
    /// @return The fund GAV
    function calcGav() public view returns (uint256) {
        uint256 gav;
        for (uint256 i = 0; i < ownedAssets.length; ++i) {
            address asset = ownedAssets[i];
            uint256 quantityHeld = assetBalances[asset];
            // Dont bother with the calculations if the balance of the asset is 0
            if (quantityHeld == 0) {
                continue;
            }
            // gav as sum of mul(getFundHoldingsForAsset, assetPrice) with formatting:
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

    /// @notice Calculate the overall NAV of the fund
    /// @param _gav The fund GAV
    /// @param _unclaimedFeesInDenominationAsset The fees owed to the fund manager
    /// relative to the fund's denomination asset
    /// @return The fund NAV
    function calcNav(uint256 _gav, uint256 _unclaimedFeesInDenominationAsset)
        public
        pure
        returns (uint256)
    {
        return sub(_gav, _unclaimedFeesInDenominationAsset);
    }

    /// @notice Decreases the balance of an asset in a fund's internal system of account
    /// @param _asset The asset for which to decrease the assetBalance
    /// @param _amount The amount by which to decrease the assetBalance
    function decreaseAssetBalance(address _asset, uint256 _amount) public auth {
        uint256 oldBalance = assetBalances[_asset];
        require(
            oldBalance >= _amount,
            "decreaseAssetBalance: new balance cannot be less than 0"
        );

        uint256 newBalance = sub(oldBalance, _amount);
        if (newBalance == 0) __removeFromOwnedAssets(_asset);
        assetBalances[_asset] = newBalance;

        emit AssetBalanceUpdated(_asset, oldBalance, newBalance);
    }

    /// @notice Gets the address of the Melon Engine used by this fund
    function engine() public view override(AmguConsumer, Spoke) returns (address) {
        return Spoke.engine();
    }

    /// @notice Increases the balance of an asset in a fund's internal system of account
    /// @param _asset The asset for which to increase the assetBalance
    /// @param _amount The amount by which to increase the assetBalance
    function increaseAssetBalance(address _asset, uint256 _amount) public auth {
        uint256 oldBalance = assetBalances[_asset];
        if (oldBalance == 0) __addAssetToOwnedAssets(_asset);
        uint256 newBalance = add(oldBalance, _amount);
        assetBalances[_asset] = newBalance;

        emit AssetBalanceUpdated(_asset, oldBalance, newBalance);
    }

    /// @notice Retrieves the assetBalances of all assets of the fund
    /// @dev Use getFundHoldings() as the canonical way to get all token balances for a fund
    /// @return assets_ The assets of the fund
    /// @return balances_ The assetBalances of owned assets
    function getAllAssetBalances()
        public
        view
        returns(address[] memory assets_, uint256[] memory balances_)
    {
        assets_ = ownedAssets;
        balances_ = getAssetBalances(ownedAssets);
    }

    /// @notice Retrieves the assetBalances of an array of tokens for the fund
    /// @param _assets The assets for which to retrieve assetBalances
    /// @return The assetBalances relative to _assets
    function getAssetBalances(address[] memory _assets)
        public
        view
        returns(uint256[] memory)
    {
        uint256[] memory balances = new uint256[](_assets.length);
        for (uint256 i = 0; i < _assets.length; i++) {
            balances[i] = assetBalances[_assets[i]];
        }
        assert(balances.length == _assets.length);
        return balances;
    }

    /// @notice Gets the address of the Melon Token used by this fund
    function mlnToken() public view override(AmguConsumer, Spoke) returns (address) {
        return Spoke.mlnToken();
    }

    /// @notice Gets the address of the price source used by this fund
    function priceSource() public view override(AmguConsumer, Spoke) returns (address) {
        return Spoke.priceSource();
    }

    /// @notice Gets the address of the Registry used by this fund
    function registry() public view override(AmguConsumer, Spoke) returns (address) {
        return Spoke.registry();
    }

    /// @notice Calculates the value per unit of shares, given a total value and total number of shares
    /// @param _totalValue The total value of a fund, generally the GAV
    /// @param _numShares The total number of shares of a fund (can include management fee shares)
    /// @return The value per unit of shares (relative to the decimals of shares)
    function valuePerShare(uint256 _totalValue, uint256 _numShares) public pure returns (uint256) {
        require(_numShares > 0, "No shares to calculate value for");
        return (_totalValue * 10 ** uint256(SHARES_DECIMALS)) / _numShares;
    }

    // INTERNAL FUNCTIONS

    /// @notice Adds an asset to a fund's ownedAssets
    function __addAssetToOwnedAssets(address _asset) internal {
        require(
            ownedAssets.length < MAX_OWNED_ASSETS,
            "Max owned asset limit reached"
        );
        ownedAssets.push(_asset);
        emit AssetAddition(_asset);
    }

    /// @notice Removes an asset from a fund's ownedAssets
    function __removeFromOwnedAssets(address _asset) internal {
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
        address denominationAsset
    );

    /// @notice Deploys an instance of the Accounting contract
    /// @param _hub The fund's primary address
    /// @param _denominationAsset The asset in which to denominate fund metrics
    /// @return The address of the newly deployed contract
    function createInstance(address _hub, address _denominationAsset)
        external
        returns (address)
    {
        address accounting = address(new Accounting(_hub, _denominationAsset));
        childExists[accounting] = true;
        emit NewInstance(_hub, accounting, _denominationAsset);
        return accounting;
    }
}
