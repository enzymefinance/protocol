pragma solidity 0.6.4;
pragma experimental ABIEncoderV2;

import "../../dependencies/TokenUser.sol";
import "../../dependencies/libs/EnumerableSet.sol";
import "../../factory/Factory.sol";
import "../../prices/IPriceSource.sol";
import "../../registry/IRegistry.sol";
import "../fees/IFeeManager.sol";
import "../hub/Spoke.sol";
import "../vault/IVault.sol";
import "./IShares.sol";
import "./SharesToken.sol";

/// @title Shares Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Buy and sell shares for a Melon fund
contract Shares is IShares, TokenUser, Spoke, SharesToken {
    using EnumerableSet for EnumerableSet.AddressSet;

    event SharesBought(
        address indexed buyer,
        uint256 sharesQuantity,
        address investmentAsset,
        uint256 investmentAmount
    );

    event SharesInvestmentAssetsDisabled (address[] assets);

    event SharesInvestmentAssetsEnabled (address[] assets);

    event SharesRedeemed(
        address indexed redeemer,
        uint256 sharesQuantity,
        address[] receivedAssets,
        uint256[] receivedAssetQuantities
    );

    address public DENOMINATION_ASSET;
    EnumerableSet.AddressSet private sharesInvestmentAssets;

    modifier onlyManager() {
        require(
            msg.sender == hub.manager(),
            "Only the fund manager can call this function"
        );
        _;
    }

    modifier onlySharesRequestor() {
        require(
            msg.sender == IRegistry(routes.registry).sharesRequestor(),
            "Only SharesRequestor can call this function"
        );
        _;
    }

    constructor(
        address _hub,
        address _denominationAsset,
        address[] memory _defaultAssets,
        address _registry
    )
        public
        Spoke(_hub)
        SharesToken(IHub(_hub).getName())
    {
        require(
            IRegistry(_registry).assetIsRegistered(_denominationAsset),
            "Denomination asset must be registered"
        );
        DENOMINATION_ASSET = _denominationAsset;

        routes.registry = _registry;
        if (_defaultAssets.length > 0) {
            __enableSharesInvestmentAssets(_defaultAssets);
        }
    }

    // EXTERNAL

    /// @notice Buy shares on behalf of a specified user
    /// @dev Only callable by the SharesRequestor associated with the Registry
    /// @dev Rewards all fees via getSharesCostInAsset
    /// @param _buyer The for which to buy shares
    /// @param _investmentAsset The asset with which to buy shares
    /// @param _sharesQuantity The desired amount of shares
    /// @return costInInvestmentAsset_ The amount of investment asset used to buy the desired shares
    function buyShares(
        address _buyer,
        address _investmentAsset,
        uint256 _sharesQuantity
    )
        external
        override
        onlySharesRequestor
        returns (uint256 costInInvestmentAsset_)
    {
        costInInvestmentAsset_ = getSharesCostInAsset(_sharesQuantity, _investmentAsset);

        // Issue shares and transfer investment asset to vault
        _mint(_buyer, _sharesQuantity);
        __safeTransferFrom(_investmentAsset, msg.sender, address(this), costInInvestmentAsset_);
        __increaseApproval(_investmentAsset, routes.vault, costInInvestmentAsset_);
        IVault(routes.vault).deposit(_investmentAsset, costInInvestmentAsset_);

        emit SharesBought(
            _buyer,
            _sharesQuantity,
            _investmentAsset,
            costInInvestmentAsset_
        );
    }

    /// @notice Disable the buying of shares with specific assets
    /// @param _assets The assets for which to disable the buying of shares
    function disableSharesInvestmentAssets(address[] calldata _assets) external onlyManager {
        require(_assets.length > 0, "disableSharesInvestmentAssets: _assets cannot be empty");
        for (uint256 i = 0; i < _assets.length; i++) {
            EnumerableSet.remove(sharesInvestmentAssets, _assets[i]);
        }
        emit SharesInvestmentAssetsDisabled(_assets);
    }

    /// @notice Enable the buying of shares with specific assets
    /// @param _assets The assets for which to disable the buying of shares
    function enableSharesInvestmentAssets(address[] calldata _assets) external onlyManager {
        require(_assets.length > 0, "enableSharesInvestmentAssets: _assets cannot be empty");
        __enableSharesInvestmentAssets(_assets);
    }

    /// @notice Get all assets that can be used to buy shares
    /// @return The assets that can be used to buy shares
    function getSharesInvestmentAssets() external view returns (address[] memory) {
        return EnumerableSet.enumerate(sharesInvestmentAssets);
    }

    /// @notice Confirm whether asset can be used to buy shares
    /// @param _asset The asset to confirm
    /// @return True if the asset can be used to buy shares
    function isSharesInvestmentAsset(address _asset) external view override returns (bool) {
        return EnumerableSet.contains(sharesInvestmentAssets, _asset);
    }

    /// @notice Redeem all of the sender's shares for a proportionate slice of the fund's assets
    /// @dev Rewards all fees prior to redemption
    function redeemShares() external {
        // Duplicates logic further down call stack, but need to assure all outstanding shares are
        // assigned for fund manager (and potentially other fee recipients in the future)
        IFeeManager(routes.feeManager).rewardAllFees();

        redeemSharesQuantity(balanceOf(msg.sender));
    }

    // PUBLIC FUNCTIONS

    /// @notice Calculate the overall GAV of the fund
    /// @return gav_ The fund GAV
    function calcGav() public view returns (uint256 gav_) {
        (
            address[] memory assets,
            uint256[] memory balances
        ) = IVault(routes.vault).getAllAssetBalances();
        for (uint256 i = 0; i < assets.length; ++i) {
            // TODO: remove this? Should never be the case and it's not harmful
            if (balances[i] == 0) {
                continue;
            }
            gav_ = add(
                gav_,
                IPriceSource(priceSource()).convertQuantity(
                    balances[i],
                    assets[i],
                    DENOMINATION_ASSET
                )
            );
        }
    }

    /// @notice Calculate the cost for a given number of shares in the fund, in a given asset
    /// @dev Rewards all fees prior to calculations
    /// @param _sharesQuantity Number of shares
    /// @param _asset Asset in which to calculate share cost
    /// @return The amount of the asset required to buy the quantity of shares
    function getSharesCostInAsset(uint256 _sharesQuantity, address _asset)
        public
        override
        returns (uint256)
    {
        IFeeManager(routes.feeManager).rewardAllFees();

        uint256 denominatedSharePrice;
        // TODO: Confirm that this is correct behavior when shares go above 0 and then return to 0 (all shares cashed out)
        if (totalSupply() == 0) {
            denominatedSharePrice = 10 ** uint256(ERC20WithFields(DENOMINATION_ASSET).decimals());
        }
        else {
            denominatedSharePrice = calcGav() * 10 ** uint256(decimals) / totalSupply();
        }

        // TOOD: does it matter if we do: cost of 1 share x quantity vs. GAV x shares / supply (b/c rounding)?
        // Because 1 share will be rounded down, and then multiplied, which could yield a slightly smaller number
        uint256 denominationAssetQuantity = mul(
            _sharesQuantity,
            denominatedSharePrice
        ) / 10 ** uint256(decimals);

        if (_asset != DENOMINATION_ASSET) {
            return IPriceSource(priceSource()).convertQuantity(
                denominationAssetQuantity, DENOMINATION_ASSET, _asset
            );
        }

        return denominationAssetQuantity;
    }

    /// @notice Redeem a specified quantity of the sender's shares
    /// for a proportionate slice of the fund's assets
    /// @param _sharesQuantity The amount of shares to redeem
    function redeemSharesQuantity(uint256 _sharesQuantity) public {
        require(_sharesQuantity > 0, "redeemSharesQuantity: _sharesQuantity must be > 0");

        (address[] memory assets,) = IVault(routes.vault).getAllAssetBalances();
        redeemSharesWithConstraints(_sharesQuantity, assets);
    }

    /// @notice Redeem a specified quantity of the sender's shares
    /// for ONLY SPECIFIC ASSETS in the fund, forfeiting the remaining assets
    /// @dev Do not call directly, unless an asset throws preventing redemption.
    /// Calling directly with a limited set of assets will result in the sender
    /// losing claim to the remaining assets for their shares. It is intended as
    /// a last resort for users to directly redeem their assets.
    /// @dev Rewards all fees prior to redemption
    /// @param _sharesQuantity The amount of shares to redeem
    /// @param _assets The assets to receive from the redemption
    function redeemSharesWithConstraints(uint256 _sharesQuantity, address[] memory _assets)
        public
    {
        require(_assets.length > 0, "redeemSharesWithConstraints: _assets cannot be empty");
        require(_sharesQuantity > 0, "redeemSharesWithConstraints: _sharesQuantity must be > 0");

        IFeeManager(routes.feeManager).rewardAllFees();

        require(
            _sharesQuantity <= balanceOf(msg.sender),
            "redeemSharesWithConstraints: _sharesQuantity exceeds sender balance"
        );

        // Destroy the shares
        uint256 sharesSupply = totalSupply();
        _burn(msg.sender, _sharesQuantity);

        // Calculate and transfer owed assets to redeemer
        IVault vault = IVault(routes.vault);
        uint256[] memory owedQuantities = new uint256[](_assets.length);
        for (uint256 i = 0; i < _assets.length; ++i) {
            uint256 quantityHeld = vault.assetBalances(_assets[i]);
            require(quantityHeld > 0, "Requested asset holdings is 0");

            // Confirm asset has not already been transfered
            for (uint256 j = 0; j < i; j++) {
                require(
                    _assets[i] != _assets[j],
                    "Attempted to redeem duplicate asset"
                );
            }

            // Redeemer's ownership percentage of asset holdings
            owedQuantities[i] = mul(quantityHeld, _sharesQuantity) / sharesSupply;
            if (owedQuantities[i] == 0) continue;

            // Transfer owed asset to redeemer
            vault.withdraw(_assets[i], owedQuantities[i]);
            __safeTransfer(_assets[i], msg.sender, owedQuantities[i]);
        }

        emit SharesRedeemed(
            msg.sender,
            _sharesQuantity,
            _assets,
            owedQuantities
        );
    }

    // PRIVATE FUNCTIONS

    /// @notice Enable assets with which to buy shares
    function __enableSharesInvestmentAssets (address[] memory _assets) private {
        for (uint256 i = 0; i < _assets.length; i++) {
            require(
                IRegistry(routes.registry).assetIsRegistered(_assets[i]),
                "__enableSharesInvestmentAssets: Asset not in Registry"
            );
            EnumerableSet.add(sharesInvestmentAssets, _assets[i]);
        }
        emit SharesInvestmentAssetsEnabled(_assets);
    }
}

contract SharesFactory is Factory {
    event NewInstance(
        address indexed hub,
        address indexed instance,
        address denominationAsset,
        address[] defaultAssets,
        address registry
    );

    function createInstance(
        address _hub,
        address _denominationAsset,
        address[] calldata _defaultAssets,
        address _registry
    )
        external
        returns (address)
    {
        address shares = address(
            new Shares(_hub, _denominationAsset, _defaultAssets, _registry)
        );
        childExists[shares] = true;
        emit NewInstance(_hub, shares, _denominationAsset, _defaultAssets, _registry);
        return shares;
    }
}
