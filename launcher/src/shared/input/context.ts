import { createContext } from "preact";

import type { InputScope } from "../../contracts/remoteInput";

export const InputScopeContext = createContext<InputScope | null>(null);
