pragma solidity ^0.4.21;

import "Hub.sol";
import "auth.sol";

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
        address registry;
        address version;
        address engine;
        address mlnAddress;
    }

    Hub public hub;
    Routes public routes;
    bool public initialized;

    modifier onlyInitialized() {
        require(initialized, "Component not yet initialized");
        _;
    }

    constructor(address _hub) {
        hub = Hub(_hub);
        setAuthority(hub);
        setOwner(hub); // temporary, to allow initialization
    }

    function initialize(address[12] _spokes) public auth {
        require(msg.sender == address(hub));
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
        setOwner(address(0));
    }

    function engine() view returns (address) { return routes.engine; }
    function mlnToken() view returns (address) { return routes.mlnAddress; }
    function priceSource() view returns (address) { return routes.priceSource; }
    function version() view returns (address) { return routes.version; }
    function registry() view returns (address) { return routes.registry; }
}

