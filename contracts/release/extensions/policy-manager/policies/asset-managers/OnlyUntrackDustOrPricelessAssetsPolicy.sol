// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../../../core/fund/comptroller/ComptrollerLib.sol";
import "../utils/0.6.12/DustEvaluatorMixin.sol";
import "../utils/0.6.12/PolicyBase.sol";
import "../utils/0.6.12/PricelessAssetBypassMixin.sol";

/// @title OnlyUntrackDustOrPricelessAssetsPolicy Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A policy that only allows untracking assets whose value can be considered negligible,
/// or assets that do not have a valid price and for which the manager has signaled prior intent to remove
contract OnlyUntrackDustOrPricelessAssetsPolicy is PolicyBase, DustEvaluatorMixin, PricelessAssetBypassMixin {
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
        return "ONLY_UNTRACK_DUST_OR_PRICELESS_ASSETS";
    }

    /// @notice Gets the implemented PolicyHooks for a policy
    /// @return implementedHooks_ The implemented PolicyHooks
    function implementedHooks() external pure override returns (IPolicyManager.PolicyHook[] memory implementedHooks_) {
        implementedHooks_ = new IPolicyManager.PolicyHook[](1);
        implementedHooks_[0] = IPolicyManager.PolicyHook.RemoveTrackedAssets;

        return implementedHooks_;
    }

    /// @notice Apply the rule with the specified parameters of a PolicyHook
    /// @param _comptrollerProxy The fund's ComptrollerProxy address
    /// @param _encodedArgs Encoded args with which to validate the rule
    /// @return isValid_ True if the rule passes
    /// @dev onlyPolicyManager validation not necessary as no state is updated,
    /// but is cheap and nice-to-have since an event is fired
    function validateRule(address _comptrollerProxy, IPolicyManager.PolicyHook, bytes calldata _encodedArgs)
        external
        override
        onlyPolicyManager
        returns (bool isValid_)
    {
        (, address[] memory assets) = __decodeRemoveTrackedAssetsValidationData(_encodedArgs);

        address vaultProxy = ComptrollerLib(_comptrollerProxy).getVaultProxy();
        for (uint256 i; i < assets.length; i++) {
            uint256 amount = ERC20(assets[i]).balanceOf(vaultProxy);
            uint256 valueInWeth = __calcValueExcludingBypassablePricelessAsset(
                _comptrollerProxy, assets[i], amount, getPricelessAssetBypassWethToken()
            );

            if (!__isDust(valueInWeth)) {
                return false;
            }
        }

        return true;
    }
}
