import type { Metadata } from "next";
import { IndianMusicView } from "@/components/indian/IndianMusicView";

export const metadata: Metadata = { title: "Indian Music" };

export default function IndianMusicPage() {
  return <IndianMusicView />;
}
