/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-var-requires */
const { ethers, constants } = require("ethers");
const { DefenderRelaySigner, DefenderRelayProvider } = require("defender-relay-client/lib/ethers");

const FACADE_ABI = [
  {
    inputs: [
      {
        internalType: "contract IDCAPool[]",
        name: "poolsToEvaluate",
        type: "address[]",
      },
    ],
    name: "evaluatePoolsAsExecutor",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "readyPools",
    outputs: [
      {
        internalType: "address payable[]",
        name: "",
        type: "address[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
];

// Entrypoint for the Autotask
exports.handler = async function (credentials) {
  // Initialize defender relayer provider and signer
  const provider = new DefenderRelayProvider(credentials);
  const signer = new DefenderRelaySigner(credentials, provider, { speed: "fast" });
  const contractAddress = "0x4aEb249De53272A71428D32eC63Fc6b844c9BDAa"; //Kovan
  const facade = new ethers.Contract(contractAddress, FACADE_ABI, signer);

  console.log("Getting ready pools");
  let pools = (await facade.readyPools()).filter(isNonZeroAddress);
  if (pools.length > 0) {
    console.log("Evaluating ready pools: ", pools);
    await facade.evaluatePoolsAsExecutor(pools);
  } else {
    console.log("No ready pools available");
  }
};

function isNonZeroAddress(e) {
  return e !== constants.AddressZero;
}
