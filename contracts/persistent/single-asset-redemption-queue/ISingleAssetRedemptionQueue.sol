// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

import {IERC20} from "../../external-interfaces/IERC20.sol";

pragma solidity >=0.6.0 <0.9.0;

/// @title ISingleAssetRedemptionQueue Interface
/// @author Enzyme Council <security@enzyme.finance>
interface ISingleAssetRedemptionQueue {
    function init(
        address _vaultProxy,
        IERC20 _redemptionAsset,
        uint256 _bypassableSharesAmount,
        address[] calldata _managers
    ) external;

    function addManagers(address[] calldata _managers) external;

    function getBypassableSharesThreshold() external view returns (uint256 sharesAmount_);

    function getNextNewId() external view returns (uint256 id_);

    function getNextQueuedId() external view returns (uint256 id_);

    function getRedemptionAsset() external view returns (IERC20 asset_);

    function getSharesForRequest(uint256 _id) external view returns (uint256 sharesAmount_);

    function getUserForRequest(uint256 _id) external view returns (address user_);

    function getVaultProxy() external view returns (address vaultProxy_);

    function isManager(address _user) external view returns (bool isManager_);

    function queueIsShutdown() external view returns (bool isShutdown_);

    function redeemFromQueue(uint256 _endId, uint256[] calldata _idsToBypass) external;

    function removeManagers(address[] calldata _managers) external;

    function requestRedeem(uint256 _sharesAmount) external returns (uint256 id_);

    function setBypassableSharesThreshold(uint256 _nextSharesThreshold) external;

    function setRedemptionAsset(IERC20 _nextRedemptionAsset) external;

    function shutdown() external;

    function withdrawRequest(uint256 _id) external;
}
