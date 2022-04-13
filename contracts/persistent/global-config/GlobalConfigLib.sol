// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "./bases/GlobalConfigLibBase1.sol";
import "./interfaces/IGlobalConfig1.sol";
import "./interfaces/IGlobalConfigVaultAccessGetter.sol";

/// @title GlobalConfigLib Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice The proxiable library contract for GlobalConfigProxy
/// @dev Only supports releases v4 and higher
contract GlobalConfigLib is IGlobalConfig1, GlobalConfigLibBase1 {
    bytes4 private constant REDEEM_IN_KIND_V4 = 0x6af8e7eb;
    bytes4 private constant REDEEM_SPECIFIC_ASSETS_V4 = 0x3462fcc1;

    address private immutable FUND_DEPLOYER_V4;

    constructor(address _fundDeployerV4) public {
        FUND_DEPLOYER_V4 = _fundDeployerV4;
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
        address fundDeployer = IDispatcher(getDispatcher()).getFundDeployerForVaultProxy(
            _vaultProxy
        );

        // Validate call data based on release
        if (fundDeployer == FUND_DEPLOYER_V4) {
            // Validate contract
            if (_redeemContract != IGlobalConfigVaultAccessGetter(_vaultProxy).getAccessor()) {
                return false;
            }

            // Validate selector
            if (
                !(_redeemSelector == REDEEM_SPECIFIC_ASSETS_V4 ||
                    _redeemSelector == REDEEM_IN_KIND_V4)
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
}
