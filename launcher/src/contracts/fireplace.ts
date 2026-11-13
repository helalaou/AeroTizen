export interface FireplaceControls {
  close(): void;
  isOpen(): boolean;
  open(): void;
  subscribe?(listener: () => void): () => void;
  volumeDown(): void;
  volumeUp(): void;
}
