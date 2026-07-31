import { useEffect, useState } from "react";
import { parsePaperUrl, type PaperType } from "./paperUrl";

export type { PaperType };

export interface PaperUrlState {
  type: PaperType | null;
  id: string | null;
  loading: boolean;
}

export { parsePaperUrl };

export function usePaperUrl(): PaperUrlState {
  const [state, setState] = useState<PaperUrlState>({ type: null, id: null, loading: true });

  useEffect(() => {
    browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      const url = tabs[0]?.url ?? "";
      const parsed = parsePaperUrl(url);
      setState({ ...parsed, loading: false });
    });
  }, []);

  return state;
}
