# Admin test area

The admin page is https://jrdlabs.github.io/games/admin.html after merging/publishing the pull request. It uses ordinary Supabase email/password authentication. Google Cloud, Google OAuth credentials, and Google sign-in are not required.

## One-time account setup

The database is already configured for the owner's approved email. The website has no public sign-up form, and admin access is bound to the account ID created for that approved email.

After merging the pull request:

1. Open [Supabase Authentication → Users](https://supabase.com/dashboard/project/yxaxfnoveylmtjzbbbee/auth/users).
2. Choose **Add user → Create new user**. Enter your approved email and choose your own strong password privately. Confirm/auto-confirm this account if the dashboard offers that option; you are provisioning your own account as the project owner. Do not put the password in chat or source files.
3. Open the admin page and sign in with that email and password. Email/password is already enabled in the project.

Alternatively, provision through **Invite user** and let the owner choose a password using the invitation. This requires the invitation redirect to reach the admin page; the direct-create flow above avoids any email/redirect setup for first login.

For the page's **Forgot password?** flow (and invitations), add `https://jrdlabs.github.io/games/admin.html` under [Supabase Authentication → URL Configuration → Redirect URLs](https://supabase.com/dashboard/project/yxaxfnoveylmtjzbbbee/auth/url-configuration). Preserve this shared project's existing URLs and Site URL. The recovery page lets you set and confirm a new password; request the reset from the admin login page. Supabase must have working email delivery to send reset/invite emails. See [Supabase password authentication](https://supabase.com/docs/guides/auth/passwords).

No shared authentication settings were disabled: anonymous player access and other applications in this shared project remain available. Signing in or out of admin uses separate browser storage, preserving normal player identities and seats.

## Test controls

- **New test table:** you and three bots, immediately seated.
- **Control seat:** play any seat; automatic bots play all other seats.
- **Run bots automatically:** one turn roughly every second; uncheck to pause. Seat changes, scenarios, restart, hiding the page, and sign-out pause bots.
- **Play one turn automatically:** advances the current seat, including the controlled seat.
- **Reveal all hands:** admin-only live hand visibility.
- **Restart match / Deal next hand:** reset scores/deal or advance a completed hand.
- **Situations:** blocked hand, tied block, last-tile win, and previous-winner opening. Synthetic short hands reach edge cases quickly; all moves use real game validation.

The newest ten test rooms per admin are retained. Normal game APIs reject these rooms. Test history stays within marked test rooms; no Trumps statistics/history are written. Future global Dominoes statistics must exclude `dominoes_private.test_sessions`.

## Database and verification

The `dominoes_admin_test_mode` and `dominoes_admin_email_password` migrations are already applied to the existing project. **Do not rerun them.** For another environment, run base Dominoes SQL, the winner-starts update, `supabase/dominoes-admin.sql`, then `supabase/dominoes-admin-email.sql`, in that order; privately configure its approved-email allowlist before provisioning the owner account.

The current allowlist is `dominoes_private.admin_email_allowlist`. A database trigger binds a newly created approved-email account to its user ID in `dominoes_private.admin_accounts`. Admin RPCs require that bound ID, the matching server-side email, confirmed email ownership, a configured password, and a non-anonymous account. Later email/profile changes never enroll a different account; editable metadata is not used for authorization. An invitation session can access the password-setup form but cannot run test tables until a password is configured.

The private shared engine is callable only from the normal/admin dispatchers. Regular calls cannot impersonate seats or access test rooms. The Google-based guard in the historical installation SQL is superseded by the email/password upgrade; no Google configuration is needed.

`supabase/dominoes-admin-test.sql` rolls back all fixtures and tests bound-account authorization, unconfirmed/missing-password rejection, spoofed metadata rejection, private engine denial, test isolation, hand reveal/seat controls, full bot play, reset, and scenarios. Regular gameplay regression tests also pass. The owner's real password sign-in must be verified after account provisioning; no password was created, read or logged by the assistant. Visual/device verification remains pending.
