import axios from 'axios';
import {
    NetworkType,
    TransactionStatus,
    AddressType,
    TransactionType,
    CheckTransactionStatusResponse,
    FetchWalletBalanceResponse,
    VerifyIpnRequest,
    VerifyIpnResponse
} from './types';

export interface CreateDepositRequest {
    networkType: NetworkType;
    contractAddress: string;
    amount: string;
    ipnUrl: string;
    udf?: string;
    type?: AddressType;
    transferBalance?: boolean;
}

export interface CreateWithdrawalRequest {
    networkType: NetworkType;
    contractAddress: string;
    address: string;
    amount: string;
    ipnUrl: string;
    udf?: string;
}

export interface CreateDepositResponse {
    id: string;
    address: string;
    expiresAt: string | null;
    amount: string;
    status: TransactionStatus;
}

export interface CreateWithdrawalResponse {
    id: string;
    status: TransactionStatus;
    fee: string;
}

export interface CreateWithdrawalOptions {
    /**
     * Sent as the `Idempotency-Key` header: 1-128 letters, digits, `-` or `_`.
     * Retrying with the same key within 24 hours returns the first request's
     * withdrawal instead of creating a second one. Use one key per payout,
     * e.g. your own payout id.
     */
    idempotencyKey?: string;
}

// The API never redirects. Not following redirects keeps the x-api-key and
// x-api-secret headers from being replayed to another host.
const REQUEST_OPTIONS = { timeout: 30_000, maxRedirects: 0 };

export class SagaPayClient {
    private readonly baseURL: string;
    private readonly apiKey: string;
    private readonly apiSecret: string;

    constructor(apiKey: string, apiSecret: string, baseURL: string = 'https://api2.sagapay.io') {
        this.apiKey = apiKey;
        this.apiSecret = apiSecret;
        this.baseURL = baseURL;
    }

    public async createDeposit(data: CreateDepositRequest): Promise<CreateDepositResponse> {
        try {
            const response = await axios({
                ...REQUEST_OPTIONS,
                method: 'post',
                url: `${this.baseURL}/create-deposit`,
                headers: this.getHeaders(),
                data: data,
                maxBodyLength: Infinity
            });
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    public async createWithdrawal(
        data: CreateWithdrawalRequest,
        options: CreateWithdrawalOptions = {}
    ): Promise<CreateWithdrawalResponse> {
        try {
            const headers: Record<string, string> = this.getHeaders();
            if (options.idempotencyKey !== undefined) {
                headers['Idempotency-Key'] = options.idempotencyKey;
            }
            const response = await axios({
                ...REQUEST_OPTIONS,
                method: 'post',
                url: `${this.baseURL}/create-withdrawal`,
                headers,
                data: data,
                maxBodyLength: Infinity
            });
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }


    public async checkTransactionStatus(
        type: TransactionType,
        options: { address?: string; id?: string }
    ): Promise<CheckTransactionStatusResponse> {
        if (!options.address && !options.id) {
            throw new Error('Either address or id is required');
        }
        try {
            const params: Record<string, string> = { type };
            if (options.address) params.address = options.address;
            if (options.id) params.id = options.id;

            const response = await axios({
                ...REQUEST_OPTIONS,
                method: 'get',
                url: `${this.baseURL}/check-transaction-status`,
                headers: this.getHeaders(),
                params
            });
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    public async fetchWalletBalance(
        address: string, 
        networkType: NetworkType, 
        contractAddress?: string
    ): Promise<FetchWalletBalanceResponse> {
        try {
            const params: Record<string, string> = {
                address,
                networkType
            };
            
            if (contractAddress) {
                params.contractAddress = contractAddress;
            }
            
            const response = await axios({
                ...REQUEST_OPTIONS,
                method: 'get',
                url: `${this.baseURL}/fetch-wallet-balance`,
                headers: this.getHeaders(),
                params
            });
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    /**
     * Confirms an IPN notification's transaction with the SagaPay API. Check the
     * `X-Sagapay-Merchant-Signature` header with `verifyIpnSignature()` first;
     * this network call is an extra check on top of it.
     *
     * Note: this endpoint authenticates via the request body — the SDK sends your
     * apiKey/apiSecret in the body and does NOT send the x-api-key/x-api-secret headers.
     */
    public async verifyIpn(data: VerifyIpnRequest): Promise<VerifyIpnResponse> {
        try {
            const response = await axios({
                ...REQUEST_OPTIONS,
                method: 'post',
                url: `${this.baseURL}/verify-ipn`,
                headers: { 'Content-Type': 'application/json' },
                data: {
                    ...data,
                    apiKey: this.apiKey,
                    apiSecret: this.apiSecret
                },
                maxBodyLength: Infinity
            });
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    private getHeaders() {
        return {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'x-api-secret': this.apiSecret
        };
    }

    private handleError(error: any): Error {
        if (axios.isAxiosError(error)) {
            const status = error.response?.status;
            const errorMessage = error.response?.data?.error;

            switch (status) {
                case 401:
                    return new Error('Invalid API credentials');
                case 429:
                    return new Error('Rate limit exceeded');
                default:
                    return new Error(errorMessage || 'Request failed');
            }
        }
        return new Error('Network Error');
    }
}

export * from './types';
export * from './webhook';