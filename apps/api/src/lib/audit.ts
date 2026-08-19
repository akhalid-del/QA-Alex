import { prisma, Prisma } from '@qa/db';

/**
 * Append an audit entry. Best-effort: audit logging must NEVER break the user
 * action it's recording. If the actor no longer exists (e.g. a stale JWT after
 * a DB re-seed → FK violation) or any other write error occurs, we log it and
 * carry on rather than 500 the request.
 */
export async function audit(params: {
  actorId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    // Only reference an actor that actually exists, so a stale/invalid user id
    // can't trip the foreign key — fall back to a null (system) actor.
    let actorId = params.actorId ?? null;
    if (actorId) {
      const exists = await prisma.user.findUnique({ where: { id: actorId }, select: { id: true } });
      if (!exists) actorId = null;
    }
    await prisma.auditLog.create({
      data: {
        actorId,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId ?? null,
        metadata: (params.metadata as Prisma.InputJsonValue) ?? undefined,
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[audit] non-fatal: failed to write audit log:', err);
  }
}
