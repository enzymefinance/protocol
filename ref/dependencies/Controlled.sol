pragma solidity ^0.4.21;


/// @notice Light, append-only access control, like having multiple owners
contract Controlled {

    mapping (address => bool) controllers;

    modifier onlyController {
        require(isController(msg.sender));
        _;
    }

    function Controlled(address[] _initialControllers) {
        for (uint i = 0; i < _initialControllers.length; i++) {
            controllers[_initialControllers[i]] = true;
        }
    }

    function addControllers(address[] _newControllers) public onlyController {
        for (uint i = 0; i < _newControllers.length; i++) {
            addController(_newControllers[i]);
        }
    }

    function addController(address _newController) public onlyController {
        controllers[_newController] = true;
    }

    function isController(address _address) public view returns (bool) {
        return controllers[_address];
    }
}

