import { redirect } from "next/navigation";

// The project list is the app's home now.
export default function Page() {
  redirect("/app");
}
