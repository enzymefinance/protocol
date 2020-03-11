pragma solidity 0.6.1;
pragma experimental ABIEncoderV2;

import "../hub/Spoke.sol";
import "./Trading.sol";
import "../../dependencies/TokenUser.sol";
import "../../factory/Factory.sol";

contract Vault is TokenUser, Spoke, Trading {
    constructor(
        address _hub,
        address[] memory _exchanges,
        address[] memory _adapters,
        address _registry
    )
        public
        Spoke(_hub)
        Trading(_exchanges, _adapters, _registry)
    {}

    // EXTERNAL FUNCTIONS

    /// @notice Receive ether function (used to receive ETH from WETH)
    receive() external payable {}

    function withdraw(address _token, uint256 _amount) external auth {
        __safeTransfer(_token, msg.sender, _amount);
    }
}

contract VaultFactory is Factory {
    event NewInstance(
        address indexed hub,
        address indexed instance,
        address[] exchanges,
        address[] adapters
    );

    function createInstance(
        address _hub,
        address[] memory _exchanges,
        address[] memory _adapters,
        address _registry
    )
        public
        returns (address)
    {
        address vault = address(new Vault(_hub, _exchanges, _adapters, _registry));
        childExists[vault] = true;
        emit NewInstance(
            _hub,
            vault,
            _exchanges,
            _adapters
        );
        return vault;
    }
}
