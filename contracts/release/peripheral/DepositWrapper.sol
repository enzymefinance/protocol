// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {Address} from "openzeppelin-solc-0.8/utils/Address.sol";
import {ERC20} from "openzeppelin-solc-0.8/token/ERC20/ERC20.sol";
import {SafeERC20} from "openzeppelin-solc-0.8/token/ERC20/utils/SafeERC20.sol";
import {IComptroller} from "../core/fund/comptroller/IComptroller.sol";
import {IWETH} from "../../external-interfaces/IWETH.sol";
import {AssetHelpers} from "../../utils/0.8.19/AssetHelpers.sol";

/// @title DepositWrapper Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Logic related to wrapping deposit actions
contract DepositWrapper is AssetHelpers {
    using SafeERC20 for ERC20;

    bytes4 private constant BUY_SHARES_ON_BEHALF_SELECTOR = 0x877fd894;
    IWETH private immutable WRAPPED_NATIVE_ASSET;

    constructor(IWETH _wrappedNativeAsset) {
        WRAPPED_NATIVE_ASSET = _wrappedNativeAsset;
    }

    /// @dev Needed in case WETH not fully used during exchangeAndBuyShares,
    /// to unwrap into ETH and refund
    receive() external payable {}

    // EXTERNAL FUNCTIONS

    /// @notice Exchanges an ERC20 into a fund's denomination asset and then buys shares
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _minSharesQuantity The minimum quantity of shares to receive
    /// @param _inputAsset Asset to swap for the fund's denomination asset
    /// @param _maxInputAssetAmount The maximum amount of _inputAsset to use in the swap
    /// @param _exchange The exchange on which to swap ERC20 to denomination asset
    /// @param _exchangeApproveTarget The _exchange address that should be granted an ERC20 allowance
    /// @param _exchangeData The data with which to call the _exchange to execute the swap
    /// @param _exchangeMinReceived The minimum amount of the denomination asset to receive from the _exchange
    /// @return sharesReceived_ The actual amount of shares received
    /// @dev Use a reasonable _exchangeMinReceived always, in case the exchange
    /// does not perform as expected (low incoming asset amount, blend of assets, etc).
    function exchangeErc20AndBuyShares(
        IComptroller _comptrollerProxy,
        uint256 _minSharesQuantity,
        ERC20 _inputAsset,
        uint256 _maxInputAssetAmount,
        address _exchange,
        address _exchangeApproveTarget,
        bytes calldata _exchangeData,
        uint256 _exchangeMinReceived
    ) external returns (uint256 sharesReceived_) {
        // Receive the _maxInputAssetAmount from the caller
        _inputAsset.safeTransferFrom(msg.sender, address(this), _maxInputAssetAmount);

        // Swap to the denominationAsset and buy fund shares
        sharesReceived_ = __exchangeAndBuyShares({
            _comptrollerProxy: _comptrollerProxy,
            _minSharesQuantity: _minSharesQuantity,
            _exchange: _exchange,
            _exchangeApproveTarget: _exchangeApproveTarget,
            _exchangeData: _exchangeData,
            _exchangeMinReceived: _exchangeMinReceived,
            _inputAsset: _inputAsset,
            _maxInputAssetAmount: _maxInputAssetAmount
        });

        // Refund any remaining _inputAsset not used in the exchange
        uint256 remainingInputAsset = _inputAsset.balanceOf(address(this));
        if (remainingInputAsset > 0) {
            _inputAsset.safeTransfer(msg.sender, remainingInputAsset);
        }

        return sharesReceived_;
    }

    /// @notice Exchanges ETH into a fund's denomination asset and then buys shares
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _minSharesQuantity The minimum quantity of shares to buy with the sent ETH
    /// @param _exchange The exchange on which to execute the swap to the denomination asset
    /// @param _exchangeApproveTarget The address that should be given an allowance of WETH
    /// for the given _exchange
    /// @param _exchangeData The data with which to call the exchange to execute the swap
    /// to the denomination asset
    /// @param _exchangeMinReceived The minimum amount of the denomination asset
    /// to receive in the trade for investment (not necessary for WETH)
    /// @return sharesReceived_ The actual amount of shares received
    /// @dev Use a reasonable _exchangeMinReceived always, in case the exchange
    /// does not perform as expected (low incoming asset amount, blend of assets, etc).
    /// If the fund's denomination asset is WETH, _exchange, _exchangeApproveTarget, _exchangeData,
    /// and _exchangeMinReceived will be ignored.
    function exchangeEthAndBuyShares(
        IComptroller _comptrollerProxy,
        uint256 _minSharesQuantity,
        address _exchange,
        address _exchangeApproveTarget,
        bytes calldata _exchangeData,
        uint256 _exchangeMinReceived
    ) external payable returns (uint256 sharesReceived_) {
        ERC20 inputAsset = ERC20(address(WRAPPED_NATIVE_ASSET));
        uint256 maxInputAssetAmount = msg.value;

        // Wrap ETH into WETH
        WRAPPED_NATIVE_ASSET.deposit{value: maxInputAssetAmount}();

        // Empty `_exchange` signals no swap is necessary, i.e., denominationAsset is the native asset
        if (_exchange == address(0)) {
            return __buyShares({
                _comptrollerProxy: _comptrollerProxy,
                _buyer: msg.sender,
                _investmentAmount: maxInputAssetAmount,
                _minSharesQuantity: _minSharesQuantity,
                _denominationAssetAddress: address(inputAsset)
            });
        }

        // Swap to the denominationAsset and buy fund shares
        sharesReceived_ = __exchangeAndBuyShares({
            _comptrollerProxy: _comptrollerProxy,
            _minSharesQuantity: _minSharesQuantity,
            _exchange: _exchange,
            _exchangeApproveTarget: _exchangeApproveTarget,
            _exchangeData: _exchangeData,
            _exchangeMinReceived: _exchangeMinReceived,
            _inputAsset: inputAsset,
            _maxInputAssetAmount: maxInputAssetAmount
        });

        // Unwrap and refund any remaining WETH not used in the exchange
        uint256 remainingWeth = inputAsset.balanceOf(address(this));
        if (remainingWeth > 0) {
            WRAPPED_NATIVE_ASSET.withdraw(remainingWeth);
            Address.sendValue({recipient: payable(msg.sender), amount: remainingWeth});
        }

        return sharesReceived_;
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper for buying shares
    function __buyShares(
        IComptroller _comptrollerProxy,
        address _buyer,
        uint256 _investmentAmount,
        uint256 _minSharesQuantity,
        address _denominationAssetAddress
    ) private returns (uint256 sharesReceived_) {
        // Give the ComptrollerProxy max allowance for its denomination asset as necessary
        __approveAssetMaxAsNeeded({
            _asset: _denominationAssetAddress,
            _target: address(_comptrollerProxy),
            _neededAmount: _investmentAmount
        });

        return _comptrollerProxy.buySharesOnBehalf({
            _buyer: _buyer,
            _investmentAmount: _investmentAmount,
            _minSharesQuantity: _minSharesQuantity
        });
    }

    /// @dev Helper to exchange an asset for the fund's denomination asset and then buy shares
    function __exchangeAndBuyShares(
        IComptroller _comptrollerProxy,
        uint256 _minSharesQuantity,
        address _exchange,
        address _exchangeApproveTarget,
        bytes calldata _exchangeData,
        uint256 _exchangeMinReceived,
        ERC20 _inputAsset,
        uint256 _maxInputAssetAmount
    ) private returns (uint256 sharesReceived_) {
        // Deny access to privileged core calls originating from this contract
        {
            bytes4 exchangeSelector = bytes4(_exchangeData[:4]);
            require(exchangeSelector != BUY_SHARES_ON_BEHALF_SELECTOR, "__exchangeAndBuyShares: Disallowed selector");
        }

        // Exchange the _inputAsset to the fund's denomination asset
        __approveAssetMaxAsNeeded({
            _asset: address(_inputAsset),
            _target: _exchangeApproveTarget,
            _neededAmount: _maxInputAssetAmount
        });
        Address.functionCall({target: _exchange, data: _exchangeData});

        // Confirm the min amount of denomination asset was received in the exchange
        ERC20 denominationAsset = ERC20(_comptrollerProxy.getDenominationAsset());
        uint256 investmentAmount = denominationAsset.balanceOf(address(this));
        require(investmentAmount >= _exchangeMinReceived, "__exchangeAndBuyShares: _exchangeMinReceived not met");

        // Buy fund shares
        return __buyShares({
            _comptrollerProxy: _comptrollerProxy,
            _buyer: msg.sender,
            _investmentAmount: investmentAmount,
            _minSharesQuantity: _minSharesQuantity,
            _denominationAssetAddress: address(denominationAsset)
        });
    }
}
