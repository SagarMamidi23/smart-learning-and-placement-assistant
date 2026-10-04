"use client";

import { AppShell } from "@/components/AppShell";
import { ProfileForm } from "@/components/ProfileForm";
import { ResumeUpload } from "@/components/ResumeUpload";
import { useProfile } from "@/lib/hooks";

export default function ProfilePage() {
  return (
    <AppShell>
      <Profile />
    </AppShell>
  );
}

function Profile() {
  const { data, isLoading, error } = useProfile();
  if (isLoading) return <p role="status">Loading profile…</p>;
  if (error || !data) return <p role="alert">Could not load your profile.</p>;
  return (
    <>
      <h1 className="text-2xl font-bold">Your profile</h1>
      <ProfileForm profile={data} />
      <ResumeUpload profile={data} />
    </>
  );
}
