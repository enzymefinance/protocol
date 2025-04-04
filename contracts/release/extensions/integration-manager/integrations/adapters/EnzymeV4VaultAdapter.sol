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
import {IEnzymeV4VaultAdapter} from "./interfaces/IEnzymeV4VaultAdapter.sol";

/// @title EnzymeV4VaultAdapter Contract
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice Adapter for depositing into, and redeeming from Enzyme V4 Vaults
/// @dev Supported vaults must have a configuration that allows for these actions to proceed via this adapter, e.g.
///  - no `sharesActionTimelock`
///  - no policies that block shares deposits to, redemptions from, or transfers to this adapter
///  - redeemForSpecificAssets() as a redemption option
/// Since such configuration can change, both holders and owners of vaults intended to be compatible with this adapter should be aware of the consequences of any changes.
contract EnzymeV4VaultAdapter is AdapterBase {
    using SafeERC20 for IERC20;

    ///@dev Dispatcher contract, used to get the FundDeployer for a given VaultProxy, and validate whether a VaultProxy is valid
    IDispatcher public immutable DISPATCHER;
    ///@dev Fund deployer address, used to validate whether a VaultProxy is valid
    address public immutable FUND_DEPLOYER_ADDRESS;

    /// @dev Thrown if an invalid action is passed to the adapter
    error EnzymeV4VaultAdapter__InvalidAction();
    /// @dev Thrown if an not deployed by FundDeployer VaultProxy is passed to the adapter
    error EnzymeV4VaultAdapter__InvalidVaultProxy();

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
        (IEnzymeV4VaultAdapter.Action actionId, bytes memory encodedActionArgs) =
            abi.decode(_actionData, (IEnzymeV4VaultAdapter.Action, bytes));

        if (actionId == IEnzymeV4VaultAdapter.Action.BuyShares) {
            __buyShares(_vaultProxyAddress, abi.decode(encodedActionArgs, (IEnzymeV4VaultAdapter.BuySharesActionArgs)));
        } else if (actionId == IEnzymeV4VaultAdapter.Action.RedeemSharesForSpecificAssets) {
            __redeemSharesForSpecificAssets(
                _vaultProxyAddress,
                abi.decode(encodedActionArgs, (IEnzymeV4VaultAdapter.RedeemSharesForSpecificAssetsActionArgs))
            );
        }
    }

    /// @dev Helper to buy shares from Enzyme Vault
    function __buyShares(address _vaultProxyAddress, IEnzymeV4VaultAdapter.BuySharesActionArgs memory _actionArgs)
        private
    {
        IComptroller comptrollerProxy = IComptroller(IVault(_actionArgs.vaultProxy).getAccessor());

        __approveAssetMaxAsNeeded({
            _asset: comptrollerProxy.getDenominationAsset(),
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
    function __redeemSharesForSpecificAssets(
        address _vaultProxyAddress,
        IEnzymeV4VaultAdapter.RedeemSharesForSpecificAssetsActionArgs memory _actionArgs
    ) private {
        IComptroller(IVault(_actionArgs.vaultProxy).getAccessor()).redeemSharesForSpecificAssets({
            _recipient: _vaultProxyAddress,
            _sharesQuantity: _actionArgs.sharesQuantity,
            _payoutAssets: _actionArgs.payoutAssets,
            _payoutAssetPercentages: _actionArgs.payoutAssetPercentages
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
        if (_selector != ACTION_SELECTOR) revert EnzymeV4VaultAdapter__InvalidAction();

        (IEnzymeV4VaultAdapter.Action actionId, bytes memory encodedActionArgs) =
            abi.decode(_actionData, (IEnzymeV4VaultAdapter.Action, bytes));

        if (actionId == IEnzymeV4VaultAdapter.Action.BuyShares) {
            IEnzymeV4VaultAdapter.BuySharesActionArgs memory actionArgs =
                abi.decode(encodedActionArgs, (IEnzymeV4VaultAdapter.BuySharesActionArgs));

            __validateVaultProxy(actionArgs.vaultProxy);

            spendAssets_ = new address[](1);
            spendAssetAmounts_ = new uint256[](1);
            incomingAssets_ = new address[](1);
            minIncomingAssetAmounts_ = new uint256[](1);

            spendAssets_[0] = IComptroller(IVault(actionArgs.vaultProxy).getAccessor()).getDenominationAsset();
            spendAssetAmounts_[0] = actionArgs.investmentAmount;
            incomingAssets_[0] = actionArgs.vaultProxy;
            minIncomingAssetAmounts_[0] = actionArgs.minSharesQuantity;
        } else if (actionId == IEnzymeV4VaultAdapter.Action.RedeemSharesForSpecificAssets) {
            IEnzymeV4VaultAdapter.RedeemSharesForSpecificAssetsActionArgs memory actionArgs =
                abi.decode(encodedActionArgs, (IEnzymeV4VaultAdapter.RedeemSharesForSpecificAssetsActionArgs));

            __validateVaultProxy(actionArgs.vaultProxy);

            spendAssets_ = new address[](1);
            spendAssetAmounts_ = new uint256[](1);

            spendAssets_[0] = actionArgs.vaultProxy;
            spendAssetAmounts_[0] = actionArgs.sharesQuantity;
            incomingAssets_ = actionArgs.payoutAssets;
            minIncomingAssetAmounts_ = actionArgs.minPayoutAssetAmounts;
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
            revert EnzymeV4VaultAdapter__InvalidVaultProxy();
        }
    }
}
