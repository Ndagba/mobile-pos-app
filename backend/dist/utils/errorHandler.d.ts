import { Request, Response, NextFunction } from 'express';
export declare class AppError extends Error {
    statusCode: number;
    message: string;
    isOperational: boolean;
    constructor(statusCode: number, message: string, isOperational?: boolean);
}
export declare const errorHandler: (err: AppError | Error, req: Request, res: Response, next: NextFunction) => Response<any, Record<string, any>> | undefined;
export declare const catchAsync: (fn: Function) => (req: Request, res: Response, next: NextFunction) => void;
//# sourceMappingURL=errorHandler.d.ts.map