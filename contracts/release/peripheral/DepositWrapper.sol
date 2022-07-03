// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../core/fund/comptroller/ComptrollerLib.sol";
import "../interfaces/IWETH.sol";
import "../utils/AssetHelpers.sol";

/// @title DepositWrapper Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Logic related to wrapping deposit actions
contract DepositWrapper is AssetHelpers {
    bytes4 private constant BUY_SHARES_ON_BEHALF_SELECTOR = 0x877fd894;
    address private immutable WETH_TOKEN;

    constructor(address _weth) public {
        WETH_TOKEN = _weth;
    }

    /// @dev Needed in case WETH not fully used during exchangeAndBuyShares,
    /// to unwrap into ETH and refund
    receive() external payable {}

    // EXTERNAL FUNCTIONS

    /// @notice Exchanges ETH into a fund's denomination asset and then buys shares
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _minSharesQuantity The minimum quantity of shares to buy with the sent ETH
    /// @param _exchange The exchange on which to execute the swap to the denomination asset
    /// @param _exchangeApproveTarget The address that should be given an allowance of WETH
    /// for the given _exchange
    /// @param _exchangeData The data with which to call the exchange to execute the swap
    /// to the denomination asset
    /// @param _minInvestmentAmount The minimum amount of the denomination asset
    /// to receive in the trade for investment (not necessary for WETH)
    /// @return sharesReceived_ The actual amount of shares received
    /// @dev Use a reasonable _minInvestmentAmount always, in case the exchange
    /// does not perform as expected (low incoming asset amount, blend of assets, etc).
    /// If the fund's denomination asset is WETH, _exchange, _exchangeApproveTarget, _exchangeData,
    /// and _minInvestmentAmount will be ignored.
    function exchangeEthAndBuyShares(
        address _comptrollerProxy,
        uint256 _minSharesQuantity,
        address _exchange,
        address _exchangeApproveTarget,
        bytes calldata _exchangeData,
        uint256 _minInvestmentAmount
    ) external payable returns (uint256 sharesReceived_) {
        address denominationAsset = ComptrollerLib(_comptrollerProxy).getDenominationAsset();

        // Wrap ETH into WETH
        IWETH(payable(getWethToken())).deposit{value: msg.value}();

        // If denominationAsset is WETH, can just buy shares directly
        if (denominationAsset == getWethToken()) {
            __approveAssetMaxAsNeeded(getWethToken(), _comptrollerProxy, msg.value);

            return __buyShares(_comptrollerProxy, msg.sender, msg.value, _minSharesQuantity);
        }

        // Deny access to privileged core calls originating from this contract
        bytes4 exchangeSelector = abi.decode(_exchangeData, (bytes4));
        require(
            exchangeSelector != BUY_SHARES_ON_BEHALF_SELECTOR,
            "exchangeEthAndBuyShares: Disallowed selector"
        );

        // Exchange ETH to the fund's denomination asset
        __approveAssetMaxAsNeeded(getWethToken(), _exchangeApproveTarget, msg.value);
        (bool success, bytes memory returnData) = _exchange.call(_exchangeData);
        require(success, string(returnData));

        // Confirm the amount received in the exchange is above the min acceptable amount
        uint256 investmentAmount = ERC20(denominationAsset).balanceOf(address(this));
        require(
            investmentAmount >= _minInvestmentAmount,
            "exchangeEthAndBuyShares: _minInvestmentAmount not met"
        );

        // Give the ComptrollerProxy max allowance for its denomination asset as necessary
        __approveAssetMaxAsNeeded(denominationAsset, _comptrollerProxy, investmentAmount);

        // Buy fund shares
        sharesReceived_ = __buyShares(
            _comptrollerProxy,
            msg.sender,
            investmentAmount,
            _minSharesQuantity
        );

        // Unwrap and refund any remaining WETH not used in the exchange
        uint256 remainingWeth = ERC20(getWethToken()).balanceOf(address(this));
        if (remainingWeth > 0) {
            IWETH(payable(getWethToken())).withdraw(remainingWeth);
            (success, returnData) = msg.sender.call{value: remainingWeth}("");
            require(success, string(returnData));
        }

        return sharesReceived_;
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper for buying shares
    function __buyShares(
        address _comptrollerProxy,
        address _buyer,
        uint256 _investmentAmount,
        uint256 _minSharesQuantity
    ) private returns (uint256 sharesReceived_) {
        ComptrollerLib comptrollerProxyContract = ComptrollerLib(_comptrollerProxy);
        sharesReceived_ = comptrollerProxyContract.buySharesOnBehalf(
            _buyer,
            _investmentAmount,
            _minSharesQuantity
        );

        return sharesReceived_;
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `WETH_TOKEN` variable
    /// @return wethToken_ The `WETH_TOKEN` variable value
    function getWethToken() public view returns (address wethToken_) {
        return WETH_TOKEN;
    }
}
