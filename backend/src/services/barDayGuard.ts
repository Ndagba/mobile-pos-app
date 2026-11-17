import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../utils/errorHandler';

/**
 * Closed-day guard (Bar/Lounge Phase 4).
 *
 * Once a Bar Controller submits their day close for a business date, that day is
 * frozen FOR THEM: no more releases, hand-overs, damages or corrections dated to it
 * until a manager reopens the close. Other Bar Controllers are unaffected (one
 * close per controller per day — D11). A close that a manager has reopened no
 * longer blocks anything.
 *
 * Kept dependency-free (only Prisma) so every bar service can use it without
 * import cycles.
 */

const CLOSED = ['submitted', 'acknowledged'];
type Client = Prisma.TransactionClient | typeof prisma;

export async function findClosedDay(controllerId: string, businessDate: Date, client: Client = prisma) {
  return client.barDayClose.findFirst({
    where: { closed_by_user_id: controllerId, business_date: businessDate, status: { in: CLOSED } },
    select: { id: true, status: true, business_date: true },
  });
}

/**
 * Throw 409 if `controllerId` has closed `businessDate`.
 * `self` = the caller is that controller (wording only).
 */
export async function assertDayOpen(
  controllerId: string,
  businessDate: Date,
  opts: { self: boolean; what: string },
  client: Client = prisma
) {
  const closed = await findClosedDay(controllerId, businessDate, client);
  if (!closed) return;
  const day = businessDate.toISOString().slice(0, 10);
  throw new AppError(
    409,
    opts.self
      ? `You have closed your day for ${day}. Ask a manager to reopen it before you ${opts.what}.`
      : `The Bar Controller's day for ${day} is closed. A manager must reopen it before you ${opts.what}.`,
    true,
    { code: 'DAY_CLOSED', day_close_id: closed.id, business_date: day }
  );
}
