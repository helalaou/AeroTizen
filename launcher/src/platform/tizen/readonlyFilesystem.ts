export interface TizenReadStream {
  close(): void;
  read(bytes: number): string;
}

export interface TizenReadFile {
  readonly fileSize: number;
  openStream(mode: "r", done: (stream: TizenReadStream) => void, failed: () => void, encoding: "UTF-8"): void;
  readAsText(done: (text: string) => void, failed: () => void, encoding: "UTF-8"): void;
}

export interface ReadonlyTizenFilesystem {
  resolve(path: string, done: (file: TizenReadFile) => void, failed: () => void, mode: "r"): void;
}
