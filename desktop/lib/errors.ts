/**
 * Extract a human-readable message from a failed `apiClient` call.
 *
 * The backend returns errors as `{ status:'error'|'fail', message }` (AppError),
 * occasionally `{ error }`; axios nests that under `err.response.data`. This
 * mirrors the extraction already inlined in `authStore`/`Checkout`, centralised
 * so the inventory mutation modals surface the exact backend message (e.g.
 * "Insufficient stock for this operation") rather than a generic failure.
 */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const e = err as {
    response?: { data?: { message?: string; error?: string } };
    message?: string;
  };
  return e?.response?.data?.message || e?.response?.data?.error || e?.message || fallback;
}
