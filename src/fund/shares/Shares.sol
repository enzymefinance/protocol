pragma solidity 0.6.1;

import "./SharesToken.sol";
import "../accounting/IAccounting.sol";
import "../fees/IFeeManager.sol";
import "../hub/Spoke.sol";
import "../policies/IPolicyManager.sol";
import "../vault/IVault.sol";
import "../../dependencies/TokenUser.sol";
import "../../dependencies/libs/EnumerableSet.sol";
import "../../factory/Factory.sol";
import "../../prices/IPriceSource.sol";
import "../../registry/IRegistry.sol";

/// @title Shares Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Buy and sell shares for a Melon fund
contract Shares is TokenUser, Spoke, SharesToken {
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

    EnumerableSet.AddressSet private sharesInvestmentAssets;

    modifier onlySharesRequestor() {
        require(
            msg.sender == IRegistry(routes.registry).sharesRequestor(),
            "Only SharesRequestor can call this function"
        );
        _;
    }

    constructor(address _hub, address[] memory _defaultAssets, address _registry)
        public
        Spoke(_hub)
        SharesToken(IHub(_hub).name())
    {
        routes.registry = _registry;
        if (_defaultAssets.length > 0) {
            __enableSharesInvestmentAssets(_defaultAssets);
        }
    }

    // EXTERNAL

    /// @notice Buy shares on behalf of a specified user
    /// @dev Only callable by the SharesRequestor associated with the Registry
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
        onlySharesRequestor
        returns (uint256 costInInvestmentAsset_)
    {
        costInInvestmentAsset_ = IAccounting(routes.accounting).getShareCostInAsset(
            _sharesQuantity,
            _investmentAsset
        );

        // Transfer investment asset to vault, issue shares, and update fund state
        __safeTransferFrom(_investmentAsset, msg.sender, routes.vault, costInInvestmentAsset_);
        _mint(_buyer, _sharesQuantity);
        IAccounting(routes.accounting).increaseAssetBalance(
            _investmentAsset,
            costInInvestmentAsset_
        );

        emit SharesBought(
            _buyer,
            _sharesQuantity,
            _investmentAsset,
            costInInvestmentAsset_
        );
    }

    /// @notice Disable the buying of shares with specific assets
    /// @param _assets The assets for which to disable the buying of shares
    function disableSharesInvestmentAssets(address[] calldata _assets) external auth {
        require(_assets.length > 0, "disableSharesInvestmentAssets: _assets cannot be empty");
        for (uint256 i = 0; i < _assets.length; i++) {
            EnumerableSet.remove(sharesInvestmentAssets, _assets[i]);
        }
        emit SharesInvestmentAssetsDisabled(_assets);
    }

    /// @notice Enable the buying of shares with specific assets
    /// @param _assets The assets for which to disable the buying of shares
    function enableSharesInvestmentAssets(address[] calldata _assets) external auth {
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
    function isSharesInvestmentAsset(address _asset) external view returns (bool) {
        return EnumerableSet.contains(sharesInvestmentAssets, _asset);
    }

    /// @notice Redeem all of the sender's shares for a proportionate slice of the fund's assets
    function redeemShares() external {
        redeemSharesQuantity(balanceOf(msg.sender));
    }

    // PUBLIC FUNCTIONS

    /// @notice Redeem a specified quantity of the sender's shares
    /// for a proportionate slice of the fund's assets
    /// @param _sharesQuantity The amount of shares to redeem
    function redeemSharesQuantity(uint256 _sharesQuantity) public {
        require(_sharesQuantity > 0, "redeemSharesQuantity: _sharesQuantity must be > 0");

        (address[] memory assets,) = IAccounting(routes.accounting).getFundHoldings();
        redeemSharesWithConstraints(_sharesQuantity, assets);
    }

    /// @notice Redeem a specified quantity of the sender's shares
    /// for ONLY SPECIFIC ASSETS in the fund, forfeiting the remaining assets
    /// @dev Do not call directly, unless an asset throws preventing redemption.
    /// Calling directly with a limited set of assets will result in the sender
    /// losing claim to the remaining assets for their shares. It is intended as
    /// a last resort for users to directly redeem their assets.
    /// @param _sharesQuantity The amount of shares to redeem
    /// @param _assets The assets to receive from the redemption
    function redeemSharesWithConstraints(uint256 _sharesQuantity, address[] memory _assets)
        public
    {
        require(_assets.length > 0, "redeemSharesWithConstraints: _assets cannot be empty");
        require(_sharesQuantity > 0, "redeemSharesWithConstraints: _sharesQuantity must be > 0");
        require(
            _sharesQuantity <= balanceOf(msg.sender),
            "redeemSharesWithConstraints: _sharesQuantity exceeds sender balance"
        );

        IAccounting accounting = IAccounting(routes.accounting);

        // Reward all fees and calculate remaining shares
        uint256 owedFees = 0;
        if (
            // Without prices, can't calculate performance fees, so must skip
            IPriceSource(priceSource()).hasValidPrices(_assets) &&
            msg.sender != hub.manager()
        ) {
            owedFees = __rewardFeesForRedeemedShares(msg.sender, _sharesQuantity);
        }
        uint256 sharesQuantityPostFees = sub(_sharesQuantity, owedFees);

        // Destroy the remaining shares
        uint256 sharesSupply = totalSupply();
        _burn(msg.sender, sharesQuantityPostFees);

        // Calculate and transfer owed assets to redeemer
        uint256[] memory owedQuantities = new uint256[](_assets.length);
        for (uint256 i = 0; i < _assets.length; ++i) {
            uint256 quantityHeld = accounting.getFundHoldingsForAsset(_assets[i]);
            require(quantityHeld > 0, "Requested asset holdings is 0");

            // Confirm asset has not already been transfered
            for (uint256 j = 0; j < i; j++) {
                require(
                    _assets[i] != _assets[j],
                    "Attempted to redeem duplicate asset"
                );
            }

            // Redeemer's ownership percentage of asset holdings
            owedQuantities[i] = mul(quantityHeld, sharesQuantityPostFees) / sharesSupply;
            if (owedQuantities[i] == 0) continue;

            // Update fund accounting
            IAccounting(routes.accounting).decreaseAssetBalance(
                _assets[i],
                owedQuantities[i]
            );

            // Transfer owed asset to redeemer
            IVault(routes.vault).withdraw(_assets[i], owedQuantities[i]);
            __safeTransfer(_assets[i], msg.sender, owedQuantities[i]);
        }

        emit SharesRedeemed(
            msg.sender,
            sharesQuantityPostFees,
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

    /// @notice Reward the performance fees for the amount of shares to redeem
    /// @return The performance fees paid in terms of shares destroyed
    function __rewardFeesForRedeemedShares(address _redeemer, uint256 _sharesQuantity)
        private
        returns (uint256)
    {
        uint256 owedFees;

        // Reward management fees because it affects the total supply
        IFeeManager(routes.feeManager).rewardManagementFee();

        uint256 totalPerformanceFee = IFeeManager(routes.feeManager).performanceFeeAmount();
        // The denominator is augmented because performanceFeeAmount() accounts for inflation
        // Since shares are directly transferred, we don't need to account for inflation in this case
        owedFees = mul(
            totalPerformanceFee,
            _sharesQuantity
        ) / add(totalSupply(), totalPerformanceFee);

        _burn(_redeemer, owedFees);
        _mint(hub.manager(), owedFees);

        return owedFees;
    }
}

contract SharesFactory is Factory {
    event NewInstance(
        address indexed hub,
        address indexed instance,
        address[] defaultAssets,
        address registry
    );

    function createInstance(address _hub, address[] calldata _defaultAssets, address _registry)
        external
        returns (address)
    {
        address shares = address(
            new Shares(_hub, _defaultAssets, _registry)
        );
        childExists[shares] = true;
        emit NewInstance(_hub, shares, _defaultAssets, _registry);
        return shares;
    }
}
