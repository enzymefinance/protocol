pragma solidity ^0.4.21;

import "ERC20.i.sol";
import "math.sol";

/// @notice Wrapper to ensure tokens are received
contract TokenUser is DSMath {
    function safeTransfer(
        address _token,
        address _to,
        uint _value
    ) {
        uint receiverPreBalance = ERC20(_token).balanceOf(_to);
        ERC20(_token).transfer(_to, _value);
        uint receiverPostBalance = ERC20(_token).balanceOf(_to);
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
    ) {
        uint receiverPreBalance = ERC20(_token).balanceOf(_to);
        ERC20(_token).transferFrom(_from, _to, _value);
        uint receiverPostBalance = ERC20(_token).balanceOf(_to);
        require(
            add(receiverPreBalance, _value) == receiverPostBalance,
            "Receiver did not receive tokens in transferFrom"
        );
 
    }
}
