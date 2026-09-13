export interface TrustedIdentity { readonly externalSubject: string }
export interface TrustedAuthPort {
  getIdentity(): Promise<TrustedIdentity | undefined>;
  startGoogleLogin(callbackUrl: string): Promise<string>;
  exchangeCode(code: string): Promise<void>;
  logout(): Promise<void>;
}
