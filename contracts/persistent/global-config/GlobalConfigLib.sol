// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../vault/interfaces/IVaultCore.sol";
import "./bases/GlobalConfigLibBase1.sol";
import "./interfaces/IGlobalConfig2.sol";
import "./interfaces/IGlobalConfigLibComptrollerV4.sol";

/// @title GlobalConfigLib Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice The proxiable library contract for GlobalConfigProxy
/// @dev Only supports releases v4 and higher
contract GlobalConfigLib is IGlobalConfig2, GlobalConfigLibBase1 {
    uint256 private constant ONE_HUNDRED_PERCENT_IN_BPS = 10000;

    address private immutable FUND_DEPLOYER_V4;

    constructor(address _fundDeployerV4) public {
        FUND_DEPLOYER_V4 = _fundDeployerV4;
    }

    /// @notice Formats a deposit call, relative to a vault's current version
    /// @param _vaultProxy The VaultProxy (shares token)
    /// @param _depositAsset The token to deposit for shares
    /// @param _depositAssetAmount The exact amount of _depositAsset to deposit
    /// @dev Caller must validate expected shares received if required
    function formatDepositCall(
        address _vaultProxy,
        address _depositAsset,
        uint256 _depositAssetAmount
    ) external view override returns (address target_, bytes memory payload_) {
        // Get release for _vaultProxy
        address fundDeployer = __getFundDeployerForVaultProxy(_vaultProxy);

        if (fundDeployer == FUND_DEPLOYER_V4) {
            address comptrollerProxy = IVaultCore(_vaultProxy).getAccessor();

            // Deposit asset must be denominationAsset
            require(
                _depositAsset ==
                    IGlobalConfigLibComptrollerV4(comptrollerProxy).getDenominationAsset(),
                "formatDepositCall: Unsupported _depositAsset"
            );

            target_ = comptrollerProxy;
            payload_ = abi.encodeWithSelector(
                IGlobalConfigLibComptrollerV4.buyShares.selector,
                _depositAssetAmount,
                1
            );
        } else {
            revert("formatDepositCall: Unsupported release");
        }

        return (target_, payload_);
    }

    /// @notice Formats a redemption call to receive a single asset, relative to a vault's current version
    /// @param _vaultProxy The VaultProxy (shares token)
    /// @param _recipient The recipient of _asset
    /// @param _asset The asset to receive
    /// @param _amount The exact amount of either shares or _asset, determined by _amountIsShares
    /// @param _amountIsShares True if _amount is shares (to redeem), false if _asset (to receive)
    /// @dev Caller must validate expected shares received if required
    function formatSingleAssetRedemptionCall(
        address _vaultProxy,
        address _recipient,
        address _asset,
        uint256 _amount,
        bool _amountIsShares
    ) external view override returns (address target_, bytes memory payload_) {
        // Get release for _vaultProxy
        address fundDeployer = __getFundDeployerForVaultProxy(_vaultProxy);

        if (fundDeployer == FUND_DEPLOYER_V4) {
            // `_amountIsShares == false` is not yet unsupported
            require(
                _amountIsShares,
                "formatSingleAssetRedemptionCall: _amountIsShares must be true"
            );

            target_ = IVaultCore(_vaultProxy).getAccessor();

            address[] memory assets = new address[](1);
            assets[0] = _asset;

            uint256[] memory percentages = new uint256[](1);
            percentages[0] = ONE_HUNDRED_PERCENT_IN_BPS;

            payload_ = abi.encodeWithSelector(
                IGlobalConfigLibComptrollerV4.redeemSharesForSpecificAssets.selector,
                _recipient,
                _amount,
                assets,
                percentages
            );
        } else {
            revert("formatSingleAssetRedemptionCall: Unsupported release");
        }

        return (target_, payload_);
    }

    /// @notice Validates whether a call to redeem shares is valid for the shares version
    /// @param _vaultProxy The VaultProxy (shares token)
    /// @param _recipientToValidate The intended recipient of the assets received from the redemption
    /// @param _sharesAmountToValidate The intended amount of shares to redeem
    /// @param _redeemContract The contract to call
    /// @param _redeemSelector The selector to call
    /// @param _redeemData The encoded params to call
    /// @return isValid_ True if valid
    /// @dev Use  NO_VALIDATION_ constants to skip optional validation of recipient and/or amount
    function isValidRedeemSharesCall(
        address _vaultProxy,
        address _recipientToValidate,
        uint256 _sharesAmountToValidate,
        address _redeemContract,
        bytes4 _redeemSelector,
        bytes calldata _redeemData
    ) external view override returns (bool isValid_) {
        // Get release for _vaultProxy
        address fundDeployer = __getFundDeployerForVaultProxy(_vaultProxy);

        // Validate call data based on release
        if (fundDeployer == FUND_DEPLOYER_V4) {
            // Validate contract
            if (_redeemContract != IVaultCore(_vaultProxy).getAccessor()) {
                return false;
            }

            // Validate selector
            if (
                !(_redeemSelector ==
                    IGlobalConfigLibComptrollerV4.redeemSharesForSpecificAssets.selector ||
                    _redeemSelector == IGlobalConfigLibComptrollerV4.redeemSharesInKind.selector)
            ) {
                return false;
            }

            // Both functions have the same first two params so we can ignore the rest of _redeemData
            (address encodedRecipient, uint256 encodedSharesAmount) = abi.decode(
                _redeemData,
                (address, uint256)
            );

            // Optionally validate recipient
            if (
                _recipientToValidate != NO_VALIDATION_DUMMY_ADDRESS &&
                _recipientToValidate != encodedRecipient
            ) {
                return false;
            }

            // Optionally validate shares amount
            if (
                _sharesAmountToValidate != NO_VALIDATION_DUMMY_AMOUNT &&
                _sharesAmountToValidate != encodedSharesAmount
            ) {
                return false;
            }

            return true;
        }

        return false;
    }

    /// @dev Helper to get the FundDeployer (release) for a given vault
    function __getFundDeployerForVaultProxy(address _vaultProxy)
        private
        view
        returns (address fundDeployer_)
    {
        return IDispatcher(getDispatcher()).getFundDeployerForVaultProxy(_vaultProxy);
    }
}
