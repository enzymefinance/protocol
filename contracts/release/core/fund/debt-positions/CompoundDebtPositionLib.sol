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
import "../../../interfaces/ICERC20.sol";
import "../../../interfaces/ICEther.sol";
import "../../../interfaces/ICompoundComptroller.sol";
import "../../../interfaces/IWETH.sol";
import "../../../utils/AddressArrayLib.sol";
import "./IDebtPosition.sol";

/// @title CompoundDebtPosition Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A Debt Position smart contract for Compound
contract CompoundDebtPositionLib is IDebtPosition {
    using AddressArrayLib for address[];
    using SafeERC20 for ERC20;
    using SafeMath for uint256;

    event BorrowedAsset(address indexed asset, uint256 amount, bytes data);

    event BorrowedAssetRepaid(address indexed asset, uint256 amount, bytes data);

    event CollateralAssetAdded(address indexed asset, uint256 amount, bytes data);

    event CollateralAssetRemoved(address indexed asset, uint256 amount, bytes data);

    address private immutable COMPOUND_COMPTROLLER;
    address private immutable WETH_TOKEN;

    address private vaultProxy;

    modifier onlyVault() {
        require(msg.sender == vaultProxy, "Only the vault can make this call");
        _;
    }

    address[] private borrowedAssets;
    address[] private collateralAssets;

    mapping(address => bool) private assetToIsCollateral;
    mapping(address => address) private borrowedAssetToCToken;

    /// @dev Needed to receive ETH during cEther borrow and to unwrap WETH
    receive() external payable {}

    constructor(address _compoundComptroller, address _weth) public {
        COMPOUND_COMPTROLLER = _compoundComptroller;
        WETH_TOKEN = _weth;
    }

    /// @notice Initializes the debt position
    /// @param _initData Data params to initialize the debt position
    /// No need to assert access because this is called atomically from the debt position manager,
    /// and once it's called, it cannot be called again.
    function init(bytes memory _initData) external override {
        require(vaultProxy == address(0), "init: Already initialized");
        vaultProxy = abi.decode(_initData, (address));
    }

    /// @notice Receives and executes a call from the Vault
    /// @param _actionData Encoded data to execute the action.
    function receiveCallFromVault(bytes memory _actionData) external override onlyVault {
        (uint256 actionId, bytes memory actionArgs) = abi.decode(_actionData, (uint256, bytes));

        (address[] memory assets, uint256[] memory amounts, bytes memory data) = abi.decode(
            actionArgs,
            (address[], uint256[], bytes)
        );
        if (actionId == uint256(DebtPositionActions.AddCollateral)) {
            __addCollateralAssets(assets, amounts);
        } else if (actionId == uint256(DebtPositionActions.RemoveCollateral)) {
            __removeCollateralAssets(assets, amounts);
        } else if (actionId == uint256(DebtPositionActions.Borrow)) {
            __borrowAssets(assets, amounts, data);
        } else if (actionId == uint256(DebtPositionActions.RepayBorrow)) {
            __repayBorrowedAssets(assets, amounts, data);
        } else {
            revert("receiveCallFromVault: Invalid actionId");
        }
    }

    /// @dev Adds assets as collateral
    function __addCollateralAssets(address[] memory _assets, uint256[] memory _amounts) private {
        uint256[] memory enterMarketErrorCodes = ICompoundComptroller(COMPOUND_COMPTROLLER)
            .enterMarkets(_assets);

        for (uint256 i; i < _assets.length; i++) {
            // Include asset in the local collateral list if not included
            if (!assetToIsCollateral[_assets[i]]) {
                assetToIsCollateral[_assets[i]] = true;
                collateralAssets.push(_assets[i]);
            }

            // Include assets as collateral on Compound
            address[] memory assetArray = new address[](1);
            assetArray[0] = _assets[i];

            require(
                enterMarketErrorCodes[i] == 0,
                "__addCollateralAssets: Error while calling enterMarkets on Compound"
            );

            emit CollateralAssetAdded(_assets[i], _amounts[i], "");
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
            // Once verified, cache the pair if it has not been done yet
            require(
                ICERC20(cTokens[i]).borrow(_amounts[i]) == 0,
                "__borrowAssets: Problem while borrowing from Compound"
            );

            if (_assets[i] == WETH_TOKEN) {
                IWETH(payable(WETH_TOKEN)).deposit{value: _amounts[i]}();
            }

            // NOTE: This pair cToken/Token is considered to be already verified from the source
            if (getCTokenFromBorrowedAsset(_assets[i]) == address(0)) {
                borrowedAssetToCToken[_assets[i]] = cTokens[i];
                borrowedAssets.push(_assets[i]);
            }

            ERC20(_assets[i]).safeTransfer(msg.sender, _amounts[i]);

            emit BorrowedAsset(_assets[i], _amounts[i], _data);
        }
    }

    /// @dev Removes assets from collateral
    function __removeCollateralAssets(address[] memory _assets, uint256[] memory _amounts)
        private
    {
        for (uint256 i; i < _assets.length; i++) {
            require(
                assetToIsCollateral[_assets[i]],
                "__removeCollateralAssets: Asset is not collateral"
            );

            if (ERC20(_assets[i]).balanceOf(address(this)) == _amounts[i]) {
                // If the full collateral of an asset is removed, it can be removed from collateral assets
                assetToIsCollateral[_assets[i]] = false;

                collateralAssets.removeStorageItem(_assets[i]);
            }

            ERC20(_assets[i]).safeTransfer(msg.sender, _amounts[i]);

            emit CollateralAssetRemoved(_assets[i], _amounts[i], "");
        }
    }

    /// @notice Repays borrowed assets, reducing the borrow balance
    function __repayBorrowedAssets(
        address[] memory _assets,
        uint256[] memory _amounts,
        bytes memory _data
    ) private {
        address[] memory cTokens = abi.decode(_data, (address[]));

        for (uint256 i; i < _assets.length; i++) {
            require(
                getCTokenFromBorrowedAsset(_assets[i]) != address(0),
                "__repayBorrowedAssets: Asset has not been borrowed"
            );

            require(
                ERC20(_assets[i]).balanceOf(address(this)) >= _amounts[i],
                "__repayBorrowedAssets: Insufficient balance"
            );

            // Accrue interest to get the current borrow balance
            // NOTE: Used instead of borrow-balance-current: https://compound.finance/docs/ctokens#borrow-balance
            ICERC20(cTokens[i]).accrueInterest();
            uint256 borrowBalance = ICERC20(cTokens[i]).borrowBalanceStored(address(this));

            // Repaid amount doesn't cover the full balance
            if (_amounts[i] < borrowBalance) {
                __repayBorrowedAsset(cTokens[i], _assets[i], _amounts[i]);
            } else {
                // Amount covers the full borrow balance, so it can be removed from borrowed balances
                __repayBorrowedAsset(cTokens[i], _assets[i], borrowBalance);

                // Reset borrowed asset cToken and remove it from the list of borrowed assets
                borrowedAssetToCToken[_assets[i]] = address(0);
                borrowedAssets.removeStorageItem(_assets[i]);

                // Send back the remaining token amount after paying the loan
                if (_amounts[i] > borrowBalance) {
                    ERC20(_assets[i]).safeTransfer(msg.sender, _amounts[i].sub(borrowBalance));
                }
            }

            emit BorrowedAssetRepaid(_assets[i], _amounts[i], _data);
        }
    }

    /// @dev Helper used to repay a borrowed asset to a Compound cToken
    function __repayBorrowedAsset(
        address _cToken,
        address _token,
        uint256 _amount
    ) private {
        if (_token == WETH_TOKEN) {
            IWETH(payable(WETH_TOKEN)).withdraw(_amount);
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

    /// @notice Retrieves the borrowed assets and balances of the current debt position
    /// @return assets_ Assets with an active loan
    /// @return amounts_ Amount of assets in debt
    function getBorrowedAssets()
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

    /// @notice Retrieves the collateral assets and balances of the current debt position
    /// @return assets_ Assets with balance > 0 that are being used as collateral
    /// @return amounts_ Amount of assets being used as collateral
    function getCollateralAssets()
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

    /// @notice Checks whether an asset is collateral
    /// @return isCollateral True if the asset is part of the collateral assets of the debt position
    function assetIsCollateral(address _asset) external view returns (bool isCollateral) {
        return assetToIsCollateral[_asset];
    }

    /// @notice Gets the `COMPOUND_COMPTROLLER` variable
    /// @return compoundComptroller_ The `COMPOUND_COMPTROLLER` variable value
    function getCompoundComptroller() external view returns (address compoundComptroller_) {
        return COMPOUND_COMPTROLLER;
    }

    /// @notice Returns the cToken of a given borrowed asset
    /// @param _borrowedAsset The token for which to get the cToken
    /// @return cToken_ The cToken
    function getCTokenFromBorrowedAsset(address _borrowedAsset)
        public
        view
        returns (address cToken_)
    {
        return borrowedAssetToCToken[_borrowedAsset];
    }

    /// @notice Gets the `vaultProxy` variable
    /// @return vaultProxy_ The `vaultProxy` variable value
    function getVaultProxy() external view returns (address vaultProxy_) {
        return vaultProxy;
    }

    /// @notice Gets the `WETH_TOKEN` variable
    /// @return wethToken_ The `WETH_TOKEN` variable value
    function getWethToken() external view returns (address wethToken_) {
        return WETH_TOKEN;
    }
}
