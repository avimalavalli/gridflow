import { AcceptInvitationForm } from "./accept-invitation-form";

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  return <AcceptInvitationForm token={params.token ?? ""} />;
}
