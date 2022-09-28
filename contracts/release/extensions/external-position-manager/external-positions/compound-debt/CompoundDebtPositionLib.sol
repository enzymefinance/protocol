// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "../../../../../persistent/external-positions/compound-debt/CompoundDebtPositionLibBase1.sol";
import "../../../../interfaces/ICERC20.sol";
import "../../../../interfaces/ICEther.sol";
import "../../../../interfaces/ICompoundComptroller.sol";
import "../../../../interfaces/IWETH.sol";
import "../../../../utils/AddressArrayLib.sol";
import "./ICompoundDebtPosition.sol";

/// @title CompoundDebtPositionLib Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice An External Position library contract for Compound debt positions
contract CompoundDebtPositionLib is CompoundDebtPositionLibBase1, ICompoundDebtPosition {
    using AddressArrayLib for address[];
    using SafeERC20 for ERC20;
    using SafeMath for uint256;

    address private immutable COMP_TOKEN;
    address private immutable COMPOUND_COMPTROLLER;
    address private immutable WETH_TOKEN;

    constructor(
        address _compoundComptroller,
        address _compToken,
        address _weth
    ) public {
        COMPOUND_COMPTROLLER = _compoundComptroller;
        COMP_TOKEN = _compToken;
        WETH_TOKEN = _weth;
    }

    /// @notice Initializes the external position
    /// @dev Nothing to initialize for this contract
    function init(bytes memory) external override {}

    /// @notice Receives and executes a call from the Vault
    /// @param _actionData Encoded data to execute the action
    function receiveCallFromVault(bytes memory _actionData) external override {
        (uint256 actionId, bytes memory actionArgs) = abi.decode(_actionData, (uint256, bytes));

        (address[] memory assets, uint256[] memory amounts, bytes memory data) = abi.decode(
            actionArgs,
            (address[], uint256[], bytes)
        );

        if (actionId == uint256(ExternalPositionActions.AddCollateral)) {
            __addCollateralAssets(assets, amounts);
        } else if (actionId == uint256(ExternalPositionActions.RemoveCollateral)) {
            __removeCollateralAssets(assets, amounts);
        } else if (actionId == uint256(ExternalPositionActions.Borrow)) {
            __borrowAssets(assets, amounts, data);
        } else if (actionId == uint256(ExternalPositionActions.RepayBorrow)) {
            __repayBorrowedAssets(assets, amounts);
        } else if (actionId == uint256(ExternalPositionActions.ClaimComp)) {
            __claimComp();
        } else {
            revert("receiveCallFromVault: Invalid actionId");
        }
    }

    /// @dev Adds assets as collateral
    function __addCollateralAssets(address[] memory _assets, uint256[] memory _amounts) private {
        uint256[] memory enterMarketErrorCodes = ICompoundComptroller(getCompoundComptroller())
            .enterMarkets(_assets);

        for (uint256 i; i < _assets.length; i++) {
            require(
                enterMarketErrorCodes[i] == 0,
                "__addCollateralAssets: Error while calling enterMarkets on Compound"
            );

            if (!assetIsCollateral(_assets[i])) {
                assetToIsCollateral[_assets[i]] = true;
                collateralAssets.push(_assets[i]);
            }

            emit CollateralAssetAdded(_assets[i], _amounts[i]);
        }
    }

    /// @dev Borrows assets using the available collateral
    function __borrowAssets(
        address[] memory _assets,
        uint256[] memory _amounts,
        bytes memory _data
    ) private {
        address[] memory cTokens = abi.decode(_data, (address[]));

        for (uint256 i; i < _assets.length; i++) {
            // Validate that no other cToken is being borrowed from for the same underlying
            address cTokenStored = getCTokenFromBorrowedAsset(_assets[i]);
            if (cTokenStored == address(0)) {
                borrowedAssetToCToken[_assets[i]] = cTokens[i];
                borrowedAssets.push(_assets[i]);
            } else {
                require(
                    cTokenStored == cTokens[i],
                    "__borrowAssets: Can only borrow from one cToken for a given underlying"
                );
            }

            require(
                ICERC20(cTokens[i]).borrow(_amounts[i]) == 0,
                "__borrowAssets: Problem while borrowing from Compound"
            );

            if (_assets[i] == getWethToken()) {
                IWETH(payable(getWethToken())).deposit{value: _amounts[i]}();
            }

            ERC20(_assets[i]).safeTransfer(msg.sender, _amounts[i]);

            emit AssetBorrowed(_assets[i], _amounts[i]);
        }
    }

    /// @dev Claims the COMP_TOKEN accrued in all markets
    function __claimComp() private {
        ICompoundComptroller(getCompoundComptroller()).claimComp(address(this));

        ERC20 compToken = ERC20(getCompToken());

        compToken.safeTransfer(msg.sender, compToken.balanceOf(address(this)));
    }

    /// @dev Removes assets from collateral
    function __removeCollateralAssets(address[] memory _assets, uint256[] memory _amounts)
        private
    {
        for (uint256 i; i < _assets.length; i++) {
            require(
                assetIsCollateral(_assets[i]),
                "__removeCollateralAssets: Asset is not collateral"
            );

            if (ERC20(_assets[i]).balanceOf(address(this)) == _amounts[i]) {
                // If the full collateral of an asset is removed, it can be removed from collateral assets
                assetToIsCollateral[_assets[i]] = false;

                collateralAssets.removeStorageItem(_assets[i]);
            }

            ERC20(_assets[i]).safeTransfer(msg.sender, _amounts[i]);

            emit CollateralAssetRemoved(_assets[i], _amounts[i]);
        }
    }

    /// @notice Repays borrowed assets, reducing the borrow balance
    function __repayBorrowedAssets(address[] memory _assets, uint256[] memory _amounts) private {
        for (uint256 i; i < _assets.length; i++) {
            address cToken = getCTokenFromBorrowedAsset(_assets[i]);

            // Format max repay amount
            if (_amounts[i] == type(uint256).max) {
                _amounts[i] = ICERC20(cToken).borrowBalanceStored(address(this));
            }

            __repayBorrowedAsset(cToken, _assets[i], _amounts[i]);

            // Remove borrowed asset state from storage, if there is no remaining borrowed balance,
            if (ICERC20(cToken).borrowBalanceStored(address(this)) == 0) {
                delete borrowedAssetToCToken[_assets[i]];
                borrowedAssets.removeStorageItem(_assets[i]);
            }

            // There will only be a remaining ERC20 balance if there was a prior ERC20 balance,
            // which should not be the case

            emit BorrowedAssetRepaid(_assets[i], _amounts[i]);
        }
    }

    /// @dev Helper used to repay a borrowed asset to a Compound cToken
    function __repayBorrowedAsset(
        address _cToken,
        address _token,
        uint256 _amount
    ) private {
        if (_token == getWethToken()) {
            IWETH(payable(getWethToken())).withdraw(_amount);
            ICEther(_cToken).repayBorrow{value: _amount}();
        } else {
            ERC20(_token).safeApprove(_cToken, _amount);

            require(
                ICERC20(_cToken).repayBorrow(_amount) == 0,
                "__repayBorrowedAsset: Error while repaying borrow"
            );
        }
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    // EXTERNAL FUNCTIONS

    /// @notice Retrieves the borrowed assets and balances of the current external position
    /// @return assets_ Assets with an active loan
    /// @return amounts_ Amount of assets in external
    function getDebtAssets()
        external
        override
        returns (address[] memory assets_, uint256[] memory amounts_)
    {
        assets_ = borrowedAssets;
        amounts_ = new uint256[](assets_.length);

        for (uint256 i; i < assets_.length; i++) {
            address cToken = getCTokenFromBorrowedAsset(assets_[i]);
            amounts_[i] = ICERC20(cToken).borrowBalanceStored(address(this));
        }

        return (assets_, amounts_);
    }

    /// @notice Retrieves the collateral assets and balances of the current external position
    /// @return assets_ Assets with balance > 0 that are being used as collateral
    /// @return amounts_ Amount of assets being used as collateral
    function getManagedAssets()
        external
        override
        returns (address[] memory assets_, uint256[] memory amounts_)
    {
        assets_ = collateralAssets;
        amounts_ = new uint256[](collateralAssets.length);

        for (uint256 i; i < assets_.length; i++) {
            amounts_[i] = ERC20(assets_[i]).balanceOf(address(this));
        }

        return (assets_, amounts_);
    }

    // PUBLIC FUNCTIONS

    /// @notice Checks whether an asset is collateral
    /// @return isCollateral True if the asset is part of the collateral assets of the external position
    function assetIsCollateral(address _asset) public view returns (bool isCollateral) {
        return assetToIsCollateral[_asset];
    }

    /// @notice Gets the `COMPOUND_COMPTROLLER` variable
    /// @return compoundComptroller_ The `COMPOUND_COMPTROLLER` variable value
    function getCompoundComptroller() public view returns (address compoundComptroller_) {
        return COMPOUND_COMPTROLLER;
    }

    /// @notice Gets the `COMP_TOKEN` variable
    /// @return compToken_ The `COMP_TOKEN` variable value
    function getCompToken() public view returns (address compToken_) {
        return COMP_TOKEN;
    }

    /// @notice Returns the cToken of a given borrowed asset
    /// @param _borrowedAsset The token for which to get the cToken
    /// @return cToken_ The cToken
    function getCTokenFromBorrowedAsset(address _borrowedAsset)
        public
        view
        override
        returns (address cToken_)
    {
        return borrowedAssetToCToken[_borrowedAsset];
    }

    /// @notice Gets the `WETH_TOKEN` variable
    /// @return wethToken_ The `WETH_TOKEN` variable value
    function getWethToken() public view returns (address wethToken_) {
        return WETH_TOKEN;
    }
}
