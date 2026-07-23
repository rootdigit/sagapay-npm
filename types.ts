// types.ts
export type NetworkType = 'ERC20' | 'BEP20' | 'TRC20' | 'POLYGON' | 'SOLANA';
export type TransactionStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type AddressType = 'TEMPORARY' | 'PERMANENT';
export type TransactionType = 'deposit' | 'withdrawal';


export interface Token {
    networkType: NetworkType;
    contractAddress: string;
    symbol: string;
    name: string;
    decimals: number;
}

export interface Transaction {
    id: string;
    transactionType: TransactionType;
    status: TransactionStatus;
    amount: string;
    createdAt: string;
    updatedAt: string;
    txHash: string | null;
    networkType: NetworkType;
    contractAddress: string;
    address: string;
    udf: string | null;
    token: Token;
    confirmations?: number; // deposit transactions only
    fee?: string; // withdrawal transactions only
    processedAt?: string | null; // withdrawal transactions only
}

export interface CheckTransactionStatusResponse {
    address: string | null;
    transactionType: TransactionType;
    count: number;
    transactions: Transaction[];
}

export interface Balance {
    raw: string;
    formatted: string;
}

export interface FetchWalletBalanceResponse {
    address: string;
    networkType: NetworkType;
    contractAddress: string;
    token: {
        symbol: string;
        name: string;
        decimals: number;
    };
    balance: Balance;
}

export type IpnType = 'DEPOSIT' | 'WITHDRAWAL';

export interface IpnPayload {
    id: string;
    type: IpnType;
    status: TransactionStatus; // currently always 'COMPLETED'
    address: string;
    networkType: NetworkType;
    amount: string;
    udf?: string | null;
    txHash?: string | null;
    timestamp: string;
}

export interface VerifyIpnRequest {
    txnHash: string;
    type: IpnType;
    amount: string;
    address: string;
}

export interface VerifyIpnResponse {
    verified: boolean;
}