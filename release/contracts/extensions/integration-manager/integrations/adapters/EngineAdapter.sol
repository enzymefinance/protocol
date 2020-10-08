// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "../../../../interfaces/IWETH.sol";
import "../../../../infrastructure/engine/IEngine.sol";
import "../utils/AdapterBase.sol";

/// @title EngineAdapter Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Adapter for Melon Engine
contract EngineAdapter is AdapterBase {
    address private immutable ENGINE;
    address private immutable MLN_TOKEN;
    address private immutable WETH_TOKEN;

    constructor(
        address _integrationManager,
        address _engine,
        address _mlnToken,
        address _wethToken
    ) public AdapterBase(_integrationManager) {
        ENGINE = _engine;
        MLN_TOKEN = _mlnToken;
        WETH_TOKEN = _wethToken;
    }

    /// @dev Needed to receive ETH from swap
    receive() external payable {}

    // EXTERNAL FUNCTIONS

    /// @notice Provides a constant string identifier for an adapter
    /// @return An identifier string
    function identifier() external override pure returns (string memory) {
        return "MELON_ENGINE";
    }

    /// @notice Parses the expected assets to receive from a call on integration
    /// @param _selector The function selector for the callOnIntegration
    /// @param _encodedCallArgs The encoded parameters for the callOnIntegration
    /// @return spendAssets_ The assets to spend in the call
    /// @return spendAssetAmounts_ The max asset amounts to spend in the call
    /// @return incomingAssets_ The assets to receive in the call
    /// @return minIncomingAssetAmounts_ The min asset amounts to receive in the call
    function parseAssetsForMethod(bytes4 _selector, bytes calldata _encodedCallArgs)
        external
        override
        view
        returns (
            address[] memory spendAssets_,
            uint256[] memory spendAssetAmounts_,
            address[] memory incomingAssets_,
            uint256[] memory minIncomingAssetAmounts_
        )
    {
        if (_selector == TAKE_ORDER_SELECTOR) {
            (uint256 minWethAmount, uint256 mlnTokenAmount) = __decodeCallArgs(_encodedCallArgs);

            spendAssets_ = new address[](1);
            spendAssets_[0] = MLN_TOKEN;
            spendAssetAmounts_ = new uint256[](1);
            spendAssetAmounts_[0] = mlnTokenAmount;

            incomingAssets_ = new address[](1);
            incomingAssets_[0] = WETH_TOKEN;
            minIncomingAssetAmounts_ = new uint256[](1);
            minIncomingAssetAmounts_[0] = minWethAmount;
        } else {
            revert("parseIncomingAssets: _selector invalid");
        }
    }

    /// @notice Trades assets on Kyber
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _encodedCallArgs Encoded order parameters
    /// @param _encodedAssetTransferArgs Encoded args for expected assets to spend and receive
    function takeOrder(
        address _vaultProxy,
        bytes calldata _encodedCallArgs,
        bytes calldata _encodedAssetTransferArgs
    )
        external
        onlyIntegrationManager
        fundAssetsTransferHandler(_vaultProxy, _encodedAssetTransferArgs)
    {
        (, uint256 mlnTokenAmount) = __decodeCallArgs(_encodedCallArgs);

        // Execute fill
        IERC20(MLN_TOKEN).approve(ENGINE, mlnTokenAmount);
        uint256 preEthBalance = payable(address(this)).balance;
        IEngine(ENGINE).sellAndBurnMln(mlnTokenAmount);
        uint256 ethFilledAmount = payable(address(this)).balance.sub(preEthBalance);

        // Return ETH to WETH
        IWETH(payable(WETH_TOKEN)).deposit{value: ethFilledAmount}();
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to decode the encoded arguments
    function __decodeCallArgs(bytes memory _encodedCallArgs)
        private
        pure
        returns (uint256 minWethAmount_, uint256 mlnTokenAmount_)
    {
        return abi.decode(_encodedCallArgs, (uint256, uint256));
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    function getEngine() external view returns (address) {
        return ENGINE;
    }

    function getMlnToken() external view returns (address) {
        return MLN_TOKEN;
    }

    function getWethToken() external view returns (address) {
        return WETH_TOKEN;
    }
}
