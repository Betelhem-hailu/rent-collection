import { randomUUID } from 'node:crypto';
import { Temporal } from 'temporal-polyfill';
import { prisma } from '../../shared/database/prisma.service.js';

const instant = (value: number) => Temporal.Instant.fromEpochMilliseconds(value);
const millis = (value: unknown) => Date.parse(String(value));
const WINDOW = 15 * 60_000;
type Transaction = Parameters<Parameters<typeof prisma.transaction>[0]>[0];

async function lockUser(tx: Transaction, userId: string) {
  // PostgreSQL row locks serialize activation, password setup and deactivation.
  await tx.orm.public.User.where({ id: userId }).update({ id: userId });
  return tx.orm.public.User.where({ id: userId }).first();
}
const eligible = (user: Awaited<ReturnType<typeof lockUser>>) => user?.role === 'TENANT'
  && user.isActive && user.password === null && user.authState !== 'PASSWORD';

export class ActivationRepository {
  constructor(private readonly database = prisma) {}

  async allowRequest(key: string, limit: number, now: number) {
    return this.database.transaction(async tx => {
      const table = tx.orm.public.AuthRateLimit;
      await table.upsert({ conflictOn: { key }, create: { key, windowStartedAt: instant(now), count: 0 }, update: {} });
      await table.where({ key }).update({ key });
      const row = (await table.where({ key }).first())!;
      const reset = now - millis(row.windowStartedAt) >= WINDOW;
      if (!reset && row.count >= limit) return false;
      await table.where({ key }).update({ count: reset ? 1 : row.count + 1, windowStartedAt: reset ? instant(now) : row.windowStartedAt });
      return true;
    });
  }

  async reserve(phone: string, now: number) {
    return this.database.transaction(async tx => {
      const found = await tx.orm.public.User.where({ phone }).first();
      if (!found) return null;
      const user = await lockUser(tx, found.id);
      if (!eligible(user) || user.phone !== phone) return null;
      const table = tx.orm.public.TenantActivation;
      const previous = await table.where({ userId: user.id }).first();
      const reset = !previous || now - millis(previous.windowStartedAt) >= WINDOW;
      if (previous && (now - millis(previous.lastSentAt) < 60_000 || !reset && (previous.sendCount >= 3 || previous.attempts >= 5))) return null;
      const challengeId = randomUUID();
      const data = {
        challengeId, phone, providerSid: null, deliveryState: 'PENDING', deliveryClaimedAt: null, deliveryAttempts: 0,
        expiresAt: instant(now + 10 * 60_000), lastSentAt: instant(now),
        windowStartedAt: reset ? instant(now) : previous!.windowStartedAt,
        sendCount: reset ? 1 : previous!.sendCount + 1, attempts: reset ? 0 : previous!.attempts,
        verifiedAt: null, setupTokenHash: null, setupExpiresAt: null,
      };
      await table.upsert({ conflictOn: { userId: user.id }, create: { userId: user.id, ...data }, update: data });
      return { userId: user.id, phone, challengeId };
    });
  }

  async attachProvider(challengeId: string, providerSid: string, deliveryAttempt: number) {
    await this.database.orm.public.TenantActivation.where({ challengeId, deliveryState: 'SENDING', deliveryAttempts: deliveryAttempt }).update({ providerSid, deliveryState: 'SENT' });
  }

  async pendingDeliveries(now: number) {
    const table = this.database.orm.public.TenantActivation;
    const pending = await table.where({ deliveryState: 'PENDING' }).where(a => a.expiresAt.gt(instant(now))).limit(10).all();
    const interrupted = await table.where({ deliveryState: 'SENDING' }).where(a => a.deliveryClaimedAt.lt(instant(now - 30_000))).where(a => a.expiresAt.gt(instant(now))).limit(10).all();
    return [...pending, ...interrupted].map(row => row.challengeId);
  }

  async claimDelivery(challengeId: string, now: number) {
    return this.database.transaction(async tx => {
      const table = tx.orm.public.TenantActivation;
      const found = await table.where({ challengeId }).first();
      if (!found) return null;
      const user = await lockUser(tx, found.userId);
      const row = await table.where({ challengeId }).first();
      if (!row || !(row.deliveryState === 'PENDING' || row.deliveryState === 'SENDING' && millis(row.deliveryClaimedAt) <= now - 30_000)) return null;
      if (!eligible(user) || row.phone !== user.phone || millis(row.expiresAt) <= now || row.deliveryAttempts >= 2) {
        await table.where({ challengeId }).update({ deliveryState: 'FAILED' });
        return null;
      }
      await table.where({ challengeId }).update({ deliveryState: 'SENDING', deliveryClaimedAt: instant(now), deliveryAttempts: row.deliveryAttempts + 1 });
      return { phone: row.phone, deliveryAttempt: row.deliveryAttempts + 1 };
    });
  }

  async failDelivery(challengeId: string, deliveryAttempt: number) {
    await this.database.orm.public.TenantActivation.where({ challengeId, deliveryState: 'SENDING', deliveryAttempts: deliveryAttempt }).update({ deliveryState: 'FAILED' });
  }

  async takeAttempt(challengeId: string, now: number) {
    return this.database.transaction(async tx => {
      const table = tx.orm.public.TenantActivation;
      const found = await table.where({ challengeId }).first();
      if (!found) return null;
      const user = await lockUser(tx, found.userId);
      const row = await table.where({ challengeId }).first();
      if (!eligible(user) || !row?.providerSid || row.phone !== user.phone || row.setupTokenHash || row.attempts >= 5 || millis(row.expiresAt) <= now) return null;
      await table.where({ challengeId }).update({ attempts: row.attempts + 1 });
      return { phone: user.phone, providerSid: row.providerSid };
    });
  }

  async saveVerification(challengeId: string, tokenHash: string, phone: string, now: number) {
    return this.database.transaction(async tx => {
      const table = tx.orm.public.TenantActivation;
      const found = await table.where({ challengeId }).first();
      if (!found) return false;
      const user = await lockUser(tx, found.userId);
      const row = await table.where({ challengeId }).first();
      if (!eligible(user) || user.phone !== phone || !row || row.phone !== phone || row.setupTokenHash || millis(row.expiresAt) <= now) return false;
      await table.where({ challengeId }).update({ verifiedAt: instant(now), setupTokenHash: tokenHash, setupExpiresAt: instant(now + 10 * 60_000) });
      return true;
    });
  }

  async complete(challengeId: string, tokenHash: string, passwordHash: string, now: number) {
    return this.database.transaction(async tx => {
      const table = tx.orm.public.TenantActivation;
      const found = await table.where({ challengeId }).first();
      if (!found) return false;
      const user = await lockUser(tx, found.userId);
      const row = await table.where({ challengeId }).first();
      if (!eligible(user) || !row?.verifiedAt || row.phone !== user.phone || row.setupTokenHash !== tokenHash || !row.setupExpiresAt || millis(row.setupExpiresAt) <= now) return false;
      if (process.env.NODE_ENV === 'production' && row.providerSid?.startsWith('mock:')) return false;
      await tx.orm.public.User.where({ id: user.id }).update({ password: passwordHash, authState: 'PASSWORD', phoneVerifiedAt: row.verifiedAt });
      // Consuming the proof and updating the existing user commit together.
      await table.where({ challengeId }).deleteAndCount();
      return true;
    });
  }
}
