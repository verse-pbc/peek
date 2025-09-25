export type NDKKind = number;

export class NDKEvent {
  id: string = '';
  kind!: number;
  content: string = '';
  tags: string[][] = [];
  created_at?: number;
  pubkey: string = '';
  private _ndk: unknown;
  constructor(ndk: unknown) {
    this._ndk = ndk;
  }
  async publish(): Promise<void> {
    // no-op in shim
    return;
  }
}