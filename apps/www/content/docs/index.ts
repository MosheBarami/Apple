// The docs, in reading order. Each section is one group in the left nav; prev/next follows this order.
import type { DocPage } from "@/lib/docs";
import { account } from "./account";
import { gettingStarted } from "./getting-started";
import { guides } from "./guides";
import { help } from "./help";
import { plugin } from "./plugin";
import { using } from "./using";

export const DOC_SECTIONS: { title: string; pages: DocPage[] }[] = [
  { title: "Getting started", pages: gettingStarted },
  { title: "Using StudPilot", pages: using },
  { title: "Guides", pages: guides },
  { title: "Studio plugin", pages: plugin },
  { title: "Account", pages: account },
  { title: "Help", pages: help },
];
