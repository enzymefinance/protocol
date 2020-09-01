// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "../../core/fund/comptroller/IComptroller.sol";
import "../../core/fund-deployer/utils/FundDeployerOwnable.sol";
import "../../utils/AddressArrayLib.sol";
import "./IFee.sol";
import "./IFeeManager.sol";

/// @title FeeManager Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Manages fees for funds
contract FeeManager is IFeeManager, FundDeployerOwnable {
    // TODO: add in active fund only flag for settling fees

    using AddressArrayLib for address[];
    using EnumerableSet for EnumerableSet.AddressSet;
    using SafeMath for uint256;

    event FeeRegistered(address indexed fee, string indexed identifier);

    event FeeDeregistered(address indexed fee, string indexed identifier);

    event FeeEnabledForFund(
        address indexed comptrollerProxy,
        address indexed fee,
        bytes settingsData
    );

    event FeeSettledForFund(
        address indexed comptrollerProxy,
        address indexed fee,
        address payer,
        address payee,
        uint256 sharesDue
    );

    event FeeSharesOutstandingPaidForFund(
        address indexed comptrollerProxy,
        address indexed fee,
        address payer,
        address payee,
        uint256 sharesDue
    );

    EnumerableSet.AddressSet internal registeredFees;
    mapping(address => EnumerableSet.AddressSet) internal comptrollerProxyToFees;

    constructor(address _fundDeployer) public FundDeployerOwnable(_fundDeployer) {}

    // EXTERNAL FUNCTIONS

    /// @notice Enable fees for use in the fund
    /// @param _configData Encoded config data
    function setFundConfig(bytes calldata _configData) external override {
        (address[] memory fees, bytes[] memory settingsData) = abi.decode(
            _configData,
            (address[], bytes[])
        );
        if (fees.length == 0) {
            return;
        }

        // Sanity check
        require(fees.length > 0, "enableFees: fees cannot be empty");
        require(
            fees.length == settingsData.length,
            "enableFees: fees and settingsData array lengths unequal"
        );
        require(fees.isUniqueSet(), "setFundConfig: fees cannot include duplicates");

        // Enable each fee with settings
        address comptrollerProxy = msg.sender;
        for (uint256 i = 0; i < fees.length; i++) {
            require(feeIsRegistered(fees[i]), "setFundConfig: Fee is not registered");

            // Set fund config on fee
            IFee(fees[i]).addFundSettings(comptrollerProxy, settingsData[i]);

            // Add fee
            comptrollerProxyToFees[comptrollerProxy].add(fees[i]);

            emit FeeEnabledForFund(comptrollerProxy, fees[i], settingsData[i]);
        }
    }

    /// @notice Settles all "continuous" fees (e.g., ManagementFee and PerformanceFee),
    /// paying out shares wherever possible.
    /// @dev Anyone can call this function. Useful in case there is little activity
    /// and a manager wants to cull fees.
    function settleContinuousFees(address _comptrollerProxy) external {
        __settleAndPayoutFeesForHook(_comptrollerProxy, IFeeManager.FeeHook.Continuous, "");
    }

    /// @notice Settles all fees for a particular FeeHook, paying out shares wherever possible.
    /// @param _hook The FeeHook for which to settle fees
    /// @param _settlementData The encoded settlement parameters specific to the FeeHook
    /// @dev Only Shares can call this function (because it takes fee args)
    function settleFees(FeeHook _hook, bytes calldata _settlementData) external override {
        __settleAndPayoutFeesForHook(msg.sender, _hook, _settlementData);
    }

    // PUBLIC FUNCTIONS

    /// @notice Get a list of enabled fees for a given fund
    /// @return enabledFees_ An array of enabled fee addresses
    function getFeesForFund(address _comptrollerProxy)
        public
        view
        returns (address[] memory enabledFees_)
    {
        enabledFees_ = new address[](comptrollerProxyToFees[_comptrollerProxy].length());
        for (uint256 i = 0; i < enabledFees_.length; i++) {
            enabledFees_[i] = comptrollerProxyToFees[_comptrollerProxy].at(i);
        }
    }

    /// @notice Check if a fee is enabled for the fund
    /// @param _fee The fee address
    /// @return True if the fee is enabled
    function feeIsEnabledForFund(address _comptrollerProxy, address _fee)
        external
        view
        returns (bool)
    {
        return comptrollerProxyToFees[_comptrollerProxy].contains(_fee);
    }

    // PRIVATE FUNCTIONS

    function __burnShares(
        address _comptrollerProxy,
        address _target,
        uint256 _amount
    ) private {
        IComptroller(_comptrollerProxy).burnShares(_target, _amount);
    }

    /// @dev Helper to distribute shares due, either by minting new shares, burning old shares,
    /// or redistributing shares. Note that each individual fee indicates if it meant
    /// to be inflationary, or a direct P2P payment. This means that fees must be very careful in
    /// specifying their payer and payee.
    /// _payer of ComptrollerProxy contract indicates an inflationary fee.
    /// _payee of ComptrollerProxy contract indicates an amount to be burned from the _payer.
    function __distributeSharesDue(
        address _comptrollerProxy,
        address _payer,
        address _payee,
        uint256 _sharesDue
    ) private {
        if (_sharesDue == 0 || _payer == _payee) {
            return;
        }

        if (_payee == _comptrollerProxy) {
            // Case 1: Burn shares from payer; e.g., shares outstanding burned
            __burnShares(_comptrollerProxy, _payer, _sharesDue);
        } else if (_payer == _comptrollerProxy) {
            // Case 2: Mint new shares to payee
            __mintShares(_comptrollerProxy, _payee, _sharesDue);
        } else {
            // Case 3: Transfer shares from payer to payee via burn+mint
            __burnShares(_comptrollerProxy, _payer, _sharesDue);
            __mintShares(_comptrollerProxy, _payee, _sharesDue);
        }
    }

    function __mintShares(
        address _comptrollerProxy,
        address _target,
        uint256 _amount
    ) private {
        IComptroller(_comptrollerProxy).mintShares(_target, _amount);
    }

    /// @dev Helper to pay the shares outstanding for a given fee.
    /// Should be called after settlement has occurred.
    function __payoutFeeSharesOutstanding(address _comptrollerProxy, address _fee) private {
        (address payer, address payee, uint256 sharesDue) = IFee(_fee).payoutSharesOutstanding(
            _comptrollerProxy
        );
        if (sharesDue == 0) {
            return;
        }

        __distributeSharesDue(_comptrollerProxy, payer, payee, sharesDue);

        emit FeeSharesOutstandingPaidForFund(_comptrollerProxy, _fee, payer, payee, sharesDue);
    }

    /// @dev Helper to settle a fee
    function __settleFee(
        address _comptrollerProxy,
        address _fee,
        bytes memory _settlementData
    ) private {
        (address payer, address payee, uint256 sharesDue) = IFee(_fee).settle(
            _comptrollerProxy,
            _settlementData
        );
        if (sharesDue == 0) {
            return;
        }

        __distributeSharesDue(_comptrollerProxy, payer, payee, sharesDue);

        emit FeeSettledForFund(_comptrollerProxy, _fee, payer, payee, sharesDue);
    }

    /// @dev Helper to settle and then payout shares outstanding for a each fee of a given FeeHook
    function __settleAndPayoutFeesForHook(
        address _comptrollerProxy,
        FeeHook _hook,
        bytes memory _settlementData
    ) private {
        address[] memory fees = getFeesForFund(_comptrollerProxy);
        for (uint256 i = 0; i < fees.length; i++) {
            if (IFee(fees[i]).feeHook() != _hook) {
                continue;
            }
            __settleFee(_comptrollerProxy, fees[i], _settlementData);

            // Always attempt to payout shares outstanding as soon as they are payable
            __payoutFeeSharesOutstanding(_comptrollerProxy, fees[i]);
        }
    }

    ///////////////////
    // FEES REGISTRY //
    ///////////////////

    /// @notice Remove a fee from the list of registered fees
    /// @param _fee The address of the fee to remove
    function deregisterFee(address _fee) external onlyFundDeployerOwner {
        require(feeIsRegistered(_fee), "deregisterFee: _fee is not registered");

        registeredFees.remove(_fee);

        emit FeeDeregistered(_fee, IFee(_fee).identifier());
    }

    /// @notice Add a fee to the Registry
    /// @param _fee Address of fee to be registered
    function registerFee(address _fee) external onlyFundDeployerOwner {
        require(!feeIsRegistered(_fee), "registerFee: _fee already registered");

        IFee fee = IFee(_fee);
        require(fee.feeHook() != FeeHook.None, "registerFee: FeeHook must be defined in the fee");

        // Plugins should only have their latest version registered
        string memory identifier = fee.identifier();
        require(
            bytes(identifier).length != 0,
            "registerFee: Identifier must be defined in the fee"
        );

        registeredFees.add(_fee);

        emit FeeRegistered(_fee, identifier);
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Check whether a fee is registered
    /// @param _fee The address of the fee to check
    /// @return True if the fee is registered
    function feeIsRegistered(address _fee) public view returns (bool) {
        return registeredFees.contains(_fee);
    }

    /// @notice Get all registered fees
    /// @return registeredFeesArray_ A list of all registered fee addresses
    function getRegisteredFees() external view returns (address[] memory registeredFeesArray_) {
        registeredFeesArray_ = new address[](registeredFees.length());
        for (uint256 i = 0; i < registeredFeesArray_.length; i++) {
            registeredFeesArray_[i] = registeredFees.at(i);
        }
    }
}
