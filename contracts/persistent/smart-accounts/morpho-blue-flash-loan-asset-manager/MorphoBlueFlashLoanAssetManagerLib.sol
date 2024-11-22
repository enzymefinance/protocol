// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {Address} from "openzeppelin-solc-0.8/utils/Address.sol";
import {IERC20} from "../../../external-interfaces/IERC20.sol";
import {IMorphoBlue} from "../../../external-interfaces/IMorphoBlue.sol";
import {IMorphoBlueFlashLoanCallback} from "../../../external-interfaces/IMorphoBlueFlashLoanCallback.sol";
import {WrappedSafeERC20 as SafeERC20} from "../../../utils/0.8.19/open-zeppelin/WrappedSafeERC20.sol";
import {IMorphoBlueFlashLoanAssetManager} from "./IMorphoBlueFlashLoanAssetManager.sol";

/// @title MorphoBlueFlashLoanAssetManagerLib Contract
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice An asset manager contract for executing flash loans on Morpho Blue
/// @dev Intended as implementation contract for a proxy.
/// Must add this contract instance as an asset manager on the intended Enzyme vault.
contract MorphoBlueFlashLoanAssetManagerLib is IMorphoBlueFlashLoanAssetManager, IMorphoBlueFlashLoanCallback {
    using SafeERC20 for IERC20;

    IMorphoBlue public immutable MORPHO;

    // `owner`: The authorized caller of this contract instance
    address internal owner;
    // `borrowedAssetsRecipient`: The address where all borrowed assets are transferred. Generally the VaultProxy.
    address internal borrowedAssetsRecipient;

    error MorphoBlueFlashLoanAssetManager__FlashLoan__Unauthorized();
    error MorphoBlueFlashLoanAssetManager__Init__AlreadyInitialized();
    error MorphoBlueFlashLoanAssetManager__OnMorphoFlashLoan__UnauthorizedCaller();
    error MorphoBlueFlashLoanAssetManager__OnMorphoFlashLoan__UnauthorizedInitiator();

    event BorrowedAssetsRecipientSet(address borrowedAssetsRecipient);
    event OwnerSet(address owner);

    constructor(address _morphoBlueAddress) {
        MORPHO = IMorphoBlue(_morphoBlueAddress);
    }

    /// @notice Initializes the contract
    /// @param _owner The owner (authorized caller) of the contract
    /// @param _borrowedAssetsRecipient The recipient of the flash loan borrowed assets
    function init(address _owner, address _borrowedAssetsRecipient) external {
        if (getOwner() != address(0)) revert MorphoBlueFlashLoanAssetManager__Init__AlreadyInitialized();

        __setOwner(_owner);
        __setBorrowedAssetsRecipient(_borrowedAssetsRecipient);
    }

    /// @notice Executes a flash loan on Morpho Blue
    /// @param _assetAddress The asset to borrow
    /// @param _amount The amount to borrow
    /// @param _calls Call[] items to execute during the flash loan
    function flashLoan(address _assetAddress, uint256 _amount, Call[] calldata _calls) external override {
        if (msg.sender != getOwner()) revert MorphoBlueFlashLoanAssetManager__FlashLoan__Unauthorized();

        MORPHO.flashLoan({
            _token: _assetAddress,
            _assets: _amount,
            _data: abi.encode(ForwardData({borrowedAssetAddress: _assetAddress, calls: _calls}))
        });
    }

    /// @dev Helper to set `borrowedAssetsRecipient`
    function __setBorrowedAssetsRecipient(address _borrowedAssetsRecipient) internal {
        borrowedAssetsRecipient = _borrowedAssetsRecipient;

        emit BorrowedAssetsRecipientSet(_borrowedAssetsRecipient);
    }

    /// @dev Helper to set `owner`
    function __setOwner(address _owner) internal {
        owner = _owner;

        emit OwnerSet(_owner);
    }

    //==================================================================================================================
    // IMorphoBlueFlashLoanCallback
    //==================================================================================================================

    /// @notice Required callback function for Morpho Blue flash loans
    function onMorphoFlashLoan(uint256 _amount, bytes calldata _data) external {
        // Only Morpho can call directly, and it only does so to the requesting user's contract
        if (msg.sender != address(MORPHO)) {
            revert MorphoBlueFlashLoanAssetManager__OnMorphoFlashLoan__UnauthorizedCaller();
        }

        // Decode forwarded data
        ForwardData memory forwardData = abi.decode(_data, (ForwardData));
        IERC20 asset = IERC20(forwardData.borrowedAssetAddress);
        Call[] memory calls = forwardData.calls;

        // Send full balance of borrowed asset to recipient.
        // Leaving 0-balance makes calculating repayment amount to transfer simpler,
        // and prevents griefing by sending surplus assets here.
        asset.safeTransfer(getBorrowedAssetsRecipient(), asset.balanceOf(address(this)));

        // Execute calls.
        // The final `Call[]` items should transfer exact "asset + premium" amounts to this contract to repay the loan.
        for (uint256 i; i < calls.length; i++) {
            Call memory call = calls[i];

            Address.functionCall({target: call.target, data: call.data});
        }

        asset.safeApprove(address(MORPHO), _amount);
    }

    //==================================================================================================================
    // Storage getters
    //==================================================================================================================

    /// @notice Gets the recipient of the flash loan borrowed assets
    /// @return borrowedAssetsRecipient_ The recipient
    function getBorrowedAssetsRecipient() public view returns (address borrowedAssetsRecipient_) {
        return borrowedAssetsRecipient;
    }

    /// @notice Gets the owner (authorized caller) of the contract
    /// @return owner_ The owner
    function getOwner() public view returns (address owner_) {
        return owner;
    }
}
