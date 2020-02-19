pragma solidity 0.6.1;

import "./token/IERC20.sol";
import "./DSMath.sol";

/// @notice Wrapper to ensure tokens are received
contract TokenUser is DSMath {
    function safeTransfer(
        address _token,
        address _to,
        uint _value
    ) internal {
        uint receiverPreBalance = IERC20(_token).balanceOf(_to);
        IERC20(_token).transfer(_to, _value);
        uint receiverPostBalance = IERC20(_token).balanceOf(_to);
        require(
            add(receiverPreBalance, _value) == receiverPostBalance,
            "Receiver did not receive tokens in transfer"
        );
    }

    function safeTransferFrom(
        address _token,
        address _from,
        address _to,
        uint _value
    ) internal {
        uint receiverPreBalance = IERC20(_token).balanceOf(_to);
        IERC20(_token).transferFrom(_from, _to, _value);
        uint receiverPostBalance = IERC20(_token).balanceOf(_to);
        require(
            add(receiverPreBalance, _value) == receiverPostBalance,
            "Receiver did not receive tokens in transferFrom"
        );
    }
}
