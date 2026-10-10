import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";
import { canSignIn, upsertDiscordUser } from "@/lib/users";

/** The parts of Discord's /users/@me response we rely on. */
type DiscordProfile = { id?: unknown; email?: unknown; verified?: unknown; global_name?: unknown; username?: unknown };

function identityFrom(profile: DiscordProfile | undefined) {
  if (!profile || typeof profile.id !== "string" || typeof profile.email !== "string") return null;
  const name = [profile.global_name, profile.username].find((v): v is string => typeof v === "string" && v.length > 0);
  return { discordId: profile.id, email: profile.email, name: name ?? profile.email, verified: profile.verified === true };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    // Defaults request only `identify email`. Discord now returns an `iss` parameter on the
    // OAuth callback (RFC 9207); without a declared issuer Auth.js compares it against a
    // placeholder and rejects every sign-in ("unexpected iss"). Value from
    // https://discord.com/.well-known/oauth-authorization-server.
    Discord({ issuer: "https://discord.com" }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    // Only verified Discord emails may sign in; placeholder claiming relies on this.
    async signIn({ profile }) {
      const id = identityFrom(profile as DiscordProfile);
      return !!id && id.verified && (await canSignIn(id));
    },
    async jwt({ token, profile }) {
      const id = identityFrom(profile as DiscordProfile);
      if (id) token.uid = (await upsertDiscordUser(id)).id;
      delete token.picture; // keep nothing we don't need
      return token;
    },
    session({ session, token }) {
      if (typeof token.uid === "string") session.user.id = token.uid;
      return session;
    },
  },
});
