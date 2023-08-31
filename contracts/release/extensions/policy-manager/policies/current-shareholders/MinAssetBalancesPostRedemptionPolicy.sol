// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "openzeppelin-solc-0.6/token/ERC20/ERC20.sol";
import "../../../../core/fund/comptroller/ComptrollerLib.sol";
import "../utils/0.6.12/PolicyBase.sol";

/// @title MinAssetBalancesPostRedemptionPolicy Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A policy that sets min remaining balance limits on assets specified during specific assets redemption
contract MinAssetBalancesPostRedemptionPolicy is PolicyBase {
    event MinAssetBalanceAddedForFund(address indexed comptrollerProxy, address indexed asset, uint256 minBalance);

    constructor(address _policyManager) public PolicyBase(_policyManager) {}

    mapping(address => mapping(address => uint256)) private comptrollerProxyToAssetToMinBalance;

    /// @notice Adds the initial policy settings for a fund
    /// @param _comptrollerProxy The fund's ComptrollerProxy address
    /// @param _encodedSettings Encoded settings to apply to a fund
    /// @dev Most funds that use this policy will likely not allow any external positions.
    /// Does not prohibit specifying not-yet-defined external position type ids.
    function addFundSettings(address _comptrollerProxy, bytes calldata _encodedSettings)
        external
        override
        onlyPolicyManager
    {
        (address[] memory assets, uint256[] memory minBalances) = abi.decode(_encodedSettings, (address[], uint256[]));
        require(assets.length == minBalances.length, "addFundSettings: Unequal array lengths");

        for (uint256 i; i < assets.length; i++) {
            comptrollerProxyToAssetToMinBalance[_comptrollerProxy][assets[i]] = minBalances[i];

            emit MinAssetBalanceAddedForFund(_comptrollerProxy, assets[i], minBalances[i]);
        }
    }

    /// @notice Whether or not the policy can be disabled
    /// @return canDisable_ True if the policy can be disabled
    function canDisable() external pure virtual override returns (bool canDisable_) {
        return true;
    }

    /// @notice Provides a constant string identifier for a policy
    /// @return identifier_ The identifier string
    function identifier() external pure override returns (string memory identifier_) {
        return "MIN_ASSET_BALANCES_POST_REDEMPTION";
    }

    /// @notice Gets the implemented PolicyHooks for a policy
    /// @return implementedHooks_ The implemented PolicyHooks
    function implementedHooks() external pure override returns (IPolicyManager.PolicyHook[] memory implementedHooks_) {
        implementedHooks_ = new IPolicyManager.PolicyHook[](1);
        implementedHooks_[0] = IPolicyManager.PolicyHook.RedeemSharesForSpecificAssets;

        return implementedHooks_;
    }

    /// @notice Apply the rule with the specified parameters of a PolicyHook
    /// @param _comptrollerProxy The fund's ComptrollerProxy address
    /// @param _encodedArgs Encoded args with which to validate the rule
    /// @return isValid_ True if the rule passes
    /// @dev onlyPolicyManager validation not necessary, as state is not updated and no events are fired
    function validateRule(address _comptrollerProxy, IPolicyManager.PolicyHook, bytes calldata _encodedArgs)
        external
        override
        returns (bool isValid_)
    {
        (,,, address[] memory assets,,) = __decodeRedeemSharesForSpecificAssetsValidationData(_encodedArgs);

        address vaultProxy = ComptrollerLib(_comptrollerProxy).getVaultProxy();
        for (uint256 i; i < assets.length; i++) {
            if (ERC20(assets[i]).balanceOf(vaultProxy) < getMinAssetBalanceForFund(_comptrollerProxy, assets[i])) {
                return false;
            }
        }

        return true;
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the minimum asset balance that must remain in a fund after specific asset redemption
    /// @param _comptrollerProxy The fund's ComptrollerProxy address
    /// @param _asset The asset
    /// @return minBalance_ The minimum balance
    function getMinAssetBalanceForFund(address _comptrollerProxy, address _asset)
        public
        view
        returns (uint256 minBalance_)
    {
        return comptrollerProxyToAssetToMinBalance[_comptrollerProxy][_asset];
    }
}
