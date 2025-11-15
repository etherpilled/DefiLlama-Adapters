const ADDRESSES = require("../helper/coreAssets.json");
const { unwrapUniswapV2LPs } = require("../helper/unwrapLPs");

// Staking vault constants (existing)
const ITP_VAULT_ADDRRESS = "0x23371aEEaF8718955C93aEC726b3CAFC772B9E37";
const ITP_ON_OPTIMISM = "0x0a7B751FcDBBAA8BB988B9217ad5Fb5cfe7bf7A0";
const VELO_PRICE_ORACLE = "0x395942C2049604a314d39F370Dfb8D87AAC89e16";
const WETH_TOKEN_ADDRESS = ADDRESSES.optimism.WETH_1;
const VELO_TOKEN_ADDRESS = "0x3c8b650257cfb5f272f799f5e2b4e65093a11a05";
const OP_TOKEN_ADDRESS = ADDRESSES.optimism.OP;
const USDC_OP_TOKEN_ADDRESS = ADDRESSES.optimism.USDC_CIRCLE;

const ITP_STAKED_ABI =
  "function getVaultInfo() view returns (uint256, uint256, uint256, uint256, uint256, uint256[], uint256)";

// Auto-compounder contracts and their LP tokens
const AUTO_COMPOUNDERS = [
  {
    vault: "0x569D92f0c94C04C74c2f3237983281875D9e2247", // ITP/VELO
    lp: "0xC04754F8027aBBFe9EeA492C9cC78b66946a07D1",
  },
  {
    vault: "0xFCEa66a3333a4A3d911ce86cEf8Bdbb8bC16aCA6", // ITP/DHT
    lp: "0x3d5cbc66c366a51975918a132b1809c34d5c6fa2",
  },
  {
    vault: "0x2811a577cf57A2Aa34e94B0Eb56157066717563f", // ITP/wstETH
    lp: "0xdAD7B4C48b5B0BE1159c674226BE19038814eBf6",
  },
  {
    vault: "0x8A2e22BdA1fF16bdEf27b6072e087452fa874b69", // ITP/OP
    lp: "0x79F1af622FE2C636a2d946F03A62D1DfC8cA6de4",
  },
  {
    vault: "0x3092F8dE262F363398F15DDE5E609a752938Cc11", // ITP/WBTC
    lp: "0x93e40C357C4Dc57b5d2B9198a94Da2bD1C2e89cA",
  },
  {
    vault: "0xC4628802a42F83E5bce3caB05A4ac2F6E485F276", // ITP/USDC
    lp: "0xB84C932059A49e82C2c1bb96E29D59Ec921998Be",
  },
];

// Staking TVL calculation (existing implementation)
const getStakedTVL = async (api) => {
  const { chain } = api;
  let stakedTVL = 0;

  if (chain === "optimism") {
    // Fetch ITP price using VELO price oracle
    const fetchVeloPrice = await api.call({
      abi: "function getManyRatesWithConnectors(uint8, address[]) view returns (uint256[] memory rates)",
      target: VELO_PRICE_ORACLE,
      params: [
        1,
        [
          ITP_ON_OPTIMISM,
          VELO_TOKEN_ADDRESS,
          WETH_TOKEN_ADDRESS,
          OP_TOKEN_ADDRESS,
          USDC_OP_TOKEN_ADDRESS,
        ],
      ],
    });

    const price = parseInt(fetchVeloPrice[0]) / Math.pow(10, 18);

    // Get staked balance from vault
    const stakedBalance = await api.call({
      abi: ITP_STAKED_ABI,
      target: ITP_VAULT_ADDRRESS,
    });

    const staked = parseInt(stakedBalance[0]) / Math.pow(10, 18);
    stakedTVL = staked * price;
  }

  api.addUSDValue(stakedTVL);
};

// Auto-compounder TVL calculation (new implementation)
const getAutoCompounderTVL = async (api) => {
  const { chain } = api;

  if (chain === "optimism") {
    // Get the LP token balances held by all auto-compounder contracts
    const balances = await api.multiCall({
      abi: "uint256:balance",
      calls: AUTO_COMPOUNDERS.map((ac) => ac.vault),
    });

    // Create array of [lpToken, balance] pairs for unwrapping
    const lpBalances = AUTO_COMPOUNDERS.map((ac, i) => ({
      token: ac.lp,
      balance: balances[i],
    }));

    // Add LP token balances to API (they will be auto-unwrapped by DeFiLlama)
    lpBalances.forEach(({ token, balance }) => {
      api.add(token, balance);
    });

    // Unwrap LP tokens to get underlying token values
    await unwrapUniswapV2LPs(api.getBalances(), api);
  }
};

module.exports = {
  methodology:
    "Tracks ITP token staking vault TVL using VELO price oracle, and auto-compounder vault TVL by unwrapping LP tokens held by vault contracts",
  optimism: {
    tvl: getAutoCompounderTVL,
    staking: getStakedTVL,
  },
};
