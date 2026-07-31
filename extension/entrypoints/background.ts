import { browser } from "wxt/browser";

const OPEN_PAPERLENS_MENU_ID = "open-paperlens";

type OpenPaperLensMessage =
  | { type: "paperlens:openArticle"; sgrid?: string | null; url?: string | null; tab?: "overview" | "evaluate" }
  | { type: "paperlens:openHome" };

function articlePageUrl(params?: URLSearchParams) {
  const query = params?.toString();
  return browser.runtime.getURL("/paperlens.html") + "#/article" + (query ? `?${query}` : "");
}

async function openPaperLensForTab(tab?: chrome.tabs.Tab) {
  const params = new URLSearchParams();
  if (tab?.url) params.set("url", tab.url);
  await browser.tabs.create({ url: articlePageUrl(params) });
}

async function openPaperLensArticle(message: Extract<OpenPaperLensMessage, { type: "paperlens:openArticle" }>) {
  const params = new URLSearchParams();
  if (message.sgrid) params.set("sgrid", message.sgrid);
  else if (message.url) params.set("url", message.url);
  if (message.tab) params.set("tab", message.tab);
  await browser.tabs.create({ url: articlePageUrl(params) });
}

async function setupActionMenu() {
  await browser.contextMenus.removeAll();
  browser.contextMenus.create({
    id: OPEN_PAPERLENS_MENU_ID,
    title: "Open Paper Lens",
    contexts: ["action"],
  });
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    void setupActionMenu();
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== OPEN_PAPERLENS_MENU_ID) return;
    void openPaperLensForTab(tab);
  });

  browser.action.onClicked.addListener((tab) => {
    void openPaperLensForTab(tab);
  });

  browser.runtime.onMessage.addListener((message: unknown) => {
    if (!message || typeof message !== "object") return;
    const typed = message as OpenPaperLensMessage;
    if (typed.type === "paperlens:openArticle") {
      void openPaperLensArticle(typed);
    }
    if (typed.type === "paperlens:openHome") {
      void browser.tabs.create({ url: browser.runtime.getURL("/paperlens.html") });
    }
  });
});
