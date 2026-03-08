/**
 * Polymarket CLOB Order Signing
 *
 * Uses EIP-712 typed data signatures via viem to sign orders
 * for the CTF Exchange contract on Polygon.
 */

import {
  createWalletClient,
  http,
  type WalletClient,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { polygon } from 'viem/chains';
import type { ClobOrderRequest, ClobSignedOrder } from './types';

// ── Polymarket Contract Addresses (Polygon Mainnet) ──

const CTF_EXCHANGE = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E' as Address;
const NEG_RISK_CTF_EXCHANGE = '0xC5d563A36AE78145C45a50134d48A1215220f80a' as Address;

// ── EIP-712 Domain & Types ──

const ORDER_DOMAIN = {
  name: 'ClobExchange',
  version: '1',
  chainId: 137,
  verifyingContract: CTF_EXCHANGE,
} as const;

const ORDER_TYPES = {
  Order: [
    { name: 'salt', type: 'uint256' },
    { name: 'maker', type: 'address' },
    { name: 'signer', type: 'address' },
    { name: 'taker', type: 'address' },
    { name: 'tokenId', type: 'uint256' },
    { name: 'makerAmount', type: 'uint256' },
    { name: 'takerAmount', type: 'uint256' },
    { name: 'expiration', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'feeRateBps', type: 'uint256' },
    { name: 'side', type: 'uint8' },
    { name: 'signatureType', type: 'uint8' },
  ],
} as const;

// ── USDC Precision ──

const USDC_DECIMALS = 6;
const CONDITIONAL_TOKEN_DECIMALS = 6;

function toUsdcUnits(amount: number): string {
  return Math.round(amount * 10 ** USDC_DECIMALS).toString();
}

function toTokenUnits(amount: number): string {
  return Math.round(amount * 10 ** CONDITIONAL_TOKEN_DECIMALS).toString();
}

// ── Random Salt ──

function generateSalt(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return BigInt('0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')).toString();
}

// ── Wallet Client ──

let walletClientCache: { client: WalletClient; address: Address } | null = null;

export function getWalletClient(): { client: WalletClient; address: Address } {
  if (walletClientCache) return walletClientCache;

  const privateKey = process.env.POLYGON_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('Missing POLYGON_PRIVATE_KEY in .env.local');
  }

  const account = privateKeyToAccount(privateKey as Hex);
  const client = createWalletClient({
    account,
    chain: polygon,
    transport: http('https://polygon-rpc.com'),
  });

  walletClientCache = { client, address: account.address };
  return walletClientCache;
}

/**
 * Get the wallet address (maker address).
 */
export function getWalletAddress(): Address {
  return getWalletClient().address;
}

/**
 * Check if a wallet private key is configured.
 */
export function hasWalletKey(): boolean {
  return !!process.env.POLYGON_PRIVATE_KEY;
}

/**
 * Sign an order using EIP-712 typed data.
 *
 * For BUY orders:
 *   makerAmount = USDC spent (price * size)
 *   takerAmount = outcome tokens received (size)
 *
 * For SELL orders:
 *   makerAmount = outcome tokens spent (size)
 *   takerAmount = USDC received (price * size)
 */
export async function signOrder(
  request: ClobOrderRequest,
  negRisk: boolean = false
): Promise<ClobSignedOrder> {
  const { client, address } = getWalletClient();

  const side = request.side === 'BUY' ? 0 : 1;
  const salt = generateSalt();

  // Calculate amounts based on side
  let makerAmount: string;
  let takerAmount: string;

  if (request.side === 'BUY') {
    // Maker gives USDC, taker gives outcome tokens
    makerAmount = toUsdcUnits(request.price * request.size);
    takerAmount = toTokenUnits(request.size);
  } else {
    // Maker gives outcome tokens, taker gives USDC
    makerAmount = toTokenUnits(request.size);
    takerAmount = toUsdcUnits(request.price * request.size);
  }

  const expiration = request.expiration?.toString() ?? '0';

  const orderData = {
    salt: BigInt(salt),
    maker: address,
    signer: address,
    taker: '0x0000000000000000000000000000000000000000' as Address,
    tokenId: BigInt(request.tokenId),
    makerAmount: BigInt(makerAmount),
    takerAmount: BigInt(takerAmount),
    expiration: BigInt(expiration),
    nonce: BigInt(0),
    feeRateBps: BigInt(0),
    side,
    signatureType: 0,
  };

  const domain = negRisk
    ? { ...ORDER_DOMAIN, verifyingContract: NEG_RISK_CTF_EXCHANGE }
    : ORDER_DOMAIN;

  const account = privateKeyToAccount(process.env.POLYGON_PRIVATE_KEY as Hex);
  const signature = await client.signTypedData({
    account,
    domain,
    types: ORDER_TYPES,
    primaryType: 'Order',
    message: orderData,
  });

  return {
    salt,
    maker: address,
    signer: address,
    taker: '0x0000000000000000000000000000000000000000',
    tokenId: request.tokenId,
    makerAmount,
    takerAmount,
    expiration,
    nonce: '0',
    feeRateBps: '0',
    side,
    signatureType: 0,
    signature,
  };
}
