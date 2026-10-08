import { permanentRedirect } from "next/navigation";

// The product is described on the landing page now; keep old links working.
export default function ProductPage() {
  permanentRedirect("/#product");
}
