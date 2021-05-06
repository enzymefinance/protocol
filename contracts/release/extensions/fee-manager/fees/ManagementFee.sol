// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../../../core/fund/vault/VaultLib.sol";
import "../../../utils/MakerDaoMath.sol";
import "./utils/FeeBase.sol";

/// @title ManagementFee Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A management fee with a configurable annual rate
contract ManagementFee is FeeBase, MakerDaoMath {
    using SafeMath for uint256;

    event ActivatedForMigratedFund(address indexed comptrollerProxy);

    event FundSettingsAdded(address indexed comptrollerProxy, uint256 scaledPerSecondRate);

    event Settled(
        address indexed comptrollerProxy,
        uint256 sharesQuantity,
        uint256 secondsSinceSettlement
    );

    struct FeeInfo {
        uint256 scaledPerSecondRate;
        uint256 lastSettled;
    }

    uint256 private constant RATE_SCALE_BASE = 10**27;

    mapping(address => FeeInfo) private comptrollerProxyToFeeInfo;

    constructor(address _feeManager) public FeeBase(_feeManager) {}

    // EXTERNAL FUNCTIONS

    /// @notice Activates the fee for a fund
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _vaultProxy The VaultProxy of the fund
    function activateForFund(address _comptrollerProxy, address _vaultProxy)
        external
        override
        onlyFeeManager
    {
        // It is only necessary to set `lastSettled` for a migrated fund
        if (VaultLib(_vaultProxy).totalSupply() > 0) {
            comptrollerProxyToFeeInfo[_comptrollerProxy].lastSettled = block.timestamp;

            emit ActivatedForMigratedFund(_comptrollerProxy);
        }
    }

    /// @notice Add the initial fee settings for a fund
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _settingsData Encoded settings to apply to the fee for a fund
    function addFundSettings(address _comptrollerProxy, bytes calldata _settingsData)
        external
        override
        onlyFeeManager
    {
        uint256 scaledPerSecondRate = abi.decode(_settingsData, (uint256));
        require(
            scaledPerSecondRate > 0,
            "addFundSettings: scaledPerSecondRate must be greater than 0"
        );

        comptrollerProxyToFeeInfo[_comptrollerProxy] = FeeInfo({
            scaledPerSecondRate: scaledPerSecondRate,
            lastSettled: 0
        });

        emit FundSettingsAdded(_comptrollerProxy, scaledPerSecondRate);
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
        implementedHooksForSettle_[1] = IFeeManager.FeeHook.BuySharesSetup;
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
        FeeInfo storage feeInfo = comptrollerProxyToFeeInfo[_comptrollerProxy];

        // If this fee was settled in the current block, we can return early
        uint256 secondsSinceSettlement = block.timestamp.sub(feeInfo.lastSettled);
        if (secondsSinceSettlement == 0) {
            return (IFeeManager.SettlementType.None, address(0), 0);
        }

        // If there are shares issued for the fund, calculate the shares due
        VaultLib vaultProxyContract = VaultLib(_vaultProxy);
        uint256 sharesSupply = vaultProxyContract.totalSupply();
        if (sharesSupply > 0) {
            // This assumes that all shares in the VaultProxy are shares outstanding,
            // which is fine for this release. Even if they are not, they are still shares that
            // are only claimable by the fund owner.
            uint256 netSharesSupply = sharesSupply.sub(vaultProxyContract.balanceOf(_vaultProxy));
            if (netSharesSupply > 0) {
                sharesDue_ = netSharesSupply
                    .mul(
                    __rpow(feeInfo.scaledPerSecondRate, secondsSinceSettlement, RATE_SCALE_BASE)
                        .sub(RATE_SCALE_BASE)
                )
                    .div(RATE_SCALE_BASE);
            }
        }

        // Must settle even when no shares are due, for the case that settlement is being
        // done when there are no shares in the fund (i.e. at the first investment, or at the
        // first investment after all shares have been redeemed)
        comptrollerProxyToFeeInfo[_comptrollerProxy].lastSettled = block.timestamp;
        emit Settled(_comptrollerProxy, sharesDue_, secondsSinceSettlement);

        if (sharesDue_ == 0) {
            return (IFeeManager.SettlementType.None, address(0), 0);
        }

        return (IFeeManager.SettlementType.Mint, address(0), sharesDue_);
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
