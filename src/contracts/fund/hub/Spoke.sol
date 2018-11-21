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
        address engine;
        address mlnAddress;
    }

    Hub public hub;
    Routes public routes;
    bool public initialized;

    constructor(address _hub) {
        hub = Hub(_hub);
        setAuthority(hub);
        // TODO: remove "owner" authority?
    }

    function initialize(address[12] _spokes) {  //TODO: onlyInitialized modifier?
        require(!initialized, "Already initialized");
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
            _spokes[9],
            _spokes[10],
            _spokes[11]
        );
        initialized = true;
    }

    function engine() view returns (address) { return routes.engine; }
    function mlnAddress() view returns (address) { return routes.mlnAddress; }
    function priceSource() view returns (address) { return routes.priceSource; }
    function version() view returns (address) { return routes.version; }
}

