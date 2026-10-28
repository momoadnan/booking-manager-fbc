import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ locals }) => ({
  user: locals.user ? { email: locals.user.email, role: locals.user.role } : null
});
