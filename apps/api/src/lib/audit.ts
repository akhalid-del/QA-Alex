import { prisma, Prisma } from '@qa/db';

/** Append an immutable audit entry. Fire-and-forget friendly but awaited here. */
export async function audit(params: {
  actorId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorId: params.actorId ?? null,
      action: params.action,
      entity: params.entity,
      entityId: params.entityId ?? null,
      metadata: (params.metadata as Prisma.InputJsonValue) ?? undefined,
    },
  });
}
