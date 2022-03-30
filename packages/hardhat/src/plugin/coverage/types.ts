export interface CodeCoverageConfig {
  path: string;
  include: (RegExp | string)[];
  exclude: (RegExp | string)[];
  clear: boolean;
}

export interface CodeCoverageUserConfig {
  path?: string;
  include?: string[];
  exclude?: string[];
  clear?: boolean;
}

declare module 'hardhat/types/config' {
  export interface HardhatUserConfig {
    codeCoverage?: CodeCoverageUserConfig;
  }

  export interface HardhatConfig {
    codeCoverage: CodeCoverageConfig;
  }
}
