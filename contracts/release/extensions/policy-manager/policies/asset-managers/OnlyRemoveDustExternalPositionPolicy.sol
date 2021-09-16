// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../../../core/fund/comptroller/ComptrollerLib.sol";
import "../utils/DustEvaluatorMixin.sol";
import "../utils/PolicyBase.sol";
import "../utils/PricelessAssetBypassMixin.sol";

/// @title OnlyRemoveDustExternalPositionPolicy Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A policy that only allows removing external positions whose value can be considered negligible
/// @dev Assets that do not have a valid price can be signaled via PricelessAssetBypassMixin to be valued at `0`
contract OnlyRemoveDustExternalPositionPolicy is
    PolicyBase,
    DustEvaluatorMixin,
    PricelessAssetBypassMixin
{
    constructor(
        address _policyManager,
        address _fundDeployer,
        address _valueInterpreter,
        address _wethToken,
        uint256 _pricelessAssetBypassTimelock,
        uint256 _pricelessAssetBypassTimeLimit
    )
        public
        PolicyBase(_policyManager)
        DustEvaluatorMixin(_fundDeployer)
        PricelessAssetBypassMixin(
            _valueInterpreter,
            _wethToken,
            _pricelessAssetBypassTimelock,
            _pricelessAssetBypassTimeLimit
        )
    {}

    // EXTERNAL FUNCTIONS

    /// @notice Add the initial policy settings for a fund
    function addFundSettings(address, bytes calldata) external override {
        // Not implemented
    }

    /// @notice Provides a constant string identifier for a policy
    /// @return identifier_ The identifier string
    function identifier() external pure override returns (string memory identifier_) {
        return "ONLY_REMOVE_DUST_EXTERNAL_POSITION";
    }

    /// @notice Gets the implemented PolicyHooks for a policy
    /// @return implementedHooks_ The implemented PolicyHooks
    function implementedHooks()
        external
        pure
        override
        returns (IPolicyManager.PolicyHook[] memory implementedHooks_)
    {
        implementedHooks_ = new IPolicyManager.PolicyHook[](1);
        implementedHooks_[0] = IPolicyManager.PolicyHook.RemoveExternalPosition;

        return implementedHooks_;
    }

    /// @notice Apply the rule with the specified parameters of a PolicyHook
    /// @param _comptrollerProxy The fund's ComptrollerProxy address
    /// @param _encodedArgs Encoded args with which to validate the rule
    /// @return isValid_ True if the rule passes
    /// @dev onlyPolicyManager validation not necessary as no state is updated,
    /// but is cheap and nice-to-have since an event is fired
    function validateRule(
        address _comptrollerProxy,
        IPolicyManager.PolicyHook,
        bytes calldata _encodedArgs
    ) external override onlyPolicyManager returns (bool isValid_) {
        (, address externalPosition) = __decodeRemoveExternalPositionValidationData(_encodedArgs);

        return __isDust(__calcExternalPositionValue(_comptrollerProxy, externalPosition));
    }

    // PRIVATE FUNCTIONS

    // @dev Helper for calculating an external position's value
    function __calcExternalPositionValue(address _comptrollerProxy, address _externalPosition)
        private
        returns (uint256 value_)
    {
        (
            address[] memory managedAssets,
            uint256[] memory managedAssetBalances
        ) = IExternalPosition(_externalPosition).getManagedAssets();

        uint256 managedAssetsValue = __calcTotalValueExlcudingBypassablePricelessAssets(
            _comptrollerProxy,
            managedAssets,
            managedAssetBalances,
            getPricelessAssetBypassWethToken()
        );

        (address[] memory debtAssets, uint256[] memory debtAssetBalances) = IExternalPosition(
            _externalPosition
        )
            .getDebtAssets();

        uint256 debtAssetsValue = __calcTotalValueExlcudingBypassablePricelessAssets(
            _comptrollerProxy,
            debtAssets,
            debtAssetBalances,
            getPricelessAssetBypassWethToken()
        );

        if (managedAssetsValue > debtAssetsValue) {
            return managedAssetsValue.sub(debtAssetsValue);
        }

        return 0;
    }
}
