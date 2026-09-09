import { redirect } from "next/navigation";

export default function LegacyJaguarShareRedirect({ params }: { params: { code: string } }) {
  redirect(`/share/individuals/${params.code}`);
}
