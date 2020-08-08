// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "../interfaces/IChai.sol";
import "../utils/AdapterBase.sol";

/// @title ChaiAdapter Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Adapter for Chai <https://github.com/dapphub/chai>
contract ChaiAdapter is AdapterBase {
    using SafeERC20 for IERC20;

    address immutable public CHAI;
    address immutable public DAI;

    constructor(address _registry, address _chai, address _dai) public AdapterBase(_registry) {
        CHAI = _chai;
        DAI = _dai;
    }

    /// @notice Provides a constant string identifier for an adapter
    /// @return An identifier string
    function identifier() external pure override returns (string memory) {
        return "CHAI";
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
        view
        override
        returns (
            address[] memory spendAssets_,
            uint256[] memory spendAssetAmounts_,
            address[] memory incomingAssets_,
            uint256[] memory minIncomingAssetAmounts_
        )
    {
        if (_selector == LEND_SELECTOR) {
            (
                uint256 daiAmount,
                uint256 minChaiAmount
            ) = __decodeCallArgs(_encodedCallArgs);

            spendAssets_ = new address[](1);
            spendAssets_[0] = DAI;
            spendAssetAmounts_ = new uint256[](1);
            spendAssetAmounts_[0] = daiAmount;

            incomingAssets_ = new address[](1);
            incomingAssets_[0] = CHAI;
            minIncomingAssetAmounts_ = new uint256[](1);
            minIncomingAssetAmounts_[0] = minChaiAmount;
        }
        else if (_selector == REDEEM_SELECTOR) {
            (
                uint256 chaiAmount,
                uint256 minDaiAmount
            ) = __decodeCallArgs(_encodedCallArgs);

            spendAssets_ = new address[](1);
            spendAssets_[0] = CHAI;
            spendAssetAmounts_ = new uint256[](1);
            spendAssetAmounts_[0] = chaiAmount;

            incomingAssets_ = new address[](1);
            incomingAssets_[0] = DAI;
            minIncomingAssetAmounts_ = new uint256[](1);
            minIncomingAssetAmounts_[0] = minDaiAmount;
        }
        else {
            revert("parseIncomingAssets: _selector invalid");
        }
    }

    /// @notice Lend Dai for Chai
    /// @param _encodedCallArgs Encoded order parameters
    /// @param _encodedAssetTransferArgs Encoded args for expected assets to spend and receive
    function lend(bytes calldata _encodedCallArgs, bytes calldata _encodedAssetTransferArgs)
        external
        onlyVault
        fundAssetsTransferHandler(_encodedAssetTransferArgs)
    {
        (uint256 daiAmount,) = __decodeCallArgs(_encodedCallArgs);
        require(daiAmount > 0, "lend: daiAmount must be >0");

        // Execute Lend on Chai
        // TODO: could use Vault as src and not use fundAssetsTransferHandler to save gas
        IERC20(DAI).safeIncreaseAllowance(CHAI, daiAmount);
        IChai(CHAI).join(address(this), daiAmount);
    }

    /// @notice Redeem Chai for Dai
    /// @param _encodedCallArgs Encoded order parameters
    /// @param _encodedAssetTransferArgs Encoded args for expected assets to spend and receive
    function redeem(bytes calldata _encodedCallArgs, bytes calldata _encodedAssetTransferArgs)
        external
        onlyVault
        fundAssetsTransferHandler(_encodedAssetTransferArgs)
    {
        (uint256 chaiAmount,) = __decodeCallArgs(_encodedCallArgs);
        require(chaiAmount > 0, "redeem: chaiAmount must be >0");

        // Execute Redeem on Chai
        IChai(CHAI).exit(address(this), chaiAmount);
    }

    // PRIVATE FUNCTIONS

    function __decodeCallArgs(bytes memory _encodedCallArgs)
        private
        pure
        returns (uint256 outgoingAmount_, uint256 minIncomingAmount_)
    {
        return abi.decode(_encodedCallArgs, (uint256,uint256));
    }
}
