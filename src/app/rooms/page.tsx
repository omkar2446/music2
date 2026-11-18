import { RoomsClient } from "@/components/rooms/RoomsClient";

export default async function RoomsPage({ searchParams }: PageProps<"/rooms">) {
  const { code, host } = await searchParams;
  return <RoomsClient code={Array.isArray(code) ? code[0] ?? "" : code ?? ""} isHost={host === "1"} />;
}
