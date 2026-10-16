import { createContext } from 'react';

/** «Взять за основу» из комбо гайда: открывает конструктор с этим комбо */
export const ComboCopyContext = createContext<((starters: string[], route: string) => void) | null>(null);
