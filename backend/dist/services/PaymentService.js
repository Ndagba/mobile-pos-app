"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentService = void 0;
const errorHandler_1 = require("../utils/errorHandler");
class PaymentService {
    static async processPayment(transactionId, amount, method, paymentDetails) {
        switch (method) {
            case 'cash':
                return this.processCash(transactionId, amount);
            case 'card':
                return this.processCard(transactionId, amount, paymentDetails);
            case 'mobile_wallet':
                return this.processWallet(transactionId, amount, paymentDetails);
            default:
                throw new errorHandler_1.AppError(400, 'Invalid payment method');
        }
    }
    static async processCash(transactionId, amount) {
        return {
            transaction_id: transactionId,
            status: 'completed',
            method: 'cash',
            amount,
            reference: `CASH-${transactionId.substring(0, 8)}`,
            timestamp: new Date().toISOString()
        };
    }
    static async processCard(transactionId, amount, details) {
        if (!details?.card_token) {
            throw new errorHandler_1.AppError(400, 'Card token required');
        }
        return {
            transaction_id: transactionId,
            status: 'completed',
            method: 'card',
            amount,
            reference: details.card_token,
            masked_pan: '****-****-****-4242',
            timestamp: new Date().toISOString()
        };
    }
    static async processWallet(transactionId, amount, details) {
        if (!details?.wallet_id) {
            throw new errorHandler_1.AppError(400, 'Wallet ID required');
        }
        return {
            transaction_id: transactionId,
            status: 'completed',
            method: 'mobile_wallet',
            amount,
            reference: details.wallet_id,
            timestamp: new Date().toISOString()
        };
    }
    static async refundPayment(transactionId, paymentReference, amount, reason) {
        return {
            transaction_id: transactionId,
            refund_status: 'pending',
            refund_reference: `REFUND-${Date.now()}`,
            amount,
            reason
        };
    }
}
exports.PaymentService = PaymentService;
//# sourceMappingURL=PaymentService.js.map