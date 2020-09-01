// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "../hub/Spoke.sol";
import "./IFee.sol";
import "./IFeeManager.sol";

/// @title FeeManager Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Manages and allocates fees for a particular fund
contract FeeManager is IFeeManager, Spoke {
    using EnumerableSet for EnumerableSet.AddressSet;
    using SafeMath for uint256;

    event FeeEnabled(address indexed fee, bytes encodedSettings);

    event FeeSettled(
        address indexed fee,
        address indexed payer,
        address indexed payee,
        uint256 sharesDue
    );

    event FeeSharesOutstandingPaid(
        address indexed fee,
        address indexed payer,
        address indexed payee,
        uint256 sharesDue
    );

    EnumerableSet.AddressSet private enabledFees;

    constructor(address _hub) public Spoke(_hub) {}

    // EXTERNAL FUNCTIONS

    /// @notice Enable fees for use in the fund
    /// @param _fees The fees to enable
    /// @param _encodedSettings The encoded settings with which a fund uses fees
    function enableFees(address[] calldata _fees, bytes[] calldata _encodedSettings)
        external
        override
        onlyFundFactory
    {
        // Sanity check
        require(_fees.length > 0, "enableFees: _fees cannot be empty");
        require(_fees.length == _encodedSettings.length, "enableFees: array lengths unequal");

        IRegistry registry = __getRegistry();
        for (uint256 i = 0; i < _fees.length; i++) {
            IFee fee = IFee(_fees[i]);
            require(registry.feeIsRegistered(address(fee)), "enableFees: Fee is not on Registry");
            require(!feeIsEnabled(address(fee)), "enableFees: Fee is already enabled");

            // Set fund config on fee
            fee.addFundSettings(_encodedSettings[i]);

            // Add fee
            EnumerableSet.add(enabledFees, address(fee));

            emit FeeEnabled(address(fee), _encodedSettings[i]);
        }
    }

    /// @notice Settles all "continuous" fees (e.g., ManagementFee and PerformanceFee),
    /// paying out shares wherever possible.
    /// @dev Anyone can call this function. Useful in case there is little activity
    /// and a manager wants to cull fees.
    function settleContinuousFees() external onlyActiveFund {
        __settleAndPayoutFeesForHook(IFeeManager.FeeHook.Continuous, "");
    }

    /// @notice Settles all fees for a particular FeeHook, paying out shares wherever possible.
    /// @param _hook The FeeHook for which to settle fees
    /// @param _encodedFeeArgs The encoded parameters specific to the FeeHook
    /// @dev Only Shares can call this function (because it takes fee args)
    function settleFees(FeeHook _hook, bytes calldata _encodedFeeArgs)
        external
        override
        onlyActiveFund
        onlyShares
    {
        __settleAndPayoutFeesForHook(_hook, _encodedFeeArgs);
    }

    // PUBLIC FUNCTIONS

    /// @notice Get a list of enabled fees
    /// @return An array of enabled fee addresses
    function getEnabledFees() public view returns (address[] memory) {
        uint256 length = enabledFees.length();
        address[] memory output_ = new address[](length);
        for (uint256 i = 0; i < length; i++) {
            output_[i] = enabledFees.at(i);
        }
        return output_;
    }

    /// @notice Check if a fee is enabled for the fund
    /// @param _fee The fee address
    /// @return True if the fee is enabled
    function feeIsEnabled(address _fee) public view returns (bool) {
        return EnumerableSet.contains(enabledFees, _fee);
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to distribute shares due, either by minting new shares, burning old shares,
    /// or redistributing shares. Note that each individual fee indicates if it meant
    /// to be inflationary, or a direct P2P payment. This means that fees must be very careful in
    /// specifying their payer and payee.
    /// _payer of Shares contract indicates an inflationary fee.
    /// _payee of Shares contract indicates an amount to be burned from the _payer.
    function __distributeSharesDue(
        address _payer,
        address _payee,
        uint256 _sharesDue
    ) private {
        if (_sharesDue == 0 || _payer == _payee) {
            return;
        }

        IShares shares = __getShares();
        if (_payee == address(shares)) {
            // Case 1: Burn shares from payer; e.g., shares outstanding burned
            shares.burn(_payer, _sharesDue);
        } else if (_payer == address(shares)) {
            // Case 2: Mint new shares to payee
            shares.mint(_payee, _sharesDue);
        } else {
            // Case 3: Transfer shares from payer to payee via burn+mint
            shares.burn(_payer, _sharesDue);
            shares.mint(_payee, _sharesDue);
        }
    }

    /// @dev Helper to pay the shares outstanding for a given fee.
    /// Should be called after settlement has occurred.
    function __payoutFeeSharesOutstanding(address _fee) private {
        (address payer, address payee, uint256 sharesDue) = IFee(_fee).payoutSharesOutstanding();
        if (sharesDue == 0) {
            return;
        }

        __distributeSharesDue(payer, payee, sharesDue);

        emit FeeSharesOutstandingPaid(_fee, payer, payee, sharesDue);
    }

    /// @dev Helper to settle a fee
    function __settleFee(address _fee, bytes memory _encodedFeeArgs) private {
        (address payer, address payee, uint256 sharesDue) = IFee(_fee).settle(_encodedFeeArgs);
        if (sharesDue == 0) {
            return;
        }

        __distributeSharesDue(payer, payee, sharesDue);

        emit FeeSettled(_fee, payer, payee, sharesDue);
    }

    /// @dev Helper to settle and then payout shares outstanding for a each fee of a given FeeHook
    function __settleAndPayoutFeesForHook(FeeHook _hook, bytes memory _encodedFeeArgs) private {
        address[] memory fees = getEnabledFees();
        for (uint256 i = 0; i < fees.length; i++) {
            if (IFee(fees[i]).feeHook() != _hook) {
                continue;
            }
            __settleFee(fees[i], _encodedFeeArgs);

            // Always attempt to payout shares outstanding as soon as they are payable
            __payoutFeeSharesOutstanding(fees[i]);
        }
    }
}

contract FeeManagerFactory {
    function createInstance(address _hub) external returns (address) {
        return address(new FeeManager(_hub));
    }
}
