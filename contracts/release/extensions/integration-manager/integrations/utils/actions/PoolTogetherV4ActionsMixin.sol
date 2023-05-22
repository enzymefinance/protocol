// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../../../../../external-interfaces/IPoolTogetherV4PrizeDistributor.sol";
import "../../../../../../external-interfaces/IPoolTogetherV4PrizePool.sol";
import "../../../../../../external-interfaces/IPoolTogetherV4Ticket.sol";
import "../../../../../utils/AssetHelpers.sol";

/// @title PoolTogetherV4ActionsMixin Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Mixin contract for interacting with the PoolTogether lending functions
abstract contract PoolTogetherV4ActionsMixin is AssetHelpers {
    /// @dev Helper to execute lending
    function __poolTogetherV4Lend(
        address _recipient,
        address _token,
        uint256 _amount,
        address _ptToken
    ) internal {
        address prizePoolAddress = IPoolTogetherV4Ticket(_ptToken).controller();

        __approveAssetMaxAsNeeded(_token, prizePoolAddress, _amount);

        IPoolTogetherV4PrizePool(prizePoolAddress).depositToAndDelegate(
            _recipient,
            _amount,
            _recipient
        );
    }

    /// @dev Helper to execute redeeming
    function __poolTogetherV4Redeem(
        address _recipient,
        address _ptToken,
        uint256 _amount
    ) internal {
        address prizePoolAddress = IPoolTogetherV4Ticket(_ptToken).controller();

        IPoolTogetherV4PrizePool(prizePoolAddress).withdrawFrom(_recipient, _amount);
    }

    /// @dev Helper to execute claiming
    function __poolTogetherV4Claim(
        address _recipient,
        address _prizeDistributorAddress,
        uint32[] memory _drawIds,
        bytes memory _winningPicks
    ) internal {
        IPoolTogetherV4PrizeDistributor(_prizeDistributorAddress).claim(
            _recipient,
            _drawIds,
            _winningPicks
        );
    }
}
