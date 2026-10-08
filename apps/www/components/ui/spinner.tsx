import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

// https://uiverse.io/satyamchaudharydev/silent-owl-69 — MIT.
function Spinner({ className, ...props }: ComponentProps<"span">) {
  return <span role="status" aria-label="Loading" data-uiverse="satyamchaudharydev/silent-owl-69" className={cn("uiverse-spinner", className)} {...props} />;
}
export { Spinner };
