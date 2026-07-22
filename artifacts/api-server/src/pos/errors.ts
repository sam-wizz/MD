export class PosNotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PosNotImplementedError";
  }
}

export class MissingConsentError extends Error {
  constructor(public readonly clientId: string, public readonly scope: string) {
    super(`Active consent is required for ${scope} on client ${clientId}`);
    this.name = "MissingConsentError";
  }
}
