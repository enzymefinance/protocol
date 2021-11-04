// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../../persistent/off-chain/fund-value-calculator/IFundValueCalculator.sol";
import "../core/fund/comptroller/ComptrollerLib.sol";
import "../core/fund/vault/VaultLib.sol";
import "../extensions/fee-manager/FeeManager.sol";
import "../infrastructure/value-interpreter/ValueInterpreter.sol";

/// @title FundValueCalculator Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A peripheral contract for serving fund value calculation requests from the FundValueCalculatorRouter
/// @dev These are convenience functions intended for off-chain consumption,
/// some of which involve potentially expensive state transitions
contract FundValueCalculator is IFundValueCalculator {
    using SafeMath for uint256;

    // Shares-related constants
    uint256 private constant SHARES_UNIT = 10**18;

    address private immutable FEE_MANAGER;
    address private immutable VALUE_INTERPRETER;

    constructor(address _feeManager, address _valueInterpreter) public {
        FEE_MANAGER = _feeManager;
        VALUE_INTERPRETER = _valueInterpreter;
    }

    // EXTERNAL FUNCTIONS

    /// @notice Calculates the GAV for a given fund, quoted in a given asset
    /// @param _vaultProxy The VaultProxy of the fund
    /// @param _quoteAsset The quote asset
    /// @return gav_ The GAV quoted in _quoteAsset
    function calcGavInAsset(address _vaultProxy, address _quoteAsset)
        external
        override
        returns (uint256 gav_)
    {
        (address denominationAsset, uint256 valueInDenominationAsset) = calcGav(_vaultProxy);

        return
            __calcCanonicalAssetValueOrRevertInvalid(
                denominationAsset,
                valueInDenominationAsset,
                _quoteAsset
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
        (address denominationAsset, uint256 valueInDenominationAsset) = calcGrossShareValue(
            _vaultProxy
        );

        return
            __calcCanonicalAssetValueOrRevertInvalid(
                denominationAsset,
                valueInDenominationAsset,
                _quoteAsset
            );
    }

    /// @notice Calculates the NAV for a given fund, quoted in a given asset
    /// @param _vaultProxy The VaultProxy of the fund
    /// @param _quoteAsset The quote asset
    /// @return nav_ The NAV quoted in _quoteAsset
    function calcNavInAsset(address _vaultProxy, address _quoteAsset)
        external
        override
        returns (uint256 nav_)
    {
        (address denominationAsset, uint256 valueInDenominationAsset) = calcNav(_vaultProxy);

        return
            __calcCanonicalAssetValueOrRevertInvalid(
                denominationAsset,
                valueInDenominationAsset,
                _quoteAsset
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
        (address denominationAsset, uint256 valueInDenominationAsset) = calcNetShareValue(
            _vaultProxy
        );

        return
            __calcCanonicalAssetValueOrRevertInvalid(
                denominationAsset,
                valueInDenominationAsset,
                _quoteAsset
            );
    }

    /// @notice Calculates the net value of all shares held by a specified account, quoted in a given asset
    /// @param _vaultProxy The VaultProxy of the fund
    /// @param _sharesHolder The account holding shares
    /// @param _quoteAsset The quote asset
    /// @return netValue_ The net value of all shares held by _sharesHolder quoted in _quoteAsset
    function calcNetValueForSharesHolderInAsset(
        address _vaultProxy,
        address _sharesHolder,
        address _quoteAsset
    ) external override returns (uint256 netValue_) {
        (
            address denominationAsset,
            uint256 valueInDenominationAsset
        ) = calcNetValueForSharesHolder(_vaultProxy, _sharesHolder);

        return
            __calcCanonicalAssetValueOrRevertInvalid(
                denominationAsset,
                valueInDenominationAsset,
                _quoteAsset
            );
    }

    // PUBLIC FUNCTIONS

    /// @notice Calculates the GAV for a given fund
    /// @param _vaultProxy The VaultProxy of the fund
    /// @return denominationAsset_ The denomination asset of the fund
    /// @return gav_ The GAV quoted in the denomination asset
    function calcGav(address _vaultProxy)
        public
        override
        returns (address denominationAsset_, uint256 gav_)
    {
        ComptrollerLib comptrollerProxyContract = __getComptrollerProxyForVault(_vaultProxy);

        (gav_, ) = comptrollerProxyContract.calcGav(false);

        return (comptrollerProxyContract.getDenominationAsset(), gav_);
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
        ComptrollerLib comptrollerProxyContract = __getComptrollerProxyForVault(_vaultProxy);

        (grossShareValue_, ) = comptrollerProxyContract.calcGrossShareValue(false);

        return (comptrollerProxyContract.getDenominationAsset(), grossShareValue_);
    }

    /// @notice Calculates the NAV for a given fund
    /// @param _vaultProxy The VaultProxy of the fund
    /// @return denominationAsset_ The denomination asset of the fund
    /// @return nav_ The NAV quoted in the denomination asset
    /// @dev This value should only be consumed from off-chain,
    /// as the NAV is only valid for the shares quantity prior to the settlement of fees,
    /// and this function actually settles fees, so the NAV would no longer be valid
    function calcNav(address _vaultProxy)
        public
        override
        returns (address denominationAsset_, uint256 nav_)
    {
        uint256 preSharesSupply = ERC20(_vaultProxy).totalSupply();

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
        ComptrollerLib comptrollerProxyContract = __getComptrollerProxyForVault(_vaultProxy);

        // Settle Continuous fees
        comptrollerProxyContract.callOnExtension(getFeeManager(), 0, "");

        (netShareValue_, ) = comptrollerProxyContract.calcGrossShareValue(false);

        return (comptrollerProxyContract.getDenominationAsset(), netShareValue_);
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
        uint256 sharesHolderBalance = ERC20(_vaultProxy).balanceOf(_sharesHolder);

        uint256 netShareValue;
        (denominationAsset_, netShareValue) = calcNetShareValue(_vaultProxy);

        netValue_ = sharesHolderBalance.mul(netShareValue).div(SHARES_UNIT);

        return (denominationAsset_, netValue_);
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to run ValueInterpreter.calcCanonicalAssetValue(), reverting if a returned rate is invalid
    function __calcCanonicalAssetValueOrRevertInvalid(
        address _baseAsset,
        uint256 _amount,
        address _quoteAsset
    ) private returns (uint256 value_) {
        bool isValid;
        (value_, isValid) = ValueInterpreter(getValueInterpreter()).calcCanonicalAssetValue(
            _baseAsset,
            _amount,
            _quoteAsset
        );
        require(isValid, "__calcCanonicalAssetValueOrRevertInvalid: Invalid");

        return value_;
    }

    /// @dev Helper to get the ComptrollerProxy for a given VaultProxy
    function __getComptrollerProxyForVault(address _vaultProxy)
        private
        view
        returns (ComptrollerLib comptrollerProxyContract_)
    {
        return ComptrollerLib(VaultLib(payable(_vaultProxy)).getAccessor());
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `FEE_MANAGER` variable
    /// @return feeManager_ The `FEE_MANAGER` variable value
    function getFeeManager() public view returns (address feeManager_) {
        return FEE_MANAGER;
    }

    /// @notice Gets the `VALUE_INTERPRETER` variable
    /// @return valueInterpreter_ The `VALUE_INTERPRETER` variable value
    function getValueInterpreter() public view returns (address valueInterpreter_) {
        return VALUE_INTERPRETER;
    }
}
