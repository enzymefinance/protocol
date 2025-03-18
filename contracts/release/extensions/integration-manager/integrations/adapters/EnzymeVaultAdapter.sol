// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {IERC20} from "../../../../../external-interfaces/IERC20.sol";
import {IDispatcher} from "../../../../../persistent/dispatcher/IDispatcher.sol";
import {WrappedSafeERC20 as SafeERC20} from "../../../../../utils/0.8.19/open-zeppelin/WrappedSafeERC20.sol";
import {IComptroller} from "../../../../core/fund/comptroller/IComptroller.sol";
import {IVault} from "../../../../core/fund/vault/IVault.sol";
import {IIntegrationManager} from "../../IIntegrationManager.sol";
import {AdapterBase} from "../utils/0.8.19/AdapterBase.sol";
import {IEnzymeVaultAdapter} from "./interfaces/IEnzymeVaultAdapter.sol";

/// @title EnzymeVaultAdapter Contract
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice Adapter for depositing into, and redeeming from Enzyme Vaults
contract EnzymeVaultAdapter is AdapterBase {
    using SafeERC20 for IERC20;

    /// @dev Same One Hundred Percent value as it used in the ComptrollerLib
    uint256 private constant ONE_HUNDRED_PERCENT = 10_000;

    ///@dev Dispatcher contract, used to get the FundDeployer for a given VaultProxy, and validate whether a VaultProxy is valid
    IDispatcher public immutable DISPATCHER;
    ///@dev Fund deployer address, used to validate whether a VaultProxy is valid
    address public immutable FUND_DEPLOYER_ADDRESS;

    /// @dev Thrown if an invalid action is passed to the adapter
    error EnzymeVaultAdapter__InvalidAction();
    /// @dev Thrown if an not deployed by FundDeployer VaultProxy is passed to the adapter
    error EnzymeVaultAdapter__InvalidVaultProxy();

    constructor(address _integrationManagerAddress, address _fundDeployerAddress, IDispatcher _dispatcher)
        AdapterBase(_integrationManagerAddress)
    {
        FUND_DEPLOYER_ADDRESS = _fundDeployerAddress;
        DISPATCHER = _dispatcher;
    }

    //==================================================================================================================
    // Actions
    //==================================================================================================================

    /// @notice Execute an adapter action
    /// @param _vaultProxyAddress The VaultProxy of the calling fund
    /// @param _actionData Data specific to this action
    function action(address _vaultProxyAddress, bytes calldata _actionData, bytes calldata) external {
        (IEnzymeVaultAdapter.Action actionId, bytes memory encodedActionArgs) =
            abi.decode(_actionData, (IEnzymeVaultAdapter.Action, bytes));

        if (actionId == IEnzymeVaultAdapter.Action.BuyShares) {
            __buyShares(_vaultProxyAddress, abi.decode(encodedActionArgs, (IEnzymeVaultAdapter.BuySharesActionArgs)));
        } else if (actionId == IEnzymeVaultAdapter.Action.RedeemShares) {
            __redeemShares(
                _vaultProxyAddress, abi.decode(encodedActionArgs, (IEnzymeVaultAdapter.RedeemSharesActionArgs))
            );
        }
    }

    /// @dev Helper to buy shares from Enzyme Vault
    function __buyShares(address _vaultProxyAddress, IEnzymeVaultAdapter.BuySharesActionArgs memory _actionArgs)
        private
    {
        IComptroller comptrollerProxy = IComptroller(IVault(_actionArgs.vaultProxy).getAccessor());

        __approveAssetMaxAsNeeded({
            _asset: _actionArgs.denominationAsset,
            _target: address(comptrollerProxy),
            _neededAmount: _actionArgs.investmentAmount
        });

        uint256 sharesReceived = comptrollerProxy.buyShares({
            _investmentAmount: _actionArgs.investmentAmount,
            _minSharesQuantity: _actionArgs.minSharesQuantity
        });

        IERC20(_actionArgs.vaultProxy).safeTransfer({_to: _vaultProxyAddress, _value: sharesReceived});
    }

    /// @dev Helper to redeem shares from Enzyme Vault
    function __redeemShares(address _vaultProxyAddress, IEnzymeVaultAdapter.RedeemSharesActionArgs memory _actionArgs)
        private
    {
        address[] memory payoutAssets = new address[](1);
        payoutAssets[0] = _actionArgs.payoutAsset;

        uint256[] memory payoutAssetPercentages = new uint256[](1);
        payoutAssetPercentages[0] = ONE_HUNDRED_PERCENT;

        IComptroller(IVault(_actionArgs.vaultProxy).getAccessor()).redeemSharesForSpecificAssets({
            _recipient: _vaultProxyAddress,
            _sharesQuantity: _actionArgs.sharesQuantity,
            _payoutAssets: payoutAssets,
            _payoutAssetPercentages: payoutAssetPercentages
        });
    }

    //==================================================================================================================
    // Parse assets for action
    //==================================================================================================================

    /// @notice Parses the expected assets in a particular action
    /// @param _selector The function selector for the callOnIntegration
    /// @param _actionData Data specific to this action
    /// @return spendAssetsHandleType_ A type that dictates how to handle granting
    /// the adapter access to spend assets (`None` by default)
    /// @return spendAssets_ The assets to spend in the call
    /// @return spendAssetAmounts_ The max asset amounts to spend in the call
    /// @return incomingAssets_ The assets to receive in the call
    /// @return minIncomingAssetAmounts_ The min asset amounts to receive in the call
    function parseAssetsForAction(address, bytes4 _selector, bytes calldata _actionData)
        external
        view
        override
        returns (
            IIntegrationManager.SpendAssetsHandleType spendAssetsHandleType_,
            address[] memory spendAssets_,
            uint256[] memory spendAssetAmounts_,
            address[] memory incomingAssets_,
            uint256[] memory minIncomingAssetAmounts_
        )
    {
        if (_selector != ACTION_SELECTOR) revert EnzymeVaultAdapter__InvalidAction();

        (IEnzymeVaultAdapter.Action actionId, bytes memory encodedActionArgs) =
            abi.decode(_actionData, (IEnzymeVaultAdapter.Action, bytes));

        spendAssets_ = new address[](1);
        spendAssetAmounts_ = new uint256[](1);
        incomingAssets_ = new address[](1);
        minIncomingAssetAmounts_ = new uint256[](1);

        if (actionId == IEnzymeVaultAdapter.Action.BuyShares) {
            IEnzymeVaultAdapter.BuySharesActionArgs memory actionArgs =
                abi.decode(encodedActionArgs, (IEnzymeVaultAdapter.BuySharesActionArgs));

            __validateVaultProxy(actionArgs.vaultProxy);

            spendAssets_[0] = actionArgs.denominationAsset;
            spendAssetAmounts_[0] = actionArgs.investmentAmount;
            incomingAssets_[0] = actionArgs.vaultProxy;
            minIncomingAssetAmounts_[0] = actionArgs.minSharesQuantity;
        } else if (actionId == IEnzymeVaultAdapter.Action.RedeemShares) {
            IEnzymeVaultAdapter.RedeemSharesActionArgs memory actionArgs =
                abi.decode(encodedActionArgs, (IEnzymeVaultAdapter.RedeemSharesActionArgs));

            __validateVaultProxy(actionArgs.vaultProxy);

            spendAssets_[0] = actionArgs.vaultProxy;
            spendAssetAmounts_[0] = actionArgs.sharesQuantity;
            incomingAssets_[0] = actionArgs.payoutAsset;
            minIncomingAssetAmounts_[0] = actionArgs.minPayoutAssetAmount;
        }

        return (
            IIntegrationManager.SpendAssetsHandleType.Transfer,
            spendAssets_,
            spendAssetAmounts_,
            incomingAssets_,
            minIncomingAssetAmounts_
        );
    }

    //==================================================================================================================
    // Helpers
    //==================================================================================================================

    /// @dev Helper to verify that a VaultProxy is valid
    function __validateVaultProxy(address _vaultProxyAddress) private view {
        if (DISPATCHER.getFundDeployerForVaultProxy(_vaultProxyAddress) != FUND_DEPLOYER_ADDRESS) {
            revert EnzymeVaultAdapter__InvalidVaultProxy();
        }
    }
}
