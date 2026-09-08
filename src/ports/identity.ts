export interface IdentityPort {
  randomToken(): string;
  randomId(): string;
  hashToken(token: string): string;
}
