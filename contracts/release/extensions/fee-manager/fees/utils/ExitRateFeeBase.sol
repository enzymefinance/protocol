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

/// @title ExitRateFeeBase Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Calculates a fee based on a rate to be charged to an investor upon exiting a fund
abstract contract ExitRateFeeBase is FeeBase {
    using SafeMath for uint256;

    event FundSettingsAdded(
        address indexed comptrollerProxy,
        uint256 inKindRate,
        uint256 specificAssetsRate
    );

    event Settled(
        address indexed comptrollerProxy,
        address indexed payer,
        uint256 sharesQuantity,
        bool indexed forSpecificAssets
    );

    struct FeeInfo {
        uint16 inKindRate;
        uint16 specificAssetsRate;
    }

    uint256 private constant ONE_HUNDRED_PERCENT = 10000;
    IFeeManager.SettlementType private immutable SETTLEMENT_TYPE;

    mapping(address => FeeInfo) private comptrollerProxyToFeeInfo;

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

    /// @notice Add the initial fee settings for a fund
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _settingsData Encoded settings to apply to the fee for a fund
    function addFundSettings(address _comptrollerProxy, bytes calldata _settingsData)
        public
        virtual
        override
        onlyFeeManager
    {
        (uint16 inKindRate, uint16 specificAssetsRate) = abi.decode(
            _settingsData,
            (uint16, uint16)
        );
        require(inKindRate < ONE_HUNDRED_PERCENT, "addFundSettings: inKindRate max exceeded");
        require(
            specificAssetsRate < ONE_HUNDRED_PERCENT,
            "addFundSettings: specificAssetsRate max exceeded"
        );

        comptrollerProxyToFeeInfo[_comptrollerProxy] = FeeInfo({
            inKindRate: inKindRate,
            specificAssetsRate: specificAssetsRate
        });

        emit FundSettingsAdded(_comptrollerProxy, inKindRate, specificAssetsRate);
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
        bool forSpecificAssets;
        uint256 sharesRedeemed;
        (payer_, sharesRedeemed, forSpecificAssets) = __decodePreRedeemSharesSettlementData(
            _settlementData
        );

        uint256 rate;
        if (forSpecificAssets) {
            rate = getSpecificAssetsRateForFund(_comptrollerProxy);
        } else {
            rate = getInKindRateForFund(_comptrollerProxy);
        }

        sharesDue_ = sharesRedeemed.mul(rate).div(ONE_HUNDRED_PERCENT);

        if (sharesDue_ == 0) {
            return (IFeeManager.SettlementType.None, address(0), 0);
        }

        emit Settled(_comptrollerProxy, payer_, sharesDue_, forSpecificAssets);

        return (getSettlementType(), payer_, sharesDue_);
    }

    /// @notice Gets whether the fee settles and requires GAV on a particular hook
    /// @param _hook The FeeHook
    /// @return settles_ True if the fee settles on the _hook
    /// @return usesGav_ True if the fee uses GAV during settle() for the _hook
    function settlesOnHook(IFeeManager.FeeHook _hook)
        external
        view
        override
        returns (bool settles_, bool usesGav_)
    {
        if (_hook == IFeeManager.FeeHook.PreRedeemShares) {
            return (true, false);
        }

        return (false, false);
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the fee rate for an in-kind redemption
    /// @param _comptrollerProxy The ComptrollerProxy contract for the fund
    /// @return rate_ The fee rate
    function getInKindRateForFund(address _comptrollerProxy) public view returns (uint256 rate_) {
        return comptrollerProxyToFeeInfo[_comptrollerProxy].inKindRate;
    }

    /// @notice Gets the `SETTLEMENT_TYPE` variable
    /// @return settlementType_ The `SETTLEMENT_TYPE` variable value
    function getSettlementType() public view returns (IFeeManager.SettlementType settlementType_) {
        return SETTLEMENT_TYPE;
    }

    /// @notice Gets the fee rate for a specific assets redemption
    /// @param _comptrollerProxy The ComptrollerProxy contract for the fund
    /// @return rate_ The fee rate
    function getSpecificAssetsRateForFund(address _comptrollerProxy)
        public
        view
        returns (uint256 rate_)
    {
        return comptrollerProxyToFeeInfo[_comptrollerProxy].specificAssetsRate;
    }
}
