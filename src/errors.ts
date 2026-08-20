/** Thrown when a column lifecycle operation cannot proceed, e.g. launching an unregistered column type or mounting a shell whose template lacks a required element. */
export class ColumnLifecycleError extends Error {
  readonly tag = "ColumnLifecycleError" as const
  constructor(reason: string) {
    super(reason)
    this.name = "ColumnLifecycleError"
  }
}
