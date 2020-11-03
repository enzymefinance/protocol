// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "../../../../infrastructure/engine/IEngine.sol";
import "../../../../interfaces/IWETH.sol";
import "../utils/AdapterBase.sol";

/// @title EngineAdapter Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Adapter for trading MLN for discounted ETH via the Engine Contract
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
    /// @return identifer_ An identifier string
    function identifier() external pure override returns (string memory identifer_) {
        return "ENGINE";
    }

    /// @notice Parses the expected assets to receive from a call on integration
    /// @param _selector The function selector for the callOnIntegration
    /// @param _encodedCallArgs The encoded parameters for the callOnIntegration
    /// @return spendAssetsHandleType_ A type that dictates how to handle granting
    /// the adapter access to spend assets (`None` by default)
    /// @return spendAssets_ The assets to spend in the call
    /// @return spendAssetAmounts_ The max asset amounts to spend in the call
    /// @return incomingAssets_ The assets to receive in the call
    /// @return minIncomingAssetAmounts_ The min asset amounts to receive in the call
    function parseAssetsForMethod(bytes4 _selector, bytes calldata _encodedCallArgs)
        external
        view
        override
        returns (
            IIntegrationManager.SpendAssetsHandleType spendAssetsHandleType_,
            address[] memory spendAssets_,
            uint256[] memory spendAssetAmounts_,
            address[] memory incomingAssets_,
            uint256[] memory minIncomingAssetAmounts_
        )
    {
        require(_selector == TAKE_ORDER_SELECTOR, "parseIncomingAssets: _selector invalid");

        (uint256 minWethAmount, uint256 mlnTokenAmount) = __decodeCallArgs(_encodedCallArgs);

        spendAssets_ = new address[](1);
        spendAssets_[0] = MLN_TOKEN;
        spendAssetAmounts_ = new uint256[](1);
        spendAssetAmounts_[0] = mlnTokenAmount;

        incomingAssets_ = new address[](1);
        incomingAssets_[0] = WETH_TOKEN;
        minIncomingAssetAmounts_ = new uint256[](1);
        minIncomingAssetAmounts_[0] = minWethAmount;

        return (
            IIntegrationManager.SpendAssetsHandleType.Transfer,
            spendAssets_,
            spendAssetAmounts_,
            incomingAssets_,
            minIncomingAssetAmounts_
        );
    }

    /// @notice Trades MLN for discounted ETH via the Engine contract
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

        __approveMaxAsNeeded(MLN_TOKEN, ENGINE, mlnTokenAmount);

        IEngine(ENGINE).sellAndBurnMln(mlnTokenAmount);

        IWETH(payable(WETH_TOKEN)).deposit{value: payable(address(this)).balance}();
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to decode the encoded call arguments
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

    /// @notice Gets the `ENGINE` variable
    /// @return engine_ The `ENGINE` variable value
    function getEngine() external view returns (address engine_) {
        return ENGINE;
    }

    /// @notice Gets the `MLN_TOKEN` variable
    /// @return mlnToken_ The `MLN_TOKEN` variable value
    function getMlnToken() external view returns (address mlnToken_) {
        return MLN_TOKEN;
    }

    /// @notice Gets the `WETH_TOKEN` variable
    /// @return wethToken_ The `WETH_TOKEN` variable value
    function getWethToken() external view returns (address wethToken_) {
        return WETH_TOKEN;
    }
}
