import { mountNav, requireAdmin } from "../shared/nav";
import { initDocsApp } from "./main.js";

mountNav("docs");
requireAdmin(document.getElementById("root"), initDocsApp);
