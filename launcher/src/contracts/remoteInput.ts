import type { Store } from "../shared/state/createStore";

export type InputAction = "left" | "right" | "up" | "down" | "confirm" | "back" | "done" | "cancel" | "other";
export type InputResult = "handled" | "native" | "unhandled";

export interface NativeKeyEvent {
  readonly isComposing?: boolean;
  readonly key?: string;
  preventDefault(): void;
  readonly repeat?: boolean;
}

export interface ScopedInputEvent {
  readonly action: InputAction;
  readonly code: number;
  readonly nativeEvent: NativeKeyEvent;
  readonly phase: "down" | "up";
  readonly repeat: boolean;
}

export interface InputScopeOptions {
  // Native editors retain browser repeats for Confirm, Back, Done and Cancel.
  readonly allowActionRepeats?: boolean;
  handle?(event: ScopedInputEvent): InputResult;
  isActive?(): boolean;
  readonly modal?: boolean;
  onCancel?(): void;
  subscribe?(listener: () => void): () => void;
}

export interface InputScope extends Store<number> {
  readonly allowActionRepeats: boolean;
  cancel(): void;
  getGeneration(): number;
  getPath(): readonly InputScope[];
  readonly modal: boolean;
  receive(event: ScopedInputEvent): InputResult;
  registerChild(scope: InputScope): () => void;
}
