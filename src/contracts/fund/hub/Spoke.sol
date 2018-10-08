pragma solidity ^0.4.21;


import "./Hub.sol";
import "../../dependencies/auth.sol";

// TODO: ACL consumption may be better placed in each component; evaluate this
/// @notice Has one Hub
contract Spoke is DSAuth {
    struct Routes {     // TODO: better naming; also maybe move this to be inherited by Spoke and Hub
        address accounting;
        address feeManager;
        address participation;
        address policyManager;
        address shares;
        address trading;
        address vault;
        address priceSource;
        address canonicalRegistrar;
        address version;
    }

    Hub public hub;
    Routes public routes;
    bool public initialized;

    constructor(address _hub) {
        hub = Hub(_hub);
        setAuthority(hub);
        // TODO: remove "owner" authority?
    }

    function initialize(address[10] _spokes) {
        require(!initialized);
        routes = Routes(
            _spokes[0],
            _spokes[1],
            _spokes[2],
            _spokes[3],
            _spokes[4],
            _spokes[5],
            _spokes[6],
            _spokes[7],
            _spokes[8],
            _spokes[9]
        );
        initialized = true;
    }
}

