pragma solidity 0.6.1;
pragma experimental ABIEncoderV2;

// import "../dependencies/DSAuth.sol";

interface IRegistry {
    struct Asset {
        bool exists;
        string name;
        string symbol;
        uint decimals;
        string url;
        uint reserveMin;
        uint[] standards;
        bytes4[] sigs;
    }

    struct Exchange {
        bool exists;
        address exchangeAddress;
        bytes4[] sigs;
    }

    struct FundFactory {
        bool exists;
        bytes32 name;
    }

    // STORAGE
    function assetInformation(address) external view returns(Asset memory);
    function engine() external view returns(address);
    function exchangeInformation(address) external view returns(Exchange memory);
    function fundNameHashToOwner(bytes32) external view returns(address);
    function fundsToFundFactories(address) external view returns(address);
    function incentive() external view returns(uint256);
    function isFeeRegistered(address) external view returns(bool);
    function MAX_FUND_NAME_BYTES() external view returns(uint256);
    function MAX_REGISTERED_ENTITIES() external view returns(uint256);
    function MGM() external view returns(address);
    function mlnToken() external view returns(address);
    function nativeAsset() external view returns(address);
    function priceSource() external view returns(address);
    function registeredAssets(uint256 _index) external view returns(address);
    function registeredExchangeAdapters(uint256 _index) external view returns(address);
    function registeredFundFactories(uint256 _index) external view returns(address);
    function fundFactoryInformation(address) external view returns(FundFactory memory);
    function fundFactoryNameExists(bytes32) external view returns(bool);

    // FUNCTIONS
    function adapterMethodIsAllowed(address _adapter, bytes4 _sig) external view returns (bool);
    function assetIsRegistered(address _asset) external view returns (bool);
    function assetMethodIsAllowed(address _asset, bytes4 _sig) external view returns (bool);
    function canUseFundName(address _user, string calldata _name) external view returns (bool);
    function exchangeAdapterIsRegistered(address _adapter) external view returns (bool);
    function exchangeForAdapter(address _adapter) external view returns (address);
    function getAdapterFunctionSignatures(address _adapter)
        external
        view
        returns (bytes4[] memory);
    function getRegisteredFundFactories() external view returns (address[] memory);
    function getDecimals(address _asset) external view returns (uint256);
    function getName(address _asset) external view returns (string memory);
    function getRegisteredAssets() external view returns (address[] memory);
    function getRegisteredExchangeAdapters() external view returns (address[] memory);
    function getReserveMin(address _asset) external view returns (uint256);
    function getSymbol(address _asset) external view returns (string memory);
    function isFund(address _who) external view returns (bool);
    function isFundFactory(address _who) external view returns (bool);
    function isHub(address _who) external view returns (bool);
    function isValidFundName(string calldata _name) external pure returns (bool);

    // Caller: FundFactory contract only:
    function registerFund(address _fund, address _owner, string calldata _name) external;
    function reserveFundName(address _owner, string calldata _name) external;

    // Caller: Auth only:
    function deregisterFees(address[] calldata _fees) external;
    function registerAsset(
        address _asset,
        string calldata _name,
        string calldata _symbol,
        string calldata _url,
        uint256 _reserveMin,
        uint256[] calldata _standards,
        bytes4[] calldata _sigs
    ) external;
    function registerExchangeAdapter(
        address _exchange,
        address _adapter,
        bytes4[] calldata _sigs
    ) external;
    function registerFees(address[] calldata _fees) external;
    function registerFundFactory(address _fundFactory, bytes32 _name) external;
    function removeAsset(address _asset, uint _assetIndex) external;
    function removeExchangeAdapter(address _adapter, uint _adapterIndex) external;
    function setEngine(address _engine) external;
    function setIncentive(uint _weiAmount) external;
    function setMGM(address _MGM) external;
    function setMlnToken(address _mlnToken) external;
    function setNativeAsset(address _nativeAsset) external;
    function setPriceSource(address _priceSource) external;
    function updateAsset(
        address _asset,
        string calldata _name,
        string calldata _symbol,
        string calldata _url,
        uint _reserveMin,
        uint[] calldata _standards,
        bytes4[] calldata _sigs
    ) external;
    function updateExchangeAdapter(
        address _exchange,
        address _adapter,
        bytes4[] calldata _sigs
    ) external;

    // INHERITED: DSAuth
    // STORAGE
    // function authority() external view returns (DSAuthority);
    function owner() external view returns(address);

    // FUNCTIONS
    // function setAuthority(DSAuthority authority_) external;
    // function setOwner(address _owner) external;
}
