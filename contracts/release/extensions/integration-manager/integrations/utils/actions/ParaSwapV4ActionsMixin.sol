// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../../../../interfaces/IParaSwapV4AugustusSwapper.sol";
import "../../../../../utils/AssetHelpers.sol";

/// @title ParaSwapV4ActionsMixin Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Mixin contract for interacting with ParaSwap (v4)
abstract contract ParaSwapV4ActionsMixin is AssetHelpers {
    string private constant REFERRER = "enzyme";

    address private immutable PARA_SWAP_V4_AUGUSTUS_SWAPPER;
    address private immutable PARA_SWAP_V4_TOKEN_TRANSFER_PROXY;

    constructor(address _augustusSwapper, address _tokenTransferProxy) public {
        PARA_SWAP_V4_AUGUSTUS_SWAPPER = _augustusSwapper;
        PARA_SWAP_V4_TOKEN_TRANSFER_PROXY = _tokenTransferProxy;
    }

    /// @dev Helper to execute a multiSwap() order
    function __paraSwapV4MultiSwap(
        address _fromToken,
        uint256 _fromAmount,
        uint256 _toAmount,
        uint256 _expectedAmount,
        address payable _beneficiary,
        IParaSwapV4AugustusSwapper.Path[] memory _path
    ) internal {
        __approveAssetMaxAsNeeded(_fromToken, PARA_SWAP_V4_TOKEN_TRANSFER_PROXY, _fromAmount);

        IParaSwapV4AugustusSwapper.SellData memory sellData = IParaSwapV4AugustusSwapper.SellData({
            fromToken: _fromToken,
            fromAmount: _fromAmount,
            toAmount: _toAmount,
            expectedAmount: _expectedAmount,
            beneficiary: _beneficiary,
            referrer: REFERRER,
            useReduxToken: false,
            path: _path
        });

        IParaSwapV4AugustusSwapper(PARA_SWAP_V4_AUGUSTUS_SWAPPER).multiSwap(sellData);
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `PARA_SWAP_V4_AUGUSTUS_SWAPPER` variable
    /// @return augustusSwapper_ The `PARA_SWAP_V4_AUGUSTUS_SWAPPER` variable value
    function getParaSwapV4AugustusSwapper() public view returns (address augustusSwapper_) {
        return PARA_SWAP_V4_AUGUSTUS_SWAPPER;
    }

    /// @notice Gets the `PARA_SWAP_V4_TOKEN_TRANSFER_PROXY` variable
    /// @return tokenTransferProxy_ The `PARA_SWAP_V4_TOKEN_TRANSFER_PROXY` variable value
    function getParaSwapV4TokenTransferProxy() public view returns (address tokenTransferProxy_) {
        return PARA_SWAP_V4_TOKEN_TRANSFER_PROXY;
    }
}
