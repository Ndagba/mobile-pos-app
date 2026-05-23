export declare class PaymentService {
    static processPayment(transactionId: string, amount: number, method: 'cash' | 'card' | 'mobile_wallet', paymentDetails?: any): Promise<{
        transaction_id: string;
        status: string;
        method: string;
        amount: number;
        reference: any;
        timestamp: string;
    }>;
    private static processCash;
    private static processCard;
    private static processWallet;
    static refundPayment(transactionId: string, paymentReference: string, amount: number, reason: string): Promise<{
        transaction_id: string;
        refund_status: string;
        refund_reference: string;
        amount: number;
        reason: string;
    }>;
}
//# sourceMappingURL=PaymentService.d.ts.map