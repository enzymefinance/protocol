pragma solidity 0.6.1;

import "./Hub.sol";
import "../../dependencies/DSAuth.sol";

/// @notice Has one Hub
contract Spoke is DSAuth {
    Hub public hub;
    Hub.Routes public routes;
    bool public initialized;

    modifier onlyInitialized() {
        require(initialized, "Component not yet initialized");
        _;
    }

    modifier notShutDown() {
        require(!hub.isShutDown(), "Hub is shut down");
        _;
    }

    constructor(address _hub) public {
        hub = Hub(_hub);
        setAuthority(hub);
        setOwner(address(hub)); // temporary, to allow initialization
    }

    function initialize(address[11] calldata _spokes) external auth {
        require(msg.sender == address(hub));
        require(!initialized, "Already initialized");
        routes = Hub.Routes(
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
            _spokes[10]
        );
        initialized = true;
        setOwner(address(0));
    }

    function engine() public view virtual returns (address) { return routes.engine; }
    function mlnToken() public view virtual returns (address) { return routes.mlnToken; }
    function priceSource() public view virtual returns (address) { return hub.priceSource(); }
    function version() public view virtual returns (address) { return routes.version; }
    function registry() public view virtual returns (address) { return routes.registry; }
}

