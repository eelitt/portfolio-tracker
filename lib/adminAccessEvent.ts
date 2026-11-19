export type AdminAccessFlags = {
  previousAdmin: boolean
  nextAdmin: boolean
  previousAccess: boolean
  nextAccess: boolean
}

export type AdminAccessEventInput = AdminAccessFlags & {
  actorId: string
  targetUserId: string
}

/** Row written to admin_access_events. */
export function buildAdminAccessEvent(input: AdminAccessEventInput) {
  return {
    actor_id: input.actorId,
    target_user_id: input.targetUserId,
    previous_admin: input.previousAdmin,
    next_admin: input.nextAdmin,
    previous_access: input.previousAccess,
    next_access: input.nextAccess,
  }
}

/** Short label for the admin modal. Empty when neither flag changed. */
export function describeAdminAccessChange(flags: AdminAccessFlags): string {
  const parts: string[] = []
  if (flags.previousAdmin !== flags.nextAdmin) {
    parts.push(
      `admin ${flags.previousAdmin ? 'on' : 'off'} to ${flags.nextAdmin ? 'on' : 'off'}`
    )
  }
  if (flags.previousAccess !== flags.nextAccess) {
    parts.push(
      `access ${flags.previousAccess ? 'on' : 'off'} to ${flags.nextAccess ? 'on' : 'off'}`
    )
  }
  return parts.join(', ')
}
