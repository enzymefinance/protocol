// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "openzeppelin-solc-0.6/math/SafeMath.sol";
import "openzeppelin-solc-0.6/token/ERC20/ERC20.sol";
import "../../../core/fund/comptroller/ComptrollerLib.sol";
import "../FeeManager.sol";
import "./utils/FeeBase.sol";
import "./utils/UpdatableFeeRecipientBase.sol";

/// @title PerformanceFee Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A performance-based fee with configurable rate
contract PerformanceFee is FeeBase, UpdatableFeeRecipientBase {
    using SafeMath for uint256;

    event ActivatedForFund(address indexed comptrollerProxy, uint256 highWaterMark);

    event FundSettingsAdded(address indexed comptrollerProxy, uint256 rate);

    event HighWaterMarkUpdated(address indexed comptrollerProxy, uint256 nextHighWaterMark);

    event Settled(address indexed comptrollerProxy, uint256 sharePrice, uint256 sharesDue);

    // Does not use variable packing as `highWaterMark` will often be read without reading `rate`,
    // `rate` will never be updated after deployment, and each is set at a different time
    struct FeeInfo {
        uint256 rate;
        uint256 highWaterMark;
    }

    uint256 private constant ONE_HUNDRED_PERCENT = 10000;
    uint256 private constant RESET_HWM_FLAG = type(uint256).max;
    uint256 private constant SHARE_UNIT = 10 ** 18;

    mapping(address => FeeInfo) private comptrollerProxyToFeeInfo;

    constructor(address _feeManager) public FeeBase(_feeManager) {}

    // EXTERNAL FUNCTIONS

    /// @notice Activates the fee for a fund
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    function activateForFund(address _comptrollerProxy, address) external override onlyFeeManager {
        FeeInfo storage feeInfo = comptrollerProxyToFeeInfo[_comptrollerProxy];

        uint256 grossSharePrice = ComptrollerLib(_comptrollerProxy).calcGrossShareValue();

        feeInfo.highWaterMark = grossSharePrice;

        emit ActivatedForFund(_comptrollerProxy, grossSharePrice);
    }

    /// @notice Add the initial fee settings for a fund
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _settingsData Encoded settings to apply to the fee for a fund
    /// @dev `highWaterMark`, `lastSharePrice`, and `activated` are set during activation
    function addFundSettings(address _comptrollerProxy, bytes calldata _settingsData)
        external
        override
        onlyFeeManager
    {
        (uint256 feeRate, address recipient) = abi.decode(_settingsData, (uint256, address));
        require(feeRate > 0, "addFundSettings: feeRate must be greater than 0");
        // Unlike most other fees, there could be a case for using a rate of exactly 100%,
        // i.e., pay out all profits to a specified recipient
        require(feeRate <= ONE_HUNDRED_PERCENT, "addFundSettings: feeRate max exceeded");

        comptrollerProxyToFeeInfo[_comptrollerProxy] = FeeInfo({rate: feeRate, highWaterMark: 0});

        emit FundSettingsAdded(_comptrollerProxy, feeRate);

        if (recipient != address(0)) {
            __setRecipientForFund(_comptrollerProxy, recipient);
        }
    }

    /// @notice Settles the fee and calculates shares due
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _vaultProxy The VaultProxy of the fund
    /// @param _gav The GAV of the fund
    /// @return settlementType_ The type of settlement
    /// @return (unused) The payer of shares due
    /// @return sharesDue_ The amount of shares due
    function settle(address _comptrollerProxy, address _vaultProxy, IFeeManager.FeeHook, bytes calldata, uint256 _gav)
        external
        override
        onlyFeeManager
        returns (IFeeManager.SettlementType settlementType_, address, uint256 sharesDue_)
    {
        uint256 sharePrice;
        (sharePrice, sharesDue_) = __calcSharesDue(_comptrollerProxy, _vaultProxy, _gav);
        if (sharesDue_ == 0) {
            return (IFeeManager.SettlementType.None, address(0), 0);
        }

        // Set a HWM flag to signal the need to update the HWM during update()
        comptrollerProxyToFeeInfo[_comptrollerProxy].highWaterMark = RESET_HWM_FLAG;

        emit Settled(_comptrollerProxy, sharePrice, sharesDue_);

        return (IFeeManager.SettlementType.Mint, address(0), sharesDue_);
    }

    /// @notice Gets whether the fee settles and requires GAV on a particular hook
    /// @param _hook The FeeHook
    /// @return settles_ True if the fee settles on the _hook
    /// @return usesGav_ True if the fee uses GAV during settle() for the _hook
    function settlesOnHook(IFeeManager.FeeHook _hook) external view override returns (bool settles_, bool usesGav_) {
        if (
            _hook == IFeeManager.FeeHook.PreBuyShares || _hook == IFeeManager.FeeHook.PreRedeemShares
                || _hook == IFeeManager.FeeHook.Continuous
        ) {
            return (true, true);
        }

        return (false, false);
    }

    /// @notice Updates the fee state after all fees have finished settle()
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _vaultProxy The VaultProxy of the fund
    /// @param _gav The GAV of the fund
    function update(address _comptrollerProxy, address _vaultProxy, IFeeManager.FeeHook, bytes calldata, uint256 _gav)
        external
        override
        onlyFeeManager
    {
        if (comptrollerProxyToFeeInfo[_comptrollerProxy].highWaterMark == RESET_HWM_FLAG) {
            uint256 nextHWM =
                __calcGrossShareValueForComptrollerProxy(_comptrollerProxy, _gav, ERC20(_vaultProxy).totalSupply());
            comptrollerProxyToFeeInfo[_comptrollerProxy].highWaterMark = nextHWM;

            emit HighWaterMarkUpdated(_comptrollerProxy, nextHWM);
        }
    }

    /// @notice Gets whether the fee updates and requires GAV on a particular hook
    /// @param _hook The FeeHook
    /// @return updates_ True if the fee updates on the _hook
    /// @return usesGav_ True if the fee uses GAV during update() for the _hook
    function updatesOnHook(IFeeManager.FeeHook _hook) external view override returns (bool updates_, bool usesGav_) {
        if (
            _hook == IFeeManager.FeeHook.PostBuyShares || _hook == IFeeManager.FeeHook.PreRedeemShares
                || _hook == IFeeManager.FeeHook.Continuous
        ) {
            return (true, true);
        }

        return (false, false);
    }

    // PUBLIC FUNCTIONS

    /// @notice Gets the recipient of the fee for a given fund
    /// @param _comptrollerProxy The ComptrollerProxy contract for the fund
    /// @return recipient_ The recipient
    function getRecipientForFund(address _comptrollerProxy)
        public
        view
        override(FeeBase, SettableFeeRecipientBase)
        returns (address recipient_)
    {
        return SettableFeeRecipientBase.getRecipientForFund(_comptrollerProxy);
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper for calculating the gross share value.
    /// Logic mimics ComptrollerLib.__calcGrossShareValue().
    function __calcGrossShareValueForComptrollerProxy(address _comptrollerProxy, uint256 _gav, uint256 _sharesSupply)
        private
        view
        returns (uint256 grossShareValue_)
    {
        if (_sharesSupply == 0) {
            return 10 ** uint256(ERC20(ComptrollerLib(_comptrollerProxy).getDenominationAsset()).decimals());
        }

        return _gav.mul(SHARE_UNIT).div(_sharesSupply);
    }

    /// @dev Helper to calculate shares due.
    /// Avoids the stack-too-deep error.
    function __calcSharesDue(address _comptrollerProxy, address _vaultProxy, uint256 _gav)
        private
        view
        returns (uint256 sharePrice_, uint256 sharesDue_)
    {
        if (_gav == 0) {
            return (0, 0);
        }

        uint256 sharesSupply = ERC20(_vaultProxy).totalSupply();
        if (sharesSupply == 0) {
            return (0, 0);
        }

        // Check if current share price is greater than the HWM
        sharePrice_ = __calcGrossShareValueForComptrollerProxy(_comptrollerProxy, _gav, sharesSupply);
        uint256 HWM = comptrollerProxyToFeeInfo[_comptrollerProxy].highWaterMark;
        if (sharePrice_ <= HWM) {
            return (0, 0);
        }

        // Calculate the shares due, inclusive of inflation
        uint256 priceIncrease = sharePrice_.sub(HWM);
        uint256 rawValueDue = priceIncrease.mul(sharesSupply).mul(comptrollerProxyToFeeInfo[_comptrollerProxy].rate).div(
            ONE_HUNDRED_PERCENT
        ).div(SHARE_UNIT);
        sharesDue_ = rawValueDue.mul(sharesSupply).div(_gav.sub(rawValueDue));

        return (sharePrice_, sharesDue_);
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the feeInfo for a given fund
    /// @param _comptrollerProxy The ComptrollerProxy contract of the fund
    /// @return feeInfo_ The feeInfo
    function getFeeInfoForFund(address _comptrollerProxy) external view returns (FeeInfo memory feeInfo_) {
        return comptrollerProxyToFeeInfo[_comptrollerProxy];
    }
}
