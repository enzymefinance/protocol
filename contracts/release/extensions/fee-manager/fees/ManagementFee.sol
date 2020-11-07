// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import "../../../core/fund/vault/VaultLib.sol";
import "../../utils/SharesInflationMixin.sol";
import "./utils/FeeBase.sol";

/// @title ManagementFee Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice A management fee with a configurable annual rate
contract ManagementFee is FeeBase, SharesInflationMixin {
    event FundSettingsAdded(address indexed comptrollerProxy, uint256 rate);

    event Settled(address indexed comptrollerProxy, uint256 sharesQuantity, uint256 prevSettled);

    struct FeeInfo {
        uint256 rate;
        uint256 lastSettled;
    }

    uint256 private constant RATE_PERIOD = 365 days;
    uint256 private constant RATE_DIVISOR = 10**18;

    mapping(address => FeeInfo) private comptrollerProxyToFeeInfo;

    constructor(address _feeManager) public FeeBase(_feeManager) {}

    // EXTERNAL FUNCTIONS

    /// @notice Add the initial fee settings for a fund
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _settingsData Encoded settings to apply to the fee for a fund
    function addFundSettings(address _comptrollerProxy, bytes calldata _settingsData)
        external
        override
        onlyFeeManager
    {
        uint256 feeRate = abi.decode(_settingsData, (uint256));
        require(feeRate > 0, "addFundSettings: feeRate must be greater than 0");

        comptrollerProxyToFeeInfo[_comptrollerProxy] = FeeInfo({rate: feeRate, lastSettled: 0});

        emit FundSettingsAdded(_comptrollerProxy, feeRate);
    }

    /// @notice Provides a constant string identifier for a fee
    /// @return identifier_ The identifier string
    function identifier() external pure override returns (string memory identifier_) {
        return "MANAGEMENT";
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
        implementedHooksForSettle_ = new IFeeManager.FeeHook[](3);
        implementedHooksForSettle_[0] = IFeeManager.FeeHook.Continuous;
        implementedHooksForSettle_[1] = IFeeManager.FeeHook.PreBuyShares;
        implementedHooksForSettle_[2] = IFeeManager.FeeHook.PreRedeemShares;

        return (implementedHooksForSettle_, new IFeeManager.FeeHook[](0), false, false);
    }

    /// @notice Settle the fee and calculate shares due
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _vaultProxy The VaultProxy of the fund
    /// @return settlementType_ The type of settlement
    /// @return (unused) The payer of shares due
    /// @return sharesDue_ The amount of shares due
    function settle(
        address _comptrollerProxy,
        address _vaultProxy,
        IFeeManager.FeeHook,
        bytes calldata,
        uint256
    )
        external
        override
        onlyFeeManager
        returns (
            IFeeManager.SettlementType settlementType_,
            address,
            uint256 sharesDue_
        )
    {
        uint256 prevSettled = comptrollerProxyToFeeInfo[_comptrollerProxy].lastSettled;
        if (prevSettled == block.timestamp) {
            return (IFeeManager.SettlementType.None, address(0), 0);
        }

        uint256 sharesSupply = VaultLib(_vaultProxy).totalSupply();

        if (sharesSupply > 0) {
            sharesDue_ = __calcSettlementSharesDue(_comptrollerProxy, sharesSupply, prevSettled);
        }

        // Must settle even when no shares are due, for the case that settlement is being
        // done when there are no shares in the fund (i.e. at the first investment, or at the
        // first investment after all shares have been redeemed)
        comptrollerProxyToFeeInfo[_comptrollerProxy].lastSettled = block.timestamp;
        emit Settled(_comptrollerProxy, sharesDue_, prevSettled);

        if (sharesDue_ == 0) {
            return (IFeeManager.SettlementType.None, address(0), 0);
        }

        return (IFeeManager.SettlementType.Mint, address(0), sharesDue_);
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to calculate the shares due at settlement (including inflation)
    function __calcSettlementSharesDue(
        address _comptrollerProxy,
        uint256 _sharesQuantity,
        uint256 _prevSettled
    ) private view returns (uint256) {
        uint256 yearlySharesDueRate = _sharesQuantity
            .mul(comptrollerProxyToFeeInfo[_comptrollerProxy].rate)
            .div(RATE_DIVISOR);

        return
            __calcSharesDueWithInflation(
                yearlySharesDueRate.mul(block.timestamp.sub(_prevSettled)).div(RATE_PERIOD),
                _sharesQuantity
            );
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the feeInfo for a given fund
    /// @param _comptrollerProxy The ComptrollerProxy contract of the fund
    /// @return feeInfo_ The feeInfo
    function getFeeInfoForFund(address _comptrollerProxy)
        external
        view
        returns (FeeInfo memory feeInfo_)
    {
        return comptrollerProxyToFeeInfo[_comptrollerProxy];
    }
}
