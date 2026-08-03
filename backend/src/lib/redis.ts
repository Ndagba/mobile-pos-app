/**
 * Redis stub — ioredis is not installed in this environment.
 * All cache operations are no-ops; inventory routes still function
 * but without in-memory caching.
 */

const noop = async (..._args: any[]): Promise<any> => null;

export const redis = {
  get:   noop,
  set:   noop,
  setex: noop,
  del:   noop,
  quit:  noop,
  on:    () => redis,
};

export default redis;
