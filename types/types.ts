export enum Period {
  NONE,
  HOURLY,
  DAILY,
  WEEKLY,
  FORTNIGHTLY,
  MONTHLY,
  QUARTERLY,
}

export enum Role {
  ADMIN = "ADMIN",
  EXECUTOR = "EXECUTOR",
  REGISTRAR = "REGISTRAR",
}

export class Cycle {
  constructor(readonly amount: number, readonly partecipants: number) {}
}
