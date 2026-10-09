import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { upsertUser } from "@/lib/users";

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Google's OIDC defaults request only `openid email profile`.
  providers: [Google],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    // Only verified Google emails may sign in; placeholder claiming relies on this.
    signIn({ profile }) {
      return profile?.email_verified === true && typeof profile.email === "string";
    },
    async jwt({ token, profile }) {
      if (profile?.email) {
        const user = await upsertUser(profile.email, profile.name ?? profile.email);
        token.uid = user.id;
      }
      delete token.picture; // keep nothing we don't need
      return token;
    },
    session({ session, token }) {
      if (typeof token.uid === "string") session.user.id = token.uid;
      return session;
    },
  },
});
