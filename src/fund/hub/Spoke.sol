pragma solidity 0.6.4;
pragma experimental ABIEncoderV2;

import "./Hub.sol";
import "./ISpoke.sol";
import "../../dependencies/DSAuth.sol";

/// @title Spoke Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Has one Hub
contract Spoke is ISpoke, DSAuth {

    IHub.Routes routes;

    Hub hub;
    bool public override initialized;

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

    function initialize(address[6] calldata _spokes) external auth {
        require(msg.sender == address(hub));
        require(!initialized, "Already initialized");
        routes = IHub.Routes(
            _spokes[0],
            _spokes[1],
            _spokes[2],
            _spokes[3],
            _spokes[4],
            _spokes[5]
        );
        initialized = true;
        setOwner(address(0));
    }

    function priceSource() public view override returns (address) { return hub.priceSource(); }
    function fundFactory() public view returns (address) { return routes.fundFactory; }
    function getHub() public view override returns (IHub) { return IHub(address(hub)); }
    function getRoutes()
        public
        view
        override
        returns (IHub.Routes memory)
    {
        return routes;
    }
}
