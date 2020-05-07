pragma solidity 0.6.4;

import "./token/IERC20.sol";
import "./DSMath.sol";
import "./token/IERC20Flexible.sol";

/// @title TokenUser Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Wrapper to ensure safe token operations
contract TokenUser is DSMath {
    /// @notice Decrease allowance for an ERC20 token
    /// @dev This should almost always be used instead of setting with approve(),
    /// unless explicitly setting the allowance to 0
    function __decreaseApproval(
        address _token,
        address _to,
        uint256 _value
    )
        internal
    {
        uint256 allowance = IERC20(_token).allowance(address(this), _to);
        require(
            allowance >= _value,
            "__decreaseApproval: cannot decrease by a value greater than allowance"
        );
        IERC20Flexible(_token).approve(_to, sub(allowance, _value));
    }

    /// @notice Increase allowance for an ERC20 token
    /// @dev This should almost always be used instead of setting with approve()
    function __increaseApproval(
        address _token,
        address _to,
        uint256 _value
    )
        internal
    {
        uint256 allowance = IERC20(_token).allowance(address(this), _to);
        IERC20Flexible(_token).approve(_to, add(allowance, _value));
    }

    /// @notice Helper to transfer ERC20 tokens from the msg.sender to a recipient
    function __safeTransfer(address _token, address _to, uint256 _value) internal {
        uint256 receiverPreBalance = IERC20(_token).balanceOf(_to);
        IERC20Flexible(_token).transfer(_to, _value);
        uint256 receiverPostBalance = IERC20(_token).balanceOf(_to);
        require(
            add(receiverPreBalance, _value) == receiverPostBalance,
            "__safeTransfer: Receiver did not receive tokens in transfer"
        );
    }

    /// @notice Helper to transfer ERC20 tokens from an arbitrary sender to a recipient
    function __safeTransferFrom(address _token, address _from, address _to, uint256 _value)
        internal
    {
        uint256 receiverPreBalance = IERC20(_token).balanceOf(_to);
        IERC20Flexible(_token).transferFrom(_from, _to, _value);
        uint256 receiverPostBalance = IERC20(_token).balanceOf(_to);
        require(
            add(receiverPreBalance, _value) == receiverPostBalance,
            "__safeTransferFrom: Receiver did not receive tokens in transferFrom"
        );
    }
}
