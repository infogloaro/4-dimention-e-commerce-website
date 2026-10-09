import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginPage } from "@/components/storefront/login-page";

export const metadata: Metadata = { title: "Sign in | HI-FI electronics" };

export default function Page() {
  return <Suspense><LoginPage /></Suspense>;
}
