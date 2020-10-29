// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "../../core/fund/comptroller/IComptroller.sol";
import "../../core/fund/vault/IVault.sol";
import "../../utils/AddressArrayLib.sol";
import "../utils/ExtensionBase.sol";
import "../utils/FundDeployerOwnerMixin.sol";
import "../utils/PermissionedVaultActionMixin.sol";
import "./IFee.sol";
import "./IFeeManager.sol";

/// @title FeeManager Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Manages fees for funds
contract FeeManager is
    IFeeManager,
    ExtensionBase,
    FundDeployerOwnerMixin,
    PermissionedVaultActionMixin
{
    using AddressArrayLib for address[];
    using EnumerableSet for EnumerableSet.AddressSet;
    using SafeMath for uint256;

    event FeeDeregistered(address indexed fee, string indexed identifier);

    event FeeEnabledForFund(
        address indexed comptrollerProxy,
        address indexed fee,
        bytes settingsData
    );

    event FeeRegistered(
        address indexed fee,
        string indexed identifier,
        FeeHook[] implementedHooks
    );

    event FeeSettledForFund(
        address indexed comptrollerProxy,
        address indexed fee,
        SettlementType indexed settlementType,
        address payer,
        address payee,
        uint256 sharesDue
    );

    event AllSharesOutstandingForcePaidForFund(
        address indexed comptrollerProxy,
        address payee,
        uint256 sharesDue
    );

    event SharesOutstandingPaidForFund(
        address indexed comptrollerProxy,
        address indexed fee,
        address payee,
        uint256 sharesDue
    );

    event FeesRecipientSetForFund(
        address indexed comptrollerProxy,
        address prevFeesRecipient,
        address nextFeesRecipient
    );

    EnumerableSet.AddressSet private registeredFees;
    mapping(address => mapping(FeeHook => bool)) private feeToHookToIsImplemented;
    mapping(address => address[]) private comptrollerProxyToFees;
    mapping(address => mapping(address => uint256))
        private comptrollerProxyToFeeToSharesOutstanding;

    constructor(address _fundDeployer) public FundDeployerOwnerMixin(_fundDeployer) {}

    // EXTERNAL FUNCTIONS

    /// @notice Activate already-configured fees for use in the calling fund
    function activateForFund(bool) external override {
        address vaultProxy = __setValidatedVaultProxy(msg.sender);

        address[] memory enabledFees = comptrollerProxyToFees[msg.sender];
        for (uint256 i; i < enabledFees.length; i++) {
            IFee(enabledFees[i]).activateForFund(msg.sender, vaultProxy);
        }
    }

    /// @notice Deactivate fees for a fund
    /// If we add a SellShares fee hook, this will need to be refactored to not delete those fees.
    /// @dev msg.sender is validated during __settleFeesForHook()
    function deactivateForFund() external override {
        // Settle continuous fees one last time
        __settleFeesForHook(msg.sender, IFeeManager.FeeHook.Continuous, "");

        // Force payout of remaining shares outstanding
        __forcePayoutAllSharesOutstanding(msg.sender);

        // Clean up storage
        __deleteFundStorage(msg.sender);
    }

    /// @notice Receives a dispatched `callOnExtension` from a fund's ComptrollerProxy
    /// @param _actionId An ID representing the desired action
    function receiveCallFromComptroller(
        address,
        uint256 _actionId,
        bytes calldata
    ) external override {
        // Dispatch the action
        if (_actionId == 0) {
            __settleContinuousFees();
        } else {
            revert("receiveCallFromComptroller: Invalid _actionId");
        }
    }

    /// @notice Enable and configure fees for use in the calling fund
    /// @param _configData Encoded config data
    /// @dev Caller is expected to be a valid ComptrollerProxy, but there isn't a need to validate.
    /// The order of `fees` determines the order in which fees of the same FeeHook will be applied.
    /// The recommended order is for static fees (e.g., a management fee) to be applied before
    /// dynamic fees (e.g., a performance fee).
    function setConfigForFund(bytes calldata _configData) external override {
        (address[] memory fees, bytes[] memory settingsData) = abi.decode(
            _configData,
            (address[], bytes[])
        );

        // Sanity checks
        require(
            fees.length == settingsData.length,
            "setConfigForFund: fees and settingsData array lengths unequal"
        );
        require(fees.isUniqueSet(), "setConfigForFund: fees cannot include duplicates");

        // Enable each fee with settings
        for (uint256 i; i < fees.length; i++) {
            require(isRegisteredFee(fees[i]), "setConfigForFund: Fee is not registered");

            // Set fund config on fee
            IFee(fees[i]).addFundSettings(msg.sender, settingsData[i]);

            // Enable fee for fund
            comptrollerProxyToFees[msg.sender].push(fees[i]);

            emit FeeEnabledForFund(msg.sender, fees[i], settingsData[i]);
        }
    }

    /// @notice Settles all fees for a particular FeeHook, paying out shares wherever possible.
    /// @param _hook The FeeHook for which to settle fees
    /// @param _settlementData The encoded settlement parameters specific to the FeeHook
    /// @dev msg.sender is validated during __settleFeesForHook()
    function settleFees(FeeHook _hook, bytes calldata _settlementData) external override {
        __settleFeesForHook(msg.sender, _hook, _settlementData);
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to destroy local storage to get gas refund,
    /// and to prevent further calls to fee manager
    function __deleteFundStorage(address _comptrollerProxy) private {
        delete comptrollerProxyToFees[_comptrollerProxy];
        delete comptrollerProxyToVaultProxy[_comptrollerProxy];
    }

    /// @dev Helper to force the payout of shares outstanding across all fees.
    /// For the current release, all shares in the VaultProxy are assumed to be
    /// shares outstanding from fees. If not, then they were sent there by mistake
    /// and are otherwise unrecoverable. We can therefore take the VaultProxy's
    /// shares balance as the totalSharesOutstanding to payout to the fund owner.
    function __forcePayoutAllSharesOutstanding(address _comptrollerProxy) private {
        address vaultProxy = comptrollerProxyToVaultProxy[_comptrollerProxy];

        uint256 totalSharesOutstanding = ERC20(vaultProxy).balanceOf(vaultProxy);
        if (totalSharesOutstanding == 0) {
            return;
        }

        // Destroy any shares outstanding storage
        address[] memory fees = comptrollerProxyToFees[_comptrollerProxy];
        for (uint256 i; i < fees.length; i++) {
            delete comptrollerProxyToFeeToSharesOutstanding[_comptrollerProxy][fees[i]];
        }

        // Distribute all shares outstanding to the fees recipient
        address payee = IVault(vaultProxy).getOwner();
        __transferShares(_comptrollerProxy, vaultProxy, payee, totalSharesOutstanding);

        emit AllSharesOutstandingForcePaidForFund(
            _comptrollerProxy,
            payee,
            totalSharesOutstanding
        );
    }

    /// @dev Helper to payout the shares outstanding for a given fee.
    /// Should be called after settlement has occurred.
    function __payoutSharesOutstandingForFee(
        address _comptrollerProxy,
        address _vaultProxy,
        address _fee
    ) private {
        if (!IFee(_fee).payout(_comptrollerProxy, _vaultProxy)) {
            return;
        }


            uint256 sharesOutstanding
         = comptrollerProxyToFeeToSharesOutstanding[_comptrollerProxy][_fee];
        if (sharesOutstanding == 0) {
            return;
        }

        // Delete shares outstanding and distribute from VaultProxy to the fees recipient
        comptrollerProxyToFeeToSharesOutstanding[_comptrollerProxy][_fee] = 0;
        address payee = IVault(_vaultProxy).getOwner();
        __transferShares(_comptrollerProxy, _vaultProxy, payee, sharesOutstanding);

        emit SharesOutstandingPaidForFund(_comptrollerProxy, _fee, payee, sharesOutstanding);
    }

    /// @dev Settles all "continuous" fees (e.g., ManagementFee and PerformanceFee),
    /// paying out shares whenever possible.
    /// Anyone can call this function, but must do so via the ComptrollerProxy.
    /// Useful in case there is little activity and a manager wants to cull fees.
    /// @dev msg.sender is validated during __settleFeesForHook()
    function __settleContinuousFees() private {
        __settleFeesForHook(msg.sender, IFeeManager.FeeHook.Continuous, "");
    }

    /// @dev Helper to settle a fee
    function __settleFee(
        address _comptrollerProxy,
        address _vaultProxy,
        address _fee,
        FeeHook _hook,
        bytes memory _settlementData
    ) private {
        (SettlementType settlementType, address payer, uint256 sharesDue) = IFee(_fee).settle(
            _comptrollerProxy,
            _vaultProxy,
            _hook,
            _settlementData
        );
        if (settlementType == SettlementType.None) {
            return;
        }

        address payee;
        if (settlementType == SettlementType.Direct) {
            payee = IVault(_vaultProxy).getOwner();
            __transferShares(_comptrollerProxy, payer, payee, sharesDue);
        } else if (settlementType == SettlementType.Mint) {
            __validateNonZeroSharesSupply(_vaultProxy);

            payee = IVault(_vaultProxy).getOwner();
            __mintShares(_comptrollerProxy, payee, sharesDue);
        } else if (settlementType == SettlementType.MintSharesOutstanding) {
            __validateNonZeroSharesSupply(_vaultProxy);

            comptrollerProxyToFeeToSharesOutstanding[_comptrollerProxy][_fee] = comptrollerProxyToFeeToSharesOutstanding[_comptrollerProxy][_fee]
                .add(sharesDue);

            payee = _vaultProxy;
            __mintShares(_comptrollerProxy, payee, sharesDue);
        } else if (settlementType == SettlementType.BurnSharesOutstanding) {

                uint256 sharesOutstandingBalance
             = comptrollerProxyToFeeToSharesOutstanding[_comptrollerProxy][_fee];
            if (sharesOutstandingBalance < sharesDue) {
                sharesDue = sharesOutstandingBalance;
            }

            comptrollerProxyToFeeToSharesOutstanding[_comptrollerProxy][_fee] = sharesOutstandingBalance
                .sub(sharesDue);

            payer = _vaultProxy;
            __burnShares(_comptrollerProxy, payer, sharesDue);
        } else {
            revert("__settleFee: Invalid SettlementType");
        }

        emit FeeSettledForFund(_comptrollerProxy, _fee, settlementType, payer, payee, sharesDue);
    }

    /// @dev Helper to settle and then payout shares outstanding for a each fee of a given FeeHook
    function __settleFeesForHook(
        address _comptrollerProxy,
        FeeHook _hook,
        bytes memory _settlementData
    ) private {
        // Since we validate and store the ComptrollerProxy-VaultProxy pairing during
        // activateForFund(), this function does not require further validation of the
        // sending ComptrollerProxy.
        // This check isn't strictly necessary, but it doesn't hurt,
        // and helps to preserve data integrity.
        address vaultProxy = comptrollerProxyToVaultProxy[_comptrollerProxy];
        require(vaultProxy != address(0), "__settleFeesForHook: Fund is not active");

        address[] memory fees = comptrollerProxyToFees[_comptrollerProxy];
        for (uint256 i; i < fees.length; i++) {
            if (!feeImplementsHook(fees[i], _hook)) {
                continue;
            }

            __settleFee(_comptrollerProxy, vaultProxy, fees[i], _hook, _settlementData);

            __payoutSharesOutstandingForFee(_comptrollerProxy, vaultProxy, fees[i]);
        }
    }

    /// @dev Helper to validate that the total supply of shares for a fund is not 0
    function __validateNonZeroSharesSupply(address _vaultProxy) private view {
        require(
            ERC20(_vaultProxy).totalSupply() > 0,
            "__validateNonZeroSharesSupply: Shares supply is 0"
        );
    }

    ///////////////////
    // FEES REGISTRY //
    ///////////////////

    /// @notice Remove fees from the list of registered fees
    /// @param _fees Addresses of fees to be deregistered
    function deregisterFees(address[] calldata _fees) external onlyFundDeployerOwner {
        require(_fees.length > 0, "deregisterFees: _fees cannot be empty");

        for (uint256 i; i < _fees.length; i++) {
            require(isRegisteredFee(_fees[i]), "deregisterFees: fee is not registered");

            registeredFees.remove(_fees[i]);

            emit FeeDeregistered(_fees[i], IFee(_fees[i]).identifier());
        }
    }

    /// @notice Add fees to the list of registered fees
    /// @param _fees Addresses of fees to be registered
    function registerFees(address[] calldata _fees) external onlyFundDeployerOwner {
        require(_fees.length > 0, "registerFees: _fees cannot be empty");

        for (uint256 i; i < _fees.length; i++) {
            require(!isRegisteredFee(_fees[i]), "registerFees: fee already registered");

            registeredFees.add(_fees[i]);

            // Store the hooks that a fee implements for later use.
            // Fronts the gas for calls to check if a hook is implemented, and guarantees
            // that the implementsHooks return value does not change post-registration.
            IFee feeContract = IFee(_fees[i]);
            FeeHook[] memory implementedHooks = feeContract.implementedHooks();
            for (uint256 j; j < implementedHooks.length; j++) {
                feeToHookToIsImplemented[_fees[i]][implementedHooks[j]] = true;
            }

            emit FeeRegistered(_fees[i], feeContract.identifier(), implementedHooks);
        }
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Get a list of enabled fees for a given fund
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @return enabledFees_ An array of enabled fee addresses
    function getEnabledFeesForFund(address _comptrollerProxy)
        external
        view
        returns (address[] memory enabledFees_)
    {
        return comptrollerProxyToFees[_comptrollerProxy];
    }

    /// @notice Get the amount of shares outstanding for a particular fee for a fund
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _fee The fee
    /// @return sharesOutstanding_ The amount of shares outstanding
    function getFeeSharesOutstandingForFund(address _comptrollerProxy, address _fee)
        external
        view
        returns (uint256 sharesOutstanding_)
    {
        return comptrollerProxyToFeeToSharesOutstanding[_comptrollerProxy][_fee];
    }

    /// @notice Get all registered fees
    /// @return registeredFees_ A list of all registered fee addresses
    function getRegisteredFees() external view returns (address[] memory registeredFees_) {
        registeredFees_ = new address[](registeredFees.length());
        for (uint256 i; i < registeredFees_.length; i++) {
            registeredFees_[i] = registeredFees.at(i);
        }

        return registeredFees_;
    }

    /// @notice Checks if a fee implements a particular hook
    /// @param _policy The address of the fee to check
    /// @param _hook The FeeHook to check
    /// @return implementsHook_ True if the fee implements the hook
    function feeImplementsHook(address _policy, FeeHook _hook)
        public
        view
        returns (bool implementsHook_)
    {
        return feeToHookToIsImplemented[_policy][_hook];
    }

    /// @notice Check whether a fee is registered
    /// @param _fee The address of the fee to check
    /// @return isRegisteredFee_ True if the fee is registered
    function isRegisteredFee(address _fee) public view returns (bool isRegisteredFee_) {
        return registeredFees.contains(_fee);
    }
}
