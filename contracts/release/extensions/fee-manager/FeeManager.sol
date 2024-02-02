// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {AddressArrayLib} from "../../../utils/0.8.19/AddressArrayLib.sol";
import {IComptroller} from "../../core/fund/comptroller/IComptroller.sol";
import {IVault} from "../../core/fund/vault/IVault.sol";
import {ExtensionBase} from "../utils/ExtensionBase.sol";
import {PermissionedVaultActionMixin} from "../utils/PermissionedVaultActionMixin.sol";
import {IFee} from "./IFee.sol";
import {IFeeManager} from "./IFeeManager.sol";

/// @title FeeManager Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Manages fees for funds
/// @dev Any arbitrary fee is allowed by default, so all participants must be aware of
/// their fund's configuration, especially whether they use official fees only.
/// Fees can only be added upon fund setup, migration, or reconfiguration.
contract FeeManager is IFeeManager, ExtensionBase, PermissionedVaultActionMixin {
    using AddressArrayLib for address[];

    event FeeEnabledForFund(address indexed comptrollerProxy, address indexed fee, bytes settingsData);

    event FeeSettledForFund(
        address indexed comptrollerProxy,
        address indexed fee,
        SettlementType indexed settlementType,
        address payer,
        address payee,
        uint256 sharesDue
    );

    mapping(address => address[]) private comptrollerProxyToFees;

    constructor(address _fundDeployer) ExtensionBase(_fundDeployer) {}

    // EXTERNAL FUNCTIONS

    /// @notice Activate already-configured fees for use in the calling fund
    function activateForFund(bool) external override {
        address comptrollerProxy = msg.sender;
        address vaultProxy = getVaultProxyForFund(comptrollerProxy);

        address[] memory enabledFees = getEnabledFeesForFund(comptrollerProxy);
        for (uint256 i; i < enabledFees.length; i++) {
            IFee(enabledFees[i]).activateForFund(comptrollerProxy, vaultProxy);
        }
    }

    /// @notice Allows all fees for a particular FeeHook to implement settle() and update() logic
    /// @param _hook The FeeHook to invoke
    /// @param _settlementData The encoded settlement parameters specific to the FeeHook
    /// @param _gav The GAV for a fund if known in the invocating code, otherwise 0
    function invokeHook(FeeHook _hook, bytes calldata _settlementData, uint256 _gav) external override {
        __invokeHook(msg.sender, _hook, _settlementData, _gav, true);
    }

    /// @notice Receives a dispatched `callOnExtension` from a fund's ComptrollerProxy
    /// @param _actionId An ID representing the desired action
    /// @dev This is the only way to call a function on this contract that updates VaultProxy state.
    /// For both of these actions, any caller is allowed, so we don't use the caller param.
    function receiveCallFromComptroller(address, uint256 _actionId, bytes calldata) external override {
        if (_actionId == 0) {
            // Settle and update all continuous fees
            __invokeHook(msg.sender, IFeeManager.FeeHook.Continuous, "", 0, true);
        } else {
            revert("receiveCallFromComptroller: Invalid _actionId");
        }
    }

    /// @notice Enable and configure fees for use in the calling fund
    /// @param _configData Encoded config data
    /// @dev The order of `fees` determines the order in which fees of the same FeeHook will be applied.
    /// It is recommended to run ManagementFee before PerformanceFee in order to achieve precise
    /// PerformanceFee calcs.
    function setConfigForFund(bytes calldata _configData) external override {
        address comptrollerProxy = msg.sender;

        __setValidatedVaultProxy({_comptrollerProxy: comptrollerProxy});

        (address[] memory fees, bytes[] memory settingsData) = abi.decode(_configData, (address[], bytes[]));

        // Sanity checks
        require(fees.length == settingsData.length, "setConfigForFund: fees and settingsData array lengths unequal");
        require(fees.isUniqueSet(), "setConfigForFund: fees cannot include duplicates");

        // Enable each fee with settings
        for (uint256 i; i < fees.length; i++) {
            // Set fund config on fee
            IFee(fees[i]).addFundSettings(comptrollerProxy, settingsData[i]);

            // Enable fee for fund
            comptrollerProxyToFees[comptrollerProxy].push(fees[i]);

            emit FeeEnabledForFund(comptrollerProxy, fees[i], settingsData[i]);
        }
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to get the canonical value of GAV if not yet set and required by fee
    function __getGavAsNecessary(address _comptrollerProxy, uint256 _gavOrZero) private returns (uint256 gav_) {
        if (_gavOrZero == 0) {
            return IComptroller(_comptrollerProxy).calcGav();
        } else {
            return _gavOrZero;
        }
    }

    /// @dev Helper to run settle() on all enabled fees for a fund that implement a given hook, and then to
    /// optionally run update() on the same fees. This order allows fees an opportunity to update
    /// their local state after all VaultProxy state transitions (i.e., minting, burning,
    /// transferring shares) have finished. To optimize for the expensive operation of calculating
    /// GAV, once one fee requires GAV, we recycle that `gav` value for subsequent fees.
    /// Assumes that _gav is either 0 or has already been validated.
    function __invokeHook(
        address _comptrollerProxy,
        FeeHook _hook,
        bytes memory _settlementData,
        uint256 _gavOrZero,
        bool _updateFees
    ) private {
        address[] memory fees = getEnabledFeesForFund(_comptrollerProxy);
        if (fees.length == 0) {
            return;
        }

        address vaultProxy = getVaultProxyForFund(_comptrollerProxy);

        // This check isn't strictly necessary, but its cost is insignificant,
        // and helps to preserve data integrity.
        require(vaultProxy != address(0), "__invokeHook: Fund is not active");

        // First, allow all fees to implement settle()
        uint256 gav = __settleFees(_comptrollerProxy, vaultProxy, fees, _hook, _settlementData, _gavOrZero);

        // Second, allow fees to implement update()
        // This function does not allow any further altering of VaultProxy state
        // (i.e., burning, minting, or transferring shares)
        if (_updateFees) {
            __updateFees(_comptrollerProxy, vaultProxy, fees, _hook, _settlementData, gav);
        }
    }

    /// @dev Helper to get the end recipient for a given fee and fund
    function __parseFeeRecipientForFund(address _comptrollerProxy, address _vaultProxy, address _fee)
        private
        view
        returns (address recipient_)
    {
        recipient_ = IFee(_fee).getRecipientForFund(_comptrollerProxy);
        if (recipient_ == address(0)) {
            recipient_ = IVault(_vaultProxy).getOwner();
        }

        return recipient_;
    }

    /// @dev Helper to settle a fee
    function __settleFee(
        address _comptrollerProxy,
        address _vaultProxy,
        address _fee,
        FeeHook _hook,
        bytes memory _settlementData,
        uint256 _gav
    ) private {
        (SettlementType settlementType, address payer, uint256 sharesDue) =
            IFee(_fee).settle(_comptrollerProxy, _vaultProxy, _hook, _settlementData, _gav);
        if (settlementType == SettlementType.None) {
            return;
        }

        address payee;
        if (settlementType == SettlementType.Direct) {
            payee = __parseFeeRecipientForFund(_comptrollerProxy, _vaultProxy, _fee);
            __transferShares(_comptrollerProxy, payer, payee, sharesDue);
        } else if (settlementType == SettlementType.Mint) {
            payee = __parseFeeRecipientForFund(_comptrollerProxy, _vaultProxy, _fee);
            __mintShares(_comptrollerProxy, payee, sharesDue);
        } else if (settlementType == SettlementType.Burn) {
            __burnShares(_comptrollerProxy, payer, sharesDue);
        } else {
            revert("__settleFee: Invalid SettlementType");
        }

        emit FeeSettledForFund(_comptrollerProxy, _fee, settlementType, payer, payee, sharesDue);
    }

    /// @dev Helper to settle fees that implement a given fee hook
    function __settleFees(
        address _comptrollerProxy,
        address _vaultProxy,
        address[] memory _fees,
        FeeHook _hook,
        bytes memory _settlementData,
        uint256 _gavOrZero
    ) private returns (uint256 gav_) {
        gav_ = _gavOrZero;

        for (uint256 i; i < _fees.length; i++) {
            (bool settles, bool usesGav) = IFee(_fees[i]).settlesOnHook(_hook);
            if (!settles) {
                continue;
            }

            if (usesGav) {
                gav_ = __getGavAsNecessary(_comptrollerProxy, gav_);
            }

            __settleFee(_comptrollerProxy, _vaultProxy, _fees[i], _hook, _settlementData, gav_);
        }

        return gav_;
    }

    /// @dev Helper to update fees that implement a given fee hook
    function __updateFees(
        address _comptrollerProxy,
        address _vaultProxy,
        address[] memory _fees,
        FeeHook _hook,
        bytes memory _settlementData,
        uint256 _gavOrZero
    ) private {
        uint256 gav = _gavOrZero;

        for (uint256 i; i < _fees.length; i++) {
            (bool updates, bool usesGav) = IFee(_fees[i]).updatesOnHook(_hook);
            if (!updates) {
                continue;
            }

            if (usesGav) {
                gav = __getGavAsNecessary(_comptrollerProxy, gav);
            }

            IFee(_fees[i]).update(_comptrollerProxy, _vaultProxy, _hook, _settlementData, gav);
        }
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Get a list of enabled fees for a given fund
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @return enabledFees_ An array of enabled fee addresses
    function getEnabledFeesForFund(address _comptrollerProxy)
        public
        view
        override
        returns (address[] memory enabledFees_)
    {
        return comptrollerProxyToFees[_comptrollerProxy];
    }
}
