import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const initialError = params.error === "unavailable"
    ? "GridFlow could not reach the API. Please try again."
    : "";
  return <LoginForm initialError={initialError} />;
}
