// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import {SafeMath} from "openzeppelin-solc-0.6/math/SafeMath.sol";
import {IERC20} from "../../external-interfaces/IERC20.sol";
import {IFundValueCalculator} from "../../persistent/fund-value-calculator/IFundValueCalculator.sol";
import {IComptroller} from "../core/fund/comptroller/IComptroller.sol";
import {IVault} from "../core/fund/vault/IVault.sol";
import {IFeeManager} from "../extensions/fee-manager/IFeeManager.sol";
import {IProtocolFeeTracker} from "../infrastructure/protocol-fees/IProtocolFeeTracker.sol";
import {IValueInterpreter} from "../infrastructure/value-interpreter/IValueInterpreter.sol";

/// @title FundValueCalculator Contract
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice A peripheral contract for serving fund value calculation requests from the FundValueCalculatorRouter
/// @dev These are convenience functions intended for off-chain consumption,
/// some of which involve potentially expensive state transitions.
contract FundValueCalculator is IFundValueCalculator {
    using SafeMath for uint256;

    // Protocol fee-related constants, taken from ProtocolFeeTracker.sol
    uint256 private constant MAX_BPS = 10000;
    uint256 private constant SECONDS_IN_YEAR = 31557600; // 60*60*24*365.25
    // Protocol fee-related constants, taken from ProtocolFeeReserveLib.sol
    uint256 private constant BUYBACK_DISCOUNT_DIVISOR = 2;

    // Shares-related constants
    uint256 private constant SHARES_UNIT = 10 ** 18;

    address private immutable FEE_MANAGER;
    address private immutable PROTOCOL_FEE_TRACKER;
    address private immutable VALUE_INTERPRETER;

    constructor(address _feeManager, address _protocolFeeTracker, address _valueInterpreter) public {
        FEE_MANAGER = _feeManager;
        PROTOCOL_FEE_TRACKER = _protocolFeeTracker;
        VALUE_INTERPRETER = _valueInterpreter;
    }

    // EXTERNAL FUNCTIONS

    /// @notice Calculates the GAV for a given fund, quoted in a given asset
    /// @param _vaultProxy The VaultProxy of the fund
    /// @param _quoteAsset The quote asset
    /// @return gav_ The GAV quoted in _quoteAsset
    function calcGavInAsset(address _vaultProxy, address _quoteAsset) external override returns (uint256 gav_) {
        (address denominationAsset, uint256 valueInDenominationAsset) = calcGav(_vaultProxy);

        return IValueInterpreter(getValueInterpreter()).calcCanonicalAssetValue(
            denominationAsset, valueInDenominationAsset, _quoteAsset
        );
    }

    /// @notice Calculates the gross value of one shares unit (10 ** 18) for a given fund, quoted in a given asset
    /// @param _vaultProxy The VaultProxy of the fund
    /// @param _quoteAsset The quote asset
    /// @return grossShareValue_ The gross share value quoted in _quoteAsset
    function calcGrossShareValueInAsset(address _vaultProxy, address _quoteAsset)
        external
        override
        returns (uint256 grossShareValue_)
    {
        (address denominationAsset, uint256 valueInDenominationAsset) = calcGrossShareValue(_vaultProxy);

        return IValueInterpreter(getValueInterpreter()).calcCanonicalAssetValue(
            denominationAsset, valueInDenominationAsset, _quoteAsset
        );
    }

    /// @notice Calculates the NAV for a given fund, quoted in a given asset
    /// @param _vaultProxy The VaultProxy of the fund
    /// @param _quoteAsset The quote asset
    /// @return nav_ The NAV quoted in _quoteAsset
    function calcNavInAsset(address _vaultProxy, address _quoteAsset) external override returns (uint256 nav_) {
        (address denominationAsset, uint256 valueInDenominationAsset) = calcNav(_vaultProxy);

        return IValueInterpreter(getValueInterpreter()).calcCanonicalAssetValue(
            denominationAsset, valueInDenominationAsset, _quoteAsset
        );
    }

    /// @notice Calculates the net value of one shares unit (10 ** 18) for a given fund, quoted in a given asset
    /// @param _vaultProxy The VaultProxy of the fund
    /// @param _quoteAsset The quote asset
    /// @return netShareValue_ The net share value quoted in _quoteAsset
    function calcNetShareValueInAsset(address _vaultProxy, address _quoteAsset)
        external
        override
        returns (uint256 netShareValue_)
    {
        (address denominationAsset, uint256 valueInDenominationAsset) = calcNetShareValue(_vaultProxy);

        return IValueInterpreter(getValueInterpreter()).calcCanonicalAssetValue(
            denominationAsset, valueInDenominationAsset, _quoteAsset
        );
    }

    /// @notice Calculates the net value of all shares held by a specified account, quoted in a given asset
    /// @param _vaultProxy The VaultProxy of the fund
    /// @param _sharesHolder The account holding shares
    /// @param _quoteAsset The quote asset
    /// @return netValue_ The net value of all shares held by _sharesHolder quoted in _quoteAsset
    function calcNetValueForSharesHolderInAsset(address _vaultProxy, address _sharesHolder, address _quoteAsset)
        external
        override
        returns (uint256 netValue_)
    {
        (address denominationAsset, uint256 valueInDenominationAsset) =
            calcNetValueForSharesHolder(_vaultProxy, _sharesHolder);

        return IValueInterpreter(getValueInterpreter()).calcCanonicalAssetValue(
            denominationAsset, valueInDenominationAsset, _quoteAsset
        );
    }

    // PUBLIC FUNCTIONS

    /// @notice Calculates the GAV for a given fund
    /// @param _vaultProxy The VaultProxy of the fund
    /// @return denominationAsset_ The denomination asset of the fund
    /// @return gav_ The GAV quoted in the denomination asset
    function calcGav(address _vaultProxy) public override returns (address denominationAsset_, uint256 gav_) {
        IComptroller comptrollerProxyContract = __getComptrollerProxyForVault(_vaultProxy);

        return (comptrollerProxyContract.getDenominationAsset(), comptrollerProxyContract.calcGav());
    }

    /// @notice Calculates the gross value of one shares unit (10 ** 18) for a given fund
    /// @param _vaultProxy The VaultProxy of the fund
    /// @return denominationAsset_ The denomination asset of the fund
    /// @return grossShareValue_ The gross share value quoted in the denomination asset
    function calcGrossShareValue(address _vaultProxy)
        public
        override
        returns (address denominationAsset_, uint256 grossShareValue_)
    {
        IComptroller comptrollerProxyContract = __getComptrollerProxyForVault(_vaultProxy);

        return (comptrollerProxyContract.getDenominationAsset(), comptrollerProxyContract.calcGrossShareValue());
    }

    /// @notice Calculates the NAV for a given fund
    /// @param _vaultProxy The VaultProxy of the fund
    /// @return denominationAsset_ The denomination asset of the fund
    /// @return nav_ The NAV quoted in the denomination asset
    /// @dev This value should only be consumed from off-chain,
    /// as the NAV is only valid for the shares quantity prior to the settlement of fees,
    /// and this function actually settles fund-level fees, so the NAV would no longer be valid
    function calcNav(address _vaultProxy) public override returns (address denominationAsset_, uint256 nav_) {
        uint256 preSharesSupply = IERC20(_vaultProxy).totalSupply();

        uint256 netShareValue;
        (denominationAsset_, netShareValue) = calcNetShareValue(_vaultProxy);

        nav_ = preSharesSupply.mul(netShareValue).div(SHARES_UNIT);

        return (denominationAsset_, nav_);
    }

    /// @notice Calculates the net value of one shares unit (10 ** 18) for a given fund
    /// @param _vaultProxy The VaultProxy of the fund
    /// @return denominationAsset_ The denomination asset of the fund
    /// @return netShareValue_ The net share value quoted in the denomination asset
    function calcNetShareValue(address _vaultProxy)
        public
        override
        returns (address denominationAsset_, uint256 netShareValue_)
    {
        IComptroller comptrollerProxyContract = __getComptrollerProxyForVault(_vaultProxy);

        // Settle Continuous fees
        comptrollerProxyContract.callOnExtension(getFeeManager(), 0, "");

        // Calculate protocol fee shares due
        uint256 protocolFeeSharesDue = calcProtocolFeeDueForFund(_vaultProxy);

        denominationAsset_ = comptrollerProxyContract.getDenominationAsset();
        netShareValue_ = __calcShareValue(
            denominationAsset_,
            comptrollerProxyContract.calcGav(),
            IERC20(_vaultProxy).totalSupply().add(protocolFeeSharesDue)
        );

        return (denominationAsset_, netShareValue_);
    }

    /// @notice Calculates the net value of all shares held by a specified account
    /// @param _vaultProxy The VaultProxy of the fund
    /// @param _sharesHolder The account holding shares
    /// @return denominationAsset_ The denomination asset of the fund
    /// @return netValue_ The net value of all shares held by _sharesHolder
    function calcNetValueForSharesHolder(address _vaultProxy, address _sharesHolder)
        public
        override
        returns (address denominationAsset_, uint256 netValue_)
    {
        // Does not account for any new shares accrued to the _sharesHolder during calcs
        uint256 sharesHolderBalance = IERC20(_vaultProxy).balanceOf(_sharesHolder);

        uint256 netShareValue;
        (denominationAsset_, netShareValue) = calcNetShareValue(_vaultProxy);

        netValue_ = sharesHolderBalance.mul(netShareValue).div(SHARES_UNIT);

        return (denominationAsset_, netValue_);
    }

    /// @notice Calculates the protocol fee shares currently due for a given fund
    /// @param _vaultProxy The VaultProxy of the fund
    /// @return sharesDue_ The protocol fee shares due
    /// @dev Mostly copy-paste from ProtocolFeeTracker.payFee() and its helpers.
    /// Includes the 50% buyback discount.
    function calcProtocolFeeDueForFund(address _vaultProxy) public view returns (uint256 sharesDue_) {
        // 1. Calc seconds since last payment
        uint256 lastPaid = IProtocolFeeTracker(getProtocolFeeTracker()).getLastPaidForVault(_vaultProxy);
        if (lastPaid >= block.timestamp || lastPaid == 0) {
            return 0;
        }

        uint256 secondsDue = block.timestamp.sub(lastPaid);

        // 2. Calc shares due as a proportion of annualized fee bps
        uint256 sharesSupply = IERC20(_vaultProxy).totalSupply();

        uint256 rawSharesDue = sharesSupply.mul(
            IProtocolFeeTracker(getProtocolFeeTracker()).getFeeBpsForVault(_vaultProxy)
        ).mul(secondsDue).div(SECONDS_IN_YEAR).div(MAX_BPS);

        uint256 supplyNetRawSharesDue = sharesSupply.sub(rawSharesDue);
        if (supplyNetRawSharesDue == 0) {
            return 0;
        }

        return rawSharesDue.mul(sharesSupply).div(supplyNetRawSharesDue).div(BUYBACK_DISCOUNT_DIVISOR);
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper for calculating the share value
    function __calcShareValue(address _denominationAsset, uint256 _assetsValue, uint256 _sharesSupply)
        private
        view
        returns (uint256 shareValue_)
    {
        if (_sharesSupply == 0) {
            return 10 ** uint256(IERC20(_denominationAsset).decimals());
        }

        return _assetsValue.mul(SHARES_UNIT).div(_sharesSupply);
    }

    /// @dev Helper to get the ComptrollerProxy for a given VaultProxy
    function __getComptrollerProxyForVault(address _vaultProxy)
        private
        view
        returns (IComptroller comptrollerProxyContract_)
    {
        return IComptroller(IVault(_vaultProxy).getAccessor());
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `FEE_MANAGER` variable
    /// @return feeManager_ The `FEE_MANAGER` variable value
    function getFeeManager() public view returns (address feeManager_) {
        return FEE_MANAGER;
    }

    /// @notice Gets the `PROTOCOL_FEE_TRACKER` variable
    /// @return protocolFeeTracker_ The `PROTOCOL_FEE_TRACKER` variable value
    function getProtocolFeeTracker() public view returns (address protocolFeeTracker_) {
        return PROTOCOL_FEE_TRACKER;
    }

    /// @notice Gets the `VALUE_INTERPRETER` variable
    /// @return valueInterpreter_ The `VALUE_INTERPRETER` variable value
    function getValueInterpreter() public view returns (address valueInterpreter_) {
        return VALUE_INTERPRETER;
    }
}
