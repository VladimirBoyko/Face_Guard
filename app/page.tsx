import type { Metadata } from "next";
import { FaceGuardApp } from "./FaceGuardApp";

export const metadata: Metadata = {
  title: "Local screen privacy",
  description:
    "A local-only browser prototype that protects sensitive content when your viewing situation changes.",
};

export default function Home() {
  return <FaceGuardApp />;
}
