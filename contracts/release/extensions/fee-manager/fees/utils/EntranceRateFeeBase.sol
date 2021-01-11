// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "./FeeBase.sol";

/// @title EntranceRateFeeBase Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Calculates a fee based on a rate to be charged to an investor upon entering a fund
abstract contract EntranceRateFeeBase is FeeBase {
    using SafeMath for uint256;

    event FundSettingsAdded(address indexed comptrollerProxy, uint256 rate);

    event Settled(address indexed comptrollerProxy, address indexed payer, uint256 sharesQuantity);

    uint256 private constant RATE_DIVISOR = 10**18;
    IFeeManager.SettlementType private immutable SETTLEMENT_TYPE;

    mapping(address => uint256) private comptrollerProxyToRate;

    constructor(address _feeManager, IFeeManager.SettlementType _settlementType)
        public
        FeeBase(_feeManager)
    {
        require(
            _settlementType == IFeeManager.SettlementType.Burn ||
                _settlementType == IFeeManager.SettlementType.Direct,
            "constructor: Invalid _settlementType"
        );
        SETTLEMENT_TYPE = _settlementType;
    }

    // EXTERNAL FUNCTIONS

    /// @notice Add the fee settings for a fund
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _settingsData Encoded settings to apply to the policy for a fund
    function addFundSettings(address _comptrollerProxy, bytes calldata _settingsData)
        external
        override
        onlyFeeManager
    {
        uint256 rate = abi.decode(_settingsData, (uint256));
        require(rate > 0, "addFundSettings: Fee rate must be >0");

        comptrollerProxyToRate[_comptrollerProxy] = rate;

        emit FundSettingsAdded(_comptrollerProxy, rate);
    }

    /// @notice Gets the hooks that are implemented by the fee
    /// @return implementedHooksForSettle_ The hooks during which settle() is implemented
    /// @return implementedHooksForUpdate_ The hooks during which update() is implemented
    /// @return usesGavOnSettle_ True if GAV is used during the settle() implementation
    /// @return usesGavOnUpdate_ True if GAV is used during the update() implementation
    /// @dev Used only during fee registration
    function implementedHooks()
        external
        view
        override
        returns (
            IFeeManager.FeeHook[] memory implementedHooksForSettle_,
            IFeeManager.FeeHook[] memory implementedHooksForUpdate_,
            bool usesGavOnSettle_,
            bool usesGavOnUpdate_
        )
    {
        implementedHooksForSettle_ = new IFeeManager.FeeHook[](1);
        implementedHooksForSettle_[0] = IFeeManager.FeeHook.PostBuyShares;

        return (implementedHooksForSettle_, new IFeeManager.FeeHook[](0), false, false);
    }

    /// @notice Settles the fee
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _settlementData Encoded args to use in calculating the settlement
    /// @return settlementType_ The type of settlement
    /// @return payer_ The payer of shares due
    /// @return sharesDue_ The amount of shares due
    function settle(
        address _comptrollerProxy,
        address,
        IFeeManager.FeeHook,
        bytes calldata _settlementData,
        uint256
    )
        external
        override
        onlyFeeManager
        returns (
            IFeeManager.SettlementType settlementType_,
            address payer_,
            uint256 sharesDue_
        )
    {
        uint256 sharesBought;
        (payer_, , sharesBought) = __decodePostBuySharesSettlementData(_settlementData);

        uint256 rate = comptrollerProxyToRate[_comptrollerProxy];
        sharesDue_ = sharesBought.mul(rate).div(RATE_DIVISOR.add(rate));

        if (sharesDue_ == 0) {
            return (IFeeManager.SettlementType.None, address(0), 0);
        }

        emit Settled(_comptrollerProxy, payer_, sharesDue_);

        return (SETTLEMENT_TYPE, payer_, sharesDue_);
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `rate` variable for a fund
    /// @param _comptrollerProxy The ComptrollerProxy contract for the fund
    /// @return rate_ The `rate` variable value
    function getRateForFund(address _comptrollerProxy) external view returns (uint256 rate_) {
        return comptrollerProxyToRate[_comptrollerProxy];
    }

    /// @notice Gets the `SETTLEMENT_TYPE` variable
    /// @return settlementType_ The `SETTLEMENT_TYPE` variable value
    function getSettlementType()
        external
        view
        returns (IFeeManager.SettlementType settlementType_)
    {
        return SETTLEMENT_TYPE;
    }
}
