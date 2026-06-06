import { redirect } from "next/navigation";
import { ChangePasswordForm } from "@/components/settings/change-password-form";
import { DeleteAccountSection } from "@/components/settings/delete-account-section";
import { ProfileForm } from "@/components/settings/profile-form";
import { AvatarPicker } from "@/components/settings/avatar-picker";
import { getCurrentUser } from "@/lib/auth";

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-border pb-10 last:border-0 last:pb-0">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto max-w-2xl space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Account Settings</h1>
        <p className="mt-1 text-sm text-muted">Manage your profile, password, and account.</p>
      </div>

      <SettingsSection
        title="Profile"
        description="Update your display name."
      >
        <ProfileForm user={user} />
      </SettingsSection>

      <SettingsSection
        title="Avatar"
        description="Choose a letter + color, or paste a photo URL. Your last 5 avatars are saved for quick switching."
      >
        <AvatarPicker user={user} />
      </SettingsSection>

      <SettingsSection
        title="Password"
        description="Change your account password."
      >
        <ChangePasswordForm />
      </SettingsSection>

      <SettingsSection
        title="Email"
        description="Your current email address is shown below. Changing your email requires re-verification and will be available in a future update."
      >
        <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted">
          {user.email}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Danger Zone"
        description="Irreversible account actions."
      >
        <DeleteAccountSection deletionScheduledAt={user.deletionScheduledAt} />
      </SettingsSection>
    </div>
  );
}
