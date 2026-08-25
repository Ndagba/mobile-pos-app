/**
 * @jaypos/shared — public API.
 *
 * Framework-agnostic types, pure business logic, and platform-neutral service
 * interfaces shared across the JayPOS desktop (and, later, mobile) apps.
 * Nothing here may import React, React Native, or Next.
 */

export * from './types';
export * from './utils';
export * from './services/sync';
export * from './services/api';
export * from './services/network';
export * from './services/transactions';
