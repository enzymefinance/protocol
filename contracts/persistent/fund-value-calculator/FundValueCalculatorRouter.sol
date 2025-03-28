// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../dispatcher/IDispatcher.sol";
import "./IFundValueCalculator.sol";
import "./IFundValueCalculatorRouter.sol";

/// @title FundValueCalculatorRouter Contract
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice A peripheral contract for routing value calculation requests
/// to the correct FundValueCalculator instance for a particular release
/// @dev These values should generally only be consumed from off-chain,
/// unless you understand how each release interprets each calculation
contract FundValueCalculatorRouter is IFundValueCalculatorRouter {
    event FundValueCalculatorUpdated(address indexed fundDeployer, address fundValueCalculator);

    address private immutable DISPATCHER;

    mapping(address => address) private fundDeployerToFundValueCalculator;

    constructor(address _dispatcher, address[] memory _fundDeployers, address[] memory _fundValueCalculators) public {
        DISPATCHER = _dispatcher;

        __setFundValueCalculators(_fundDeployers, _fundValueCalculators);
    }

    // EXTERNAL FUNCTIONS

    /// @notice Calculates the GAV for a given fund
    /// @param _vaultProxy The VaultProxy of the fund
    /// @return denominationAsset_ The denomination asset of the fund
    /// @return gav_ The GAV quoted in the denomination asset
    function calcGav(address _vaultProxy) external override returns (address denominationAsset_, uint256 gav_) {
        return getFundValueCalculatorForVault(_vaultProxy).calcGav(_vaultProxy);
    }

    /// @notice Calculates the GAV for a given fund, quoted in a given asset
    /// @param _vaultProxy The VaultProxy of the fund
    /// @param _quoteAsset The quote asset
    /// @return gav_ The GAV quoted in _quoteAsset
    function calcGavInAsset(address _vaultProxy, address _quoteAsset) external override returns (uint256 gav_) {
        return getFundValueCalculatorForVault(_vaultProxy).calcGavInAsset(_vaultProxy, _quoteAsset);
    }

    /// @notice Calculates the gross value of one shares unit (10 ** 18) for a given fund
    /// @param _vaultProxy The VaultProxy of the fund
    /// @return denominationAsset_ The denomination asset of the fund
    /// @return grossShareValue_ The gross share value quoted in the denomination asset
    function calcGrossShareValue(address _vaultProxy)
        external
        override
        returns (address denominationAsset_, uint256 grossShareValue_)
    {
        return getFundValueCalculatorForVault(_vaultProxy).calcGrossShareValue(_vaultProxy);
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
        return getFundValueCalculatorForVault(_vaultProxy).calcGrossShareValueInAsset(_vaultProxy, _quoteAsset);
    }

    /// @notice Calculates the NAV for a given fund
    /// @param _vaultProxy The VaultProxy of the fund
    /// @return denominationAsset_ The denomination asset of the fund
    /// @return nav_ The NAV quoted in the denomination asset
    function calcNav(address _vaultProxy) external override returns (address denominationAsset_, uint256 nav_) {
        return getFundValueCalculatorForVault(_vaultProxy).calcNav(_vaultProxy);
    }

    /// @notice Calculates the NAV for a given fund, quoted in a given asset
    /// @param _vaultProxy The VaultProxy of the fund
    /// @param _quoteAsset The quote asset
    /// @return nav_ The NAV quoted in _quoteAsset
    function calcNavInAsset(address _vaultProxy, address _quoteAsset) external override returns (uint256 nav_) {
        return getFundValueCalculatorForVault(_vaultProxy).calcNavInAsset(_vaultProxy, _quoteAsset);
    }

    /// @notice Calculates the net value of one shares unit (10 ** 18) for a given fund
    /// @param _vaultProxy The VaultProxy of the fund
    /// @return denominationAsset_ The denomination asset of the fund
    /// @return netShareValue_ The net share value quoted in the denomination asset
    function calcNetShareValue(address _vaultProxy)
        external
        override
        returns (address denominationAsset_, uint256 netShareValue_)
    {
        return getFundValueCalculatorForVault(_vaultProxy).calcNetShareValue(_vaultProxy);
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
        return getFundValueCalculatorForVault(_vaultProxy).calcNetShareValueInAsset(_vaultProxy, _quoteAsset);
    }

    /// @notice Calculates the net value of all shares held by a specified account
    /// @param _vaultProxy The VaultProxy of the fund
    /// @param _sharesHolder The account holding shares
    /// @return denominationAsset_ The denomination asset of the fund
    /// @return netValue_ The net value of all shares held by _sharesHolder
    function calcNetValueForSharesHolder(address _vaultProxy, address _sharesHolder)
        external
        override
        returns (address denominationAsset_, uint256 netValue_)
    {
        return getFundValueCalculatorForVault(_vaultProxy).calcNetValueForSharesHolder(_vaultProxy, _sharesHolder);
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
        return getFundValueCalculatorForVault(_vaultProxy).calcNetValueForSharesHolderInAsset(
            _vaultProxy, _sharesHolder, _quoteAsset
        );
    }

    // PUBLIC FUNCTIONS

    /// @notice Gets the FundValueCalculator instance to use for a given fund
    /// @param _vaultProxy The VaultProxy of the fund
    /// @return fundValueCalculatorContract_ The FundValueCalculator instance
    function getFundValueCalculatorForVault(address _vaultProxy)
        public
        view
        override
        returns (IFundValueCalculator fundValueCalculatorContract_)
    {
        address fundDeployer = IDispatcher(DISPATCHER).getFundDeployerForVaultProxy(_vaultProxy);
        require(fundDeployer != address(0), "getFundValueCalculatorForVault: Invalid _vaultProxy");

        address fundValueCalculator = getFundValueCalculatorForFundDeployer(fundDeployer);
        require(fundValueCalculator != address(0), "getFundValueCalculatorForVault: No FundValueCalculator set");

        return IFundValueCalculator(fundValueCalculator);
    }

    ////////////////////////////
    // FUND VALUE CALCULATORS //
    ////////////////////////////

    /// @notice Sets FundValueCalculator instances for a list of FundDeployer instances
    /// @param _fundDeployers The FundDeployer instances
    /// @param _fundValueCalculators The FundValueCalculator instances corresponding
    /// to each instance in _fundDeployers
    function setFundValueCalculators(address[] memory _fundDeployers, address[] memory _fundValueCalculators)
        external
        override
    {
        require(
            msg.sender == IDispatcher(getDispatcher()).getOwner(), "Only the Dispatcher owner can call this function"
        );

        __setFundValueCalculators(_fundDeployers, _fundValueCalculators);
    }

    /// @dev Helper to set FundValueCalculator addresses respectively for given FundDeployers
    function __setFundValueCalculators(address[] memory _fundDeployers, address[] memory _fundValueCalculators)
        private
    {
        require(
            _fundDeployers.length == _fundValueCalculators.length, "__setFundValueCalculators: Unequal array lengths"
        );

        for (uint256 i; i < _fundDeployers.length; i++) {
            fundDeployerToFundValueCalculator[_fundDeployers[i]] = _fundValueCalculators[i];

            emit FundValueCalculatorUpdated(_fundDeployers[i], _fundValueCalculators[i]);
        }
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `DISPATCHER` variable
    /// @return dispatcher_ The `DISPATCHER` variable value
    function getDispatcher() public view override returns (address dispatcher_) {
        return DISPATCHER;
    }

    /// @notice Gets the FundValueCalculator address for a given FundDeployer
    /// @param _fundDeployer The FundDeployer for which to get the FundValueCalculator address
    /// @return fundValueCalculator_ The FundValueCalculator address
    function getFundValueCalculatorForFundDeployer(address _fundDeployer)
        public
        view
        override
        returns (address fundValueCalculator_)
    {
        return fundDeployerToFundValueCalculator[_fundDeployer];
    }
}
