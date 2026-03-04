import { supabase } from "@/lib/supabaseClient";

export async function uploadProfileImage(opts: {
  userId: string;
  file: File;
  kind: "avatar" | "banner";
}) {
  const { userId, file, kind } = opts;

  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const path = `${userId}/${kind}.${ext}`;

  // Upload (upsert to overwrite)
  const up = await supabase.storage.from("avatars").upload(path, file, {
    upsert: true,
    contentType: file.type || "image/*",
  });
  if (up.error) throw up.error;

  // Public URL
  const pub = supabase.storage.from("avatars").getPublicUrl(path);
  const publicUrl = pub.data.publicUrl;

  // Save onto profile
  const patch =
    kind === "avatar" ? { avatar_url: publicUrl } : { banner_url: publicUrl };

  const res = await supabase.from("profiles").update(patch).eq("id", userId);
  if (res.error) throw res.error;

  return publicUrl;
}