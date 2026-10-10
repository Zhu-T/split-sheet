import type { Metadata } from "next";
import { setHomeCurrency, signOutAction } from "@/app/actions/account";
import { CurrencySelect } from "@/components/currency-select";
import { PageMotion } from "@/components/motion";
import { Button, Card, Field, Page, SectionTitle, Skeleton, TopBar } from "@/components/ui";
import { requireUser } from "@/lib/authz";
import { ThemeSegmented } from "@/components/theme-toggle";
import { DeleteAccountButton } from "./delete-account-button";
import { NameForm } from "./name-form";
import { VenmoForm } from "./venmo-form";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <TopBar title="Settings" back="/" />
      <Page>
        <PageMotion fallback={<Skeleton rows={2} />}>
          <Settings />
        </PageMotion>
      </Page>
    </>
  );
}

async function Settings() {
  const user = await requireUser();
  return (
    <>
      <SectionTitle>Profile</SectionTitle>
      <Card className="p-4">
        <NameForm current={user.name} />
      </Card>

      <SectionTitle>Appearance</SectionTitle>
      <Card className="p-4">
        <ThemeSegmented />
      </Card>

      <SectionTitle>Account</SectionTitle>
      <Card className="p-4">
        <p className="text-sm text-muted">Signed in with Discord as {user.email}</p>
        <form action={signOutAction} className="mt-3">
          <Button variant="secondary">Sign out</Button>
        </form>
      </Card>

      <SectionTitle>Getting paid</SectionTitle>
      <Card className="p-4">
        <VenmoForm current={user.venmoUsername} />
      </Card>

      <SectionTitle>Home currency</SectionTitle>
      <Card className="p-4">
        <form action={setHomeCurrency} className="space-y-3">
          <Field label="Your overall total is shown in" hint="New groups start in this currency too.">
            <CurrencySelect name="homeCurrency" defaultValue={user.homeCurrency} />
          </Field>
          <Button variant="secondary">Save</Button>
        </form>
      </Card>

      <SectionTitle>Privacy</SectionTitle>
      <Card className="p-4">
        <p className="text-sm text-muted">
          We store only your Discord user ID, display name and email, plus your Venmo username if you add it. Deleting
          your account removes them; your past expenses stay in your groups under your name so everyone&apos;s balances
          remain correct.
        </p>
        <DeleteAccountButton />
      </Card>
    </>
  );
}
