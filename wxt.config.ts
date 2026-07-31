import { defineConfig } from "wxt";

export default defineConfig({
  extensionApi: "chrome",
  modules: ["@wxt-dev/module-react"],
  // @wxt-dev/module-react ships with wxt >= 0.19
  manifest: {
    name: "PaperLens",
    description: "Elsevier PaperLens — research paper insights",
    version: "0.0.1",
    permissions: ["activeTab", "contextMenus", "storage"],
    host_permissions: ["http://localhost:8000/*"],
    web_accessible_resources: [
      {
        resources: ["elsevier_logo_tree.svg"],
        matches: [
          "http://*/*",
          "https://*/*",
        ],
      },
    ],
    icons: {
      "16": "icon-16.png",
      "32": "icon-32.png",
      "48": "icon-48.png",
      "128": "icon-128.png",
    },
    action: {
      default_title: "PaperLens",
      default_icon: {
        "16": "icon-16.png",
        "32": "icon-32.png",
        "48": "icon-48.png",
        "128": "icon-128.png",
      },
    },
  },
});
