// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "../../core/fund/comptroller/IComptroller.sol";
import "../../core/fund/vault/IVault.sol";
import "../../utils/AddressArrayLib.sol";
import "../utils/ExtensionBase.sol";
import "../utils/FundDeployerOwnerMixin.sol";
import "./IFee.sol";
import "./IFeeManager.sol";

/// @title FeeManager Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Manages fees for funds
contract FeeManager is IFeeManager, ExtensionBase, FundDeployerOwnerMixin {
    // TODO: calling `payout` on fees that don't defer shares is wasteful; consider storing locally?

    using AddressArrayLib for address[];
    using EnumerableSet for EnumerableSet.AddressSet;
    using SafeMath for uint256;

    event FeeDeregistered(address indexed fee, string indexed identifier);

    event FeeEnabledForFund(
        address indexed comptrollerProxy,
        address indexed fee,
        bytes settingsData
    );

    event FeeRegistered(address indexed fee, string indexed identifier);

    // TODO: need payer and payee?
    event FeeSettledForFund(
        address indexed comptrollerProxy,
        address indexed fee,
        SettlementType settlementType,
        uint256 sharesDue
    );

    event AllSharesOutstandingForcePaid(
        address indexed comptrollerProxy,
        address payee,
        uint256 sharesDue
    );

    event SharesOutstandingPaidForFee(
        address indexed comptrollerProxy,
        address indexed fee,
        address payee,
        uint256 sharesDue
    );

    event FeesRecipientSet(
        address indexed comptrollerProxy,
        address prevFeesRecipient,
        address nextFeesRecipient
    );

    EnumerableSet.AddressSet private registeredFees;
    mapping(address => address[]) private comptrollerProxyToFees;
    mapping(address => address) private comptrollerProxyToFeesRecipient;

    constructor(address _fundDeployer) public FundDeployerOwnerMixin(_fundDeployer) {}

    // EXTERNAL FUNCTIONS

    /// @notice Initialize already configured fees for use in the calling fund
    /// @dev Caller is expected to be a valid ComptrollerProxy, but there isn't a need to validate.
    function activateForFund() external override {
        address[] memory enabledFees = comptrollerProxyToFees[msg.sender];
        for (uint256 i; i < enabledFees.length; i++) {
            IFee(enabledFees[i]).activateForFund(msg.sender);
        }
    }

    /// @notice Deactivate fees for a fund that is shutdown
    /// @dev Caller is expected to be a valid ComptrollerProxy, but there isn't a need to validate.
    /// If we add a SellShares fee hook, this will need to be refactored to not delete those fees.
    function deactivateForFund() external override {
        address comptrollerProxy = msg.sender;

        // Settle continuous fees one last time
        __settleFeesForHook(comptrollerProxy, IFeeManager.FeeHook.Continuous, "", false);

        // Force payout of remaining shares outstanding
        __forcePayoutAllSharesOutstanding(comptrollerProxy);

        // Clean up storage
        __deleteFundStorage(comptrollerProxy);
    }

    /// @notice Enable and configure fees for use in the calling fund
    /// @param _configData Encoded config data
    /// @dev Caller is expected to be a valid ComptrollerProxy, but there isn't a need to validate.
    /// The order of `fees` determines the order in which fees of the same FeeHook will be applied.
    /// The recommended order is for static fees (e.g., a management fee) to be applied before
    /// dynamic fees (e.g., a performance fee).
    function setConfigForFund(bytes calldata _configData) external override {
        address comptrollerProxy = msg.sender;

        (address[] memory fees, bytes[] memory settingsData) = abi.decode(
            _configData,
            (address[], bytes[])
        );

        // Sanity check
        require(
            fees.length == settingsData.length,
            "enableFees: fees and settingsData array lengths unequal"
        );
        require(fees.isUniqueSet(), "setFundConfig: fees cannot include duplicates");

        // Set the fund owner as the fees recipient
        __setFeesRecipient(
            comptrollerProxy,
            IVault(IComptroller(comptrollerProxy).getVaultProxy()).getOwner()
        );

        // Enable each fee with settings
        for (uint256 i; i < fees.length; i++) {
            require(isRegisteredFee(fees[i]), "setFundConfig: Fee is not registered");

            // Set fund config on fee
            IFee(fees[i]).addFundSettings(comptrollerProxy, settingsData[i]);

            // Add fee
            comptrollerProxyToFees[comptrollerProxy].push(fees[i]);

            emit FeeEnabledForFund(comptrollerProxy, fees[i], settingsData[i]);
        }
    }

    /// @notice Settles all "continuous" fees (e.g., ManagementFee and PerformanceFee),
    /// paying out shares wherever possible.
    /// @dev Anyone can call this function, but must do so via the ComptrollerProxy.
    /// Useful in case there is little activity and a manager wants to cull fees.
    function settleContinuousFees(address, bytes calldata) external {
        __settleFeesForHook(msg.sender, IFeeManager.FeeHook.Continuous, "", true);
    }

    /// @notice Settles all fees for a particular FeeHook, paying out shares wherever possible.
    /// @param _hook The FeeHook for which to settle fees
    /// @param _settlementData The encoded settlement parameters specific to the FeeHook
    /// @dev Caller is expected to be a valid ComptrollerProxy, but there isn't a need to validate.
    function settleFees(FeeHook _hook, bytes calldata _settlementData) external override {
        __settleFeesForHook(msg.sender, _hook, _settlementData, true);
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to burn shares by calling back to the ComptrollerProxy
    function __burnShares(
        address _comptrollerProxy,
        address _target,
        uint256 _amount
    ) private {
        IComptroller(_comptrollerProxy).burnShares(_target, _amount);
    }

    /// @dev Helper to destroy local storage to get gas refund and prevent further calls to fee manager.
    // TODO: destroy storage on fees to get gas refund
    function __deleteFundStorage(address _comptrollerProxy) private {
        delete comptrollerProxyToFees[_comptrollerProxy];
        delete comptrollerProxyToFeesRecipient[_comptrollerProxy];
    }

    function __forcePayoutAllSharesOutstanding(address _comptrollerProxy) private {
        address vaultProxy = IComptroller(_comptrollerProxy).getVaultProxy();
        uint256 sharesOutstanding = IERC20(vaultProxy).balanceOf(vaultProxy);
        if (sharesOutstanding == 0) {
            return;
        }

        // Distribute all shares outstanding to the fees recipient
        address payee = comptrollerProxyToFeesRecipient[_comptrollerProxy];
        __burnShares(_comptrollerProxy, vaultProxy, sharesOutstanding);
        __mintShares(_comptrollerProxy, payee, sharesOutstanding);

        emit AllSharesOutstandingForcePaid(_comptrollerProxy, payee, sharesOutstanding);
    }

    /// @dev Helper to mint shares by calling back to the ComptrollerProxy
    function __mintShares(
        address _comptrollerProxy,
        address _target,
        uint256 _amount
    ) private {
        IComptroller(_comptrollerProxy).mintShares(_target, _amount);
    }

    /// @dev Helper to pay the shares outstanding for a given fee.
    /// Should be called after settlement has occurred.
    /// Assumes the payee to be the fund manager and the shares outstanding to be
    /// the entire balance of the Vault. This will change in upcoming releases, but
    /// we don't need to accommodate multiple fees or extensions with shares outstanding for now.
    function __payoutSharesOutstandingForFee(address _comptrollerProxy, address _fee) private {
        if (!IFee(_fee).payout(_comptrollerProxy)) {
            return;
        }

        address vaultProxy = IComptroller(_comptrollerProxy).getVaultProxy();
        uint256 sharesOutstanding = IERC20(vaultProxy).balanceOf(vaultProxy);
        if (sharesOutstanding == 0) {
            return;
        }

        // Distribute shares from VaultProxy to the fees recipient
        address payee = comptrollerProxyToFeesRecipient[_comptrollerProxy];
        __burnShares(_comptrollerProxy, vaultProxy, sharesOutstanding);
        __mintShares(_comptrollerProxy, payee, sharesOutstanding);

        emit SharesOutstandingPaidForFee(_comptrollerProxy, _fee, payee, sharesOutstanding);
    }

    // TODO: expose an external setter for this?
    function __setFeesRecipient(address _comptrollerProxy, address _nextFeesRecipient) private {
        address prevRecipient = comptrollerProxyToFeesRecipient[_comptrollerProxy];
        require(
            prevRecipient != _nextFeesRecipient,
            "__setFeesRecipient: _nextFeesRecipient is already the current value"
        );
        comptrollerProxyToFeesRecipient[_comptrollerProxy] = _nextFeesRecipient;

        emit FeesRecipientSet(_comptrollerProxy, prevRecipient, _nextFeesRecipient);
    }

    /// @dev Helper to settle a fee
    function __settleFee(
        address _comptrollerProxy,
        address _fee,
        bytes memory _settlementData
    ) private {
        (SettlementType settlementType, address payer, uint256 sharesDue) = IFee(_fee).settle(
            _comptrollerProxy,
            _settlementData
        );

        if (settlementType == SettlementType.Direct) {
            __burnShares(_comptrollerProxy, payer, sharesDue);
            __mintShares(
                _comptrollerProxy,
                comptrollerProxyToFeesRecipient[_comptrollerProxy],
                sharesDue
            );
        } else if (settlementType == SettlementType.Mint) {
            __mintShares(
                _comptrollerProxy,
                comptrollerProxyToFeesRecipient[_comptrollerProxy],
                sharesDue
            );
        } else if (settlementType == SettlementType.MintSharesOutstanding) {
            __mintShares(
                _comptrollerProxy,
                IComptroller(_comptrollerProxy).getVaultProxy(),
                sharesDue
            );
        } else if (settlementType == SettlementType.BurnSharesOutstanding) {
            address vaultProxy = IComptroller(_comptrollerProxy).getVaultProxy();
            uint256 sharesOutstandingBalance = IERC20(vaultProxy).balanceOf(vaultProxy);
            if (sharesOutstandingBalance < sharesDue) {
                sharesDue = sharesOutstandingBalance;
            }
            __burnShares(_comptrollerProxy, vaultProxy, sharesDue);
        }
        // TODO: revert if the type doesn't match an option?
        // TODO: should it be FeeManager's responsibility to not mint shares if shares supply is 0?

        emit FeeSettledForFund(_comptrollerProxy, _fee, settlementType, sharesDue);
    }

    /// @dev Helper to settle and then payout shares outstanding for a each fee of a given FeeHook
    function __settleFeesForHook(
        address _comptrollerProxy,
        FeeHook _hook,
        bytes memory _settlementData,
        bool _attemptPayout
    ) private {
        address[] memory fees = comptrollerProxyToFees[_comptrollerProxy];
        for (uint256 i; i < fees.length; i++) {
            if (IFee(fees[i]).feeHook() != _hook) {
                continue;
            }
            __settleFee(_comptrollerProxy, fees[i], _settlementData);

            if (_attemptPayout) {
                __payoutSharesOutstandingForFee(_comptrollerProxy, fees[i]);
            }
        }
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

            emit FeeRegistered(_fees[i], IFee(_fees[i]).identifier());
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

    /// @notice Get all registered fees
    /// @return registeredFees_ A list of all registered fee addresses
    function getFeesRecipientForFund(address _comptrollerProxy) external view returns (address) {
        return comptrollerProxyToFeesRecipient[_comptrollerProxy];
    }

    /// @notice Get all registered fees
    /// @return registeredFees_ A list of all registered fee addresses
    function getRegisteredFees() external view returns (address[] memory registeredFees_) {
        registeredFees_ = new address[](registeredFees.length());
        for (uint256 i; i < registeredFees_.length; i++) {
            registeredFees_[i] = registeredFees.at(i);
        }
    }

    /// @notice Check whether a fee is registered
    /// @param _fee The address of the fee to check
    /// @return isRegisteredFee_ True if the fee is registered
    function isRegisteredFee(address _fee) public view returns (bool isRegisteredFee_) {
        return registeredFees.contains(_fee);
    }
}
